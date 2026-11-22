import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  confirmPasswordReset,
  friendlyError,
  sendResetLink,
} from '../../services/authService';
import { evaluatePasswordStrength } from '../../utils/formatters';

export const PasswordResetPage: React.FC = () => {
  const { passwordRecoveryTriggered, clearPasswordRecoveryFlag } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const isRecoveryMode = useMemo(() => {
    return (
      passwordRecoveryTriggered ||
      location.hash.includes('type=recovery') ||
      location.search.includes('type=recovery')
    );
  }, [passwordRecoveryTriggered, location.hash, location.search]);

  const [email, setEmail] = useState('');
  const [sentToEmail, setSentToEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const strength = evaluatePasswordStrength(newPassword);

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    setLoading(true);
    try {
      await sendResetLink(trimmed);
      setSentToEmail(trimmed);
      showToast('Password reset link sent!', 'success');
    } catch (err) {
      setErrorMsg(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (newPassword.length < 8) {
      setErrorMsg('Please choose a password with at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPass) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(newPassword);
      clearPasswordRecoveryFlag();
      setResetDone(true);
      showToast('Password updated! Redirecting to sign in…', 'success');
      setTimeout(() => navigate('/login', { replace: true }), 1400);
    } catch (err) {
      setErrorMsg(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tf-auth-page">
      <div className="welcome-container">
        <div className="image">
          <img src="/4807.jpg" alt="Password Recovery" className="welcome-image" />
        </div>

        <div className="welcome">
          <div className="welcome-text">
            <h1>{isRecoveryMode ? 'Set New Password' : 'Reset Password'}</h1>
            <p className="subtitle">
              {isRecoveryMode
                ? 'Choose a strong password for your account'
                : 'Enter your email and we will send a recovery link'}
            </p>
          </div>

          {errorMsg && <div className="reset-error">{errorMsg}</div>}

          {isRecoveryMode ? (
            resetDone ? (
              <div className="reset-result">
                <div className="reset-result-head">
                  <span className="reset-result-icon">✓</span>
                  <span>Password updated successfully</span>
                </div>
                <p className="reset-hint">You can now sign in with your new password.</p>
                <Link to="/login" className="btn-go-login">
                  Go to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleRecoverySubmit} noValidate>
                <label htmlFor="reset-new-pass">New Password</label>
                <div className="password-wrap">
                  <input
                    id="reset-new-pass"
                    type={showPass ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPass((v) => !v)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>

                {newPassword && (
                  <div style={{ marginTop: -12, marginBottom: 16 }}>
                    <div
                      style={{
                        height: 5,
                        background: '#E2E8F0',
                        borderRadius: 99,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: strength.width,
                          height: '100%',
                          background: strength.color,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: strength.color,
                        marginTop: 4,
                      }}
                    >
                      Strength: {strength.label}
                    </span>
                  </div>
                )}

                <label htmlFor="reset-confirm-pass">Confirm New Password</label>
                <input
                  id="reset-confirm-pass"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  required
                />

                <button type="submit" className="log" disabled={loading}>
                  {loading ? 'Updating Password…' : 'Update Password'}
                </button>
              </form>
            )
          ) : sentToEmail ? (
            <div className="reset-result">
              <div className="reset-result-head">
                <span className="reset-result-icon">✓</span>
                <span>Reset link sent</span>
              </div>
              <p className="reset-hint">
                We sent a password recovery email to <strong>{sentToEmail}</strong>. Check your
                inbox and spam folder to continue.
              </p>
              <Link to="/login" className="btn-go-login">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleRequestSubmit} noValidate>
              <label htmlFor="reset-email">Email Address</label>
              <input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="log" disabled={loading}>
                {loading ? 'Sending Reset Link…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <p className="auth-footer-note">
            Remembered your password? <Link to="/login">Back to Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
