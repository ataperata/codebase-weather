import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { AnalyzeError, analyzeRepository } from './analyze.ts';

const HELP = `codebase-weather — measure a git repository and write a weather dataset

Usage:
  npm run analyze -- --repo <path> --out <file.json> [options]

Options:
  --repo <path>         Repository to read (default: current directory)
  --out <file>          Dataset path (default: codebase-weather.json)
  --name <name>         Name stored in the dataset (default: directory name)
  --max-commits <n>     Most recent commits to include, 1–5000 (default: 500)
  --frames <n>          Maximum timeline frames, 1–180 (default: 36)
  --max-files <n>       Maximum files kept on the map, 1–5000 (default: 600)
  --sample              Mark the dataset as a built-in sample
  --help                Show this help

Storms are churn, gold lines are cyclomatic pressure, rain is bug-fix
commits, mist is test edits, and color is ownership. Author emails are
hashed into ids and are not written to the dataset.
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: process.cwd() },
      out: { type: 'string', default: 'codebase-weather.json' },
      name: { type: 'string' },
      'max-commits': { type: 'string', default: '500' },
      frames: { type: 'string', default: '36' },
      'max-files': { type: 'string', default: '600' },
      sample: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const repo = path.resolve(values.repo ?? process.cwd());
  const out = path.resolve(values.out ?? 'codebase-weather.json');
  const dataset = analyzeRepository(repo, {
    maxCommits: readInt(values['max-commits'], '--max-commits', 1, 5000),
    frames: readInt(values.frames, '--frames', 1, 180),
    maxFiles: readInt(values['max-files'], '--max-files', 1, 5000),
    ...(values.name ? { name: values.name } : {}),
    sample: values.sample ?? false,
  });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
  const top = dataset.forecast.hotspots[0];
  const topLabel = top ? `${top.path} (${top.risk.toFixed(2)})` : 'none';
  process.stdout.write(
    `Analyzed ${dataset.repo.name}: ${dataset.repo.analyzedCommits} commits, ${dataset.files.length} files, ${dataset.frames.length} frames. Top risk ${topLabel}.\nWrote ${out}\n`,
  );
}

function readInt(value: string | undefined, flag: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AnalyzeError(`${flag} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
