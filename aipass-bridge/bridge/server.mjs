// Local bridge to de.aipass.net's chat.
//
// The bridge never sees a session cookie. It hands work to the Chrome
// extension over SSE; the extension performs the real request from inside a
// de.aipass.net page, where the browser attaches credentials itself.
//
// Scope is deliberately narrow: send the user's message, stream the reply
// back. The server owns the conversation and its history, exactly as it does
// for the web UI, so there is nothing to reconstruct on this side.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.AIPASS_PORT ?? 8787);
const HOST = process.env.AIPASS_HOST ?? '127.0.0.1';
const MODELS_FALLBACK = (process.env.AIPASS_MODELS ?? 'gemini-3.1-flash-lite,claude-sonnet-5@default')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Where upstream tool activity (web_search progress, sources) goes:
// 'reasoning' -> delta.reasoning_content, 'text' -> inline, 'off' -> dropped.
const TOOL_VISIBILITY = process.env.AIPASS_TOOL_VISIBILITY ?? 'reasoning';
const PINNED_CONVERSATION = process.env.AIPASS_CONVERSATION_ID ?? '';
const IDLE_TIMEOUT_MS = Number(process.env.AIPASS_IDLE_TIMEOUT_MS ?? 180_000);
// Rendering a video or a music clip can go quiet for minutes at a stretch. The
// timeout is on silence, not on total time, but three minutes of it is normal
// here and would kill a generation that was going to succeed — and the credits
// are already spent by then.
const MEDIA_TIMEOUT_MS = Number(process.env.AIPASS_MEDIA_TIMEOUT_MS ?? 900_000);
// How often a streaming response emits an SSE comment when it has nothing else
// to say. Comfortably inside the 300s body timeout that Node's own fetch applies.
const KEEPALIVE_MS = Number(process.env.AIPASS_KEEPALIVE_MS ?? 15_000);
// Attachments up to MAX_ATTACHMENT_BYTES travel Base64-inlined in a JSON
// envelope, which costs a third again plus escaping — the client-facing cap has
// to hold that whole envelope or the advertised 20 MB file is undeliverable.
const MAX_BODY = 32 * 1024 * 1024;
// The extension's own posts are trusted and carry generated media inline (a
// video up to the page's 50 MB inline cap is ~67 MB of Base64), so they get a
// higher ceiling than client requests.
const MAX_EXT_BODY = 128 * 1024 * 1024;

let defaultModel = process.env.AIPASS_MODEL ?? 'gemini-3.1-flash-lite';
// Bind newly created conversations to a custom aipass assistant. The form field
// name is not yet confirmed from a capture, so it is configurable; the default
// is the most likely candidate and is harmless if the server ignores it.
let assistantId = process.env.AIPASS_ASSISTANT_ID ?? '';
// Only the image models read this; the chat models ignore it. The web UI offers
// 1:1, 3:4 and 4:3, and a request may override the default per call.
let aspectRatio = process.env.AIPASS_ASPECT_RATIO ?? '1:1';
const ASSISTANT_FIELD = process.env.AIPASS_ASSISTANT_FIELD ?? 'aiAssistantId';

// This bridge has no authentication, so it must not be reachable from arbitrary
// web pages — anything that can talk to it can spend the account's credits.
//
// CORS is therefore OFF by default: the CLI clients ignore CORS entirely and the
// extension reaches the bridge with host-permission privilege, so neither needs
// it. Set AIPASS_CORS_ORIGIN only if you deliberately want a browser page to
// call the bridge. Admin/deployment routes stay off unless AIPASS_ADMIN=1.
const CORS_ORIGIN = process.env.AIPASS_CORS_ORIGIN ?? '';
const ADMIN = process.env.AIPASS_ADMIN === '1';
const ALLOWED_HOSTS = new Set([
  '127.0.0.1', 'localhost', '::1', '[::1]',
  ...(process.env.AIPASS_ALLOWED_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
]);

// A DNS-rebinding attacker points a name they control at 127.0.0.1 and has the
// victim's browser POST here. Loopback literals are fine; an unexpected domain
// in the Host header is not.
function hostAllowed(req) {
  const hostname = String(req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  return !hostname || ALLOWED_HOSTS.has(hostname);
}

const corsHeaders = () => (CORS_ORIGIN
  ? { 'access-control-allow-origin': CORS_ORIGIN, 'access-control-allow-private-network': 'true' }
  : {});

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ------------------------------------------------- react-router turbo-stream */

// The app's .data loaders return a flat pool of values where objects address
// their keys and values by index.
function decodeTurboStream(text) {
  const flat = JSON.parse(text);
  const seen = new Map();
  const resolve = (ref) => {
    if (typeof ref !== 'number') return ref;
    if (ref < 0) return null; // undefined / null sentinels
    if (seen.has(ref)) return seen.get(ref);
    const v = flat[ref];
    if (Array.isArray(v)) {
      const out = [];
      seen.set(ref, out);
      for (const e of v) out.push(resolve(e));
      return out;
    }
    if (v && typeof v === 'object') {
      const out = {};
      seen.set(ref, out);
      for (const [k, valueRef] of Object.entries(v)) out[resolve(Number(k.slice(1)))] = resolve(valueRef);
      return out;
    }
    seen.set(ref, v);
    return v;
  };
  return resolve(0);
}

const LOADERS = {
  models: '/loaders/list-models.data?_routes=routes%2Floaders%2Flist-models',
  conversations: '/loaders/list-conversations.data?_routes=routes%2Floaders%2Flist-converstaions',
  // Unlike the other two this one answers with plain JSON and takes no _routes
  // parameter, so it is parsed rather than turbo-stream decoded.
  quota: '/loaders/get-usage-quota',
  assistants: '/loaders/list-ai-assistants.data?_routes=routes%2Floaders%2Flist-ai-assistants',
  // The four that describe what a video model will accept. Each answers with
  // rows keyed by *provider* — seedance, veo, or "all" — never by model id.
  videoResolutions: '/loaders/list-video-resolutions.data?_routes=routes%2Floaders%2Flist-video-resolutions',
  videoDurations: '/loaders/list-video-durations.data?_routes=routes%2Floaders%2Flist-video-durations',
  videoAspectRatios: '/loaders/list-video-aspect-ratios.data?_routes=routes%2Floaders%2Flist-video-aspect-ratios',
  videoStyles: '/loaders/list-video-styles.data?_routes=routes%2Floaders%2Flist-video-styles',
  // Image styles carry no preprompt — they are sent by id as imageStyleId,
  // unlike a video style, which is sent as its preprompt text.
  imageStyles: '/loaders/list-image-styles.data?_routes=routes%2Floaders%2Flist-image-styles',
  outputStyles: '/loaders/list-output-styles.data?_routes=routes%2Floaders%2Flist-output-styles',
};

// list-models carries no category field — the tabs in the web UI (สนทนา,
// สร้างรูปภาพ, สร้างวิดีโอ, สร้างเพลง, ค้นคว้าเชิงลึก) are built client-side, so
// the grouping has to be made here. These lists are the app's own, lifted
// verbatim from its bundle rather than guessed, and include ids the account
// cannot currently see — a model that appears later is then already classified.
const KIND_IDS = {
  image: ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image', 'FLUX.2-pro', 'gpt-image-2', 'seedream-4.0', 'seedream-4.5',
    'seedream-5.0-lite', 'flux2-klein-4b@jts', 'mock-remote-image'],
  video: ['veo-3.0-generate-001', 'veo-3.1-generate-001', 'veo-3.1-fast-generate-001', 'sora-2',
    'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini', 'wan2.2@jts', 'mock-remote-video'],
  music: ['lyria-3-clip-preview', 'lyria-3-pro-preview'],
  research: ['gemini-2.5-pro-deep-research', 'openai-deep-research', 'sonar-deep-research',
    'mock-remote-deep-research'],
};
const KIND_BY_ID = new Map(Object.entries(KIND_IDS).flatMap(([kind, ids]) => ids.map((id) => [id, kind])));

// A model the lists have never heard of still has to land somewhere, so the old
// name-shaped rules stay as a fallback for anything new.
const KIND_PATTERNS = [
  ['image', /seedream|gpt-image|flux|-image$|image-preview/i],
  ['video', /^veo-|seedance|^sora-|^wan\d/i],
  ['music', /lyria/i],
  ['research', /deep-research/i],
];

const kindOf = (id) => KIND_BY_ID.get(id) ?? KIND_PATTERNS.find(([, re]) => re.test(id))?.[0] ?? 'chat';

// The submit route validates `provider` against its own small enum — veo, sora,
// seedance, wan — which is NOT the model's display provider (seedance's is
// "byteplus"). It is derived from the id prefix, the same way the app derives
// it, and a body carrying the wrong one is rejected as "Invalid request body".
const VIDEO_PROVIDERS = [
  ['seedance', /^seedance/i],
  ['veo', /^veo/i],
  ['sora', /^sora/i],
  ['wan', /^wan/i],
];
const videoProviderOf = (id) => VIDEO_PROVIDERS.find(([, re]) => re.test(id))?.[0];

// Last-resort resolutions, used only when the loader cannot be read — no tab, or
// the route moved. These came from the app bundle, and the live loader disagrees
// with them: it serves 480p alone for this account. That disagreement is the
// whole reason the served values win.
const VIDEO_RESOLUTIONS_FALLBACK = { seedance: ['480p', '720p'] };

// What the four video-option loaders returned, refreshed with the model list.
let videoOptions = { at: 0, resolutions: [], durations: [], aspectRatios: [], styles: [] };
// Image styles, and the tone/format presets that apply to any chat model.
let styleOptions = { at: 0, imageStyles: [], tones: [], formats: [] };

// Every one of those loaders answers with the same row shape, so one reader
// covers all four: the first array of objects carrying a string id.
function extractRows(decoded) {
  let rows = null;
  const walk = (v) => {
    if (!v || typeof v !== 'object' || rows) return;
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string')) { rows = v; return; }
      return void v.forEach(walk);
    }
    Object.values(v).forEach(walk);
  };
  walk(decoded);
  return (rows ?? []).filter((r) => r.is_active !== false);
}

