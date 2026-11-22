import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  checkEmailVerified,
  friendlyError,
  getPendingVerificationEmail,
  getRoleDestinationPath,
  loadProfile,
  sendVerificationEmail,
} from '../../services/authService';

export const VerifyEmailPage: React.FC = () => {
  const { user, profile, authReady, logOut } = useAuth();
  const navigate = useNavigate();

  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState<{ text: string; tone: 'muted' | 'success' | 'error' }>({
    text: 'Waiting for verification confirmation…',
    tone: 'muted',
  });

  const targetEmail = user?.email || getPendingVerificationEmail() || 'your inbox';

  useEffect(() => {
    if (!authReady) return;
    if (user?.emailVerified) {
      const dest = getRoleDestinationPath(
        profile?.role,
        user,
        Boolean(profile?.profileCompleted)
      );
      navigate(dest, { replace: true });
    }
  }, [authReady, user, profile, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Poll every 4 seconds to auto-advance when verified in another tab
  useEffect(() => {
    const id = setInterval(async () => {
      const verifiedUser = await checkEmailVerified();
      if (verifiedUser) {
        const prof = await loadProfile(verifiedUser.uid).catch(() => null);
        const dest = getRoleDestinationPath(
          prof?.role,
          verifiedUser,
          Boolean(prof?.profileCompleted)
        );
        navigate(dest, { replace: true });
      }
    }, 4000);
    return () => clearInterval(id);
  }, [navigate]);

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const verifiedUser = await checkEmailVerified();
      if (verifiedUser) {
        setHint({ text: 'Email verified! Redirecting…', tone: 'success' });
        const prof = await loadProfile(verifiedUser.uid).catch(() => null);
        const dest = getRoleDestinationPath(
          prof?.role,
          verifiedUser,
          Boolean(prof?.profileCompleted)
        );
        navigate(dest, { replace: true });
      } else {
        setHint({
          text: 'Still not verified yet — open the link in your email inbox and try again.',
          tone: 'error',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      await sendVerificationEmail(targetEmail);
      setCooldown(60);
      setHint({ text: `Verification email resent to ${targetEmail}`, tone: 'success' });
    } catch (err) {
      setHint({ text: friendlyError(err), tone: 'error' });
    }
  };

  const handleSignOut = async () => {
    await logOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="tf-verify-page">
      <div className="verify-shell">
        <div className="verify-card">
          <div className="verify-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>

          <h1>Verify your email</h1>
          <p className="verify-sub">
            We sent a confirmation link to <strong>{targetEmail}</strong>. Click the link in your
            email to activate your Talent Flow account.
          </p>

          <button
            type="button"
            className="btn-primary full"
            disabled={checking}
            onClick={handleCheckNow}
          >
            {checking ? 'Checking…' : "I've Verified My Email"}
          </button>

          <button
            type="button"
            className="btn-secondary full"
            disabled={cooldown > 0}
            onClick={handleResend}
          >
            {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend Verification Email'}
          </button>

          <div className={`verify-hint ${hint.tone}`}>{hint.text}</div>

          <button type="button" className="btn-text-muted" onClick={handleSignOut}>
            Sign out &amp; use a different account
          </button>
        </div>
      </div>
    </div>
  );
};
