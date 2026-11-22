import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  getRecent,
  getUnreadSummary,
  markAllRead,
  markCategoryRead,
  subscribeToInstructor,
} from '../services/notificationsService';
import type { NotificationCategory, NotificationItem, UnreadCounts } from '../types';
import { initialsAvatar, relativeTime, sanitizeImageSrc } from '../utils/formatters';
import { ConfirmModal } from './ConfirmModal';

interface InstructorLayoutProps {
  breadcrumbLabel: string;
  hideTopNav?: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: {
  to: string;
  tip: string;
  label: string;
  category?: NotificationCategory;
  icon: React.ReactNode;
}[] = [
  {
    to: '/instructor/dashboard',
    tip: 'Dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.2" />
        <rect x="14" y="3" width="7" height="7" rx="1.2" />
        <rect x="14" y="14" width="7" height="7" rx="1.2" />
        <rect x="3" y="14" width="7" height="7" rx="1.2" />
      </svg>
    ),
  },
  {
    to: '/instructor/courses',
    tip: 'Courses',
    label: 'Courses',
    category: 'course',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    to: '/instructor/assignments',
    tip: 'Assignments',
    label: 'Assignments',
    category: 'assignment',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="8" y="2" width="12" height="15" rx="2" />
        <path d="M16 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
      </svg>
    ),
  },
  {
    to: '/instructor/students',
    tip: 'Students',
    label: 'Students',
    category: 'student',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5" />
      </svg>
    ),
  },
  {
    to: '/instructor/performance',
    tip: 'Performance',
    label: 'Performance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="13" width="3.5" height="8" rx="1" />
        <rect x="10.25" y="4" width="3.5" height="17" rx="1" />
        <rect x="16.5" y="9" width="3.5" height="12" rx="1" />
      </svg>
    ),
  },
  {
    to: '/instructor/settings',
    tip: 'Settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
];

