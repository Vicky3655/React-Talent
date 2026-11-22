import type { AuthUser, NotificationCategory, NotificationItem, UnreadCounts } from '../types';
import { supabase } from './supabaseClient';

function mapRow(r: Record<string, unknown>): NotificationItem {
  const cats = Array.isArray(r.categories) ? (r.categories as string[]) : [];
  return {
    id: String(r.id),
    instructorId: String(r.instructor_id || ''),
    studentId: String(r.student_id || ''),
    studentName: String(r.student_name || 'A student'),
    studentAvatar: String(r.student_avatar || ''),
    type: String(r.type || ''),
    category: (cats[0] as NotificationCategory) || 'course',
    courseId: String(r.course_id || ''),
    courseTitle: String(r.course_title || ''),
    message: String(r.message || ''),
    read: Boolean(r.read),
    createdAt: String(r.created_at || new Date().toISOString()),
  };
}

export function resolveStudentIdentity(user: AuthUser | null): {
  id: string | null;
  name: string;
  avatar: string;
} {
  let bridge: Record<string, string> = {};
  try {
    const raw = localStorage.getItem('tf_student_profile');
    bridge = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    bridge = {};
  }
  const email = user?.email || '';
  return {
    id: user?.uid || null,
    name: bridge.fullName || user?.displayName || (email ? email.split('@')[0] : 'A student'),
    avatar: bridge.avatar || user?.photoURL || '',
  };
}

async function createNotification(patch: {
  instructorId: string;
  studentId?: string | null;
  studentName?: string;
  studentAvatar?: string;
  type: string;
  categories: NotificationCategory[];
  courseId?: string;
  courseTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
  message: string;
}): Promise<NotificationItem | null> {
  if (!patch.instructorId || !patch.message) return null;

  const row = {
    instructor_id: patch.instructorId,
    student_id: patch.studentId || null,
    student_name: patch.studentName || null,
    student_avatar: patch.studentAvatar || null,
    type: patch.type,
    categories: patch.categories,
    course_id: patch.courseId || null,
    course_title: patch.courseTitle || null,
    assignment_id: patch.assignmentId || null,
    assignment_title: patch.assignmentTitle || null,
    message: patch.message,
  };

  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert(row)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch (err) {
    console.error('Could not create notification:', err);
    return null;
  }
}

export function notifyEnrollment(params: {
  instructorId: string;
  studentId?: string | null;
  studentName?: string;
  studentAvatar?: string;
  courseId?: string;
  courseTitle?: string;
}): Promise<NotificationItem | null> {
  return createNotification({
    ...params,
    type: 'enrollment',
    categories: ['course', 'student'],
    message: `${params.studentName || 'A student'} enrolled in ${params.courseTitle || 'your course'}`,
  });
}

export function notifyMaterialAccess(params: {
  instructorId: string;
  studentId?: string | null;
  studentName?: string;
  studentAvatar?: string;
  courseId?: string;
  courseTitle?: string;
}): Promise<NotificationItem | null> {
  return createNotification({
    ...params,
    type: 'material_view',
    categories: ['course'],
    message: `${params.studentName || 'A student'} opened the materials for ${params.courseTitle || 'your course'}`,
  });
}

export function notifySubmission(params: {
  instructorId: string;
  studentId?: string | null;
  studentName?: string;
  studentAvatar?: string;
  courseId?: string;
  courseTitle?: string;
  assignmentId?: string;
  assignmentTitle?: string;
}): Promise<NotificationItem | null> {
  return createNotification({
    ...params,
    type: 'submission',
    categories: ['assignment'],
    message: `${params.studentName || 'A student'} submitted "${params.assignmentTitle || 'an assignment'}"${
      params.courseTitle ? ` in ${params.courseTitle}` : ''
    }`,
  });
}

export async function getRecent(instructorId: string, limit = 30): Promise<NotificationItem[]> {
  if (!instructorId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Loading notifications failed:', error);
    return [];
  }
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getForCourse(
  instructorId: string,
  courseId: string,
  limit = 20
): Promise<NotificationItem[]> {
  if (!instructorId || !courseId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('instructor_id', instructorId)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Loading course activity failed:', error);
    return [];
  }
  return (data || []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getUnreadSummary(instructorId: string): Promise<UnreadCounts> {
  const empty: UnreadCounts = { total: 0, course: 0, assignment: 0, student: 0 };
  if (!instructorId) return empty;

  const { data, error } = await supabase
    .from('notifications')
    .select('categories')
    .eq('instructor_id', instructorId)
    .eq('read', false);
  if (error) {
    console.error('Loading unread notification summary failed:', error);
    return empty;
  }

  const summary: UnreadCounts = { ...empty };
  ((data || []) as { categories?: string[] }[]).forEach((row) => {
    summary.total += 1;
    (row.categories || []).forEach((cat) => {
      if (cat === 'course' || cat === 'assignment' || cat === 'student') {
        summary[cat] += 1;
      }
    });
  });
  return summary;
}

export async function markAllRead(instructorId: string): Promise<void> {
  if (!instructorId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('instructor_id', instructorId)
    .eq('read', false);
  if (error) console.error('Marking all notifications read failed:', error);
}

export async function markCategoryRead(
  instructorId: string,
  category: NotificationCategory
): Promise<void> {
  if (!instructorId || !category) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('instructor_id', instructorId)
    .eq('read', false)
    .contains('categories', [category]);
  if (error) console.error(`Marking "${category}" notifications read failed:`, error);
}

export function subscribeToInstructor(
  instructorId: string,
  onInsert: (item: NotificationItem) => void
): () => void {
  if (!instructorId) return () => {};

  const channel = supabase
    .channel(`notifications-${instructorId}-${Math.random().toString(36).slice(2, 6)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `instructor_id=eq.${instructorId}`,
      },
      (payload) => onInsert(mapRow(payload.new as Record<string, unknown>))
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
