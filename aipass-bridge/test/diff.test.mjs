// Unit tests for the in-process unified diff. Where the `diff` binary exists
// (CI, Linux/macOS) its output is the reference; Windows runs the same cases
// without the cross-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unifiedDiff } from '../difflib.mjs';

// Just the body lines: ' ' context, '-' gone, '+' added — no @@ headers or
// file headers, whose exact formatting GNU is free to vary.
const bodyLines = (diff) => diff.split('\n').filter((l) => /^[ +-]./.test(l) && !/^[+-]{3}/.test(l));

const hasGnuDiff = (() => {
  try { execFileSync('diff', ['--version']); return true; } catch { return false; }
})();

const gnuDiff = (a, b) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'difflib-'));
  const fa = path.join(dir, 'a');
  const fb = path.join(dir, 'b');
  fs.writeFileSync(fa, a);
  fs.writeFileSync(fb, b);
  try {
    return execFileSync('diff', ['-U3', fa, fb], { encoding: 'utf8' });
  } catch (err) {
    return String(err.stdout ?? ''); // exit 1 means "files differ" — output intact
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test('identical input produces no diff', () => {
  assert.equal(unifiedDiff('same\ntext\n', 'same\ntext\n'), '');
  assert.equal(unifiedDiff('', ''), '');
});

test('a changed line keeps its context and its position markers', () => {
  const before = 'one\ntwo\nthree\nfour\nfive';
  const after = 'one\ntwo\nTHREE\nfour\nfive';
  const diff = unifiedDiff(before, after);
  assert.match(diff, /@@ -1,5 \+1,5 @@/);
  assert.deepEqual(bodyLines(diff), [' one', ' two', '-three', '+THREE', ' four', ' five']);
});

test('an addition and a deletion are both reported', () => {
  assert.deepEqual(bodyLines(unifiedDiff('a\nb\nc', 'a\nc')), [' a', '-b', ' c']);
  assert.deepEqual(bodyLines(unifiedDiff('a\nc', 'a\nb\nc')), [' a', '+b', ' c']);
});

test('changes far apart become two hunks, not one giant one', () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
  const after = [...before];
  after[1] = 'changed';
  after[18] = 'also changed';
  const diff = unifiedDiff(before.join('\n'), after.join('\n'));
  const headers = diff.match(/^@@.*$/gm) ?? [];
  assert.equal(headers.length, 2, 'two separate changes, two hunks');
  assert.deepEqual(bodyLines(diff), [
    ' line 1', '-line 2', '+changed', ' line 3', ' line 4', ' line 5',
    ' line 16', ' line 17', ' line 18', '-line 19', '+also changed', ' line 20',
  ]);
});

test('a new file is one all-additions hunk, an emptied file all deletions', () => {
  assert.deepEqual(bodyLines(unifiedDiff('', 'brand\nnew')), ['+brand', '+new']);
  assert.deepEqual(bodyLines(unifiedDiff('gone\nnow', '')), ['-gone', '-now']);
});

test('GNU diff, where present, agrees on the body', { skip: !hasGnuDiff }, () => {
  const cases = [
    ['one\ntwo\nthree\nfour\nfive', 'one\ntwo\nTHREE\nfour\nfive'],
    ['a\nb\nc\nd\ne\nf\ng\nh', 'a\nX\nc\nd\ne\nf\ng\nY'],
    ['only\nold', ''],
    ['same head\nx\ny\nz\ntail', 'same head\nx\nQ\nz\ntail'],
  ];
  for (const [a, b] of cases) {
    assert.deepEqual(bodyLines(unifiedDiff(a, b)), bodyLines(gnuDiff(a, b)), `a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
  }
});

// A trailing newline terminates the last line rather than starting an empty
// one. Getting this wrong put a phantom blank line on the end of every diff and
// inflated the @@ counts by one — invisible to a bodyLines cross-check, because
// `/^[ +-]./` needs a character after the marker and so drops an empty +/- line.
test('a trailing newline is not an extra line', () => {
  const diff = unifiedDiff('', 'one\ntwo\nthree\n');
  assert.match(diff, /@@ -0,0 \+1,3 @@/, 'three lines added, not four');
  assert.equal(diff.split('\n').filter((l) => l === '+').length, 0, 'no phantom blank line');
});

test('a missing trailing newline is marked the way GNU marks it', () => {
  const diff = unifiedDiff('one\ntwo', 'one\nTWO');
  assert.match(diff, /\\ No newline at end of file/);
});

test('adding only a trailing newline is a change, not a no-op', () => {
  const diff = unifiedDiff('a\nb', 'a\nb\n');
  assert.notEqual(diff, '', 'the files differ and the diff must say so');
  assert.deepEqual(bodyLines(diff), [' a', '-b', '+b']);
});

test('a one-line range omits its count, as the format requires', () => {
  assert.match(unifiedDiff('a\n', ''), /@@ -1 \+0,0 @@/);
  assert.match(unifiedDiff('', 'a\n'), /@@ -0,0 \+1 @@/);
});

test('blank lines inside a file are real lines', () => {
  assert.deepEqual(bodyLines(unifiedDiff('a\n\n\nb\n', 'a\n\nb\n')).filter((l) => l.trim()), [' a', ' b']);
  assert.match(unifiedDiff('a\n\n\nb\n', 'a\n\nb\n'), /^-$/m, 'the removed blank line is shown');
});

if (hasGnuDiff) {
  test('matches GNU byte for byte on the shapes that bit us', () => {
    const body = (s) => s.split('\n').filter((l) => !/^(---|\+\+\+)/.test(l)).join('\n').trim();
    for (const [a, b] of [
      ['', 'one\ntwo\nthree\n'], ['one\ntwo\nthree\n', ''],
      ['a\nb', 'a\nb\n'], ['a\nb\n', 'a\nb'], ['x', ''],
      ['a\nb\nc\n', 'a\nB\nc\n'],
    ]) {
      assert.equal(body(unifiedDiff(a, b)), body(gnuDiff(a, b)),
        `differs from GNU for ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    }
  });
}
