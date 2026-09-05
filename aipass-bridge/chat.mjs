#!/usr/bin/env node
// Talk to aipass from the terminal. Streams the reply, shows server-side tool
// activity (web_search) as it happens, and lists sources at the end.
//
//   npm run chat                 interactive
//   npm run chat -- "question"   one-shot
import readline from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { stdin, stdout } from 'node:process';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`usage: npm run chat [-- "question"] [options]

  --model ID          model to use          (default: whatever the bridge is set to)
  --conversation ID   continue a specific conversation
  --new               start a fresh conversation instead of the most recent
  --temporary         start a throwaway one, kept out of the chat history
  --bridge URL        bridge base URL       (default: http://127.0.0.1:8787)
  --file PATH         attach a document or image; repeat for several
  --thinking LEVEL    how hard a reasoning model thinks (low, medium, high —
                      and max on Claude Opus)
  --ratio R           aspect ratio          (images: 1:1, 3:4, 4:3;
                      video: 16:9, 9:16, 1:1, 4:3, 3:4, and 21:9 on seedance)
  --resolution R      video resolution      (480p, 720p — seedance only)
  --duration N        video length in seconds
  --camera-fixed      lock the camera for the shot
  --no-audio          do not generate a soundtrack with the video
  --style NAME        a video style — name a preset ("Documentary") or pass raw
                      preprompt text; npm run styles lists them
  --out DIR           where to save generated images, video and music
                                            (default: the cwd)
  --paste-idle MS     how long to wait before treating pasted lines as one
                      message                          (default: 60)

With a question, it answers and exits. Without one it stays interactive, where
/models lists what is available, /model <id> switches, and Ctrl+C quits.`);
  process.exit(0);
}

