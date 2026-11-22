import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { friendlyError, getRoleDestinationPath } from '../../services/authService';

export const ChooseRolePage: React.FC = () => {
  const { user, profile, authReady, saveProfile, logOut } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [selectedRole, setSelectedRole] = useState<'Student' | 'Instructor'>('Student');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!user.emailVerified) {
      navigate('/verify-email', { replace: true });
      return;
    }
    if (profile?.role === 'Instructor' || profile?.role === 'Student') {
      navigate(
        getRoleDestinationPath(profile.role, user, Boolean(profile.profileCompleted)),
        { replace: true }
      );
    }
  }, [authReady, user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await saveProfile({ role: selectedRole });
      navigate(
        selectedRole === 'Instructor' ? '/instructor-profile' : '/student-profile',
        { replace: true }
      );
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tf-role-page">
      <div className="role-shell">
        <form className="role-card-outer" onSubmit={handleSubmit}>
          <h1>How will you use Talent Flow?</h1>
          <p className="role-sub">Choose your primary role to personalize your workspace.</p>

          <div className="role-picker">
            <label>
              <input
                type="radio"
                name="role"
                value="Student"
                className="role-radio"
                checked={selectedRole === 'Student'}
                onChange={() => setSelectedRole('Student')}
              />
              <span className="role-card">
                <span className="role-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </span>
                <span className="role-card-title">Student</span>
                <span className="role-card-desc">Enroll in courses &amp; submit work</span>
              </span>
            </label>

            <label>
              <input
                type="radio"
                name="role"
                value="Instructor"
                className="role-radio"
                checked={selectedRole === 'Instructor'}
                onChange={() => setSelectedRole('Instructor')}
              />
              <span className="role-card">
                <span className="role-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </span>
                <span className="role-card-title">Instructor</span>
                <span className="role-card-desc">Teach courses &amp; grade students</span>
              </span>
            </label>
          </div>

          <button type="submit" className="btn-primary full" disabled={saving} style={{ width: '100%', padding: '13px 24px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            {saving ? 'Saving role…' : `Continue as ${selectedRole}`}
          </button>

          <div>
            <button
              type="button"
              className="btn-text-muted"
              onClick={async () => {
                await logOut();
                navigate('/login', { replace: true });
              }}
            >
              Sign out &amp; switch account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
