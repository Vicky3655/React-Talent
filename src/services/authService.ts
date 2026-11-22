import type { User } from '@supabase/supabase-js';
import type { AuthUser, EnrollmentRecord, UserProfile, UserSettings } from '../types';
import { supabase } from './supabaseClient';
import { initialsAvatar } from '../utils/formatters';

const PENDING_VERIFICATION_KEY = 'tf_pending_verification';

const PROFILE_COLUMNS: Record<string, string> = {
  fullName: 'full_name',
  email: 'email',
  bio: 'bio',
  role: 'role',
  avatar: 'avatar',
  provider: 'provider',
  username: 'username',
  profileCompleted: 'profile_completed',
  title: 'title',
  expertise: 'expertise',
  experience: 'experience',
  education: 'education',
  linkedin: 'linkedin',
  website: 'website',
  educationLevel: 'education_level',
  fieldOfStudy: 'field_of_study',
  interests: 'interests',
  goals: 'goals',
  github: 'github',
  settings: 'settings',
};

function withTimeout<T>(promise: PromiseLike<T>, ms = 4000, message = 'Request timed out'): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function toDbPatch(data: Partial<UserProfile>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'name' && data.fullName === undefined) {
      patch.full_name = value;
      return;
    }
    patch[PROFILE_COLUMNS[key] || key] = value;
  });
  return patch;
}

function fromDbRow(row: Record<string, unknown> | null): UserProfile | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  if (typeof row.id === 'string') out.id = row.id;
  if (typeof row.created_at === 'string') out.createdAt = row.created_at;
  Object.entries(PROFILE_COLUMNS).forEach(([camel, col]) => {
    if (row[col] !== undefined) out[camel] = row[col];
  });
  return out as UserProfile;
}

export function normalizeUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const providerId =
    (user.app_metadata?.provider as string | undefined) || 'email';
  return {
    uid: user.id,
    email: user.email || '',
    displayName: String(meta.full_name || meta.name || ''),
    photoURL: String(meta.avatar_url || meta.picture || ''),
    emailVerified: Boolean(user.email_confirmed_at),
    providerData: [{ providerId }],
  };
}

export function friendlyError(err: unknown): string {
  const obj = err as { message?: string; error_description?: string } | null;
  const raw = (obj && (obj.message || obj.error_description)) || String(err || '');
  console.error('Auth/Storage error:', raw);
  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials')) return 'Incorrect email or password';
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return "That email's already registered — try logging in instead";
  }
  if (msg.includes('password should be at least') || msg.includes('weak password')) {
    return 'Please use at least 8 characters';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts — please wait a moment and try again';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Network error — check your connection and try again';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please confirm your email before logging in';
  }
  if (msg.includes('row-level security') || msg.includes('permission denied')) {
    return "That action isn't permitted — check your account permissions";
  }
  if (msg.includes('bucket') || msg.includes('storage')) {
    return "Photo upload isn't permitted — check your Supabase Storage setup";
  }
  if (msg.includes('invalid email')) return 'Enter a valid email address';

  return 'Something went wrong — please try again';
}

export function setPendingVerification(email: string, name?: string): void {
  try {
    sessionStorage.setItem(PENDING_VERIFICATION_KEY, JSON.stringify({ email, name: name || '' }));
  } catch (err) {
    console.error('Could not stash pending verification email:', err);
  }
}

export function getPendingVerificationEmail(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFICATION_KEY);
    return raw ? (JSON.parse(raw).email as string) || null : null;
  } catch {
    return null;
  }
}

export function clearPendingVerification(): void {
  try {
    sessionStorage.removeItem(PENDING_VERIFICATION_KEY);
  } catch {
    // ignore
  }
}

export function isAuthRedirectReturn(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const hasToken = hash.includes('access_token');
  const hasCode = new URLSearchParams(window.location.search || '').has('code');
  return hasToken || hasCode;
}