// Rows that apply to one provider. An "all" row applies to every provider, which
// is how 16:9 reaches veo while 21:9 stays specific to seedance.
const forProvider = (rows, provider) =>
  rows.filter((r) => r.provider === provider || r.provider === 'all');

const valuesFor = (rows, provider) => [...new Set(forProvider(rows, provider).map((r) => r.value))];

async function refreshVideoOptions() {
  const read = async (key) => {
    try { return extractRows(decodeTurboStream(await fetchLoader(LOADERS[key]))); }
    catch { return []; }
  };
  const [resolutions, durations, aspectRatios, styles] = await Promise.all([
    read('videoResolutions'), read('videoDurations'), read('videoAspectRatios'), read('videoStyles'),
  ]);
  if (resolutions.length || durations.length || aspectRatios.length || styles.length) {
    videoOptions = { at: Date.now(), resolutions, durations, aspectRatios, styles };
    log(`video options: ${resolutions.length} resolution(s), ${durations.length} duration(s), `
      + `${aspectRatios.length} ratio(s), ${styles.length} style(s)`);
  }
  return videoOptions;
}

async function refreshStyleOptions() {
  const read = async (key) => {
    try { return decodeTurboStream(await fetchLoader(LOADERS[key])); }
    catch { return null; }
  };
  const [imageDecoded, outputDecoded] = await Promise.all([read('imageStyles'), read('outputStyles')]);
  const imageStyles = imageDecoded ? extractRows(imageDecoded) : [];
  // Output styles answer with two named lists rather than one array, so they are
  // picked out by name instead of going through extractRows.
  let tones = [];
  let formats = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v.tones)) tones = v.tones;
    if (Array.isArray(v.formats)) formats = v.formats;
    Object.values(v).forEach(walk);
  };
  if (outputDecoded) walk(outputDecoded);
  if (imageStyles.length || tones.length || formats.length) {
    styleOptions = { at: Date.now(), imageStyles, tones, formats };
    log(`styles: ${imageStyles.length} image, ${tones.length} tone(s), ${formats.length} format(s)`);
  }
  return styleOptions;
}

// Match a preset by its English name, its Thai name, or its code — whichever the
// caller happened to have to hand.
const matchPreset = (rows, wanted) => {
  const want = String(wanted).trim().toLowerCase();
  return rows.find((r) =>
    String(r.name_en ?? r.nameEn ?? '').toLowerCase() === want
    || String(r.name_th ?? r.nameTh ?? '').trim() === String(wanted).trim()
    || String(r.code ?? '').toLowerCase() === want
    || String(r.id ?? '').toLowerCase() === want);
};

// A style may be named rather than pasted: --style Documentary resolves to that
// preset's preprompt, which is what the web client actually sends.
function stylePreprompt(text) {
  const wanted = String(text).trim().toLowerCase();
  const hit = videoOptions.styles.find((v) =>
    String(v.name_en ?? '').toLowerCase() === wanted || String(v.name_th ?? '').trim() === String(text).trim());
  return hit?.preprompt ?? text;
}

// How many images a video model will take alongside the prompt, and in which
// role. Not used to send anything yet; reported on /v1/models so a client can
// see what the model would accept.
const VIDEO_IMAGE_LIMITS = {
  'veo-3.0-generate-001': { maximumImages: 1, sourceImage: true, referenceImages: false },
  'veo-3.1-generate-001': { maximumImages: 3, sourceImage: true, referenceImages: true },
  'veo-3.1-fast-generate-001': { maximumImages: 3, sourceImage: true, referenceImages: true },
  'sora-2': { maximumImages: 1, sourceImage: true, referenceImages: false },
  'seedance-2.0': { maximumImages: 9, sourceImage: false, referenceImages: true },
  'seedance-2.0-fast': { maximumImages: 9, sourceImage: false, referenceImages: true },
  'seedance-2.0-mini': { maximumImages: 9, sourceImage: false, referenceImages: true },
  'wan2.2@jts': { maximumImages: 1, sourceImage: true, referenceImages: false },
};

// 'all' is the default: an image model you cannot see is one you cannot select.
// Set AIPASS_MODEL_FILTER=chat to get only the models a text client can drive.
const MODEL_FILTER = process.env.AIPASS_MODEL_FILTER ?? 'all';

function extractModels(decoded) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const id = v.id ?? v.modelId;
    if (typeof id === 'string' && id && !out.some((m) => m.id === id)) {
      const kind = kindOf(id);
      out.push({
        id,
        name: v.displayName ?? v.name ?? id,
        provider: v.providerName ?? v.provider ?? null,
        providerId: v.provider ?? null,
        description: v.description ?? null,
        kind,
        free: v.isFreeCredit === true,
        ready: v.ready !== false,
        // One model in the live list is ready but not selectable
        // (openthai2.0-legal@jts); the web UI does not offer it.
        selectable: v.selectable !== false,
        isDefault: v.isDefault === true,
        thinking: Array.isArray(v.thinkingConfig?.supportedLevels) ? v.thinkingConfig.supportedLevels : null,
        media: kind !== 'chat' && kind !== 'research',
      });
    }
    Object.values(v).forEach(walk);
  };
  walk(decoded);
  const usable = out.filter((m) => m.ready && m.selectable);
  return MODEL_FILTER === 'chat' ? usable.filter((m) => !m.media) : usable;
}

