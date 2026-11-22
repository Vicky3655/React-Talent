import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import type { CalendarClassEvent, InstantMeetSpace } from '../types';
import { sanitizeUrl } from '../utils/formatters';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
];

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let providerInstance: GoogleAuthProvider | null = null;
let initPromise: Promise<{ app: FirebaseApp; auth: Auth; provider: GoogleAuthProvider }> | null = null;

// Strictly in-memory only — never persisted to localStorage or sessionStorage.
let cachedAccessToken: string | null = null;
let currentGoogleUser: User | null = null;
let isSigningIn = false;

type AuthListener = (user: User | null, token: string | null) => void;
const authListeners = new Set<AuthListener>();

function notifyListeners(user: User | null, token: string | null): void {
  authListeners.forEach((cb) => {
    try {
      cb(user, token);
    } catch (err) {
      console.error('Google Workspace listener error:', err);
    }
  });
}

async function ensureInitialized() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const res = await fetch('/firebase-applet-config.json');
    if (!res.ok) {
      throw new Error('Could not load Google Workspace configuration');
    }
    const firebaseConfig = await res.json();
    const existingApps = getApps();
    appInstance = existingApps.length ? existingApps[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);

    providerInstance = new GoogleAuthProvider();
    SCOPES.forEach((scope) => providerInstance?.addScope(scope));
    providerInstance.setCustomParameters({ prompt: 'select_account' });

    onAuthStateChanged(authInstance, (user) => {
      currentGoogleUser = user || null;
      if (!user) {
        cachedAccessToken = null;
        notifyListeners(null, null);
        return;
      }
      if (cachedAccessToken) {
        notifyListeners(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        notifyListeners(user, null);
      }
    });

    return { app: appInstance, auth: authInstance, provider: providerInstance };
  })();
  return initPromise;
}

export async function initAuth(
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: (user: User | null) => void
): Promise<() => void> {
  await ensureInitialized();

  const listener: AuthListener = (user, token) => {
    if (user && token) {
      onAuthSuccess(user, token);
    } else {
      onAuthFailure(user);
    }
  };
  authListeners.add(listener);

  if (currentGoogleUser && cachedAccessToken) {
    onAuthSuccess(currentGoogleUser, cachedAccessToken);
  } else {
    onAuthFailure(currentGoogleUser);
  }

  return () => {
    authListeners.delete(listener);
  };
}

export async function googleSignIn(): Promise<{ user: User; accessToken: string }> {
  const { auth, provider } = await ensureInitialized();
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential || !credential.accessToken) {
      throw new Error('Failed to get access token from Google sign-in');
    }
    cachedAccessToken = credential.accessToken;
    currentGoogleUser = result.user;
    notifyListeners(currentGoogleUser, cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleUser(): User | null {
  return currentGoogleUser;
}

export async function logout(): Promise<void> {
  const { auth } = await ensureInitialized();
  cachedAccessToken = null;
  currentGoogleUser = null;
  await signOut(auth);
  notifyListeners(null, null);
}

export class GoogleWorkspaceError extends Error {
  code?: string;
  status?: number;
}

async function googleApiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  if (!cachedAccessToken) {
    const err = new GoogleWorkspaceError('Google sign-in required');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    cachedAccessToken = null;
    notifyListeners(currentGoogleUser, null);
    const err = new GoogleWorkspaceError('Your Google session expired. Please sign in again.');
    err.code = 'AUTH_EXPIRED';
    throw err;
  }

  if (res.status === 204) {
    return null as T;
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const apiErr = data.error as { message?: string } | undefined;
    const msg = apiErr?.message || `Google API request failed (${res.status})`;
    const err = new GoogleWorkspaceError(msg);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

interface RawGoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  htmlLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
}

export function extractMeetUrl(event: RawGoogleCalendarEvent | null | undefined): string {
  if (!event) return '';
  if (event.hangoutLink) {
    const clean = sanitizeUrl(event.hangoutLink);
    if (clean) return clean;
  }
  const entryPoints = event.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find((ep) => ep.entryPointType === 'video' && ep.uri);
    if (video?.uri) return sanitizeUrl(video.uri);
  }
  return '';
}

