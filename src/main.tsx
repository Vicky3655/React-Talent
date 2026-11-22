import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/base.css';
import './styles/auth.css';
import './styles/onboarding.css';
import './styles/profile.css';
import './styles/instructor-layout.css';
import './styles/instructor-dashboard.css';
import './styles/instructor-courses.css';
import './styles/instructor-assignments.css';
import './styles/instructor-students.css';
import './styles/instructor-performance.css';
import './styles/instructor-settings.css';
import './styles/student-layout.css';
import './styles/student-dashboard.css';
import './styles/student-courses.css';
import './styles/student-assignments.css';
import './styles/student-settings.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