/* ---------------------------------------------------------------- job hub */

const jobs = new Map();
const extClients = new Set();
let rr = 0;

const pickClient = () => {
  const list = [...extClients];
  return list.length ? list[rr++ % list.length] : null;
};

const sendToClient = (client, event, data) =>
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

class Job {
  constructor({ kind = 'chat', modelId, text, parts, conversationId, aspectRatio: ratio, url, message, requestId, assistant, assistantField, temporary, thinkingLevel, video, spec, imageStyleId, outputTone, outputFormat, timeoutMs, onDelta, onDone, onError }) {
    this.id = randomUUID();
    this.kind = kind;
    this.url = url;
    this.message = message;
    this.requestId = requestId;
    this.assistant = assistant;
    this.assistantField = assistantField;
    this.temporary = temporary;
    this.thinkingLevel = thinkingLevel;
    this.video = video;
    this.spec = spec;
    this.imageStyleId = imageStyleId;
    this.outputTone = outputTone;
    this.outputFormat = outputFormat;
    this.timeoutMs = timeoutMs ?? IDLE_TIMEOUT_MS;
    this.modelId = modelId;
    this.text = text;
    this.parts = parts;
    this.conversationId = conversationId;
    this.aspectRatio = ratio;
    this.onDelta = onDelta;
    this.onDone = onDone;
    this.onError = onError;
    this.settled = false;
    this.touch();
    jobs.set(this.id, this);
  }
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('timed out waiting for the extension'), this.timeoutMs);
  }
  dispatch() {
    const client = pickClient();
    if (!client) return this.fail('no extension connected — open a de.aipass.net tab and check the popup');
    this.client = client;
    sendToClient(client, 'job', this.kind === 'loader'
      ? { jobId: this.id, kind: 'loader', url: this.url }
      : this.kind === 'create'
      ? { jobId: this.id, kind: 'create', modelId: this.modelId, message: this.message, requestId: this.requestId, assistant: this.assistant, assistantField: this.assistantField, temporary: this.temporary }
      : this.kind === 'assistant'
      ? { jobId: this.id, kind: 'assistant', ...this.spec }
      : this.kind === 'video'
      ? { jobId: this.id, kind: 'video', conversationId: this.conversationId, modelId: this.modelId, text: this.text, ...this.video }
      : { jobId: this.id, kind: 'chat', conversationId: this.conversationId, modelId: this.modelId, text: this.text, parts: this.parts, aspectRatio: this.aspectRatio, temporary: this.temporary, thinkingLevel: this.thinkingLevel, imageStyleId: this.imageStyleId, outputTone: this.outputTone, outputFormat: this.outputFormat });
  }
  delta(part) { if (!this.settled) { this.touch(); this.onDelta(part); } }
  done(value) { if (this.settled) return; this.cleanup(); this.onDone(value ?? 'stop'); }
  fail(message) { if (this.settled) return; this.cleanup(); this.onError(message); }
  abort() {
    if (this.settled) return;
    if (this.client) sendToClient(this.client, 'abort', { jobId: this.id });
    this.cleanup();
  }
  cleanup() { this.settled = true; clearTimeout(this.timer); jobs.delete(this.id); }
}

const fetchLoader = (url, timeoutMs = 20_000) =>
  new Promise((resolve, reject) => {
    const job = new Job({ kind: 'loader', url, timeoutMs, onDelta: () => {}, onDone: resolve, onError: (m) => reject(new Error(m)) });
    job.dispatch();
  });


/* ------------------------------------------------------------------ models */

let modelCache = { at: 0, models: [] };
let modelRefresh = null;
const MODEL_TTL_MS = 60_000;

const cachedModels = () =>
  modelCache.models.length
    ? modelCache.models
    : MODELS_FALLBACK.map((id) => ({ id, name: id, provider: null, free: false, ready: true, selectable: true, kind: kindOf(id), thinking: null }));

// The thinking level a model will actually accept, or undefined. Falls back to
// the common three when the model list has not been fetched yet, so a request
// made before the first refresh is not silently stripped.
function thinkingLevelFor(modelId, level) {
  const known = cachedModels().find((m) => m.id === modelId)?.thinking;
  const allowed = Array.isArray(known) && known.length ? known : ['low', 'medium', 'high'];
  return allowed.includes(level) ? level : undefined;
}

async function listModels({ force = false } = {}) {
  if (!force && modelCache.models.length && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.models;
  if (!extClients.size) return cachedModels();
  if (modelRefresh) return modelRefresh; // several callers can race; only one should hit the API
  modelRefresh = (async () => {
    try {
      const models = extractModels(decodeTurboStream(await fetchLoader(LOADERS.models)));
      if (models.length) {
        modelCache = { at: Date.now(), models };
        const free = models.filter((m) => m.free).map((m) => m.id);
        const byKind = [...new Set(models.map((m) => m.kind))]
          .map((k) => `${models.filter((m) => m.kind === k).length} ${k}`).join(', ');
        log(`${models.length} models (${byKind})${free.length ? ` · free credit: ${free.join(', ')}` : ''}`);
      }
    } catch (err) {
      log('model refresh failed:', err.message);
    } finally {
      modelRefresh = null;
    }
    return cachedModels();
  })();
  return modelRefresh;
}

/* --------------------------------------------------------------- credits */

// Everything but gemini-3.1-flash-lite draws on a credit pool, and until now the
// only place that number appeared was the web UI. Raw figures are integers
// scaled by creditsDecimals: 10000000000 at 6 decimals is a pool of 10,000.
let quotaCache = { at: 0, value: null };
let quotaRefresh = null;
const QUOTA_TTL_MS = 30_000;

function extractQuota(payload) {
  const credits = payload?.creditStatus?.credits;
  if (!credits) return null;
  const scale = 10 ** Number(payload.creditStatus.creditsDecimals ?? 0);
  const scaled = (v) => (v == null ? null : Number(v) / scale);
  const video = payload?.videoQuotaStatus?.count ?? null;
  return {
    limit: scaled(credits.limit),
    used: scaled(credits.used),
    available: scaled(credits.available),
    periodEndsAt: payload.creditStatus.periodEndsAt ?? null,
    video: video ? { limit: video.limit, used: video.used, remaining: video.remaining, period: video.period } : null,
    fetchedAt: payload.creditStatusFetchedAt ?? Date.now(),
  };
}

// Returns the last known figures rather than throwing when nothing is attached,
// so a caller can render "unknown" instead of an error.
async function getQuota({ force = false } = {}) {
  if (!force && quotaCache.value && Date.now() - quotaCache.at < QUOTA_TTL_MS) return quotaCache.value;
  if (!extClients.size) return quotaCache.value;
  if (quotaRefresh) return quotaRefresh; // several callers can race; only one should hit the API
  quotaRefresh = (async () => {
    try {
      const value = extractQuota(JSON.parse(await fetchLoader(LOADERS.quota)));
      if (value) {
        quotaCache = { at: Date.now(), value };
        log(`credits ${value.available.toFixed(0)} of ${value.limit.toFixed(0)} left`);
      }
    } catch (err) {
      log('credit refresh failed:', err.message);
    } finally {
      quotaRefresh = null;
    }
    return quotaCache.value;
  })();
  return quotaRefresh;
}

/* ----------------------------------------------------------- conversations */

// Conversations are created by the server; posting to an invented id is
// rejected. Reuse the most recent, and move on if one stops accepting messages.
let conversationCache = null;
// Whether the cached conversation was created with intent=create-temporary-chat.
// Every turn of a temporary chat has to repeat the flag, so it is tracked here.
let conversationIsTemporary = false;
let conversationList = [];
let conversationIndex = 0;

async function loadConversations() {
  if (!extClients.size) throw new Error('no extension connected — cannot look up a conversation');
  const decoded = decodeTurboStream(await fetchLoader(LOADERS.conversations));
  const list = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (typeof v.id === 'string' && typeof v.updatedAt === 'string') list.push(v);
    Object.values(v).forEach(walk);
  };
  walk(decoded);
  list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  conversationList = list;
  return list;
}

