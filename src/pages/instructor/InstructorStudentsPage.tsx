import React, { useEffect, useMemo, useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import type { User as FirebaseUser } from 'firebase/auth';
import { ConfirmModal } from '../../components/ConfirmModal';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  getCourses,
  getStudentProfileDetail,
  getStudentsForInstructor,
  persistInviteRecord,
} from '../../services/dataService';
import {
  createInstantMeetSpace,
  createMeetClass,
  deleteMeetClass,
  GoogleWorkspaceError,
  googleSignIn,
  initAuth,
  listUpcomingClasses,
  logout as googleLogout,
  updateMeetClass,
} from '../../services/googleWorkspaceService';
import type {
  CalendarClassEvent,
  Course,
  StudentEnrollmentRow,
  StudentProfileDetail,
} from '../../types';
import {
  avatarColor,
  capitalize,
  formatDate,
  formatDateShort,
  gradeColor,
  initials,
  sanitizeImageSrc,
  sanitizeUrl,
} from '../../utils/formatters';

const EJS_KEY = 'YRtV6OjHqgCt9kEUR';
const EJS_SERVICE = 'service_f4dl4md';
const EJS_TEMPLATE = 'template_t02zlfa';
const SENDER_NAME = 'CHIME VICTOR CHINAGOROM';
const SENDER_EMAIL = 'victrends365@gmail.com';
const PER_PAGE = 8;

type SortCol = 'name' | 'courses' | 'grade' | 'status' | 'date';

