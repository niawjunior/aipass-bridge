#!/usr/bin/env node
// Create the custom assistant the file-editing agent binds to, instead of
// filling in a web form and pasting a thousand characters by hand.
//
//   npm run setup-assistant
import { ASSISTANT_CHARACTER } from './assistant-prompt.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`usage: npm run setup-assistant [-- options]

  --name NAME     assistant name        (default: Local File Coder)
  --model ID      model it runs on      (default: claude-sonnet-5@default)
  --force         create another even if one by this name exists
  --start-chat    open a conversation bound to it and point the bridge at it
  --delete ID     remove an assistant, then stop
  --bridge URL    bridge base URL       (default: http://127.0.0.1:8787)

Creates the assistant that carries the agent's tool protocol, so runs do not
resend it. Prints the id to put in AIPASS_ASSISTANT_ID.`);
  process.exit(0);
}

const BRIDGE = (flag('bridge', process.env.AIPASS_BRIDGE ?? 'http://127.0.0.1:8787')).replace(/\/+$/, '');
const NAME = flag('name', 'Local File Coder');
const MODEL = flag('model', 'claude-sonnet-5@default');
const FORCE = argv.includes('--force');
const START_CHAT = argv.includes('--start-chat');
const DELETE = flag('delete', null);

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const status = await fetch(`${BRIDGE}/status`).then((r) => r.json()).catch(() => null);
if (!status) {
  console.error(red(`No bridge at ${BRIDGE}. Start it with: npm run dev`));
  process.exit(1);
}
if (!status.extensions) {
  console.error(red('The extension is not connected. Open a https://de.aipass.net/chat tab.'));
  process.exit(1);
}

if (DELETE) {
  const gone = await fetch(`${BRIDGE}/assistants/${encodeURIComponent(DELETE)}`, { method: 'DELETE' })
    .then((r) => r.json()).catch((err) => ({ error: { message: String(err.message) } }));
  if (gone?.error) {
    console.error(red(`could not delete it: ${gone.error.message}`));
    process.exit(1);
  }
  console.log(green(`✓ deleted  ${gone.deleted}`));
  process.exit(0);
}

// Binding a conversation is the step that used to mean opening the web UI and
// copying an id out of the address bar.
const bind = async (assistantId) => {
  const bound = await fetch(`${BRIDGE}/assistants/${encodeURIComponent(assistantId)}/chat`, { method: 'POST' })
    .then((r) => r.json()).catch((err) => ({ error: { message: String(err.message) } }));
  if (bound?.error) {
    console.error(red(`\ncould not start a bound chat: ${bound.error.message}`));
    return null;
  }
  return bound.conversation;
};

// Making a second assistant by the same name is easy to do by accident and
// leaves the account cluttered, so an existing one is reported rather than
// duplicated.
const existing = await fetch(`${BRIDGE}/assistants`).then((r) => r.json()).catch(() => null);
const match = existing?.assistants?.find((a) => a.name === NAME);
if (match && !FORCE) {
  console.log(`${bold('already there')}  ${match.name}  ${match.id}`);
  if (START_CHAT) {
    const conversation = await bind(match.id);
    if (conversation) console.log(green(`✓ bound conversation  ${conversation}`));
  }
  console.log(dim('\nNothing to do. Pass --force to make another anyway.\n'));
  console.log(`  export AIPASS_ASSISTANT_ID=${match.id}`);
  process.exit(0);
}

console.log(`${bold('creating')}  ${NAME}  ${dim(`on ${MODEL}, ${ASSISTANT_CHARACTER.length} characters of protocol`)}`);

const made = await fetch(`${BRIDGE}/assistants`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: NAME,
    detail: 'แก้ไขไฟล์ในเครื่องผ่าน bridge ด้วยคำสั่ง NEED / SEARCH / EDIT / CREATE / DONE',
    character: ASSISTANT_CHARACTER,
    type: flag('type', 'conversation'),
    model: MODEL,
    tags: ['coding', 'local-files'],
  }),
}).then((r) => r.json()).catch((err) => ({ error: { message: String(err.message) } }));

if (made?.error) {
  console.error(red(`\ncould not create it: ${made.error.message}`));
  process.exit(1);
}

console.log(green(`\n✓ created  ${made.id}`));

if (START_CHAT) {
  const conversation = await bind(made.id);
  if (conversation) {
    console.log(green(`✓ bound conversation  ${conversation}`));
    console.log(dim('  the bridge is now pointed at it'));
  }
}
console.log(dim('\nPoint the agent at it — either per run:\n'));
console.log(`  npm run agent -- "your task" --root . --assistant ${made.id}`);
console.log(dim('\nor once, for every run:\n'));
console.log(`  export AIPASS_ASSISTANT_ID=${made.id}`);
