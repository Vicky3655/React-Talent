import type {
  Assignment,
  AssignmentSubmission,
  Course,
  CourseMaterial,
  PublicInstructorProfile,
  StudentAssignmentDetail,
  StudentCourseProgress,
  StudentEnrollmentRow,
  StudentProfileDetail,
} from '../types';
import { supabase } from './supabaseClient';
import { COURSE_THUMB_FALLBACK } from '../utils/formatters';

function mapCourseRow(c: Record<string, unknown>): Course {
  return {
    id: String(c.id),
    instructorId: String(c.instructor_id || ''),
    title: String(c.title || ''),
    desc: String(c.description || ''),
    thumb: String(c.thumb || COURSE_THUMB_FALLBACK),
    alt: String(c.alt || c.title || 'Course'),
    lessons: Number(c.lessons || 1),
    status: String(c.status || 'draft'),
    notify: Boolean(c.notify),
    materials: Array.isArray(c.materials) ? (c.materials as CourseMaterial[]) : [],
    createdAt: (c.created_at as string) || null,
  };
}

function mapAssignmentRow(a: Record<string, unknown>): Assignment {
  return {
    id: String(a.id),
    instructorId: String(a.instructor_id || ''),
    title: String(a.title || ''),
    course: String(a.course || ''),
    instructions: String(a.instructions || ''),
    dueDate: String(a.due_date || ''),
    maxScore: Number(a.max_score || 100),
    assignTo: String(a.assign_to || 'all'),
    status: String(a.status || 'draft'),
    submissions: Array.isArray(a.submissions) ? (a.submissions as AssignmentSubmission[]) : [],
    createdAt: (a.created_at as string) || null,
  };
}

export async function getCourses(instructorId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapCourseRow(row as Record<string, unknown>));
}

