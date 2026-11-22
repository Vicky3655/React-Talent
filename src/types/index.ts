export type UserRole = 'Instructor' | 'Student' | '';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  emailVerified: boolean;
  providerData: { providerId: string }[];
}

export interface NotificationPrefs {
  email?: boolean;
  assignments?: boolean;
  enrollments?: boolean;
  platform?: boolean;
  courses?: boolean;
}

export interface UserSettings {
  language?: string;
  timezone?: string;
  twoFactor?: boolean;
  emailNotifs?: boolean;
  subAlerts?: boolean;
  enrollAlerts?: boolean;
  notifications?: NotificationPrefs;
}

export interface UserProfile {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  bio?: string;
  role?: UserRole | string;
  avatar?: string;
  provider?: string;
  username?: string;
  profileCompleted?: boolean;
  title?: string;
  expertise?: string;
  experience?: string | number;
  education?: string;
  linkedin?: string;
  website?: string;
  educationLevel?: string;
  fieldOfStudy?: string;
  interests?: string;
  goals?: string;
  github?: string;
  settings?: UserSettings;
  createdAt?: string;
}

export interface CourseMaterial {
  name: string;
  size: string;
  type: 'pdf' | 'doc' | 'ppt' | 'vid' | 'img' | 'zip' | 'other' | string;
  cls?: string;
  url?: string;
  dataUrl?: string;
  uploadedAt?: string;
}

export interface Course {
  id: string;
  instructorId: string;
  instructorName?: string;
  instructorAvatar?: string;
  title: string;
  desc: string;
  thumb: string;
  alt: string;
  lessons: number;
  status: 'published' | 'draft' | string;
  notify: boolean;
  materials: CourseMaterial[];
  createdAt?: string | null;
}

export interface AssignmentSubmission {
  studentId: string;
  studentName?: string;
  studentAvatar?: string;
  submittedAt: string | null;
  score: number | null;
  feedback?: string;
  gradedAt?: string | null;
  text?: string;
  submissionText?: string;
  submissionLink?: string;
  link?: string;
}

export interface Assignment {
  id: string;
  instructorId: string;
  title: string;
  course: string;
  instructions: string;
  dueDate: string;
  maxScore: number;
  assignTo: 'all' | 'cohort' | string;
  status: 'published' | 'draft' | 'closed' | string;
  submissions: AssignmentSubmission[];
  createdAt?: string | null;
}

export interface StudentEnrollmentRow {
  id: string;
  name: string;
  email: string;
  avatar: string;
  courseIds: string[];
  courseTitles: string[];
  enrolledAt: string | null;
  grade: number | null;
  status: 'active' | 'at-risk' | 'inactive';
}

export interface StudentCourseProgress {
  id: string;
  title: string;
  thumb: string;
  lessons: number;
  enrolledAt: string | null;
  progress: number;
}

export interface StudentAssignmentDetail {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  maxScore: number;
  status: 'graded' | 'submitted' | 'pending';
  submittedAt: string | null;
  score: number | null;
  feedback: string;
}

export interface StudentProfileDetail {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
  bio: string;
  educationLevel: string;
  fieldOfStudy: string;
  interests: string;
  goals: string;
  linkedin: string;
  github: string;
  enrolledCourses: StudentCourseProgress[];
  assignments: StudentAssignmentDetail[];
  avgGrade: number | null;
  enrolledAt: string | null;
  status: 'active' | 'at-risk' | 'inactive';
}

export interface PublicInstructorProfile {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
  bio: string;
  role: string;
  title: string;
  expertise: string;
  experience: string;
  education: string;
  linkedin: string;
  website: string;
}

export interface EnrollmentRecord {
  id: string;
  courseId: string;
  instructorId: string;
  enrolledAt: string | null;
}

export type NotificationCategory = 'course' | 'assignment' | 'student';

export interface NotificationItem {
  id: string;
  instructorId: string;
  studentId: string;
  studentName: string;
  studentAvatar: string;
  type: 'enrollment' | 'material_access' | 'submission' | string;
  category: NotificationCategory | string;
  courseId: string;
  courseTitle: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface UnreadCounts {
  total: number;
  course: number;
  assignment: number;
  student: number;
}

export interface CalendarEventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export interface CalendarClassEvent {
  id: string;
  title: string;
  description: string;
  courseId: string;
  courseTitle: string;
  start: string;
  end: string;
  meetUrl: string;
  htmlLink: string;
  attendees: CalendarEventAttendee[];
}

export interface InstantMeetSpace {
  name: string;
  meetingUri: string;
  meetingCode: string;
}

export interface ToastMessage {
  id: string;
  title?: string;
  message: string;
  type: 'success' | 'warn' | 'error' | 'info';
}
