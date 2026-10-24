import type { Forecast, Hotspot, Outlook } from './types.ts';

export interface ScoreInput {
  path: string;
  complexity: number;
  totalChurn: number;
  bugfixTouches: number;
  authorLines: number[];
  testAccompanied: number;
  touches: number;
}

/**
 * Risk mixes four climate signals, then subtracts a test-relief term.
 * Weights: churn 0.34, complexity 0.28, bug-fix commits 0.22, ownership split 0.16, tests −0.12.
 */
export function buildForecast(files: ScoreInput[], repoName: string): Forecast {
  const churns = files.map((file) => file.totalChurn);
  const complexities = files.map((file) => file.complexity);
  const bugs = files.map((file) => file.bugfixTouches);
  const scored = files.map((file) => scoreFile(file, churns, complexities, bugs));
  scored.sort((a, b) => b.risk - a.risk || a.path.localeCompare(b.path));
  const hotspots = scored.slice(0, 5);
  return {
    outlook: outlookFor(hotspots[0]?.risk ?? 0),
    summary: summaryFor(repoName, hotspots),
    hotspots,
  };
}

export function scoreFile(
  file: ScoreInput,
  churns: number[],
  complexities: number[],
  bugs: number[],
): Hotspot {
  const churn = percentileRank(file.totalChurn, churns);
  const complexity = percentileRank(file.complexity, complexities);
  const bugfix = percentileRank(file.bugfixTouches, bugs);
  const split = fragmentation(file.authorLines);
  const testRelief = file.touches === 0 ? 0 : clamp(file.testAccompanied / file.touches, 0, 1);
  const risk = round4(
    clamp(0.34 * churn + 0.28 * complexity + 0.22 * bugfix + 0.16 * split - 0.12 * testRelief, 0, 1),
  );
  return {
    path: file.path,
    risk,
    churn: round4(churn),
    complexity: round4(complexity),
    bugfix: round4(bugfix),
    fragmentation: round4(split),
    testRelief: round4(testRelief),
    reasons: reasonsFor(file, churn, complexity, bugfix, split),
  };
}

export function fragmentation(weights: number[]): number {
  const active = weights.filter((weight) => weight > 0);
  const count = active.length;
  if (count <= 1) return 0;
  const total = active.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return 0;
  let herfindahl = 0;
  for (const weight of active) {
    const share = weight / total;
    herfindahl += share * share;
  }
  return clamp((1 - herfindahl) / (1 - 1 / count), 0, 1);
}

export function percentileRank(value: number, all: number[]): number {
  if (all.length === 0) return 0;
  let min = all[0] ?? 0;
  let max = all[0] ?? 0;
  for (const entry of all) {
    if (entry < min) min = entry;
    if (entry > max) max = entry;
  }
  if (max === min) return 0;
  let below = 0;
  for (const entry of all) if (entry < value) below += 1;
  return below / (all.length - 1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function reasonsFor(
  file: ScoreInput,
  churn: number,
  complexity: number,
  bugfix: number,
  split: number,
): string[] {
  const reasons: string[] = [];
  const authors = file.authorLines.filter((lines) => lines > 0).length;
  if (churn >= 0.75) reasons.push(`Churn is in the top quarter (${file.totalChurn} lines moved)`);
  if (complexity >= 0.75) reasons.push(`Pressure is high (cyclomatic complexity ${file.complexity})`);
  if (file.bugfixTouches >= 2 && bugfix >= 0.5) {
    reasons.push(`Bug-fix rain fell on ${file.bugfixTouches} commits`);
  }
  if (split >= 0.45) reasons.push(`Ownership is split across ${authors} authors`);
  if (churn >= 0.6 && file.testAccompanied === 0) reasons.push('Changes arrived without accompanying tests');
  if (reasons.length === 0) reasons.push('Conditions sit near the repo average');
  return reasons.slice(0, 4);
}

function outlookFor(risk: number): Outlook {
  if (risk < 0.35) return 'Settled';
  if (risk < 0.55) return 'Fair';
  if (risk < 0.75) return 'Unsettled';
  return 'Storm warning';
}

function summaryFor(repoName: string, hotspots: Hotspot[]): string {
  const top = hotspots[0];
  if (!top) return `${repoName} has no files in this window. The map is open water.`;
  const outlook = outlookFor(top.risk);
  const second = hotspots[1];
  const stormCount = hotspots.filter((hotspot) => hotspot.risk >= 0.55).length;
  const lead = `${outlook} across ${repoName}. The sharpest system sits on ${top.path} (risk ${top.risk.toFixed(2)}): ${top.reasons[0] ?? 'elevated pressure'}.`;
  const follow = second
    ? `A secondary front covers ${second.path} (risk ${second.risk.toFixed(2)}).`
    : 'No secondary front stands out.';
  const close =
    stormCount > 2
      ? `${stormCount} regions are at or above squall risk.`
      : 'Most of the coastline is quieter.';
  return `${lead} ${follow} ${close}`;
}