export async function saveCourse(
  instructorId: string,
  courseData: {
    title: string;
    desc: string;
    thumb: string;
    alt: string;
    lessons: number;
    status: string;
    notify: boolean;
    materials: CourseMaterial[];
  },
  courseId: string | null = null
): Promise<string> {
  const payload = {
    title: courseData.title,
    description: courseData.desc,
    thumb: courseData.thumb,
    alt: courseData.alt,
    lessons: courseData.lessons,
    status: courseData.status,
    notify: courseData.notify,
    materials: courseData.materials || [],
  };

  if (courseId) {
    const { error } = await supabase.from('courses').update(payload).eq('id', courseId);
    if (error) throw error;
    return courseId;
  }

  const { data, error } = await supabase
    .from('courses')
    .insert({ ...payload, instructor_id: instructorId })
    .select('id')
    .single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

export async function updateCourseMaterials(
  courseId: string,
  materials: CourseMaterial[]
): Promise<void> {
  const { error } = await supabase.from('courses').update({ materials }).eq('id', courseId);
  if (error) throw error;
}

export async function uploadCourseThumbnail(
  instructorId: string,
  fileOrDataUrl: File | string
): Promise<string> {
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

  const path = `${instructorId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('course-thumbnails')
    .upload(path, fileBody, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('course-thumbnails').getPublicUrl(path);
  return data.publicUrl;
}

export async function getPublishedCourses(): Promise<Course[]> {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (courses || []) as Record<string, unknown>[];
  const instructorIds = [
    ...new Set(rows.map((c) => String(c.instructor_id || '')).filter(Boolean)),
  ];
  const profilesById: Record<string, { id: string; full_name?: string; avatar?: string }> = {};

  if (instructorIds.length) {
    const { data: profiles, error: pErr } = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar')
      .in('id', instructorIds);
    if (pErr) console.error('Could not load instructor profiles for course catalog:', pErr);
    (profiles || []).forEach((p) => {
      const rec = p as { id: string; full_name?: string; avatar?: string };
      profilesById[rec.id] = rec;
    });
  }

  return rows.map((c) => {
    const instId = String(c.instructor_id || '');
    const p = profilesById[instId] || {};
    return {
      ...mapCourseRow(c),
      instructorName: p.full_name || 'Talent Flow Instructor',
      instructorAvatar: p.avatar || '',
    };
  });
}

export async function getPublicProfile(userId: string): Promise<PublicInstructorProfile | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('public_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  let row = data as Record<string, unknown> | null;
  if (error || !row) {
    const fallback = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar, role')
      .eq('id', userId)
      .maybeSingle();
    row = fallback.data as Record<string, unknown> | null;
  }
  if (!row) return null;

  return {
    id: String(row.id || userId),
    fullName: String(row.full_name || 'Talent Flow Instructor'),
    email: String(row.email || ''),
    avatar: String(row.avatar || ''),
    bio: String(row.bio || ''),
    role: String(row.role || 'Instructor'),
    title: String(row.title || ''),
    expertise: String(row.expertise || ''),
    experience: row.experience !== undefined && row.experience !== null ? String(row.experience) : '',
    education: String(row.education || ''),
    linkedin: String(row.linkedin || ''),
    website: String(row.website || ''),
  };
}

export async function getAssignments(instructorId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapAssignmentRow(row as Record<string, unknown>));
}

export async function saveAssignment(
  instructorId: string,
  assignmentData: {
    title: string;
    course: string;
    instructions: string;
    dueDate: string;
    maxScore: number;
    assignTo: string;
    status: string;
    submissions?: AssignmentSubmission[];
  },
  assignmentId: string | null = null
): Promise<string> {
  const payload: Record<string, unknown> = {
    title: assignmentData.title,
    course: assignmentData.course,
    instructions: assignmentData.instructions,
    due_date: assignmentData.dueDate,
    max_score: assignmentData.maxScore,
    assign_to: assignmentData.assignTo,
    status: assignmentData.status,
  };
  if (assignmentData.submissions !== undefined) {
    payload.submissions = assignmentData.submissions;
  }

  if (assignmentId) {
    const { error } = await supabase.from('assignments').update(payload).eq('id', assignmentId);
    if (error) throw error;
    return assignmentId;
  }

  const { data, error } = await supabase
    .from('assignments')
    .insert({ ...payload, instructor_id: instructorId })
    .select('id')
    .single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

export async function deleteAssignmentDoc(assignmentId: string): Promise<void> {
  const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
  if (error) throw error;
}

export async function updateSubmissions(
  assignmentId: string,
  submissions: AssignmentSubmission[]
): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .update({ submissions })
    .eq('id', assignmentId);
  if (error) throw error;
}

export async function getStudentsForInstructor(
  instructorId: string
): Promise<StudentEnrollmentRow[]> {
  const { data: courses, error: cErr } = await supabase
    .from('courses')
    .select('id, title')
    .eq('instructor_id', instructorId);
  if (cErr) throw cErr;

  const courseRows = (courses || []) as { id: string; title: string }[];
  const courseIds = courseRows.map((c) => c.id);
  const courseTitleById: Record<string, string> = {};
  courseRows.forEach((c) => {
    courseTitleById[c.id] = c.title;
  });
  if (!courseIds.length) return [];

  const { data: enrollments, error: eErr } = await supabase
    .from('enrollments')
    .select('student_id, course_id, progress, enrolled_at')
    .in('course_id', courseIds);
  if (eErr) throw eErr;

  const byStudent: Record<
    string,
    { courseIds: string[]; enrolledAt: string | null }
  > = {};

  ((enrollments || []) as { student_id: string; course_id: string; enrolled_at?: string }[]).forEach(
    (e) => {
      if (!byStudent[e.student_id]) {
        byStudent[e.student_id] = {
          courseIds: [],
          enrolledAt: e.enrolled_at || null,
        };
      }
      const rec = byStudent[e.student_id];
      rec.courseIds.push(e.course_id);
      if (e.enrolled_at && (!rec.enrolledAt || e.enrolled_at < rec.enrolledAt)) {
        rec.enrolledAt = e.enrolled_at;
      }
    }
  );

  const studentIds = Object.keys(byStudent);
  if (!studentIds.length) return [];

  let profiles: Record<string, unknown>[] = [];
  const { data: fullProfiles, error: pErr } = await supabase
    .from('public_profiles')
    .select('*')
    .in('id', studentIds);

  if (pErr) {
    console.warn('Could not load extended student profiles, falling back to basic fields:', pErr);
    const { data: basicProfiles, error: basicErr } = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar')
      .in('id', studentIds);
    if (basicErr) console.error('Could not load student profiles:', basicErr);
    profiles = (basicProfiles || []) as Record<string, unknown>[];
  } else {
    profiles = (fullProfiles || []) as Record<string, unknown>[];
  }

  const profileById: Record<string, Record<string, unknown>> = {};
  profiles.forEach((p) => {
    profileById[String(p.id)] = p;
  });

  const assignments = await getAssignments(instructorId);
  const gradeStats: Record<string, { sum: number; count: number }> = {};
  assignments.forEach((a) => {
    const max = a.maxScore || 100;
    (a.submissions || []).forEach((s) => {
      if (s.score === null || s.score === undefined) return;
      if (!gradeStats[s.studentId]) gradeStats[s.studentId] = { sum: 0, count: 0 };
      gradeStats[s.studentId].sum += (s.score / max) * 100;
      gradeStats[s.studentId].count += 1;
    });
  });

  return studentIds.map((id) => {
    const rec = byStudent[id];
    const p = profileById[id] || {};
    const g = gradeStats[id];
    const grade = g && g.count ? Math.round(g.sum / g.count) : null;
    const status: 'active' | 'at-risk' | 'inactive' =
      grade !== null && grade < 55 ? 'at-risk' : 'active';
    return {
      id,
      name: String(p.full_name || 'Talent Flow Student'),
      email: String(p.email || ''),
      avatar: String(p.avatar || ''),
      courseIds: rec.courseIds,
      courseTitles: rec.courseIds.map((cid) => courseTitleById[cid]).filter(Boolean),
      grade,
      enrolledAt: rec.enrolledAt,
      status,
    };
  });
}

export async function getStudentProfileDetail(
  instructorId: string,
  studentId: string,
  summaryOverride?: { grade: number | null; enrolledAt: string | null; status: 'active' | 'at-risk' | 'inactive' }
): Promise<StudentProfileDetail> {
  let publicProfile: Record<string, unknown> | null = null;
  let fullProfile: Record<string, unknown> | null = null;

  try {
    const { data } = await supabase
      .from('public_profiles')
      .select('*')
      .eq('id', studentId)
      .maybeSingle();
    publicProfile = (data as Record<string, unknown> | null) || null;
  } catch (err) {
    console.warn('Could not load public profile:', err);
  }

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar, bio, role, education_level, field_of_study, interests, goals, linkedin, github, website')
      .eq('id', studentId)
      .maybeSingle();
    fullProfile = (data as Record<string, unknown> | null) || null;
  } catch {
    // Expected if RLS restricts reading another user's private profile row
  }

  const merged: Record<string, unknown> = { ...(publicProfile || {}), ...(fullProfile || {}) };

  const { data: courses, error: cErr } = await supabase
    .from('courses')
    .select('id, title, thumb, lessons')
    .eq('instructor_id', instructorId);
  if (cErr) throw cErr;

  const courseRows = (courses || []) as { id: string; title: string; thumb: string; lessons: number }[];
  const courseIds = courseRows.map((c) => c.id);
  const courseById: Record<string, { id: string; title: string; thumb: string; lessons: number }> = {};
  courseRows.forEach((c) => {
    courseById[c.id] = c;
  });

  let enrolledCourses: StudentCourseProgress[] = [];
  if (courseIds.length) {
    const { data: enrRows, error: eErr } = await supabase
      .from('enrollments')
      .select('course_id, course_title, progress, completed_lessons, lessons, enrolled_at')
      .eq('student_id', studentId)
      .in('course_id', courseIds);
    if (eErr) throw eErr;
    enrolledCourses = (
      (enrRows || []) as {
        course_id: string;
        course_title?: string;
        progress?: number;
        lessons?: number;
        enrolled_at?: string;
      }[]
    ).map((e) => {
      const c = courseById[e.course_id] || { title: 'Course', thumb: '', lessons: 0 };
      return {
        id: e.course_id,
        title: e.course_title || c.title || 'Course',
        thumb: c.thumb || '',
        progress: typeof e.progress === 'number' ? e.progress : 0,
        lessons: e.lessons || c.lessons || 0,
        enrolledAt: e.enrolled_at || null,
      };
    });
  }

  const enrolledCourseTitles = new Set(enrolledCourses.map((e) => e.title));
  const assignments = await getAssignments(instructorId);
  const studentAssignments: StudentAssignmentDetail[] = assignments
    .filter(
      (a) =>
        enrolledCourseTitles.has(a.course) ||
        (a.submissions || []).some((s) => s.studentId === studentId)
    )
    .map((a) => {
      const sub = (a.submissions || []).find((s) => s.studentId === studentId) || null;
      const status: 'graded' | 'submitted' | 'pending' =
        sub && sub.score !== null && sub.score !== undefined
          ? 'graded'
          : sub
            ? 'submitted'
            : 'pending';
      return {
        id: a.id,
        title: a.title,
        course: a.course,
        dueDate: a.dueDate,
        maxScore: a.maxScore || 100,
        status,
        submittedAt: sub?.submittedAt || null,
        score: sub?.score ?? null,
        feedback: sub?.feedback || '',
      };
    });

  return {
    id: studentId,
    fullName: String(merged.full_name || 'Talent Flow Student'),
    email: String(merged.email || ''),
    avatar: String(merged.avatar || ''),
    bio: String(merged.bio || ''),
    educationLevel: String(merged.education_level || ''),
    fieldOfStudy: String(merged.field_of_study || ''),
    interests: String(merged.interests || ''),
    goals: String(merged.goals || ''),
    linkedin: String(merged.linkedin || ''),
    github: String(merged.github || ''),
    enrolledCourses,
    assignments: studentAssignments,
    avgGrade: summaryOverride?.grade ?? null,
    enrolledAt: summaryOverride?.enrolledAt ?? enrolledCourses[0]?.enrolledAt ?? null,
    status: summaryOverride?.status ?? 'active',
  };
}

export interface StudentAssignmentItem extends Assignment {
  submission: AssignmentSubmission | null;
}

export async function getAssignmentsForStudent(
  studentId: string
): Promise<StudentAssignmentItem[]> {
  const { data: enrollments, error: eErr } = await supabase
    .from('enrollments')
    .select('course_title')
    .eq('student_id', studentId);
  if (eErr) throw eErr;

  const courseTitles = [
    ...new Set(
      ((enrollments || []) as { course_title?: string }[])
        .map((e) => e.course_title)
        .filter((v): v is string => Boolean(v))
    ),
  ];
  if (!courseTitles.length) return [];

  const { data: assignments, error: aErr } = await supabase
    .from('assignments')
    .select('*')
    .in('course', courseTitles)
    .neq('status', 'draft')
    .order('due_date', { ascending: true });
  if (aErr) throw aErr;

  return (assignments || []).map((a) => {
    const mapped = mapAssignmentRow(a as Record<string, unknown>);
    const submission = mapped.submissions.find((s) => s.studentId === studentId) || null;
    return { ...mapped, submission };
  });
}

export async function submitStudentAssignment(
  assignmentId: string,
  _studentId: string,
  submission: { text?: string; link?: string }
): Promise<unknown> {
  const { data, error } = await supabase.rpc('submit_assignment', {
    p_assignment_id: assignmentId,
    p_text: submission.text || '',
    p_link: submission.link || '',
  });
  if (error) throw error;
  return data;
}

export async function persistInviteRecord(payload: {
  token: string;
  instructorId: string;
  email: string | null;
  courseIds: string[];
  message: string | null;
}): Promise<void> {
  try {
    await supabase.from('invites').insert({
      token: payload.token,
      instructor_id: payload.instructorId,
      email: payload.email,
      course_ids: payload.courseIds,
      message: payload.message,
    });
  } catch {
    // Optional best-effort table insert; never block email sending or link sharing
  }
}
