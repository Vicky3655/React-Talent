import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  friendlyError,
  getRoleDestinationPath,
  isAuthRedirectReturn,
  loadProfile,
  loginUser,
  signInWithGoogle,
} from '../../services/authService';

export const LoginPage: React.FC = () => {
  const { user, profile, authReady } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!authReady) return;
    if (isAuthRedirectReturn()) {
      navigate('/auth-callback', { replace: true });
      return;
    }
    if (user) {
      const dest = getRoleDestinationPath(
        profile?.role,
        user,
        Boolean(profile?.profileCompleted)
      );
      navigate(dest, { replace: true });
    }
  }, [authReady, user, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    setLoading(true);
    try {
      const { user: loggedInUser, role } = await loginUser(trimmedEmail, password);
      const prof = await loadProfile(loggedInUser.uid).catch(() => null);
      const dest = getRoleDestinationPath(
        prof?.role || role,
        loggedInUser,
        Boolean(prof?.profileCompleted)
      );
      showToast('Welcome back!', 'success');
      navigate(dest, { replace: true });
    } catch (err) {
      setErrorMsg(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
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
            src="/4807.jpg"
            alt="Learning with Talent Flow"
            className="welcome-image"
          />
        </div>

        <div className="welcome">
          <div className="welcome-text">
            <h1>Welcome Back</h1>
            <p className="subtitle">Sign in to continue to Talent Flow</p>
          </div>

          {errorMsg && <div className="auth-inline-error">{errorMsg}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="login-email">Email Address</label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label htmlFor="login-password">Password</label>
            <div className="password-wrap">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                placeholder="Enter your password"
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

            <div className="forgot">
              <Link to="/password">Forgot Password?</Link>
            </div>

            <button type="submit" className="log" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="dd">
            <span>or continue with</span>
          </div>

          <div className="logs">
            <button
              type="button"
              className="google-placeholder-btn"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <img src="/icons8-google-48.png" alt="Google" width={20} height={20} />
              <span>Continue with Google</span>
            </button>
          </div>

          <p className="auth-footer-note">
            New to Talent Flow? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
