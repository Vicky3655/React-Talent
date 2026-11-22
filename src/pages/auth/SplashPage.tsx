import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getRoleDestinationPath } from '../../services/authService';

export const SplashPage: React.FC = () => {
  const { user, profile, authReady } = useAuth();
  const navigate = useNavigate();
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const t1 = setTimeout(() => {
      setFading(true);
    }, 850);
    const t2 = setTimeout(() => {
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      if (!user.emailVerified) {
        navigate('/verify-email', { replace: true });
        return;
      }
      const dest = getRoleDestinationPath(
        profile?.role,
        user,
        Boolean(profile?.profileCompleted)
      );
      navigate(dest, { replace: true });
    }, 1250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [authReady, user, profile, navigate]);

  return (
    <div className="tf-splash-page">
      <div className={`container${fading ? ' loaded' : ''}`}>
        <div className="splash-content">
          <div className="splash-logo">
            <img src="/4420721.jpg" alt="Talent Flow Logo" className="logo-img" />
          </div>
          <h1>Talent Flow</h1>
          <p>Online Learning Platform</p>
        </div>
        <div className="loader" aria-label="Loading" />
      </div>
    </div>
  );
};