function mapCalendarEvent(ev: RawGoogleCalendarEvent): CalendarClassEvent {
  return {
    id: ev.id,
    title: ev.summary || 'Untitled Class',
    description: ev.description || '',
    courseId: '',
    courseTitle: '',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    meetUrl: extractMeetUrl(ev),
    htmlLink: sanitizeUrl(ev.htmlLink || ''),
    attendees: ev.attendees || [],
  };
}

export async function listUpcomingClasses({
  timeMin,
  maxResults = 20,
}: { timeMin?: string; maxResults?: number } = {}): Promise<CalendarClassEvent[]> {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
    timeMin: timeMin || new Date().toISOString(),
  });
  const data = await googleApiFetch<{ items?: RawGoogleCalendarEvent[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`
  );
  return (data.items || []).map(mapCalendarEvent);
}

export async function createMeetClass({
  title,
  description = '',
  startIso,
  endIso,
  timeZone,
  attendees = [],
  includeMeet = true,
  courseTitle = '',
}: {
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone?: string;
  attendees?: string[];
  includeMeet?: boolean;
  courseTitle?: string;
}): Promise<CalendarClassEvent> {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const cleanAttendees = attendees
    .map((email) => String(email || '').trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .map((email) => ({ email }));

  const eventBody: Record<string, unknown> = {
    summary: title,
    description: courseTitle
      ? `Course: ${courseTitle}${description ? `\n\n${description}` : ''}`
      : description,
    start: { dateTime: startIso, timeZone: tz },
    end: { dateTime: endIso, timeZone: tz },
  };

  if (cleanAttendees.length) {
    eventBody.attendees = cleanAttendees;
  }

  if (includeMeet) {
    const requestId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    eventBody.conferenceData = {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const query = new URLSearchParams({
    conferenceDataVersion: includeMeet ? '1' : '0',
    sendUpdates: cleanAttendees.length ? 'all' : 'none',
  });

  const created = await googleApiFetch<RawGoogleCalendarEvent>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify(eventBody),
    }
  );
  return mapCalendarEvent(created);
}

export async function updateMeetClass(
  eventId: string,
  {
    title,
    description = '',
    startIso,
    endIso,
    timeZone,
    attendees = [],
    courseTitle = '',
  }: {
    title: string;
    description?: string;
    startIso: string;
    endIso: string;
    timeZone?: string;
    attendees?: string[];
    courseTitle?: string;
  }
): Promise<CalendarClassEvent> {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const cleanAttendees = attendees
    .map((email) => String(email || '').trim())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .map((email) => ({ email }));

  const eventBody = {
    summary: title,
    description: courseTitle
      ? `Course: ${courseTitle}${description ? `\n\n${description}` : ''}`
      : description,
    start: { dateTime: startIso, timeZone: tz },
    end: { dateTime: endIso, timeZone: tz },
    attendees: cleanAttendees,
  };

  const query = new URLSearchParams({
    conferenceDataVersion: '1',
    sendUpdates: cleanAttendees.length ? 'all' : 'none',
  });

  const updated = await googleApiFetch<RawGoogleCalendarEvent>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${query.toString()}`,
    {
      method: 'PATCH',
      body: JSON.stringify(eventBody),
    }
  );
  return mapCalendarEvent(updated);
}

export async function deleteMeetClass(
  eventId: string,
  { hasAttendees = false }: { hasAttendees?: boolean } = {}
): Promise<void> {
  const query = new URLSearchParams({
    sendUpdates: hasAttendees ? 'all' : 'none',
  });
  await googleApiFetch<null>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${query.toString()}`,
    { method: 'DELETE' }
  );
}

export async function createInstantMeetSpace(): Promise<InstantMeetSpace> {
  return googleApiFetch<InstantMeetSpace>('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
