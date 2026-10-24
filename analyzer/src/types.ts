export interface Dataset {
  version: 1;
  repo: RepoInfo;
  authors: Author[];
  frames: Frame[];
  files: WeatherFile[];
  forecast: Forecast;
  metrics: MetricNotes;
}

export interface RepoInfo {
  name: string;
  description: string;
  sample: boolean;
  commitCount: number;
  analyzedCommits: number;
  firstCommitAt: string;
  lastCommitAt: string;
  generatedAt: string;
  truncated: boolean;
  omittedFiles: number;
}

export interface Author {
  id: string;
  name: string;
  color: string;
  commits: number;
}

export interface FrameTotals {
  churn: number;
  additions: number;
  deletions: number;
  bugfixes: number;
}

export interface Frame {
  index: number;
  start: string;
  end: string;
  label: string;
  commitCount: number;
  headline: string;
  totals: FrameTotals;
}

export interface FileSeries {
  churn: number[];
  bugfix: number[];
  testEdits: number[];
  accompanied: number[];
  complexity: number[];
  net: number[];
  owner: number[];
}

export interface WeatherFile {
  path: string;
  name: string;
  directory: string;
  language: string;
  loc: number;
  complexity: number;
  ownerId: string | null;
  totalChurn: number;
  bugfixTouches: number;
  testAccompanied: number;
  touches: number;
  series: FileSeries;
}

export interface Hotspot {
  path: string;
  risk: number;
  churn: number;
  complexity: number;
  bugfix: number;
  fragmentation: number;
  testRelief: number;
  reasons: string[];
}

export type Outlook = 'Settled' | 'Fair' | 'Unsettled' | 'Storm warning';

export interface Forecast {
  outlook: Outlook;
  summary: string;
  hotspots: Hotspot[];
}

export interface MetricNotes {
  churn: string;
  pressure: string;
  rain: string;
  territory: string;
  relief: string;
}

export const METRIC_NOTES: MetricNotes = {
  churn: 'Storms are additions plus deletions in that frame.',
  pressure:
    'Gold lines are cyclomatic complexity measured at HEAD, scaled by how much of the file existed in the frame.',
  rain: 'Rain marks lines touched by a commit whose subject looks like a bug fix.',
  territory:
    'Color is the author who added the most lines in the analyzed window. Author emails are hashed into ids and omitted.',
  relief:
    'Teal mist marks edits to tests. A source change that lands in the same commit as a test edit lowers hotspot risk.',
};
