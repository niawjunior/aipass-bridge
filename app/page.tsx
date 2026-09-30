"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Brain,
  Check,
  Code,
  FileText,
  Menu,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { HOME_COPY } from "@/lib/home-copy";
import { useUILocale, type LocaleCode } from "@/lib/locale";
import LocaleSwitcher from "@/components/locale-switcher";
import KolaHero from "@/components/kola-hero";

const capabilities = [
  { key: "fMulti" as const, icon: Brain, sub: "GPT Â· Claude Â· Gemini Â· Ollama" },
  { key: "fSearch" as const, icon: Search, sub: "Real-time web results" },
  { key: "fRag" as const, icon: FileText, sub: "Source citations" },
  { key: "fCode" as const, icon: Code, sub: "IDE-ready snippets" },
  { key: "fReason" as const, icon: Sparkles, sub: "Step-by-step thinking" },
  { key: "fAuto" as const, icon: Workflow, sub: "Agent pipelines" },
];

const agents = [
  { key: "teamLead" as const, desc: "teamLeadD" as const, icon: Bot, tone: "cyan" },
  { key: "teamR" as const, desc: "teamRD" as const, icon: Search, tone: "indigo" },
  { key: "teamC" as const, desc: "teamCD" as const, icon: Code, tone: "emerald" },
  { key: "teamD" as const, desc: "teamDD" as const, icon: FileText, tone: "amber" },
  { key: "teamJ" as const, desc: "teamJD" as const, icon: ShieldCheck, tone: "violet" },
  { key: "teamB" as const, desc: "teamBD" as const, icon: Network, tone: "sky" },
];

const systemFeatures = [
  "mS1" as const,
  "mS2" as const,
  "mS3" as const,
  "mS4" as const,
  "mS5" as const,
];

const toneClass: Record<string, string> = {
  cyan: "text-cyan-300 border-cyan-400/25 bg-cyan-400/10",
  indigo: "text-indigo-300 border-indigo-400/25 bg-indigo-400/10",
  emerald: "text-emerald-300 border-emerald-400/25 bg-emerald-400/10",
  amber: "text-amber-300 border-amber-400/25 bg-amber-400/10",
  violet: "text-violet-300 border-violet-400/25 bg-violet-400/10",
  sky: "text-sky-300 border-sky-400/25 bg-sky-400/10",
};

