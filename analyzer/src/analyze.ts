import { createHash } from 'node:crypto';
import path from 'node:path';
import { estimateComplexity, heuristicComplexity } from './complexity.ts';
import { clip, formatSpan } from './dates.ts';
import { buildForecast, clamp } from './forecast.ts';
import {
  assertGitRepo,
  bucketCommitsByDate,
  commitCount,
  listHeadFiles,
  readGitLog,
  readHeadBlobs,
  type HeadBlob,
  type RawCommit,
} from './git.ts';
import { colorFor } from './palette.ts';
import { directoryOf, fileNameOf, isBugfixMessage, isTestPath, languageOf, shouldIgnorePath } from './signals.ts';
import { METRIC_NOTES, type Author, type Dataset, type Frame, type WeatherFile } from './types.ts';

export class AnalyzeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyzeError';
  }
}

export interface AnalyzeOptions {
  maxCommits?: number;
  frames?: number;
  maxFiles?: number;
  name?: string;
  sample?: boolean;
  description?: string;
}

interface FileEvent {
  commitIndex: number;
  additions: number;
  deletions: number;
  bugfix: boolean;
  accompanied: boolean;
  authorId: string;
  testFile: boolean;
}

interface MutableFile {
  path: string;
  events: FileEvent[];
  totalChurn: number;
  bugfixTouches: number;
  testAccompanied: number;
  touches: number;
  added: number;
  deleted: number;
  addedByAuthor: Map<string, number>;
}

interface AuthorAcc {
  id: string;
  name: string;
  commits: number;
}

const READ_CAP = 2500;

export function analyzeRepository(repo: string, options: AnalyzeOptions = {}): Dataset {
  const maxCommits = options.maxCommits ?? 500;
  const frameTarget = options.frames ?? 36;
  const maxFiles = options.maxFiles ?? 600;
  assertGitRepo(repo);
  const totalCommits = commitCount(repo);
  if (totalCommits === 0) throw new AnalyzeError('The repository has no commits to chart yet.');
  const commits = readGitLog(repo, maxCommits);
  if (commits.length === 0) throw new AnalyzeError('The repository has no commits to chart yet.');

  const authors = new Map<string, AuthorAcc>();
  const files = new Map<string, MutableFile>();
  commits.forEach((commit, commitIndex) => {
    const authorId = rememberAuthor(authors, commit);
    const accompanied = commit.files.some((file) => isTestPath(file.path));
    const bugfix = isBugfixMessage(commit.subject);
    for (const change of commit.files) {
      const file = ensureFile(files, change.path);
      const testFile = isTestPath(change.path);
      file.events.push({
        commitIndex,
        additions: change.additions,
        deletions: change.deletions,
        bugfix,
        accompanied: accompanied && !testFile,
        authorId,
        testFile,
      });
      file.totalChurn += change.additions + change.deletions;
      file.added += change.additions;
      file.deleted += change.deletions;
      file.touches += 1;
      if (bugfix) file.bugfixTouches += 1;
      if (accompanied && !testFile) file.testAccompanied += 1;
      file.addedByAuthor.set(authorId, (file.addedByAuthor.get(authorId) ?? 0) + change.additions);
    }
  });

  for (const filePath of listHeadFiles(repo)) {
    if (shouldIgnorePath(filePath) || filePath.includes('\n')) continue;
    ensureFile(files, filePath);
  }

  const ranked = [...files.values()].sort(
    (a, b) => b.totalChurn - a.totalChurn || a.path.localeCompare(b.path),
  );
  const toRead = ranked.slice(0, Math.max(maxFiles, Math.min(READ_CAP, ranked.length)));
  const blobs = readHeadBlobs(repo, toRead.map((file) => file.path));
  const measured = new Map<string, { loc: number; complexity: number; present: boolean }>();
  for (const file of toRead) {
    measured.set(file.path, measure(blobs.get(file.path), file));
  }

  const scoredForCap = toRead
    .map((file) => {
      const reading = measured.get(file.path);
      const loc = reading?.loc ?? 1;
      return { file, score: file.totalChurn * 2 + loc };
    })
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
  const kept = scoredForCap.slice(0, maxFiles).map((entry) => entry.file);
  const omittedFiles = Math.max(0, files.size - kept.length);

  const groups = bucketCommitsByDate(
    commits.map((commit, index) => ({ ...commit, index })),
    frameTarget,
  );
  const frameOf = new Array<number>(commits.length).fill(0);
  const frames: Frame[] = groups.map((group, index) => {
    for (const commit of group) frameOf[commit.index] = index;
    return frameFrom(group, index);
  });

  const authorList: Author[] = [...authors.values()].map((author, index) => ({
    id: author.id,
    name: author.name,
    color: colorFor(index),
    commits: author.commits,
  }));
  const authorIndex = new Map(authorList.map((author, index) => [author.id, index]));
  const weather = kept
    .map((file) => toWeatherFile(file, measured.get(file.path), frames.length, frameOf, authorIndex))
    .sort((a, b) => a.path.localeCompare(b.path));

  const name = options.name?.trim() || path.basename(path.resolve(repo));
  const description =
    options.description?.trim() ||
    `Git history for ${name}. Pressure is cyclomatic complexity at HEAD, scaled by how much of each file had been written.`;
  const forecast = buildForecast(
    weather.map((file) => ({
      path: file.path,
      complexity: file.complexity,
      totalChurn: file.totalChurn,
      bugfixTouches: file.bugfixTouches,
      authorLines: [...kept.find((item) => item.path === file.path)?.addedByAuthor.values() ?? []],
      testAccompanied: file.testAccompanied,
      touches: file.touches,
    })),
    name,
  );

  return {
    version: 1,
    repo: {
      name,
      description,
      sample: options.sample ?? false,
      commitCount: totalCommits,
      analyzedCommits: commits.length,
      firstCommitAt: commits[0]?.date ?? '',
      lastCommitAt: commits[commits.length - 1]?.date ?? '',
      generatedAt: commits[commits.length - 1]?.date ?? '',
      truncated: omittedFiles > 0 || totalCommits > commits.length,
      omittedFiles,
    },
    authors: authorList,
    frames,
    files: weather,
    forecast,
    metrics: METRIC_NOTES,
  };
}

