/* ============================================================
   TALENT FLOW  |  google-workspace.js
   ------------------------------------------------------------
   Client-side Google Workspace integration via Firebase Auth.
   Provides in-memory access token caching and helpers for:
     - Google Calendar API (events + Meet conferenceData)
     - Google Meet API (instant meeting spaces)
   ============================================================ */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.4.0/firebase-auth.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
];

let appInstance = null;
let authInstance = null;
let providerInstance = null;
let initPromise = null;

// In-memory only — never persisted to localStorage or sessionStorage.
let cachedAccessToken = null;
let currentGoogleUser = null;
let isSigningIn = false;

const authListeners = new Set();

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
    SCOPES.forEach((scope) => providerInstance.addScope(scope));
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

function notifyListeners(user, token) {
  authListeners.forEach((cb) => {
    try {
      cb(user, token);
    } catch (err) {
      console.error('Google Workspace listener error:', err);
    }
  });
}

export async function initAuth(onAuthSuccess, onAuthFailure) {
  await ensureInitialized();

  const listener = (user, token) => {
    if (user && token) {
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (onAuthFailure) onAuthFailure(user);
    }
  };
  authListeners.add(listener);

  if (currentGoogleUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(currentGoogleUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure(currentGoogleUser);
  }

  return () => authListeners.delete(listener);
}

export async function googleSignIn() {
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

export async function getAccessToken() {
  return cachedAccessToken;
}

export function getCurrentGoogleUser() {
  return currentGoogleUser;
}

export async function logout() {
  const { auth } = await ensureInitialized();
  cachedAccessToken = null;
  currentGoogleUser = null;
  await signOut(auth);
  notifyListeners(null, null);
}

async function googleApiFetch(url, options = {}) {
  if (!cachedAccessToken) {
    const err = new Error('Google sign-in required');
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
    const err = new Error('Your Google session expired. Please sign in again.');
    err.code = 'AUTH_EXPIRED';
    throw err;
  }

  if (res.status === 204) {
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `Google API request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function listUpcomingClasses({ timeMin, maxResults = 20 } = {}) {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
    timeMin: timeMin || new Date().toISOString(),
  });
  const data = await googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`
  );
  return data.items || [];
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
}) {
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
  };

  if (cleanAttendees.length) {
    eventBody.attendees = cleanAttendees;
  }

  if (includeMeet) {
    const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID)
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

  return googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${query.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify(eventBody),
    }
  );
}

export async function updateMeetClass(eventId, {
  title,
  description = '',
  startIso,
  endIso,
  timeZone,
  attendees = [],
  courseTitle = '',
}) {
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

  return googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${query.toString()}`,
    {
      method: 'PATCH',
      body: JSON.stringify(eventBody),
    }
  );
}

export async function deleteMeetClass(eventId, { hasAttendees = false } = {}) {
  const query = new URLSearchParams({
    sendUpdates: hasAttendees ? 'all' : 'none',
  });
  return googleApiFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?${query.toString()}`,
    { method: 'DELETE' }
  );
}

export async function createInstantMeetSpace() {
  return googleApiFetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

window.TalentFlowGoogle = {
  SCOPES,
  initAuth,
  googleSignIn,
  getAccessToken,
  getCurrentGoogleUser,
  logout,
  listUpcomingClasses,
  createMeetClass,
  updateMeetClass,
  deleteMeetClass,
  createInstantMeetSpace,
};
