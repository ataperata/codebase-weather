import { spawnSync } from 'node:child_process';
import { normalizeDate } from './dates.ts';
import { normalizeGitPath, shouldIgnorePath } from './signals.ts';

export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
}

export interface RawCommit {
  hash: string;
  date: string;
  authorName: string;
  authorEmail: string;
  subject: string;
  files: FileChange[];
}

export type HeadBlob = { text: string } | { kind: 'binary' } | { kind: 'missing' } | { kind: 'huge' };

const MAX_BLOB = 400_000;

export function assertGitRepo(repo: string): void {
  const result = spawnSync('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.stdout.trim() !== 'true') {
    throw new Error(`${repo} is not a git repository`);
  }
}

export function commitCount(repo: string): number {
  const result = spawnSync('git', ['--no-pager', '-C', repo, 'rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return 0;
  const count = Number(result.stdout.trim());
  return Number.isFinite(count) ? count : 0;
}

export function readGitLog(repo: string, maxCommits: number): RawCommit[] {
  const result = spawnSync(
    'git',
    [
      '--no-pager',
      '-C',
      repo,
      'log',
      '-n',
      String(maxCommits),
      '--numstat',
      '--pretty=format:%x1e%H%x1f%aI%x1f%an%x1f%ae%x1f%s',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw new Error(`git log failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || 'git log failed');
  const commits = parseGitLog(result.stdout);
  commits.reverse();
  return commits;
}

export function parseGitLog(raw: string): RawCommit[] {
  const commits: RawCommit[] = [];
  for (const chunk of raw.split('\x1e')) {
    const trimmed = chunk.replace(/^\n+/, '');
    if (!trimmed.trim()) continue;
    const newline = trimmed.indexOf('\n');
    const header = newline === -1 ? trimmed.trim() : trimmed.slice(0, newline).trim();
    const body = newline === -1 ? '' : trimmed.slice(newline + 1);
    const parts = header.split('\x1f');
    if (parts.length < 5) continue;
    const hash = parts[0] ?? '';
    const date = normalizeDate(parts[1] ?? '');
    const authorName = parts[2] ?? '';
    const authorEmail = parts[3] ?? '';
    const subject = parts.slice(4).join('\x1f');
    const files: FileChange[] = [];
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      const bits = line.split('\t');
      if (bits.length < 3) continue;
      const additionsText = bits[0] ?? '';
      const deletionsText = bits[1] ?? '';
      if (additionsText === '-' || deletionsText === '-') continue;
      const additions = Number(additionsText);
      const deletions = Number(deletionsText);
      if (!Number.isFinite(additions) || !Number.isFinite(deletions)) continue;
      const filePath = normalizeGitPath(bits.slice(2).join('\t'));
      if (!filePath || filePath.includes('\n') || shouldIgnorePath(filePath)) continue;
      files.push({ path: filePath, additions, deletions });
    }
    if (!hash) continue;
    commits.push({ hash, date, authorName, authorEmail, subject, files });
  }
  return commits;
}

export function listHeadFiles(repo: string): string[] {
  const result = spawnSync('git', ['-C', repo, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed');
  return result.stdout.split('\0').filter((filePath) => filePath.length > 0 && !filePath.includes('\n'));
}

export function readHeadBlobs(repo: string, paths: string[]): Map<string, HeadBlob> {
  const out = new Map<string, HeadBlob>();
  if (paths.length === 0) return out;
  const input = `${paths.map((filePath) => `HEAD:${filePath}`).join('\n')}\n`;
  const result = spawnSync('git', ['-C', repo, 'cat-file', '--batch'], {
    input,
    maxBuffer: 80 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString() || 'git cat-file failed');
  }
  const buffer = result.stdout as Buffer;
  let offset = 0;
  for (const filePath of paths) {
    const newline = buffer.indexOf(0x0a, offset);
    if (newline < 0) throw new Error(`truncated cat-file header for ${filePath}`);
    const header = buffer.toString('utf8', offset, newline);
    offset = newline + 1;
    if (header.endsWith(' missing')) {
      out.set(filePath, { kind: 'missing' });
      continue;
    }
    const size = Number(header.split(' ').pop());
    if (!Number.isFinite(size) || size < 0) throw new Error(`bad cat-file header: ${header}`);
    const end = offset + size;
    if (end > buffer.length) throw new Error(`truncated cat-file blob for ${filePath}`);
    if (size > MAX_BLOB) {
      out.set(filePath, { kind: 'huge' });
    } else {
      const bytes = buffer.subarray(offset, end);
      out.set(filePath, classifyBlob(bytes));
    }
    offset = end;
    if (buffer[offset] === 0x0a) offset += 1;
  }
  return out;
}

function classifyBlob(bytes: Buffer): HeadBlob {
  const probe = Math.min(bytes.length, 8000);
  for (let index = 0; index < probe; index += 1) {
    if (bytes[index] === 0) return { kind: 'binary' };
  }
  return { text: bytes.toString('utf8') };
}

export function bucketCommits<T>(commits: T[], target: number): T[][] {
  if (commits.length === 0) return [];
  const frames = Math.max(1, Math.min(target, commits.length));
  if (frames === commits.length) return commits.map((commit) => [commit]);
  const buckets: T[][] = Array.from({ length: frames }, () => []);
  const size = Math.ceil(commits.length / frames);
  for (let index = 0; index < commits.length; index += 1) {
    const bucket = Math.min(frames - 1, Math.floor(index / size));
    const commit = commits[index];
    if (commit !== undefined) buckets[bucket]?.push(commit);
  }
  return buckets.filter((bucket) => bucket.length > 0);
}

export function bucketCommitsByDate<T extends { date: string }>(commits: T[], target: number): T[][] {
  if (commits.length === 0) return [];
  const frames = Math.max(1, Math.min(target, commits.length));
  if (frames === commits.length) return commits.map((commit) => [commit]);
  const start = Date.parse(commits[0]?.date ?? '');
  const end = Date.parse(commits[commits.length - 1]?.date ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return bucketCommits(commits, frames);
  const buckets: T[][] = Array.from({ length: frames }, () => []);
  const span = end - start;
  for (const commit of commits) {
    const time = Date.parse(commit.date);
    let index = Math.floor(((time - start) / span) * frames);
    if (!Number.isFinite(index) || index < 0) index = 0;
    if (index >= frames) index = frames - 1;
    buckets[index]?.push(commit);
  }
  const filled = buckets.filter((bucket) => bucket.length > 0);
  return filled.length > 0 ? filled : [commits];
}
