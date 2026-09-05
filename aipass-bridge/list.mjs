#!/usr/bin/env node
// Small printers for the npm scripts. These used to be `node -e "…"` one
// liners in package.json, which is a code-execution shape that upstream
// filters reject when the agent reads its own package.json back.
const BRIDGE = (process.env.AIPASS_BRIDGE ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const argv = process.argv.slice(2);
const what = argv[0] ?? 'models';

// `npm run models -- --help` lands the flag after the subcommand, so look
// anywhere rather than only at the first word.
if (argv.some((a) => ['--help', '-h', 'help'].includes(a))) {
  console.log(`usage: npm run models | npm run conversations | npm run credits

  models [kind]  list models by category; kind narrows it (chat, research,
                 image, video, music)
  styles         video style presets, and what each provider will accept
  conversations  list conversations, marking the one in use
  credits        how much of the credit pool is left

  AIPASS_BRIDGE  bridge base URL (default: http://127.0.0.1:8787)

Each is a thin wrapper over: node aipass-bridge/list.mjs <what>`);
  process.exit(0);
}

const dim = (t) => `\x1b[2m${t}\x1b[0m`;

const get = async (p) => {
  const res = await fetch(`${BRIDGE}${p}`);
  if (!res.ok) throw new Error(`bridge returned ${res.status}`);
  return res.json();
};

try {
  if (what === 'styles') {
    // The presets a video model accepts, plus what each provider is served —
    // all of it read from the app's own loaders rather than hardcoded here.
    const { styles, byProvider } = await get('/video-options?refresh=1');
    if (!styles.length) {
      console.log('no styles returned — is a de.aipass.net tab open?');
    } else {
      console.log('\nวิดีโอสไตล์ · video styles\n');
      for (const v of styles) {
        console.log(`  ${v.name.padEnd(22)} ${v.nameTh ?? ''}`);
        console.log(`  ${' '.repeat(22)} ${dim(v.preprompt.slice(0, 84))}${v.preprompt.length > 84 ? '…' : ''}`);
      }
      console.log(`\nUse the name: npm run chat -- --style ${JSON.stringify(styles[0].name)}\n`);
    }
    const st = await get('/style-options?refresh=1');
    if (st.imageStyles.length) {
      console.log('\nรูปภาพสไตล์ · image styles');
      console.log('  ' + st.imageStyles.map((v) => v.name).join(' · '));
    }
    if (st.tones.length) {
      console.log('\nโทนคำตอบ · tone      ' + st.tones.map((v) => v.code).join(' · '));
      console.log('รูปแบบคำตอบ · format  ' + st.formats.map((v) => v.code).join(' · '));
    }
    console.log('\nวิดีโอ · what each video provider accepts\n');
    for (const [provider, o] of Object.entries(byProvider)) {
      const parts = [
        o.resolutions.length ? `resolution ${o.resolutions.join('/')}` : '',
        o.durations.length ? `duration ${o.durations.join('/')}s` : '',
        o.aspectRatios.length ? `ratio ${o.aspectRatios.join(' ')}` : '',
      ].filter(Boolean);
      if (parts.length) console.log(`  ${provider.padEnd(10)} ${parts.join('  ·  ')}`);
    }
    console.log();
  } else if (what === 'models') {
    // The web UI groups these into tabs; the loader sends no category, so the
    // bridge derives one and this prints in the same order the tabs run.
    const want = argv[1] && !argv[1].startsWith('-') ? argv[1] : '';
    const { data } = await get(`/v1/models${want ? `?kind=${encodeURIComponent(want)}` : ''}`);
    const LABELS = {
      chat: 'สนทนา · chat',
      research: 'ค้นคว้าเชิงลึก · deep research',
      image: 'สร้างรูปภาพ · image',
      video: 'สร้างวิดีโอ · video',
      music: 'สร้างเพลง · music',
    };
    const order = ['chat', 'research', 'image', 'video', 'music'];
    const kinds = order.filter((k) => data.some((m) => m.kind === k))
      .concat([...new Set(data.map((m) => m.kind))].filter((k) => !order.includes(k)));

    for (const kind of kinds) {
      const group = data.filter((m) => m.kind === kind);
      console.log(`\n${LABELS[kind] ?? kind}  (${group.length})`);
      for (const m of group) {
        console.log(`  ${m.id.padEnd(42)} ${m.name ?? ''}${m.free_credit ? '  [free]' : ''}${m.is_default ? '  [default]' : ''}`);
      }
    }
    console.log(`\n${data.length} model(s).`);
  } else if (what === 'conversations') {
    const { current, conversations } = await get('/conversations');
    for (const c of conversations) {
      console.log(`${c.id === current ? '*' : ' '} ${c.id}  ${c.updatedAt?.slice(0, 16) ?? ''}  ${c.title ?? ''}`);
    }
    if (!conversations.length) console.log('none — start a chat at https://de.aipass.net/chat');
  } else if (what === 'credits') {
    const q = await get('/quota');
    const n = (v) => v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 });
    const pct = q.limit ? Math.round((q.available / q.limit) * 100) : 0;
    console.log(`${n(q.available)} of ${n(q.limit)} credits left  (${pct}%)`);
    console.log(`used ${n(q.used)}${q.periodEndsAt ? `  ·  resets ${q.periodEndsAt.slice(0, 10)}` : ''}`);
    if (q.video) console.log(`video ${q.video.remaining} of ${q.video.limit} left this ${q.video.period}`);
  } else {
    console.error(`unknown: ${what}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`${err.message} — is the bridge running? npm run dev`);
  process.exit(1);
}
