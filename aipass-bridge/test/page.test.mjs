// The content script, tested directly. Everything here was previously covered by
// nothing: the harness in harness.mjs stands in for the extension, so the frame
// decoder, the media routing and the reattach never ran under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sseResponse, brokenStream } from './page-harness.mjs';

const chatJob = (over = {}) => ({
  jobId: 'j1', kind: 'chat', conversationId: 'conv1', modelId: 'gemini-3.1-flash-lite',
  text: 'hi', parts: [{ type: 'text', text: 'hi' }], ...over,
});

const textFrames = (t) => [
  { type: 'text-delta', delta: t },
  { type: 'finish', finishReason: 'stop' },
];

test('page-ready is announced as soon as the script loads', () => {
  const page = loadPage({ onFetch: async () => ({}) });
  assert.ok(page.sent.some((m) => m.kind === 'page-ready'));
});

test('a text answer streams back as text parts', async () => {
  const page = loadPage({ onFetch: async () => sseResponse(textFrames('สวัสดี')) });
  page.run(chatJob());
  await page.settled('j1');
  assert.equal(page.parts('j1').filter((p) => p.kind === 'text').map((p) => p.text).join(''), 'สวัสดี');
});

// Regression for the frame that used to be dumped into the answer as raw JSON,
// and for sonar, which sends only this and no source-url.
test('web search results become titled sources, not JSON in the answer', async () => {
  const page = loadPage({ onFetch: async () => sseResponse([
    { type: 'text-delta', delta: 'answer' },
    { type: 'data-web_search_results', data: { links: [
      { url: 'https://bbc.com/a', title: 'BBC ไทย', domain: 'bbc.com' },
      { url: 'https://thaigov.go.th/b', domain: 'thaigov.go.th' },
    ] } },
    { type: 'finish', finishReason: 'stop' },
  ]) });
  page.run(chatJob());
  await page.settled('j1');

  const all = page.parts('j1');
  assert.ok(!all.some((p) => /data-web_search_results/.test(p.text)), 'the frame must not reach the answer');
  assert.ok(!all.some((p) => /unhandled/.test(p.text)), 'and must not be reported as unknown');
  const sources = all.find((p) => p.kind === 'status' && p.text.startsWith('sources:'));
  assert.match(sources.text, /BBC ไทย https:\/\/bbc\.com\/a/);
  assert.match(sources.text, /thaigov\.go\.th https:\/\/thaigov\.go\.th\/b/, 'no title falls back to the domain');
});

test('generated media is routed by its media type', async () => {
  const cases = [
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'video'],
    ['image/png', 'image'],
    ['application/pdf', 'file'],
  ];
  for (const [mediaType, kind] of cases) {
    const page = loadPage({ onFetch: async () => sseResponse([
      { type: 'file', mediaType, url: 'https://storage.googleapis.com/x/y.bin?X-Goog-Signature=a' },
      { type: 'finish', finishReason: 'stop' },
    ]) });
    page.run(chatJob());
    await page.settled('j1');
    assert.ok(page.parts('j1').some((p) => p.kind === kind), `${mediaType} should route to ${kind}`);
  }
});

// The shape a real seedance run returns: no `url` at all. Reading only `url`
// discarded every generated video in silence.
test('a video part carrying snapshotUrl and no url is not dropped', async () => {
  const page = loadPage({ onFetch: async () => sseResponse([
    { type: 'file', mediaType: 'video/mp4', filename: '01a065f9.mp4',
      storageKey: 'video-generations/x', snapshotUrl: 'https://storage.googleapis.com/v.mp4?X-Goog-Signature=b' },
    { type: 'finish', finishReason: 'stop' },
  ]) });
  page.run(chatJob());
  await page.settled('j1');
  const video = page.parts('j1').find((p) => p.kind === 'video');
  assert.ok(video, 'snapshotUrl must be read when url is absent');
  assert.equal(video.filename, '01a065f9.mp4');
  assert.match(video.text, /X-Goog-Signature=b/, 'the signature must survive or the link is dead');
});

test('a signed storage link is passed through, not fetched and inlined', async () => {
  const page = loadPage({ onFetch: async () => sseResponse([
    { type: 'file', mediaType: 'audio/mpeg', url: 'https://storage.googleapis.com/m.mp3?X-Goog-Signature=c' },
    { type: 'finish', finishReason: 'stop' },
  ]) });
  page.run(chatJob());
  await page.settled('j1');
  assert.equal(page.requests.length, 1, 'only the send-message call — a public link needs no cookie');
  assert.match(page.parts('j1').find((p) => p.kind === 'audio').text, /^https:\/\/storage\.googleapis\.com/);
});

