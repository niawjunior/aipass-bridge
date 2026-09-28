import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { startBridge, FakeExtension, scripted, tempDir, run, waitFor, CHAT } from './harness.mjs';

let bridge;
before(async () => { bridge = await startBridge(); });
after(() => bridge.stop());

const chat = (args) => run(CHAT, [...args, '--bridge', bridge.base]);

test('one-shot prints the answer', async (t) => {
  const handler = scripted(['สวัสดีครับ ยินดีช่วยเหลือ']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out, code } = await chat(['สวัสดี']);
  assert.equal(code, 0);
  assert.match(out, /ยินดีช่วยเหลือ/);
  assert.equal(handler.sent.at(-1), 'สวัสดี', 'the prompt goes through untouched');
});

test('shows tool progress and sources alongside the answer', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => {
      await e.status('[web_search] {"query":"aipass"}');
      await e.text('AiPASS is a platform.');
      await e.status('sources:\n  - Aipass https://aipass.go.th/');
      await e.done();
    },
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await chat(['what is aipass']);
  assert.match(out, /\[web_search\]/);
  assert.match(out, /AiPASS is a platform\./);
  assert.match(out, /aipass\.go\.th/);
});

test('honours an explicit model', async (t) => {
  const handler = scripted(['ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await chat(['hi', '--model', 'claude-sonnet-5@default']);
  assert.equal(ext.chats.at(-1).modelId, 'claude-sonnet-5@default');
});

test('exits with a clear message when no extension is attached', async () => {
  const { out, code } = await chat(['hi']);
  assert.equal(code, 1);
  assert.match(out, /extension is not connected/);
});

test('exits with a clear message when the bridge is down', async () => {
  const { out, code } = await run(CHAT, ['hi', '--bridge', 'http://127.0.0.1:1']);
  assert.equal(code, 1);
  assert.match(out, /No bridge at/);
});

test('an image answer is written to a file instead of the scrollback', async (t) => {
  // 1x1 transparent PNG.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.image(png); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const dir = tempDir({});
  const { out } = await run(CHAT, ['a cat', '--bridge', bridge.base, '--out', dir]);
  assert.match(out, /image saved to/);

  const written = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  assert.equal(written.length, 1, out);
  // and it is a real PNG, not the base64 text
  assert.equal(fs.readFileSync(path.join(dir, written[0])).subarray(1, 4).toString(), 'PNG');
});

test('a pasted block is one message, not one per line', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.text('ok'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  // Exactly how a terminal delivers a paste: every line at once.
  const pasted = 'line one\nline two\nline three\n';
  const { out } = await run(CHAT, ['--bridge', bridge.base], { stdin: pasted });

  assert.equal(ext.chats.length, 1, `13-line pastes used to bill 13 requests; got ${ext.chats.length}`);
  assert.equal(ext.chats[0].text, 'line one\nline two\nline three');
  assert.match(out, /3 lines · sent as one message/);
});

test('typed lines stay separate messages', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.text('ok'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  // Spaced out the way a person types, so the paste heuristic must not merge them.
  const { out } = await run(CHAT, ['--bridge', bridge.base], {
    stdin: [[300, 'first\n'], [600, 'second\n']],
  });
  assert.equal(ext.chats.length, 2, out);
  assert.deepEqual(ext.chats.map((c) => c.text), ['first', 'second']);
});

test('--file attaches a document to the first message', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const dir = tempDir({ 'report.pdf': '%PDF-1.4\n' });
  const { out, code } = await chat(['summarise this', '--file', path.join(dir, 'report.pdf')]);
  assert.equal(code, 0);
  assert.match(out, /report\.pdf/, 'the attachment is named before the answer');

  const part = ext.chats.at(-1).parts.find((p) => p.type === 'file');
  assert.equal(part.filename, 'report.pdf');
  assert.equal(part.mediaType, 'application/pdf');
  assert.equal(Buffer.from(part.data.split(',')[1], 'base64').toString(), '%PDF-1.4\n');
});

test('--file names the unreadable path instead of failing mid-answer', async () => {
  const { out, code } = await chat(['hi', '--file', '/nope/missing.pdf']);
  assert.equal(code, 1);
  assert.match(out, /cannot read \/nope\/missing\.pdf/);
});

test('--thinking rides along with the request', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  await chat(['think hard', '--model', 'claude-opus-5@azure', '--thinking', 'max']);
  assert.equal(ext.chats.at(-1).thinkingLevel, 'max');
});

