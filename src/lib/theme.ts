/**
 * App theme registry and helpers. Themes are pure CSS-variable sets in
 * src/styles.css, selected via <html data-theme="...">; this module owns
 * the theme ids, preview swatches (for the Settings picker), localStorage
 * persistence (guest fallback + flash prevention), and a tiny change event
 * so root-level consumers (e.g. the Toaster) can react.
 *
 * Persistence model: the profiles.theme column is the source of truth for
 * signed-in users (written from Settings); localStorage is only a cache so
 * the saved theme can be applied before first paint and so guests keep a
 * preference.
 */

import { useEffect, useState } from "react";

export type ThemeId = "nexus-dark" | "midnight-rose" | "ocean-night" | "solar-light";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview swatches (CSS colors) for the Settings picker cards. */
  swatch: { bg: string; card: string; primary: string; accent: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: "nexus-dark",
    name: "Nexus Dark",
    description: "Deep slate with indigo and violet — the classic NexusTrack look.",
    swatch: {
      bg: "oklch(0.13 0.015 270)",
      card: "oklch(0.18 0.018 270)",
      primary: "oklch(0.56 0.22 270)",
      accent: "oklch(0.6 0.26 290)",
    },
  },
  {
    id: "midnight-rose",
    name: "Midnight Rose",
    description: "Charcoal dark with purple and soft rose highlights.",
    swatch: {
      bg: "oklch(0.13 0.015 350)",
      card: "oklch(0.18 0.022 350)",
      primary: "oklch(0.58 0.22 305)",
      accent: "oklch(0.62 0.19 355)",
    },
  },
  {
    id: "ocean-night",
    name: "Ocean Night",
    description: "Deep navy with blue and teal — calm and cinematic.",
    swatch: {
      bg: "oklch(0.13 0.03 245)",
      card: "oklch(0.18 0.035 245)",
      primary: "oklch(0.62 0.18 250)",
      accent: "oklch(0.62 0.12 195)",
    },
  },
  {
    id: "solar-light",
    name: "Solar Light",
    description: "Warm light surfaces with deep indigo and gold.",
    swatch: {
      bg: "oklch(0.975 0.008 85)",
      card: "oklch(0.995 0.004 85)",
      primary: "oklch(0.5 0.2 270)",
      accent: "oklch(0.64 0.17 55)",
    },
  },
];

export const DEFAULT_THEME: ThemeId = "nexus-dark";
export const THEME_STORAGE_KEY = "nexustrack-theme";
const THEME_EVENT = "nexustrack-theme-change";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

/** Apply a theme to <html> and cache it for the next page load. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private browsing — the attribute still applies for this session */
  }
  window.dispatchEvent(new CustomEvent<ThemeId>(THEME_EVENT, { detail: theme }));
}

/** The currently applied theme (falls back to the default). SSR-safe: the
 *  root route renders on the server first, where `document` doesn't exist —
 *  the server always sees the default and the client corrects on hydrate. */
export function getAppliedTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const applied = document.documentElement.getAttribute("data-theme");
  return isThemeId(applied) ? applied : DEFAULT_THEME;
}

/** React hook: the applied theme, re-rendering when it changes. */
export function useAppliedTheme(): ThemeId {
  const [theme, setTheme] = useState<ThemeId>(getAppliedTheme);
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemeId>).detail;
      if (isThemeId(detail)) setTheme(detail);
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);
  return theme;
}

/**
 * Inline <head> script (rendered in __root.tsx) — applies the cached theme
 * before first paint so a saved non-default theme never flashes. Framework-
 * free and synchronous on purpose; the id list mirrors THEMES.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="midnight-rose"||t==="ocean-night"||t==="solar-light"||t==="nexus-dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
