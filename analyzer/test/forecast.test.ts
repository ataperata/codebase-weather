import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildForecast, fragmentation, percentileRank, type ScoreInput } from '../src/forecast.ts';

function file(overrides: Partial<ScoreInput> & Pick<ScoreInput, 'path'>): ScoreInput {
  return {
    complexity: 10,
    totalChurn: 100,
    bugfixTouches: 2,
    authorLines: [10, 10],
    testAccompanied: 0,
    touches: 4,
    ...overrides,
  };
}

test('fragmentation is zero for one owner and full for an even split', () => {
  assert.equal(fragmentation([10]), 0);
  assert.equal(fragmentation([0]), 0);
  assert.ok(Math.abs(fragmentation([5, 5]) - 1) < 1e-9);
  const uneven = fragmentation([9, 1]);
  assert.ok(uneven > 0 && uneven < 1);
});

test('percentile rank stays calm when every value matches', () => {
  assert.equal(percentileRank(3, [3, 3, 3]), 0);
  assert.equal(percentileRank(5, [1, 3, 5]), 1);
});

test('test accompaniment lowers risk when the climate is otherwise identical', () => {
  const forecast = buildForecast(
    [file({ path: 'src/raw.ts' }), file({ path: 'src/tested.ts', testAccompanied: 4 })],
    'lumen',
  );
  const raw = forecast.hotspots.find((hotspot) => hotspot.path === 'src/raw.ts');
  const tested = forecast.hotspots.find((hotspot) => hotspot.path === 'src/tested.ts');
  assert.ok(raw && tested);
  assert.ok(tested.risk < raw.risk);
  assert.equal(forecast.hotspots[0]?.path, 'src/raw.ts');
});

test('more churn outranks a quiet file and the summary names the hotspot', () => {
  const forecast = buildForecast(
    [
      file({ path: 'src/quiet.ts', totalChurn: 5, complexity: 2, bugfixTouches: 0, authorLines: [5] }),
      file({ path: 'src/storm.ts', totalChurn: 400, complexity: 40, bugfixTouches: 6, authorLines: [20, 20, 10] }),
    ],
    'lumen',
  );
  assert.equal(forecast.hotspots[0]?.path, 'src/storm.ts');
  assert.ok(forecast.hotspots[0].risk > forecast.hotspots[1].risk);
  assert.match(forecast.summary, /src\/storm\.ts/);
  assert.ok(forecast.hotspots[0].reasons.length > 0);
  assert.ok(forecast.outlook === 'Unsettled' || forecast.outlook === 'Storm warning');
});
