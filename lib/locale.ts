"use client";

import { useCallback, useEffect, useState } from "react";

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

function readInitial(): LocaleCode {
  if (typeof window === "undefined") return "th";
  const stored = window.localStorage.getItem(LOCALE_KEY) as LocaleCode | null;
  if (stored && UI_LOCALES.some((l) => l.code === stored)) return stored;
  return "th";
}

/** Client-side UI language switcher, persisted in localStorage. */
export function useUILocale() {
  const [locale, setLocaleState] = useState<LocaleCode>("th");

  useEffect(() => {
    setLocaleState(readInitial());
  }, []);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try {
      window.localStorage.setItem(LOCALE_KEY, code);
    } catch {
      /* storage unavailable */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  }, []);

  return [locale, setLocale] as const;
}