function rememberAuthor(authors: Map<string, AuthorAcc>, commit: RawCommit): string {
  const basis = (commit.authorEmail || commit.authorName || 'unknown').trim().toLowerCase();
  const id = createHash('sha256').update(basis).digest('hex').slice(0, 12);
  const existing = authors.get(id);
  if (existing) {
    existing.commits += 1;
    if (!existing.name && commit.authorName) existing.name = commit.authorName;
    return id;
  }
  authors.set(id, {
    id,
    name: commit.authorName.trim() || 'Unknown',
    commits: 1,
  });
  return id;
}

function ensureFile(files: Map<string, MutableFile>, filePath: string): MutableFile {
  const existing = files.get(filePath);
  if (existing) return existing;
  const created: MutableFile = {
    path: filePath,
    events: [],
    totalChurn: 0,
    bugfixTouches: 0,
    testAccompanied: 0,
    touches: 0,
    added: 0,
    deleted: 0,
    addedByAuthor: new Map(),
  };
  files.set(filePath, created);
  return created;
}

function measure(
  blob: HeadBlob | undefined,
  file: MutableFile,
): { loc: number; complexity: number; present: boolean } {
  if (blob && 'text' in blob) {
    const reading = estimateComplexity(blob.text);
    const loc = Math.max(reading.loc, 1);
    return { loc, complexity: Math.max(1, reading.complexity), present: true };
  }
  const net = Math.max(0, file.added - file.deleted);
  const loc = Math.max(1, net);
  return { loc, complexity: heuristicComplexity(loc), present: false };
}

