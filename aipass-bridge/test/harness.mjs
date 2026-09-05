// Test harness: runs the real bridge and a scriptable stand-in for the Chrome
// extension, so tests exercise the actual HTTP surface and the real CLIs.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SERVER = path.join(HERE, '..', 'bridge', 'server.mjs');
export const AGENT = path.join(HERE, '..', 'agent.mjs');
export const CHAT = path.join(HERE, '..', 'chat.mjs');
export const DOCTOR = path.join(HERE, '..', 'doctor.mjs');

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function waitFor(check, { timeout = 5000, every = 25 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    if (await check()) return true;
    if (Date.now() > until) throw new Error('timed out waiting for a condition');
    await new Promise((r) => setTimeout(r, every));
  }
}

export async function startBridge(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, AIPASS_PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const base = `http://127.0.0.1:${port}`;
  await waitFor(() => fetch(`${base}/status`).then((r) => r.ok).catch(() => false));
  return {
    base,
    port,
    log,
    logText: () => log.join(''),
    stop() { child.kill('SIGKILL'); },
  };
}

// Turbo-stream encoder, so loader fixtures are built the way the real app
// encodes them rather than hand-written.
export function encodeTurboStream(value) {
  const flat = [];
  const prims = new Map();
  const put = (v) => { flat.push(v); return flat.length - 1; };
  const prim = (v) => {
    const k = `${typeof v}:${String(v)}`;
    if (prims.has(k)) return prims.get(k);
    const i = put(v); prims.set(k, i); return i;
  };
  const enc = (v) => {
    if (v === null || v === undefined) return -5;
    if (Array.isArray(v)) { const slot = put(null); flat[slot] = v.map(enc); return slot; }
    if (typeof v === 'object') {
      const slot = put(null);
      const o = {};
      for (const [k, val] of Object.entries(v)) o[`_${prim(k)}`] = enc(val);
      flat[slot] = o;
      return slot;
    }
    return prim(v);
  };
  enc(value);
  return JSON.stringify(flat);
}

export const modelsFixture = (models) => encodeTurboStream({
  'routes/loaders/list-models': { data: { models, gatewayFlash: null } },
});

export const assistantsFixture = (assistants) => encodeTurboStream({
  'routes/loaders/list-ai-assistants': { data: { data: assistants, error: null } },
});

// The video option loaders all answer with this row shape: keyed by provider,
// never by model id, with "all" applying to every provider.
export const videoOptionFixture = (route, rows) => encodeTurboStream({
  [`routes/loaders/${route}`]: { data: { data: rows, error: null } },
});

export const DEFAULT_VIDEO_OPTIONS = {
  'list-video-resolutions': [
    { id: 'r1', provider: 'seedance', label: '480p', value: '480p', is_default: true, is_active: true },
  ],
  'list-video-durations': [
    { id: 'd1', provider: 'seedance', label: '4s', value: 4, is_default: true, is_active: true },
    { id: 'd2', provider: 'seedance', label: '6s', value: 6, is_default: false, is_active: true },
  ],
  'list-video-aspect-ratios': [
    { id: 'a1', provider: 'all', label: '16:9', value: '16:9', is_default: true, is_active: true },
    { id: 'a2', provider: 'all', label: '9:16', value: '9:16', is_default: false, is_active: true },
    { id: 'a3', provider: 'seedance', label: '21:9', value: '21:9', is_default: false, is_active: true },
  ],
  'list-video-styles': [
    { id: 's1', name_en: 'Documentary', name_th: 'สารคดี', preprompt: 'Documentary style, natural camera work.', is_active: true },
    { id: 's2', name_en: 'Anime', name_th: 'อนิเมะ', preprompt: 'Japanese anime visual style.', is_active: true },
  ],
};

export const imageStylesFixture = () => encodeTurboStream({
  'routes/loaders/list-image-styles': { data: { data: [
    { id: 'img_anime', name_en: 'Anime', name_th: 'อนิเมะ', sort_order: 0, is_active: true },
    { id: 'img_minimal', name_en: 'Minimal', name_th: 'มินิมอล', sort_order: 1, is_active: true },
  ], error: null } },
});

