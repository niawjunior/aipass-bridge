import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startBridge, FakeExtension, scripted, tempDir, run, AGENT } from './harness.mjs';

let bridge;
before(async () => { bridge = await startBridge(); });
after(() => bridge.stop());

const agent = (dir, args = [], opts = {}) => run(AGENT, ['task text', '--root', dir, '--bridge', bridge.base, ...args], opts);

test('reads files and reports a summary, touching nothing on disk', async (t) => {
  const dir = tempDir({ 'README.md': 'a starter project\n' });
  const handler = scripted([
    'Let me look.\n\nNEED dir .\nNEED file README.md',
    'It is a starter project.\n\nDONE It is a starter project.',
  ]);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /✓ list \./);
  assert.match(out, /✓ read README\.md/);
  assert.match(out, /✓ It is a starter project\./);
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), 'a starter project\n');
});

test('the first message carries the instructions and a real directory listing', async (t) => {
  const dir = tempDir({ 'only.txt': 'x' });
  const handler = scripted(['DONE nothing to do']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  const first = handler.sent[0];
  assert.match(first, /NEED file README\.md/, 'instructions present');
  assert.match(first, /only\.txt/, 'listing present');
  assert.doesNotMatch(first, /\btool\b/i, 'must not claim the model has tools');
});

test('later turns carry only results, never the instructions again', async (t) => {
  const dir = tempDir({ 'a.txt': 'hello' });
  const handler = scripted(['NEED file a.txt', 'DONE read it']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  assert.ok(handler.sent.length >= 2);
  assert.doesNotMatch(handler.sent[1], /NEED file README\.md/, 'preamble must not be resent');
  assert.ok(Buffer.byteLength(handler.sent[1]) < Buffer.byteLength(handler.sent[0]) / 2);
});

test('dry run shows a diff but writes nothing; --apply writes', async (t) => {
  const replies = [
    'EDIT a.txt\nFIND\nhello\nNEW\ngoodbye\nEND\nCREATE b.txt\nbrand new\nEND',
    'DONE changed things',
  ];

  const dry = tempDir({ 'a.txt': 'hello' });
  const dryExt = await new FakeExtension(bridge.base, { onChat: scripted(replies) }).connect();
  t.after(() => dryExt.disconnect());
  const first = await agent(dry);
  assert.match(first.out, /-hello/);
  assert.match(first.out, /\+goodbye/);
  assert.match(first.out, /dry run/);
  assert.equal(fs.readFileSync(path.join(dry, 'a.txt'), 'utf8'), 'hello');
  assert.ok(!fs.existsSync(path.join(dry, 'b.txt')));
  await dryExt.disconnect();

  const wet = tempDir({ 'a.txt': 'hello' });
  const wetExt = await new FakeExtension(bridge.base, { onChat: scripted(replies) }).connect();
  t.after(() => wetExt.disconnect());
  await agent(wet, ['--apply']);
  assert.equal(fs.readFileSync(path.join(wet, 'a.txt'), 'utf8'), 'goodbye');
  assert.equal(fs.readFileSync(path.join(wet, 'b.txt'), 'utf8'), 'brand new');
});

test('the diff still renders when there is no diff binary (the Windows shape)', async (t) => {
  // PATH stripped, so execFileSync('diff') fails with ENOENT — exactly what
  // happens on Windows. It used to print the file header and then nothing.
  const dir = tempDir({ 'a.txt': 'hello' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['EDIT a.txt\nFIND\nhello\nNEW\ngoodbye\nEND\nDONE changed a.txt']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--apply'], { env: { PATH: '' } });
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'goodbye', 'the edit itself still lands');
  assert.match(out, /--- a\/a\.txt/);
  assert.match(out, /-hello/);
  assert.match(out, /\+goodbye/);
});

test('a dry run offers to apply, and answering y writes the files', async (t) => {
  const replies = [
    'EDIT a.txt\nFIND\nhello\nNEW\ngoodbye\nEND\nCREATE b.txt\nbrand new\nEND',
    'DONE changed things',
  ];
  const dir = tempDir({ 'a.txt': 'hello' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(replies) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, [], { stdin: [[300, 'y\n']] });
  assert.match(out, /apply 2 change\(s\)\?/, 'the diff must be followed by an offer to write it');
  assert.match(out, /wrote 2 file\(s\)/);
  // The point of the prompt: one run, and what was shown is what landed.
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'goodbye');
  assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'brand new');
});

test('declining the apply prompt leaves the disk untouched', async (t) => {
  const replies = ['CREATE b.txt\nbrand new\nEND', 'DONE made a file'];
  const dir = tempDir({ 'a.txt': 'hello' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(replies) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, [], { stdin: [[300, 'n\n']] });
  assert.match(out, /apply 1 change\(s\)\?/);
  assert.match(out, /nothing written/);
  assert.ok(!fs.existsSync(path.join(dir, 'b.txt')));
});

test('an edit whose FIND text does not match is reported, not applied', async (t) => {
  const dir = tempDir({ 'a.txt': 'hello' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['EDIT a.txt\nFIND\nnot in the file\nNEW\nx\nEND', 'DONE gave up']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--apply']);
  assert.match(out, /was not found/);
  assert.equal(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'hello');
});

test('refuses to touch anything outside the project root', async (t) => {
  const dir = tempDir({ 'a.txt': 'hello' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['CREATE ../escaped.txt\nowned\nEND', 'DONE tried']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--apply']);
  assert.match(out, /escapes root/);
  assert.ok(!fs.existsSync(path.join(dir, '..', 'escaped.txt')));
});

test('DONE alongside a file request is ignored, and the run continues', async (t) => {
  const dir = tempDir({ 'a.txt': 'contents here' });
  const handler = scripted([
    'NEED file a.txt\n\nDONE waiting on that file',
    'DONE now I have actually read it',
  ]);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /ignoring DONE/);
  assert.match(out, /✓ read a\.txt/);
  assert.match(out, /now I have actually read it/);
  assert.ok(handler.sent.length >= 2, 'the run must not stop on the premature DONE');
});

test('recovers when the model drifts into prose, and gives up after three', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const drifting = await new FakeExtension(bridge.base, {
    onChat: scripted(['I cannot do that.', 'NEED file a.txt', 'DONE fine']),
  }).connect();
  t.after(() => drifting.disconnect());
  const recovered = await agent(dir);
  assert.match(recovered.out, /nudging \(1\/2\)/);
  assert.match(recovered.out, /✓ read a\.txt/);
  await drifting.disconnect();

  const stubborn = await new FakeExtension(bridge.base, { onChat: scripted(['I will not do that.']) }).connect();
  t.after(() => stubborn.disconnect());
  const gaveUp = await agent(dir);
  assert.match(gaveUp.out, /no marker after three replies/);
});

test('loopback addresses are substituted outbound and restored on disk', async (t) => {
  const dir = tempDir({ 'cfg.md': 'see http://localhost:3000 and 127.0.0.1:8080\n' });
  const handler = scripted([
    'NEED file cfg.md',
    'EDIT cfg.md\nFIND\nsee http://LCLHST:3000 and LOOPBACK-IP:8080\nNEW\nsee http://LCLHST:4000 and LOOPBACK-IP:9090\nEND',
    'DONE ports changed',
  ]);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--apply']);
  const sentAll = handler.sent.join('\n');
  assert.doesNotMatch(sentAll, /localhost/i, 'localhost must never leave this machine');
  assert.doesNotMatch(sentAll, /127\.0\.0\.1/, 'loopback ip must never leave this machine');
  assert.match(sentAll, /LCLHST/);
  assert.equal(fs.readFileSync(path.join(dir, 'cfg.md'), 'utf8'), 'see http://localhost:4000 and 127.0.0.1:9090\n');
});

test('splits and resends a turn the upstream rejects', async (t) => {
  const filler = 'a line of perfectly ordinary prose in the middle of the file\n'.repeat(6);
  const dir = tempDir({ 'big.txt': `ALPHA line\n${filler}BETA line\n` });
  // Rejects only when both markers travel together, which splitting resolves.
  const handler = scripted(['NEED file big.txt', 'DONE read it'], {
    reject: (t) => t.includes('ALPHA') && t.includes('BETA'),
  });
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /splitting into 2 parts/);
  assert.match(out, /✓ read it/);
});

test('drops a line that cannot be sent at any size, and keeps going', async (t) => {
  const dir = tempDir({ 'package.json': '{\n  "scripts": {\n    "x": "node -e \\"fetch()\\"",\n    "build": "next build"\n  }\n}\n' });
  const handler = scripted(['NEED file package.json', 'DONE inspected it'], {
    reject: (t) => /node\s+-e/.test(t),
  });
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /omitting 1 line/);
  assert.match(out, /✓ inspected it/);
  const delivered = handler.sent.join('\n');
  assert.doesNotMatch(delivered, /node -e/, 'the blocked line must never be accepted upstream');
  assert.match(delivered, /next build/, 'the rest of the file still gets through');
  assert.ok(handler.rejected.length > 0, 'the first attempt should have been refused');
});

test('falls back to the reply prose when DONE carries no summary', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['It is a small Next.js starter.\n\nDONE\n\nWant me to continue?']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /✓ It is a small Next\.js starter\./);
});

test('shell commands are refused unless --allow-run is given', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['RUN\necho pwned\nEND', 'DONE tried']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /disabled for this run/);
});

