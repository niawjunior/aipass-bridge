import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge, FakeExtension, run, waitFor } from './harness.mjs';
import { ASSISTANT_CHARACTER } from '../assistant-prompt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SETUP = path.join(here, '..', 'setup-assistant.mjs');

let bridge;
before(async () => { bridge = await startBridge(); });
after(() => bridge.stop());

const post = (body) => fetch(`${bridge.base}/assistants`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const valid = {
  name: 'Local File Coder', detail: 'edits local files', character: ASSISTANT_CHARACTER,
  type: 'conversation', model: 'claude-sonnet-5@default', tags: ['coding'],
};

// The prompt someone pastes by hand and the one the script installs have to be
// the same text, or the documented setup quietly stops matching the automated one.
test('the README block and the shipped prompt are the same text', () => {
  const readme = fs.readFileSync(path.join(here, '..', 'README.md'), 'utf8');
  const m = readme.match(/max 1000 characters — this is (\d+)\):\n\n```\n([\s\S]*?)\n```/);
  assert.ok(m, 'the README still documents the prompt in a fenced block');
  assert.equal(m[2], ASSISTANT_CHARACTER, 'README block has drifted from assistant-prompt.mjs');
  assert.equal(Number(m[1]), ASSISTANT_CHARACTER.length, 'the character count in the prose is stale');
  assert.ok(ASSISTANT_CHARACTER.length <= 1000, 'the form refuses anything longer');
});

test('the fields the form requires are checked before anything is created', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  for (const [field, body] of [
    ['name', { ...valid, name: '' }],
    ['detail', { ...valid, detail: '' }],
    ['character', { ...valid, character: '' }],
    ['type', { ...valid, type: '' }],
    ['model', { ...valid, model: '' }],
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400, `${field} must be required`);
    assert.match((await r.json()).error.message, new RegExp(field));
  }
  const noTags = await post({ ...valid, tags: [] });
  assert.equal(noTags.status, 400);
  assert.match((await noTags.json()).error.message, /tag/);

  assert.equal(ext.assistants.length, 0, 'a rejected spec must not reach the account');
});

test('the length caps the form enforces are enforced here too', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  for (const [field, body] of [
    ['name', { ...valid, name: 'x'.repeat(101) }],
    ['detail', { ...valid, detail: 'x'.repeat(201) }],
    ['character', { ...valid, character: 'x'.repeat(1001) }],
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400, `${field} cap`);
    assert.match((await r.json()).error.message, new RegExp(field));
  }
  assert.equal(ext.assistants.length, 0);
});

test('a valid spec reaches the extension with the fields the form posts', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const body = await (await post(valid)).json();
  assert.equal(body.id, 'asst_fake_1');
  const job = ext.assistants.at(-1);
  assert.equal(job.name, 'Local File Coder');
  assert.equal(job.character, ASSISTANT_CHARACTER);
  assert.equal(job.type, 'conversation');
  assert.equal(job.model, 'claude-sonnet-5@default');
  assert.deepEqual(job.tags, ['coding']);
});

test('setup-assistant reports an existing one instead of making a second', async (t) => {
  const ext = await new FakeExtension(bridge.base, {
    assistants: [{ id: 'asst_existing', name: 'Local File Coder', model: 'claude-sonnet-5@default' }],
  }).connect();
  t.after(() => ext.disconnect());

  const { out, code } = await run(SETUP, ['--bridge', bridge.base]);
  assert.equal(code, 0);
  assert.match(out, /already there/);
  assert.match(out, /asst_existing/);
  assert.equal(ext.assistants.length, 0, 'nothing was created');
});

test('setup-assistant creates one and prints how to use it', async (t) => {
  const ext = await new FakeExtension(bridge.base).connect();
  t.after(() => ext.disconnect());

  const { out, code } = await run(SETUP, ['--bridge', bridge.base]);
  assert.equal(code, 0);
  assert.match(out, /created  asst_fake_1/);
  assert.match(out, /AIPASS_ASSISTANT_ID=asst_fake_1/);
  assert.equal(ext.assistants.at(-1).character, ASSISTANT_CHARACTER);
});
