import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StudentLayout } from '../../components/StudentLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getAssignmentsForStudent,
  submitStudentAssignment,
  type StudentAssignmentItem,
} from '../../services/dataService';
import { notifySubmission, resolveStudentIdentity } from '../../services/notificationsService';
import { formatDate, formatDateShort } from '../../utils/formatters';

type StatusFilter = 'all' | 'pending' | 'submitted' | 'graded' | 'late';

function getAssignmentStatus(item: StudentAssignmentItem): Exclude<StatusFilter, 'all'> {
  const s = item.submission;
  if (s && s.score !== null && s.score !== undefined) return 'graded';
  if (s) return 'submitted';
  if (item.dueDate) {
    const due = new Date(`${item.dueDate}T23:59:59`);
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return 'late';
  }
  return 'pending';
}

export const StudentAssignmentsPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<StudentAssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  // Submit / Resubmit Modal
  const [submitItem, setSubmitItem] = useState<StudentAssignmentItem | null>(null);
  const [subText, setSubText] = useState('');
  const [subLink, setSubLink] = useState('');
  const [fileMeta, setFileMeta] = useState<{ name: string; size: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Grade & Feedback Modal
  const [gradeItem, setGradeItem] = useState<StudentAssignmentItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssignments = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const list = await getAssignmentsForStudent(user.uid);
      setItems(list);
    } catch (err) {
      console.error('Could not load student assignments:', err);
      showToast('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const counts = useMemo(() => {
    const c = { pending: 0, submitted: 0, graded: 0, late: 0 };
    items.forEach((a) => {
      c[getAssignmentStatus(a)] += 1;
    });
    return c;
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((a) => {
      const st = getAssignmentStatus(a);
      if (filter !== 'all' && st !== filter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.course.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [items, filter, search]);

  const openSubmitModal = (a: StudentAssignmentItem) => {
    setSubmitItem(a);
    setSubText(a.submission?.text || '');
    setSubLink(a.submission?.link || '');
    setFileMeta(null);
  };

  const handleFilePick = (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    setFileMeta({
      name: f.name,
      size: `${(f.size / 1024).toFixed(1)} KB`,
    });
    if (!subText.trim()) {
      setSubText(`Attached file: ${f.name}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitItem || !user?.uid) return;
    if (!subText.trim() && !subLink.trim()) {
      showToast('Please enter your response or link before submitting', 'warn');
      return;
    }
    setSubmitting(true);
    try {
      await submitStudentAssignment(submitItem.id, user.uid, {
        text: subText.trim(),
        link: subLink.trim(),
      });
      const identity = resolveStudentIdentity(user);
      if (submitItem.instructorId) {
        await notifySubmission({
          instructorId: submitItem.instructorId,
          studentId: identity.id,
          studentName: identity.name,
          studentAvatar: identity.avatar,
          courseTitle: submitItem.course,
          assignmentId: submitItem.id,
          assignmentTitle: submitItem.title,
        });
      }
      showToast(`Submitted "${submitItem.title}"`, 'success');
      setSubmitItem(null);
      await loadAssignments();
    } catch (err) {
      console.error('Submission failed:', err);
      showToast('Could not submit assignment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StudentLayout breadcrumbLabel="Assignments">
      <div className="tf-stu-assign">
        <div className="page-header">
          <div>
            <h1>My Assignments</h1>
            <p className="page-sub">
              Submit coursework before deadlines and inspect instructor feedback.
            </p>
          </div>
          <div className="header-chips">
            <span className="chip chip-pending">
              <span className="chip-dot" />
              Pending: {counts.pending + counts.late}
            </span>
            <span className="chip chip-submitted">
              <span className="chip-dot" />
              Submitted: {counts.submitted}
            </span>
            <span className="chip chip-graded">
              <span className="chip-dot" />
              Graded: {counts.graded}
            </span>
          </div>
        </div>

        <div className="filter-bar">
          <div className="tab-pills">
            {(
              [
                ['all', `All (${items.length})`],
                ['pending', `Pending (${counts.pending})`],
                ['submitted', `Submitted (${counts.submitted})`],
                ['graded', `Graded (${counts.graded})`],
                ['late', `Overdue (${counts.late})`],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                className={`tab-pill${filter === key ? ' active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {lbl}
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
              placeholder="Search assignment or course..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading your assignments...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
            <p>No assignments found in this view.</p>
          </div>
        ) : (
          <div className="assignments-grid">
            {filteredItems.map((a) => {
              const st = getAssignmentStatus(a);
              const sub = a.submission;
              const max = a.maxScore || 100;
              const scorePct =
                st === 'graded' && sub?.score !== null && sub?.score !== undefined
                  ? Math.round((sub.score / max) * 100)
                  : 0;
              return (
                <div key={a.id} className={`asgn-card status-${st}`}>
                  <div className="card-top">
                    <div className="card-title">{a.title}</div>
                    <span className={`status-badge ${st}`}>{st}</span>
                  </div>

                  <div className="card-meta">
                    <span className="meta-item">
                      <strong>{a.course}</strong>
                    </span>
                    <span className={`meta-item${st === 'late' ? ' urgent' : ''}`}>
                      Due: <strong>{a.dueDate ? formatDateShort(a.dueDate) : 'Open'}</strong>
                    </span>
                    <span className="meta-item">
                      Max: <strong>{max} pts</strong>
                    </span>
                  </div>

                  {st === 'graded' && sub && (
                    <div className="card-grade">
                      <div className="grade-score">
                        {sub.score}
                        <span>/{max}</span>
                      </div>
                      <div className="grade-bar-wrap">
                        <div className="grade-bar-label">{scorePct}% Final Score</div>
                        <div className="grade-bar-bg">
                          <div
                            className="grade-bar-fill"
                            style={{ width: `${Math.min(100, scorePct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {st === 'submitted' && sub && (
                    <div className="card-submitted">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Submitted {formatDateShort(sub.submittedAt)} · Awaiting grade</span>
                    </div>
                  )}

                  <div className="card-footer">
                    {st === 'graded' ? (
                      <button
                        type="button"
                        className="btn-view-grade"
                        onClick={() => setGradeItem(a)}
                      >
                        View Grade &amp; Feedback
                      </button>
                    ) : st === 'submitted' ? (
                      <button
                        type="button"
                        className="btn-resubmit"
                        onClick={() => openSubmitModal(a)}
                      >
                        Update Submission
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-submit"
                        onClick={() => openSubmitModal(a)}
                      >
                        Submit Assignment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Submit Assignment Modal */}
        <div
          className={`modal${submitItem ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSubmitItem(null);
          }}
        >
          {submitItem && (
            <div className="modal-box" role="dialog" aria-modal="true" aria-label="Submit assignment">
              <button
                type="button"
                className="modal-close"
                aria-label="Close modal"
                onClick={() => setSubmitItem(null)}
              >
                ×
              </button>

              <div className="modal-header">
                <div className="modal-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <h2>{submitItem.title}</h2>
                  <div className="modal-sub">{submitItem.course}</div>
                </div>
              </div>

              <div className="modal-due-row">
                Due {submitItem.dueDate ? formatDate(submitItem.dueDate) : 'Open deadline'} · Max{' '}
                {submitItem.maxScore || 100} points
              </div>

              {submitItem.instructions && (
                <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55, marginBottom: 16 }}>
                  {submitItem.instructions}
                </p>
              )}

              <form onSubmit={handleSubmit}>
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
                  <div className="uz-main">
                    Drop assignment file here or <span className="uz-link">choose file</span>
                  </div>
                  <div className="uz-sub">Add written answer or external link below</div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFilePick(e.target.files)}
                />

                {fileMeta && (
                  <div className="file-preview">
                    <span>{fileMeta.name}</span>
                    <span className="fp-size">{fileMeta.size}</span>
                    <button
                      type="button"
                      className="fp-remove"
                      onClick={() => setFileMeta(null)}
                    >
                      ×
                    </button>
                  </div>
                )}

                <textarea
                  rows={4}
                  placeholder="Write your submission answer or notes..."
                  value={subText}
                  onChange={(e) => setSubText(e.target.value)}
                />

                <input
                  type="url"
                  placeholder="Optional submission URL (GitHub, Drive, Portfolio...)"
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
                  {submitting ? 'Submitting...' : 'Submit Work'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* View Grade & Feedback Modal */}
        <div
          className={`modal${gradeItem ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setGradeItem(null);
          }}
        >
          {gradeItem && gradeItem.submission && (
            <div className="modal-box" role="dialog" aria-modal="true" aria-label="Grade details">
              <button
                type="button"
                className="modal-close"
                aria-label="Close modal"
                onClick={() => setGradeItem(null)}
              >
                ×
              </button>

              <div className="modal-header">
                <div className="modal-icon grade-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h2>{gradeItem.title}</h2>
                  <div className="modal-sub">{gradeItem.course}</div>
                </div>
              </div>

              <div className="grade-display">
                <div className="grade-circle">
                  <span className="grade-circle-num">{gradeItem.submission.score}</span>
                  <span className="grade-denom">/ {gradeItem.maxScore || 100}</span>
                </div>
                <div>
                  <div className="grade-label">
                    {Math.round(
                      ((gradeItem.submission.score ?? 0) / (gradeItem.maxScore || 100)) * 100
                    )}
                    % Score
                  </div>
                  <div className="grade-date">
                    Graded{' '}
                    {gradeItem.submission.gradedAt
                      ? formatDate(gradeItem.submission.gradedAt)
                      : 'Recently'}
                  </div>
                </div>
              </div>

              <div className="feedback-box">
                <div className="fb-label">Instructor Feedback</div>
                <div className="fb-text">
                  {gradeItem.submission.feedback || 'Great job completing this assignment!'}
                </div>
              </div>

              <button
                type="button"
                className="close-grade-btn"
                onClick={() => setGradeItem(null)}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentAssignmentsPage;
