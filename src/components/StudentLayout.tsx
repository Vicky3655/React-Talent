import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAssignmentsForStudent } from '../services/dataService';
import { formatDateShort, initialsAvatar, sanitizeImageSrc } from '../utils/formatters';
import { ConfirmModal } from './ConfirmModal';

export interface StudentNotif {
  id: string;
  type: 'grade' | 'submit' | 'late';
  title: string;
  text: string;
  time: string;
  read?: boolean;
}

interface StudentLayoutProps {
  breadcrumbLabel: string;
  hideTopNav?: boolean;
  extraNotifications?: StudentNotif[];
  children: React.ReactNode;
}

const READ_KEY = 'tf_student_read_notifs';

function getStoredReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const STU_NAV_ITEMS = [
  {
    to: '/student/dashboard',
    tip: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10.5L12 3z" />
      </svg>
    ),
  },
  {
    to: '/student/courses',
    tip: 'Courses',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    to: '/student/assignments',
    tip: 'Assignments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    to: '/student/settings',
    tip: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export const StudentLayout: React.FC<StudentLayoutProps> = ({
  breadcrumbLabel,
  hideTopNav = false,
  extraNotifications,
  children,
}) => {
  const { user, profile, logOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [autoNotifs, setAutoNotifs] = useState<StudentNotif[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredReadIds());

  const avatarWrapRef = useRef<HTMLDivElement>(null);

  const displayName =
    profile?.fullName || profile?.name || user?.displayName || 'Student';
  const avatarSrc = sanitizeImageSrc(
    profile?.avatar || user?.photoURL || initialsAvatar(displayName),
    initialsAvatar(displayName)
  );

  // If page doesn't supply notifications explicitly, compute live notifications from student's assignments
  useEffect(() => {
    if (extraNotifications !== undefined || !user?.uid) return;
    let cancelled = false;
    getAssignmentsForStudent(user.uid)
      .then((list) => {
        if (cancelled) return;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const items: StudentNotif[] = [];
        list.forEach((a) => {
          const sub = a.submission;
          if (sub && sub.score !== null && sub.score !== undefined) {
            items.push({
              id: `graded-${a.id}`,
              type: 'grade',
              title: `${a.title} graded`,
              text: `You scored ${sub.score}/${a.maxScore} in ${a.course}.`,
              time: sub.gradedAt ? formatDateShort(sub.gradedAt) : 'Recently',
            });
          } else if (sub) {
            items.push({
              id: `submitted-${a.id}`,
              type: 'submit',
              title: 'Submission received',
              text: `"${a.title}" submitted for ${a.course}.`,
              time: sub.submittedAt ? formatDateShort(sub.submittedAt) : 'Submitted',
            });
          } else if (a.dueDate) {
            const due = new Date(`${a.dueDate}T00:00:00`);
            const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
            if (days < 0) {
              items.push({
                id: `late-${a.id}`,
                type: 'late',
                title: `Overdue: ${a.title}`,
                text: `Was due ${formatDateShort(a.dueDate)} (${a.course}).`,
                time: `${Math.abs(days)}d overdue`,
              });
            } else if (days <= 3) {
              items.push({
                id: `due-${a.id}`,
                type: 'late',
                title: `Due soon: ${a.title}`,
                text: `Due ${days === 0 ? 'today' : `in ${days}d`} (${a.course}).`,
                time: formatDateShort(a.dueDate),
              });
            }
          }
        });
        setAutoNotifs(items);
      })
      .catch(() => {
        // ignore transient errors
      });
    return () => {
      cancelled = true;
    };
  }, [extraNotifications, user?.uid]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (avatarWrapRef.current && !avatarWrapRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const notifications = useMemo(() => {
    const base = extraNotifications !== undefined ? extraNotifications : autoNotifs;
    return base.map((n) => ({
      ...n,
      read: n.read || readIds.has(n.id),
    }));
  }, [extraNotifications, autoNotifs, readIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllStudentRead = () => {
    const next = new Set(readIds);
    notifications.forEach((n) => next.add(n.id));
    setReadIds(next);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...next]));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleSignOut = async () => {
    setSignOutConfirmOpen(false);
    await logOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`tf-stu-layout${hideTopNav ? ' hide-top-nav' : ''}`}>
      {!hideTopNav && (
        <nav className="stu-nav">
          <Link className="logo" to="/student/dashboard">
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <polygon points="4,22 20,10 36,22 20,14" fill="#2563EB" />
              <polygon points="10,20 20,14 30,20 20,26" fill="#3B82F6" opacity="0.85" />
              <path d="M12 22v7c0 3 16 3 16 0v-7" fill="#1D4ED8" />
              <circle cx="20" cy="7" r="2.2" fill="#2563EB" />
            </svg>
            <span>Talent Flow</span>
          </Link>

          <div className="nav-center">
            <div className="breadcrumb">
              <span className="bc-root">Student</span>
              <span>/</span>
              <span className="bc-current">{breadcrumbLabel}</span>
            </div>
          </div>

          <div className="nav-right">
            <button
              type="button"
              className="nav-icon-btn"
              aria-label="Notifications"
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className={`notif-badge${unreadCount === 0 ? ' hidden' : ''}`}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            </button>

            <div className={`notif-panel${notifOpen ? ' open' : ''}`}>
              <div className="np-header">
                <h4>Notifications</h4>
                {notifications.length > 0 && (
                  <button type="button" className="np-clear" onClick={markAllStudentRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="np-list">
                {notifications.length === 0 ? (
                  <div className="np-empty">All caught up!</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      className={`np-item${n.read ? '' : ' unread'}`}
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/student/assignments');
                      }}
                    >
                      <span className={`np-dot ${n.type}`} />
                      <div className="np-body">
                        <div className="np-title">{n.title}</div>
                        <div className="np-text">{n.text}</div>
                        <div className="np-time">{n.time}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="avatar-wrap" ref={avatarWrapRef}>
              <button
                type="button"
                className="avatar-trigger"
                aria-label="Account menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
              >
                <img src={avatarSrc} alt={displayName} />
                <span className="online-dot" />
              </button>

              <div className={`profile-popup${profileOpen ? ' open' : ''}`}>
                <div className="pp-header">
                  <img src={avatarSrc} alt={displayName} />
                  <div>
                    <div className="pp-name">{displayName}</div>
                    <div className="pp-role">Student · Talent Flow</div>
                  </div>
                </div>
                <div className="pp-divider" />
                <Link
                  to="/student/settings"
                  className="pp-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings &amp; Profile
                </Link>
                <button
                  type="button"
                  className="pp-item danger"
                  onClick={() => {
                    setProfileOpen(false);
                    setSignOutConfirmOpen(true);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      <div
        className={`notif-backdrop${notifOpen ? ' open' : ''}`}
        onClick={() => setNotifOpen(false)}
      />

      {/* Sidebar (Left desktop / Bottom tab bar mobile) */}
      <aside className="sidebar">
        {STU_NAV_ITEMS.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              data-tip={item.tip}
              className={`sidebar-link${active ? ' active' : ''}`}
            >
              {item.icon}
            </Link>
          );
        })}
      </aside>

      <main className="content">{children}</main>

      <ConfirmModal
        open={signOutConfirmOpen}
        title="Sign out of Talent Flow?"
        message="You will be signed out of your student account on this device."
        confirmText="Sign Out"
        cancelText="Stay Signed In"
        isDanger
        onConfirm={handleSignOut}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
    </div>
  );
};
