import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const GUEST_KEY = "nt_guest";
const GUEST_ID_KEY = "nt_guest_id";

function isClient() {
  return typeof window !== "undefined";
}

/**
 * Read the persisted guest flag. Safe on the server (returns false) and in
 * environments where localStorage is unavailable. Single source of truth —
 * route guards should use this instead of reading localStorage directly.
 */
export function loadGuestState(): boolean {
  if (!isClient()) return false;
  try {
    return localStorage.getItem(GUEST_KEY) === "true";
  } catch {
    return false;
  }
}

function generateGuestId(): string {
  if (!isClient()) return "";
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function saveGuestState(isGuest: boolean) {
  if (!isClient()) return;
  try {
    if (isGuest) {
      localStorage.setItem(GUEST_KEY, "true");
      if (!localStorage.getItem(GUEST_ID_KEY)) {
        localStorage.setItem(GUEST_ID_KEY, generateGuestId());
      }
    } else {
      localStorage.removeItem(GUEST_KEY);
      localStorage.removeItem(GUEST_ID_KEY);
    }
  } catch {
    // localStorage unavailable — session-only guest
  }
}

export function getGuestId(): string | null {
  if (!isClient()) return null;
  try {
    return localStorage.getItem(GUEST_ID_KEY);
  } catch {
    return null;
  }
}

export type RestrictedAction =
  | "addToWatchlist"
  | "markWatching"
  | "markCompleted"
  | "addFavorite"
  | "removeFavorite"
  | "writeReview"
  | "deleteReview"
  | "likeReview"
  | "addFriend"
  | "acceptFriendRequest"
  | "copyFromFriend"
  | "editProfile"
  | "rateMedia"
  | "addNotes"
  | "deleteAccount"
  | "accessLibrary"
  | "accessFriends"
  | "accessSettings";

interface GuestContextValue {
  isGuest: boolean;
  guestId: string | null;
  enableGuest: () => void;
  disableGuest: () => void;
  restrictedAction: RestrictedAction | null;
  setRestrictedAction: (action: RestrictedAction | null) => void;
  requireAuth: (action: RestrictedAction, callback?: () => void) => boolean;
}

const GuestContext = createContext<GuestContextValue | null>(null);

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState<boolean>(false);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [restrictedAction, setRestrictedAction] = useState<RestrictedAction | null>(null);

  // Auto-disable guest mode when a real user signs in
  useEffect(() => {
    // Sync guest state from localStorage on mount (client-side only)
    setIsGuest(loadGuestState());
    setGuestId(getGuestId());

    // Check on mount if there's already a session. A stale refresh token can
    // fail with a 400 from Supabase; that should not blank the landing page or
    // break guest mode detection.
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) return;
      if (data?.session) {
        setIsGuest(false);
        saveGuestState(false);
      }
    });

    // Listen for sign-in events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setIsGuest(false);
        saveGuestState(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const enableGuest = useCallback(() => {
    setIsGuest(true);
    saveGuestState(true);
  }, []);

  const disableGuest = useCallback(() => {
    setIsGuest(false);
    setRestrictedAction(null);
    saveGuestState(false);
  }, []);

  const requireAuth = useCallback(
    (action: RestrictedAction, callback?: () => void): boolean => {
      if (isGuest) {
        setRestrictedAction(action);
        return false;
      }
      callback?.();
      return true;
    },
    [isGuest],
  );

  return (
    <GuestContext.Provider
      value={{
        isGuest,
        guestId,
        enableGuest,
        disableGuest,
        restrictedAction,
        setRestrictedAction,
        requireAuth,
      }}
    >
      {/* Render children immediately; isGuest syncs from localStorage on
          mount, which flips in-place instead of hiding the whole app and
          avoiding the blank-flash of a visibility:hidden gate. */}
      {children}
    </GuestContext.Provider>
  );
}

export function useGuest(): GuestContextValue {
  const ctx = useContext(GuestContext);
  if (!ctx) {
    return {
      isGuest: false,
      guestId: null,
      enableGuest: () => undefined,
      disableGuest: () => undefined,
      restrictedAction: null,
      setRestrictedAction: () => undefined,
      requireAuth: (_action: RestrictedAction, callback?: () => void) => {
        callback?.();
        return false;
      },
    };
  }
  return ctx;
}
