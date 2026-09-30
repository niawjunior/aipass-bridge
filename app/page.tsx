"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Code2,
  Cpu,
  FileSearch,
  Globe2,
  Menu,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useIsLoggedIn } from "@/lib/browser-state";
import { UI_LOCALES, useUILocale } from "@/lib/locale";
import { HOME_COPY } from "@/lib/home-copy";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = useIsLoggedIn();
  const [locale, setLocale] = useUILocale();
  const t = HOME_COPY[locale];

  const chatHref = "/th";
  const signupHref = "/auth?mode=register";
  const loginHref = "/auth";

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* BACKGROUND */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-[-300px] h-[700px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-[150px]" />
        <div className="absolute right-[-200px] top-[500px] h-[500px] w-[500px] rounded-full bg-blue-600/[0.05] blur-[150px]" />
        <div className="absolute left-[-200px] top-[900px] h-[500px] w-[500px] rounded-full bg-orange-500/[0.035] blur-[150px]" />
      </div>

      {/* NAVBAR */}
      <header className="relative z-50 border-b border-white/[0.07] bg-black/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5b4cff] shadow-[0_0_25px_rgba(91,76,255,.35)]">
              <span className="text-lg font-black">V</span>
            </div>
            <span className="text-[20px] font-bold tracking-tight text-slate-200">
              ViHok AI
            </span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            <a href="#features" className="text-sm text-slate-400 transition hover:text-white">
              {t.navFeatures}
            </a>
            <a href="#team" className="text-sm text-slate-400 transition hover:text-white">
              {t.navTeam}
            </a>
            <a href="#mission" className="text-sm text-slate-400 transition hover:text-white">
              {t.navMission}
            </a>
            <a href="#pricing" className="text-sm text-slate-400 transition hover:text-white">
              {t.navPricing}
            </a>
            <a href="#roadmap" className="text-sm text-slate-400 transition hover:text-white">
              {t.navRoadmap}
            </a>
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5">
              {UI_LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLocale(l.code)}
                  title={l.name}
                  aria-label={l.name}
                  aria-pressed={locale === l.code}
                  className={`rounded-full px-1.5 text-sm transition ${
                    locale === l.code ? "opacity-100" : "opacity-40 hover:opacity-80"
                  }`}
                >
                  {l.flag}
                </button>
              ))}
            </div>
            {loggedIn ? (
              <a
                href={chatHref}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300"
              >
                {t.enterChat}
              </a>
            ) : (
              <>
                <a
                  href={loginHref}
                  className="text-sm font-medium text-slate-300 hover:text-white"
                >
                  {t.loginNav}
                </a>
                <a
                  href={signupHref}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-cyan-300"
                >
                  {t.signupNav}
                </a>
              </>
            )}
          </div>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden"
            aria-label="menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/10 bg-black px-6 py-6 lg:hidden">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                {UI_LOCALES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLocale(l.code)}
                    title={l.name}
                    aria-label={l.name}
                    aria-pressed={locale === l.code}
                    className={`rounded-full px-2 py-1 text-lg ${
                      locale === l.code ? "bg-white/10" : "opacity-50"
                    }`}
                  >
                    {l.flag}
                  </button>
                ))}
              </div>
              <a href="#features" onClick={() => setMenuOpen(false)}>
                {t.navFeatures}
              </a>
              <a href="#team" onClick={() => setMenuOpen(false)}>
                {t.navTeam}
              </a>
              <a href="#mission" onClick={() => setMenuOpen(false)}>
                {t.navMission}
              </a>
              <a href="#pricing" onClick={() => setMenuOpen(false)}>
                {t.navPricing}
              </a>
              {loggedIn ? (
                <a
                  href={chatHref}
                  className="rounded-xl bg-white px-5 py-3 text-center font-bold text-black"
                >
                  {t.enterChat}
                </a>
              ) : (
                <>
                  <a href={loginHref}>{t.loginNav}</a>
                  <a
                    href={signupHref}
                    className="rounded-xl bg-white px-5 py-3 text-center font-bold text-black"
                  >
                    {t.signupNav}
                  </a>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative z-10 min-h-[780px] overflow-hidden">
        <div className="absolute inset-0">
          <KolaHero />
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/95 via-[48%] to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[250px] bg-gradient-to-t from-[#050505] to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-[780px] max-w-[1400px] items-center px-6 md:px-10">
          <div className="max-w-[650px] pt-10">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/[0.06] px-4 py-2">
              <span className="text-sm" aria-hidden="true">
                &#128640;
              </span>
              <span className="text-xs font-semibold tracking-wide text-orange-300">
                {t.heroBadge}
              </span>
            </div>

            <h1 className="leading-[0.9]">
              <span className="block text-6xl font-black tracking-[-0.04em] md:text-8xl">
                {t.heroTitle1}
              </span>
              <span className="mt-2 block text-5xl font-black tracking-[-0.04em] md:text-7xl">
                <span className="bg-gradient-to-r from-yellow-300 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  {t.heroTitle2}
                </span>
              </span>
              <span className="mt-1 block text-7xl font-black italic tracking-[-0.05em] md:text-9xl">
                {t.heroTitle3}
              </span>
            </h1>

            <p className="mt-7 text-2xl font-semibold text-slate-100 md:text-3xl">
              {t.tagA}
              <br />
              <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-white bg-clip-text text-transparent">
                {t.tagB}
              </span>
            </p>

            <p className="mt-6 max-w-[560px] text-base leading-7 text-slate-400 md:text-lg">
              {t.heroDesc}
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a
                href={loggedIn ? chatHref : signupHref}
                className="group flex items-center gap-3 rounded-xl bg-white px-7 py-4 font-bold text-black transition hover:-translate-y-1 hover:bg-cyan-300"
              >
                {t.ctaFree}
                <ArrowRight size={18} className="transition group-hover:translate-x-1" />
              </a>
              <a
                href="#mission"
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-7 py-4 font-semibold text-slate-200 backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.05]"
              >
                <PlayIcon />
                {t.ctaHow}
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-yellow-400">{t.freePlan}</span>
              <span className="text-slate-500">&bull;</span>
              <span className="text-slate-500">{t.freeChats}</span>
              <span className="text-slate-600">&bull;</span>
              <span className="text-slate-500">{t.freeReset}</span>
            </div>
            {!loggedIn && (
              <p className="mt-2 text-sm text-slate-500">
                {t.noAccount}{" "}
                <Link
                  href={signupHref}
                  className="font-semibold text-white hover:underline"
                >
                  {t.signupFree}
                </Link>
                {" · "}
                {t.hasAccount}{" "}
                <Link
                  href={loginHref}
                  className="font-semibold text-white hover:underline"
                >
                  {t.login}
                </Link>
              </p>
            )}
          </div>
        </div>

        {/* FLOATING KOLA STATUS */}
        <div className="absolute bottom-[90px] right-[7%] hidden w-[280px] rounded-2xl border border-cyan-400/20 bg-black/60 p-4 shadow-[0_0_50px_rgba(34,211,238,.08)] backdrop-blur-xl xl:block">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                <Bot size={19} />
              </div>
              <div>
                <div className="text-sm font-bold">Kola</div>
                <div className="text-[10px] text-slate-500">AI COMMANDER</div>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              ONLINE
            </span>
          </div>
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="text-[10px] text-slate-500">CURRENT MISSION</div>
            <div className="mt-1 text-sm text-slate-300">Orchestrating AI Team...</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 border-y border-white/[0.07] bg-[#080808]">
        <div className="mx-auto grid max-w-[1400px] grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <Feature icon={<BrainCircuit />} title="Multi-AI" text={t.fMulti} />
          <Feature icon={<Search />} title="Search" text={t.fSearch} />
          <Feature icon={<FileSearch />} title="RAG" text={t.fRag} />
          <Feature icon={<Code2 />} title="Coding" text={t.fCode} />
          <Feature icon={<Sparkles />} title="Reasoning" text={t.fReason} />
          <Feature icon={<Zap />} title="Automation" text={t.fAuto} />
        </div>
      </section>

      {/* AI TEAM */}
      <section id="team" className="relative z-10 bg-[#050505] py-28">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="text-center">
            <div className="text-xs font-bold tracking-[0.35em] text-cyan-400">
              {t.teamEyebrow}
            </div>
            <h2 className="mt-5 text-4xl font-black md:text-6xl">{t.teamH}</h2>
            <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-500">{t.teamSub}</p>
          </div>

          <div className="relative mt-16">
            <div className="absolute left-1/2 top-[85px] hidden h-[120px] w-px bg-gradient-to-b from-cyan-400 to-transparent md:block" />
            <div className="mx-auto max-w-[420px]">
              <TeamCard
                icon={<BrainCircuit />}
                role="ORCHESTRATOR"
                name={t.teamLead}
                description={t.teamLeadD}
                active
              />
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-4">
              <TeamCard
                icon={<Globe2 />}
                role="RESEARCHER"
                name={t.teamR}
                description={t.teamRD}
              />
              <TeamCard icon={<Code2 />} role="CODER" name={t.teamC} description={t.teamCD} />
              <TeamCard
                icon={<FileSearch />}
                role="DOCUMENT AI"
                name={t.teamD}
                description={t.teamDD}
              />
              <TeamCard icon={<Cpu />} role="BACKUP AI" name={t.teamB} description={t.teamBD} />
            </div>
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section
        id="mission"
        className="relative z-10 border-y border-white/[0.07] bg-[#080808] py-28"
      >
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <div className="text-xs font-bold tracking-[0.35em] text-orange-400">
                {t.mEyebrow}
              </div>
              <h2 className="mt-5 text-4xl font-black leading-tight md:text-6xl">
                {t.mH1}
                <br />
                <span className="bg-gradient-to-r from-orange-300 to-cyan-400 bg-clip-text text-transparent">
                  {t.mH2}
                </span>
              </h2>
              <p className="mt-6 leading-8 text-slate-500">{t.mDesc}</p>
              <a
                href={chatHref}
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-bold text-black"
              >
                {t.mCta}
                <ArrowRight size={17} />
              </a>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black p-5 shadow-[0_0_80px_rgba(34,211,238,.04)] md:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
                    <Bot size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold">KOLA COMMAND</div>
                    <div className="text-[10px] text-slate-600">MISSION #001</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-green-400">RUNNING</span>
              </div>

              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-[10px] text-slate-600">USER REQUEST</div>
                <div className="mt-2 text-sm leading-6 text-slate-300">{t.mReq}</div>
              </div>

              <div className="mt-6 space-y-3">
                <Mission
                  icon={<BrainCircuit size={15} />}
                  name={t.teamLead}
                  status="Planning"
                  active
                />
                <Mission
                  icon={<Globe2 size={15} />}
                  name={t.teamR}
                  status="Searching web"
                  active
                />
                <Mission
                  icon={<FileSearch size={15} />}
                  name={t.teamD}
                  status="Reading PDF"
                  active
                />
                <Mission icon={<Code2 size={15} />} name={t.teamC} status="Waiting" />
                <Mission
                  icon={<Sparkles size={15} />}
                  name={t.teamJ}
                  status="Final review"
                />
              </div>

              <div className="mt-6 border-t border-white/10 pt-5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Mission progress</span>
                  <span className="text-cyan-400">68%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div className="h-full w-[68%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative z-10 bg-[#050505] py-24">
        <div className="mx-auto max-w-[1000px] px-6 text-center">
          <div className="text-xs font-bold tracking-[0.35em] text-cyan-400">{t.pEyebrow}</div>
          <h2 className="mt-5 text-4xl font-black md:text-6xl">
            {t.pH1}
            <br />
            {t.pH2}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl leading-7 text-slate-500">{t.pSub}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Badge text="Smart Routing" />
            <Badge text="Multi-Agent" />
            <Badge text="RAG" />
            <Badge text="Semantic Cache" />
            <Badge text="AI Judge" />
          </div>

          <div className="mt-12 grid gap-5 text-left md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-8">
              <h3 className="text-xl font-bold">{t.freeName}</h3>
              <p className="mt-1 text-xs text-slate-500">{t.freeSub}</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black">$0</span>
                <span className="text-slate-500">{t.perMo}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-slate-400">
                <li>&#10003; {t.freeF1}</li>
                <li>&#10003; {t.freeF2}</li>
                <li>&#10003; {t.freeF3}</li>
              </ul>
              <a
                href={loggedIn ? chatHref : signupHref}
                className="mt-8 block rounded-xl bg-white py-3 text-center font-bold text-black"
              >
                {t.freeCta}
              </a>
            </div>
            <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/[0.03] p-8 opacity-80">
              <div className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold text-black">
                {t.proBadge}
              </div>
              <h3 className="text-xl font-bold">{t.proName}</h3>
              <p className="mt-1 text-xs text-slate-500">{t.proSub}</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black">$20</span>
                <span className="text-slate-500">{t.perMo}</span>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-slate-400">
                <li>&#10003; {t.proF1}</li>
                <li>&#10003; {t.proF2}</li>
                <li>&#10003; {t.proF3}</li>
              </ul>
              <button
                disabled
                className="mt-8 block w-full cursor-not-allowed rounded-xl bg-white/10 py-3 text-center font-bold text-slate-400"
              >
                {t.proCta}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        id="roadmap"
        className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#080808] py-32"
      >
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.06] blur-[120px]" />
        <div className="relative mx-auto max-w-[900px] px-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
            <Bot size={30} />
          </div>
          <h2 className="mt-7 text-4xl font-black md:text-6xl">
            {t.ctaH1}
            <span className="text-cyan-400"> {t.ctaH2}</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-slate-500">{t.ctaSub}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <a
              href={loggedIn ? chatHref : signupHref}
              className="rounded-xl bg-white px-8 py-4 font-bold text-black transition hover:bg-cyan-300"
            >
              {t.ctaFree}
            </a>
            <a
              href={chatHref}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-8 py-4 font-bold text-white"
            >
              {t.ctaTry}
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/[0.07] bg-black">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-5 px-6 py-8 md:flex-row md:items-center">
          <div>
            <div className="text-lg font-bold text-slate-300">
              ViHok <span className="text-cyan-400">AI</span>
            </div>
            <div className="mt-1 text-xs text-slate-700">{t.footerSub}</div>
          </div>
          <div className="flex gap-6 text-xs text-slate-600">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Security</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/**
 * KOLA hero image. Gates rendering on load so the page never flashes a
 * broken image. Uses next/image instead of <img> to satisfy the
 * no-img-element lint rule.
 */
function KolaHero() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setOk(true);
    img.onerror = () => setOk(false);
    img.src = "/kola-hero.png";
  }, []);
  if (!ok) return null;
  return (
    <Image
      src="/kola-hero.png"
      alt="VihokAI Kola robotic bird"
      width={850}
      height={720}
      priority
      className="absolute right-[-10%] top-[30px] h-[720px] w-[850px] object-contain object-center opacity-95 lg:right-[-5%]"
    />
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 border-r border-white/[0.07] px-5 py-5">
      <div className="text-cyan-400">{icon}</div>
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="text-[10px] text-slate-600">{text}</div>
      </div>
    </div>
  );
}

