import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { analyzeRepository } from '../src/analyze.ts';
import { PALETTE } from '../src/palette.ts';
import { assertDataset } from '../src/schema.ts';
import { isBugfixMessage } from '../src/signals.ts';
import { materializeSampleRepo, samplePlans } from '../src/sample.ts';

const analyzerDir = fileURLToPath(new URL('..', import.meta.url));

function withSample(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'cbw-'));
  try {
    materializeSampleRepo(dir);
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('sample plans include bug-fix rain and test commits', () => {
  const plans = samplePlans();
  assert.ok(plans.filter((plan) => isBugfixMessage(plan.message)).length >= 8);
  assert.ok(plans.some((plan) => plan.message.startsWith('test:')));
});

test('analyzer charts the sample repo as weather', () => {
  withSample((dir) => {
    const dataset = analyzeRepository(dir, { maxCommits: 200, frames: 36, maxFiles: 100, name: 'lumen' });
    assertDataset(dataset);
    const serialized = JSON.stringify(dataset);
    assert.equal(serialized.includes('mira@lumen.dev'), false);
    assert.equal(serialized.includes('jonas@lumen.dev'), false);
    assert.equal(dataset.repo.name, 'lumen');
    assert.equal(dataset.authors[0]?.name, 'Mira Chen');
    assert.equal(dataset.authors[0]?.color, PALETTE[0]);
    assert.equal(dataset.frames.length, dataset.repo.analyzedCommits);
    assert.ok(dataset.frames.some((frame) => frame.totals.bugfixes > 0));
    assert.match(dataset.frames[0]?.label ?? '', /2024/);

    const file = dataset.files.find((entry) => entry.path === 'src/transports/file.ts');
    const levels = dataset.files.find((entry) => entry.path === 'src/levels.ts');
    const pretty = dataset.files.find((entry) => entry.path === 'src/format/pretty.ts');
    const context = dataset.files.find((entry) => entry.path === 'tests/context.test.ts');
    assert.ok(file && levels && pretty && context);
    assert.ok(file.complexity > pretty.complexity);
    assert.ok(pretty.complexity > levels.complexity);
    assert.ok(context.series.testEdits.some((value) => value > 0));
    assert.equal(file.series.churn.length, dataset.frames.length);
    assert.ok(file.bugfixTouches >= 4);
    assert.ok(file.testAccompanied >= 1);

    const ranking = dataset.forecast.hotspots.map((hotspot) => `${hotspot.path}:${hotspot.risk}`).join(' ');
    assert.equal(dataset.forecast.hotspots[0]?.path, 'src/transports/file.ts', ranking);
    assert.match(dataset.forecast.summary, /src\/transports\/file\.ts/);
    const contextSource = dataset.files.find((entry) => entry.path === 'src/context.ts');
    assert.ok(contextSource);
    assert.ok(contextSource.testAccompanied >= 3);
    const fileRisk = dataset.forecast.hotspots.find((hotspot) => hotspot.path === 'src/transports/file.ts');
    const contextRisk = dataset.forecast.hotspots.find((hotspot) => hotspot.path === 'src/context.ts');
    if (contextRisk && fileRisk) assert.ok(fileRisk.risk > contextRisk.risk);
  });
});

test('cli help and dataset output', () => {
  const help = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', '--help'], {
    cwd: analyzerDir,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /codebase-weather/);

  withSample((dir) => {
    const out = path.join(dir, 'weather.json');
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(analyzerDir, 'src/cli.ts'), '--repo', dir, '--out', out, '--name', 'lumen'],
      { cwd: analyzerDir, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const dataset = JSON.parse(readFileSync(out, 'utf8')) as { repo: { name: string } };
    assert.equal(dataset.repo.name, 'lumen');
  });

  const missing = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', '--repo', path.join(tmpdir(), 'not-a-repo'), '--out', 'x.json'],
    { cwd: analyzerDir, encoding: 'utf8' },
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /not a git repository|no commits/i);
});
