import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ToastContainer } from './components/ToastContainer';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AuthCallbackPage } from './pages/auth/AuthCallbackPage';
import { ChooseRolePage } from './pages/auth/ChooseRolePage';
import { LoginPage } from './pages/auth/LoginPage';
import { PasswordResetPage } from './pages/auth/PasswordResetPage';
import { ProfileSetupPage } from './pages/auth/ProfileSetupPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { SplashPage } from './pages/auth/SplashPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import InstructorAssignmentsPage from './pages/instructor/InstructorAssignmentsPage';
import InstructorCoursesPage from './pages/instructor/InstructorCoursesPage';
import InstructorDashboardPage from './pages/instructor/InstructorDashboardPage';
import InstructorPerformancePage from './pages/instructor/InstructorPerformancePage';
import InstructorSettingsPage from './pages/instructor/InstructorSettingsPage';
import InstructorStudentsPage from './pages/instructor/InstructorStudentsPage';
import { StudentAssignmentsPage } from './pages/student/StudentAssignmentsPage';
import { StudentCoursesPage } from './pages/student/StudentCoursesPage';
import { StudentDashboardPage } from './pages/student/StudentDashboardPage';
import { StudentSettingsPage } from './pages/student/StudentSettingsPage';

const LegacyRedirect: React.FC<{ to: string }> = ({ to }) => {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public / Auth & Onboarding */}
            <Route path="/" element={<SplashPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/password" element={<PasswordResetPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/auth-callback" element={<AuthCallbackPage />} />
            <Route path="/choose-role" element={<ChooseRolePage />} />
            <Route
              path="/instructor-profile"
              element={
                <ProtectedRoute>
                  <ProfileSetupPage role="Instructor" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student-profile"
              element={
                <ProtectedRoute>
                  <ProfileSetupPage role="Student" />
                </ProtectedRoute>
              }
            />

            {/* Instructor Portal */}
            <Route
              path="/instructor/dashboard"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/courses"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorCoursesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/assignments"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorAssignmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/students"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorStudentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/performance"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorPerformancePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructor/settings"
              element={
                <ProtectedRoute requiredRole="Instructor">
                  <InstructorSettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Student Portal */}
            <Route
              path="/student/dashboard"
              element={
                <ProtectedRoute requiredRole="Student">
                  <StudentDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/courses"
              element={
                <ProtectedRoute requiredRole="Student">
                  <StudentCoursesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/assignments"
              element={
                <ProtectedRoute requiredRole="Student">
                  <StudentAssignmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/settings"
              element={
                <ProtectedRoute requiredRole="Student">
                  <StudentSettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Legacy .html & /Project2/*.html Redirects preserving query/hash */}
            <Route path="/index.html" element={<LegacyRedirect to="/" />} />
            <Route path="/login.html" element={<LegacyRedirect to="/login" />} />
            <Route path="/register.html" element={<LegacyRedirect to="/register" />} />
            <Route path="/password.html" element={<LegacyRedirect to="/password" />} />
            <Route path="/verify-email.html" element={<LegacyRedirect to="/verify-email" />} />
            <Route path="/auth-callback.html" element={<LegacyRedirect to="/auth-callback" />} />
            <Route path="/choose-role.html" element={<LegacyRedirect to="/choose-role" />} />
            <Route path="/instructor-profile.html" element={<LegacyRedirect to="/instructor-profile" />} />
            <Route path="/student-profile.html" element={<LegacyRedirect to="/student-profile" />} />
            <Route path="/instructor-dashboard.html" element={<LegacyRedirect to="/instructor/dashboard" />} />
            <Route path="/courses.html" element={<LegacyRedirect to="/instructor/courses" />} />
            <Route path="/instructor-assignments.html" element={<LegacyRedirect to="/instructor/assignments" />} />
            <Route path="/students.html" element={<LegacyRedirect to="/instructor/students" />} />
            <Route path="/performance.html" element={<LegacyRedirect to="/instructor/performance" />} />
            <Route path="/settings.html" element={<LegacyRedirect to="/instructor/settings" />} />

            <Route path="/Project2/dashboard.html" element={<LegacyRedirect to="/student/dashboard" />} />
            <Route path="/Project2/courses.html" element={<LegacyRedirect to="/student/courses" />} />
            <Route path="/Project2/assignments.html" element={<LegacyRedirect to="/student/assignments" />} />
            <Route path="/Project2/settings.html" element={<LegacyRedirect to="/student/settings" />} />

            {/* Fallback */}
            <Route path="*" element={<LegacyRedirect to="/" />} />
          </Routes>
          <ToastContainer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
