"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Check,
  Code,
  FileText,
  Mic,
  Paperclip,
  Search,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { HOME_COPY } from "@/lib/home-copy";
import { useUILocale, type LocaleCode } from "@/lib/locale";
import LocaleSwitcher from "@/components/locale-switcher";
import KolaHeroLive, { type KolaStatus } from "@/components/kola-hero-live";
import { getToken } from "@/lib/api";

const quickActions = [
  { key: "fSearch" as const, icon: Search },
  { key: "fRag" as const, icon: FileText },
  { key: "fCode" as const, icon: Code },
  { key: "fMulti" as const, icon: Bot },
];

export default function ChatPage() {
  const [locale, setLocale] = useUILocale();
  const copy = HOME_COPY[locale as LocaleCode];
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [status, setStatus] = useState<KolaStatus>("idle");
  const [volume, setVolume] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const signedIn = typeof window !== "undefined" ? Boolean(getToken()) : false;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /**
   * Drives KOLA's state machine. Swap the fixed delays for real streaming
   * events once the chat API is wired: set "thinking" on request start,
   * "speaking" on first token, "idle" on stream end.
   */
  const runTurn = useCallback(() => {
    clearTimers();
    setStatus("thinking");
    timers.current.push(
      setTimeout(() => {
        setStatus("speaking");
        // Simulated mouth movement. With a real Web Audio analyser, replace
        // this with: analyser.getByteFrequencyData(data); setVolume(data[10] / 255);
        let t = 0;
        const tick = setInterval(() => {
          t += 0.12;
          setVolume(Math.abs(Math.sin(t)) * (0.55 + Math.random() * 0.45));
        }, 90);
        timers.current.push(tick as unknown as ReturnType<typeof setTimeout>);

        timers.current.push(
          setTimeout(() => {
            clearInterval(tick);
            setVolume(0);
            setStatus("idle");
          }, 2600)
        );
      }, 1100)
    );
  }, [clearTimers]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#02050a] text-slate-100">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-cyan-400/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="rounded-lg border border-cyan-400/20 p-2 text-cyan-300 transition hover:bg-cyan-400/10"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="font-mono text-xs tracking-[0.35em] text-cyan-300/70">
              AI COMMAND CENTER
            </p>
            <h1 className="text-sm font-semibold text-white sm:text-base">
              KolaHeroLive-Copilot
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <LocaleSwitcher locale={locale} onChange={setLocale} />
          {!signedIn && (
            <Link
              href="/auth"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {copy.loginNav}
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:px-10">
        <section className="flex flex-1 flex-col gap-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-5 backdrop-blur-xl">
            <p className="text-sm text-slate-300">{copy.mReq}</p>
          </div>

          {sent && (
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-cyan-400/25 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              {sent}
            </div>
          )}

          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/30 p-8 text-center text-sm text-slate-500">
            <div>
              <Sparkles className="mx-auto mb-3 h-6 w-6 text-cyan-400/70" />
              <p>{copy.teamSub}</p>
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-5 backdrop-blur-xl">
            <KolaHeroLive status={status} audioLevel={volume} />
            <p className="mt-2 text-center font-mono text-[10px] tracking-[0.25em] text-slate-500">
              {status === "thinking"
                ? "THINKING"
                : status === "speaking"
                  ? "SPEAKING"
                  : "ONLINE"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-5 backdrop-blur-xl">
            <h2 className="mb-4 font-mono text-xs tracking-[0.3em] text-slate-400">
              QUICK ACTIONS
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setMessage(copy[key])}
                  className="flex flex-col items-start gap-2 rounded-xl border border-slate-700/50 bg-slate-950/60 p-3 text-left text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  <Icon className="h-4 w-4 text-cyan-300" />
                  {copy[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700/40 bg-slate-900/60 p-5 backdrop-blur-xl">
            <h2 className="mb-4 font-mono text-xs tracking-[0.3em] text-slate-400">
              SYSTEM
            </h2>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> {copy.mS1}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> {copy.mS4}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-400" /> {copy.mS5}
              </li>
            </ul>
          </div>
        </aside>
      </main>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!message.trim()) return;
          setSent(message.trim());
          setMessage("");
          runTurn();
        }}
        className="sticky bottom-0 z-10 border-t border-cyan-400/10 bg-slate-950/80 p-3 backdrop-blur-xl sm:p-4"
      >
        <div className="mx-auto flex max-w-5xl items-end gap-2">
          <button
            type="button"
            aria-label="Attach file"
            className="rounded-xl border border-slate-700/60 p-3 text-slate-400 transition hover:text-cyan-300"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Upload document"
            className="hidden rounded-xl border border-slate-700/60 p-3 text-slate-400 transition hover:text-cyan-300 sm:block"
          >
            <Upload className="h-4 w-4" />
          </button>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={1}
            placeholder={copy.mReq}
            aria-label="Message KOLA"
            className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30"
          />
          <button
            type="button"
            aria-label="Voice input"
            className="hidden rounded-xl border border-slate-700/60 p-3 text-slate-400 transition hover:text-cyan-300 sm:block"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="submit"
            aria-label="Send message"
            className="rounded-xl bg-cyan-400 p-3 text-slate-950 transition hover:bg-cyan-300"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