function TeamCard({
  icon,
  role,
  name,
  description,
  active = false,
}: {
  icon: React.ReactNode;
  role: string;
  name: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        active
          ? "border-cyan-400/40 bg-cyan-400/[0.05] shadow-[0_0_50px_rgba(34,211,238,.08)]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            active ? "bg-cyan-400/10 text-cyan-400" : "bg-white/[0.05] text-slate-400"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-bold tracking-[0.2em] text-slate-600">{role}</div>
          <div className="mt-1 font-bold">{name}</div>
          <div className="mt-1 text-xs text-slate-600">{description}</div>
        </div>
      </div>
    </div>
  );
}

function Mission({
  icon,
  name,
  status,
  active = false,
}: {
  icon: React.ReactNode;
  name: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          active ? "bg-cyan-400/10 text-cyan-400" : "bg-white/[0.04] text-slate-600"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-xs font-bold">{name}</div>
        <div className="text-[10px] text-slate-600">{status}</div>
      </div>
      <div
        className={`h-1.5 w-1.5 rounded-full ${
          active ? "animate-pulse bg-green-400" : "bg-slate-700"
        }`}
      />
    </div>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-400">
      {text}
    </span>
  );
}

function PlayIcon() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
      <span className="ml-0.5 border-y-[4px] border-l-[6px] border-y-transparent border-l-cyan-400" />
    </span>
  );
}