// The reattach added for the run that cost 551 credits and returned nothing.
// It is deliberately narrow, and both halves of that matter.
test('a stream that dies before any content is reattached', async () => {
  const page = loadPage({
    onFetch: async (url, _init, n) => {
      if (n === 1) return brokenStream([{ type: 'start' }]);
      assert.match(url, /^\/actions\/resume-stream\/conv1$/, 'reattach goes to the conversation');
      return sseResponse(textFrames('recovered'));
    },
  });
  page.run(chatJob());
  const end = await page.settled('j1');
  assert.equal(end.kind, 'done', 'the job survives rather than failing');
  assert.equal(page.parts('j1').filter((p) => p.kind === 'text').map((p) => p.text).join(''), 'recovered');
  assert.ok(page.parts('j1').some((p) => p.kind === 'status' && /reattached/.test(p.text)));
});

test('a stream that dies after content is NOT reattached', async () => {
  const page = loadPage({
    onFetch: async (_url, _init, n) => {
      if (n === 1) return brokenStream([{ type: 'text-delta', delta: 'half an answer' }]);
      return sseResponse(textFrames('half an answer and more'));
    },
  });
  page.run(chatJob());
  const end = await page.settled('j1');
  assert.equal(end.kind, 'error', 'resuming here would deliver the answer twice');
  assert.equal(page.requests.length, 1, 'no resume was attempted');
});

test('an aborted job does not try to reattach', async () => {
  const page = loadPage({ onFetch: async () => brokenStream([{ type: 'start' }]) });
  page.run(chatJob());
  page.abort('j1');
  await page.settled('j1');
  assert.equal(page.requests.length, 1, 'an abort is not a dropped connection');
});

// The extension owns which paths and intents the bridge may reach. A job asking
// for anything else has to be refused here, not upstream.
test('the assistant job refuses an intent outside its allowlist', async () => {
  const page = loadPage({ onFetch: async () => ({ assistantId: 'a1' }) });
  page.run({ jobId: 'a', kind: 'assistant', op: 'delete', assistantId: 'x' });
  await page.settled('a');
  assert.match(page.requests.at(-1).url, /^\/actions\/ai-assistant-actions$/);

  const form = page.requests.at(-1).init.body;
  assert.equal(form.get('intent'), 'delete');
  assert.equal(form.get('assistantId'), 'x');
});

test('starting a bound chat posts one field to its own route', async () => {
  const page = loadPage({ onFetch: async () => ({ conversationId: 'bound99' }) });
  page.run({ jobId: 'b', kind: 'assistant', op: 'start-chat', assistantId: 'a1' });
  const end = await page.settled('b');
  assert.equal(end.conversationId, 'bound99');
  assert.match(page.requests.at(-1).url, /ai-assistant-start-chat$/);
  assert.equal(page.requests.at(-1).init.body.get('aiAssistantId'), 'a1');
});

test('a video job posts only the options it was given', async () => {
  const page = loadPage({
    onFetch: async (url, _init, n) => {
      if (n === 1) return { jobId: 'vid1', status: 'pending' };
      return { jobId: 'vid1', status: 'completed', progress: 100, videoUrl: 'https://storage.googleapis.com/v.mp4?X-Goog-Signature=z' };
    },
  });
  page.run({
    jobId: 'v', kind: 'video', conversationId: 'conv1', modelId: 'seedance-2.0-mini',
    text: 'a street', provider: 'seedance', resolution: '480p', duration: 6, generateAudio: false,
  });
  const end = await page.settled('v', 8000);
  assert.equal(end.kind, 'done');

  const body = JSON.parse(page.requests[0].init.body);
  assert.equal(body.provider, 'seedance');
  assert.equal(body.resolution, '480p');
  assert.equal(body.duration, 6);
  assert.equal(body.generateAudio, false, 'false must survive, not be dropped as falsy');
  assert.ok(!('cameraFixed' in body), 'what was not set is not sent');
  assert.match(page.parts('v').find((p) => p.kind === 'video').text, /X-Goog-Signature=z/);
});
