import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startBridge, FakeExtension, scripted, waitFor } from './harness.mjs';

let bridge;
before(async () => { bridge = await startBridge(); });
after(() => bridge.stop());

const post = (body) => fetch(`${bridge.base}/v1/chat/completions`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

async function readStream(res) {
  const text = await res.text();
  const frames = text.split('\n\n')
    .map((f) => f.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join(''))
    .filter((d) => d && d !== '[DONE]')
    .map((d) => JSON.parse(d));
  return {
    content: frames.map((f) => f.choices?.[0]?.delta?.content ?? '').join(''),
    reasoning: frames.map((f) => f.choices?.[0]?.delta?.reasoning_content ?? '').join(''),
    finish: frames.map((f) => f.choices?.[0]?.finish_reason).filter(Boolean).at(-1),
    error: frames.find((f) => f.error)?.error,
    done: text.includes('data: [DONE]'),
  };
}

test('refuses a request with no extension attached', async () => {
  const res = await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.match(body.error.message, /no extension connected/);
});

test('streams text, tool status and a finish reason', async () => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_job, e) => {
      await e.status('[web_search] {"query":"x"}');
      await e.text('hello ');
      await e.text('world');
      await e.status('sources:\n  - X https://example.com');
      await e.done();
    },
  }).connect();

  const out = await readStream(await post({ stream: true, messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(out.content, 'hello world');
  assert.match(out.reasoning, /web_search/);
  assert.match(out.reasoning, /sources:/);
  assert.equal(out.finish, 'stop');
  assert.ok(out.done);
  await ext.disconnect();
});

test('forwards only the newest user message, never an assistant turn', async () => {
  const handler = scripted(['ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();

  await post({
    messages: [
      { role: 'system', content: 'SYSTEM PROMPT' },
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'earlier answer' },
      { role: 'user', content: 'the newest question' },
    ],
  });

  assert.equal(handler.sent.at(-1), 'the newest question');
  assert.doesNotMatch(handler.sent.at(-1), /SYSTEM PROMPT|earlier answer|first question/);
  await ext.disconnect();
});

test('non-streaming returns a complete message with usage', async () => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.text('the answer'); await e.done(); },
  }).connect();

  const body = await (await post({ messages: [{ role: 'user', content: 'hi' }] })).json();
  assert.equal(body.choices[0].message.content, 'the answer');
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.ok(body.usage.total_tokens > 0);
  await ext.disconnect();
});

test('rejects a request carrying no user message', async () => {
  const ext = await new FakeExtension(bridge.base).connect();
  const res = await post({ messages: [{ role: 'system', content: 'only a system turn' }] });
  assert.equal(res.status, 400);
  await ext.disconnect();
});

test('lists every model the account can pick, tagged by kind', async () => {
  const ext = await new FakeExtension(bridge.base).connect();
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  const { data } = await (await fetch(`${bridge.base}/v1/models`)).json();
  const kind = (id) => data.find((m) => m.id === id)?.kind;
  assert.equal(kind('gemini-3.1-flash-lite'), 'chat');
  assert.equal(kind('gpt-image-2'), 'image');
  assert.equal(kind('gemini-3-pro-image'), 'image', 'a name ending in -image is an image model');
  assert.equal(kind('veo-3.1-fast-generate-001'), 'video');
  assert.equal(kind('lyria-3-pro-preview'), 'music');
  assert.equal(kind('sonar-deep-research'), 'research');
  // Web search on the way to a conversational answer is not the deep-research tab.
  assert.equal(kind('sonar-reasoning-pro'), 'chat');
  assert.equal(data.find((m) => m.id === 'gemini-3.1-flash-lite').free_credit, true);

  // ready but selectable:false — the web UI does not offer it, so neither do we
  assert.equal(kind('openthai2.0-legal@jts'), undefined, 'a non-selectable model must not be listed');
  await ext.disconnect();
});

