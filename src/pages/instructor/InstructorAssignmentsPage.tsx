import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  deleteAssignmentDoc,
  getAssignments,
  getCourses,
  getStudentsForInstructor,
  saveAssignment,
  updateSubmissions,
} from '../../services/dataService';
import type { Assignment, AssignmentSubmission, Course, StudentEnrollmentRow } from '../../types';
import {
  formatDate,
  formatDateShort,
  gradeColor,
  initialsAvatar,
  offsetDate,
  sanitizeImageSrc,
  sanitizeUrl,
} from '../../utils/formatters';

type SortField = 'title' | 'course' | 'dueDate' | 'status';
const SORT_ORDER: SortField[] = ['dueDate', 'title', 'course', 'status'];
const QUICK_FEEDBACK = [
  'Excellent work and clear reasoning!',
  'Solid effort — review minor edge cases.',
  'Good progress, please expand your explanation.',
  'Well structured and thoroughly tested.',
];

const InstructorAssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<StudentEnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [sortIdx, setSortIdx] = useState(0);

  // Create/Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fCourse, setFCourse] = useState('');
  const [fInstructions, setFInstructions] = useState('');
  const [fDueDate, setFDueDate] = useState(() => offsetDate(7));
  const [fMaxScore, setFMaxScore] = useState('100');
  const [fAssignTo, setFAssignTo] = useState('all');
  const [fStatus, setFStatus] = useState<'published' | 'draft' | 'closed'>('published');
  const [saving, setSaving] = useState(false);

  // Submissions Modal
  const [subsAssignment, setSubsAssignment] = useState<Assignment | null>(null);

  // Single-Student Grade Modal
  const [gradingTarget, setGradingTarget] = useState<{
    assignment: Assignment;
    studentId: string;
    studentName: string;
    studentAvatar: string;
    submission: AssignmentSubmission | null;
  } | null>(null);
  const [gScore, setGScore] = useState('');
  const [gFeedback, setGFeedback] = useState('');
  const [gradingSaving, setGradingSaving] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  const loadData = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [aList, cList, sList] = await Promise.all([
        getAssignments(user.uid),
        getCourses(user.uid),
        getStudentsForInstructor(user.uid),
      ]);
      setAssignments(aList);
      setCourses(cList);
      setStudents(sList);
    } catch (err) {
      console.error('Could not load assignments:', err);
      showToast('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const sortField = SORT_ORDER[sortIdx % SORT_ORDER.length];

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assignments
      .filter((a) => {
        if (filter !== 'all' && a.status !== filter) return false;
        if (q && !a.title.toLowerCase().includes(q) && !a.course.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortField === 'title') return a.title.localeCompare(b.title);
        if (sortField === 'course') return a.course.localeCompare(b.course);
        if (sortField === 'status') return a.status.localeCompare(b.status);
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      });
  }, [assignments, filter, search, sortField]);

  const stats = useMemo(() => {
    let totalSubs = 0;
    let pendingGrade = 0;
    let published = 0;
    assignments.forEach((a) => {
      if (a.status === 'published') published += 1;
      (a.submissions || []).forEach((s) => {
        totalSubs += 1;
        if (s.score === null || s.score === undefined) pendingGrade += 1;
      });
    });
    return { total: assignments.length, published, totalSubs, pendingGrade };
  }, [assignments]);

  const openCreateModal = () => {
    setEditingId(null);
    setFTitle('');
    setFCourse(courses[0]?.title || '');
    setFInstructions('');
    setFDueDate(offsetDate(7));
    setFMaxScore('100');
    setFAssignTo('all');
    setFStatus('published');
    setFormOpen(true);
  };

  const openEditModal = (a: Assignment) => {
    setEditingId(a.id);
    setFTitle(a.title);
    setFCourse(a.course);
    setFInstructions(a.instructions || '');
    setFDueDate(a.dueDate || offsetDate(7));
    setFMaxScore(String(a.maxScore || 100));
    setFAssignTo(a.assignTo || 'all');
    setFStatus(a.status === 'draft' ? 'draft' : a.status === 'closed' ? 'closed' : 'published');
    setFormOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    if (!fTitle.trim() || !fCourse.trim() || !fDueDate) {
      showToast('Title, course, and due date are required', 'warn');
      return;
    }
    setSaving(true);
    try {
      await saveAssignment(
        user.uid,
        {
          title: fTitle.trim(),
          course: fCourse.trim(),
          instructions: fInstructions.trim(),
          dueDate: fDueDate,
          maxScore: Math.max(1, Number(fMaxScore) || 100),
          assignTo: fAssignTo,
          status: fStatus,
          ...(editingId ? {} : { submissions: [] }),
        },
        editingId
      );
      showToast(editingId ? 'Assignment updated' : 'Assignment created', 'success');
      setFormOpen(false);
      await loadData();
    } catch (err) {
      console.error('Could not save assignment:', err);
      showToast('Failed to save assignment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAssignmentDoc(deleteTarget.id);
      setAssignments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showToast(`Deleted "${deleteTarget.title}"`, 'info');
    } catch (err) {
      console.error('Delete assignment failed:', err);
      showToast('Could not delete assignment', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const rosterForAssignment = useMemo(() => {
    if (!subsAssignment) return [];
    const subMap = new Map<string, AssignmentSubmission>();
    (subsAssignment.submissions || []).forEach((s) => subMap.set(s.studentId, s));

    const enrolled = students.filter((st) => st.courseTitles.includes(subsAssignment.course));
    const rows: {
      studentId: string;
      name: string;
      avatar: string;
      submission: AssignmentSubmission | null;
    }[] = [];

    // Submitted first
    (subsAssignment.submissions || []).forEach((s) => {
      rows.push({
        studentId: s.studentId,
        name: s.studentName || 'Student',
        avatar: s.studentAvatar || '',
        submission: s,
      });
    });

    // Add enrolled students who haven't submitted
    enrolled.forEach((st) => {
      if (!subMap.has(st.id)) {
        rows.push({
          studentId: st.id,
          name: st.name,
          avatar: st.avatar,
          submission: null,
        });
      }
    });

    return rows;
  }, [subsAssignment, students]);

  const openSingleGradeModal = (
    assignment: Assignment,
    row: { studentId: string; name: string; avatar: string; submission: AssignmentSubmission | null }
  ) => {
    setGradingTarget({
      assignment,
      studentId: row.studentId,
      studentName: row.name,
      studentAvatar: row.avatar,
      submission: row.submission,
    });
    setGScore(
      row.submission?.score !== null && row.submission?.score !== undefined
        ? String(row.submission.score)
        : ''
    );
    setGFeedback(row.submission?.feedback || '');
  };

  const handleSaveSingleGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingTarget) return;
    const max = gradingTarget.assignment.maxScore || 100;
    const parsed = Number(gScore);
    if (gScore === '' || Number.isNaN(parsed) || parsed < 0 || parsed > max) {
      showToast(`Enter a score between 0 and ${max}`, 'warn');
      return;
    }

    setGradingSaving(true);
    try {
      const existing = gradingTarget.assignment.submissions || [];
      const found = existing.some((s) => s.studentId === gradingTarget.studentId);
      const nextSubs: AssignmentSubmission[] = found
        ? existing.map((s) =>
            s.studentId === gradingTarget.studentId
              ? {
                  ...s,
                  score: parsed,
                  feedback: gFeedback.trim(),
                  gradedAt: new Date().toISOString(),
                }
              : s
          )
        : [
            ...existing,
            {
              studentId: gradingTarget.studentId,
              studentName: gradingTarget.studentName,
              studentAvatar: gradingTarget.studentAvatar,
              submittedAt: new Date().toISOString(),
              text: '',
              score: parsed,
              feedback: gFeedback.trim(),
              gradedAt: new Date().toISOString(),
            },
          ];

      await updateSubmissions(gradingTarget.assignment.id, nextSubs);
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === gradingTarget.assignment.id ? { ...a, submissions: nextSubs } : a
        )
      );
      if (subsAssignment && subsAssignment.id === gradingTarget.assignment.id) {
        setSubsAssignment({ ...subsAssignment, submissions: nextSubs });
      }
      showToast(`Saved grade (${parsed}/${max}) for ${gradingTarget.studentName}`, 'success');
      setGradingTarget(null);
    } catch (err) {
      console.error('Could not save grade:', err);
      showToast('Failed to save grade', 'error');
    } finally {
      setGradingSaving(false);
    }
  };

  const liveScorePct = useMemo(() => {
    if (!gradingTarget || gScore === '') return 0;
    const max = gradingTarget.assignment.maxScore || 100;
    const num = Number(gScore);
    if (Number.isNaN(num)) return 0;
    return Math.max(0, Math.min(100, Math.round((num / max) * 100)));
  }, [gradingTarget, gScore]);

  return (
    <InstructorLayout breadcrumbLabel="Assignments">
      <div className="tf-inst-assign">
        <div className="content-header">
          <div className="header-left">
            <h1>Assignments</h1>
            <p className="header-sub">
              Create coursework, review submissions, and publish student grades.
            </p>
          </div>
          <button type="button" className="add-btn" onClick={openCreateModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Assignment
          </button>
        </div>

        {/* Summary Cards */}
        <div className="summary-cards">
          <div className="s-card">
            <div className="s-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <div className="s-label">Total Assignments</div>
              <div className="s-value">{stats.total}</div>
            </div>
          </div>

          <div className="s-card">
            <div className="s-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <div className="s-label">Published</div>
              <div className="s-value">{stats.published}</div>
            </div>
          </div>

          <div className="s-card">
            <div className="s-icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div>
              <div className="s-label">Submissions</div>
              <div className="s-value">{stats.totalSubs}</div>
            </div>
          </div>

          <div className="s-card">
            <div className="s-icon" style={{ background: '#FFFBEB', color: '#D97706' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div className="s-label">Pending Grade</div>
              <div className="s-value">{stats.pendingGrade}</div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="filters">
            {(['all', 'published', 'draft', 'closed'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-btn${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {key !== 'all' && <span className={`dot ${key}`} />}
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>

          <div className="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search title or course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="sort-btn"
            onClick={() => setSortIdx((prev) => (prev + 1) % SORT_ORDER.length)}
          >
            Sort: {sortField === 'dueDate' ? 'Due Date' : sortField.charAt(0).toUpperCase() + sortField.slice(1)}
          </button>
        </div>

        {/* Assignments Table */}
        <div className="table-wrap">
          <div className="table-header">
            <span>Assignment &amp; Course</span>
            <span>Due Date</span>
            <span>Submissions</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          <div className="table-body">
            {loading ? (
              <div className="empty-state">
                <p>Loading assignments...</p>
              </div>
            ) : filteredAssignments.length === 0 ? (
              <div className="empty-state">
                <svg
                  className="empty-icon"
                  width="52"
                  height="52"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <h2>No Assignments Found</h2>
                <p>Create your first assignment or adjust your search and filter settings.</p>
                <button type="button" className="create-btn" onClick={openCreateModal}>
                  Create Assignment
                </button>
              </div>
            ) : (
              filteredAssignments.map((a) => {
                const subs = a.submissions || [];
                const ungraded = subs.filter((s) => s.score === null || s.score === undefined).length;
                const subClass =
                  subs.length === 0 ? 'no-subs' : ungraded > 0 ? 'has-pending' : 'all-graded';
                return (
                  <div key={a.id} className="assignment-row">
                    <div>
                      <div className="row-title">{a.title}</div>
                      <div className="row-course">
                        {a.course} · Max {a.maxScore || 100} pts
                      </div>
                    </div>
                    <div className="row-due">{a.dueDate ? formatDate(a.dueDate) : 'No due date'}</div>
                    <div className="row-sub">
                      <span className={`sub-count ${subClass}`}>
                        {subs.length} turned in{ungraded > 0 ? ` (${ungraded} pending)` : ''}
                      </span>
                    </div>
                    <div className="row-status">
                      <span className={`status-badge ${a.status}`}>{a.status}</span>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="action-btn grade"
                        onClick={() => setSubsAssignment(a)}
                      >
                        Submissions
                      </button>
                      <button
                        type="button"
                        className="action-btn edit"
                        onClick={() => openEditModal(a)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="action-btn delete"
                        onClick={() => setDeleteTarget(a)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Create / Edit Assignment Modal */}
        <div
          className={`modal${formOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          {formOpen && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Assignment form">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setFormOpen(false)}
              >
                ×
              </button>
              <h2>{editingId ? 'Edit Assignment' : 'Create Assignment'}</h2>
              <form onSubmit={handleSaveAssignment}>
                <label htmlFor="asgnTitle">
                  Title <span className="req">*</span>
                </label>
                <input
                  id="asgnTitle"
                  type="text"
                  placeholder="e.g., Component Architecture Exercise"
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  required
                />

                <label htmlFor="asgnCourse">
                  Course <span className="req">*</span>
                </label>
                {courses.length > 0 ? (
                  <select
                    id="asgnCourse"
                    value={fCourse}
                    onChange={(e) => setFCourse(e.target.value)}
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
                    id="asgnCourse"
                    type="text"
                    placeholder="Course title"
                    value={fCourse}
                    onChange={(e) => setFCourse(e.target.value)}
                    required
                  />
                )}

                <div className="form-row">
                  <div>
                    <label htmlFor="asgnDue">
                      Due Date <span className="req">*</span>
                    </label>
                    <input
                      id="asgnDue"
                      type="date"
                      value={fDueDate}
                      onChange={(e) => setFDueDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="asgnMax">Max Score</label>
                    <input
                      id="asgnMax"
                      type="number"
                      min={1}
                      max={1000}
                      value={fMaxScore}
                      onChange={(e) => setFMaxScore(e.target.value)}
                    />
                  </div>
                </div>

                <label htmlFor="asgnStatus">Status</label>
                <select
                  id="asgnStatus"
                  value={fStatus}
                  onChange={(e) =>
                    setFStatus(
                      e.target.value === 'draft'
                        ? 'draft'
                        : e.target.value === 'closed'
                          ? 'closed'
                          : 'published'
                    )
                  }
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>

                <label>Assign To</label>
                <div className="assign-options">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="assignTo"
                      checked={fAssignTo === 'all'}
                      onChange={() => setFAssignTo('all')}
                    />
                    All enrolled students in this course
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="assignTo"
                      checked={fAssignTo === 'cohort'}
                      onChange={() => setFAssignTo('cohort')}
                    />
                    Active cohort only
                  </label>
                </div>

                <label htmlFor="asgnInstr">Instructions</label>
                <textarea
                  id="asgnInstr"
                  placeholder="Provide detailed guidelines, submission links, and rubric..."
                  value={fInstructions}
                  onChange={(e) => setFInstructions(e.target.value)}
                />

                <div className="modal-footer">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setFormOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={saving}>
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Assignment'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Submissions Modal */}
        <div
          className={`modal${subsAssignment ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSubsAssignment(null);
          }}
        >
          {subsAssignment && (
            <div
              className="modal-content modal-wide"
              role="dialog"
              aria-modal="true"
              aria-label="Assignment submissions"
            >
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setSubsAssignment(null)}
              >
                ×
              </button>
              <div className="grade-modal-header">
                <div>
                  <h2>{subsAssignment.title}</h2>
                  <div className="grade-modal-sub">
                    {subsAssignment.course} · Due{' '}
                    {subsAssignment.dueDate ? formatDate(subsAssignment.dueDate) : 'N/A'}
                  </div>
                </div>
                <div className="grade-modal-stats">
                  <span className="gm-stat">
                    {(subsAssignment.submissions || []).length} Submitted
                  </span>
                  <span className="gm-stat accent">
                    {(subsAssignment.submissions || []).filter(
                      (s) => s.score === null || s.score === undefined
                    ).length}{' '}
                    Pending
                  </span>
                </div>
              </div>

              {rosterForAssignment.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 16px' }}>
                  <p>No student submissions or enrollments found for this course yet.</p>
                </div>
              ) : (
                <div className="submissions-list">
                  {rosterForAssignment.map((row) => {
                    const sub = row.submission;
                    const graded = sub && sub.score !== null && sub.score !== undefined;
                    return (
                      <div key={row.studentId} className="sub-row">
                        <div className="sub-student">
                          <img
                            src={sanitizeImageSrc(row.avatar, initialsAvatar(row.name))}
                            alt={row.name}
                            className="sub-avatar"
                          />
                          <div>
                            <div className="sub-name">{row.name}</div>
                            <div className="sub-date">
                              {sub
                                ? `Submitted ${formatDateShort(sub.submittedAt)}`
                                : 'Not submitted yet'}
                            </div>
                          </div>
                        </div>
                        <div className="sub-row-end">
                          <span
                            className={`sub-grade-display ${
                              graded ? 'graded' : 'pending'
                            }`}
                          >
                            {graded
                              ? `${sub?.score}/${subsAssignment.maxScore || 100}`
                              : sub
                                ? 'Needs Grade'
                                : 'Missing'}
                          </span>
                          <button
                            type="button"
                            className={`grade-action-btn ${
                              graded ? 're-grade' : 'give-grade'
                            }`}
                            onClick={() => openSingleGradeModal(subsAssignment, row)}
                          >
                            {graded ? 'Re-grade' : 'Grade'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Single Student Grade Modal */}
        <div
          className={`modal${gradingTarget ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setGradingTarget(null);
          }}
        >
          {gradingTarget && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Grade student">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setGradingTarget(null)}
              >
                ×
              </button>
              <div className="student-grade-header">
                <img
                  src={sanitizeImageSrc(
                    gradingTarget.studentAvatar,
                    initialsAvatar(gradingTarget.studentName)
                  )}
                  alt={gradingTarget.studentName}
                  className="sgh-avatar"
                />
                <div>
                  <div className="sgh-name">{gradingTarget.studentName}</div>
                  <div className="sgh-course">
                    {gradingTarget.assignment.title} · {gradingTarget.assignment.course}
                  </div>
                </div>
              </div>

              <div className="submission-preview">
                <div className="sp-label">Submitted Work</div>
                {gradingTarget.submission?.text ? (
                  <div className="sp-content">{gradingTarget.submission.text}</div>
                ) : (
                  <div className="sp-content sp-empty">
                    No written response submitted by student.
                  </div>
                )}
                {gradingTarget.submission?.link &&
                  sanitizeUrl(gradingTarget.submission.link) && (
                    <a
                      href={sanitizeUrl(gradingTarget.submission.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sp-link"
                    >
                      Open Attachment / Link ↗
                    </a>
                  )}
              </div>

              <form onSubmit={handleSaveSingleGrade}>
                <label htmlFor="singleScoreInput">Score</label>
                <div className="score-row">
                  <input
                    id="singleScoreInput"
                    type="number"
                    min={0}
                    max={gradingTarget.assignment.maxScore || 100}
                    value={gScore}
                    onChange={(e) => setGScore(e.target.value)}
                    required
                  />
                  <span className="score-sep">/</span>
                  <span className="score-max">{gradingTarget.assignment.maxScore || 100}</span>
                </div>

                <div className="score-bar-wrap">
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${liveScorePct}%`,
                        background: gradeColor(liveScorePct),
                      }}
                    />
                  </div>
                  <span className="score-pct" style={{ color: gradeColor(liveScorePct) }}>
                    {liveScorePct}%
                  </span>
                </div>

                <label htmlFor="singleFeedbackInput">Instructor Feedback</label>
                <textarea
                  id="singleFeedbackInput"
                  placeholder="Write constructive feedback..."
                  value={gFeedback}
                  onChange={(e) => setGFeedback(e.target.value)}
                />

                <div className="quick-feedback">
                  <div className="qf-label">Quick feedback templates</div>
                  <div className="qf-chips">
                    {QUICK_FEEDBACK.map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        className="qf-chip"
                        onClick={() => setGFeedback(tpl)}
                      >
                        {tpl}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setGradingTarget(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={gradingSaving}>
                    {gradingSaving ? 'Saving...' : 'Save Grade'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Delete Confirm Modal */}
        <ConfirmModal
          open={Boolean(deleteTarget)}
          title="Delete Assignment"
          message={`Are you sure you want to delete "${deleteTarget?.title || ''}"? All recorded submissions for this assignment will also be removed.`}
          confirmText="Delete"
          isDanger
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    </InstructorLayout>
  );
};

export default InstructorAssignmentsPage;
