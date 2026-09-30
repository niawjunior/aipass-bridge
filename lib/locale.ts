"use client";

import { useCallback, useSyncExternalStore } from "react";

export type LocaleCode = "th" | "en" | "ja" | "ko";

export interface UiLocale {
  code: LocaleCode;
  flag: string;
  name: string;
}

export const UI_LOCALES: UiLocale[] = [
  { code: "th", flag: "🇹🇭", name: "ไทย" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "ko", flag: "🇰🇷", name: "한국어" },
];

const LOCALE_KEY = "vihokai_locale";

function readStored(): LocaleCode {
  if (typeof window === "undefined") return "th";
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY) as LocaleCode | null;
    if (stored && UI_LOCALES.some((l) => l.code === stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return "th";
}

// Same-tab subscribers, plus the cross-tab "storage" event below.
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Client-side UI language switcher, persisted in localStorage. */
export function useUILocale() {
  // Server renders Thai; React adopts the stored language after hydration.
  const locale = useSyncExternalStore(subscribe, readStored, () => "th" as LocaleCode);

  const setLocale = useCallback((code: LocaleCode) => {
    try {
      window.localStorage.setItem(LOCALE_KEY, code);
    } catch {
      /* storage unavailable */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
    emit();
  }, []);

  return [locale, setLocale] as const;
}