test('?kind narrows the list the way the web UI tabs do', async () => {
  const ext = await new FakeExtension(bridge.base).connect();
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  const images = await (await fetch(`${bridge.base}/v1/models?kind=image`)).json();
  assert.deepEqual(images.data.map((m) => m.id).sort(), ['gemini-3-pro-image', 'gpt-image-2']);

  const both = await (await fetch(`${bridge.base}/v1/models?kind=image,video`)).json();
  assert.deepEqual(both.data.map((m) => m.id).sort(),
    ['gemini-3-pro-image', 'gpt-image-2', 'seedance-2.0-mini', 'veo-3.1-fast-generate-001']);
  await ext.disconnect();
});

test('AIPASS_MODEL_FILTER=chat restores the text-only list', async (t) => {
  const solo = await startBridge({ AIPASS_MODEL_FILTER: 'chat' });
  t.after(() => solo.stop());
  const ext = await new FakeExtension(solo.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${solo.base}/v1/models?refresh=1`)).json()).data.length > 1);

  const ids = (await (await fetch(`${solo.base}/v1/models`)).json()).data.map((m) => m.id);
  assert.ok(ids.includes('gemini-3.1-flash-lite'));
  assert.ok(!ids.includes('gpt-image-2'), 'image models are dropped under the chat filter');
  assert.ok(!ids.includes('veo-3.1-fast-generate-001'));
  assert.ok(ids.includes('sonar-deep-research'), 'research still answers as text');
});

test('picks the most recent conversation and rotates past one that is locked', async () => {
  const seen = [];
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => {
      seen.push(job.conversationId);
      if (job.conversationId === 'aaaa1111aaaa1111') return void e.error('aipass returned 409 — {"detail":"Conversation is busy"}');
      await e.text('ok');
      await e.done();
    },
  }).connect();

  await fetch(`${bridge.base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversation: null }),
  });

  const body = await (await post({ messages: [{ role: 'user', content: 'hi' }] })).json();
  assert.equal(body.choices[0].message.content, 'ok');
  assert.deepEqual(seen, ['aaaa1111aaaa1111', 'bbbb2222bbbb2222'], 'should try newest first, then the next');
  await ext.disconnect();
});

test('a job survives the extension disconnecting mid-stream', async () => {
  let resume;
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => {
      await e.text('part one ');
      await ext.disconnect();                       // the worker gets evicted
      resume = async () => {
        const back = await new FakeExtension(bridge.base).connect();
        await e.text('part two');             // delivery resumes on the same job
        await e.done();
        return back;
      };
    },
  }).connect();

  const pending = post({ stream: true, messages: [{ role: 'user', content: 'hi' }] });
  await waitFor(() => typeof resume === 'function');
  const back = await resume();

  const out = await readStream(await pending);
  assert.equal(out.content, 'part one part two');
  assert.equal(out.finish, 'stop');
  await back.disconnect();
});

test('reports credits, scaled out of the raw integers', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const quota = await fetch(`${bridge.base}/quota?refresh=1`).then((r) => r.json());
  // 10000000000 at creditsDecimals 6 is a pool of 10,000 — not ten billion.
  assert.equal(quota.limit, 10000);
  assert.equal(quota.available, 9832.957142);
  assert.equal(quota.used, 167.042858);
  assert.equal(quota.periodEndsAt, '2026-08-31T19:00:00.000Z');
  assert.deepEqual(quota.video, { limit: 10, used: 0, remaining: 10, period: 'month' });

  // and the same figures ride along on /status, so the popup polls one endpoint
  const status = await fetch(`${bridge.base}/status`).then((r) => r.json());
  assert.equal(status.credits.available, 9832.957142);
});

test('credits are unavailable rather than wrong when no tab is attached', async (t) => {
  const solo = await startBridge();
  t.after(() => solo.stop());
  const res = await fetch(`${solo.base}/quota`);
  assert.equal(res.status, 503);
  const status = await fetch(`${solo.base}/status`).then((r) => r.json());
  assert.equal(status.credits, null);
});