function findValue(node, key) {
  if (Array.isArray(node)) {
    for (const v of node) { const hit = findValue(v, key); if (hit != null) return hit; }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (typeof node[key] === 'string') return node[key];
  for (const v of Object.values(node)) { const hit = findValue(v, key); if (hit != null) return hit; }
  return null;
}

// The chat page creates a conversation by posting its first message to
// /chat.data; the server derives the id from clientCreateRequestId.
// `temporary: true` posts intent=create-temporary-chat instead. The server
// mints a conversation that never appears in the account's history and expires
// on its own — which is what an agent run wants: nothing to clean up, nothing
// to rotate past, and no earlier conversation to inherit.
async function createConversation({ modelId = defaultModel, message = 'Hello', assistant, temporary = false } = {}) {
  const requestId = randomUUID();
  const raw = await new Promise((resolve, reject) => {
    const job = new Job({
      kind: 'create', modelId, message, requestId, temporary,
      assistant: assistant ?? assistantId, assistantField: ASSISTANT_FIELD,
      timeoutMs: 30_000,
      onDelta: () => {}, onDone: resolve, onError: (m) => reject(new Error(m)),
    });
    job.dispatch();
  });
  const decoded = decodeTurboStream(raw);
  // create-conversation answers with conversationId; create-temporary-chat
  // answers with the conversation object, whose id lives under `id`.
  const id = findValue(decoded, 'conversationId') ?? findValue(decoded, 'id');
  if (!id) throw new Error(`could not read a conversation id from the response: ${raw.slice(0, 200)}`);
  conversationCache = id;
  conversationIsTemporary = Boolean(temporary);
  conversationIndex = 0;
  conversationList = [];
  log(`created ${temporary ? 'temporary ' : ''}conversation ${id}`);
  return id;
}

async function resolveConversation() {
  if (PINNED_CONVERSATION) return PINNED_CONVERSATION;
  if (conversationCache) return conversationCache;
  if (!conversationList.length) await loadConversations();
  const pick = conversationList[conversationIndex];
  if (!pick) {
    throw new Error('no usable conversation — open https://de.aipass.net/chat, start one, then POST /config {"conversation":null}');
  }
  conversationCache = pick.id;
  conversationIsTemporary = pick.isTemporary === true;
  log(`conversation ${conversationCache} (${pick.title ?? 'untitled'})`);
  return conversationCache;
}

/* --------------------------------------------------------------- chat flow */

// A 404 means the conversation was deleted; a 409 means the server still
// believes a generation is running there. Neither recovers on its own.
function startChat({ modelId, text, parts, aspectRatio: ratio, thinkingLevel, video, imageStyleId, outputTone, outputFormat, onDelta, onDone, onError }) {
  // A video model does not go through /actions/send-message at all — it is a
  // job submitted to /actions/video-generation and then polled. Same Job
  // machinery, different kind, so retries and aborts behave the same way.
  const isVideo = kindOf(modelId) === 'video';
  let attempts = 0;
  let delivered = 0;
  let current = null;

  const attempt = async () => {
    attempts++;
    let conversationId;
    try { conversationId = await resolveConversation(); }
    catch (err) { return onError(err.message); }

    current = new Job({
      kind: isVideo ? 'video' : 'chat',
      modelId, text, parts, conversationId, aspectRatio: ratio, thinkingLevel,
      imageStyleId, outputTone, outputFormat,
      temporary: conversationIsTemporary,
      // No aspect-ratio fallback here: videoOptionsFor already read the request
      // and dropped a ratio this provider is not served. Re-adding the raw value
      // would put back exactly what validation just removed.
      video: isVideo ? video : undefined,
      timeoutMs: ['video', 'music'].includes(kindOf(modelId)) ? MEDIA_TIMEOUT_MS : IDLE_TIMEOUT_MS,
      onDelta: (part) => { delivered++; onDelta(part); },
      onDone,
      onError: (message) => {
        const rejected = /conversation not found|returned 404|returned 409/i.test(message);
        if (rejected && attempts <= 3 && delivered === 0 && !PINNED_CONVERSATION) {
          log(`conversation ${conversationId} rejected, trying the next one`);
          conversationIndex++;
          conversationCache = null;
          attempt();
          return;
        }
        onError(message);
      },
    });
    current.dispatch();
  };

  attempt();
  return { abort: () => current?.abort() };
}

// True for loopback, link-local and RFC1918 addresses. The URL parser has
// already normalised integer, hex and octal spellings of an IPv4 address to
// dotted-quad by the time this sees the hostname, so those need no case of
// their own. A bare domain name is not classified here — that would need DNS
// resolution — so this blocks the literal-IP SSRF attempts, which is what a
// URL in a chat message looks like.
const privateV4 = (a, b) =>
  a === 0 || a === 127 || a === 10                     // this-host, loopback, private
  || (a === 169 && b === 254)                          // link-local incl. cloud metadata
  || (a === 192 && b === 168)
  || (a === 172 && b >= 16 && b <= 31);                // 172.16.0.0/12

function isPrivateHost(host) {
  let h = String(host).toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::' || h === '::1') return true;                 // unspecified / loopback
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;               // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;               // fc00::/7 unique-local
  // An IPv4-mapped address. The URL parser rewrites ::ffff:127.0.0.1 into the
  // hex form ::ffff:7f00:1, so both spellings have to be unwrapped to the IPv4
  // address they carry — which a plain dotted-quad match never sees.
  const mapped = h.startsWith('::ffff:') ? h.slice(7) : '';
  if (mapped.includes('.')) return isPrivateHost(mapped);
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped);
  if (hex) {
    const bits = (hex[1].padStart(4, '0') + hex[2].padStart(4, '0'));
    return privateV4(parseInt(bits.slice(0, 2), 16), parseInt(bits.slice(2, 4), 16));
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  return privateV4(Number(m[1]), Number(m[2]));
}

// What may be attached to a message. Images go to vision models; the document
// types are what the web UI's own file picker offers. Anything else is refused
// here rather than uploaded and rejected upstream, where the error is vaguer.
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const isAllowedAttachment = (type, kind) =>
  kind === 'image' ? type.startsWith('image/') : type.startsWith('image/') || DOCUMENT_TYPES.has(type);

// Fetch a remote attachment and convert it to a Base64 data URI, with the SSRF
// guard. `kind` narrows what content-type is acceptable: an image_url part will
// take nothing but an image, a file part will also take a document.
//
// Redirects are followed manually so every hop is re-checked: fetch's own
// follow would happily deliver a public URL that 302s to 169.254.169.254,
// which is the classic way past a first-URL-only guard.
async function fetchRemoteAsDataUri(urlStr, kind = 'image') {
  const REDIRECTS = new Set([301, 302, 303, 307, 308]);
  let current = new URL(urlStr);
  for (let hop = 0; ; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${current.protocol}`);
    }
    const host = current.hostname.toLowerCase();
    if (isPrivateHost(host)) {
      throw new Error(`refusing private/internal network fetch: ${host}`);
    }

    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (REDIRECTS.has(res.status)) {
      try { await res.body?.cancel(); } catch { /* already gone */ }
      const location = res.headers.get('location');
      if (!location) throw new Error('redirect carried no Location header');
      if (hop >= 4) throw new Error('too many redirects');
      current = new URL(location, current); // the next hop gets the same checks
      continue;
    }
    if (!res.ok) throw new Error(`remote fetch failed with status ${res.status}`);
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!isAllowedAttachment(contentType, kind)) {
      throw new Error(`unsupported content-type: ${contentType}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`attachment too large: ${arrayBuffer.byteLength} bytes`);
    }
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  }
}