// Output styles answer with two named lists, not one array — which is why the
// bridge picks them out by name rather than through extractRows.
export const outputStylesFixture = () => encodeTurboStream({
  'routes/loaders/list-output-styles': { data: {
    tones: [
      { id: 'tone_concise', code: 'concise', nameEn: 'Concise', nameTh: 'กระชับ' },
      { id: 'tone_academic', code: 'academic', nameEn: 'Academic', nameTh: 'วิชาการ' },
    ],
    formats: [
      { id: 'fmt_table', code: 'table', nameEn: 'Table', nameTh: 'ตาราง' },
      { id: 'fmt_bullets', code: 'bullet_points', nameEn: 'Bullet Points', nameTh: 'หัวข้อย่อย' },
    ],
    ok: true,
  } },
});

export const conversationsFixture = (conversations) => encodeTurboStream({
  'routes/loaders/list-converstaions': { data: { conversations, gatewayFlash: null } },
});

// The real response derives the id from the first 16 hex characters of the
// clientCreateRequestId, so the fake does the same.
export const createFixture = (requestId, initialMessage) => encodeTurboStream({
  data: {
    conversationId: requestId.replace(/-/g, '').slice(0, 16),
    initialMessage,
    error: null,
    clientCreateRequestId: requestId,
  },
});

// intent=create-temporary-chat answers with the conversation object itself —
// no conversationId field, the id lives under `id` — and marks it temporary.
export const temporaryChatFixture = (id = 'M5uhmgOBsPk0v4WN') => encodeTurboStream({
  data: {
    conversation: {
      id,
      aiAssistantId: null,
      title: 'New Conversation',
      modelId: 'gemini-3.1-flash-lite',
      isTemporary: true,
      expiresAt: '2027-09-03T04:42:45.870Z',
      routingMode: 'manual',
      isPinned: false,
      createdAt: '2026-09-03T04:42:45.870Z',
    },
    error: null,
  },
});

// get-usage-quota answers with plain JSON, not turbo-stream. Figures are
// integers scaled by creditsDecimals, exactly as the real loader sends them.
export const quotaFixture = ({ limit = '10000000000', used = '167042858', available = '9832957142', decimals = 6 } = {}) =>
  JSON.stringify({
    success: true,
    creditStatusFetchedAt: 1788168532745,
    creditStatus: {
      userId: '216052379627656642221',
      periodEndsAt: '2026-08-31T19:00:00.000Z',
      creditsDecimals: decimals,
      credits: { limit, used, available },
    },
    videoQuotaStatus: { count: { limit: 10, used: 0, remaining: 10, period: 'month' } },
  });

