import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StudentLayout } from '../../components/StudentLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { enrollInCourse, listMyEnrollments } from '../../services/authService';
import { getPublicProfile, getPublishedCourses } from '../../services/dataService';
import {
  notifyEnrollment,
  notifyMaterialAccess,
  resolveStudentIdentity,
} from '../../services/notificationsService';
import type { Course, CourseMaterial, PublicInstructorProfile } from '../../types';
import {
  COURSE_THUMB_FALLBACK,
  initialsAvatar,
  sanitizeImageSrc,
  sanitizeUrl,
} from '../../utils/formatters';

export const StudentCoursesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'enrolled' | 'available'>('all');
  const [search, setSearch] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [highlightedCourseId, setHighlightedCourseId] = useState<string | null>(null);

  // Course Materials Modal
  const [materialsCourse, setMaterialsCourse] = useState<Course | null>(null);
  const notifiedMaterialCoursesRef = useRef<Set<string>>(new Set());

  // Public Instructor Profile Modal
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [instProfile, setInstProfile] = useState<PublicInstructorProfile | null>(null);
  const [instLoading, setInstLoading] = useState(false);

  const loadCatalog = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [pubCourses, myEnr] = await Promise.all([
        getPublishedCourses(),
        listMyEnrollments(user.uid),
      ]);
      setCourses(pubCourses);
      setEnrolledIds(new Set(myEnr.map((e) => e.courseId)));
    } catch (err) {
      console.error('Could not load student courses:', err);
      showToast('Failed to load courses catalog', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      const isEnrolled = enrolledIds.has(c.id);
      if (tab === 'enrolled' && !isEnrolled) return false;
      if (tab === 'available' && isEnrolled) return false;
      if (
        q &&
        !c.title.toLowerCase().includes(q) &&
        !c.desc.toLowerCase().includes(q) &&
        !(c.instructorName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [courses, enrolledIds, tab, search]);

  const enrolledCount = courses.filter((c) => enrolledIds.has(c.id)).length;
  const availableCount = courses.length - enrolledCount;

  const handleEnroll = async (course: Course) => {
    if (!user?.uid) return;
    setEnrollingId(course.id);
    try {
      await enrollInCourse(user.uid, {
        id: course.id,
        title: course.title,
        thumb: course.thumb,
        lessons: course.lessons,
        instructorName: course.instructorName,
      });
      setEnrolledIds((prev) => new Set([...prev, course.id]));
      const identity = resolveStudentIdentity(user);
      if (course.instructorId) {
        await notifyEnrollment({
          instructorId: course.instructorId,
          studentId: identity.id,
          studentName: identity.name,
          studentAvatar: identity.avatar,
          courseId: course.id,
          courseTitle: course.title,
        });
      }
      showToast(`Enrolled in ${course.title}`, 'success');
    } catch (err) {
      console.error('Enroll failed:', err);
      showToast('Could not complete enrollment', 'error');
    } finally {
      setEnrollingId(null);
    }
  };

  const openMaterials = (course: Course) => {
    setMaterialsCourse(course);
    if (
      user &&
      course.instructorId &&
      !notifiedMaterialCoursesRef.current.has(course.id)
    ) {
      notifiedMaterialCoursesRef.current.add(course.id);
      const identity = resolveStudentIdentity(user);
      void notifyMaterialAccess({
        instructorId: course.instructorId,
        studentId: identity.id,
        studentName: identity.name,
        studentAvatar: identity.avatar,
        courseId: course.id,
        courseTitle: course.title,
      });
    }
  };

  const handleDownloadMaterial = (m: CourseMaterial) => {
    if (m.dataUrl) {
      const a = document.createElement('a');
      a.href = m.dataUrl;
      a.download = m.name || 'course-material';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const content = `Talent Flow Course Material\nCourse: ${materialsCourse?.title || ''}\nFile: ${m.name}\nSize: ${m.size}\nType: ${m.type}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(m.name || 'material').replace(/[^a-zA-Z0-9._-]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openInstructorProfile = async (course: Course) => {
    if (!course.instructorId) return;
    setInstModalOpen(true);
    setInstLoading(true);
    setInstProfile(null);
    try {
      const p = await getPublicProfile(course.instructorId);
      setInstProfile(p);
    } catch (err) {
      console.error('Could not load instructor profile:', err);
      showToast('Failed to load instructor profile', 'error');
    } finally {
      setInstLoading(false);
    }
  };

  const instructorCourses = useMemo(() => {
    if (!instProfile) return [];
    return courses.filter((c) => c.instructorId === instProfile.id);
  }, [courses, instProfile]);

  return (
    <StudentLayout breadcrumbLabel="Courses">
      <div className="tf-stu-courses">
        <div className="page-header">
          <div>
            <h1>Courses Catalog</h1>
            <p className="page-sub">
              Explore published courses, connect with instructors, and download study materials.
            </p>
          </div>
          <div className="header-chips">
            <span className="chip chip-total">
              <span className="chip-dot" />
              Total: {courses.length}
            </span>
            <span className="chip chip-enrolled">
              <span className="chip-dot" />
              Enrolled: {enrolledCount}
            </span>
            <span className="chip chip-available">
              <span className="chip-dot" />
              Available: {availableCount}
            </span>
          </div>
        </div>

        <div className="filter-bar">
          <div className="tab-pills">
            {(
              [
                ['all', `All Courses (${courses.length})`],
                ['enrolled', `Enrolled (${enrolledCount})`],
                ['available', `Available (${availableCount})`],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                className={`tab-pill${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
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
              placeholder="Search course or instructor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <p>Loading course catalog...</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <p>No courses match your current search or filter.</p>
          </div>
        ) : (
          <div className="courses-grid">
            {filteredCourses.map((c) => {
              const isEnrolled = enrolledIds.has(c.id);
              const isHighlighted = highlightedCourseId === c.id;
              return (
                <div
                  key={c.id}
                  id={`stu-course-${c.id}`}
                  className={`course-card${isHighlighted ? ' course-card-highlight' : ''}`}
                >
                  <div className="course-thumb">
                    <img
                      src={sanitizeImageSrc(c.thumb, COURSE_THUMB_FALLBACK)}
                      alt={c.alt || c.title}
                    />
                    <span className={`course-badge${isEnrolled ? ' is-enrolled' : ''}`}>
                      {isEnrolled ? 'Enrolled' : `${c.lessons} Lessons`}
                    </span>
                  </div>

                  <div className="course-body">
                    <div className="course-title">{c.title}</div>
                    <div className="course-desc">
                      {c.desc || 'Practical cohort curriculum with guided projects.'}
                    </div>
                    <div className="course-meta">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      </svg>
                      <span>{c.materials?.length || 0} study materials</span>
                      <span>·</span>
                      <span>{c.lessons} lessons</span>
                    </div>

                    <button
                      type="button"
                      className="course-instructor"
                      onClick={() => void openInstructorProfile(c)}
                    >
                      <img
                        src={sanitizeImageSrc(
                          c.instructorAvatar,
                          initialsAvatar(c.instructorName || 'Instructor')
                        )}
                        alt={c.instructorName || 'Instructor'}
                      />
                      <div className="course-instructor-info">
                        <span>Instructor</span>
                        <strong>{c.instructorName || 'Talent Flow Instructor'}</strong>
                      </div>
                      <span className="inst-view-badge">Profile</span>
                    </button>

                    {isEnrolled ? (
                      <button
                        type="button"
                        className="course-btn is-enrolled"
                        onClick={() => openMaterials(c)}
                      >
                        View Course Materials ({c.materials?.length || 0})
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="course-btn"
                        disabled={enrollingId === c.id}
                        onClick={() => void handleEnroll(c)}
                      >
                        {enrollingId === c.id ? 'Enrolling...' : 'Enroll Now'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Course Materials Modal */}
        <div
          id="materialsModal"
          className={`modal${materialsCourse ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMaterialsCourse(null);
          }}
        >
          {materialsCourse && (
            <div className="modal-box" role="dialog" aria-modal="true" aria-label="Course materials">
              <div className="modal-drag-handle" />
              <button
                type="button"
                className="modal-close"
                aria-label="Close modal"
                onClick={() => setMaterialsCourse(null)}
              >
                ×
              </button>

              <div className="modal-header">
                <div className="modal-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="modal-header-text">
                  <h2>{materialsCourse.title}</h2>
                  <div className="modal-sub">
                    {materialsCourse.instructorName || 'Instructor'} · {materialsCourse.lessons}{' '}
                    lessons
                  </div>
                </div>
              </div>

              {materialsCourse.desc && (
                <div className="instructor-notes-box">
                  <div className="in-label">Course Overview</div>
                  <div className="in-text">{materialsCourse.desc}</div>
                </div>
              )}

              <div className="files-heading">
                Course Materials ({materialsCourse.materials?.length || 0})
              </div>

              {(materialsCourse.materials || []).length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>
                  Your instructor has not uploaded downloadable files for this course yet.
                </p>
              ) : (
                <div className="resources-list">
                  {(materialsCourse.materials || []).map((m, idx) => (
                    <div key={`${m.name}-${idx}`} className="resource-item">
                      <div className="resource-left">
                        <div className="resource-icon">{m.type}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="resource-title">{m.name}</div>
                          <div className="resource-sub">
                            {m.type} · {m.size}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-open-file"
                        onClick={() => handleDownloadMaterial(m)}
                      >
                        Open / Save
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="close-modal-btn"
                onClick={() => setMaterialsCourse(null)}
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Public Instructor Profile Modal */}
        <div
          className={`modal${instModalOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setInstModalOpen(false);
          }}
        >
          {instModalOpen && (
            <div
              className="modal-box instructor-modal-box"
              role="dialog"
              aria-modal="true"
              aria-label="Instructor profile"
            >
              <div className="modal-drag-handle" />
              <button
                type="button"
                className="modal-close"
                aria-label="Close modal"
                onClick={() => setInstModalOpen(false)}
              >
                ×
              </button>

              {instLoading || !instProfile ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
                  Loading instructor profile...
                </div>
              ) : (
                <>
                  <div className="inst-banner">
                    <span className="inst-verified-badge">Verified Instructor</span>
                  </div>
                  <div className="inst-header">
                    <img
                      src={sanitizeImageSrc(
                        instProfile.avatar,
                        initialsAvatar(instProfile.fullName)
                      )}
                      alt={instProfile.fullName}
                      className="inst-avatar"
                    />
                    <div className="inst-header-text">
                      <h2>{instProfile.fullName}</h2>
                      <div className="inst-title">
                        {instProfile.title || 'Talent Flow Instructor'}
                      </div>
                    </div>
                  </div>

                  <div className="inst-body">
                    {instProfile.bio && (
                      <div>
                        <div className="inst-section-label">About</div>
                        <p className="inst-bio">{instProfile.bio}</p>
                      </div>
                    )}

                    <div className="inst-details-grid">
                      <div className="inst-detail-card">
                        <span className="inst-detail-label">Experience</span>
                        <span className="inst-detail-val">
                          {instProfile.experience ? `${instProfile.experience} years` : 'Educator'}
                        </span>
                      </div>
                      <div className="inst-detail-card">
                        <span className="inst-detail-label">Education</span>
                        <span className="inst-detail-val">
                          {instProfile.education || 'Industry Specialist'}
                        </span>
                      </div>
                    </div>

                    {instProfile.expertise && (
                      <div>
                        <div className="inst-section-label">Areas of Expertise</div>
                        <div className="inst-tags">
                          {instProfile.expertise
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <span key={tag} className="inst-tag">
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {(sanitizeUrl(instProfile.linkedin) || sanitizeUrl(instProfile.website)) && (
                      <div className="inst-links-row">
                        {sanitizeUrl(instProfile.linkedin) && (
                          <a
                            href={sanitizeUrl(instProfile.linkedin)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inst-social-btn"
                          >
                            LinkedIn ↗
                          </a>
                        )}
                        {sanitizeUrl(instProfile.website) && (
                          <a
                            href={sanitizeUrl(instProfile.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inst-social-btn"
                          >
                            Website ↗
                          </a>
                        )}
                      </div>
                    )}

                    {instructorCourses.length > 0 && (
                      <div>
                        <div className="inst-section-label">
                          Courses Taught ({instructorCourses.length})
                        </div>
                        <div className="inst-courses-list">
                          {instructorCourses.map((ic) => (
                            <button
                              key={ic.id}
                              type="button"
                              className="inst-course-item"
                              onClick={() => {
                                setInstModalOpen(false);
                                setTab('all');
                                setSearch('');
                                setHighlightedCourseId(ic.id);
                                setTimeout(() => {
                                  document
                                    .getElementById(`stu-course-${ic.id}`)
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 80);
                              }}
                            >
                              <img
                                src={sanitizeImageSrc(ic.thumb, COURSE_THUMB_FALLBACK)}
                                alt={ic.title}
                                className="inst-course-thumb"
                              />
                              <span className="inst-course-title">{ic.title}</span>
                              <span className="inst-course-lessons">{ic.lessons} lessons</span>
                              <span className="inst-course-chevron">›</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
};

export default StudentCoursesPage;
