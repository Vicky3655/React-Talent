import React, { useEffect, useMemo, useRef, useState } from 'react';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getCourses,
  saveCourse,
  updateCourseMaterials,
  uploadCourseThumbnail,
} from '../../services/dataService';
import { getForCourse } from '../../services/notificationsService';
import type { Course, CourseMaterial, NotificationItem } from '../../types';
import {
  COURSE_THUMB_FALLBACK,
  detectFileType,
  formatBytes,
  initialsAvatar,
  relativeTime,
  sanitizeImageSrc,
} from '../../utils/formatters';

const InstructorCoursesPage: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(true);

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [lessons, setLessons] = useState('12');
  const [status, setStatus] = useState<'published' | 'draft'>('published');
  const [notify, setNotify] = useState(true);
  const [thumbPreview, setThumbPreview] = useState('');
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [saving, setSaving] = useState(false);
  const [thumbDragOver, setThumbDragOver] = useState(false);
  const [matDragOver, setMatDragOver] = useState(false);

  const thumbInputRef = useRef<HTMLInputElement | null>(null);
  const matInputRef = useRef<HTMLInputElement | null>(null);
  const drawerMatInputRef = useRef<HTMLInputElement | null>(null);

  // Slide-over Drawer
  const [drawerCourse, setDrawerCourse] = useState<Course | null>(null);
  const [drawerTab, setDrawerTab] = useState<'materials' | 'activity'>('materials');
  const [courseActivity, setCourseActivity] = useState<NotificationItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const loadCourses = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const list = await getCourses(user.uid);
      setCourses(list);
    } catch (err) {
      console.error('Could not load courses:', err);
      showToast('Failed to load courses', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses
      .filter((c) => {
        if (filter !== 'all' && c.status !== filter) return false;
        if (q && !c.title.toLowerCase().includes(q) && !c.desc.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => (sortAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)));
  }, [courses, filter, search, sortAsc]);

  const openCreateModal = () => {
    setEditingCourseId(null);
    setStep(1);
    setTitle('');
    setDesc('');
    setLessons('12');
    setStatus('published');
    setNotify(true);
    setThumbPreview('');
    setThumbFile(null);
    setMaterials([]);
    setModalOpen(true);
  };

  const openEditModal = (c: Course) => {
    setEditingCourseId(c.id);
    setStep(1);
    setTitle(c.title);
    setDesc(c.desc);
    setLessons(String(c.lessons || 1));
    setStatus(c.status === 'draft' ? 'draft' : 'published');
    setNotify(Boolean(c.notify));
    setThumbPreview(c.thumb || '');
    setThumbFile(null);
    setMaterials(c.materials || []);
    setModalOpen(true);
  };

  const handleThumbFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      showToast('Please upload a valid image file', 'warn');
      return;
    }
    setThumbFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setThumbPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const readFilesToMaterials = async (files: FileList | null): Promise<CourseMaterial[]> => {
    if (!files || !files.length) return [];
    const items = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<CourseMaterial>((resolve) => {
            const fileType = detectFileType(file.name);
            const label = fileType.toUpperCase();
            const cls = fileType;
            if (file.size <= 450 * 1024) {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  name: file.name,
                  size: formatBytes(file.size),
                  type: label,
                  cls,
                  dataUrl: typeof reader.result === 'string' ? reader.result : undefined,
                  uploadedAt: new Date().toISOString(),
                });
              };
              reader.onerror = () => {
                resolve({
                  name: file.name,
                  size: formatBytes(file.size),
                  type: label,
                  cls,
                  uploadedAt: new Date().toISOString(),
                });
              };
              reader.readAsDataURL(file);
            } else {
              resolve({
                name: file.name,
                size: formatBytes(file.size),
                type: label,
                cls,
                uploadedAt: new Date().toISOString(),
              });
            }
          })
      )
    );
    return items;
  };

  const handleAddModalMaterials = async (files: FileList | null) => {
    const added = await readFilesToMaterials(files);
    if (added.length) {
      setMaterials((prev) => [...prev, ...added]);
    }
  };

  const handleSaveCourse = async () => {
    if (!user?.uid) return;
    if (!title.trim()) {
      setStep(1);
      showToast('Course title is required', 'warn');
      return;
    }
    setSaving(true);
    try {
      let finalThumb = thumbPreview || COURSE_THUMB_FALLBACK;
      if (thumbFile) {
        finalThumb = await uploadCourseThumbnail(user.uid, thumbFile);
      }

      await saveCourse(
        user.uid,
        {
          title: title.trim(),
          desc: desc.trim(),
          thumb: finalThumb,
          alt: title.trim(),
          lessons: Math.max(1, Number(lessons) || 1),
          status,
          notify,
          materials,
        },
        editingCourseId
      );

      showToast(editingCourseId ? 'Course updated' : 'Course created successfully', 'success');
      setModalOpen(false);
      await loadCourses();
    } catch (err) {
      console.error('Could not save course:', err);
      showToast('Failed to save course', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDrawer = async (c: Course, initialTab: 'materials' | 'activity' = 'materials') => {
    setDrawerCourse(c);
    setDrawerTab(initialTab);
    if (user?.uid) {
      setLoadingActivity(true);
      try {
        const items = await getForCourse(user.uid, c.id, 25);
        setCourseActivity(items);
      } catch {
        setCourseActivity([]);
      } finally {
        setLoadingActivity(false);
      }
    }
  };

  const handleDrawerAddMaterials = async (files: FileList | null) => {
    if (!drawerCourse) return;
    const added = await readFilesToMaterials(files);
    if (!added.length) return;
    const nextMats = [...(drawerCourse.materials || []), ...added];
    try {
      await updateCourseMaterials(drawerCourse.id, nextMats);
      setDrawerCourse({ ...drawerCourse, materials: nextMats });
      setCourses((prev) =>
        prev.map((c) => (c.id === drawerCourse.id ? { ...c, materials: nextMats } : c))
      );
      showToast(`Added ${added.length} material${added.length > 1 ? 's' : ''}`, 'success');
    } catch (err) {
      console.error('Failed to update materials:', err);
      showToast('Could not update course materials', 'error');
    }
  };

  const handleDrawerRemoveMaterial = async (idx: number) => {
    if (!drawerCourse) return;
    const nextMats = (drawerCourse.materials || []).filter((_, i) => i !== idx);
    try {
      await updateCourseMaterials(drawerCourse.id, nextMats);
      setDrawerCourse({ ...drawerCourse, materials: nextMats });
      setCourses((prev) =>
        prev.map((c) => (c.id === drawerCourse.id ? { ...c, materials: nextMats } : c))
      );
      showToast('Material removed', 'info');
    } catch (err) {
      console.error('Failed to remove material:', err);
      showToast('Could not remove material', 'error');
    }
  };

  return (
    <InstructorLayout breadcrumbLabel="Courses">
      <div className="tf-inst-courses">
        <div className="content-header">
          <h1>Courses</h1>
          <button type="button" className="add-btn" onClick={openCreateModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Course
          </button>
        </div>

        <div className="courses-panel">
          <div className="toolbar">
            <div className="filters">
              <button
                type="button"
                className={`filter-btn${filter === 'all' ? ' active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({courses.length})
              </button>
              <button
                type="button"
                className={`filter-btn${filter === 'published' ? ' active' : ''}`}
                onClick={() => setFilter('published')}
              >
                <span className="dot published" />
                Published
              </button>
              <button
                type="button"
                className={`filter-btn${filter === 'draft' ? ' active' : ''}`}
                onClick={() => setFilter('draft')}
              >
                <span className="dot draft" />
                Draft
              </button>
            </div>

            <div className="search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search courses..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className={`sort-btn${sortAsc ? '' : ' desc'}`}
              onClick={() => setSortAsc((prev) => !prev)}
            >
              <span>{sortAsc ? 'A - Z' : 'Z - A'}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          <div className="course-grid">
            {loading ? (
              <div className="empty-state">
                <p>Loading your courses...</p>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
                <p>No courses match your filters. Click Create Course to add one.</p>
              </div>
            ) : (
              filteredCourses.map((c) => (
                <div key={c.id} className="course-card">
                  <div className="course-thumb">
                    <img
                      src={sanitizeImageSrc(c.thumb, COURSE_THUMB_FALLBACK)}
                      alt={c.alt || c.title}
                    />
                    <span className="mat-chip">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      {c.materials?.length || 0} files
                    </span>
                  </div>
                  <div className="course-info">
                    <div className="course-title">{c.title}</div>
                    <div className="course-desc">
                      {c.desc || 'No course description provided yet.'}
                    </div>
                    <div className="course-meta">
                      <span
                        className={`dot ${c.status === 'published' ? 'published' : 'draft'}`}
                      />
                      <span>{c.status === 'published' ? 'Published' : 'Draft'}</span>
                      <span>·</span>
                      <span>{c.lessons} lessons</span>
                    </div>
                  </div>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="card-action-btn primary"
                      onClick={() => openDrawer(c, 'materials')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      </svg>
                      Materials
                    </button>
                    <button
                      type="button"
                      className="card-action-btn"
                      onClick={() => openDrawer(c, 'activity')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                      Activity
                    </button>
                    <button
                      type="button"
                      className="card-action-btn"
                      onClick={() => openEditModal(c)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Create / Edit Course 3-step Modal */}
        <div
          className={`modal${modalOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          {modalOpen && (
            <div className="modal-content" role="dialog" aria-modal="true" aria-label="Course editor">
              <button
                type="button"
                className="close-btn"
                aria-label="Close modal"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
              <h2>{editingCourseId ? 'Edit Course' : 'Create New Course'}</h2>

              <div className="modal-tabs">
                <button
                  type="button"
                  className={`modal-tab${step === 1 ? ' active' : ''}`}
                  onClick={() => setStep(1)}
                >
                  1. Details
                </button>
                <button
                  type="button"
                  className={`modal-tab${step === 2 ? ' active' : ''}`}
                  onClick={() => setStep(2)}
                >
                  2. Materials ({materials.length})
                </button>
                <button
                  type="button"
                  className={`modal-tab${step === 3 ? ' active' : ''}`}
                  onClick={() => setStep(3)}
                >
                  3. Settings
                </button>
              </div>

              {step === 1 && (
                <div>
                  <label htmlFor="courseTitle">
                    Course Title <span className="req">*</span>
                  </label>
                  <input
                    id="courseTitle"
                    type="text"
                    placeholder="e.g., Full-Stack React Mastery"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />

                  <label htmlFor="courseDesc">Description</label>
                  <textarea
                    id="courseDesc"
                    rows={3}
                    placeholder="What will students learn in this course?"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                  />

                  <label>Course Thumbnail</label>
                  <div className="thumb-upload-row">
                    <div
                      className={`thumb-drop${thumbDragOver ? ' drag-over' : ''}`}
                      onClick={() => thumbInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setThumbDragOver(true);
                      }}
                      onDragLeave={() => setThumbDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setThumbDragOver(false);
                        handleThumbFiles(e.dataTransfer.files);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>Click or drop thumbnail image</span>
                    </div>
                    <input
                      ref={thumbInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => handleThumbFiles(e.target.files)}
                    />
                    <div className="thumb-preview-wrap">
                      {thumbPreview ? (
                        <img
                          src={sanitizeImageSrc(thumbPreview, COURSE_THUMB_FALLBACK)}
                          alt="Course thumbnail preview"
                        />
                      ) : (
                        <span className="thumb-placeholder-text">Preview</span>
                      )}
                    </div>
                  </div>

                  <div className="step-footer">
                    <span />
                    <button
                      type="button"
                      className="next-btn"
                      onClick={() => {
                        if (!title.trim()) {
                          showToast('Please enter a course title first', 'warn');
                          return;
                        }
                        setStep(2);
                      }}
                    >
                      Next: Materials →
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="step-hint">
                    Upload PDFs, slides, videos, or reference documents for your students.
                  </p>
                  <div
                    className={`file-drop-zone${matDragOver ? ' drag-over' : ''}`}
                    onClick={() => matInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setMatDragOver(true);
                    }}
                    onDragLeave={() => setMatDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setMatDragOver(false);
                      void handleAddModalMaterials(e.dataTransfer.files);
                    }}
                  >
                    <svg
                      className="drop-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p>Drop course files here</p>
                    <span>PDF, DOCX, PPTX, MP4, ZIP</span>
                    <button type="button" className="browse-btn">
                      Browse Files
                    </button>
                  </div>
                  <input
                    ref={matInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => void handleAddModalMaterials(e.target.files)}
                  />

                  <div className="uploaded-files-list">
                    {materials.map((m, idx) => (
                      <div key={`${m.name}-${idx}`} className="file-item">
                        <span className={`file-icon ${m.cls || 'other'}`}>{m.type}</span>
                        <span className="file-name">{m.name}</span>
                        <span className="file-size">{m.size}</span>
                        <button
                          type="button"
                          className="file-remove"
                          title="Remove file"
                          onClick={() =>
                            setMaterials((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="step-footer">
                    <button type="button" className="back-btn" onClick={() => setStep(1)}>
                      ← Back
                    </button>
                    <button type="button" className="next-btn" onClick={() => setStep(3)}>
                      Next: Settings →
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <label htmlFor="courseLessons">Total Lessons</label>
                  <input
                    id="courseLessons"
                    type="number"
                    min={1}
                    max={500}
                    value={lessons}
                    onChange={(e) => setLessons(e.target.value)}
                  />

                  <label htmlFor="courseStatus">Visibility Status</label>
                  <select
                    id="courseStatus"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value === 'draft' ? 'draft' : 'published')
                    }
                  >
                    <option value="published">Published (Visible to students)</option>
                    <option value="draft">Draft (Hidden from catalog)</option>
                  </select>

                  <label>Student Notifications</label>
                  <div className="toggle-row">
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={notify}
                        onChange={(e) => setNotify(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    <span className="toggle-label">
                      Notify enrolled students when course content updates
                    </span>
                  </div>

                  <div className="step-footer">
                    <button type="button" className="back-btn" onClick={() => setStep(2)}>
                      ← Back
                    </button>
                    <button
                      type="button"
                      className="submit-btn"
                      disabled={saving}
                      onClick={() => void handleSaveCourse()}
                    >
                      {saving
                        ? 'Saving...'
                        : editingCourseId
                          ? 'Save Changes'
                          : 'Create Course'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Slide-Over Materials & Student Activity Drawer */}
        <div
          className={`drawer-backdrop${drawerCourse ? ' open' : ''}`}
          onClick={() => setDrawerCourse(null)}
        />
        <aside className={`drawer${drawerCourse ? ' open' : ''}`} aria-label="Course details">
          {drawerCourse && (
            <div className="drawer-inner">
              <div className="drawer-header">
                <h3>{drawerCourse.title}</h3>
                <button
                  type="button"
                  className="close-btn"
                  aria-label="Close drawer"
                  onClick={() => setDrawerCourse(null)}
                >
                  ×
                </button>
              </div>
              <div className="drawer-subtitle">
                {drawerCourse.lessons} lessons ·{' '}
                {drawerCourse.status === 'published' ? 'Published' : 'Draft'}
              </div>

              <div className="drawer-tabs">
                <button
                  type="button"
                  className={`drawer-tab${drawerTab === 'materials' ? ' active' : ''}`}
                  onClick={() => setDrawerTab('materials')}
                >
                  Materials ({drawerCourse.materials?.length || 0})
                </button>
                <button
                  type="button"
                  className={`drawer-tab${drawerTab === 'activity' ? ' active' : ''}`}
                  onClick={() => setDrawerTab('activity')}
                >
                  Student Activity
                </button>
              </div>

              <div className="drawer-tab-pane">
                {drawerTab === 'materials' ? (
                  <>
                    <div className="drawer-upload-bar">
                      <button
                        type="button"
                        className="drawer-upload-btn"
                        onClick={() => drawerMatInputRef.current?.click()}
                      >
                        + Add Materials
                      </button>
                      <input
                        ref={drawerMatInputRef}
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => void handleDrawerAddMaterials(e.target.files)}
                      />
                    </div>

                    {(drawerCourse.materials || []).length === 0 ? (
                      <div className="activity-empty">
                        No materials attached yet. Click Add Materials above.
                      </div>
                    ) : (
                      <div className="drawer-files">
                        {(drawerCourse.materials || []).map((m, idx) => (
                          <div key={`${m.name}-${idx}`} className="file-item">
                            <span className={`file-icon ${m.cls || 'other'}`}>{m.type}</span>
                            <span className="file-name">{m.name}</span>
                            <span className="file-size">{m.size}</span>
                            <button
                              type="button"
                              className="file-remove"
                              title="Delete material"
                              onClick={() => void handleDrawerRemoveMaterial(idx)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : loadingActivity ? (
                  <div className="activity-empty">Loading student activity...</div>
                ) : courseActivity.length === 0 ? (
                  <div className="activity-empty">
                    No student enrollments or material views recorded for this course yet.
                  </div>
                ) : (
                  <div className="activity-list">
                    {courseActivity.map((item) => (
                      <div key={item.id} className="activity-item">
                        <img
                          src={sanitizeImageSrc(
                            item.studentAvatar,
                            initialsAvatar(item.studentName)
                          )}
                          alt={item.studentName}
                        />
                        <div className="activity-body">
                          <strong>{item.studentName}</strong>
                          <p>{item.message}</p>
                          <span className="at">{relativeTime(item.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </InstructorLayout>
  );
};

export default InstructorCoursesPage;