test('starts its own temporary conversation by default', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(['DONE nothing to do']) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.equal(ext.created.length, 1, 'a conversation should be created for the run');
  assert.equal(ext.created[0].temporary, true, 'a run should not land in chat history');
  assert.equal(ext.chats.at(-1).conversationId, 'M5uhmgOBsPk0v4WN', 'the run must use the conversation it created');
  assert.equal(ext.chats.at(-1).temporary, true);
  assert.match(out, /\(new, temporary\)/);
});

test('--permanent keeps the run in the account\'s chat history', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(['DONE nothing to do']) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--permanent']);
  assert.equal(ext.created.length, 1);
  assert.ok(!ext.created[0].temporary);
  const fresh = ext.created[0].requestId.replace(/-/g, '').slice(0, 16);
  assert.equal(ext.chats.at(-1).conversationId, fresh, 'the run must use the conversation it created');
  assert.match(out, /\(new\)/);
});

test('--reuse continues the most recent conversation instead', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(['DONE nothing to do']) }).connect();
  t.after(() => ext.disconnect());

  await fetch(`${bridge.base}/config`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conversation: null }),
  });
  const { out } = await agent(dir, ['--reuse']);
  assert.equal(ext.created.length, 0, 'nothing should be created');
  assert.equal(ext.chats.at(-1).conversationId, 'aaaa1111aaaa1111');
  assert.match(out, /reusing the most recent/);
});