test('a generated video is decoded to disk, not left as a data URI', async (t) => {
  const mp4 = Buffer.from('AAAAIGZ0eXBpc29t', 'base64');
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('video', `data:video/mp4;base64,${mp4.toString('base64')}`); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const dir = tempDir({});
  const { out } = await chat(['a cat', '--model', 'veo-3.1-fast-generate-001', '--out', dir]);
  assert.match(out, /video\.mp4 saved to/);
  const written = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  assert.equal(written.length, 1, 'the extension must come from the media type');
  assert.deepEqual(fs.readFileSync(path.join(dir, written[0])), mp4);
});

test('a video delivered as a link is downloaded once the answer is printed', async (t) => {
  const body = Buffer.from('fake mp4 bytes');
  const origin = await new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4' });
      res.end(body);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}/clip.mp4`, srv }));
  });
  t.after(() => origin.srv.close());

  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('video', origin.url); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const dir = tempDir({});
  const { out } = await chat(['a cat', '--model', 'veo-3.1-fast-generate-001', '--out', dir]);
  assert.match(out, /downloading/);
  assert.match(out, /saved to/);
  const written = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  assert.deepEqual(fs.readFileSync(path.join(dir, written[0])), body);
});

test('an unreachable link says why instead of failing silently', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('video', 'http://127.0.0.1:1/private.mp4'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await chat(['a cat', '--model', 'veo-3.1-fast-generate-001', '--out', tempDir({})]);
  assert.match(out, /could not be downloaded/);
  assert.match(out, /signed link may have expired/);
});

test('a video link labelled with a filename is still downloaded', async (t) => {
  const body = Buffer.from('fake mp4');
  const origin = await new Promise((resolve) => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4' });
      res.end(body);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}/01a065f9.mp4?X-Goog-Signature=abc`, srv }));
  });
  t.after(() => origin.srv.close());

  const ext = await new FakeExtension(bridge.base, {
    onChat: async (_j, e) => { await e.media('video', origin.url, '01a065f9-b680-70ee-9b8b-9af350dd4fd7.mp4'); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const dir = tempDir({});
  const { out } = await chat(['a street', '--model', 'seedance-2.0-mini', '--out', dir]);
  assert.match(out, /downloading/, 'a uuid filename must not stop the link being chased');
  assert.ok(!out.includes('X-Goog-Signature'), 'the signature is noise in the terminal');
  const written = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  assert.deepEqual(fs.readFileSync(path.join(dir, written[0])), body);
});

test('--resolution and the video switches reach the job', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());
  await waitFor(async () => (await (await fetch(`${bridge.base}/v1/models?refresh=1`)).json()).data.length > 1);

  await chat(['a street', '--model', 'seedance-2.0-mini', '--resolution', '720p',
    '--duration', '8', '--camera-fixed', '--no-audio', '--style', 'Documentary style.']);
  const job = ext.videos.at(-1);
  assert.equal(job.resolution, '720p');
  assert.equal(job.duration, 8);
  assert.equal(job.cameraFixed, true);
  assert.equal(job.generateAudio, false);
  assert.equal(job.stylePreprompt, 'Documentary style.');
});

test('a missing --out directory is created on save', async (t) => {
  // 1x1 transparent PNG.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => { await e.image(png); await e.done(); },
  }).connect();
  t.after(() => ext.disconnect());

  const dir = path.join(tempDir({}), 'deep', 'nested', 'new');
  const { out, code } = await run(CHAT, ['a cat', '--bridge', bridge.base, '--out', dir]);
  assert.equal(code, 0, out);
  assert.match(out, /image saved to/);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length, 1, 'the directory now exists and holds the file');
});