export function getRoleDestinationPath(
  role?: string | null,
  user?: AuthUser | null,
  goToDashboard = false
): string {
  if (user && !user.emailVerified) return '/verify-email';
  if (role === 'Instructor') {
    return goToDashboard ? '/instructor/dashboard' : '/instructor-profile';
  }
  if (role === 'Student') {
    return goToDashboard ? '/student/dashboard' : '/student-profile';
  }
  return '/choose-role';
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = `${window.location.origin}/auth-callback`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<{ user: AuthUser; role: string }> {
  const redirectTo = `${window.location.origin}/auth-callback`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  const user = normalizeUser(data.user);
  if (!user) throw new Error('Account creation did not return user details');

  setPendingVerification(email, name);
  await saveProfile(user.uid, {
    fullName: name,
    email,
    role: '',
    provider: 'email',
  }).catch((err) => {
    console.error('Profile save failed (continuing anyway):', err);
  });

  return { user, role: '' };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: AuthUser; role: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const user = normalizeUser(data.user);
  if (!user) throw new Error('Login did not return user details');

  clearPendingVerification();
  let role = '';
  try {
    const profile = await loadProfile(user.uid);
    role = profile?.role || '';
  } catch (err) {
    console.error('Profile read failed (continuing anyway):', err);
  }
  return { user, role };
}

export async function sendResetLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function confirmPasswordReset(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function sendVerificationEmail(fallbackEmail?: string | null): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email || fallbackEmail || getPendingVerificationEmail();
  if (!email) throw new Error('Not signed in');
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
}

export async function checkEmailVerified(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  const normalized = normalizeUser(data.user);
  return normalized?.emailVerified ? normalized : null;
}

export async function logOut(): Promise<void> {
  clearPendingVerification();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function saveProfile(uid: string, data: Partial<UserProfile>): Promise<Partial<UserProfile>> {
  const patch = toDbPatch(data);
  const { error } = await withTimeout(
    supabase.from('profiles').upsert({ id: uid, ...patch }, { onConflict: 'id' })
  );
  if (error) throw error;
  return data;
}

export async function loadProfile(uid: string): Promise<UserProfile | null> {
  const { data, error } = await withTimeout(
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  );
  if (error) throw error;
  return fromDbRow(data as Record<string, unknown> | null);
}

export async function saveSettings(
  uid: string,
  currentSettings: UserSettings | undefined,
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const merged: UserSettings = { ...(currentSettings || {}), ...patch };
  await saveProfile(uid, { settings: merged });
  return merged;
}

export async function uploadAvatar(uid: string, fileOrDataUrl: File | string): Promise<string> {
  const timeoutMsg =
    'Photo upload timed out. In the Supabase dashboard, check Storage -> make sure the "avatars" bucket exists.';

  let fileBody: Blob | File = fileOrDataUrl as File;
  let contentType = 'image/jpeg';
  let ext = 'jpg';

  if (typeof fileOrDataUrl === 'string') {
    const res = await fetch(fileOrDataUrl);
    fileBody = await res.blob();
    contentType = fileBody.type || contentType;
  } else {
    contentType = fileOrDataUrl.type || contentType;
    const nameExt = (fileOrDataUrl.name || '').split('.').pop();
    if (nameExt) ext = nameExt;
  }

  const path = `${uid}/${Date.now()}.${ext}`;
  const { error: uploadError } = await withTimeout(
    supabase.storage.from('avatars').upload(path, fileBody, { contentType, upsert: true }),
    20000,
    timeoutMsg
  );
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function findStudentByEmail(
  email: string
): Promise<{ uid: string; fullName: string; avatar: string; email: string } | null> {
  const { data, error } = await withTimeout(
    supabase.rpc('find_student_by_email', { lookup_email: email })
  );
  if (error) {
    console.error('Student lookup failed:', error);
    return null;
  }
  if (!data || !Array.isArray(data) || !data.length) return null;
  const row = data[0] as { uid: string; full_name: string; avatar: string; email: string };
  return { uid: row.uid, fullName: row.full_name, avatar: row.avatar, email: row.email };
}

export async function enrollInCourse(
  studentUid: string,
  course: { id: string; title: string; thumb?: string; lessons?: number; instructorName?: string }
): Promise<void> {
  const { error } = await withTimeout(
    supabase.from('enrollments').upsert(
      {
        student_id: studentUid,
        course_id: course.id,
        course_title: course.title,
        thumb: course.thumb || '',
        lessons: course.lessons || 0,
        instructor_name: course.instructorName || '',
        progress: 0,
        completed_lessons: 0,
      },
      { onConflict: 'student_id,course_id' }
    )
  );
  if (error) throw error;
}

export async function listMyEnrollments(studentUid: string): Promise<EnrollmentRecord[]> {
  const { data, error } = await withTimeout(
    supabase.from('enrollments').select('*').eq('student_id', studentUid)
  );
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    courseId: String(r.course_id || ''),
    instructorId: String(r.instructor_id || ''),
    enrolledAt: (r.enrolled_at as string) || null,
  }));
}

export interface FullEnrollmentRow {
  id: string;
  courseId: string;
  courseTitle: string;
  thumb: string;
  lessons: number;
  instructorName: string;
  progress: number;
  completedLessons: number;
  enrolledAt: string | null;
}

export async function listMyEnrollmentDetails(studentUid: string): Promise<FullEnrollmentRow[]> {
  const { data, error } = await withTimeout(
    supabase.from('enrollments').select('*').eq('student_id', studentUid)
  );
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    courseId: String(r.course_id || ''),
    courseTitle: String(r.course_title || ''),
    thumb: String(r.thumb || ''),
    lessons: Number(r.lessons || 0),
    instructorName: String(r.instructor_name || ''),
    progress: Number(r.progress || 0),
    completedLessons: Number(r.completed_lessons || 0),
    enrolledAt: (r.enrolled_at as string) || null,
  }));
}

export { initialsAvatar };
