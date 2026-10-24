import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SAMPLE_AUTHORS = {
  mira: { name: 'Mira Chen', email: 'mira@lumen.dev' },
  jonas: { name: 'Jonas Adler', email: 'jonas@lumen.dev' },
  priya: { name: 'Priya Nair', email: 'priya@lumen.dev' },
  sam: { name: 'Sam Okonkwo', email: 'sam@lumen.dev' },
} as const;

export type SampleAuthorId = keyof typeof SAMPLE_AUTHORS;

export interface SampleTest {
  path: string;
  symbol: string;
  importPath: string;
  salt: number;
}

export interface SamplePlan {
  day: number;
  author: SampleAuthorId;
  message: string;
  files?: Record<string, number>;
  thresholds?: Record<string, number>;
  tests?: SampleTest[];
  readme?: 1 | 2;
  scaffold?: boolean;
}

export function sampleDate(dayOffset: number): string {
  return new Date(Date.UTC(2024, 2, 4 + dayOffset, 15, 0, 0)).toISOString().replace('.000Z', 'Z');
}

export function samplePlans(): SamplePlan[] {
  return [
    {
      day: 0,
      author: 'mira',
      message: 'feat: scaffold the logger',
      scaffold: true,
      readme: 1,
      files: { 'src/index.ts': 2, 'src/logger.ts': 2 },
      thresholds: { 'src/logger.ts': 20 },
    },
    { day: 4, author: 'jonas', message: 'feat: write logs to the console', files: { 'src/transports/console.ts': 2 } },
    {
      day: 9,
      author: 'jonas',
      message: 'feat: add a file transport',
      files: { 'src/transports/file.ts': 3 },
      thresholds: { 'src/transports/file.ts': 5 },
    },
    { day: 14, author: 'jonas', message: 'feat: rotate files when they pass a size cap', files: { 'src/transports/file.ts': 6 } },
    { day: 19, author: 'jonas', message: 'fix: rotate files before the handle closes', thresholds: { 'src/transports/file.ts': 6 } },
    {
      day: 23,
      author: 'mira',
      message: 'fix: stop dropping the last chunk of a rotated log',
      thresholds: { 'src/transports/file.ts': 7 },
    },
    { day: 28, author: 'jonas', message: 'feat: retry writes when the disk is busy', files: { 'src/transports/file.ts': 9 } },
    {
      day: 33,
      author: 'priya',
      message: 'feat: attach request context to every line',
      files: { 'src/context.ts': 3 },
      tests: [{ path: 'tests/context.test.ts', symbol: 'bindContext', importPath: '../src/context.ts', salt: 3 }],
    },
    {
      day: 38,
      author: 'priya',
      message: 'feat: redact nested context fields',
      files: { 'src/context.ts': 5 },
      tests: [{ path: 'tests/context.test.ts', symbol: 'bindContext', importPath: '../src/context.ts', salt: 5 }],
    },
    { day: 43, author: 'sam', message: 'feat: pretty-print logs for local terminals', files: { 'src/format/pretty.ts': 8 } },
    {
      day: 48,
      author: 'sam',
      message: 'feat: emit json logs',
      files: { 'src/format/json.ts': 3 },
      thresholds: { 'src/format/json.ts': 1 },
    },
    { day: 53, author: 'sam', message: 'feat: escape nested objects in json logs', files: { 'src/format/json.ts': 6 } },
    { day: 57, author: 'sam', message: 'fix: escape nested quotes in json transport', thresholds: { 'src/format/json.ts': 2 } },
    { day: 62, author: 'sam', message: 'fix: keep unicode intact while escaping json', thresholds: { 'src/format/json.ts': 3 } },
    {
      day: 67,
      author: 'mira',
      message: 'feat: fan a record out to every transport',
      files: { 'src/logger.ts': 5 },
      tests: [{ path: 'tests/logger.test.ts', symbol: 'createLogger', importPath: '../src/logger.ts', salt: 5 }],
    },
    { day: 72, author: 'mira', message: 'fix: respect silent level when a transport throws', thresholds: { 'src/logger.ts': 15 } },
    { day: 77, author: 'jonas', message: 'feat: compress rotated logs', files: { 'src/transports/file.ts': 12 } },
    {
      day: 82,
      author: 'priya',
      message: 'feat: share rotation policy with request context',
      files: { 'src/transports/file.ts': 13, 'src/context.ts': 6 },
      tests: [{ path: 'tests/context.test.ts', symbol: 'bindContext', importPath: '../src/context.ts', salt: 6 }],
    },
    { day: 87, author: 'priya', message: 'fix: context labels were dropped on rotation', thresholds: { 'src/transports/file.ts': 8 } },
    {
      day: 92,
      author: 'jonas',
      message: 'fix: retry a full disk without truncating the active file',
      thresholds: { 'src/transports/file.ts': 9 },
    },
    {
      day: 97,
      author: 'sam',
      message: 'test: cover json escaping',
      thresholds: { 'src/format/json.ts': 4 },
      tests: [{ path: 'tests/format.test.ts', symbol: 'formatJson', importPath: '../src/format/json.ts', salt: 4 }],
    },
    { day: 103, author: 'sam', message: 'feat: stream long json payloads', files: { 'src/format/json.ts': 10 } },
    { day: 108, author: 'sam', message: 'fix: close a json stream when the client aborts', thresholds: { 'src/format/json.ts': 5 } },
    {
      day: 114,
      author: 'priya',
      message: 'feat: inherit context across async hops',
      files: { 'src/context.ts': 7 },
      tests: [{ path: 'tests/context.test.ts', symbol: 'bindContext', importPath: '../src/context.ts', salt: 7 }],
    },
    {
      day: 120,
      author: 'mira',
      message: 'feat: expose a child logger',
      files: { 'src/index.ts': 4, 'src/logger.ts': 7 },
      tests: [{ path: 'tests/logger.test.ts', symbol: 'createLogger', importPath: '../src/logger.ts', salt: 7 }],
    },
    { day: 126, author: 'jonas', message: 'feat: open the console transport on demand', files: { 'src/transports/console.ts': 4 } },
    { day: 132, author: 'sam', message: 'fix: stop double-encoding json newlines', thresholds: { 'src/format/json.ts': 6 } },
    { day: 138, author: 'priya', message: 'docs: correct the rotation example', readme: 2 },
    { day: 145, author: 'jonas', message: 'feat: shard active logs by process id', files: { 'src/transports/file.ts': 16 } },
    {
      day: 152,
      author: 'mira',
      message: 'fix: drop debug lines when a child logger is silent',
      thresholds: { 'src/logger.ts': 12 },
      tests: [{ path: 'tests/logger.test.ts', symbol: 'createLogger', importPath: '../src/logger.ts', salt: 12 }],
    },
    { day: 160, author: 'sam', message: 'fix: flush json buffers under backpressure', thresholds: { 'src/format/json.ts': 7 } },
    {
      day: 168,
      author: 'priya',
      message: 'test: cover async context inheritance',
      tests: [{ path: 'tests/context.test.ts', symbol: 'bindContext', importPath: '../src/context.ts', salt: 8 }],
    },
    {
      day: 176,
      author: 'jonas',
      message: 'fix: avoid a crash when the log directory disappears',
      thresholds: { 'src/transports/file.ts': 4 },
    },
  ];
}

