import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSpan, normalizeDate } from '../src/dates.ts';
import { bucketCommitsByDate, parseGitLog } from '../src/git.ts';
import { isBugfixMessage, normalizeGitPath } from '../src/signals.ts';

test('parses numstat, renames, quoted paths, and skips binaries', () => {
  const raw = [
    '\x1eabc\x1f2024-03-04T15:00:00Z\x1fMira Chen\x1fmira@lumen.dev\x1ffeat: start',
    '10\t1\tsrc/a.ts',
    '-\t-\tassets/logo.png',
    '4\t0\tnode_modules/left-pad/index.js',
    '',
    '\x1edef\x1f2024-04-02T15:00:00+00:00\x1fJonas Adler\x1fjonas@lumen.dev\x1ffix: crash in parser',
    '3\t4\tsrc/{old.ts => new.ts}',
    '1\t0\t"docs/my file.md"',
  ].join('\n');
  const commits = parseGitLog(raw);
  assert.equal(commits.length, 2);
  assert.equal(commits[0]?.subject, 'feat: start');
  assert.deepEqual(commits[0]?.files, [{ path: 'src/a.ts', additions: 10, deletions: 1 }]);
  assert.equal(commits[1]?.date, '2024-04-02T15:00:00Z');
  assert.equal(commits[1]?.files[0]?.path, 'src/new.ts');
  assert.equal(commits[1]?.files[1]?.path, 'docs/my file.md');
});

test('normalizes brace renames and dates', () => {
  assert.equal(normalizeGitPath('src/{old name => new name}.ts'), 'src/new name.ts');
  assert.equal(normalizeGitPath('a.ts => b.ts'), 'b.ts');
  assert.equal(normalizeDate('2024-03-04T15:00:00+00:00'), '2024-03-04T15:00:00Z');
  assert.equal(formatSpan('2024-03-04T15:00:00Z', '2024-03-04T18:00:00Z'), '4 Mar 2024');
  assert.equal(formatSpan('2024-03-04T15:00:00Z', '2024-03-18T15:00:00Z'), '4–18 Mar 2024');
});

test('bug-fix subjects are meteorological rain, feature subjects are not', () => {
  assert.equal(isBugfixMessage('fix: rotate files before the handle closes'), true);
  assert.equal(isBugfixMessage('Fix crash'), true);
  assert.equal(isBugfixMessage('hotfix: stop the leak'), true);
  assert.equal(isBugfixMessage('feat: rotate files when they pass a size cap'), false);
  assert.equal(isBugfixMessage('docs: correct the rotation example'), false);
  assert.equal(isBugfixMessage('chore: refresh fixtures'), false);
});

test('date buckets keep order and include the last commit', () => {
  const commits = Array.from({ length: 10 }, (_, index) => ({
    date: new Date(Date.UTC(2024, 0, 1 + index * 3)).toISOString(),
  }));
  const frames = bucketCommitsByDate(commits, 4);
  assert.equal(frames.length, 4);
  assert.equal(frames[0]?.[0]?.date, commits[0]?.date);
  assert.equal(frames.at(-1)?.at(-1)?.date, commits.at(-1)?.date);
  assert.equal(
    frames.reduce((sum, frame) => sum + frame.length, 0),
    10,
  );
});