const BRIDGE = (flag('bridge', 'http://127.0.0.1:8787')).replace(/\/+$/, '');
const CONVERSATION = flag('conversation', null);
const NEW = argv.includes('--new');
const TEMPORARY = argv.includes('--temporary');
let model = flag('model', null);
const OUT_DIR = path.resolve(flag('out', process.cwd()));
const RATIO = flag('ratio', null);
const THINKING = flag('thinking', null);
const RESOLUTION = flag('resolution', null);
const DURATION = flag('duration', null);
const STYLE = flag('style', null);
const CAMERA_FIXED = argv.includes('--camera-fixed');
const NO_AUDIO = argv.includes('--no-audio');
// Repeatable, unlike the other flags: several files can be attached at once.
const FILES = argv.reduce((acc, a, i) => (a === '--file' && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);
const question = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')).join(' ').trim();

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// Enough of a mime table to name what the file picker in the web UI accepts.
// Anything unlisted is sent as octet-stream, which the bridge refuses — better
// than uploading it and getting a vaguer refusal from upstream.
const MIME = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

// Read each --file into an OpenAI `file` content part. Done once at startup so
// an unreadable path fails before the first question, not after it.
const attachments = FILES.map((p) => {
  const abs = path.resolve(p);
  let buf;
  try { buf = fs.readFileSync(abs); }
  catch (err) { console.error(red(`cannot read ${p}: ${err.message}`)); process.exit(1); }
  const filename = path.basename(abs);
  const mediaType = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  return {
    type: 'file',
    file: { filename, file_data: `data:${mediaType};base64,${buf.toString('base64')}` },
  };
});
const status = await fetch(`${BRIDGE}/status`).then((r) => r.json()).catch(() => null);
if (!status) {
  console.error(red(`No bridge at ${BRIDGE}. Start it with: npm run dev`));
  process.exit(1);
}
if (!status.extensions) {
  console.error(red('The extension is not connected. Open a https://de.aipass.net/chat tab.'));
  process.exit(1);
}
model ??= status.defaultModel;

if (CONVERSATION) {
  await fetch(`${BRIDGE}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation: CONVERSATION }),
  }).catch(() => {});
} else if (NEW || TEMPORARY) {
  const made = await fetch(`${BRIDGE}/conversations/new`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, temporary: TEMPORARY, message: 'New chat.' }),
  }).then((r) => r.json()).catch(() => null);
  if (made?.id) status.conversation = made.id;
}

// An image model answers with a data URI, which is megabytes of base64 — write
// it out and print where it went, rather than filling the scrollback with it.
let saved = 0;
// Extensions for the media types the generators actually return, so a saved
// file opens by double-clicking it instead of needing to be renamed.
const EXT = {
  jpeg: 'jpg', 'svg+xml': 'svg', mpeg: 'mp3', 'x-wav': 'wav', wave: 'wav',
  quicktime: 'mov', 'x-matroska': 'mkv',
};
const extFor = (mime) => {
  const sub = (mime.split('/')[1] || 'bin').toLowerCase();
  return EXT[sub] ?? sub.replace(/[^a-z0-9]/g, '');
};

const writeMedia = (buf, mime, label) => {
  const file = path.join(OUT_DIR, `aipass-${Date.now()}-${++saved}.${extFor(mime)}`);
  fs.writeFileSync(file, buf);
  return `\n${cyan(`[${label} saved to ${file}]`)}\n`;
};

// Generated media arrives as markdown: an image tag for pictures, a link for a
// video or a music clip. Either way the payload is a data: URI to decode, or a
// URL to go and fetch — a link nobody downloads is not much of a result.
// The extensions a generator can hand back. A link is only chased when it looks
// like one of these: a citation in the prose is a link too, and fetching those
// would be both wrong and slow.
const MEDIA_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'png', 'jpg', 'jpeg', 'gif', 'webp']);

function keepMedia(chunk) {
  return chunk.replace(/(!?)\[([^\]]*)\]\((data:([^;,)]+)[^)]*|https?:\/\/[^)\s]+)\)/g, (whole, bang, label, target, mime) => {
    // The label is a filename when the part carried one (video does, music does
    // not), otherwise a bare kind. Either way what matters is the extension.
    const labelExt = label.split('.').pop()?.toLowerCase() ?? '';
    const urlExt = target.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    const kind = bang ? 'image' : label.includes('.') ? label : (label || 'file');
    try {
      if (target.startsWith('data:')) {
        const comma = target.indexOf(',');
        if (comma === -1) return whole;
        return writeMedia(Buffer.from(target.slice(comma + 1), 'base64'), mime, kind);
      }
      if (!bang && !['video', 'audio', 'image', 'file'].includes(label)
        && !MEDIA_EXT.has(labelExt) && !MEDIA_EXT.has(urlExt)) return whole;
      pending.push({ url: target, kind });
      return `\n${cyan(`[${kind} at ${target.split('?')[0]} — downloading]`)}\n`;
    } catch (err) {
      return `\n[${kind} could not be saved: ${err.message}]\n`;
    }
  });
}

// Remote media is fetched after the stream closes, so a slow download does not
// stall the answer still being printed.
const pending = [];
async function drainPending() {
  for (const { url, kind } of pending.splice(0)) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const mime = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
      const buf = Buffer.from(await res.arrayBuffer());
      stdout.write(writeMedia(buf, mime, kind));
    } catch (err) {
      // Generated media is a signed storage URL that anything can fetch, but
      // only for a few hours. An old link in a resumed conversation is the
      // likely cause, so say that rather than failing silently.
      stdout.write(`\n[${kind} could not be downloaded from ${url.split('?')[0]}: ${err.message}]\n` +
        `[the signed link may have expired — regenerate it]\n`);
    }
  }
}

if (attachments.length) {
  const total = FILES.reduce((n, p) => n + fs.statSync(path.resolve(p)).size, 0);
  const size = total < 1024 ? `${total} B` : `${(total / 1024).toFixed(1)} KB`;
  console.log(dim(`files ${attachments.map((a) => a.file.filename).join(', ')}  (${size})`));
}

async function ask(text) {
  // Attachments ride on the first message only — they stay in the conversation
  // afterwards, and re-uploading them each turn would just spend credits.
  const content = attachments.length
    ? [{ type: 'text', text }, ...attachments.splice(0)]
    : text;
  const res = await fetch(`${BRIDGE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, messages: [{ role: 'user', content }],
      ...(RATIO ? { aspect_ratio: RATIO } : {}),
      ...(THINKING ? { thinking_level: THINKING } : {}),
      ...(RESOLUTION ? { resolution: RESOLUTION } : {}),
      ...(DURATION ? { duration: Number(DURATION) } : {}),
      ...(STYLE ? { style_preprompt: STYLE } : {}),
      ...(CAMERA_FIXED ? { camera_fixed: true } : {}),
      ...(NO_AUDIO ? { generate_audio: false } : {}),
    }),
  });
  if (!res.ok) {
    console.error(red(`\nbridge returned ${res.status}: ${(await res.text()).slice(0, 300)}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let wrote = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
      const data = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (!data || data === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.error) { console.error(red(`\n${evt.error.message}`)); return; }
      const delta = evt.choices?.[0]?.delta ?? {};
      // Tool progress and sources, kept visually distinct from the answer.
      if (delta.reasoning_content) stdout.write(cyan(delta.reasoning_content));
      if (delta.content) { stdout.write(keepMedia(delta.content)); wrote = true; }
    }
  }
  stdout.write(wrote ? '\n' : dim('\n(no reply)\n'));
  await drainPending();
}

if (question) {
  await ask(question);
  // process.exit() drops a stdout write libuv has not finished, which on
  // Windows aborts with 0xC0000409 rather than exiting 0. Flush first. The
  // explicit exit stays: Node's fetch holds a pooled socket open and would
  // otherwise keep the process alive for seconds after the answer is printed.
  await new Promise((resolve) => stdout.write('', resolve));
  process.exit(0);
}

console.log(bold('aipass') + dim(`  model ${model}  ·  conversation ${status.conversation ?? 'resolves on first message'}`));
console.log(dim('/model <id> to switch  ·  /models to list  ·  paste sends as one  ·  Ctrl+C to quit\n'));

// Readline reports one line per newline, so pasting a block used to send it as
// one message per line — a thirteen-line menu became thirteen requests, each
// billed, and the model saw only the first line as the question. A paste
// arrives as a burst of line events within a few milliseconds; nobody types a
// whole line that fast, so a short idle separates a paste from a keystroke.
const PASTE_IDLE_MS = Number(flag('paste-idle', 60));

const rl = readline.createInterface({ input: stdin, output: stdout });
rl.setPrompt(bold('> '));
rl.prompt();

let buffered = [];
let idleTimer = null;
let chain = Promise.resolve();

async function handleBlock(lines) {
  const block = lines.join('\n').trim();
  if (!block) return;

  if (lines.length === 1 && block === '/models') {
    const { data } = await fetch(`${BRIDGE}/v1/models`).then((r) => r.json());
    for (const m of data) console.log(`  ${m.id.padEnd(38)} ${m.name}${m.free_credit ? dim('  [free]') : ''}`);
    return;
  }
  if (lines.length === 1 && block.startsWith('/model ')) {
    model = block.slice(7).trim();
    await fetch(`${BRIDGE}/config`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultModel: model }),
    }).catch(() => {});
    console.log(dim(`  model ${model}`));
    return;
  }

  // Say so, because one message out of many lines is the surprising direction.
  if (lines.length > 1) console.log(dim(`  (${lines.length} lines · sent as one message)`));
  await ask(block);
  console.log();
}

let closed = false;

function submit() {
  const lines = buffered;
  buffered = [];
  chain = chain.then(() => handleBlock(lines)).then(() => { if (!closed) rl.prompt(); });
}

rl.on('line', (raw) => {
  buffered.push(raw);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(submit, PASTE_IDLE_MS);
});

rl.on('SIGINT', () => rl.close());
await new Promise((resolve) => rl.on('close', resolve));
closed = true;
// EOF arrives before the idle timer when input is piped, and end-of-input is a
// submit, not a discard — otherwise a piped block is silently dropped.
clearTimeout(idleTimer);
if (buffered.length) submit();
await chain;
