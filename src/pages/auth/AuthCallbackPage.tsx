import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  clearPendingVerification,
  getRoleDestinationPath,
  loadProfile,
} from '../../services/authService';
import { supabase } from '../../services/supabaseClient';

export const AuthCallbackPage: React.FC = () => {
  const { authReady, user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [statusText, setStatusText] = useState('Completing sign-in…');

  useEffect(() => {
    let active = true;

    const finalize = async () => {
      if (!authReady) return;

      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser && !user) {
        if (active) {
          setStatusText('Session not found. Redirecting to sign in…');
          setTimeout(() => navigate('/login', { replace: true }), 1000);
        }
        return;
      }

      clearPendingVerification();
      const currentUser = user || (await refreshUser());
      if (!currentUser || !active) return;

      const prof = await loadProfile(currentUser.uid).catch(() => null);
      if (!active) return;

      const dest = getRoleDestinationPath(
        prof?.role,
        currentUser,
        Boolean(prof?.profileCompleted)
      );
      navigate(dest, { replace: true });
    };

    finalize();
    return () => {
      active = false;
    };
  }, [authReady, user, refreshUser, navigate]);

  return (
    <div className="tf-verify-page">
      <div className="verify-shell">
        <div className="verify-card">
          <div className="verify-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h1>Signing you in</h1>
          <p className="verify-sub">{statusText}</p>
        </div>
      </div>
    </div>
  );
};