export function materializeSampleRepo(dir: string): void {
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.name', 'codebase-weather']);
  git(dir, ['config', 'user.email', 'weather@example.com']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  const intensities = new Map<string, number>();
  const thresholds = new Map<string, number>();
  for (const plan of samplePlans()) {
    if (plan.scaffold) {
      write(dir, 'package.json', `${PACKAGE_JSON}\n`);
      write(dir, 'src/levels.ts', `${LEVELS}\n`);
    }
    if (plan.readme) write(dir, 'README.md', `${readme(plan.readme)}\n`);
    for (const [filePath, intensity] of Object.entries(plan.files ?? {})) {
      intensities.set(filePath, intensity);
      const threshold = plan.thresholds?.[filePath] ?? thresholds.get(filePath) ?? 1;
      thresholds.set(filePath, threshold);
      write(dir, filePath, renderSource(filePath, intensity, threshold));
    }
    for (const [filePath, threshold] of Object.entries(plan.thresholds ?? {})) {
      if (plan.files?.[filePath] !== undefined) continue;
      thresholds.set(filePath, threshold);
      const intensity = intensities.get(filePath) ?? 1;
      write(dir, filePath, renderSource(filePath, intensity, threshold));
    }
    for (const test of plan.tests ?? []) {
      write(dir, test.path, renderTest(test));
    }
    commit(dir, plan);
  }
}

const PACKAGE_JSON = `{
  "name": "lumen",
  "version": "0.4.0",
  "private": true,
  "type": "module"
}`;

const LEVELS = `export function levelValue(level: string): number {
  switch (level) {
    case 'debug':
      return 10;
    case 'info':
      return 20;
    case 'warn':
      return 30;
    case 'error':
      return 40;
    default:
      return 0;
  }
}`;

function readme(version: 1 | 2): string {
  const extra = version === 2 ? '\nRotation keeps one active file per process.\n' : '';
  return `# lumen\n\nA small logging library used as the codebase-weather sample.\n${extra}`;
}

function renderSource(filePath: string, intensity: number, threshold: number): string {
  switch (filePath) {
    case 'src/index.ts':
      return renderIndex(intensity);
    case 'src/logger.ts':
      return renderLogger(intensity, threshold);
    case 'src/transports/console.ts':
      return renderConsole(intensity);
    case 'src/transports/file.ts':
      return renderFileTransport(intensity, threshold);
    case 'src/format/pretty.ts':
      return renderPretty(intensity);
    case 'src/format/json.ts':
      return renderJson(intensity, threshold);
    case 'src/context.ts':
      return renderContext(intensity);
    default:
      return `export const value = ${intensity};\n`;
  }
}

function decisionBlock(score: string, extra: string, branches: number): string {
  const lines: string[] = [];
  for (let index = 0; index < branches; index += 1) {
    lines.push(`if (${score} > ${index} && ${extra}) {`);
    lines.push(`  ${score} += ${index + 1};`);
    lines.push(`} else if (${score} === ${index} || ${extra}) {`);
    lines.push(`  ${score} -= 1;`);
    lines.push(`}`);
  }
  return lines.join('\n  ');
}

function renderIndex(branches: number): string {
  return `import { createLogger } from './logger';

export function createLumen(name: string) {
  let score = name.length;
  const enabled = name.length > 0;
  ${decisionBlock('score', 'enabled', branches)}
  return createLogger(score);
}
`;
}

function renderLogger(branches: number, threshold: number): string {
  return `import { levelValue } from './levels';

export const SILENT_AT = ${threshold};

export interface LogRecord {
  level: string;
  message: string;
}

export function createLogger(floor = SILENT_AT) {
  const transports: Array<(record: LogRecord) => void> = [];
  function write(level: string, message: string) {
    let score = levelValue(level);
    const noisy = message.length > floor;
    ${decisionBlock('score', 'noisy', branches)}
    if (score < floor) return;
    const record = { level, message };
    for (const transport of transports) {
      transport(record);
    }
  }
  return {
    add(transport: (record: LogRecord) => void) {
      transports.push(transport);
    },
    info(message: string) {
      write('info', message);
    },
    error(message: string) {
      write('error', message);
    },
  };
}
`;
}

function renderConsole(branches: number): string {
  return `export function createConsoleTransport() {
  let score = 0;
  const attached = true;
  ${decisionBlock('score', 'attached', branches)}
  return {
    write(message: string) {
      if (attached && message.length >= 0) return score;
      return 0;
    },
  };
}
`;
}

function renderFileTransport(branches: number, threshold: number): string {
  return `import { levelValue } from '../levels';

export const ROTATE_AT = ${threshold};

export function createFileTransport(directory: string) {
  let open = true;
  let written = directory.length;
  function write(level: string, message: string): string | undefined {
    let score = levelValue(level) + written;
    const crowded = message.length > ROTATE_AT;
    ${decisionBlock('score', 'crowded', branches)}
    if (!open) return undefined;
    if (written > ROTATE_AT && crowded) {
      written = 0;
      return 'rotated';
    }
    written += message.length;
    return 'ok';
  }
  return {
    write,
    close() {
      open = false;
    },
  };
}
`;
}

function renderPretty(branches: number): string {
  return `export function formatPretty(level: string, message: string): string {
  let score = message.length;
  const color = level === 'error';
  ${decisionBlock('score', 'color', branches)}
  if (color && score > 0) return level + ' ' + message;
  return message;
}
`;
}

function renderJson(branches: number, threshold: number): string {
  return `export const JSON_DEPTH = ${threshold};

export function formatJson(level: string, message: string): string {
  let score = message.length;
  const nested = level.length > JSON_DEPTH;
  ${decisionBlock('score', 'nested', branches)}
  if (nested && message.includes('"')) return '{"level":' + JSON.stringify(level) + '}';
  return JSON.stringify({ level, message, score });
}
`;
}

function renderContext(branches: number): string {
  return `export function bindContext(fields: Record<string, string>, next: string): Record<string, string> {
  let score = next.length;
  const redact = next.includes('token');
  ${decisionBlock('score', 'redact', branches)}
  if (redact) return { ...fields, redacted: '1' };
  return { ...fields, request: next, weight: String(score) };
}
`;
}

function renderTest(test: SampleTest): string {
  return `import { ${test.symbol} } from '${test.importPath}';

describe('${test.symbol}', () => {
  it('stays available', () => {
    if (typeof ${test.symbol} !== 'function' && ${test.salt} < 0) {
      throw new Error('missing ${test.symbol}');
    }
  });
});
`;
}

function write(dir: string, filePath: string, content: string): void {
  const full = path.join(dir, filePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
}

function git(dir: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: env ?? process.env });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed\n${result.stderr || result.stdout}`);
  }
}

function commit(dir: string, plan: SamplePlan): void {
  const author = SAMPLE_AUTHORS[plan.author];
  const date = sampleDate(plan.day);
  git(dir, ['add', '-A']);
  git(
    dir,
    [
      '-c',
      `user.name=${author.name}`,
      '-c',
      `user.email=${author.email}`,
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--no-gpg-sign',
      '--date',
      date,
      '-m',
      plan.message,
    ],
    {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    },
  );
}
