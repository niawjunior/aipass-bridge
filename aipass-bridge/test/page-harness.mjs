// Runs extension/page.js in this process, so the content script can be tested
// like anything else. Nothing has reached it until now: the bridge harness
// replaces the extension wholesale, which leaves the frame decoder, the media
// routing and the reattach logic covered by nothing at all.
//
// It needs less than it looks — no document, no chrome, no DOM. Only window,
// location and fetch, and Node already has every other API it touches.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, '..', 'extension', 'page.js');

// page.js reads bytes back through FileReader when it inlines same-origin media.
class FileReaderShim {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`;
      this.onload?.();
    }).catch((err) => { this.error = err; this.onerror?.(); });
  }
}

// A Response whose body is an SSE stream, one chunk per frame.
export const sseResponse = (frames, { status = 200 } = {}) => new Response(
  new ReadableStream({
    start(controller) {
      for (const f of frames) {
        controller.enqueue(new TextEncoder().encode(typeof f === 'string' ? f : `data: ${JSON.stringify(f)}\n\n`));
      }
      controller.close();
    },
  }),
  { status, headers: { 'content-type': 'text/event-stream' } },
);

// A stream that emits some frames and then fails, the way a dropped socket does.
// Frames go out on successive pulls rather than all in start(): erroring a
// stream discards whatever is still queued, so enqueueing and then erroring in
// one go delivers nothing at all — which quietly makes any test of "failed after
// N frames" actually test "failed after none".
export const brokenStream = (frames) => {
  let i = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (i < frames.length) {
          const f = frames[i++];
          controller.enqueue(new TextEncoder().encode(typeof f === 'string' ? f : `data: ${JSON.stringify(f)}\n\n`));
        } else {
          controller.error(new Error('network error'));
        }
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
};

export function loadPage({ onFetch, origin = 'https://de.aipass.net' } = {}) {
  const listeners = [];
  const sent = [];        // everything page.js posted back
  const requests = [];    // every fetch it made

  const location = { origin, href: `${origin}/chat` };
  const window = {
    location,
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    postMessage: (data) => { sent.push(data); },
  };
  window.window = window;

  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    requests.push({ url, init });
    const answer = await onFetch(url, init, requests.length);
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const src = fs.readFileSync(PAGE, 'utf8');
  // eslint-disable-next-line no-new-func
  const run = new Function(
    'window', 'location', 'fetch', 'FileReader', 'crypto', 'TextDecoder',
    'AbortController', 'FormData', 'Blob', 'setTimeout', 'setInterval', 'clearInterval', 'URL',
    src,
  );
  run(window, location, fetchImpl, FileReaderShim, globalThis.crypto, TextDecoder,
    AbortController, FormData, Blob, setTimeout, setInterval, clearInterval, URL);

  const deliver = (msg) => { for (const fn of listeners) fn({ source: window, data: msg }); };

  return {
    sent,
    requests,
    // Hand page.js a job the way the content script does.
    run: (job) => deliver({ __aipass_bridge: 'req', job }),
    abort: (jobId) => deliver({ __aipass_bridge: 'abort', jobId }),
    // Everything it posted back for one job, in order.
    replies: (jobId) => sent.filter((m) => m.jobId === jobId),
    // Flattened parts across every chunk reply for a job.
    parts: (jobId) => sent.filter((m) => m.jobId === jobId && m.kind === 'chunk').flatMap((m) => m.parts),
    // Resolves once the job has reported done or error.
    settled: (jobId, timeout = 4000) => new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = setInterval(() => {
        const end = sent.find((m) => m.jobId === jobId && (m.kind === 'done' || m.kind === 'error' || m.kind === 'assistant'));
        if (end) { clearInterval(tick); resolve(end); }
        else if (Date.now() - started > timeout) { clearInterval(tick); reject(new Error(`job ${jobId} never settled`)); }
      }, 10);
    }),
  };
}