function frameFrom(group: Array<RawCommit & { index: number }>, index: number): Frame {
  let additions = 0;
  let deletions = 0;
  let bugfixes = 0;
  let headline = group[0]?.subject ?? 'Quiet';
  let bestChurn = -1;
  for (const commit of group) {
    let churn = 0;
    for (const file of commit.files) {
      additions += file.additions;
      deletions += file.deletions;
      churn += file.additions + file.deletions;
    }
    if (churn > bestChurn) {
      bestChurn = churn;
      headline = commit.subject;
    }
    if (isBugfixMessage(commit.subject) && commit.files.length > 0) bugfixes += 1;
  }
  const start = group[0]?.date ?? '';
  const end = group[group.length - 1]?.date ?? start;
  return {
    index,
    start,
    end,
    label: formatSpan(start, end),
    commitCount: group.length,
    headline: clip(headline, 96),
    totals: { churn: additions + deletions, additions, deletions, bugfixes },
  };
}

function toWeatherFile(
  file: MutableFile,
  reading: { loc: number; complexity: number; present: boolean } | undefined,
  frameCount: number,
  frameOf: number[],
  authorIndex: Map<string, number>,
): WeatherFile {
  const measuredLoc = reading?.present ? reading.loc : 0;
  const measuredComplexity = reading?.complexity ?? heuristicComplexity(Math.max(1, file.added));
  const endDelta = file.added - file.deleted;
  const startSize = reading?.present ? Math.max(0, measuredLoc - endDelta) : 0;
  const churn = zeros(frameCount);
  const bugfix = zeros(frameCount);
  const testEdits = zeros(frameCount);
  const accompanied = zeros(frameCount);
  const complexity = zeros(frameCount);
  const net = zeros(frameCount);
  const owner = zeros(frameCount).map(() => -1);
  let added = 0;
  let deleted = 0;
  const authorLines = new Map<string, number>();
  let eventIndex = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    while (eventIndex < file.events.length) {
      const event = file.events[eventIndex];
      if (!event || (frameOf[event.commitIndex] ?? 0) > frame) break;
      eventIndex += 1;
      added += event.additions;
      deleted += event.deletions;
      churn[frame] = (churn[frame] ?? 0) + event.additions + event.deletions;
      if (event.bugfix) bugfix[frame] = (bugfix[frame] ?? 0) + event.additions + event.deletions;
      if (event.testFile) testEdits[frame] = (testEdits[frame] ?? 0) + event.additions + event.deletions;
      if (event.accompanied) accompanied[frame] = (accompanied[frame] ?? 0) + 1;
      authorLines.set(event.authorId, (authorLines.get(event.authorId) ?? 0) + event.additions);
    }
    const size = Math.max(0, startSize + added - deleted);
    net[frame] = size;
    complexity[frame] = complexityAt(size, measuredLoc, measuredComplexity);
    owner[frame] = leadingOwner(authorLines, authorIndex);
  }
  const peak = net.reduce((max, value) => Math.max(max, value), 0);
  const loc = measuredLoc > 0 ? measuredLoc : Math.max(1, peak);
  const finalOwner = owner[frameCount - 1] ?? -1;
  const ownerId = finalOwner >= 0 ? [...authorIndex.entries()].find(([, value]) => value === finalOwner)?.[0] ?? null : null;
  return {
    path: file.path,
    name: fileNameOf(file.path),
    directory: directoryOf(file.path),
    language: languageOf(file.path),
    loc,
    complexity: measuredLoc > 0 ? measuredComplexity : heuristicComplexity(loc),
    ownerId,
    totalChurn: file.totalChurn,
    bugfixTouches: file.bugfixTouches,
    testAccompanied: file.testAccompanied,
    touches: file.touches,
    series: { churn, bugfix, testEdits, accompanied, complexity, net, owner },
  };
}

function complexityAt(size: number, measuredLoc: number, measuredComplexity: number): number {
  if (size <= 0) return 0;
  if (measuredLoc > 0) {
    return Math.max(1, Math.round(measuredComplexity * clamp(size / measuredLoc, 0, 1.25)));
  }
  return heuristicComplexity(size);
}

function leadingOwner(authorLines: Map<string, number>, authorIndex: Map<string, number>): number {
  let bestId: string | null = null;
  let best = 0;
  for (const [id, lines] of authorLines) {
    if (lines > best) {
      best = lines;
      bestId = id;
    }
  }
  if (!bestId) return -1;
  return authorIndex.get(bestId) ?? -1;
}

function zeros(length: number): number[] {
  return Array.from({ length }, () => 0);
}