function toLocalDateInput(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalTimeInput(iso: string | undefined, fallback = '10:00'): string {
  if (!iso || !iso.includes('T')) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatEventTimeRange(startIso: string, endIso: string): string {
  if (!startIso) return 'Time TBD';
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return startIso;
  const datePart = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (!startIso.includes('T')) return `${datePart} (All day)`;
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const end = endIso ? new Date(endIso) : null;
  const endTime =
    end && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
  return `${datePart} · ${startTime}${endTime ? ` – ${endTime}` : ''}`;
}

const InstructorStudentsPage: React.FC = () => {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  // Directory State
  const [students, setStudents] = useState<StudentEnrollmentRow[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'at-risk' | 'inactive'>('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortAsc, setSortAsc] = useState(true);

  // Student Profile Modal
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedStudentSummary, setSelectedStudentSummary] =
    useState<StudentEnrollmentRow | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentProfileDetail | null>(null);

  // Google Workspace (Calendar + Meet) State
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [upcomingClasses, setUpcomingClasses] = useState<CalendarClassEvent[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [instantMeetUrl, setInstantMeetUrl] = useState('');
  const [creatingInstantMeet, setCreatingInstantMeet] = useState(false);
  const [instantCopied, setInstantCopied] = useState(false);

  // Schedule / Edit Class Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarClassEvent | null>(null);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedCourseId, setSchedCourseId] = useState('');
  const [schedDate, setSchedDate] = useState(() => toLocalDateInput(undefined));
  const [schedStartTime, setSchedStartTime] = useState('10:00');
  const [schedEndTime, setSchedEndTime] = useState('11:00');
  const [schedSelectedIds, setSchedSelectedIds] = useState<string[]>([]);
  const [schedDesc, setSchedDesc] = useState('');
  const [schedIncludeMeet, setSchedIncludeMeet] = useState(true);
  const [schedSaving, setSchedSaving] = useState(false);

  // Confirm Modal State for mutating/deleting Calendar events
  const [pendingCalendarConfirm, setPendingCalendarConfirm] = useState<
    | { type: 'delete'; event: CalendarClassEvent }
    | {
        type: 'update';
        event: CalendarClassEvent;
        payload: {
          title: string;
          description: string;
          startIso: string;
          endIso: string;
          attendees: string[];
          courseTitle: string;
        };
      }
    | null
  >(null);

  // Invite Students Modal State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteTab, setInviteTab] = useState<'email' | 'link'>('email');
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [inviteCourseIds, setInviteCourseIds] = useState<string[]>([]);
  const [inviteMessage, setInviteMessage] = useState('');
  const [invitePhase, setInvitePhase] = useState<'compose' | 'sending' | 'done'>('compose');
  const [inviteStatuses, setInviteStatuses] = useState<
    Record<string, 'pending' | 'sending' | 'sent' | 'failed'>
  >({});
  const [inviteSentCount, setInviteSentCount] = useState(0);
  const [inviteToken, setInviteToken] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  );
  const [linkCopied, setLinkCopied] = useState(false);

  const chipInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    emailjs.init({ publicKey: EJS_KEY });
  }, []);

  const fetchClasses = async () => {
    setClassesLoading(true);
    try {
      const items = await listUpcomingClasses({ maxResults: 25 });
      setUpcomingClasses(items);
    } catch (err) {
      if (err instanceof GoogleWorkspaceError && (err.code === 'AUTH_REQUIRED' || err.code === 'AUTH_EXPIRED')) {
        setGoogleToken(null);
      } else {
        console.error('Could not load Google Calendar classes:', err);
        showToast('Could not load upcoming Google Calendar classes', 'error');
      }
    } finally {
      setClassesLoading(false);
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void initAuth(
      (gUser, token) => {
        setGoogleUser(gUser);
        setGoogleToken(token);
        void fetchClasses();
      },
      (gUser) => {
        setGoogleUser(gUser);
        setGoogleToken(null);
        setUpcomingClasses([]);
      }
    ).then((unsub) => {
      cleanup = unsub;
    });
    return () => {
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [sList, cList] = await Promise.all([
          getStudentsForInstructor(user.uid),
          getCourses(user.uid),
        ]);
        if (!active) return;
        setStudents(sList);
        setCourses(cList);
      } catch (err) {
        console.error('Could not load students:', err);
        if (active) showToast('Failed to load student directory', 'error');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = students.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (courseFilter !== 'all' && !s.courseIds.includes(courseFilter)) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q) &&
        !s.courseTitles.some((t) => t.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortCol === 'courses') cmp = a.courseIds.length - b.courseIds.length;
      else if (sortCol === 'grade') cmp = (a.grade ?? -1) - (b.grade ?? -1);
      else if (sortCol === 'status') cmp = a.status.localeCompare(b.status);
      else cmp = (a.enrolledAt || '').localeCompare(b.enrolledAt || '');
      return sortAsc ? cmp : -cmp;
    });
  }, [students, search, statusFilter, courseFilter, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filteredStudents.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const avgGrade = useMemo(() => {
    const grades = students.map((s) => s.grade).filter((g): g is number => g !== null);
    if (!grades.length) return null;
    return Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
  }, [students]);

  const activeStudentsCount = students.filter((s) => s.status === 'active').length;

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortAsc((p) => !p);
    else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  // Open Student Profile Modal
  const handleOpenProfile = async (s: StudentEnrollmentRow) => {
    if (!user?.uid) return;
    setSelectedStudentSummary(s);
    setStudentDetail(null);
    setProfileModalOpen(true);
    setProfileLoading(true);
    try {
      const detail = await getStudentProfileDetail(user.uid, s.id, {
        grade: s.grade,
        enrolledAt: s.enrolledAt,
        status: s.status,
      });
      setStudentDetail(detail);
    } catch (err) {
      console.error('Could not load student profile detail:', err);
      showToast('Failed to load full student profile', 'error');
    } finally {
      setProfileLoading(false);
    }
  };

  // Google Workspace Actions
  const handleGoogleConnect = async () => {
    setGoogleSigningIn(true);
    try {
      const { user: gUser, accessToken } = await googleSignIn();
      setGoogleUser(gUser);
      setGoogleToken(accessToken);
      showToast(`Connected as ${gUser.email || 'Google account'}`, 'success');
      await fetchClasses();
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      showToast('Google Sign-In was cancelled or blocked by popup blocker', 'warn');
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await googleLogout();
      setGoogleUser(null);
      setGoogleToken(null);
      setUpcomingClasses([]);
      setInstantMeetUrl('');
      showToast('Disconnected Google Workspace account', 'info');
    } catch (err) {
      console.error('Google logout error:', err);
      showToast('Could not disconnect Google account', 'error');
    }
  };

  const handleCreateInstantMeet = async () => {
    if (!googleToken) {
      showToast('Connect your Google account first to launch an instant Meet', 'warn');
      return;
    }
    setCreatingInstantMeet(true);
    setInstantCopied(false);
    try {
      const space = await createInstantMeetSpace();
      const clean = sanitizeUrl(space.meetingUri);
      if (!clean) throw new Error('No meeting URI returned');
      setInstantMeetUrl(clean);
      showToast('Instant Google Meet room created!', 'success');
    } catch (err) {
      console.error('Create Instant Meet failed:', err);
      showToast('Could not create Google Meet space', 'error');
    } finally {
      setCreatingInstantMeet(false);
    }
  };

  const openScheduleModal = (preselectedStudentId?: string, eventToEdit?: CalendarClassEvent) => {
    if (eventToEdit) {
      setEditingEvent(eventToEdit);
      setSchedTitle(eventToEdit.title || '');
      setSchedCourseId('');
      setSchedDate(toLocalDateInput(eventToEdit.start));
      setSchedStartTime(toLocalTimeInput(eventToEdit.start, '10:00'));
      setSchedEndTime(toLocalTimeInput(eventToEdit.end, '11:00'));
      const attendeeEmails = new Set(
        (eventToEdit.attendees || []).map((a) => a.email.toLowerCase())
      );
      setSchedSelectedIds(
        students.filter((s) => s.email && attendeeEmails.has(s.email.toLowerCase())).map((s) => s.id)
      );
      setSchedDesc(eventToEdit.description || '');
      setSchedIncludeMeet(Boolean(eventToEdit.meetUrl));
    } else {
      setEditingEvent(null);
      const targetStudent = preselectedStudentId
        ? students.find((s) => s.id === preselectedStudentId)
        : null;
      setSchedTitle(targetStudent ? `1:1 Coaching Session with ${targetStudent.name}` : '');
      setSchedCourseId(
        targetStudent?.courseIds[0] || courses[0]?.id || ''
      );
      setSchedDate(toLocalDateInput(undefined));
      setSchedStartTime('10:00');
      setSchedEndTime('11:00');
      setSchedSelectedIds(preselectedStudentId ? [preselectedStudentId] : []);
      setSchedDesc('');
      setSchedIncludeMeet(true);
    }
    setScheduleModalOpen(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleToken) {
      showToast('Sign in with Google first to save classes to Google Calendar', 'warn');
      return;
    }
    if (!schedTitle.trim() || !schedDate || !schedStartTime || !schedEndTime) {
      showToast('Please complete class title, date, and start/end time', 'warn');
      return;
    }

    const startDt = new Date(`${schedDate}T${schedStartTime}:00`);
    const endDt = new Date(`${schedDate}T${schedEndTime}:00`);
    if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime()) || endDt <= startDt) {
      showToast('End time must be after start time', 'warn');
      return;
    }

    const attendeeEmails = students
      .filter((s) => schedSelectedIds.includes(s.id) && s.email)
      .map((s) => s.email);
    const courseTitle = courses.find((c) => c.id === schedCourseId)?.title || '';

    if (editingEvent) {
      // Prompt user with confirmation before updating an existing Google Calendar event
      setPendingCalendarConfirm({
        type: 'update',
        event: editingEvent,
        payload: {
          title: schedTitle.trim(),
          description: schedDesc.trim(),
          startIso: startDt.toISOString(),
          endIso: endDt.toISOString(),
          attendees: attendeeEmails,
          courseTitle,
        },
      });
      return;
    }

    setSchedSaving(true);
    try {
      await createMeetClass({
        title: schedTitle.trim(),
        description: schedDesc.trim(),
        startIso: startDt.toISOString(),
        endIso: endDt.toISOString(),
        attendees: attendeeEmails,
        includeMeet: schedIncludeMeet,
        courseTitle,
      });
      showToast('Class scheduled on Google Calendar with Google Meet!', 'success');
      setScheduleModalOpen(false);
      await fetchClasses();
    } catch (err) {
      console.error('Schedule class error:', err);
      showToast('Could not create Google Calendar event', 'error');
    } finally {
      setSchedSaving(false);
    }
  };

  const handleConfirmCalendarMutation = async () => {
    if (!pendingCalendarConfirm) return;
    const action = pendingCalendarConfirm;
    setPendingCalendarConfirm(null);
    setSchedSaving(true);
    try {
      if (action.type === 'delete') {
        await deleteMeetClass(action.event.id, {
          hasAttendees: Boolean(action.event.attendees?.length),
        });
        showToast(`Cancelled "${action.event.title}" on Google Calendar`, 'info');
        await fetchClasses();
      } else {
        await updateMeetClass(action.event.id, action.payload);
        showToast(`Updated "${action.payload.title}" on Google Calendar`, 'success');
        setScheduleModalOpen(false);
        await fetchClasses();
      }
    } catch (err) {
      console.error('Google Calendar update/delete failed:', err);
      showToast('Google Calendar action failed', 'error');
    } finally {
      setSchedSaving(false);
    }
  };

  // Invite Modal Helpers
  const addEmailChip = (raw: string) => {
    const clean = raw.trim().replace(/,$/, '');
    if (!clean) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      showToast(`"${clean}" is not a valid email address`, 'warn');
      return;
    }
    if (!inviteEmails.includes(clean)) {
      setInviteEmails((prev) => [...prev, clean]);
    }
    setEmailInput('');
  };

  const openInviteModal = () => {
    setInviteTab('email');
    setInvitePhase('compose');
    setInviteEmails([]);
    setEmailInput('');
    setInviteCourseIds(courses.length ? [courses[0].id] : []);
    setInviteMessage('');
    setInviteStatuses({});
    setLinkCopied(false);
    setInviteToken(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 14)
    );
    setInviteOpen(true);
  };

  const shareInviteLink = useMemo(() => {
    const uid = user?.uid || '';
    return `${window.location.origin}/register?invite=${inviteToken}&courses=${inviteCourseIds.join(',')}&instructor=${uid}`;
  }, [inviteToken, inviteCourseIds, user?.uid]);

  const handleSendInvites = async () => {
    if (!user?.uid) return;
    if (emailInput.trim()) {
      addEmailChip(emailInput);
    }
    const recipients = [...inviteEmails];
    if (!recipients.length) {
      showToast('Add at least one student email address', 'warn');
      return;
    }

    setInvitePhase('sending');
    const statusMap: Record<string, 'pending' | 'sending' | 'sent' | 'failed'> = {};
    recipients.forEach((em) => {
      statusMap[em] = 'pending';
    });
    setInviteStatuses({ ...statusMap });

    let successCount = 0;
    const selectedCourseNames = courses
      .filter((c) => inviteCourseIds.includes(c.id))
      .map((c) => c.title)
      .join(', ');

    for (const recipientEmail of recipients) {
      setInviteStatuses((prev) => ({ ...prev, [recipientEmail]: 'sending' }));
      const token =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 12)
          : Math.random().toString(36).slice(2, 14);
      const personalLink = `${window.location.origin}/register?invite=${token}&email=${encodeURIComponent(
        recipientEmail
      )}&courses=${inviteCourseIds.join(',')}&instructor=${user.uid}`;

      try {
        await persistInviteRecord({
          token,
          instructorId: user.uid,
          email: recipientEmail,
          courseIds: inviteCourseIds,
          message: inviteMessage.trim() || null,
        });

        await emailjs.send(EJS_SERVICE, EJS_TEMPLATE, {
          to_email: recipientEmail,
          from_name: profile?.fullName || SENDER_NAME,
          from_email: user.email || SENDER_EMAIL,
          course_names: selectedCourseNames || 'Talent Flow Courses',
          custom_message:
            inviteMessage.trim() || 'You have been invited to join my class on Talent Flow!',
          invite_link: personalLink,
        });

        setInviteStatuses((prev) => ({ ...prev, [recipientEmail]: 'sent' }));
        successCount += 1;
      } catch (err) {
        console.error(`Failed inviting ${recipientEmail}:`, err);
        setInviteStatuses((prev) => ({ ...prev, [recipientEmail]: 'failed' }));
      }
    }

    setInviteSentCount(successCount);
    setInvitePhase('done');
  };

  const handleCopyInviteLink = async () => {
    if (user?.uid) {
      await persistInviteRecord({
        token: inviteToken,
        instructorId: user.uid,
        email: null,
        courseIds: inviteCourseIds,
        message: inviteMessage.trim() || null,
      });
    }
    try {
      await navigator.clipboard.writeText(shareInviteLink);
      setLinkCopied(true);
      showToast('Invite link copied to clipboard', 'success');
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      showToast('Could not copy invite link automatically', 'warn');
    }
  };

  const tzLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';

  return (
    <InstructorLayout breadcrumbLabel="Students">
      <div className="tf-inst-students">
        {/* Page Header */}
        <div className="page-header">
          <div className="header-text">
            <h1>Students</h1>
            <p className="page-sub">
              Manage learners, inspect student profiles, and schedule live classes with Google Meet.
            </p>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="btn-meet"
              disabled={creatingInstantMeet}
              onClick={() => {
                if (!googleToken) {
                  void handleGoogleConnect();
                } else {
                  void handleCreateInstantMeet();
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              {creatingInstantMeet ? 'Creating Meet...' : 'Instant Google Meet'}
            </button>

            <button
              type="button"
              className="btn-secondary-outline"
              onClick={() => openScheduleModal()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Schedule Class
            </button>

            <button type="button" className="btn-primary" onClick={openInviteModal}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Invite Students
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="stat-cards">
          <div
            className="stat-card"
            style={{ '--accent': '#2563EB', '--accent-l': '#EFF6FF' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#2563EB' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
              </div>
              <span className="card-badge neutral">Roster</span>
            </div>
            <div className="card-value">{loading ? '—' : students.length}</div>
            <div className="card-label">Total Students</div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#16A34A', '--accent-l': '#F0FDF4' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#16A34A' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="card-badge up">Good standing</span>
            </div>
            <div className="card-value">{loading ? '—' : activeStudentsCount}</div>
            <div className="card-label">Active Learners</div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#7C3AED', '--accent-l': '#F5F3FF' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#7C3AED' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="card-badge neutral">Class Avg</span>
            </div>
            <div className="card-value">
              {loading ? '—' : avgGrade !== null ? `${avgGrade}%` : 'N/A'}
            </div>
            <div className="card-label">Average Grade</div>
          </div>

          <div
            className="stat-card"
            style={{ '--accent': '#0F9D58', '--accent-l': '#E6F4EA' } as React.CSSProperties}
          >
            <div className="card-top">
              <div className="card-icon" style={{ color: '#0F9D58' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <span className="card-badge neutral">Live Sessions</span>
            </div>
            <div className="card-value">{googleToken ? upcomingClasses.length : courses.length}</div>
            <div className="card-label">
              {googleToken ? 'Upcoming Classes' : 'Active Courses'}
            </div>
          </div>
        </div>

        {/* Google Meet & Calendar Section */}
        <section className="meet-section">
          <div className="meet-section-head">
            <div className="meet-title-wrap">
              <div className="meet-badge-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </div>
              <div>
                <h2>Google Meet &amp; Calendar Classes</h2>
                <p className="meet-sub">
                  Schedule live video sessions, invite enrolled students, and launch instant rooms.
                </p>
              </div>
            </div>

            <div className="meet-head-actions">
              {googleToken && googleUser ? (
                <>
                  <div className="meet-account-pill">
                    <span className="meet-account-dot" />
                    <span>{googleUser.email || googleUser.displayName || 'Google Connected'}</span>
                    <button
                      type="button"
                      className="meet-disconnect-btn"
                      onClick={() => void handleGoogleDisconnect()}
                    >
                      Disconnect
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary-outline"
                    onClick={() => void fetchClasses()}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openScheduleModal()}
                  >
                    + Schedule Class
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="gsi-material-button"
                  disabled={googleSigningIn}
                  onClick={() => void handleGoogleConnect()}
                >
                  <span className="gsi-material-button-content-wrapper">
                    <img
                      className="gsi-material-button-icon"
                      src="/icons8-google-48.png"
                      alt=""
                    />
                    <span className="gsi-material-button-contents">
                      {googleSigningIn ? 'Connecting...' : 'Sign in with Google'}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {!googleToken && (
            <div className="meet-auth-gate">
              <div className="meet-auth-copy">
                <h3>Connect Google Calendar &amp; Meet</h3>
                <p>
                  Sign in with your Google Workspace account to view upcoming scheduled classes,
                  auto-generate Google Meet links with student invites, or open an instant class room.
                </p>
              </div>
              <button
                type="button"
                className="gsi-material-button"
                disabled={googleSigningIn}
                onClick={() => void handleGoogleConnect()}
              >
                <span className="gsi-material-button-content-wrapper">
                  <img
                    className="gsi-material-button-icon"
                    src="/icons8-google-48.png"
                    alt=""
                  />
                  <span className="gsi-material-button-contents">
                    {googleSigningIn ? 'Connecting...' : 'Connect Google Calendar'}
                  </span>
                </span>
              </button>
            </div>
          )}

          {instantMeetUrl && (
            <div className="meet-instant-banner">
              <div className="meet-instant-info">
                <span className="meet-instant-label">Instant Google Meet Ready</span>
                <span className="meet-instant-url">{instantMeetUrl}</span>
              </div>
              <div className="meet-instant-actions">
                <button
                  type="button"
                  className="btn-sm-outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(instantMeetUrl);
                    setInstantCopied(true);
                    showToast('Meet URL copied', 'success');
                  }}
                >
                  {instantCopied ? 'Copied!' : 'Copy Link'}
                </button>
                <a
                  href={sanitizeUrl(instantMeetUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-sm-primary meet-join"
                >
                  Join Meet ↗
                </a>
              </div>
            </div>
          )}

          {googleToken && (
            <div className="meet-classes-wrap">
              {classesLoading ? (
                <div className="meet-classes-loading">
                  <span className="send-spinner" />
                  <span>Loading upcoming Google Calendar events...</span>
                </div>
              ) : upcomingClasses.length === 0 ? (
                <div className="meet-classes-empty">
                  <p>No upcoming classes scheduled on your primary Google Calendar.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openScheduleModal()}
                  >
                    Schedule Your First Class
                  </button>
                </div>
              ) : (
                <div className="meet-classes-list">
                  {upcomingClasses.map((ev) => (
                    <div key={ev.id} className="meet-class-card">
                      <div className="mcc-top">
                        <div className="mcc-title">{ev.title}</div>
                        <span className={`mcc-badge${ev.meetUrl ? '' : ' calendar-only'}`}>
                          {ev.meetUrl ? 'Google Meet' : 'Calendar Event'}
                        </span>
                      </div>
                      <div className="mcc-time">{formatEventTimeRange(ev.start, ev.end)}</div>
                      {ev.description && <div className="mcc-desc">{ev.description}</div>}
                      <div className="mcc-meta">
                        {ev.attendees.length
                          ? `${ev.attendees.length} student attendee${ev.attendees.length === 1 ? '' : 's'}`
                          : 'No attendees invited'}
                      </div>
                      <div className="mcc-actions">
                        {ev.meetUrl && sanitizeUrl(ev.meetUrl) && (
                          <a
                            href={sanitizeUrl(ev.meetUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-sm-primary meet-join"
                          >
                            Join Meet ↗
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn-sm-outline"
                          onClick={() => openScheduleModal(undefined, ev)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-sm-outline danger"
                          onClick={() => setPendingCalendarConfirm({ type: 'delete', event: ev })}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Directory Toolbar */}
        <div className="toolbar">
          <div className="search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search student name, email, or course..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="filter-select"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'at-risk' | 'inactive');
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="at-risk">At Risk</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            className="filter-select"
            aria-label="Filter by course"
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <div className="toolbar-right">
            <button
              type="button"
              className={`view-btn${viewMode === 'table' ? ' active' : ''}`}
              title="Table View"
              onClick={() => setViewMode('table')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              className={`view-btn${viewMode === 'grid' ? ' active' : ''}`}
              title="Grid View"
              onClick={() => setViewMode('grid')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Directory Listing */}
        {loading ? (
          <div className="students-table-wrap">
            <div className="empty-state">
              <h3>Loading students...</h3>
            </div>
          </div>
        ) : pagedStudents.length === 0 ? (
          <div className="students-table-wrap">
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <h3>No students found</h3>
              <p>Invite students to join your courses or adjust your filters.</p>
            </div>
          </div>
        ) : viewMode === 'table' ? (
          <div className="students-table-wrap">
            <div className="table-head">
              <button type="button" className="th" onClick={() => handleSort('name')}>
                Student {sortCol === 'name' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button type="button" className="th" onClick={() => handleSort('courses')}>
                Courses {sortCol === 'courses' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button type="button" className="th" onClick={() => handleSort('grade')}>
                Grade {sortCol === 'grade' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button type="button" className="th" onClick={() => handleSort('status')}>
                Status {sortCol === 'status' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <button type="button" className="th" onClick={() => handleSort('date')}>
                Enrolled {sortCol === 'date' ? (sortAsc ? '↑' : '↓') : ''}
              </button>
              <span className="th" style={{ justifyContent: 'flex-end', cursor: 'default' }}>
                Actions
              </span>
            </div>

            {pagedStudents.map((s) => (
              <div key={s.id} className="student-row">
                <div
                  className="sr-student clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleOpenProfile(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') void handleOpenProfile(s);
                  }}
                >
                  {s.avatar ? (
                    <img
                      src={sanitizeImageSrc(s.avatar, '')}
                      alt={s.name}
                      className="sr-avatar"
                    />
                  ) : (
                    <div
                      className="sr-avatar-initials"
                      style={{ background: avatarColor(s.name) }}
                    >
                      {initials(s.name)}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="sr-name">{s.name}</div>
                    <div className="sr-email">{s.email || 'Enrolled Learner'}</div>
                  </div>
                </div>

                <div className="sr-courses">
                  {s.courseIds.length} course{s.courseIds.length === 1 ? '' : 's'}
                  <span>{s.courseTitles.join(', ')}</span>
                </div>

                <div
                  className="sr-grade"
                  style={{ color: s.grade !== null ? gradeColor(s.grade) : '#94A3B8' }}
                >
                  {s.grade !== null ? `${s.grade}%` : '—'}
                </div>

                <div>
                  <span className={`status-pill ${s.status}`}>
                    {s.status === 'at-risk' ? 'At Risk' : capitalize(s.status)}
                  </span>
                </div>

                <div className="sr-last">
                  {s.enrolledAt ? formatDateShort(s.enrolledAt) : '—'}
                </div>

                <div className="sr-actions">
                  <button
                    type="button"
                    className="action-btn"
                    title="View student profile"
                    onClick={() => void handleOpenProfile(s)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    title="Schedule 1:1 Google Meet"
                    onClick={() => openScheduleModal(s.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {totalPages > 1 && (
              <div className="pagination">
                <span className="page-info">
                  Showing {(safePage - 1) * PER_PAGE + 1}–
                  {Math.min(safePage * PER_PAGE, filteredStudents.length)} of{' '}
                  {filteredStudents.length} students
                </span>
                <div className="page-btns">
                  <button
                    type="button"
                    className="page-btn"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                    <button
                      key={pNum}
                      type="button"
                      className={`page-btn${pNum === safePage ? ' active' : ''}`}
                      onClick={() => setPage(pNum)}
                    >
                      {pNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="page-btn"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="students-grid">
              {pagedStudents.map((s) => (
                <div key={s.id} className="student-card">
                  <div
                    className="sc-top clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleOpenProfile(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') void handleOpenProfile(s);
                    }}
                  >
                    {s.avatar ? (
                      <img
                        src={sanitizeImageSrc(s.avatar, '')}
                        alt={s.name}
                        className="sr-avatar"
                      />
                    ) : (
                      <div
                        className="sr-avatar-initials"
                        style={{ background: avatarColor(s.name) }}
                      >
                        {initials(s.name)}
                      </div>
                    )}
                    <div className="sc-info">
                      <div className="sc-name">{s.name}</div>
                      <div className="sc-email">{s.email || 'Enrolled Learner'}</div>
                    </div>
                  </div>
                  <div className="sc-stats">
                    <div className="sc-stat">
                      <div className="sc-stat-val">{s.courseIds.length}</div>
                      <div className="sc-stat-lbl">Courses</div>
                    </div>
                    <div className="sc-stat">
                      <div
                        className="sc-stat-val"
                        style={{ color: s.grade !== null ? gradeColor(s.grade) : '#94A3B8' }}
                      >
                        {s.grade !== null ? `${s.grade}%` : '—'}
                      </div>
                      <div className="sc-stat-lbl">Grade</div>
                    </div>
                    <div className="sc-stat">
                      <div className="sc-stat-val">
                        {s.enrolledAt ? formatDateShort(s.enrolledAt) : '—'}
                      </div>
                      <div className="sc-stat-lbl">Enrolled</div>
                    </div>
                  </div>
                  <div className="sc-footer">
                    <span className={`status-pill ${s.status}`}>
                      {s.status === 'at-risk' ? 'At Risk' : capitalize(s.status)}
                    </span>
                    <div className="sr-actions">
                      <button
                        type="button"
                        className="action-btn"
                        title="View student profile"
                        onClick={() => void handleOpenProfile(s)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        title="Schedule 1:1 Google Meet"
                        onClick={() => openScheduleModal(s.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <span className="page-info">
                  Page {safePage} of {totalPages}
                </span>
                <div className="page-btns">
                  <button
                    type="button"
                    className="page-btn"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="page-btn"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Student Profile Modal */}
        <div
          className={`modal-overlay${profileModalOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileModalOpen(false);
          }}
        >
          {profileModalOpen && (
            <div className="modal profile-modal" role="dialog" aria-modal="true" aria-label="Student profile">
              <div className="sp-banner">
                <button
                  type="button"
                  className="modal-close sp-close"
                  aria-label="Close student profile"
                  onClick={() => setProfileModalOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {profileLoading || !studentDetail ? (
                <div className="sp-loading">
                  <span className="send-spinner" />
                  <span>
                    Loading {selectedStudentSummary?.name || 'student'}&apos;s profile...
                  </span>
                </div>
              ) : (
                <>
                  <div className="sp-body">
                    <div className="sp-top">
                      <div className="sp-avatar-wrap">
                        {studentDetail.avatar ? (
                          <img
                            src={sanitizeImageSrc(studentDetail.avatar, '')}
                            alt={studentDetail.fullName}
                          />
                        ) : (
                          <div
                            className="sp-avatar-initials"
                            style={{ background: avatarColor(studentDetail.fullName) }}
                          >
                            {initials(studentDetail.fullName)}
                          </div>
                        )}
                      </div>
                      <div className="sp-identity">
                        <div className="sp-name-row">
                          <h2>{studentDetail.fullName}</h2>
                          <span className={`status-pill ${studentDetail.status}`}>
                            {studentDetail.status === 'at-risk'
                              ? 'At Risk'
                              : capitalize(studentDetail.status)}
                          </span>
                        </div>
                        <div className="sp-subtitle">
                          {studentDetail.email || 'Enrolled Talent Flow Learner'}
                        </div>
                      </div>
                    </div>

                    {studentDetail.bio && <p className="sp-bio">{studentDetail.bio}</p>}

                    <div className="sp-meta-grid">
                      <div className="sp-meta-item">
                        <span className="sp-meta-label">Education Level</span>
                        <span className="sp-meta-val">
                          {studentDetail.educationLevel || 'Not specified'}
                        </span>
                      </div>
                      <div className="sp-meta-item">
                        <span className="sp-meta-label">Field of Study</span>
                        <span className="sp-meta-val">
                          {studentDetail.fieldOfStudy || 'Not specified'}
                        </span>
                      </div>
                      <div className="sp-meta-item">
                        <span className="sp-meta-label">Average Grade</span>
                        <span
                          className="sp-meta-val"
                          style={{
                            color:
                              studentDetail.avgGrade !== null
                                ? gradeColor(studentDetail.avgGrade)
                                : '#64748B',
                          }}
                        >
                          {studentDetail.avgGrade !== null ? `${studentDetail.avgGrade}%` : 'No grades yet'}
                        </span>
                      </div>
                      <div className="sp-meta-item">
                        <span className="sp-meta-label">First Enrolled</span>
                        <span className="sp-meta-val">
                          {studentDetail.enrolledAt ? formatDate(studentDetail.enrolledAt) : '—'}
                        </span>
                      </div>
                    </div>

                    {studentDetail.goals && (
                      <div className="sp-section">
                        <h3>Learning Goals</h3>
                        <p className="sp-text">{studentDetail.goals}</p>
                      </div>
                    )}

                    {studentDetail.interests && (
                      <div className="sp-section">
                        <h3>Interests</h3>
                        <div className="sp-tags">
                          {studentDetail.interests
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <span key={tag} className="sp-tag">
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {(sanitizeUrl(studentDetail.linkedin) || sanitizeUrl(studentDetail.github)) && (
                      <div className="sp-section">
                        <h3>Profiles &amp; Links</h3>
                        <div className="sp-links">
                          {sanitizeUrl(studentDetail.linkedin) && (
                            <a
                              href={sanitizeUrl(studentDetail.linkedin)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sp-link-btn"
                            >
                              LinkedIn ↗
                            </a>
                          )}
                          {sanitizeUrl(studentDetail.github) && (
                            <a
                              href={sanitizeUrl(studentDetail.github)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="sp-link-btn"
                            >
                              GitHub ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="sp-section">
                      <h3>Enrolled Courses ({studentDetail.enrolledCourses.length})</h3>
                      {studentDetail.enrolledCourses.length === 0 ? (
                        <p className="sp-empty-note">Not enrolled in any of your courses.</p>
                      ) : (
                        <div className="sp-courses-list">
                          {studentDetail.enrolledCourses.map((ec) => (
                            <div key={ec.id} className="sp-course-row">
                              <div>
                                <div className="sp-course-title">{ec.title}</div>
                                <div className="sp-course-sub">{ec.lessons} lessons</div>
                              </div>
                              <div className="sp-progress-wrap">
                                <div className="sp-progress-bar">
                                  <div
                                    className="sp-progress-fill"
                                    style={{ width: `${Math.min(100, ec.progress)}%` }}
                                  />
                                </div>
                                <span className="sp-progress-pct">{ec.progress}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="sp-section">
                      <h3>Assignments ({studentDetail.assignments.length})</h3>
                      {studentDetail.assignments.length === 0 ? (
                        <p className="sp-empty-note">No assignments assigned yet.</p>
                      ) : (
                        <div className="sp-assignments-list">
                          {studentDetail.assignments.map((asgn) => (
                            <div key={asgn.id} className="sp-assign-row">
                              <div>
                                <div className="sp-course-title">{asgn.title}</div>
                                <div className="sp-course-sub">
                                  {asgn.course} · Due{' '}
                                  {asgn.dueDate ? formatDateShort(asgn.dueDate) : 'N/A'}
                                </div>
                              </div>
                              <span
                                className={`status-pill ${
                                  asgn.status === 'graded'
                                    ? 'active'
                                    : asgn.status === 'submitted'
                                      ? 'at-risk'
                                      : 'inactive'
                                }`}
                              >
                                {asgn.status === 'graded'
                                  ? `${asgn.score}/${asgn.maxScore}`
                                  : capitalize(asgn.status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="modal-divider" />
                  <div className="modal-foot">
                    <span className="invited-as">
                      {studentDetail.email || 'Student Profile'}
                    </span>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn-modal-cancel"
                        onClick={() => setProfileModalOpen(false)}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="btn-meet"
                        onClick={() => {
                          const targetId = studentDetail.id;
                          setProfileModalOpen(false);
                          openScheduleModal(targetId);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" />
                        </svg>
                        Schedule 1:1 Google Meet
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Schedule / Edit Class Modal */}
        <div
          className={`modal-overlay${scheduleModalOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setScheduleModalOpen(false);
          }}
        >
          {scheduleModalOpen && (
            <div className="modal schedule-modal" role="dialog" aria-modal="true" aria-label="Schedule Google Meet class">
              <div className="modal-head">
                <h2 className="modal-title">
                  {editingEvent ? 'Edit Scheduled Class' : 'Schedule Google Meet Class'}
                </h2>
                <button
                  type="button"
                  className="modal-close"
                  aria-label="Close modal"
                  onClick={() => setScheduleModalOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <form className="modal-panel" onSubmit={handleScheduleSubmit}>
                {!googleToken && (
                  <div className="schedule-auth-banner">
                    <p>
                      Connect your Google account so this class is added to Google Calendar with an
                      auto-generated Meet link.
                    </p>
                    <button
                      type="button"
                      className="btn-sm-primary"
                      onClick={() => void handleGoogleConnect()}
                    >
                      Connect Google
                    </button>
                  </div>
                )}

                <div className="modal-field">
                  <label className="field-label" htmlFor="schedTitleInput">
                    Class Title
                  </label>
                  <input
                    id="schedTitleInput"
                    type="text"
                    className="form-control"
                    placeholder="e.g., Live Q&A & Code Review"
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    required
                  />
                </div>

                {courses.length > 0 && !editingEvent && (
                  <div className="modal-field">
                    <label className="field-label" htmlFor="schedCourseSelect">
                      Related Course <span className="field-hint">(optional)</span>
                    </label>
                    <select
                      id="schedCourseSelect"
                      className="form-control"
                      value={schedCourseId}
                      onChange={(e) => setSchedCourseId(e.target.value)}
                    >
                      <option value="">General Session</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="schedule-date-grid">
                  <div className="modal-field">
                    <label className="field-label" htmlFor="schedDateInput">
                      Date
                    </label>
                    <input
                      id="schedDateInput"
                      type="date"
                      className="form-control"
                      value={schedDate}
                      onChange={(e) => setSchedDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="modal-field">
                    <label className="field-label" htmlFor="schedStartInput">
                      Start Time
                    </label>
                    <input
                      id="schedStartInput"
                      type="time"
                      className="form-control"
                      value={schedStartTime}
                      onChange={(e) => setSchedStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="modal-field">
                    <label className="field-label" htmlFor="schedEndInput">
                      End Time
                    </label>
                    <input
                      id="schedEndInput"
                      type="time"
                      className="form-control"
                      value={schedEndTime}
                      onChange={(e) => setSchedEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="modal-field">
                  <div className="field-label">
                    Student Attendees <span className="field-hint">(select enrolled learners)</span>
                  </div>
                  <div className="attendee-student-list">
                    {students.length === 0 ? (
                      <span className="tz-note">No enrolled students available yet.</span>
                    ) : (
                      students.map((st) => {
                        const selected = schedSelectedIds.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            className={`attendee-pill${selected ? ' selected' : ''}${
                              !st.email ? ' no-email' : ''
                            }`}
                            onClick={() =>
                              setSchedSelectedIds((prev) =>
                                prev.includes(st.id)
                                  ? prev.filter((id) => id !== st.id)
                                  : [...prev, st.id]
                              )
                            }
                          >
                            {selected ? '✓ ' : '+ '}
                            {st.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="modal-field">
                  <label className="field-label" htmlFor="schedDescInput">
                    Agenda / Notes <span className="field-hint">(optional)</span>
                  </label>
                  <textarea
                    id="schedDescInput"
                    className="msg-area"
                    placeholder="Topics to cover during the live session..."
                    value={schedDesc}
                    onChange={(e) => setSchedDesc(e.target.value)}
                  />
                </div>

                {!editingEvent && (
                  <label className="meet-toggle-row">
                    <input
                      type="checkbox"
                      checked={schedIncludeMeet}
                      onChange={(e) => setSchedIncludeMeet(e.target.checked)}
                    />
                    <span>Attach a Google Meet video conference link automatically</span>
                  </label>
                )}

                <div className="modal-divider" style={{ marginTop: 18 }} />
                <div className="modal-foot" style={{ padding: '14px 0 0' }}>
                  <span className="tz-note">Timezone: {tzLabel}</span>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-modal-cancel"
                      onClick={() => setScheduleModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-modal-send"
                      disabled={schedSaving || !googleToken}
                    >
                      {schedSaving
                        ? 'Saving...'
                        : editingEvent
                          ? 'Review & Update'
                          : 'Schedule Class'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Invite Students Modal */}
        <div
          className={`modal-overlay${inviteOpen ? ' open' : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget && invitePhase !== 'sending') setInviteOpen(false);
          }}
        >
          {inviteOpen && (
            <div className="modal" role="dialog" aria-modal="true" aria-label="Invite students">
              <div className="modal-head">
                <h2 className="modal-title">Invite Students</h2>
                <button
                  type="button"
                  className="modal-close"
                  aria-label="Close modal"
                  onClick={() => setInviteOpen(false)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {invitePhase === 'compose' && (
                <>
                  <div className="modal-tabs">
                    <button
                      type="button"
                      className={`modal-tab${inviteTab === 'email' ? ' active' : ''}`}
                      onClick={() => setInviteTab('email')}
                    >
                      Email Invites
                    </button>
                    <button
                      type="button"
                      className={`modal-tab${inviteTab === 'link' ? ' active' : ''}`}
                      onClick={() => setInviteTab('link')}
                    >
                      Share Link
                    </button>
                  </div>

                  <div className="modal-panel">
                    {inviteTab === 'email' ? (
                      <>
                        <div className="modal-field">
                          <div className="field-label">
                            Recipient Emails <span className="field-hint">(Press Enter to add)</span>
                          </div>
                          <div
                            className={`chip-input${inviteEmails.length === 0 ? ' empty' : ''}`}
                            onClick={() => chipInputRef.current?.focus()}
                          >
                            {inviteEmails.map((em) => (
                              <span key={em} className="chip">
                                {em}
                                <button
                                  type="button"
                                  className="chip-x"
                                  aria-label={`Remove ${em}`}
                                  onClick={() =>
                                    setInviteEmails((prev) => prev.filter((x) => x !== em))
                                  }
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </span>
                            ))}
                            <input
                              ref={chipInputRef}
                              type="email"
                              className="chip-cursor"
                              placeholder="student@example.com"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault();
                                  addEmailChip(emailInput);
                                }
                              }}
                              onBlur={() => {
                                if (emailInput.trim()) addEmailChip(emailInput);
                              }}
                            />
                          </div>
                        </div>

                        {courses.length > 0 && (
                          <div className="modal-field">
                            <div className="field-label">Auto-Enroll Courses</div>
                            <div className="course-checks">
                              {courses.map((c) => {
                                const checked = inviteCourseIds.includes(c.id);
                                return (
                                  <div
                                    key={c.id}
                                    className={`course-check-item${checked ? ' checked' : ''}`}
                                    role="checkbox"
                                    aria-checked={checked}
                                    tabIndex={0}
                                    onClick={() =>
                                      setInviteCourseIds((prev) =>
                                        prev.includes(c.id)
                                          ? prev.filter((id) => id !== c.id)
                                          : [...prev, c.id]
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setInviteCourseIds((prev) =>
                                          prev.includes(c.id)
                                            ? prev.filter((id) => id !== c.id)
                                            : [...prev, c.id]
                                        );
                                      }
                                    }}
                                  >
                                    <div className="check-box">
                                      {checked && (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </div>
                                    <span className="check-name">{c.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="modal-field">
                          <label className="field-label" htmlFor="inviteCustomMsg">
                            Personal Message <span className="field-hint">(optional)</span>
                          </label>
                          <textarea
                            id="inviteCustomMsg"
                            className="msg-area"
                            placeholder="Welcome to the course! Use the link below to get started..."
                            value={inviteMessage}
                            onChange={(e) => setInviteMessage(e.target.value)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {courses.length > 0 && (
                          <div className="modal-field">
                            <div className="field-label">Select Courses Included</div>
                            <div className="course-checks">
                              {courses.map((c) => {
                                const checked = inviteCourseIds.includes(c.id);
                                return (
                                  <div
                                    key={c.id}
                                    className={`course-check-item${checked ? ' checked' : ''}`}
                                    role="checkbox"
                                    aria-checked={checked}
                                    tabIndex={0}
                                    onClick={() =>
                                      setInviteCourseIds((prev) =>
                                        prev.includes(c.id)
                                          ? prev.filter((id) => id !== c.id)
                                          : [...prev, c.id]
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setInviteCourseIds((prev) =>
                                          prev.includes(c.id)
                                            ? prev.filter((id) => id !== c.id)
                                            : [...prev, c.id]
                                        );
                                      }
                                    }}
                                  >
                                    <div className="check-box">
                                      {checked && (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                          <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                      )}
                                    </div>
                                    <span className="check-name">{c.title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <div className="modal-field">
                          <div className="field-label">Shareable Enrollment Link</div>
                          <div className="link-row">
                            <div className="link-text">{shareInviteLink}</div>
                            <button
                              type="button"
                              className={`copy-btn${linkCopied ? ' copied' : ''}`}
                              onClick={() => void handleCopyInviteLink()}
                            >
                              {linkCopied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <p className="link-note">
                            Students who sign up through this link are automatically enrolled in
                            your selected courses upon profile completion.
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="modal-divider" />
                  <div className="modal-foot">
                    <span className="invited-as">
                      Sending as {profile?.fullName || SENDER_NAME}
                    </span>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="btn-modal-cancel"
                        onClick={() => setInviteOpen(false)}
                      >
                        Cancel
                      </button>
                      {inviteTab === 'email' && (
                        <button
                          type="button"
                          className="btn-modal-send"
                          onClick={() => void handleSendInvites()}
                        >
                          Send Invites
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {invitePhase === 'sending' && (
                <div className="modal-panel">
                  <div className="progress-head">
                    <span className="send-spinner" />
                    <div>
                      <div className="progress-title">Sending Invitations...</div>
                      <div className="progress-note">Dispatching emails via EmailJS</div>
                    </div>
                  </div>
                  <div className="progress-list">
                    {Object.entries(inviteStatuses).map(([em, st]) => (
                      <div key={em} className="pi-row">
                        <span className="pi-email">{em}</span>
                        <span className={`pi-badge ${st}`}>{capitalize(st)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {invitePhase === 'done' && (
                <div className="modal-success">
                  <div className="success-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="success-title">
                    {inviteSentCount} Invitation{inviteSentCount === 1 ? '' : 's'} Sent!
                  </div>
                  <div className="success-sub">
                    Students received their onboarding link and will appear in your roster once they
                    register.
                  </div>
                  <button
                    type="button"
                    className="btn-done"
                    onClick={() => setInviteOpen(false)}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm Calendar Mutation Modal */}
        <ConfirmModal
          open={Boolean(pendingCalendarConfirm)}
          title={
            pendingCalendarConfirm?.type === 'delete'
              ? 'Cancel Google Calendar Class'
              : 'Update Google Calendar Class'
          }
          message={
            pendingCalendarConfirm?.type === 'delete'
              ? `Cancel "${pendingCalendarConfirm.event.title}" on Google Calendar? Invited students will receive a cancellation notice.`
              : `Update "${pendingCalendarConfirm?.event.title || ''}" on Google Calendar and notify invited students of the changes?`
          }
          confirmText={pendingCalendarConfirm?.type === 'delete' ? 'Cancel Class' : 'Update Class'}
          isDanger={pendingCalendarConfirm?.type === 'delete'}
          onConfirm={() => void handleConfirmCalendarMutation()}
          onCancel={() => setPendingCalendarConfirm(null)}
        />
      </div>
    </InstructorLayout>
  );
};

export default InstructorStudentsPage;