test('a generated image comes back as a markdown image', async (t) => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.image(png); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const body = await fetch(`${bridge.base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', messages: [{ role: 'user', content: 'a cat' }] }),
  }).then((r) => r.json());

  // Chat completions have no field for an image, so it rides in the content
  // where every client already renders it.
  assert.match(body.choices[0].message.content, /!\[image\]\(data:image\/png;base64,/);
});

test('the aspect ratio reaches the extension, and a request can override it', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.text('ok'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const ask = (extra) => fetch(`${bridge.base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', messages: [{ role: 'user', content: 'a cat' }], ...extra }),
  }).then((r) => r.json());

  await ask({});
  assert.equal(ext.chats.at(-1).aspectRatio, '1:1', 'the default the web UI starts on');

  await ask({ aspect_ratio: '3:4' });
  assert.equal(ext.chats.at(-1).aspectRatio, '3:4');

  await fetch(`${bridge.base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ aspectRatio: '4:3' }),
  });
  await ask({});
  assert.equal(ext.chats.at(-1).aspectRatio, '4:3', 'config sets it for requests that do not say');
});

test('config sets the default model and reports it', async () => {
  const handler = scripted(['ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();

  await fetch(`${bridge.base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ defaultModel: 'claude-sonnet-5@default' }),
  });
  await post({ messages: [{ role: 'user', content: 'hi' }] });

  assert.equal(ext.chats.at(-1).modelId, 'claude-sonnet-5@default');
  const status = await (await fetch(`${bridge.base}/status`)).json();
  assert.equal(status.defaultModel, 'claude-sonnet-5@default');
  await ext.disconnect();
});

test('surfaces an upstream error inside the stream', async () => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => e.error('aipass returned 403 — 403 Forbidden'),
  }).connect();

  const out = await readStream(await post({ stream: true, messages: [{ role: 'user', content: 'hi' }] }));
  assert.match(out.error.message, /403/);
  assert.ok(out.done, 'the stream must still terminate cleanly');
  await ext.disconnect();
});

test('passes an assistant id and field through to the create call', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const made = await (await fetch(`${bridge.base}/conversations/new`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hi', assistant: 'asst_xyz' }),
  })).json();

  assert.match(made.id, /^[0-9a-f]{16}$/);
  assert.equal(ext.created.at(-1).assistant, 'asst_xyz');
  assert.equal(ext.created.at(-1).assistantField, 'aiAssistantId', 'default field name until a capture confirms it');
});

test('creates a conversation and adopts it', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const made = await (await fetch(`${bridge.base}/conversations/new`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'สวัสดี', model: 'gemini-3.1-flash-lite' }),
  })).json();

  assert.match(made.id, /^[0-9a-f]{16}$/);
  assert.equal(ext.created.length, 1);
  assert.equal(ext.created[0].message, 'สวัสดี');
  assert.equal(ext.created[0].modelId, 'gemini-3.1-flash-lite');
  // the server derives the id from the request id it was handed
  assert.equal(made.id, ext.created[0].requestId.replace(/-/g, '').slice(0, 16));

  const status = await (await fetch(`${bridge.base}/status`)).json();
  assert.equal(status.conversation, made.id, 'the new conversation becomes the current one');

  await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(ext.chats.at(-1).conversationId, made.id, 'chats go to the new conversation');
});

/* ------------------------------------------------------------- hardening */

import http from 'node:http';

// fetch() will not let us forge a Host header, so use the raw client.
function rawRequest(port, { path = '/status', method = 'GET', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers: host ? { Host: host } : {} },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('rejects an unexpected Host header (DNS-rebinding guard)', async () => {
  const evil = await rawRequest(bridge.port, { host: 'attacker.example.com' });
  assert.equal(evil.status, 403, 'a foreign Host must be refused');
  assert.match(evil.body, /unexpected Host/);

  for (const host of [`127.0.0.1:${bridge.port}`, `localhost:${bridge.port}`]) {
    const ok = await rawRequest(bridge.port, { host });
    assert.equal(ok.status, 200, `${host} must be allowed`);
  }
});

test('a malformed Host header is refused, and does not kill the process', async () => {
  // `new URL(req.url, 'http://…')' throws on a header like this; the parse used
  // to run before the try block, so one request was an unhandled rejection and
  // Node exited. It must be answered, and the bridge must still be alive after.
  const bad = await rawRequest(bridge.port, { host: 'bad host' });
  assert.equal(bad.status, 403, 'a malformed Host is not in the allowlist');
  const after = await fetch(`${bridge.base}/status`);
  assert.ok(after.ok, 'the bridge survives the malformed Host');
});

test('sends no CORS header by default, so no web page can call the bridge', async () => {
  const res = await fetch(`${bridge.base}/status`);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('access-control-allow-private-network'), null);

  const pre = await fetch(`${bridge.base}/v1/chat/completions`, { method: 'OPTIONS' });
  assert.equal(pre.headers.get('access-control-allow-origin'), null, 'preflight must not grant an origin');
});

