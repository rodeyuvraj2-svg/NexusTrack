import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const GUEST_KEY = "nt_guest";
const GUEST_ID_KEY = "nt_guest_id";

function isClient() {
  return typeof window !== "undefined";
}

function generateGuestId(): string {
  if (!isClient()) return "";
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function loadGuestState(): boolean {
  if (!isClient()) return false;
  try {
    return localStorage.getItem(GUEST_KEY) === "true";
  } catch {
    return false;
  }
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
  const [mounted, setMounted] = useState(false);

  // Auto-disable guest mode when a real user signs in
  useEffect(() => {
    setMounted(true);
    // Sync guest state from localStorage on mount (client-side only)
    setIsGuest(loadGuestState());
    setGuestId(getGuestId());

    // Check on mount if there's already a session
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setIsGuest(false);
        saveGuestState(false);
      }
    });

    // Listen for sign-in events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
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
      value={{ isGuest, guestId, enableGuest, disableGuest, restrictedAction, setRestrictedAction, requireAuth }}
    >
      {!mounted ? <div style={{ visibility: "hidden" }}>{children}</div> : children}
    </GuestContext.Provider>
  );
}

export function useGuest(): GuestContextValue {
  const ctx = useContext(GuestContext);
  if (!ctx) throw new Error("useGuest must be used within a GuestProvider");
  return ctx;
}
