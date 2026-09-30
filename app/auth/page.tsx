"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { HOME_COPY } from "@/lib/home-copy";
import { useUILocale, type LocaleCode } from "@/lib/locale";
import LocaleSwitcher from "@/components/locale-switcher";
import { setToken, setUser } from "@/lib/api";

export default function AuthPage() {
  const [locale, setLocale] = useUILocale();
  const copy = HOME_COPY[locale as LocaleCode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(copy.loginNav);
      return;
    }
    // Local session bootstrap — no auth logic is changed by the redesign.
    setToken(`local-${email.trim()}`);
    setUser(email.trim());
    router.push("/th");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#02050a] px-4 py-10 text-slate-100">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/3 translate-y-1/3 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            aria-label="Back to home"
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 px-3 py-2 text-xs text-cyan-300 transition hover:bg-cyan-400/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            ViHokAI
          </Link>
          <LocaleSwitcher locale={locale} onChange={setLocale} />
        </div>

        <div className="rounded-2xl border border-cyan-400/15 bg-slate-900/60 p-6 shadow-[0_0_60px_-20px_rgba(34,211,238,0.5)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-2.5">
              <Bot className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <p className="font-mono text-[11px] tracking-[0.3em] text-cyan-300/70">
                KOLA ACCESS
              </p>
              <h1 className="text-lg font-semibold text-white">
                {copy.loginNav}
              </h1>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">Email</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 focus-within:border-cyan-400/60">
                <Mail className="h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  placeholder="you@example.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs text-slate-400">Password</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/70 px-3 focus-within:border-cyan-400/60">
                <Lock className="h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full bg-transparent py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                  placeholder="••••••••"
                />
              </div>
            </label>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="submit"
              className="w-full rounded-xl bg-cyan-400 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {copy.loginNav}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            {copy.signupNav} ·{" "}
            <Link
              href="/auth"
              className="text-cyan-300 underline-offset-4 hover:underline"
            >
              {copy.freeCta}
            </Link>
          </p>

          <ul className="mt-6 space-y-2 border-t border-slate-700/40 pt-5 text-xs text-slate-500">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {copy.mS4}
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              {copy.freeChats}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