test('sends CORS only when AIPASS_CORS_ORIGIN is set', async (t) => {
  const cors = await startBridge({ AIPASS_CORS_ORIGIN: 'https://example.com' });
  t.after(() => cors.stop());
  const res = await fetch(`${cors.base}/status`);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://example.com');
});

test('admin routes are off unless AIPASS_ADMIN=1', async () => {
  for (const [path, method] of [['/logs', 'GET'], ['/tab/reload', 'POST'], ['/browser/restart', 'POST'], ['/restart', 'POST']]) {
    const res = await fetch(`${bridge.base}${path}`, { method });
    assert.equal(res.status, 404, `${path} must not exist without AIPASS_ADMIN`);
  }
});

test('with AIPASS_ADMIN=1 the admin routes work and /logs refuses a traversal name', async (t) => {
  const admin = await startBridge({ AIPASS_ADMIN: '1' });
  t.after(() => admin.stop());

  const ok = await fetch(`${admin.base}/tab/reload`, { method: 'POST' });
  assert.equal(ok.status, 200, 'admin route should be reachable');

  for (const bad of ['../../etc/passwd', 'a/b', '..', 'x.y']) {
    const res = await fetch(`${admin.base}/logs?file=${encodeURIComponent(bad)}`);
    const body = await res.json();
    assert.equal(res.status, 400, `"${bad}" must be rejected`);
    assert.match(body.error, /invalid log name/);
  }
});

test('an image URL pointing at a private address is dropped, not fetched', async (t) => {
  const handler = scripted(['ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await post({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'http://127.0.0.1:1/secret.png' } },
        { type: 'image_url', image_url: { url: 'http://169.254.169.254/latest/meta-data' } },
      ],
    }],
  });

  const job = ext.chats.at(-1);
  const images = (job.parts ?? []).filter((p) => p.type === 'image');
  assert.equal(images.length, 0, 'private-network images must never reach the extension');
  assert.match(job.text, /describe this/, 'the text part still goes through');
});

test('IP spellings that mean a private address are refused too', async (t) => {
  // The URL parser normalises integer/hex/octal IPv4 to dotted-quad, so those
  // already meet the plain check; the mapped-IPv6 forms do not, and once meant
  // loopback slipped past the guard.
  const handler = scripted(['ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await post({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'describe these' },
        { type: 'image_url', image_url: { url: 'http://2130706433/x.png' } },        // 127.0.0.1 as an integer
        { type: 'image_url', image_url: { url: 'http://0x7f000001/x.png' } },        // …as hex
        { type: 'image_url', image_url: { url: 'http://[::ffff:127.0.0.1]/x.png' } }, // mapped loopback
        { type: 'image_url', image_url: { url: 'http://[::ffff:169.254.0.1]/x.png' } }, // mapped link-local
        { type: 'image_url', image_url: { url: 'http://[::]/x.png' } },              // unspecified
      ],
    }],
  });

  const job = ext.chats.at(-1);
  const images = (job.parts ?? []).filter((p) => p.type === 'image');
  assert.equal(images.length, 0, 'no private-address spelling may reach the extension');
});

test('creates a temporary conversation and repeats the flag on every turn', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const made = await (await fetch(`${bridge.base}/conversations/new`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ temporary: true }),
  })).json();

  // the temporary intent is used, and no first message is needed
  assert.equal(ext.created.at(-1).temporary, true);
  assert.equal(made.temporary, true);
  // the id comes from the conversation object, not a conversationId field
  assert.equal(made.id, 'M5uhmgOBsPk0v4WN');

  await post({ messages: [{ role: 'user', content: 'hi' }] });
  const chat = ext.chats.at(-1);
  assert.equal(chat.conversationId, 'M5uhmgOBsPk0v4WN');
  assert.equal(chat.temporary, true, 'every turn must repeat isTemporary');
});

