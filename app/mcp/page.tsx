"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bot,
  Boxes,
  Brain,
  Briefcase,
  Building2,
  Code2,
  Cpu,
  Database,
  FileText,
  Flame,
  Gauge,
  Globe,
  Heart,
  Layers,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Mic,
  Paperclip,
  Rocket,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Gateway                                                           */
/* ------------------------------------------------------------------ */

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_MCP4_GATEWAY_URL ?? "http://127.0.0.1:7423";

type GatewayHealth = {
  status?: string;
  gateway?: string;
  uptime?: number;
  tools?: number;
  bird?: string;
};

type GatewayTool = {
  name: string;
  status?: string;
  description?: string;
};

/* ------------------------------------------------------------------ */
/*  Left rail — 20 menus (WORKSPACES 3 + PLATFORM 15 + ของฉัน 2)      */
/* ------------------------------------------------------------------ */

type MenuItem = { key: string; label: string; icon: typeof Bot };

const WORKSPACES: MenuItem[] = [
  { key: "ws-chat", label: "แชท AI", icon: MessageSquare },
  { key: "ws-code", label: "เขียนโค้ด", icon: Code2 },
  { key: "ws-docs", label: "เอกสาร", icon: FileText },
];

const PLATFORM: MenuItem[] = [
  { key: "pf-dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { key: "pf-mcp", label: "MCP Gateway", icon: Server },
  { key: "pf-models", label: "โมเดล", icon: Brain },
  { key: "pf-agents", label: "เอเจนต์", icon: Bot },
  { key: "pf-tools", label: "เครื่องมือ", icon: Wrench },
  { key: "pf-data", label: "ข้อมูล", icon: Database },
  { key: "pf-analytics", label: "วิเคราะห์", icon: LineChart },
  { key: "pf-deploy", label: "ดีพลอย", icon: Rocket },
  { key: "pf-infra", label: "โครงสร้างพื้นฐาน", icon: Boxes },
  { key: "pf-security", label: "ความปลอดภัย", icon: Shield },
  { key: "pf-team", label: "ทีม", icon: Users },
  { key: "pf-org", label: "องค์กร", icon: Building2 },
  { key: "pf-web", label: "เว็บ", icon: Globe },
  { key: "pf-perf", label: "ประสิทธิภาพ", icon: Gauge },
  { key: "pf-settings", label: "ตั้งค่า", icon: Settings },
];

const MINE: MenuItem[] = [
  { key: "me-fav", label: "รายการโปรด", icon: Heart },
  { key: "me-work", label: "งานของฉัน", icon: Briefcase },
];

/* ------------------------------------------------------------------ */
/*  Center — 7 model cards                                            */
/* ------------------------------------------------------------------ */

type ModelCard = {
  id: string;
  name: string;
  vendor: string;
  context: string;
  badge?: string;
  accent: string;
};

const MODELS: ModelCard[] = [
  {
    id: "kola-swift-rajin",
    name: "Kola Swift - Rajin",
    vendor: "ViHokAI",
    context: "200K",
    badge: "NEW",
    accent: "#22d3ee",
  },
  {
    id: "kola-swift",
    name: "Kola Swift",
    vendor: "ViHokAI",
    context: "128K",
    accent: "#38bdf8",
  },
  {
    id: "gpt-6-sol",
    name: "GPT-6 Sol",
    vendor: "OpenAI",
    context: "256K",
    accent: "#a78bfa",
  },
  {
    id: "claude-opus",
    name: "Claude Opus",
    vendor: "Anthropic",
    context: "200K",
    accent: "#fb923c",
  },
  {
    id: "gemini-ultra",
    name: "Gemini Ultra",
    vendor: "Google",
    context: "1M",
    accent: "#60a5fa",
  },
  {
    id: "glm-5",
    name: "GLM-5",
    vendor: "Z.ai",
    context: "128K",
    accent: "#34d399",
  },
  {
    id: "deepseek-v4",
    name: "DeepSeek V4",
    vendor: "DeepSeek",
    context: "160K",
    accent: "#f472b6",
  },
];

/* ------------------------------------------------------------------ */
/*  Right rail — 6 tools                                              */
/* ------------------------------------------------------------------ */

const TOOL_ICONS: Record<string, typeof Bot> = {
  copilot_install: Cpu,
  copilot_prompt: Sparkles,
  hubspot_track: Activity,
  hubspot_widget_deploy: Layers,
  vihokai_deploy: Rocket,
  mcp4_status: Terminal,
};

const FALLBACK_TOOLS: GatewayTool[] = [
  { name: "copilot_install", status: "ready" },
  { name: "copilot_prompt", status: "ready" },
  { name: "hubspot_track", status: "ready" },
  { name: "hubspot_widget_deploy", status: "deployed" },
  { name: "vihokai_deploy", status: "ready" },
  { name: "mcp4_status", status: "online" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function McpDashboardPage() {
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [online, setOnline] = useState(false);
  const [tools, setTools] = useState<GatewayTool[]>(FALLBACK_TOOLS);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState("pf-mcp");
  const [activeModel, setActiveModel] = useState("kola-swift-rajin");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const [hRes, tRes, lRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/health`, { cache: "no-store" }),
        fetch(`${GATEWAY_URL}/tools`, { cache: "no-store" }),
        fetch(`${GATEWAY_URL}/logs`, { cache: "no-store" }),
      ]);
      const h = (await hRes.json()) as GatewayHealth;
      const t = (await tRes.json()) as { tools?: GatewayTool[] };
      const l = (await lRes.json()) as { logs?: string[] };
      setHealth(h);
      setOnline(h.status === "healthy" || h.status === "ok");
      if (Array.isArray(t.tools) && t.tools.length) setTools(t.tools);
      if (Array.isArray(l.logs)) setLogs(l.logs);
    } catch {
      setOnline(false);
      setHealth(null);
      setLogs((prev) =>
        prev.length
          ? prev
          : [
              "[offline] Gateway unreachable at " + GATEWAY_URL,
              "[hint] run scripts/Start-MCP4Gateway.ps1",
            ],
      );
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const selectedModel = useMemo(
    () => MODELS.find((m) => m.id === activeModel) ?? MODELS[0],
    [activeModel],
  );

  const uptime = health?.uptime ? `${Math.floor(health.uptime)}s` : "—";

  const send = useCallback(() => {
    const text = message.trim();
    if (!text) return;
    setSent(text);
    setMessage("");
  }, [message]);

  return (
    <div className="flex min-h-screen flex-col bg-[#050505] text-white">
      {/* PowerShell title bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#012456]/40 px-4 backdrop-blur">
        <div className="flex items-center gap-3 font-mono text-[12px]">
          <Link
            href="/th"
            className="flex items-center gap-1 text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            กลับ
          </Link>
          <span className="text-cyan-400">PS</span>
          <span className="text-slate-400">C:\vihokai\mcp4-copilot&gt;</span>
          <span className="h-4 w-2 animate-pulse bg-cyan-400" />
          <span className="ml-2 hidden text-[11px] text-slate-500 sm:inline">
            {GATEWAY_URL}/
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className={`h-2 w-2 rounded-full ${
              online ? "animate-pulse bg-green-400" : "bg-red-500"
            }`}
          />
          <span className={online ? "text-green-400" : "text-red-400"}>
            {online ? "GATEWAY ONLINE" : "GATEWAY OFFLINE"}
          </span>
          <span className="hidden text-slate-500 md:inline">
            Kola Swift Rajin MK-IV
          </span>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ---------------- Left rail (320px) ---------------- */}
        <aside className="w-full shrink-0 border-b border-white/10 bg-[#0a0a0a]/60 p-3 lg:w-[320px] lg:border-b-0 lg:border-r">
          <MenuGroup title="WORKSPACES" items={WORKSPACES} active={activeMenu} onSelect={setActiveMenu} />
          <MenuGroup title="PLATFORM" items={PLATFORM} active={activeMenu} onSelect={setActiveMenu} />
          <MenuGroup title="ของฉัน" items={MINE} active={activeMenu} onSelect={setActiveMenu} />
        </aside>

        {/* ---------------- Center ---------------- */}
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          {/* Thai chat card */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold">แชท AI</h2>
              <span className="ml-auto font-mono text-[10px] text-slate-500">
                {selectedModel.name} • {selectedModel.context}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="แคลอรี่" value="1,850" unit="kcal" accent="#22d3ee" />
              <Stat label="โปรตีน" value="110" unit="g" accent="#34d399" />
              <Stat label="ก้าวเดิน" value="8,000" unit="steps" accent="#a78bfa" />
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-[#050505] p-2">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-cyan-300"
                aria-label="แนบไฟล์"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="พิมพ์ข้อความถึง Kola Swift Rajin…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-600"
              />
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-cyan-300"
                aria-label="อัดเสียง"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={send}
                className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/30"
              >
                <Send className="h-3.5 w-3.5" />
                ส่ง
              </button>
            </div>

            {sent && (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-cyan-100">
                <span className="text-slate-500">คุณ:</span> {sent}
                <div className="mt-1 text-slate-400">
                  <span className="text-cyan-300">Kola Swift Rajin:</span>{" "}
                  กำลังประมวลผลผ่าน MCP Gateway…
                </div>
              </div>
            )}
          </section>

          {/* Model cards */}
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold">โมเดลที่ใช้ได้</h2>
              <span className="ml-auto font-mono text-[10px] text-slate-500">
                {MODELS.length} models
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MODELS.map((m) => {
                const active = m.id === activeModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveModel(m.id)}
                    className={`group relative overflow-hidden rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-cyan-400/50 bg-cyan-400/10"
                        : "border-white/10 bg-[#0a0a0a] hover:border-white/20"
                    }`}
                    style={
                      active
                        ? { boxShadow: `0 0 24px -6px ${m.accent}` }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: m.accent }}
                      />
                      <span className="truncate text-xs font-semibold">
                        {m.name}
                      </span>
                      {m.badge && (
                        <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-200">
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-slate-500">
                      <span>{m.vendor}</span>
                      <span>{m.context}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </main>

        {/* ---------------- Right rail (360px) ---------------- */}
        <aside className="w-full shrink-0 border-t border-white/10 bg-[#0a0a0a]/60 p-3 lg:w-[360px] lg:border-t-0 lg:border-l">
          {/* Kola Swift Rajin dashboard */}
          <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-cyan-300" />
              <h2 className="text-xs font-bold">Kola Swift Rajin</h2>
              <span
                className={`ml-auto font-mono text-[10px] ${
                  online ? "text-green-400" : "text-red-400"
                }`}
              >
                {online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-slate-400">
              PS C:\vihokai\mcp4-copilot&gt;
            </div>

            {/* Bird pulse */}
            <div className="mt-3 flex items-center gap-3">
              <div className="relative flex h-[60px] w-[60px] items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400/30" />
                <span className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full border border-cyan-400/40 bg-[#050505] text-2xl">
                  🦅
                </span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold">
                  {health?.bird ?? "Kola Swift Rajin MK-IV"}
                </div>
                <div className="font-mono text-[10px] text-slate-500">
                  uptime {uptime} • {tools.length} tools
                </div>
              </div>
            </div>
          </section>

          {/* Terminal logs */}
          <section className="mt-3 rounded-2xl border border-white/10 bg-[#050505] p-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-cyan-300" />
              <h2 className="text-xs font-bold">Live Logs — 7423</h2>
              <span className="ml-auto font-mono text-[10px] text-slate-500">
                {logs.length}
              </span>
            </div>
            <div
              ref={logRef}
              className="mt-2 h-[180px] overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-slate-400"
            >
              {logs.length ? (
                logs.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-slate-600">รอข้อมูลจาก gateway…</div>
              )}
            </div>
          </section>

          {/* Tools grid */}
          <section className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-cyan-300" />
              <h2 className="text-xs font-bold">MCP Tools</h2>
              <span className="ml-auto font-mono text-[10px] text-slate-500">
                {tools.length}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {tools.map((t) => {
                const Icon = TOOL_ICONS[t.name] ?? Zap;
                const ok = t.status !== "offline";
                return (
                  <div
                    key={t.name}
                    className="rounded-xl border border-white/10 bg-[#0a0a0a] p-2"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-cyan-300" />
                      <span className="truncate font-mono text-[10px]">
                        {t.name}
                      </span>
                    </div>
                    <div
                      className={`mt-1 font-mono text-[9px] ${
                        ok ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {t.status ?? "ready"}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function MenuGroup({
  title,
  items,
  active,
  onSelect,
}: {
  title: string;
  items: MenuItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <nav className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                isActive
                  ? "bg-cyan-400/10 text-cyan-200"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a] p-2.5">
      <div className="font-mono text-[10px] text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-base font-bold" style={{ color: accent }}>
          {value}
        </span>
        <span className="font-mono text-[10px] text-slate-500">{unit}</span>
      </div>
    </div>
  );
}
