import { isTestPath } from '../../analyzer/src/signals.ts';
import type { Dataset, WeatherFile } from './types.ts';

export function stormWord(churn: number, maxChurn: number): string {
  if (maxChurn <= 0 || churn <= 0) return 'calm';
  const ratio = churn / maxChurn;
  if (ratio < 0.18) return 'breeze';
  if (ratio < 0.4) return 'gusts';
  if (ratio < 0.7) return 'squall';
  return 'storm';
}

export function pressureWord(complexity: number): string {
  if (complexity <= 0) return 'unformed coast';
  if (complexity < 8) return 'low pressure';
  if (complexity < 16) return 'steady pressure';
  if (complexity < 28) return 'a pressure front';
  return 'high pressure';
}

export function rainWord(bugfix: number, testEdits: number, testFile: boolean): string {
  if (testFile && testEdits > 0) return 'test mist';
  if (bugfix <= 0) return 'dry air';
  if (bugfix < 8) return 'drizzle';
  if (bugfix < 40) return 'rain';
  return 'a downpour';
}

export function describeTile(file: WeatherFile, frame: number, maxChurn: number, owner: string | null): string {
  const churn = file.series.churn[frame] ?? 0;
  const complexity = file.series.complexity[frame] ?? 0;
  const bugfix = file.series.bugfix[frame] ?? 0;
  const testEdits = file.series.testEdits[frame] ?? 0;
  if ((file.series.net[frame] ?? 0) <= 0 && churn <= 0) {
    return `${file.path} is still unwritten in this frame.`;
  }
  const storm = stormWord(churn, maxChurn);
  const sentence = `${capitalize(storm)} over ${file.name}, with ${pressureWord(complexity)} and ${rainWord(bugfix, testEdits, isTestPath(file.path))}.`;
  const territory = owner ? `Territory held by ${owner}.` : 'No author has claimed this shore in the window.';
  return `${sentence} ${territory}`;
}

export function frameBlurb(dataset: Dataset, index: number): string {
  const frame = dataset.frames[index];
  if (!frame) return '';
  let top: WeatherFile | null = null;
  let topChurn = 0;
  let rainy = 0;
  for (const file of dataset.files) {
    const churn = file.series.churn[index] ?? 0;
    if (churn > topChurn) {
      topChurn = churn;
      top = file;
    }
    if ((file.series.bugfix[index] ?? 0) > 0 && !isTestPath(file.path)) rainy += 1;
  }
  const rain = rainy === 0 ? 'Skies are dry.' : `Bug-fix rain on ${rainy} file${rainy === 1 ? '' : 's'}.`;
  if (!top || topChurn === 0) return `${frame.label} is quiet. Pressure systems hold. ${rain}`;
  const word = stormWord(topChurn, climateMax(dataset));
  return `${frame.headline} Strongest ${word} over ${top.path}. ${rain}`;
}

/** Largest single-file churn in the whole window, so a two-line fix stays a breeze. */
export function climateMax(dataset: Dataset): number {
  let max = 0;
  for (const file of dataset.files) {
    for (const value of file.series.churn) max = Math.max(max, value);
  }
  return max;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}