test('a normal conversation is not marked temporary', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await (await fetch(`${bridge.base}/conversations/new`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  })).json();

  assert.ok(!ext.created.at(-1).temporary);
  await post({ messages: [{ role: 'user', content: 'hi' }] });
  assert.ok(!ext.chats.at(-1).temporary);
});

test('passes a valid thinking level through and drops a bogus one', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await post({ messages: [{ role: 'user', content: 'hi' }], thinking_level: 'high' });
  assert.equal(ext.chats.at(-1).thinkingLevel, 'high');

  await post({ messages: [{ role: 'user', content: 'hi' }], thinking_level: 'ludicrous' });
  assert.equal(ext.chats.at(-1).thinkingLevel, undefined, 'an unknown level must not be forwarded');
});

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

test('a document part reaches the extension named and typed', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await post({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'summarise this' },
        { type: 'file', file: { filename: 'report.pdf', file_data: PDF } },
      ],
    }],
  });

  const part = ext.chats.at(-1).parts.find((p) => p.type === 'file');
  assert.ok(part, 'the file part must survive as a file, not become an image');
  assert.equal(part.mediaType, 'application/pdf');
  assert.equal(part.filename, 'report.pdf');
  assert.equal(part.data, PDF);
  assert.equal(ext.chats.at(-1).text, 'summarise this');
});

test('an attachment with no question still carries text upstream', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await post({
    messages: [{ role: 'user', content: [{ type: 'file', file: { filename: 'notes.csv', file_data: 'data:text/csv;base64,YSxiCg==' } }] }],
  });
  assert.equal(ext.chats.at(-1).text, '[notes.csv]', 'an empty composer is rejected upstream');
});

test('an unnamed document is given a name from its type', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await post({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }, { type: 'file', url: PDF }] }] });
  assert.equal(ext.chats.at(-1).parts.find((p) => p.type === 'file').filename, 'attachment.pdf');
});

test('an image sent as a file part is still an image', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  await post({ messages: [{ role: 'user', content: [{ type: 'text', text: 'what is this' }, { type: 'file', file: { filename: 'shot.png', file_data: png } }] }] });
  const parts = ext.chats.at(-1).parts;
  assert.ok(parts.some((p) => p.type === 'image' && p.image === png));
  assert.ok(!parts.some((p) => p.type === 'file'), 'it must not be uploaded as a document');
});

test('an attachment of an unsupported type is refused, not forwarded', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await post({
    messages: [{ role: 'user', content: [{ type: 'text', text: 'run this' }, { type: 'file', file: { filename: 'x.sh', file_data: 'data:application/x-sh;base64,ZWNobyBoaQo=' } }] }],
  });
  assert.ok(!ext.chats.at(-1).parts.some((p) => p.type === 'file'), 'an executable must not be uploaded');
  assert.equal(ext.chats.at(-1).text, 'run this', 'the question still goes through');
});

test('a thinking level is checked against what the model advertises', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  // Opus is the only model that advertises max
  await post({ model: 'claude-opus-5@azure', messages: [{ role: 'user', content: 'hi' }], thinking_level: 'max' });
  assert.equal(ext.chats.at(-1).thinkingLevel, 'max');

  await post({ model: 'claude-sonnet-5@default', messages: [{ role: 'user', content: 'hi' }], thinking_level: 'max' });
  assert.equal(ext.chats.at(-1).thinkingLevel, undefined, 'sonnet does not offer max');

  await post({ model: 'claude-sonnet-5@default', messages: [{ role: 'user', content: 'hi' }], thinking_level: 'high' });
  assert.equal(ext.chats.at(-1).thinkingLevel, 'high');
});