// The mime type a data URI declares, or '' when it is not a data URI.
const dataUriType = (s) => (s.match(/^data:([^;,]+)/)?.[1] || '').toLowerCase();

// A filename the upstream file picker would have produced, so an attachment
// without one still arrives named rather than as `undefined`.
function defaultFilename(mediaType) {
  const ext = ({
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'text/csv': 'csv',
    'application/json': 'json',
  })[mediaType] || (mediaType.split('/')[1] || 'bin').replace(/^jpeg$/, 'jpg');
  return `attachment.${ext}`;
}

// Extract multimodal parts (text and images) from OpenAI formatted messages
async function extractUserParts(messages) {
  const lastUser = (messages ?? []).filter((m) => m.role === 'user').at(-1);
  if (!lastUser) return { text: '', parts: [] };

  if (typeof lastUser.content === 'string') {
    const text = lastUser.content.trim();
    return {
      text,
      parts: text ? [{ type: 'text', text }] : []
    };
  }

  if (Array.isArray(lastUser.content)) {
    const parts = [];
    const textPieces = [];

    for (const item of lastUser.content) {
      if (!item || typeof item !== 'object') continue;

      if (item.type === 'text' && typeof item.text === 'string') {
        const t = item.text.trim();
        if (t) {
          textPieces.push(t);
          parts.push({ type: 'text', text: t });
        }
      } else if (item.type === 'image_url' || item.type === 'image') {
        const rawUrl = item.image_url?.url || item.url || item.image || item.data || null;
        if (typeof rawUrl === 'string' && rawUrl.trim()) {
          const urlStr = rawUrl.trim();
          let dataUri = '';
          if (urlStr.startsWith('data:image/')) {
            dataUri = urlStr;
          } else if (/^https?:\/\//i.test(urlStr)) {
            try {
              dataUri = await fetchRemoteAsDataUri(urlStr, 'image');
            } catch (err) {
              log(`warning: failed to fetch remote image ${urlStr}: ${err.message}`);
            }
          }
          if (dataUri) {
            parts.push({
              type: 'image',
              image: dataUri
            });
          }
        }
      } else if (item.type === 'file') {
        // OpenAI's own shape is {type:'file', file:{filename, file_data}}; the
        // looser {url}/{data} spellings are accepted too. A remote URL goes
        // through the SSRF guard and arrives as a data URI, so the extension is
        // never asked to fetch it with the user's cookies.
        const raw = item.file?.file_data || item.file?.url || item.url || item.data || '';
        if (typeof raw === 'string' && raw.trim()) {
          const str = raw.trim();
          let dataUri = '';
          if (str.startsWith('data:')) {
            const declared = dataUriType(str);
            if (isAllowedAttachment(declared, 'file')) dataUri = str;
            else log(`warning: refusing attachment of type ${declared || 'unknown'}`);
          } else if (/^https?:\/\//i.test(str)) {
            try {
              dataUri = await fetchRemoteAsDataUri(str, 'file');
            } catch (err) {
              log(`warning: failed to fetch remote file ${str}: ${err.message}`);
            }
          }
          if (dataUri) {
            const mediaType = dataUriType(dataUri) || 'application/octet-stream';
            // An image sent as a file part is still an image to the model.
            if (mediaType.startsWith('image/')) {
              parts.push({ type: 'image', image: dataUri });
            } else {
              parts.push({
                type: 'file',
                mediaType,
                filename: item.file?.filename || item.filename || defaultFilename(mediaType),
                data: dataUri,
              });
            }
          }
        }
      }
    }

    // A message that is nothing but an attachment still needs text, or the
    // upstream composer treats it as empty. Name the file when there is one.
    const named = parts.find((p) => p.type === 'file')?.filename;
    const text = textPieces.join('\n').trim();
    return {
      text: text || (named ? `[${named}]` : parts.length ? '[Image]' : ''),
      parts: parts.length ? parts : (text ? [{ type: 'text', text }] : [])
    };
  }

  return { text: '', parts: [] };
}

/* ------------------------------------------------------------ http plumbing */

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    ...corsHeaders(),
  });
  res.end(body);
}

const oaiError = (res, status, message, type = 'invalid_request_error') =>
  json(res, status, { error: { message, type } });

/* ---------------------------------------------------------- chat completions */

// The video options a request may carry, filtered to what the model will take.
// The app gates only `resolution` by model and sends the rest whenever they are
// set, so this does the same rather than inventing stricter rules of its own.
// What a model will take beyond a prompt. Computed when the response is built,
// never cached onto the model — the video loaders land after the model list, so
// a surface baked in at fetch time reports the fallback for the rest of the run.
function optionSurface(id) {
  if (kindOf(id) !== 'video') return null;
  const provider = videoProviderOf(id);
  const served = valuesFor(videoOptions.resolutions, provider);
  return {
    provider: provider ?? null,
    aspectRatio: true,
    stylePreprompt: true,
    duration: /^seedance/i.test(id),
    cameraFixed: /^seedance/i.test(id),
    generateAudio: /^seedance/i.test(id),
    resolutions: served.length ? served : (VIDEO_RESOLUTIONS_FALLBACK[provider] ?? null),
    durations: valuesFor(videoOptions.durations, provider),
    aspectRatios: valuesFor(videoOptions.aspectRatios, provider),
    images: VIDEO_IMAGE_LIMITS[id] ?? null,
  };
}

