import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { friendlyError, registerUser, signInWithGoogle } from '../../services/authService';
import { getRegisterPasswordWarning } from '../../utils/formatters';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Preserve invite link parameters if student arrived via instructor invitation
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteToken = params.get('invite');
    const inviteEmail = params.get('email');
    const inviteCourses = params.get('courses');
    const instructor = params.get('instructor');
    if (inviteEmail) setEmail(inviteEmail);
    if (inviteToken || inviteCourses || instructor) {
      try {
        sessionStorage.setItem(
          'tf_pending_invite',
          JSON.stringify({
            token: inviteToken || '',
            email: inviteEmail || '',
            courseIds: inviteCourses ? inviteCourses.split(',').filter(Boolean) : [],
            instructorId: instructor || '',
          })
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [location.search]);

  const passwordWarning = getRegisterPasswordWarning(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await registerUser(trimmedName, trimmedEmail, password);
      showToast('Account created! Please check your email to verify.', 'success');
      navigate('/verify-email', { replace: true });
    } catch (err) {
      setErrorMsg(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(friendlyError(err));
      setLoading(false);
    }
  };

  return (
    <div className="tf-auth-page">
      <div className="welcome-container">
        <div className="image">
          <img
            src="/6206973.jpg"
            alt="Students collaborating on Talent Flow"
            className="welcome-image"
          />
        </div>

        <div className="welcome">
          <div className="welcome-text">
            <h1>Create Account</h1>
            <p className="subtitle">Join Talent Flow to start learning or teaching</p>
          </div>

          {errorMsg && <div className="auth-inline-error">{errorMsg}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              type="text"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <label htmlFor="reg-email">Email Address</label>
            <input
              id="reg-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="reg-password">Password</label>
            <div className="password-wrap">
              <input
                id="reg-password"
                type={showPass ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={showPass ? 'Hide password' : 'Show password'}
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {passwordWarning && (
              <div className="password-strength-warning">{passwordWarning}</div>
            )}

            <label htmlFor="reg-confirm">Confirm Password</label>
            <div className="password-wrap">
              <input
                id="reg-confirm"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button type="submit" className="sign" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <div className="dd">
            <span>or continue with</span>
          </div>

          <div className="logs">
            <button
              type="button"
              className="google-placeholder-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <img src="/icons8-google-48.png" alt="Google" width={20} height={20} />
              <span>Continue with Google</span>
            </button>
          </div>

          <p className="auth-footer-note">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
