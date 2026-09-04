// A unified diff computed in-process, so `npm run agent` can show its edits on
// Windows too, where there is no `diff` binary to shell out to. Output follows
// the GNU shape — @@ headers, ' ' context, '-' gone, '+' added — which is what
// the printer in agent.mjs already colours.
const MAX_CELLS = 4_000_000; // ~16 MB of Int32 — the LCS table is (m+1)·(n+1)

// A trailing newline ends the last line; it does not begin an empty one. A file
// *without* one is what GNU marks, so the flag rides on the line it belongs to
// and takes part in equality: "b" and "b\n" are not the same last line, and GNU
// reports them as a replacement.
const toLines = (text) => {
  const s = String(text);
  if (s === '') return [];
  const lines = s.split('\n');
  const noEol = !s.endsWith('\n');
  if (!noEol) lines.pop();
  return lines.map((text, i) => ({ text, noEol: noEol && i === lines.length - 1 }));
};

const same = (p, q) => p.text === q.text && p.noEol === q.noEol;
const NO_EOL = '\\ No newline at end of file';

// Longest-common-subsequence walk over two line arrays, as keep/del/add ops.
function lcsOps(x, y) {
  const m = x.length;
  const n = y.length;
  // Past the cap a fine-grained diff is not worth its table; one replacement
  // hunk for the whole differing middle is still a readable, correct diff.
  if ((m + 1) * (n + 1) > MAX_CELLS) {
    return [
      ...x.map((line) => ({ t: '-', line })),
      ...y.map((line) => ({ t: '+', line })),
    ];
  }
  const w = n + 1;
  const dp = new Int32Array((m + 1) * w); // dp[i·w+j] = LCS of x[i:], y[j:]
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * w + j] = same(x[i], y[j])
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (same(x[i], y[j])) { ops.push({ t: ' ', line: x[i] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push({ t: '-', line: x[i] }); i++; }
    else { ops.push({ t: '+', line: y[j] }); j++; }
  }
  while (i < m) ops.push({ t: '-', line: x[i++] });
  while (j < n) ops.push({ t: '+', line: y[j++] });
  return ops;
}

// Each change becomes a window of ±`context` unchanged lines; windows that
// overlap or touch are merged, the same coalescing GNU diff does, so a dense
// edit does not become one hunk per line.
function windows(entries, context) {
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].t === ' ') continue;
    const from = Math.max(0, i - context);
    const to = Math.min(entries.length, i + context + 1);
    const last = out.at(-1);
    if (last && from <= last.to) last.to = Math.max(last.to, to);
    else out.push({ from, to });
  }
  return out;
}

export function unifiedDiff(aText, bText, { context = 3 } = {}) {
  const a = toLines(aText);
  const b = toLines(bText);

  // The common head and tail never appear in the diff, so the LCS only has to
  // cover the differing middle — usually a handful of lines.
  let start = 0;
  while (start < a.length && start < b.length && same(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) { endA--; endB--; }

  const middle = lcsOps(a.slice(start, endA), b.slice(start, endB));
  if (!middle.some((op) => op.t !== ' ')) return '';

  const entries = [
    ...a.slice(0, start).map((line) => ({ t: ' ', line })),
    ...middle,
    ...a.slice(endA).map((line) => ({ t: ' ', line })),
  ];

  const parts = [];
  for (const { from, to } of windows(entries, context)) {
    // Line numbers of the hunk start, walked from the top of the file.
    let aLine = 1;
    let bLine = 1;
    for (let k = 0; k < from; k++) {
      if (entries[k].t !== '+') aLine++;
      if (entries[k].t !== '-') bLine++;
    }
    const slice = entries.slice(from, to);
    const aCount = slice.filter((e) => e.t !== '+').length;
    const bCount = slice.filter((e) => e.t !== '-').length;
    // A side with no lines anchors its number to the line before the hunk.
    const aStart = aCount ? aLine : aLine - 1;
    const bStart = bCount ? bLine : bLine - 1;
    // GNU prints the marker on the line that lacks the newline, which is always
    // the last of its side — so it follows that line rather than the hunk.
    const rendered = slice.flatMap((e) =>
      e.line.noEol ? [`${e.t}${e.line.text}`, NO_EOL] : [`${e.t}${e.line.text}`]);
    // A range of exactly one line is written without its count, which is the
    // unified-diff convention GNU follows.
    const range = (start, count) => (count === 1 ? `${start}` : `${start},${count}`);
    parts.push(`@@ -${range(aStart, aCount)} +${range(bStart, bCount)} @@\n` + rendered.join('\n'));
  }
  return parts.join('\n');
}