test('a generated video comes back as a link, not a broken image tag', async (t) => {
  const mp4 = 'data:video/mp4;base64,AAAAIGZ0eXA=';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('video', mp4); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const body = await (await post({ model: 'veo-3.1-fast-generate-001', messages: [{ role: 'user', content: 'a cat' }] })).json();
  const content = body.choices[0].message.content;
  assert.match(content, /\[video\.mp4\]\(data:video\/mp4;base64,/);
  assert.ok(!content.includes('!['), 'an mp4 in an image tag renders as a broken image');
});

test('a generated music clip comes back as an audio link', async (t) => {
  const wav = 'data:audio/wav;base64,UklGRg==';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('audio', wav); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const body = await (await post({ model: 'lyria-3-pro-preview', messages: [{ role: 'user', content: 'lo-fi' }] })).json();
  assert.match(body.choices[0].message.content, /\[audio\.wav\]\(data:audio\/wav;base64,/);
});

// The shape a real generation returns: a signed storage.googleapis.com URL
// whose path carries the extension and whose query carries the signature.
const SIGNED = 'https://storage.googleapis.com/aip-prd-chat-bucket/music/2157/01a065ef.mp3'
  + '?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=21600&X-Goog-Signature=ad64c8ed';

test('a signed storage link is labelled from its path, not its query', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('audio', SIGNED); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const body = await (await post({ model: 'lyria-3-clip-preview', messages: [{ role: 'user', content: 'lo-fi' }] })).json();
  const content = body.choices[0].message.content;
  assert.match(content, /\[audio\.mp3\]\(https:\/\/storage\.googleapis\.com\//);
  assert.ok(content.includes('X-Goog-Signature=ad64c8ed'), 'the signature must survive intact or the link is dead');
});

test('a video model gets a longer silence allowance than a chat model', async (t) => {
  const slow = await startBridge({ AIPASS_IDLE_TIMEOUT_MS: '400', AIPASS_MEDIA_TIMEOUT_MS: '8000' });
  t.after(() => slow.stop());
  // never answers: whether the job survives is entirely down to the timeout
  const ext = await new FakeExtension(slow.base, { onChat: async () => {} }).connect();
  t.after(() => ext.disconnect());

  const chat = await (await fetch(`${slow.base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'hi' }] }),
  })).json();
  assert.match(chat.error.message, /timed out/, 'a chat model still times out quickly');

  const started = Date.now();
  const video = fetch(`${slow.base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'veo-3.1-fast-generate-001', messages: [{ role: 'user', content: 'a cat' }] }),
  });
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(Date.now() - started > 1000, 'the video job must outlive the chat timeout');
  video.catch(() => {});
});

// The exact part a seedance-2.0-mini run returns. Note there is no `url`: the
// extension reads snapshotUrl, and a video carries its own filename where music
// does not.
test('a video part is labelled with the filename it carries', async (t) => {
  const url = 'https://storage.googleapis.com/aip-prd-chat-bucket/video-generations/2157/19d3/01a065f9.mp4'
    + '?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=86400&X-Goog-Signature=ace3722b';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => {
      await e.text('Generated video from prompt: "a calm street in Bangkok at night" (seedance)');
      await e.media('video', url, '01a065f9-b680-70ee-9b8b-9af350dd4fd7.mp4');
      await e.done();
    },
  }).connect();
  t.after(() => ext.disconnect());

  const body = await (await post({ model: 'seedance-2.0-mini', messages: [{ role: 'user', content: 'a street' }] })).json();
  const content = body.choices[0].message.content;
  assert.match(content, /\[01a065f9-b680-70ee-9b8b-9af350dd4fd7\.mp4\]\(https:\/\/storage\.googleapis\.com\//);
  assert.ok(content.includes('X-Goog-Signature=ace3722b'), 'the signature must survive or the link is dead');
  assert.match(content, /Generated video from prompt/, 'the text part rides alongside the file');
});

test('a video model is submitted as a job, not sent as a chat', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  await post({ model: 'seedance-2.0-mini', messages: [{ role: 'user', content: 'a street at night' }] });
  const job = ext.videos.at(-1);
  assert.ok(job, 'a video model must not go through /actions/send-message');
  assert.equal(job.kind, 'video');
  assert.equal(job.text, 'a street at night');
  // The submit route validates provider against veo | sora | seedance | wan.
  // seedance's *display* provider is byteplus, and sending that is a 400.
  assert.equal(job.provider, 'seedance');

  await post({ model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(ext.videos.length, 1, 'a chat model must still stream');
});

test('video options are passed through, and resolution is gated by model', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  await post({
    model: 'seedance-2.0-mini', messages: [{ role: 'user', content: 'a street' }],
    aspect_ratio: '9:16', resolution: '720p', duration: 8,
    camera_fixed: true, generate_audio: false,
    style_preprompt: 'Documentary style, natural camera work.',
  });
  const job = ext.videos.at(-1);
  assert.equal(job.aspectRatio, '9:16');
  assert.equal(job.resolution, '720p');
  assert.equal(job.duration, 8);
  assert.equal(job.cameraFixed, true);
  assert.equal(job.generateAudio, false, 'false must survive, not be dropped as falsy');
  assert.equal(job.stylePreprompt, 'Documentary style, natural camera work.');

  // veo takes the prompt, the ratio and the style — nothing else
  await post({
    model: 'veo-3.1-fast-generate-001', messages: [{ role: 'user', content: 'a street' }],
    resolution: '1080p', duration: 8, camera_fixed: true, generate_audio: false, aspect_ratio: '16:9',
  });
  const veo = ext.videos.at(-1);
  assert.equal(veo.provider, 'veo');
  assert.equal(veo.aspectRatio, '16:9', 'the ratio still goes through');
  assert.equal(veo.resolution, undefined, 'veo takes no resolution');
  assert.equal(veo.duration, undefined, 'the seedance-only options are dropped');
  assert.equal(veo.cameraFixed, undefined);
  assert.equal(veo.generateAudio, undefined);

  // seedance takes 480p and 720p only
  await post({ model: 'seedance-2.0-mini', messages: [{ role: 'user', content: 'a street' }], resolution: '4k' });
  assert.equal(ext.videos.at(-1).resolution, undefined, '4k is not on the list');
});

test('models report the option surface each one actually accepts', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  const all = (await (await fetch(`${bridge.base}/v1/models`)).json()).data;
  const byId = Object.fromEntries(all.map((m) => [m.id, m]));
  assert.deepEqual(byId['seedance-2.0-mini'].options.resolutions, ['480p', '720p']);
  assert.equal(byId['veo-3.1-fast-generate-001'].options.resolutions, null, 'veo offers no resolution');
  assert.deepEqual(byId['seedance-2.0-mini'].options.images, { maximumImages: 9, sourceImage: false, referenceImages: true });
  assert.equal(byId['gemini-3.1-flash-lite'].options, undefined, 'a chat model has no video surface');
});

test('a quiet stream still sends bytes, so a client body timeout cannot kill it', async (t) => {
  const slow = await startBridge({ AIPASS_KEEPALIVE_MS: '120' });
  t.after(() => slow.stop());
  // says nothing for a while, the way a video job sitting on one percentage does
  const ext = await new FakeExtension(slow.base, {
    onChat: async (_j, e) => { await new Promise((r) => setTimeout(r, 700)); await e.text('done'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const res = await fetch(`${slow.base}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gemini-3.1-flash-lite', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  const raw = await res.text();
  assert.ok(raw.includes(': keepalive'), 'the stream must produce bytes while it waits');
  // SSE comments are ignored by a conforming parser, so the payload is unchanged
  assert.match(raw, /"content":"done"/);
  assert.match(raw, /data: \[DONE\]/);
});

// Phase 1: the app serves what each video provider accepts. The bridge used to
// hardcode a table lifted from the minified bundle, which disagreed with the
// live loader — it listed 720p for seedance where the account is served 480p.
const videoJob = async (ext, body) => {
  await post({ model: 'seedance-2.0-mini', messages: [{ role: 'user', content: 'a street' }], ...body });
  return ext.videos.at(-1);
};

test('served options beat the hardcoded table', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);
  await waitFor(async () => (await (await fetch(`${bridge.base}/video-options`)).json()).styles.length > 0);

  // 720p is in the fallback table and NOT in what the loader serves
  assert.equal((await videoJob(ext, { resolution: '720p' })).resolution, undefined);
  assert.equal((await videoJob(ext, { resolution: '480p' })).resolution, '480p');
});

test('a duration outside the served list is dropped, not sent', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/video-options?refresh=1`)).json()).styles.length > 0);

  // 8 was in our own README until the picker showed only 4 and 6
  assert.equal((await videoJob(ext, { duration: 8 })).duration, undefined);
  assert.equal((await videoJob(ext, { duration: 6 })).duration, 6);
});

test('an aspect ratio is checked against the provider, not the model', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/video-options?refresh=1`)).json()).styles.length > 0);

  // 21:9 is a seedance row; 16:9 is an "all" row and reaches every provider
  assert.equal((await videoJob(ext, { aspect_ratio: '21:9' })).aspectRatio, '21:9');
  await post({ model: 'veo-3.1-fast-generate-001', messages: [{ role: 'user', content: 'x' }], aspect_ratio: '21:9' });
  assert.equal(ext.videos.at(-1).aspectRatio, undefined, 'seedance-only ratios must not reach veo');
  await post({ model: 'veo-3.1-fast-generate-001', messages: [{ role: 'user', content: 'x' }], aspect_ratio: '16:9' });
  assert.equal(ext.videos.at(-1).aspectRatio, '16:9', 'an "all" row applies to every provider');
});

test('a style can be named instead of pasted', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/video-options?refresh=1`)).json()).styles.length > 0);

  assert.equal((await videoJob(ext, { style_preprompt: 'Documentary' })).stylePreprompt,
    'Documentary style, natural camera work.', 'the name resolves to the preset text');
  assert.equal((await videoJob(ext, { style_preprompt: 'สารคดี' })).stylePreprompt,
    'Documentary style, natural camera work.', 'the Thai name works too');
  assert.equal((await videoJob(ext, { style_preprompt: 'something bespoke' })).stylePreprompt,
    'something bespoke', 'raw text still passes through');
});

