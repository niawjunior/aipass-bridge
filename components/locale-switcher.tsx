"use client";

import { UI_LOCALES, type LocaleCode } from "@/lib/locale";

export default function LocaleSwitcher({
  locale,
  onChange,
}: {
  locale: LocaleCode;
  onChange: (code: LocaleCode) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-slate-700/60 bg-slate-900/70 p-1 backdrop-blur-xl">
      {UI_LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          aria-pressed={locale === l.code}
          aria-label={`Language: ${l.name}`}
          title={l.name}
          className={`rounded-md px-2 py-1 text-base leading-none transition ${
            locale === l.code
              ? "bg-cyan-400/20 ring-1 ring-cyan-300/60"
              : "opacity-60 hover:opacity-100"
          }`}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