test('--conversation pins an explicit one', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(['DONE nothing to do']) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--conversation', '1234abcd1234abcd']);
  assert.equal(ext.created.length, 0);
  assert.equal(ext.chats.at(-1).conversationId, '1234abcd1234abcd');
  assert.match(out, /continuing/);
});

test('html comments survive a comment-blocking edge and restore on disk', async (t) => {
  const original = '<!-- BEGIN:nextjs-agent-rules -->\n# Rules\nsome prose here\n<!-- END:nextjs-agent-rules -->\n';
  const dir = tempDir({ 'AGENTS.md': original });
  const handler = scripted([
    'NEED file AGENTS.md',
    'EDIT AGENTS.md\nFIND\n# Rules\nNEW\n# Project Rules\nEND',
    'DONE read and tweaked it',
  ], {
    reject: (t) => t.includes('<!--'),   // the edge refuses any HTML comment, as observed
  });
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--apply']);
  assert.match(out, /✓ read AGENTS\.md/);
  assert.match(out, /✓ read and tweaked it/);

  const sent = handler.sent.join('\n');
  assert.doesNotMatch(sent, /<!--/, 'no HTML comment may reach the edge');
  assert.match(sent, /CMT-OPEN/, 'it is neutralised, not dropped');

  // bytes on disk = the original with only the intended edit applied
  assert.equal(
    fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'),
    original.replace('# Rules', '# Project Rules'),
  );
});