function videoOptionsFor(modelId, payload) {
  if (kindOf(modelId) !== 'video') return undefined;
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  const provider = videoProviderOf(modelId);
  // The app attaches these four only for a seedance model; veo and sora take
  // the prompt, the aspect ratio and the style, and nothing else.
  const seedance = /^seedance/i.test(modelId);

  // What this provider is actually offered, straight from the loaders. Falling
  // back to the bundle's table only matters when no tab is attached to ask.
  const served = valuesFor(videoOptions.resolutions, provider);
  const allowed = served.length ? served : (VIDEO_RESOLUTIONS_FALLBACK[provider] ?? []);
  const durations = valuesFor(videoOptions.durations, provider);
  const ratios = valuesFor(videoOptions.aspectRatios, provider);

  const drop = (what, value, list) =>
    log(`warning: ${modelId} does not offer ${what} ${value}${list.length ? ` (${list.join(', ')})` : ''}`);

  const resolution = String(payload.resolution ?? '').trim();
  const okResolution = Boolean(resolution) && allowed.includes(resolution);
  if (resolution && !okResolution) drop('resolution', resolution, allowed);

  const duration = Number(payload.duration);
  // Durations are a served short list, not a free number. Sending one outside it
  // is accepted at submit and rejected later, once the quota is already spent.
  const okDuration = Number.isFinite(duration) && duration > 0
    && (!durations.length || durations.includes(duration));
  if (Number.isFinite(duration) && !okDuration) drop('duration', duration, durations);

  const ratio = String(payload.aspect_ratio ?? payload.aspectRatio ?? '').trim();
  const okRatio = Boolean(ratio) && (!ratios.length || ratios.includes(ratio));
  if (ratio && !okRatio) drop('aspect ratio', ratio, ratios);

  const style = payload.style_preprompt ?? payload.stylePreprompt;

  return {
    provider,
    ...(okRatio ? { aspectRatio: ratio } : {}),
    // A style is sent as its preprompt text, not as an id. A caller may name the
    // preset instead — "Documentary" — and it is resolved to that text here.
    ...(style ? { stylePreprompt: stylePreprompt(String(style)) } : {}),
    ...(seedance && okResolution ? { resolution } : {}),
    ...(seedance && okDuration ? { duration } : {}),
    ...(seedance && bool(payload.camera_fixed ?? payload.cameraFixed) !== undefined ? { cameraFixed: bool(payload.camera_fixed ?? payload.cameraFixed) } : {}),
    ...(seedance && bool(payload.generate_audio ?? payload.generateAudio) !== undefined ? { generateAudio: bool(payload.generate_audio ?? payload.generateAudio) } : {}),
  };
}

// Chat completions have no field for generated media, so it goes into the
// content as markdown — which every client already renders. An image gets an
// image tag; a video or a music clip gets a link, because an mp4 in an image
// tag is a broken image in every renderer there is.
const MEDIA_KINDS = new Set(['image', 'video', 'audio', 'file']);
function mediaMarkdown(kind, target, filename) {
  if (kind === 'image') return `\n![image](${target})\n`;
  // A video part carries its own filename; music does not. Failing that, the
  // signed storage URL's path holds the real extension before the query
  // (…/01a065ef.mp3?X-Goog-Signature=…), and a data URI declares it in the mime.
  if (filename) return `\n[${filename}](${target})\n`;
  const name = ['video', 'audio', 'file'].includes(kind) ? kind : 'file';
  const ext = (target.match(/^data:([^;,]+)/)?.[1]?.split('/')[1]
    ?? target.split('?')[0].match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? '').replace(/[^a-z0-9]/gi, '');
  return `\n[${ext ? `${name}.${ext}` : name}](${target})\n`;
}

async function chatCompletions(req, res) {
  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch { return oaiError(res, 400, 'invalid JSON body'); }

  const model = String(payload.model ?? defaultModel).replace(/^aipass\//, '');
  // Not an OpenAI field, so a client that knows about it can send either
  // spelling; otherwise the bridge default applies.
  const ratio = String(payload.aspect_ratio ?? payload.imageAspectRatio ?? aspectRatio).trim() || '1:1';
  // The levels are per model — most reasoning models take low | medium | high,
  // but Claude Opus also advertises `max` — so the model's own supportedLevels
  // decide. A level the model does not list is dropped rather than sent.
  const thinking = String(payload.thinking_level ?? payload.thinkingLevel ?? '').trim().toLowerCase();
  const thinkingLevel = thinking ? thinkingLevelFor(model, thinking) : undefined;
  const video = videoOptionsFor(model, payload);

  // An image style is sent by id; a tone and a format by their code. Each is
  // resolved from whatever the caller named — English, Thai, or the code — and
  // dropped with a warning when it matches no preset, rather than being passed
  // through as a string the server will not recognise.
  const preset = (rows, wanted, field, what) => {
    if (!wanted) return undefined;
    const hit = matchPreset(rows, wanted);
    if (!hit) { log(`warning: no ${what} called ${wanted}`); return undefined; }
    return hit[field];
  };
  const imageStyleId = kindOf(model) === 'image'
    ? preset(styleOptions.imageStyles, payload.image_style ?? payload.imageStyle, 'id', 'image style')
    : undefined;
  const outputTone = preset(styleOptions.tones, payload.output_tone ?? payload.outputTone, 'code', 'tone');
  const outputFormat = preset(styleOptions.formats, payload.output_format ?? payload.outputFormat, 'code', 'format');
  if (thinking && !thinkingLevel) log(`warning: ${model} does not offer thinking level ${thinking}`);
  const { text, parts } = await extractUserParts(payload.messages);
  if (!text && (!parts || parts.length === 0)) return oaiError(res, 400, 'no user message');

  const id = `chatcmpl-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);
  const imageCount = (parts ?? []).filter(p => p.type === 'image').length;
  log(`chat -> ${model} (${Buffer.byteLength(text)} bytes text${imageCount ? `, ${imageCount} image(s)` : ''})`);

  if (payload.stream) {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...corsHeaders(),
    });
    // A video job can sit on one progress figure for minutes, and a stream that
    // sends nothing for five hits the default body timeout in Node's fetch —
    // undici's UND_ERR_BODY_TIMEOUT — killing a generation that was going to
    // succeed, with the quota already spent. An SSE comment is ignored by every
    // conforming parser and keeps the connection producing bytes.
    const keepalive = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { /* closed */ } }, KEEPALIVE_MS);
    keepalive.unref?.();
    const stopKeepalive = () => clearInterval(keepalive);
    res.on('close', stopKeepalive);

    const emit = (delta, finish = null) => {
      res.write(`data: ${JSON.stringify({
        id, object: 'chat.completion.chunk', created, model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      })}\n\n`);
    };
    emit({ role: 'assistant', content: '' });

    const job = startChat({
      modelId: model, text, parts, aspectRatio: ratio, thinkingLevel, video,
      imageStyleId, outputTone, outputFormat,
      onDelta: (part) => {
        if (part.kind === 'status') {
          if (TOOL_VISIBILITY === 'off') return;
          if (TOOL_VISIBILITY === 'text') emit({ content: `\n${part.text}\n` });
          else emit({ reasoning_content: `${part.text}\n` });
          return;
        }
        if (MEDIA_KINDS.has(part.kind)) return void emit({ content: mediaMarkdown(part.kind, part.text, part.filename) });
        if (part.kind === 'reasoning') emit({ reasoning_content: part.text });
        else emit({ content: part.text });
      },
      onDone: (finishReason) => {
        stopKeepalive();
        emit({}, finishReason === 'length' ? 'length' : 'stop');
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (message) => {
        stopKeepalive();
        res.write(`data: ${JSON.stringify({ error: { message, type: 'upstream_error' } })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
    });
    res.on('close', () => job.abort());
    return;
  }

  let out = '';
  let reasoning = '';
  await new Promise((resolve) => {
    const job = startChat({
      modelId: model, text, parts, aspectRatio: ratio, thinkingLevel, video,
      imageStyleId, outputTone, outputFormat,
      onDelta: (p) => {
        if (p.kind === 'status') { if (TOOL_VISIBILITY !== 'off') reasoning += `${p.text}\n`; return; }
        if (MEDIA_KINDS.has(p.kind)) { out += mediaMarkdown(p.kind, p.text, p.filename); return; }
        if (p.kind === 'reasoning') reasoning += p.text;
        else out += p.text;
      },
      onDone: (finishReason) => {
        json(res, 200, {
          id, object: 'chat.completion', created, model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: out, ...(reasoning ? { reasoning_content: reasoning } : {}) },
            finish_reason: finishReason === 'length' ? 'length' : 'stop',
          }],
          // Estimates: the upstream stream reports no token counts, but some
          // clients refuse a response without a usage block.
          usage: {
            prompt_tokens: Math.ceil(text.length / 4),
            completion_tokens: Math.ceil(out.length / 4),
            total_tokens: Math.ceil((text.length + out.length) / 4),
          },
        });
        resolve();
      },
      onError: (message) => { oaiError(res, 502, message, 'upstream_error'); resolve(); },
    });
    res.on('close', () => { job.abort(); resolve(); });
  });
}