// One of each kind the live list contains, plus the ready-but-not-selectable
// case (openthai2.0-legal@jts is the real one), so the grouping and the
// filtering are both exercised against shapes the server actually sends.
const DEFAULT_MODELS = [
  { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', provider: 'google', providerName: 'Google', isFreeCredit: true, ready: true },
  { id: 'claude-sonnet-5@default', displayName: 'Claude Sonnet 5', provider: 'anthropic', providerName: 'Anthropic', ready: true, thinkingConfig: { supportedLevels: ['low', 'medium', 'high'] } },
  // Opus is the one model that advertises a fourth level, which is why the
  // levels have to come from the model rather than a hardcoded list.
  { id: 'claude-opus-5@azure', displayName: 'Claude Opus 5', provider: 'anthropic', providerName: 'Anthropic', ready: true, thinkingConfig: { supportedLevels: ['low', 'medium', 'high', 'max'] } },
  { id: 'veo-3.1-fast-generate-001', displayName: 'Veo 3.1 Fast', provider: 'google', providerName: 'Google', ready: true },
  // The only video model that offers a resolution, which is what makes the
  // per-model option gate observable.
  { id: 'seedance-2.0-mini', displayName: 'Seedance 2.0 Mini', provider: 'byteplus', providerName: 'BytePlus', ready: true },
  { id: 'gpt-image-2', displayName: 'GPT-Image-2', provider: 'openai', providerName: 'OpenAI', ready: true },
  { id: 'gemini-3-pro-image', displayName: 'Nano Banana Pro', provider: 'google', providerName: 'Google', ready: true },
  { id: 'lyria-3-pro-preview', displayName: 'Lyria 3 Pro', provider: 'google', providerName: 'Google', ready: true },
  { id: 'sonar-deep-research', displayName: 'Sonar Deep Research', provider: 'perplexity', providerName: 'Perplexity', ready: true },
  { id: 'sonar-reasoning-pro', displayName: 'Sonar Reasoning Pro', provider: 'perplexity', providerName: 'Perplexity', ready: true },
  { id: 'openthai2.0-legal@jts', displayName: 'OpenThai 2.0 Legal', provider: 'openthai', providerName: 'AIEAT', ready: true, selectable: false },
];
const DEFAULT_CONVERSATIONS = [
  { id: 'aaaa1111aaaa1111', title: 'newest', updatedAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bbbb2222bbbb2222', title: 'older', updatedAt: '2026-09-01T09:00:00.000Z' },
];

// Stands in for the extension. `onChat` receives the job plus an emitter and
// decides what the upstream would have streamed back.
export class FakeExtension {
  constructor(base, { onChat, models = DEFAULT_MODELS, conversations = DEFAULT_CONVERSATIONS, quota = quotaFixture(), assistants = [], videoOptions = DEFAULT_VIDEO_OPTIONS } = {}) {
    this.base = base;
    this.quota = quota;
    this.onChat = onChat ?? (async (_job, e) => { await e.text('ok'); await e.done(); });
    this.models = models;
    this.conversations = conversations;
    this.chats = [];       // every chat job received
    this.created = [];     // every create-conversation job received
    this.videos = [];      // every video-generation job received
    this.assistants = [];  // every assistant-creation job received
    this.existingAssistants = assistants;
    this.videoOptions = videoOptions;
    this.loaders = [];     // every loader url received
  }

  post(p, body) {
    return fetch(`${this.base}${p}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {});
  }

  async count() {
    const r = await fetch(`${this.base}/status`).then((x) => x.json()).catch(() => null);
    return r?.extensions ?? -1;
  }

  // Connect and disconnect have to be observed on the bridge, not just issued.
  // Otherwise a test can start while a previous one's client is still
  // registered, and round-robin hands it the wrong scripted reply.
  async connect() {
    const before = await this.count();
    this.controller = new AbortController();
    const res = await fetch(`${this.base}/ext/events`, { signal: this.controller.signal });
    this.reading = this.#read(res.body.getReader());
    await waitFor(async () => (await this.count()) > before);
    return this;
  }

  async disconnect() {
    if (this.gone) return;   // t.after also calls this after an explicit disconnect
    this.gone = true;
    const before = await this.count();
    this.controller?.abort();
    await waitFor(async () => (await this.count()) < before, { timeout: 2000 }).catch(() => {});
  }

  async #read(reader) {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let cut;
        while ((cut = buf.search(/\n\n/)) !== -1) {
          const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
          let name = 'message'; const data = [];
          for (const l of frame.split('\n')) {
            if (l.startsWith('event:')) name = l.slice(6).trim();
            else if (l.startsWith('data:')) data.push(l.slice(5).trim());
          }
          if (!data.length || name !== 'job') continue;
          this.#handle(JSON.parse(data.join('\n')));
        }
      }
    } catch { /* aborted */ }
  }

  async #handle(job) {
    if (job.kind === 'create') {
      this.created.push(job);
      const raw = job.temporary
        ? temporaryChatFixture()
        : createFixture(job.requestId, job.message);
      return void this.post('/ext/loader', { jobId: job.jobId, raw });
    }
    if (job.kind === 'loader') {
      this.loaders.push(job.url);
      const raw = job.url.includes('get-usage-quota')
        ? this.quota
        : job.url.includes('list-conversations')
        ? conversationsFixture(this.conversations)
        : job.url.includes('list-ai-assistants')
        ? assistantsFixture(this.existingAssistants)
        : job.url.includes('list-image-styles')
        ? imageStylesFixture()
        : job.url.includes('list-output-styles')
        ? outputStylesFixture()
        : /list-video-(resolutions|durations|aspect-ratios|styles)/.test(job.url)
        ? videoOptionFixture(job.url.match(/list-video-[a-z-]+/)[0], this.videoOptions[job.url.match(/list-video-[a-z-]+/)[0]] ?? [])
        : modelsFixture(this.models);
      return void this.post('/ext/loader', { jobId: job.jobId, raw });
    }
    if (job.kind === 'assistant') {
      this.assistants.push(job);
      if (job.op === 'start-chat') {
        return void this.post('/ext/assistant', { jobId: job.jobId, assistantId: job.assistantId, conversationId: 'bound1234bound12' });
      }
      if (job.op === 'delete') {
        return void this.post('/ext/assistant', { jobId: job.jobId, assistantId: job.assistantId, deleted: true });
      }
      return void this.post('/ext/assistant', { jobId: job.jobId, assistantId: `asst_fake_${this.assistants.length}` });
    }
    if (job.kind === 'video') this.videos.push(job);
    this.chats.push(job);
    const emit = {
      text: (t) => this.post('/ext/chunk', { jobId: job.jobId, parts: [{ kind: 'text', text: t }] }),
      status: (t) => this.post('/ext/chunk', { jobId: job.jobId, parts: [{ kind: 'status', text: t }] }),
      image: (url) => this.post('/ext/chunk', { jobId: job.jobId, parts: [{ kind: 'image', text: url }] }),
      // Generated media of any kind — the extension routes by media type, so a
      // video arrives as kind 'video' rather than being called an image.
      media: (kind, url, filename) => this.post('/ext/chunk', { jobId: job.jobId, parts: [{ kind, text: url, ...(filename ? { filename } : {}) }] }),
      done: (finishReason = 'stop') => this.post('/ext/done', { jobId: job.jobId, finishReason }),
      error: (message) => this.post('/ext/error', { jobId: job.jobId, message }),
    };
    await this.onChat(job, emit);
  }
}

// Replies the scripted list in order, and records the text of every turn.
// `sent` holds what the upstream actually accepted; a rejected attempt goes to
// `rejected` instead, so a test can assert that blocked content never got
// through without tripping over the attempt that was refused.
export function scripted(replies, { reject } = {}) {
  let turn = 0;
  const sent = [];
  const rejected = [];
  const handler = async (job, e) => {
    if (reject && reject(job.text)) {
      rejected.push(job.text);
      return void e.error('aipass returned 403 — 403 Forbidden');
    }
    sent.push(job.text);
    await e.text(replies[Math.min(turn++, replies.length - 1)]);
    await e.done();
  };
  handler.sent = sent;
  handler.rejected = rejected;
  return handler;
}

export function tempDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aipass-test-'));
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return dir;
}

// `stdin` may be a string (sent at once) or an array of [delayMs, line] pairs,
// which models a user typing after the process is already running — necessary
// for watch-mode tests, where a line sent before the prompt appears is lost.
// `env` overrides the child's environment, e.g. PATH:'' to make a binary the
// script would shell out to unfindable.
export function run(script, args, { cwd, stdin, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd, stdio: [stdin != null ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    if (typeof stdin === 'string') { child.stdin.write(stdin); child.stdin.end(); }
    else if (Array.isArray(stdin)) {
      let total = 0;
      for (const [delay, line] of stdin) {
        total += delay;
        setTimeout(() => { try { child.stdin.write(line); } catch {} }, total);
      }
      setTimeout(() => { try { child.stdin.end(); } catch {} }, total + 200);
    }
    child.on('close', (code) => resolve({ code, out: out.replace(/\x1b\[[0-9;]*m/g, '') }));
  });
}