test('--slim drops the built-in preamble and sends only the task', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const handler = scripted(['DONE nothing needed']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--slim', '--reuse']);
  const first = handler.sent[0];
  assert.doesNotMatch(first, /NEED file README\.md/, 'the instruction block must be gone');
  assert.doesNotMatch(first, /you write the lines/i);
  assert.match(first, /Task:/);
  assert.match(first, /a\.txt/, 'the listing is still there');
  assert.ok(Buffer.byteLength(first) < 200, `slim first message should be small, was ${Buffer.byteLength(first)}`);
});

test('--watch runs a follow-up task on the same conversation', async (t) => {
  const dir = tempDir({ 'a.txt': 'one' });
  // Each task: one read then DONE. Same handler serves both tasks in sequence.
  let turn = 0;
  const replies = ['NEED file a.txt', 'DONE first task', 'NEED file a.txt', 'DONE second task'];
  const convIds = [];
  const ext = await new FakeExtension(bridge.base, {
    onChat: async (job, e) => {
      if (job.text === 'Hello.' || job.text === 'Starting a new working session.') { await e.text('hi'); return void e.done(); }
      convIds.push(job.conversationId);
      await e.text(replies[Math.min(turn++, replies.length - 1)]);
      await e.done();
    },
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--reuse', '--watch'], { stdin: [[400, 'look again\n']] });
  assert.match(out, /✓ first task/);
  assert.match(out, /watching/);
  assert.match(out, /✓ second task/, 'the follow-up task must run');
  // every chat turn hit the same conversation
  assert.equal(new Set(convIds).size, 1, 'watch must stay in one conversation');
});

test('--assistant binds the created conversation and implies slim', async (t) => {
  const dir = tempDir({ 'a.txt': 'x' });
  const ext = await new FakeExtension(bridge.base, { onChat: scripted(['DONE nothing to do']) }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--assistant', 'asst_abc123']);
  assert.equal(ext.created.length, 1);
  assert.equal(ext.created[0].assistant, 'asst_abc123', 'the create job carries the assistant id');
  assert.equal(ext.created[0].assistantField, 'aiAssistantId', 'and the configured field name');
  // implies slim: the heavy preamble must be gone
  const firstTask = ext.chats.find((c) => c.text.includes('Task:'));
  assert.ok(firstTask, 'a task message was sent');
  assert.doesNotMatch(firstTask.text, /you write the lines/i);
});

test('read shows line numbers and pages a long file with a range hint', async (t) => {
  const body = Array.from({ length: 600 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const dir = tempDir({ 'big.txt': body });
  const handler = scripted(['NEED file big.txt', 'NEED file big.txt 300-305', 'DONE looked']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  const firstResult = handler.sent[1];    // the result of the first read is in turn 2's message
  assert.match(firstResult, /1 \| line 1/, 'line numbers present');
  assert.match(firstResult, /more line\(s\)\. To see them: NEED file big\.txt 251-/, 'range hint present');
  assert.doesNotMatch(firstResult, /line 300/, 'a long file is not dumped whole');

  const rangeResult = handler.sent[2];     // the result of the ranged read
  assert.match(rangeResult, /300 \| line 300/);
  assert.match(rangeResult, /305 \| line 305/);
  assert.doesNotMatch(rangeResult, /299 \| line 299/, 'range is respected');
});

test('edit refuses an ambiguous match instead of corrupting the wrong line', async (t) => {
  const dir = tempDir({ 'code.js': 'const a = 1;\nfoo();\nconst a = 1;\n' });
  const ext = await new FakeExtension(bridge.base, {
    onChat: scripted(['EDIT code.js\nFIND\nconst a = 1;\nNEW\nconst a = 2;\nEND', 'DONE tried']),
  }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir, ['--apply']);
  assert.match(out, /appears 2 times/);
  assert.equal(fs.readFileSync(path.join(dir, 'code.js'), 'utf8'), 'const a = 1;\nfoo();\nconst a = 1;\n', 'nothing changed');
});

test('edit tolerates line-number gutters copied into FIND', async (t) => {
  const dir = tempDir({ 'code.js': 'export function greet(name) {\n  return `hi ${name}`;\n}\n' });
  const ext = await new FakeExtension(bridge.base, {
    // the model copies the gutter it saw in read output straight into FIND
    onChat: scripted(['EDIT code.js\nFIND\n  2 |   return `hi ${name}`;\nNEW\n  return `hello ${name}`;\nEND', 'DONE done'], {}),
  }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--apply']);
  assert.equal(
    fs.readFileSync(path.join(dir, 'code.js'), 'utf8'),
    'export function greet(name) {\n  return `hello ${name}`;\n}\n',
  );
});

test('SEARCH finds matches across the tree as file:line: excerpt', async (t) => {
  const dir = tempDir({
    'src/a.ts': 'const x = 1;\nexport const useThing = () => x;\n',
    'src/b.ts': 'import { useThing } from "./a";\nuseThing();\n',
    'README.md': 'nothing relevant here\n',
    'node_modules/pkg/index.js': 'useThing everywhere\n',   // must be skipped
  });
  const handler = scripted(['SEARCH useThing', 'DONE found them']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  const result = handler.sent[1];   // the SEARCH result is in the next message
  assert.match(result, /src\/a\.ts:2:/);
  assert.match(result, /src\/b\.ts:1:/);
  assert.match(result, /src\/b\.ts:2:/);
  assert.doesNotMatch(result, /node_modules/, 'skipped dirs are not searched');
  assert.doesNotMatch(result, /README/, 'non-matching files are not listed');
});

test('SEARCH reports cleanly when there are no matches', async (t) => {
  const dir = tempDir({ 'a.txt': 'hello world\n' });
  const handler = scripted(['SEARCH nonexistent_symbol', 'DONE none']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  const { out } = await agent(dir);
  assert.match(out, /✓ search/);
  assert.match(handler.sent[1], /no matches for "nonexistent_symbol"/);
});

test('the task text and preamble are encoded, so process.env never leaves raw', async (t) => {
  const dir = tempDir({ '.env': 'SECRET=1\n', 'app.js': 'const k = process.env.SECRET;\n' });
  // Model an edge that blocks any request containing ".env" (a real WAF pattern).
  const handler = scripted(['NEED file app.js', 'DONE looked at it'], {
    reject: (t) => /\.env/i.test(t),
  });
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  // The task itself mentions process.env — it must be encoded before sending.
  const { out } = await run(AGENT, [
    'List where app.js reads a process.env value', '--root', dir, '--bridge', bridge.base,
  ]);
  assert.match(out, /✓ looked at it/, 'the run completes despite the .env-blocking edge');
  const sent = handler.sent.join('\n');
  assert.doesNotMatch(sent, /process\.env/, 'process.env must never be sent raw');
  assert.doesNotMatch(sent, /\.env/, 'no bare .env may be sent raw either');
  assert.match(sent, /PROCESS-ENV/, 'it is encoded, not dropped');
});

test('the model can open a file whose name was encoded (.env → DOT-ENV)', async (t) => {
  const dir = tempDir({ '.env': 'TOKEN=abc\n' });
  // The model sees the encoded name in the listing and copies it back verbatim.
  const handler = scripted(['NEED file DOT-ENV', 'DONE read the env file']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await run(AGENT, ['read the env file', '--root', dir, '--bridge', bridge.base]);
  // the decode step turns DOT-ENV back into .env, so the real file is read
  const result = handler.sent[1];
  assert.match(result, /TOKEN=abc/, 'the real .env file was read and its contents returned (encoded)');
});

test('tag-shaped content passes a tag-blocking edge and restores byte-for-byte', async (t) => {
  const original = 'export default function Layout() {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n';
  const dir = tempDir({ 'layout.tsx': original });
  const handler = scripted([
    'NEED file layout.tsx',
    'EDIT layout.tsx\nFIND\n    <html lang="en">\nNEW\n    <html lang="th">\nEND',
    'DONE switched the language',
  ], {
    reject: (t) => /<[a-zA-Z/]/.test(t),   // the edge blocks any tag-opening <
  });
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--apply']);
  const sent = handler.sent.join('\n');
  assert.doesNotMatch(sent, /<[a-zA-Z/]/, 'no tag-opening < may reach the edge');
  assert.match(sent, /TAG-LT/, 'tags are encoded, not dropped');
  assert.equal(
    fs.readFileSync(path.join(dir, 'layout.tsx'), 'utf8'),
    original.replace('lang="en"', 'lang="th"'),
    'only the intended edit is applied; all other tags are intact',
  );
});

// Issue #32. `read` and `exists` both treat the overlay as reality, so a listing
// that ignores it tells the model its own write failed. The model then re-creates
// the file, doubts the tools, and talks itself into "I cannot reach your
// filesystem" — a belief that --watch then carries into every follow-up task.
test('a file the agent just wrote appears in its own directory listing', async (t) => {
  const dir = tempDir({ 'other.txt': 'x\n' });
  const handler = scripted([
    'CREATE hello.txt\nHello, world!\nEND\n\nNEED dir .',
    'DONE done',
  ]);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--apply']);
  const listing = handler.sent.at(-1);
  assert.match(listing, /hello\.txt/, 'the pending write must be visible');
  assert.match(listing, /other\.txt/, 'and the file already on disk still is');
});

test('a pending write in a new subdirectory shows the directory', async (t) => {
  const dir = tempDir({});
  const handler = scripted(['CREATE sub/deep.txt\nhi\nEND\n\nNEED dir .', 'DONE done']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--apply']);
  assert.match(handler.sent.at(-1), /sub\//, 'the parent directory is what the model can list next');
});

// Issue #31. Reading a PDF as text returned mojibake, and the model spent the
// whole run trying to interpret it — 519 credits in the report.
test('a binary file is refused with somewhere else to go, not read as text', async (t) => {
  const dir = tempDir({});
  fs.writeFileSync(path.join(dir, 'doc.pdf'), Buffer.from('%PDF-1.5\n%\xc7\xec\x8f\xa2\n', 'latin1'));
  fs.writeFileSync(path.join(dir, 'sheet.xlsx'), Buffer.from('PK\x03\x04\x14\x00\x00\x00', 'latin1'));
  const handler = scripted(['NEED file doc.pdf', 'NEED file sheet.xlsx', 'DONE stopping']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  const afterPdf = handler.sent[1];
  assert.match(afterPdf, /is a PDF file, not text/);
  assert.match(afterPdf, /--file doc\.pdf/, 'it must name the command that does work');
  assert.ok(!/%PDF/.test(afterPdf.split('doc.pdf is a PDF')[1] ?? ''), 'no raw bytes are forwarded');
  assert.match(handler.sent[2], /zip-based document/, 'an xlsx is named by what it is');
});

test('a text file that merely contains odd bytes is still readable', async (t) => {
  const dir = tempDir({ 'thai.txt': 'สวัสดีครับ\nบรรทัดที่สอง\n', 'code.js': 'const a = 1;\n' });
  const handler = scripted(['NEED file thai.txt', 'DONE ok']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir);
  assert.match(handler.sent.at(-1), /สวัสดีครับ/, 'UTF-8 text is not binary');
});

// The other half of issue #32: --watch continues the same conversation, so a
// follow-up inherited the model's earlier (wrong) conclusion that it could not
// reach the filesystem. A bare "New task:" gave it nothing to correct against.
test('a --watch follow-up re-states the frame and the current listing', async (t) => {
  const dir = tempDir({ 'a.txt': 'x\n' });
  const handler = scripted(['DONE nothing to do']);
  const ext = await new FakeExtension(bridge.base, { onChat: handler }).connect();
  t.after(() => ext.disconnect());

  await agent(dir, ['--watch'], { stdin: [[300, 'second task\n'], [400, 'exit\n']] });
  assert.ok(handler.sent.length >= 2, 'the follow-up task ran');
  const followUp = handler.sent.at(-1);
  assert.match(followUp, /New task: second task/);
  assert.match(followUp, /still open in front of me/, 'the frame is restated');
  assert.match(followUp, /a\.txt/, 'with ground truth to correct a drifted belief against');
});
