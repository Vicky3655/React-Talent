import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'Instructor' | 'Student';
  requireVerified?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requireVerified = true,
}) => {
  const { user, profile, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
          color: '#475569',
          background: '#F4F5F7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 500 }}>
          <span>Loading Talent Flow…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requireVerified && !user.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (requiredRole && profile?.role && profile.role !== requiredRole) {
    const dest =
      profile.role === 'Instructor' ? '/instructor/dashboard' : '/student/dashboard';
    return <Navigate to={dest} replace />;
  }

  return <>{children}</>;
};
