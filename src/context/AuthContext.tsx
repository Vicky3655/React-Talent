import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser, UserProfile } from '../types';
import { supabase } from '../services/supabaseClient';
import {
  clearPendingVerification,
  loadProfile,
  logOut as authLogOut,
  normalizeUser,
  saveProfile as authSaveProfile,
} from '../services/authService';

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  authReady: boolean;
  passwordRecoveryTriggered: boolean;
  clearPasswordRecoveryFlag: () => void;
  refreshUser: () => Promise<AuthUser | null>;
  refreshProfile: (uid?: string) => Promise<UserProfile | null>;
  updateProfileState: (patch: Partial<UserProfile>) => void;
  saveProfile: (data: Partial<UserProfile>) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [passwordRecoveryTriggered, setPasswordRecoveryTriggered] = useState(false);

  const refreshProfile = useCallback(
    async (uidOverride?: string): Promise<UserProfile | null> => {
      const targetUid = uidOverride || user?.uid;
      if (!targetUid) return null;
      try {
        const loaded = await loadProfile(targetUid);
        setProfile(loaded);
        return loaded;
      } catch (err) {
        console.error('Failed to load profile:', err);
        return null;
      }
    },
    [user?.uid]
  );

  useEffect(() => {
    let active = true;

    const handleSessionUser = async (sessionUser: AuthUser | null) => {
      if (!active) return;
      setUser(sessionUser);
      if (!sessionUser) {
        setProfile(null);
        setAuthReady(true);
        return;
      }
      try {
        const loaded = await loadProfile(sessionUser.uid);
        if (active) setProfile(loaded);
      } catch (err) {
        console.error('Profile load failed during auth state change:', err);
      } finally {
        if (active) setAuthReady(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      const normalized = normalizeUser(data.session?.user);
      handleSessionUser(normalized);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryTriggered(true);
      }
      const normalized = normalizeUser(session?.user);
      if (normalized && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        clearPendingVerification();
      }
      handleSessionUser(normalized);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      setUser(null);
      return null;
    }
    const normalized = normalizeUser(data.user);
    setUser(normalized);
    if (normalized) {
      const loaded = await loadProfile(normalized.uid).catch(() => null);
      if (loaded) setProfile(loaded);
    }
    return normalized;
  }, []);

  const updateProfileState = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...(prev || {}), ...patch }));
  }, []);

  const saveProfile = useCallback(
    async (data: Partial<UserProfile>) => {
      if (!user) throw new Error('Not signed in');
      await authSaveProfile(user.uid, data);
      setProfile((prev) => ({ ...(prev || {}), ...data }));
    },
    [user]
  );

  const logOut = useCallback(async () => {
    await authLogOut();
    setUser(null);
    setProfile(null);
  }, []);

  const clearPasswordRecoveryFlag = useCallback(() => {
    setPasswordRecoveryTriggered(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authReady,
        passwordRecoveryTriggered,
        clearPasswordRecoveryFlag,
        refreshUser,
        refreshProfile,
        updateProfileState,
        saveProfile,
        logOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
