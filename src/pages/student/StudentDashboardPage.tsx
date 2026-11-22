import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentLayout } from '../../components/StudentLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { listMyEnrollmentDetails, type FullEnrollmentRow } from '../../services/authService';
import {
  getAssignmentsForStudent,
  submitStudentAssignment,
  type StudentAssignmentItem,
} from '../../services/dataService';
import { notifySubmission, resolveStudentIdentity } from '../../services/notificationsService';
import {
  COURSE_THUMB_FALLBACK,
  formatDateShort,
  gradeColor,
  sanitizeImageSrc,
} from '../../utils/formatters';

const BANNER_KEY = 'tf_stu_banner_dismissed';

export const StudentDashboardPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [enrollments, setEnrollments] = useState<FullEnrollmentRow[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignTab, setAssignTab] = useState<'active' | 'submitted' | 'graded'>('active');

  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Quick Submit Modal State
  const [submitTarget, setSubmitTarget] = useState<StudentAssignmentItem | null>(null);
  const [subText, setSubText] = useState('');
  const [subLink, setSubLink] = useState('');
  const [pickedFileName, setPickedFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const spark1Ref = useRef<HTMLCanvasElement | null>(null);
  const spark2Ref = useRef<HTMLCanvasElement | null>(null);
  const spark3Ref = useRef<HTMLCanvasElement | null>(null);
  const spark4Ref = useRef<HTMLCanvasElement | null>(null);
  const radarRef = useRef<HTMLCanvasElement | null>(null);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [enr, asgns] = await Promise.all([
        listMyEnrollmentDetails(user.uid),
        getAssignmentsForStudent(user.uid),
      ]);
      setEnrollments(enr);
      setAssignments(asgns);
    } catch (err) {
      console.error('Could not load student dashboard:', err);
      showToast('Failed to load your dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const classified = useMemo(() => {
    const active: StudentAssignmentItem[] = [];
    const submitted: StudentAssignmentItem[] = [];
    const graded: StudentAssignmentItem[] = [];

    assignments.forEach((a) => {
      const s = a.submission;
      if (s && s.score !== null && s.score !== undefined) {
        graded.push(a);
      } else if (s) {
        submitted.push(a);
      } else {
        active.push(a);
      }
    });

    return { active, submitted, graded };
  }, [assignments]);

  const displayedAssignments =
    assignTab === 'active'
      ? classified.active
      : assignTab === 'submitted'
        ? classified.submitted
        : classified.graded;

  const avgGrade = useMemo(() => {
    if (!classified.graded.length) return null;
    const sum = classified.graded.reduce((acc, a) => {
      const max = a.maxScore || 100;
      const sc = a.submission?.score ?? 0;
      return acc + (sc / max) * 100;
    }, 0);
    return Math.round(sum / classified.graded.length);
  }, [classified.graded]);

  const avgProgress = useMemo(() => {
    if (!enrollments.length) return 0;
    const sum = enrollments.reduce((acc, e) => acc + (e.progress || 0), 0);
    return Math.round(sum / enrollments.length);
  }, [enrollments]);

  const upcomingDeadlines = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return classified.active
      .filter((a) => a.dueDate)
      .map((a) => {
        const due = new Date(`${a.dueDate}T00:00:00`);
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
        return { assignment: a, due, diffDays };
      })
      .filter((d) => !Number.isNaN(d.due.getTime()))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 4);
  }, [classified.active]);

  const weeklyActivity = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    assignments.forEach((a) => {
      if (!a.submission?.submittedAt) return;
      const d = new Date(a.submission.submittedAt);
      if (Number.isNaN(d.getTime())) return;
      const jsDay = d.getDay();
      const idx = jsDay === 0 ? 6 : jsDay - 1;
      counts[idx] += 1;
    });
    const jsToday = new Date().getDay();
    const todayIdx = jsToday === 0 ? 6 : jsToday - 1;
    const maxVal = Math.max(1, ...counts);
    return { labels, counts, todayIdx, maxVal };
  }, [assignments]);

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
      vals.forEach((v, i) => {
        const x = (i / Math.max(1, vals.length - 1)) * w;
        const y = h - 6 - ((v - min) / span) * (h - 12);
        if (i === 0) ctx.moveTo(x, y);
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

    drawSpark(spark1Ref.current, '#2563EB', [1, 1, 2, Math.max(1, enrollments.length), enrollments.length]);
    drawSpark(spark2Ref.current, '#D97706', [3, 2, 4, Math.max(1, classified.active.length), classified.active.length]);
    drawSpark(spark3Ref.current, '#16A34A', [1, 2, 3, Math.max(2, classified.submitted.length + classified.graded.length), classified.submitted.length + classified.graded.length]);
    drawSpark(spark4Ref.current, '#7C3AED', [75, 78, 82, avgGrade || 84, avgGrade || 86]);

    // Participation Radar
    const radar = radarRef.current;
    if (radar) {
      const dpr = window.devicePixelRatio || 1;
      const size = 216;
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
        const r = 72;
        const turnInRate = assignments.length
          ? Math.round(((classified.submitted.length + classified.graded.length) / assignments.length) * 100)
          : 55;
        const metrics = [
          { label: 'Courses', val: Math.min(1, Math.max(0.35, enrollments.length / 4)) },
          { label: 'Progress', val: Math.max(0.35, avgProgress / 100) },
          { label: 'Turn-ins', val: Math.max(0.3, turnInRate / 100) },
          { label: 'Grades', val: Math.max(0.35, (avgGrade || 80) / 100) },
          { label: 'Streak', val: 0.72 },
        ];
        const count = metrics.length;
        [0.25, 0.5, 0.75, 1].forEach((scale) => {
          ctx.beginPath();
          for (let i = 0; i < count; i += 1) {
            const ang = (Math.PI * 2 * i) / count - Math.PI / 2;
            const x = cx + Math.cos(ang) * r * scale;
            const y = cy + Math.sin(ang) * r * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        metrics.forEach((m, i) => {
          const ang = (Math.PI * 2 * i) / count - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
          ctx.strokeStyle = '#E2E8F0';
          ctx.stroke();
          ctx.fillText(m.label, cx + Math.cos(ang) * (r + 18), cy + Math.sin(ang) * (r + 15));
        });

        ctx.beginPath();
        metrics.forEach((m, i) => {
          const ang = (Math.PI * 2 * i) / count - Math.PI / 2;
          const x = cx + Math.cos(ang) * r * m.val;
          const y = cy + Math.sin(ang) * r * m.val;
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
  }, [enrollments.length, classified.active.length, classified.submitted.length, classified.graded.length, assignments.length, avgGrade, avgProgress]);

  const greetingLabel = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName =
    profile?.fullName || user?.displayName || user?.email?.split('@')[0] || 'Student';

  const handleFilePick = (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    setPickedFileName(f.name);
    if (!subText.trim()) {
      setSubText(`Attached file: ${f.name}`);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitTarget || !user?.uid) return;
    if (!subText.trim() && !subLink.trim()) {
      showToast('Add submission notes or a project link before submitting', 'warn');
      return;
    }
    setSubmitting(true);
    try {
      await submitStudentAssignment(submitTarget.id, user.uid, {
        text: subText.trim(),
        link: subLink.trim(),
      });
      const identity = resolveStudentIdentity(user);
      if (submitTarget.instructorId) {
        await notifySubmission({
          instructorId: submitTarget.instructorId,
          studentId: identity.id,
          studentName: identity.name,
          studentAvatar: identity.avatar,
          courseTitle: submitTarget.course,
          assignmentId: submitTarget.id,
          assignmentTitle: submitTarget.title,
        });
      }
      showToast(`Submitted "${submitTarget.title}"`, 'success');
      setSubmitTarget(null);
      setSubText('');
      setSubLink('');
      setPickedFileName('');
      await loadData();
    } catch (err) {
      console.error('Could not submit assignment:', err);
      showToast('Failed to submit assignment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudentLayout breadcrumbLabel="Dashboard">
      <div className="tf-stu-dash">
        {!bannerDismissed && (
          <div className="welcome-banner">
            <div className="wb-decoration" />
            <div>
              <div className="wb-greeting">{greetingLabel},</div>
              <div className="wb-name">Ready to keep learning, {displayName}?</div>
              <div className="wb-sub">
                You are enrolled in <strong>{enrollments.length}</strong> course
                {enrollments.length === 1 ? '' : 's'} with{' '}
                <strong>{classified.active.length}</strong> pending task
                {classified.active.length === 1 ? '' : 's'}.
              </div>
            </div>
            <div className="wb-right">
              <div className="wb-streak">
                <span className="streak-flame" aria-hidden="true">
                  🔥
                </span>
                <div>
                  <div className="streak-count">{classified.submitted.length + classified.graded.length}</div>
                  <div className="streak-label">Turn-ins Done</div>
                </div>
              </div>
              <button
                type="button"
                className="dismiss-btn"
                title="Dismiss banner"
                onClick={() => {
                  setBannerDismissed(true);
                  try {
                    sessionStorage.setItem(BANNER_KEY, '1');
                  } catch {
                    // ignore
                  }
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="qs-card" style={{ '--c': '#EFF6FF', '--ic': '#2563EB' } as React.CSSProperties}>
            <div className="qs-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <div className="qs-data">
              <div className="qs-label">Enrolled Courses</div>
              <div className="qs-value">{loading ? '—' : enrollments.length}</div>
            </div>
            <canvas ref={spark1Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card" style={{ '--c': '#FFFBEB', '--ic': '#D97706' } as React.CSSProperties}>
            <div className="qs-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="qs-data">
              <div className="qs-label">Pending Tasks</div>
              <div className="qs-value">{loading ? '—' : classified.active.length}</div>
            </div>
            <canvas ref={spark2Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card" style={{ '--c': '#F0FDF4', '--ic': '#16A34A' } as React.CSSProperties}>
            <div className="qs-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="qs-data">
              <div className="qs-label">Completed Work</div>
              <div className="qs-value">
                {loading ? '—' : classified.submitted.length + classified.graded.length}
              </div>
            </div>
            <canvas ref={spark3Ref} className="qs-spark" width={90} height={36} />
          </div>

          <div className="qs-card" style={{ '--c': '#F5F3FF', '--ic': '#7C3AED' } as React.CSSProperties}>
            <div className="qs-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="qs-data">
              <div className="qs-label">Average Score</div>
              <div className="qs-value">
                {loading ? '—' : avgGrade !== null ? `${avgGrade}%` : 'N/A'}
              </div>
            </div>
            <canvas ref={spark4Ref} className="qs-spark" width={90} height={36} />
          </div>
        </div>

        {/* Two Column Grid */}
        <div className="two-col">
          <div className="col-left">
            {/* Enrolled Courses */}
            <div className="section-card">
              <div className="sc-header">
                <h3>My Enrolled Courses</h3>
                <Link to="/student/courses" className="sc-link">
                  Browse catalog →
                </Link>
              </div>
              {enrollments.length === 0 ? (
                <div className="empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                  <p>You haven&apos;t enrolled in any courses yet.</p>
                </div>
              ) : (
                <div className="courses-list">
                  {enrollments.slice(0, 4).map((enr) => (
                    <button
                      key={enr.id}
                      type="button"
                      className="course-row"
                      onClick={() => navigate('/student/courses')}
                    >
                      <img
                        src={sanitizeImageSrc(enr.thumb, COURSE_THUMB_FALLBACK)}
                        alt={enr.courseTitle}
                        className="cr-thumb"
                      />
                      <div className="cr-info">
                        <div className="cr-title">{enr.courseTitle}</div>
                        <div className="cr-meta">
                          {enr.instructorName || 'Talent Flow Instructor'} · {enr.lessons} lessons
                        </div>
                        <div className="cr-progress-bar">
                          <div
                            className="cr-progress-fill"
                            style={{ width: `${Math.min(100, enr.progress)}%` }}
                          />
                        </div>
                      </div>
                      <span className="cr-pct">{enr.progress}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assignments */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Assignments</h3>
                <div className="tab-pills">
                  <button
                    type="button"
                    className={`tab-pill${assignTab === 'active' ? ' active' : ''}`}
                    onClick={() => setAssignTab('active')}
                  >
                    Active ({classified.active.length})
                  </button>
                  <button
                    type="button"
                    className={`tab-pill${assignTab === 'submitted' ? ' active' : ''}`}
                    onClick={() => setAssignTab('submitted')}
                  >
                    Submitted ({classified.submitted.length})
                  </button>
                  <button
                    type="button"
                    className={`tab-pill${assignTab === 'graded' ? ' active' : ''}`}
                    onClick={() => setAssignTab('graded')}
                  >
                    Graded ({classified.graded.length})
                  </button>
                </div>
              </div>

              {displayedAssignments.length === 0 ? (
                <div className="empty-state">
                  <p>
                    {assignTab === 'active'
                      ? 'No pending assignments right now!'
                      : assignTab === 'submitted'
                        ? 'No assignments awaiting grades.'
                        : 'No graded assignments yet.'}
                  </p>
                </div>
              ) : (
                <div className="assign-list">
                  {displayedAssignments.slice(0, 6).map((a) => {
                    const s = a.submission;
                    const isGraded = Boolean(s && s.score !== null && s.score !== undefined);
                    const isSub = Boolean(s && !isGraded);
                    const pct = isGraded
                      ? Math.round(((s?.score ?? 0) / (a.maxScore || 100)) * 100)
                      : null;
                    return (
                      <div key={a.id} className="assign-item">
                        <span
                          className={`ai-status-dot ${
                            isGraded ? 'graded' : isSub ? 'submitted' : 'pending'
                          }`}
                        />
                        <div className="ai-body">
                          <div className="ai-title">{a.title}</div>
                          <div className="ai-course">{a.course}</div>
                          <div className="ai-footer">
                            <span className={`ai-due ${isGraded ? 'done' : 'normal'}`}>
                              {a.dueDate ? `Due ${formatDateShort(a.dueDate)}` : 'Flexible due date'}
                            </span>
                            {isGraded && pct !== null ? (
                              <span className="ai-grade" style={{ color: gradeColor(pct) }}>
                                {s?.score}/{a.maxScore || 100} ({pct}%)
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="ai-action-btn"
                                onClick={() => {
                                  setSubmitTarget(a);
                                  setSubText(s?.text || '');
                                  setSubLink(s?.link || '');
                                  setPickedFileName('');
                                }}
                              >
                                {isSub ? 'Update Work' : 'Submit'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="col-right">
            {/* Weekly Study Activity */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Weekly Study Activity</h3>
                <span className="badge-pill blue">7 Days</span>
              </div>
              <div className="weekly-chart">
                <div className="wc-bars">
                  {weeklyActivity.counts.map((cnt, idx) => (
                    <div key={weeklyActivity.labels[idx]} className="wc-bar-wrap">
                      <span className="wc-val">{cnt}</span>
                      <div
                        className={`wc-bar${idx === weeklyActivity.todayIdx ? ' today' : ''}`}
                        style={{
                          height: `${Math.max(12, Math.round((cnt / weeklyActivity.maxVal) * 100))}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="wc-labels">
                  {weeklyActivity.labels.map((lbl) => (
                    <span key={lbl}>{lbl}</span>
                  ))}
                </div>
              </div>
              <div className="wc-summary">
                <div className="wcs-item">
                  <div className="wcs-val">{avgProgress}%</div>
                  <div className="wcs-lbl">Course Avg</div>
                </div>
                <div className="wcs-sep" />
                <div className="wcs-item">
                  <div className="wcs-val">{classified.graded.length}</div>
                  <div className="wcs-lbl">Graded</div>
                </div>
                <div className="wcs-sep" />
                <div className="wcs-item">
                  <div className="wcs-val">{classified.active.length}</div>
                  <div className="wcs-lbl">Due</div>
                </div>
              </div>
            </div>

            {/* Participation Radar */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Participation Radar</h3>
                <span className="badge-pill green">On Track</span>
              </div>
              <div className="participation-wrap">
                <canvas ref={radarRef} />
                <div className="radar-legend">
                  <span className="rl-item">
                    <span className="rl-dot" style={{ background: '#2563EB' }} />
                    Engagement Index
                  </span>
                </div>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="section-card">
              <div className="sc-header">
                <h3>Upcoming Deadlines</h3>
                <Link to="/student/assignments" className="sc-link">
                  View all
                </Link>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <div className="empty-state">
                  <p>No upcoming deadlines right now.</p>
                </div>
              ) : (
                <div className="deadline-list">
                  {upcomingDeadlines.map(({ assignment, due, diffDays }) => {
                    const cls = diffDays <= 2 ? 'urgent' : diffDays <= 5 ? 'soon' : 'normal';
                    return (
                      <div key={assignment.id} className="dl-item">
                        <div className={`dl-date-box ${cls}`}>
                          <span className="dl-day">{due.getDate()}</span>
                          <span className="dl-month">
                            {due.toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                        </div>
                        <div className="dl-info">
                          <div className="dl-title">{assignment.title}</div>
                          <div className="dl-course">{assignment.course}</div>
                        </div>
                        <span className={`dl-days-left ${cls}`}>
                          {diffDays < 0
                            ? `${Math.abs(diffDays)}d late`
                            : diffDays === 0
                              ? 'Today'
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

        {/* Submit Assignment Modal */}
        <div
          className={`modal${submitTarget ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSubmitTarget(null);
          }}
        >
          {submitTarget && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Submit work">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setSubmitTarget(null)}
              >
                ×
              </button>
              <h2>{submitTarget.title}</h2>
              <div className="modal-course-label">
                {submitTarget.course} · Max {submitTarget.maxScore || 100} pts
              </div>

              <form onSubmit={handleSubmitWork}>
                <div
                  className={`upload-zone${dragOver ? ' drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFilePick(e.dataTransfer.files);
                  }}
                >
                  <p>
                    Drop project file here or <span className="uz-link">browse</span>
                  </p>
                  <div className="uz-sub">Optional file attachment note + link below</div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFilePick(e.target.files)}
                />

                {pickedFileName && <div className="file-preview">Attached: {pickedFileName}</div>}

                <textarea
                  rows={3}
                  placeholder="Write your response or notes for the instructor..."
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                />

                <input
                  type="url"
                  placeholder="Optional link (GitHub repo, Figma, Google Drive...)"
                  value={subLink}
                  onChange={(e) => setSubLink(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    fontSize: 13.5,
                    marginBottom: 16,
                    fontFamily: 'inherit',
                  }}
                />

                <button type="submit" className="submit-btn" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Assignment'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentDashboardPage;
