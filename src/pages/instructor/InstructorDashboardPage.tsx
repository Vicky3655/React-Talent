import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getAssignments,
  getCourses,
  getStudentsForInstructor,
  saveAssignment,
  updateSubmissions,
} from '../../services/dataService';
import type { Assignment, AssignmentSubmission, Course, StudentEnrollmentRow } from '../../types';
import {
  COURSE_THUMB_FALLBACK,
  formatDateShort,
  gradeColor,
  offsetDate,
  sanitizeImageSrc,
  sanitizeUrl,
} from '../../utils/formatters';

interface SubmissionEntry {
  assignment: Assignment;
  submission: AssignmentSubmission;
  isGraded: boolean;
}

const BANNER_DISMISSED_KEY = 'tf_inst_banner_dismissed';

const InstructorDashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<StudentEnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(BANNER_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [subTab, setSubTab] = useState<'pending' | 'graded'>('pending');

  // Grade Modal State
  const [gradeEntry, setGradeEntry] = useState<SubmissionEntry | null>(null);
  const [gradeScore, setGradeScore] = useState<string>('');
  const [gradeFeedback, setGradeFeedback] = useState<string>('');
  const [gradingSaving, setGradingSaving] = useState(false);

  // Create Assignment Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => offsetDate(7));
  const [newMaxScore, setNewMaxScore] = useState('100');
  const [newInstructions, setNewInstructions] = useState('');
  const [creating, setCreating] = useState(false);

  // Sparkline & Radar canvas refs
  const spark1Ref = useRef<HTMLCanvasElement | null>(null);
  const spark2Ref = useRef<HTMLCanvasElement | null>(null);
  const spark3Ref = useRef<HTMLCanvasElement | null>(null);
  const spark4Ref = useRef<HTMLCanvasElement | null>(null);
  const radarRef = useRef<HTMLCanvasElement | null>(null);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [cList, aList, sList] = await Promise.all([
        getCourses(user.uid),
        getAssignments(user.uid),
        getStudentsForInstructor(user.uid),
      ]);
      setCourses(cList);
      setAssignments(aList);
      setStudents(sList);
      if (cList.length && !newCourse) {
        setNewCourse(cList[0].title);
      }
    } catch (err) {
      console.error('Failed to load instructor dashboard:', err);
      showToast('Could not load dashboard metrics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const allSubmissionEntries = useMemo<SubmissionEntry[]>(() => {
    const entries: SubmissionEntry[] = [];
    assignments.forEach((a) => {
      (a.submissions || []).forEach((s) => {
        const isGraded = s.score !== null && s.score !== undefined;
        entries.push({ assignment: a, submission: s, isGraded });
      });
    });
    return entries;
  }, [assignments]);

  const pendingEntries = useMemo(
    () => allSubmissionEntries.filter((e) => !e.isGraded),
    [allSubmissionEntries]
  );

  const gradedEntries = useMemo(
    () => allSubmissionEntries.filter((e) => e.isGraded),
    [allSubmissionEntries]
  );

  const displayedSubmissions = subTab === 'pending' ? pendingEntries : gradedEntries;

  const avgClassGrade = useMemo(() => {
    const grades = students.map((s) => s.grade).filter((g): g is number => g !== null);
    if (!grades.length) return null;
    return Math.round(grades.reduce((acc, v) => acc + v, 0) / grades.length);
  }, [students]);

  const weeklyData = useMemo(() => {
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    allSubmissionEntries.forEach((e) => {
      if (!e.submission.submittedAt) return;
      const d = new Date(e.submission.submittedAt);
      if (Number.isNaN(d.getTime())) return;
      const jsDay = d.getDay(); // 0=Sun..6=Sat
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      counts[idx] += 1;
    });
    const jsToday = new Date().getDay();
    const todayIdx = jsToday === 0 ? 6 : jsToday - 1;
    const maxVal = Math.max(1, ...counts);
    const total = counts.reduce((a, b) => a + b, 0);
    return { dayLabels, counts, todayIdx, maxVal, total };
  }, [allSubmissionEntries]);

  const upcomingDeadlines = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return assignments
      .filter((a) => a.status !== 'draft' && a.dueDate)
      .map((a) => {
        const due = new Date(a.dueDate);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { assignment: a, due, diffDays };
      })
      .filter((item) => !Number.isNaN(item.due.getTime()) && item.diffDays >= -2)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 4);
  }, [assignments]);

  // Draw Sparklines & Radar
  useEffect(() => {
    const drawSpark = (canvas: HTMLCanvasElement | null, color: string, vals: number[]) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const max = Math.max(1, ...vals);
      const min = Math.min(...vals);
      const span = Math.max(1, max - min);
      ctx.beginPath();
      vals.forEach((v, idx) => {
        const x = (idx / Math.max(1, vals.length - 1)) * w;
        const y = h - 6 - ((v - min) / span) * (h - 12);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = `${color}22`;
      ctx.fill();
    };

    drawSpark(spark1Ref.current, '#2563EB', [2, 3, 3, Math.max(2, courses.length), Math.max(3, courses.length + 1), courses.length]);
    drawSpark(spark2Ref.current, '#16A34A', [1, 3, 4, 5, Math.max(4, students.length), students.length]);
    drawSpark(spark3Ref.current, '#D97706', [4, 2, 5, 3, Math.max(1, pendingEntries.length), pendingEntries.length]);
    drawSpark(spark4Ref.current, '#7C3AED', [72, 75, 78, 80, avgClassGrade || 82, avgClassGrade || 85]);

    // Draw Cohort Overview Radar
    const radar = radarRef.current;
    if (radar) {
      const dpr = window.devicePixelRatio || 1;
      const size = 220;
      radar.width = size * dpr;
      radar.height = size * dpr;
      radar.style.width = `${size}px`;
      radar.style.height = `${size}px`;
      const ctx = radar.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, size, size);
        const cx = size / 2;
        const cy = size / 2;
        const radius = 74;

        const subRate = assignments.length
          ? Math.min(100, Math.round((allSubmissionEntries.length / Math.max(1, assignments.length * Math.max(1, students.length))) * 100) + 35)
          : 50;
        const gradedRate = allSubmissionEntries.length
          ? Math.round((gradedEntries.length / allSubmissionEntries.length) * 100)
          : 60;
        const pubRate = courses.length
          ? Math.round((courses.filter((c) => c.status === 'published').length / courses.length) * 100)
          : 55;
        const metrics = [
          { label: 'Courses', val: Math.max(30, pubRate) / 100 },
          { label: 'Students', val: Math.min(100, Math.max(35, students.length * 15)) / 100 },
          { label: 'Turn-in', val: subRate / 100 },
          { label: 'Graded', val: Math.max(35, gradedRate) / 100 },
          { label: 'Avg Score', val: (avgClassGrade || 78) / 100 },
        ];
        const count = metrics.length;

        // Grid rings
        [0.25, 0.5, 0.75, 1].forEach((r) => {
          ctx.beginPath();
          for (let i = 0; i < count; i += 1) {
            const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
            const x = cx + Math.cos(angle) * radius * r;
            const y = cy + Math.sin(angle) * radius * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // Axes & labels
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        metrics.forEach((m, i) => {
          const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
          ctx.strokeStyle = '#E2E8F0';
          ctx.stroke();

          const lx = cx + Math.cos(angle) * (radius + 20);
          const ly = cy + Math.sin(angle) * (radius + 16);
          ctx.fillText(m.label, lx, ly);
        });

        // Data polygon
        ctx.beginPath();
        metrics.forEach((m, i) => {
          const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
          const x = cx + Math.cos(angle) * radius * m.val;
          const y = cy + Math.sin(angle) * radius * m.val;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
        ctx.fill();
        ctx.strokeStyle = '#2563EB';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [courses, students, pendingEntries.length, gradedEntries.length, allSubmissionEntries.length, assignments.length, avgClassGrade]);

  const greetingLabel = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName =
    profile?.fullName || user?.displayName || user?.email?.split('@')[0] || 'Instructor';

  const handleDismissBanner = () => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  const openGradeModal = (entry: SubmissionEntry) => {
    setGradeEntry(entry);
    setGradeScore(
      entry.submission.score !== null && entry.submission.score !== undefined
        ? String(entry.submission.score)
        : ''
    );
    setGradeFeedback(entry.submission.feedback || '');
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeEntry) return;
    const maxScore = gradeEntry.assignment.maxScore || 100;
    const parsedScore = Number(gradeScore);
    if (gradeScore === '' || Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > maxScore) {
      showToast(`Enter a score between 0 and ${maxScore}`, 'warn');
      return;
    }

    setGradingSaving(true);
    try {
      const updatedSubs = (gradeEntry.assignment.submissions || []).map((s) =>
        s.studentId === gradeEntry.submission.studentId
          ? {
              ...s,
              score: parsedScore,
              feedback: gradeFeedback.trim(),
              gradedAt: new Date().toISOString(),
            }
          : s
      );
      await updateSubmissions(gradeEntry.assignment.id, updatedSubs);
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === gradeEntry.assignment.id ? { ...a, submissions: updatedSubs } : a
        )
      );
      showToast(`Graded ${gradeEntry.submission.studentName} (${parsedScore}/${maxScore})`, 'success');
      setGradeEntry(null);
    } catch (err) {
      console.error('Grading failed:', err);
      showToast('Could not save grade', 'error');
    } finally {
      setGradingSaving(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    if (!newTitle.trim() || !newCourse.trim() || !newDueDate) {
      showToast('Please enter assignment title, course, and due date', 'warn');
      return;
    }
    setCreating(true);
    try {
      await saveAssignment(user.uid, {
        title: newTitle.trim(),
        course: newCourse.trim(),
        instructions: newInstructions.trim(),
        dueDate: newDueDate,
        maxScore: Math.max(1, Number(newMaxScore) || 100),
        assignTo: 'all',
        status: 'published',
        submissions: [],
      });
      showToast('Assignment published to students', 'success');
      setCreateOpen(false);
      setNewTitle('');
      setNewInstructions('');
      await loadData();
    } catch (err) {
      console.error('Create assignment error:', err);
      showToast('Failed to create assignment', 'error');
    } finally {
      setCreating(false);
    }
  };

  const publishedCoursesCount = courses.filter((c) => c.status === 'published').length;

  return (
    <InstructorLayout breadcrumbLabel="Dashboard">
      <div className="tf-inst-dash">
        {!bannerDismissed && (
          <div className="welcome-banner">
            <div>
              <div className="wb-greeting">{greetingLabel},</div>
              <div className="wb-name">Welcome back, {displayName}</div>
              <div className="wb-sub">
                You have {pendingEntries.length} pending submission
                {pendingEntries.length === 1 ? '' : 's'} across {publishedCoursesCount} published course
                {publishedCoursesCount === 1 ? '' : 's'}.
              </div>
            </div>
            <div className="wb-right">
              <div className="wb-streak">
                <span className="streak-flame" aria-hidden="true">
                  🎯
                </span>
                <div>
                  <div className="streak-count">{students.length}</div>
                  <div className="streak-label">Active Learners</div>
                </div>
              </div>
              <button
                type="button"
                className="dismiss-btn"
                title="Dismiss welcome banner"
                onClick={handleDismissBanner}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="qs-card">
            <div className="qs-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <div>
              <div className="qs-label">Total Courses</div>
              <div className="qs-value">{loading ? '—' : courses.length}</div>
            </div>
            <canvas ref={spark1Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card">
            <div className="qs-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <div className="qs-label">Enrolled Students</div>
              <div className="qs-value">{loading ? '—' : students.length}</div>
            </div>
            <canvas ref={spark2Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card">
            <div className="qs-icon" style={{ background: '#FFFBEB', color: '#D97706' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div className="qs-label">Pending Review</div>
              <div className="qs-value">{loading ? '—' : pendingEntries.length}</div>
            </div>
            <canvas ref={spark3Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card">
            <div className="qs-icon" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div className="qs-label">Avg Class Grade</div>
              <div className="qs-value">
                {loading ? '—' : avgClassGrade !== null ? `${avgClassGrade}%` : 'N/A'}
              </div>
            </div>
            <canvas ref={spark4Ref} className="qs-spark" width={90} height={36} />
          </div>
        </div>

        {/* Main Two Column Layout */}
        <div className="two-col">
          <div className="col-left">
            {/* Courses Preview */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Your Courses</h3>
                <Link to="/instructor/courses" className="sc-link">
                  Manage courses →
                </Link>
              </div>
              {courses.length === 0 ? (
                <div className="empty-state">
                  No courses created yet.{' '}
                  <Link to="/instructor/courses" className="sc-link">
                    Create your first course
                  </Link>
                </div>
              ) : (
                <div className="courses-list">
                  {courses.slice(0, 4).map((c) => (
                    <Link key={c.id} to="/instructor/courses" className="course-row">
                      <img
                        src={sanitizeImageSrc(c.thumb, COURSE_THUMB_FALLBACK)}
                        alt={c.alt || c.title}
                        className="cr-thumb"
                      />
                      <div className="cr-info">
                        <div className="cr-title">{c.title}</div>
                        <div className="cr-meta">
                          {c.lessons} lessons · {c.materials?.length || 0} materials
                        </div>
                      </div>
                      <span
                        className={`badge-pill ${
                          c.status === 'published' ? 'green' : 'blue'
                        }`}
                      >
                        {c.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Submissions Section */}
            <div className="section-card">
              <div className="sc-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3>Student Submissions</h3>
                  <div className="tab-pills">
                    <button
                      type="button"
                      className={`tab-pill${subTab === 'pending' ? ' active' : ''}`}
                      onClick={() => setSubTab('pending')}
                    >
                      Pending ({pendingEntries.length})
                    </button>
                    <button
                      type="button"
                      className={`tab-pill${subTab === 'graded' ? ' active' : ''}`}
                      onClick={() => setSubTab('graded')}
                    >
                      Graded ({gradedEntries.length})
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="sc-link"
                  onClick={() => setCreateOpen(true)}
                >
                  + New assignment
                </button>
              </div>

              {displayedSubmissions.length === 0 ? (
                <div className="empty-state">
                  {subTab === 'pending'
                    ? 'All caught up! No pending submissions to grade.'
                    : 'No graded submissions yet.'}
                </div>
              ) : (
                <div className="assign-list">
                  {displayedSubmissions.slice(0, 6).map((entry) => {
                    const max = entry.assignment.maxScore || 100;
                    const pct =
                      entry.isGraded && entry.submission.score !== null && entry.submission.score !== undefined
                        ? Math.round((entry.submission.score / max) * 100)
                        : null;
                    return (
                      <div
                        key={`${entry.assignment.id}-${entry.submission.studentId}`}
                        className="assign-item"
                      >
                        <span
                          className={`ai-status-dot ${
                            entry.isGraded ? 'graded' : 'pending'
                          }`}
                        />
                        <div className="ai-body">
                          <div className="ai-title">
                            {entry.submission.studentName} — {entry.assignment.title}
                          </div>
                          <div className="ai-course">
                            {entry.assignment.course} · Submitted{' '}
                            {formatDateShort(entry.submission.submittedAt)}
                          </div>
                        </div>
                        {entry.isGraded && pct !== null && (
                          <span
                            className="ai-grade"
                            style={{ color: gradeColor(pct) }}
                          >
                            {entry.submission.score}/{max}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ai-action-btn"
                          onClick={() => openGradeModal(entry)}
                        >
                          {entry.isGraded ? 'Edit Grade' : 'Grade'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="col-right">
            {/* Weekly Submissions Activity */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Weekly Submissions</h3>
                <span className="badge-pill blue">This week</span>
              </div>
              <div className="weekly-chart">
                <div className="wc-bars">
                  {weeklyData.counts.map((cnt, i) => {
                    const heightPct = Math.max(12, Math.round((cnt / weeklyData.maxVal) * 100));
                    return (
                      <div key={weeklyData.dayLabels[i]} className="wc-bar-wrap">
                        <span className="wc-val">{cnt}</span>
                        <div
                          className={`wc-bar${i === weeklyData.todayIdx ? ' today' : ''}`}
                          style={{ height: `${heightPct}%` }}
                          title={`${weeklyData.dayLabels[i]}: ${cnt} submissions`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="wc-labels">
                  {weeklyData.dayLabels.map((lbl) => (
                    <span key={lbl}>{lbl}</span>
                  ))}
                </div>
              </div>
              <div className="wc-summary">
                <div className="wcs-item">
                  <div className="wcs-val">{allSubmissionEntries.length}</div>
                  <div className="wcs-lbl">Total Turn-ins</div>
                </div>
                <div className="wcs-sep" />
                <div className="wcs-item">
                  <div className="wcs-val">{gradedEntries.length}</div>
                  <div className="wcs-lbl">Graded</div>
                </div>
                <div className="wcs-sep" />
                <div className="wcs-item">
                  <div className="wcs-val">{pendingEntries.length}</div>
                  <div className="wcs-lbl">Pending</div>
                </div>
              </div>
            </div>

            {/* Cohort Overview Radar */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Cohort Overview</h3>
                <Link to="/instructor/performance" className="sc-link">
                  Analytics →
                </Link>
              </div>
              <div className="participation-wrap">
                <canvas ref={radarRef} />
                <div className="radar-legend">
                  <span className="rl-item">
                    <span className="rl-dot" style={{ background: '#2563EB' }} />
                    Cohort Health
                  </span>
                  <span className="rl-item">
                    <span className="rl-dot" style={{ background: '#16A34A' }} />
                    {gradedEntries.length} Graded
                  </span>
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Upcoming Deadlines</h3>
                <Link to="/instructor/assignments" className="sc-link">
                  View all
                </Link>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <div className="empty-state">No upcoming assignment deadlines.</div>
              ) : (
                <div className="deadline-list">
                  {upcomingDeadlines.map(({ assignment, due, diffDays }) => {
                    const isUrgent = diffDays <= 2;
                    return (
                      <div key={assignment.id} className="dl-item">
                        <div className={`dl-date-box ${isUrgent ? 'urgent' : 'normal'}`}>
                          <span className="dl-day">{due.getDate()}</span>
                          <span className="dl-month">
                            {due.toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                        </div>
                        <div className="dl-info">
                          <div className="dl-title">{assignment.title}</div>
                          <div className="dl-course">{assignment.course}</div>
                        </div>
                        <span className={`dl-days-left ${isUrgent ? 'urgent' : 'normal'}`}>
                          {diffDays <= 0
                            ? 'Today'
                            : diffDays === 1
                              ? '1d left'
                              : `${diffDays}d left`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grade Modal */}
        <div
          className={`modal${gradeEntry ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setGradeEntry(null);
          }}
        >
          {gradeEntry && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Grade submission">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setGradeEntry(null)}
              >
                ×
              </button>
              <h2>Grade Submission</h2>
              <div className="modal-course-label">
                {gradeEntry.submission.studentName} · {gradeEntry.assignment.title} (
                {gradeEntry.assignment.course})
              </div>

              <div className="file-preview" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Student Submission:</span>
                <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                  {gradeEntry.submission.text || 'No written notes provided.'}
                </div>
                {gradeEntry.submission.link && sanitizeUrl(gradeEntry.submission.link) && (
                  <a
                    href={sanitizeUrl(gradeEntry.submission.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sc-link"
                  >
                    Open submitted link / file ↗
                  </a>
                )}
              </div>

              <form onSubmit={handleSaveGrade}>
                <label htmlFor="dashGradeScore">
                  Score (out of {gradeEntry.assignment.maxScore || 100})
                </label>
                <input
                  id="dashGradeScore"
                  type="number"
                  min={0}
                  max={gradeEntry.assignment.maxScore || 100}
                  value={gradeScore}
                  onChange={(e) => setGradeScore(e.target.value)}
                  required
                />

                <label htmlFor="dashGradeFeedback">Feedback for student</label>
                <textarea
                  id="dashGradeFeedback"
                  rows={3}
                  placeholder="Write constructive feedback..."
                  value={gradeFeedback}
                  onChange={(e) => setGradeFeedback(e.target.value)}
                />

                <button type="submit" className="submit-btn" disabled={gradingSaving}>
                  {gradingSaving ? 'Saving Grade...' : 'Save Grade'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Create Assignment Modal */}
        <div
          className={`modal${createOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false);
          }}
        >
          {createOpen && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Create assignment">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setCreateOpen(false)}
              >
                ×
              </button>
              <h2>Quick Create Assignment</h2>
              <div className="modal-course-label">
                Publish a new assignment directly to enrolled students.
              </div>
              <form onSubmit={handleCreateAssignment}>
                <label htmlFor="dashNewTitle">Title</label>
                <input
                  id="dashNewTitle"
                  type="text"
                  placeholder="e.g., Week 3 UI Prototype"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />

                <label htmlFor="dashNewCourse">Course</label>
                {courses.length > 0 ? (
                  <select
                    id="dashNewCourse"
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    required
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.title}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="dashNewCourse"
                    type="text"
                    placeholder="Course title"
                    value={newCourse}
                    onChange={(e) => setNewCourse(e.target.value)}
                    required
                  />
                )}

                <label htmlFor="dashNewDue">Due Date</label>
                <input
                  id="dashNewDue"
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  required
                />

                <label htmlFor="dashNewMax">Max Score</label>
                <input
                  id="dashNewMax"
                  type="number"
                  min={1}
                  max={1000}
                  value={newMaxScore}
                  onChange={(e) => setNewMaxScore(e.target.value)}
                  required
                />

                <label htmlFor="dashNewInst">Instructions</label>
                <textarea
                  id="dashNewInst"
                  rows={3}
                  placeholder="Describe deliverables and grading criteria..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                />

                <button type="submit" className="submit-btn" disabled={creating}>
                  {creating ? 'Publishing...' : 'Publish Assignment'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </InstructorLayout>
  );
};

export default InstructorDashboardPage;