/* -------------------------------------------------------- extension channel */

function extEvents(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    ...corsHeaders(),
  });
  const client = { id: randomUUID(), res };
  extClients.add(client);
  log(`extension connected (${extClients.size} total)`);
  sendToClient(client, 'ready', { clientId: client.id });
  // Warm the caches a moment after the tab attaches — but only if this client
  // is still the reason to: a tab that closed in the meantime would otherwise
  // send a loader job to whoever connected next.
  const warm = (fn, ms) => setTimeout(() => { if (extClients.has(client)) fn().catch(() => {}); }, ms);
  warm(() => listModels({ force: true }), 500);
  warm(() => getQuota({ force: true }), 900);
  warm(() => refreshVideoOptions(), 1300);
  warm(() => refreshStyleOptions(), 1700);

  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    extClients.delete(client);
    log(`extension disconnected (${extClients.size} left)`);
    // Do NOT fail in-flight jobs. The upstream fetch lives in the page and
    // survives the worker being evicted, which is exactly what happens during
    // a long web_search when no deltas flow to reset the worker's idle timer.
    for (const job of jobs.values()) if (job.client === client) job.client = null;
  });
}

async function extPost(req, res, kind) {
  let body;
  try { body = JSON.parse(await readBody(req, MAX_EXT_BODY)); }
  catch { return json(res, 400, { ok: false }); }
  const job = jobs.get(body.jobId);
  if (!job) return json(res, 200, { ok: false, reason: 'unknown job' });
  if (kind === 'chunk') for (const part of body.parts ?? []) job.delta(part);
  else if (kind === 'done') job.done(body.finishReason);
  else if (kind === 'loader') {
    if (typeof body.raw === 'string') job.done(body.raw);
    else job.fail(body.message ?? 'loader fetch failed');
  } else if (kind === 'assistant') {
    // One channel for three shapes: a created id, a bound conversation, or a
    // deletion. The caller knows which it asked for.
    if (body.conversationId) job.done(body.conversationId);
    else if (body.deleted) job.done('deleted');
    else if (body.assistantId) job.done(body.assistantId);
    else job.fail(body.message ?? 'assistant action failed');
  } else job.fail(body.message ?? 'extension reported an error');
  return json(res, 200, { ok: true });
}

/* --------------------------------------------------------------- the server */