test('models report the served surface, not what was cached at startup', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);
  await waitFor(async () => (await (await fetch(`${bridge.base}/video-options?refresh=1`)).json()).styles.length > 0);

  const byId = Object.fromEntries((await (await fetch(`${bridge.base}/v1/models`)).json()).data.map((m) => [m.id, m]));
  assert.deepEqual(byId['seedance-2.0-mini'].options.resolutions, ['480p']);
  assert.deepEqual(byId['seedance-2.0-mini'].options.durations, [4, 6]);
  assert.deepEqual(byId['veo-3.1-fast-generate-001'].options.aspectRatios, ['16:9', '9:16'],
    'veo gets the "all" rows and none of seedance\'s');
  assert.equal(byId['veo-3.1-fast-generate-001'].options.resolutions, null);
});

// Image styles are sent by id; tone and format by the code the loader publishes.
// Passing the display name straight through would send a string the server does
// not recognise, so each is resolved or dropped.
test('an image style is resolved to its id, by any name it is known by', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/style-options?refresh=1`)).json()).imageStyles.length > 0);

  const send = async (body) => {
    await post({ model: 'gpt-image-2', messages: [{ role: 'user', content: 'a cat' }], ...body });
    return ext.chats.at(-1);
  };
  assert.equal((await send({ image_style: 'Anime' })).imageStyleId, 'img_anime');
  assert.equal((await send({ image_style: 'อนิเมะ' })).imageStyleId, 'img_anime', 'the Thai name works');
  assert.equal((await send({ image_style: 'img_minimal' })).imageStyleId, 'img_minimal', 'the id works');
  assert.equal((await send({ image_style: 'Nonexistent' })).imageStyleId, undefined, 'an unknown preset is dropped');
});

test('an image style is not sent to a chat model', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/style-options?refresh=1`)).json()).imageStyles.length > 0);

  await post({ model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'hi' }], image_style: 'Anime' });
  assert.equal(ext.chats.at(-1).imageStyleId, undefined);
});

test('tone and format travel as codes and apply to any model', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/style-options?refresh=1`)).json()).tones.length > 0);

  await post({
    model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'hi' }],
    output_tone: 'Concise', output_format: 'table',
  });
  const job = ext.chats.at(-1);
  assert.equal(job.outputTone, 'concise', 'the display name resolves to the code');
  assert.equal(job.outputFormat, 'table');

  await post({ model: 'gemini-3.1-flash-lite', messages: [{ role: 'user', content: 'hi' }], output_tone: 'shouty' });
  assert.equal(ext.chats.at(-1).outputTone, undefined, 'an unknown tone is dropped, not forwarded');
});
