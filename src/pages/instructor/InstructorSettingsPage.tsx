import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmModal } from '../../components/ConfirmModal';
import { InstructorLayout } from '../../components/InstructorLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  friendlyError,
  logOut,
  saveProfile,
  saveSettings,
  uploadAvatar,
} from '../../services/authService';
import { supabase } from '../../services/supabaseClient';
import { evaluatePasswordStrength, initialsAvatar, sanitizeImageSrc } from '../../utils/formatters';

type SettingsTab = 'profile' | 'account' | 'notifications' | 'security';

const InstructorSettingsPage: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<SettingsTab>('profile');

  // Profile Tab
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [expertise, setExpertise] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);

  // Account Tab
  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [savingAccount, setSavingAccount] = useState(false);

  // Notifications Tab
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [subAlerts, setSubAlerts] = useState(true);
  const [enrollAlerts, setEnrollAlerts] = useState(true);
  const [savingNotifs, setSavingNotifs] = useState(false);

  // Security Tab
  const [newPassword, setNewPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Confirm Modals
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [clearCacheConfirmOpen, setClearCacheConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || user?.displayName || '');
      setTitle(profile.title || '');
      setExpertise(profile.expertise || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar || user?.photoURL || '');
      if (profile.settings) {
        setLanguage(profile.settings.language || 'en');
        setTimezone(
          profile.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        );
        setEmailNotifs(profile.settings.emailNotifs ?? true);
        setSubAlerts(profile.settings.subAlerts ?? true);
        setEnrollAlerts(profile.settings.enrollAlerts ?? true);
        setTwoFactorEnabled(profile.settings.twoFactor ?? false);
      }
    }
  }, [profile, user]);

  const strength = evaluatePasswordStrength(newPassword);

  const handleAvatarUpload = async (file: File | null) => {
    if (!file || !user?.uid) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file', 'warn');
      return;
    }
    try {
      const publicUrl = await uploadAvatar(user.uid, file);
      await saveProfile(user.uid, { avatar: publicUrl });
      setAvatarUrl(publicUrl);
      await refreshProfile();
      showToast('Profile picture updated', 'success');
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setSavingProfile(true);
    setSavedFlag(false);
    try {
      const patch = {
        fullName: fullName.trim(),
        title: title.trim(),
        expertise: expertise.trim(),
        bio: bio.trim(),
      };
      await saveProfile(user.uid, patch);
      try {
        localStorage.setItem(
          'tf_instructor_profile',
          JSON.stringify({ ...profile, ...patch, avatar: avatarUrl })
        );
      } catch {
        // ignore
      }
      await refreshProfile();
      setSavedFlag(true);
      showToast('Profile settings saved', 'success');
      setTimeout(() => setSavedFlag(false), 2500);
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;
    setSavingAccount(true);
    try {
      await saveSettings(user.uid, profile?.settings, { language, timezone });
      await refreshProfile();
      showToast('Account preferences updated', 'success');
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!user?.uid) return;
    setSavingNotifs(true);
    try {
      await saveSettings(user.uid, profile?.settings, {
        emailNotifs,
        subAlerts,
        enrollAlerts,
      });
      await refreshProfile();
      showToast('Notification preferences saved', 'success');
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSavingNotifs(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'warn');
      return;
    }
    if (newPassword !== confirmPw) {
      showToast('Passwords do not match', 'warn');
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPw('');
      showToast('Password updated successfully', 'success');
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSavingPw(false);
    }
  };

  const handleToggle2FA = async (nextVal: boolean) => {
    setTwoFactorEnabled(nextVal);
    if (!user?.uid) return;
    try {
      await saveSettings(user.uid, profile?.settings, { twoFactor: nextVal });
      await refreshProfile();
      showToast(
        nextVal ? 'Two-factor preference enabled' : 'Two-factor preference disabled',
        'info'
      );
    } catch (err) {
      showToast(friendlyError(err), 'error');
    }
  };

  const handleClearCache = () => {
    try {
      localStorage.removeItem('tf_instructor_profile');
      sessionStorage.clear();
    } catch {
      // ignore
    }
    setClearCacheConfirmOpen(false);
    showToast('Cached local preferences cleared', 'info');
  };

  const handleSignOut = async () => {
    setSignOutConfirmOpen(false);
    await logOut();
    navigate('/login', { replace: true });
  };

  const displayName = fullName || user?.displayName || 'Instructor';

  return (
    <InstructorLayout breadcrumbLabel="Settings" hideTopNav>
      <div className="tf-inst-settings">
        <nav className="settings-nav" aria-label="Settings tabs">
          {(
            [
              ['profile', 'Profile'],
              ['account', 'Account'],
              ['notifications', 'Notifications'],
              ['security', 'Security'],
            ] as const
          ).map(([key, lbl]) => (
            <button
              key={key}
              type="button"
              className={`settings-nav-btn${tab === key ? ' active' : ''}`}
              onClick={() => setTab(key)}
            >
              {lbl}
            </button>
          ))}
        </nav>

        <h1 className="page-title">Settings</h1>

        {tab === 'profile' && (
          <div className="settings-content-wrap">
            <div className="avatar-section">
              <div className="avatar-wrap-lg">
                <img
                  src={sanitizeImageSrc(avatarUrl, initialsAvatar(displayName))}
                  alt={displayName}
                />
                <button
                  type="button"
                  className="edit-avatar-btn"
                  title="Upload new avatar"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleAvatarUpload(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <form className="form-section" onSubmit={handleSaveProfile}>
              <h2 className="profile-name">{displayName}</h2>
              <div className="profile-fields">
                <div className="field-row">
                  <label htmlFor="instSetName">Full Name</label>
                  <input
                    id="instSetName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="instSetEmail">Email</label>
                  <input id="instSetEmail" type="email" value={user?.email || ''} readOnly />
                </div>
                <div className="field-row">
                  <label htmlFor="instSetTitle">Role / Title</label>
                  <input
                    id="instSetTitle"
                    type="text"
                    placeholder="e.g., Senior Frontend Instructor"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="instSetExpertise">Expertise</label>
                  <input
                    id="instSetExpertise"
                    type="text"
                    placeholder="React, TypeScript, UI Systems"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="instSetBio">Bio</label>
                  <input
                    id="instSetBio"
                    type="text"
                    placeholder="Short instructor biography"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="save-btn" disabled={savingProfile}>
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
              {savedFlag && <span className="save-toast">Saved!</span>}
            </form>
          </div>
        )}

        {tab === 'account' && (
          <form className="form-section" onSubmit={handleSaveAccount}>
            <h2 className="tab-heading">Account Preferences</h2>
            <div className="profile-fields">
              <div className="field-row">
                <label htmlFor="instSetLang">Language</label>
                <select
                  id="instSetLang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="instSetTz">Timezone</label>
                <input
                  id="instSetTz"
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="save-btn" disabled={savingAccount}>
              {savingAccount ? 'Saving...' : 'Save Preferences'}
            </button>
          </form>
        )}

        {tab === 'notifications' && (
          <div className="form-section">
            <h2 className="tab-heading">Notification Settings</h2>
            <div className="toggle-list">
              <div className="toggle-row">
                <div>
                  <div className="toggle-label">Email Summaries</div>
                  <div className="toggle-desc">Receive digest emails of student progress.</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={emailNotifs}
                    onChange={(e) => setEmailNotifs(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="toggle-row">
                <div>
                  <div className="toggle-label">Submission Alerts</div>
                  <div className="toggle-desc">
                    Get notified immediately when students turn in assignments.
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={subAlerts}
                    onChange={(e) => setSubAlerts(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="toggle-row">
                <div>
                  <div className="toggle-label">New Enrollment Alerts</div>
                  <div className="toggle-desc">
                    Alert when new learners enroll in your published courses.
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={enrollAlerts}
                    onChange={(e) => setEnrollAlerts(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>
            <button
              type="button"
              className="save-btn"
              disabled={savingNotifs}
              onClick={() => void handleSaveNotifications()}
            >
              {savingNotifs ? 'Saving...' : 'Save Notification Settings'}
            </button>
          </div>
        )}

        {tab === 'security' && (
          <div className="form-section">
            <h2 className="tab-heading">Security &amp; Session</h2>
            <form onSubmit={handleChangePassword}>
              <div className="profile-fields">
                <div className="field-row">
                  <label htmlFor="instNewPw">New Password</label>
                  <div style={{ flex: 1 }}>
                    <div className="password-wrap">
                      <input
                        id="instNewPw"
                        type={showNewPw ? 'text' : 'password'}
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="eye-btn"
                        aria-label="Toggle password visibility"
                        onClick={() => setShowNewPw((v) => !v)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                    {newPassword && (
                      <>
                        <div className="strength-bar">
                          <div
                            className="strength-fill"
                            style={{ width: strength.width, background: strength.color }}
                          />
                        </div>
                        <span className="strength-label" style={{ color: strength.color }}>
                          Strength: {strength.label}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="field-row">
                  <label htmlFor="instConfirmPw">Confirm</label>
                  <div className="password-wrap">
                    <input
                      id="instConfirmPw"
                      type={showNewPw ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="save-btn" disabled={savingPw}>
                {savingPw ? 'Updating...' : 'Update Password'}
              </button>
            </form>

            <div className="toggle-list" style={{ marginTop: 28 }}>
              <div className="toggle-row">
                <div>
                  <div className="toggle-label">Two-Factor Security</div>
                  <div className="toggle-desc">
                    Prefer extra verification when signing in from unfamiliar devices.
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={twoFactorEnabled}
                    onChange={(e) => void handleToggle2FA(e.target.checked)}
                  />
                  <span className="slider" />
                </label>
              </div>
            </div>

            <div className="danger-zone">
              <h4>Session &amp; Cache Management</h4>
              <button
                type="button"
                className="danger-btn"
                onClick={() => setClearCacheConfirmOpen(true)}
              >
                Clear Cached Preferences
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => setSignOutConfirmOpen(true)}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        <ConfirmModal
          open={signOutConfirmOpen}
          title="Sign Out"
          message="Are you sure you want to sign out of your Talent Flow instructor account?"
          confirmText="Sign Out"
          isDanger
          onConfirm={() => void handleSignOut()}
          onCancel={() => setSignOutConfirmOpen(false)}
        />

        <ConfirmModal
          open={clearCacheConfirmOpen}
          title="Clear Cached Preferences"
          message="Clear locally cached profile bridges and session UI state? Your Supabase account data remains intact."
          confirmText="Clear Cache"
          isDanger
          onConfirm={handleClearCache}
          onCancel={() => setClearCacheConfirmOpen(false)}
        />
      </div>
    </InstructorLayout>
  );
};

export default InstructorSettingsPage;
