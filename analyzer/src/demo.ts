import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRepository } from './analyze.ts';
import { materializeSampleRepo } from './sample.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = path.join(root, 'web/public/demo.json');
const dir = mkdtempSync(path.join(tmpdir(), 'lumen-'));

try {
  materializeSampleRepo(dir);
  const dataset = analyzeRepository(dir, {
    maxCommits: 200,
    frames: 36,
    maxFiles: 100,
    name: 'lumen',
    sample: true,
    description:
      'Scripted history of the fictional lumen logger, measured by codebase-weather. The coastline, storms, and rain all come from the analyzer.',
  });
  writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`);
  const top = dataset.forecast.hotspots[0];
  process.stdout.write(`Wrote ${out}\nOutlook ${dataset.forecast.outlook}; sharpest system ${top?.path ?? 'none'}.\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