export default function Home() {
  const [locale, setLocale] = useUILocale();
  const copy = HOME_COPY[locale as LocaleCode];
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = [
    { href: "#features", label: copy.navFeatures },
    { href: "#team", label: copy.navTeam },
    { href: "#mission", label: copy.navMission },
    { href: "#pricing", label: copy.navPricing },
    { href: "#roadmap", label: copy.navRoadmap },
  ];

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#02050a] text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-20rem] h-[46rem] w-[46rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-15rem] top-[30rem] h-[34rem] w-[34rem] rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(34,211,238,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,211,238,0.06)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-cyan-400/10 bg-[#02050a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-1.5">
              <Bot className="h-5 w-5 text-cyan-300" />
            </span>
            <span className="font-mono text-sm font-bold tracking-[0.25em] text-white">
              VI<span className="text-cyan-400">HOK</span>AI
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3.5 py-2 text-sm text-slate-400 transition hover:bg-cyan-400/10 hover:text-cyan-200"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <LocaleSwitcher locale={locale} onChange={setLocale} />
            <Link
              href="/auth"
              className="rounded-lg border border-slate-700/60 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
            >
              {copy.loginNav}
            </Link>
            <Link
              href="/auth"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {copy.signupNav}
            </Link>
          </div>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            className="rounded-lg border border-slate-700/60 p-2 text-slate-300 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-cyan-400/10 bg-[#02050a]/95 px-4 py-4 backdrop-blur-xl lg:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-cyan-400/10"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex items-center justify-between gap-3">
              <LocaleSwitcher locale={locale} onChange={setLocale} />
              <div className="flex gap-2">
                <Link
                  href="/auth"
                  className="rounded-lg border border-slate-700/60 px-4 py-2 text-sm text-slate-300"
                >
                  {copy.loginNav}
                </Link>
                <Link
                  href="/auth"
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
                >
                  {copy.signupNav}
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute left-1/2 top-10 -z-10 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[120px]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-28">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-1.5 font-mono text-[10px] tracking-[0.25em] text-cyan-200 sm:text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                NEXT GENERATION AI INTELLIGENCE
              </span>

              <h1 className="mt-6 text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
                <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                  {copy.heroTitle1}
                </span>{" "}
                <span className="text-white">{copy.heroTitle2}</span>{" "}
                <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                  {copy.heroTitle3}
                </span>
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-sm text-cyan-200/80 sm:text-base lg:mx-0">
                {copy.tagA} {copy.tagB}
              </p>
              <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base lg:mx-0">
                {copy.heroDesc}
              </p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  href="/auth"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-300 sm:w-auto"
                >
                  {copy.ctaFree}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <a
                  href="#mission"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-6 py-3.5 font-semibold text-cyan-200 transition hover:bg-cyan-400/10 sm:w-auto"
                >
                  {copy.ctaHow}
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-500 lg:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  {copy.freeChats}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  {copy.freeReset}
                </span>
              </div>
            </div>

            <div className="relative">
              <KolaHero />
              <div className="mx-auto mt-4 flex max-w-sm items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-200">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {copy.mReq}
              </div>
            </div>
          </div>
        </section>




        {/* CAPABILITIES */}
        <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mb-10 max-w-2xl">
            <p className="font-mono text-xs tracking-[0.3em] text-cyan-400">CAPABILITIES</p>
            <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
              {copy.fMulti}
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ key, icon: Icon, sub }) => (
              <div
                key={key}
                className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-slate-900/80"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/10 opacity-0 blur-2xl transition group-hover:opacity-100" />
                <span className="inline-flex rounded-xl border border-cyan-400/25 bg-cyan-400/10 p-2.5">
                  <Icon className="h-5 w-5 text-cyan-300" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-white">{copy[key]}</h3>
                <p className="mt-1.5 font-mono text-xs text-slate-500">{sub}</p>
              </div>
            ))}
          </div>
        </section>


        {/* AI TEAM */}
        <section
          id="team"
          className="relative scroll-mt-20 border-y border-cyan-400/10 bg-slate-950/40 py-16 lg:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 max-w-2xl">
              <p className="font-mono text-xs tracking-[0.3em] text-cyan-400">{copy.teamEyebrow}</p>
              <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                {copy.teamH}
              </h2>
              <p className="mt-3 text-sm text-slate-400 sm:text-base">{copy.teamSub}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map(({ key, desc, icon: Icon, tone }) => (
                <div
                  key={key}
                  className="group rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 backdrop-blur-xl transition hover:border-cyan-400/30 hover:bg-slate-900/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex rounded-xl border p-2.5 ${toneClass[tone]}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.2em] text-slate-600">
                      ONLINE
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{copy[key]}</h3>
                  <p className="mt-1.5 text-sm text-slate-400">{copy[desc]}</p>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <Link
                href="/th"
                className="group inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
              >
                {copy.teamCta}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>


        {/* MISSION / COMMAND CENTER */}
        <section id="mission" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="font-mono text-xs tracking-[0.3em] text-cyan-400">{copy.mEyebrow}</p>
              <h2 className="mt-3 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
                {copy.mH1}
                <span className="block bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                  {copy.mH2}
                </span>
              </h2>
              <p className="mt-4 text-sm text-slate-400 sm:text-base">{copy.mDesc}</p>

              <ul className="mt-8 space-y-3">
                {systemFeatures.map((key) => (
                  <li key={key} className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="inline-flex rounded-lg border border-cyan-400/25 bg-cyan-400/10 p-1.5">
                      <Check className="h-3.5 w-3.5 text-cyan-300" />
                    </span>
                    {copy[key]}
                  </li>
                ))}
              </ul>

              <Link
                href="/auth"
                className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-6 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                {copy.mCta}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            </div>

            <div className="relative">
              <div className="rounded-3xl border border-cyan-400/20 bg-slate-900/60 p-5 shadow-[0_0_80px_-30px_rgba(34,211,238,0.6)] backdrop-blur-xl sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.3em] text-cyan-400/80">
                      AI COMMAND CENTER
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">KOLA</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    ACTIVE
                  </span>
                </div>

                <div className="mt-4 space-y-3 font-mono text-xs">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-slate-500">&gt; {copy.mReq}</p>
                  </div>
                  <div className="ml-6 space-y-2 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                    {agents.slice(1, 5).map(({ key, icon: Icon }) => (
                      <p key={key} className="flex items-center gap-2 text-cyan-200/80">
                        <Icon className="h-3.5 w-3.5 text-cyan-400" />
                        {copy[key]}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "MODELS", value: "12+" },
                    { label: "SOURCES", value: "1.2K" },
                    { label: "UPTIME", value: "99.9%" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center"
                    >
                      <p className="text-lg font-bold text-cyan-300">{s.value}</p>
                      <p className="font-mono text-[10px] tracking-[0.2em] text-slate-500">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* PRICING */}
        <section
          id="pricing"
          className="relative scroll-mt-20 border-y border-cyan-400/10 bg-slate-950/40 py-16 lg:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <p className="font-mono text-xs tracking-[0.3em] text-cyan-400">{copy.pEyebrow}</p>
              <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                {copy.pH1} <span className="text-cyan-300">{copy.pH2}</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">{copy.pSub}</p>
            </div>

            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-7 backdrop-blur-xl">
                <h3 className="text-lg font-semibold text-white">{copy.freeName}</h3>
                <p className="mt-1 text-sm text-slate-500">{copy.freeSub}</p>
                <p className="mt-6 flex items-end gap-1">
                  <span className="text-5xl font-bold text-white">฿0</span>
                  <span className="pb-1.5 text-sm text-slate-500">{copy.perMo}</span>
                </p>
                <ul className="mt-6 space-y-3">
                  {[copy.freeF1, copy.freeF2, copy.freeF3].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth"
                  className="mt-7 block rounded-xl border border-cyan-400/30 bg-cyan-400/5 py-3 text-center font-semibold text-cyan-200 transition hover:bg-cyan-400/10"
                >
                  {copy.freeCta}
                </Link>
              </div>

              <div className="relative rounded-3xl border border-cyan-400/40 bg-gradient-to-b from-cyan-400/10 to-slate-900/60 p-7 shadow-[0_0_70px_-25px_rgba(34,211,238,0.7)] backdrop-blur-xl">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-400 px-3 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-slate-950">
                  {copy.proBadge}
                </span>
                <h3 className="text-lg font-semibold text-white">{copy.proName}</h3>
                <p className="mt-1 text-sm text-slate-500">{copy.proSub}</p>
                <p className="mt-6 flex items-end gap-1">
                  <span className="text-5xl font-bold text-cyan-300">฿199</span>
                  <span className="pb-1.5 text-sm text-slate-500">{copy.perMo}</span>
                </p>
                <ul className="mt-6 space-y-3">
                  {[copy.proF1, copy.proF2, copy.proF3].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/auth"
                  className="mt-7 block rounded-xl bg-cyan-400 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  {copy.proCta}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA + ROADMAP */}
        <section id="roadmap" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/10 via-slate-900/60 to-indigo-500/10 p-8 text-center backdrop-blur-xl sm:p-14">
            <h2 className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
              {copy.ctaH1}{" "}
              <span className="bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                {copy.ctaH2}
              </span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-slate-300 sm:text-base">
              {copy.ctaSub}
            </p>
            <Link
              href="/auth"
              className="group mt-8 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-7 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {copy.ctaTry}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-cyan-400/10 bg-slate-950/60 py-10 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 sm:px-6 lg:flex-row lg:justify-between lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-1.5">
              <Bot className="h-5 w-5 text-cyan-300" />
            </span>
            <span className="font-mono text-sm font-bold tracking-[0.25em] text-white">
              VI<span className="text-cyan-400">HOK</span>AI
            </span>
          </Link>
          <p className="font-mono text-[10px] tracking-[0.25em] text-slate-600 sm:text-xs">
            {copy.footerSub}
          </p>
          <LocaleSwitcher locale={locale} onChange={setLocale} />
        </div>
      </footer>
    </div>
  );
}