const server = http.createServer(async (req, res) => {
  // The Host check comes first and reads the raw header, because the URL
  // construction below it throws on a malformed one — an async handler that
  // throws before the try block is an unhandled rejection, and Node exits.
  if (!hostAllowed(req)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('forbidden: unexpected Host header\n');
  }

  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return oaiError(res, 400, 'malformed request URL');
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    // Without an explicit AIPASS_CORS_ORIGIN this preflight carries no
    // allow-origin, so a browser page cannot call the bridge cross-origin.
    res.writeHead(204, {
      ...corsHeaders(),
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400',
    });
    return res.end();
  }

  try {
    if (path === '/v1/chat/completions' && req.method === 'POST') return await chatCompletions(req, res);

    if (path === '/quota' || path === '/credits') {
      const quota = await getQuota({ force: url.searchParams.get('refresh') === '1' });
      if (!quota) return oaiError(res, 503, 'no credit figures yet — open a de.aipass.net tab', 'unavailable');
      return json(res, 200, quota);
    }

    if (path === '/v1/models') {
      const all = await listModels({ force: url.searchParams.get('refresh') === '1' });
      // ?kind=image (or a comma-separated set) narrows the list the way the web
      // UI's tabs do.
      const want = (url.searchParams.get('kind') ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      const models = want.length ? all.filter((m) => want.includes(m.kind)) : all;
      return json(res, 200, {
        object: 'list',
        data: models.map((m) => ({
          id: m.id, object: 'model', created: 0, owned_by: m.provider ?? 'aipass',
          name: m.name, free_credit: m.free, thinking: m.thinking,
          kind: m.kind, description: m.description, is_default: m.isDefault,
          ...(optionSurface(m.id) ? { options: optionSurface(m.id) } : {}),
        })),
      });
    }

    if (path === '/conversations/new' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const id = await createConversation({
        modelId: body.model, message: body.message, assistant: body.assistant,
        temporary: body.temporary === true,
      });
      return json(res, 200, { id, temporary: conversationIsTemporary });
    }
    if (path === '/conversations') {
      await loadConversations().catch(() => {});
      return json(res, 200, {
        current: PINNED_CONVERSATION || conversationCache,
        conversations: conversationList.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
      });
    }

    // The custom assistant that carries the agent's tool protocol. Listing is a
    // plain loader read; creating goes through the extension, which owns the
    // path and the intents it will post.
    if (path === '/assistants' && req.method === 'GET') {
      try {
        const decoded = decodeTurboStream(await fetchLoader(LOADERS.assistants));
        const found = [];
        const walk = (v) => {
          if (!v || typeof v !== 'object') return;
          if (Array.isArray(v)) return void v.forEach(walk);
          if (typeof v.id === 'string' && typeof (v.name ?? v.assistantName) === 'string') {
            found.push({ id: v.id, name: v.name ?? v.assistantName, model: v.model ?? v.modelId ?? null });
          }
          Object.values(v).forEach(walk);
        };
        walk(decoded);
        const seen = new Set();
        return json(res, 200, { assistants: found.filter((a) => !seen.has(a.id) && seen.add(a.id)) });
      } catch (err) {
        return oaiError(res, 502, `could not list assistants: ${err.message}`);
      }
    }

    if (path === '/assistants' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const spec = {
        name: String(body.name ?? '').trim(),
        detail: String(body.detail ?? '').trim(),
        character: String(body.character ?? ''),
        type: String(body.type ?? '').trim(),
        model: String(body.model ?? '').trim(),
        tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
      };
      // The form enforces these before it will submit, so failing here saves a
      // round trip and a half-made draft on the account.
      const tooLong = spec.name.length > 100 ? 'name over 100 characters'
        : spec.detail.length > 200 ? 'detail over 200 characters'
        : spec.character.length > 1000 ? 'character over 1000 characters'
        : '';
      const missing = ['name', 'detail', 'character', 'type', 'model'].find((k) => !spec[k]);
      if (missing) return oaiError(res, 400, `${missing} is required`);
      if (!spec.tags.length) return oaiError(res, 400, 'at least one tag is required');
      if (tooLong) return oaiError(res, 400, tooLong);

      try {
        const id = await new Promise((resolve, reject) => {
          const job = new Job({
            kind: 'assistant', spec, timeoutMs: 60_000,
            onDelta: () => {}, onDone: resolve, onError: (m) => reject(new Error(m)),
          });
          job.dispatch();
        });
        log(`created assistant ${id} (${spec.name})`);
        return json(res, 200, { id, name: spec.name });
      } catch (err) {
        return oaiError(res, 502, err.message);
      }
    }

    // Start a conversation already bound to an assistant, so nobody has to open
    // the web UI and copy an id out of the address bar.
    if (path.startsWith('/assistants/') && path.endsWith('/chat') && req.method === 'POST') {
      const assistantId = decodeURIComponent(path.slice('/assistants/'.length, -'/chat'.length));
      if (!assistantId) return oaiError(res, 400, 'assistant id is required');
      try {
        const conversationId = await new Promise((resolve, reject) => {
          const job = new Job({
            kind: 'assistant', spec: { op: 'start-chat', assistantId }, timeoutMs: 60_000,
            onDelta: () => {}, onDone: resolve, onError: (m) => reject(new Error(m)),
          });
          job.dispatch();
        });
        // Adopt it, the way /conversations/new does — the point of binding is
        // that the next message goes to it.
        conversationCache = conversationId;
        conversationIsTemporary = false;
        conversationIndex = 0;
        log(`assistant ${assistantId} -> conversation ${conversationId}`);
        return json(res, 200, { assistantId, conversation: conversationId });
      } catch (err) {
        return oaiError(res, 502, err.message);
      }
    }

    if (path.startsWith('/assistants/') && req.method === 'DELETE') {
      const assistantId = decodeURIComponent(path.slice('/assistants/'.length));
      if (!assistantId) return oaiError(res, 400, 'assistant id is required');
      try {
        await new Promise((resolve, reject) => {
          const job = new Job({
            kind: 'assistant', spec: { op: 'delete', assistantId }, timeoutMs: 60_000,
            onDelta: () => {}, onDone: resolve, onError: (m) => reject(new Error(m)),
          });
          job.dispatch();
        });
        log(`deleted assistant ${assistantId}`);
        return json(res, 200, { deleted: assistantId });
      } catch (err) {
        return oaiError(res, 502, err.message);
      }
    }

    if (path === '/style-options' && req.method === 'GET') {
      if (url.searchParams.get('refresh') === '1' || !styleOptions.at) await refreshStyleOptions();
      return json(res, 200, {
        imageStyles: styleOptions.imageStyles.map((v) => ({ id: v.id, name: v.name_en, nameTh: v.name_th })),
        tones: styleOptions.tones.map((v) => ({ code: v.code, name: v.nameEn, nameTh: v.nameTh })),
        formats: styleOptions.formats.map((v) => ({ code: v.code, name: v.nameEn, nameTh: v.nameTh })),
      });
    }

    if (path === '/video-options' && req.method === 'GET') {
      if (url.searchParams.get('refresh') === '1' || !videoOptions.at) await refreshVideoOptions();
      return json(res, 200, {
        styles: videoOptions.styles.map((v) => ({
          name: v.name_en, nameTh: v.name_th, preprompt: v.preprompt,
        })),
        byProvider: Object.fromEntries(VIDEO_PROVIDERS.map(([provider]) => [provider, {
          resolutions: valuesFor(videoOptions.resolutions, provider),
          durations: valuesFor(videoOptions.durations, provider),
          aspectRatios: valuesFor(videoOptions.aspectRatios, provider),
        }])),
      });
    }

    if (path === '/config' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      if (typeof body.defaultModel === 'string' && body.defaultModel.trim()) {
        defaultModel = body.defaultModel.trim();
        log(`default model ${defaultModel}`);
      }
      if (typeof body.assistant === 'string') { assistantId = body.assistant.trim(); log(assistantId ? `assistant ${assistantId}` : 'assistant cleared'); }
      if (typeof body.aspectRatio === 'string' && body.aspectRatio.trim()) {
        aspectRatio = body.aspectRatio.trim();
        log(`aspect ratio ${aspectRatio}`);
      }
      if (body.conversation === null || typeof body.conversation === 'string') {
        // Pinning an id says nothing about how it was created, so it is treated
        // as an ordinary conversation unless the caller declares otherwise.
        conversationCache = body.conversation || null;
        conversationIsTemporary = body.temporary === true;
        conversationIndex = 0;
        if (!conversationCache) conversationList = [];
        log(conversationCache ? `conversation ${conversationCache}` : 'conversation cleared');
      }
      return json(res, 200, { ok: true, defaultModel, assistant: assistantId || null, aspectRatio, conversation: PINNED_CONVERSATION || conversationCache, temporary: conversationIsTemporary });
    }

    // Container-management routes. Only the Docker deployment needs these, and
    // they can restart processes, so they stay off unless AIPASS_ADMIN=1.
    if (ADMIN) {
      if (path === '/restart' && req.method === 'POST') {
        json(res, 200, { ok: true, message: 'restarting bridge server' });
        setTimeout(() => process.exit(0), 50);
        return;
      }

      if (path === '/logs') {
        const fs = await import('node:fs');
        const target = url.searchParams.get('file') || 'bridge';
        // Whitelist the name: this is interpolated into a path, so anything
        // with a separator or dot would escape /var/log.
        if (!/^[a-z0-9_-]+$/i.test(target)) {
          return json(res, 400, { ok: false, error: 'invalid log name' });
        }
        const logFile = `/var/log/${target}.log`;
        try {
          const content = fs.readFileSync(logFile, 'utf8');
          return json(res, 200, { ok: true, file: logFile, lines: content.slice(-4000) });
        } catch (err) {
          return json(res, 500, { ok: false, error: err.message });
        }
      }

      if (path === '/browser/restart' && req.method === 'POST') {
        import('node:child_process').then(({ exec }) => {
          exec('pkill -f chromium || pkill -f chrome || true');
        });
        return json(res, 200, { ok: true, message: 'restarting browser' });
      }

      if (path === '/ext/reload' && req.method === 'POST') {
        for (const client of extClients) sendToClient(client, 'reload_extension', {});
        return json(res, 200, { ok: true, message: 'reloading extension' });
      }

      if (path === '/tab/reload' && req.method === 'POST') {
        for (const client of extClients) sendToClient(client, 'reload_tab', {});
        return json(res, 200, { ok: true, message: 'reloading tab' });
      }
    }

    if (path === '/ext/events' && req.method === 'GET') return extEvents(req, res);
    if (path === '/ext/chunk' && req.method === 'POST') return await extPost(req, res, 'chunk');
    if (path === '/ext/done' && req.method === 'POST') return await extPost(req, res, 'done');
    if (path === '/ext/error' && req.method === 'POST') return await extPost(req, res, 'error');
    if (path === '/ext/loader' && req.method === 'POST') return await extPost(req, res, 'loader');
    if (path === '/ext/assistant' && req.method === 'POST') return await extPost(req, res, 'assistant');

    if (path === '/status' || path === '/health') {
      return json(res, 200, {
        ok: true,
        extensions: extClients.size,
        activeJobs: jobs.size,
        defaultModel,
        conversation: PINNED_CONVERSATION || conversationCache,
        temporary: conversationIsTemporary,
        assistant: assistantId || null,
        aspectRatio,
        models: cachedModels(),
        credits: quotaCache.value,
      });
    }

    return oaiError(res, 404, `no route for ${req.method} ${path}`, 'not_found');
  } catch (err) {
    log('unhandled', err);
    if (!res.headersSent) oaiError(res, 500, String(err?.message ?? err), 'server_error');
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  log(`aipass bridge on http://${HOST}:${PORT}`);
  log(`  default model : ${defaultModel}`);
  log(`  conversation  : ${PINNED_CONVERSATION || 'most recent on the account'}`);
  log('  waiting for the Chrome extension…');
});

// For tests: the SSRF guard's redirect behaviour cannot be driven through the
// HTTP surface without a public host, so it is exercised directly, and the
// imported server handle lets the test file release the port when it is done.
export { isPrivateHost, fetchRemoteAsDataUri, server };