export const InstructorLayout: React.FC<InstructorLayoutProps> = ({
  breadcrumbLabel,
  hideTopNav = false,
  children,
}) => {
  const { user, profile, logOut } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState<UnreadCounts>({
    total: 0,
    course: 0,
    assignment: 0,
    student: 0,
  });

  const avatarWrapRef = useRef<HTMLDivElement>(null);

  const displayName =
    profile?.fullName || profile?.name || user?.displayName || 'Instructor';
  const avatarSrc = sanitizeImageSrc(
    profile?.avatar || user?.photoURL || initialsAvatar(displayName),
    initialsAvatar(displayName)
  );

  const refreshNotifications = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [recent, summary] = await Promise.all([
        getRecent(user.uid, 30),
        getUnreadSummary(user.uid),
      ]);
      setNotifications(recent);
      setUnread(summary);
    } catch {
      // ignore transient errors
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    refreshNotifications();

    const unsub = subscribeToInstructor(user.uid, (item) => {
      setNotifications((prev) => [item, ...prev].slice(0, 30));
      setUnread((prev) => ({
        total: prev.total + 1,
        course: prev.course + (item.category === 'course' || item.type === 'enrollment' ? 1 : 0),
        assignment: prev.assignment + (item.category === 'assignment' ? 1 : 0),
        student: prev.student + (item.category === 'student' || item.type === 'enrollment' ? 1 : 0),
      }));
      showToast(item.message, 'info', 'New Student Activity');
    });

    return () => unsub();
  }, [user?.uid, refreshNotifications, showToast]);

  // Clear unread count for visited section automatically
  useEffect(() => {
    if (!user?.uid) return;
    const match = NAV_ITEMS.find((n) => location.pathname.startsWith(n.to));
    if (match?.category && unread[match.category] > 0) {
      markCategoryRead(user.uid, match.category).then(() => {
        refreshNotifications();
      });
    }
  }, [location.pathname, user?.uid, unread, refreshNotifications]);

  // Reset mobile drawer and menus when navigating between routes
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  // Lock background page scroll while mobile slide-out drawer is open
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  // Close profile popup when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (avatarWrapRef.current && !avatarWrapRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const handleMarkAllRead = async () => {
    if (!user?.uid) return;
    await markAllRead(user.uid);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread({ total: 0, course: 0, assignment: 0, student: 0 });
  };

  const handleNotifClick = async (item: NotificationItem) => {
    setNotifOpen(false);
    if (item.category === 'assignment') navigate('/instructor/assignments');
    else if (item.category === 'student') navigate('/instructor/students');
    else navigate('/instructor/courses');
  };

  const handleSignOut = async () => {
    setSignOutConfirmOpen(false);
    await logOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className={`tf-inst-layout${hideTopNav ? ' hide-top-nav' : ''}`}>
      {!hideTopNav && (
        <nav className="inst-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className={`hamburger-btn${mobileMenuOpen ? ' open' : ''}`}
              aria-label="Toggle Menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <span className="hb-bar hb-top" />
              <span className="hb-bar hb-mid" />
              <span className="hb-bar hb-bot" />
            </button>

            <Link className="logo" to="/instructor/dashboard">
              <svg width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <polygon points="4,22 20,10 36,22 20,14" fill="#2563EB" />
                <polygon points="10,20 20,14 30,20 20,26" fill="#3B82F6" opacity="0.85" />
                <path d="M12 22v7c0 3 16 3 16 0v-7" fill="#1D4ED8" />
                <circle cx="20" cy="7" r="2.2" fill="#2563EB" />
              </svg>
              <span>Talent Flow</span>
            </Link>
          </div>

          <div className="nav-center">
            <div className="breadcrumb">
              <span className="bc-root">Instructor</span>
              <span>/</span>
              <span className="bc-current">{breadcrumbLabel}</span>
            </div>
          </div>

          <div className="nav-right">
            <span className="nav-role">Instructor</span>

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
              <span className={`notif-badge${unread.total === 0 ? ' hidden' : ''}`}>
                {unread.total > 9 ? '9+' : unread.total}
              </span>
            </button>

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
                    <div className="pp-role">Instructor · Talent Flow</div>
                  </div>
                </div>
                <div className="pp-divider" />
                <Link
                  to="/instructor/settings"
                  className="pp-item"
                  onClick={() => setProfileOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Account &amp; Profile Settings
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

      {/* Notification Backdrop & Dropdown */}
      <div
        className={`notif-backdrop${notifOpen ? ' open' : ''}`}
        onClick={() => setNotifOpen(false)}
      />
      <div className={`notif-panel${notifOpen ? ' open' : ''}`}>
        <div className="notif-panel-header">
          <span>Notifications</span>
          {notifications.length > 0 && (
            <button type="button" className="notif-clear-all" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          )}
        </div>
        <div className="notif-list">
          {notifications.length === 0 ? (
            <div className="notif-empty">No recent student activity yet.</div>
          ) : (
            notifications.map((n) => {
              const av = sanitizeImageSrc(
                n.studentAvatar || initialsAvatar(n.studentName),
                initialsAvatar(n.studentName)
              );
              return (
                <button
                  type="button"
                  key={n.id}
                  className={`notif-item${n.read ? '' : ' unread'}`}
                  onClick={() => handleNotifClick(n)}
                >
                  <img className="notif-avatar" src={av} alt={n.studentName} />
                  <div className="notif-body">
                    <strong>{n.studentName}</strong>
                    <p>{n.message}</p>
                    <span className="notif-time">{relativeTime(n.createdAt)}</span>
                  </div>
                  {!n.read && <span className="notif-unread-dot" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`sidebar-overlay${mobileMenuOpen ? ' open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Left Sidebar / Mobile Drawer */}
      <aside className={`sidebar${mobileMenuOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-header">
          <Link
            to="/instructor/dashboard"
            className="sb-brand"
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span>Talent Flow</span>
          </Link>
          <button
            type="button"
            className="sb-close-btn"
            aria-label="Close Menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <span className="sb-section">Navigation</span>
        {NAV_ITEMS.map((item) => {
          const active = location.pathname.startsWith(item.to);
          const hasDot = item.category ? unread[item.category] > 0 : false;
          return (
            <Link
              key={item.to}
              to={item.to}
              data-tip={item.tip}
              className={`sidebar-link${active ? ' active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.icon}
              <span className="sb-label">{item.label}</span>
              {hasDot && <span className="sidebar-notif-dot" />}
            </Link>
          );
        })}

        <div className="sb-footer">
          <img className="sb-footer-avatar" src={avatarSrc} alt={displayName} />
          <div>
            <div className="sb-footer-name">{displayName}</div>
            <div className="sb-footer-role">Instructor</div>
          </div>
        </div>
      </aside>

      <main className="content">{children}</main>

      <ConfirmModal
        open={signOutConfirmOpen}
        title="Sign out of Talent Flow?"
        message="You will be signed out of your instructor account on this device."
        confirmText="Sign Out"
        cancelText="Stay Signed In"
        isDanger
        onConfirm={handleSignOut}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
    </div>
  );
};
