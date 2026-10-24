import type { Dataset, FileSeries, Forecast } from './types.ts';

const SERIES_KEYS = ['churn', 'bugfix', 'testEdits', 'accompanied', 'complexity', 'net', 'owner'] as const;

export function assertDataset(data: unknown): asserts data is Dataset {
  if (!isRecord(data)) throw new Error('dataset is not an object');
  if (data.version !== 1) throw new Error('dataset version must be 1');
  if (!isRecord(data.repo)) throw new Error('dataset.repo missing');
  if (typeof data.repo.name !== 'string' || data.repo.name.length === 0) throw new Error('repo.name missing');
  if (!Array.isArray(data.authors) || data.authors.length === 0) throw new Error('authors missing');
  if (!Array.isArray(data.frames) || data.frames.length === 0) throw new Error('frames missing');
  if (!Array.isArray(data.files) || data.files.length === 0) throw new Error('files missing');
  if (!isRecord(data.forecast)) throw new Error('forecast missing');
  const frameCount = data.frames.length;
  for (const file of data.files) {
    if (!isRecord(file) || typeof file.path !== 'string') throw new Error('file path missing');
    if (!isRecord(file.series)) throw new Error(`${file.path} series missing`);
    const series = file.series as Partial<FileSeries>;
    for (const key of SERIES_KEYS) {
      const values = series[key];
      if (!Array.isArray(values) || values.length !== frameCount) {
        throw new Error(`${file.path} series.${key} must have ${frameCount} values`);
      }
    }
    const owners = series.owner ?? [];
    for (const owner of owners) {
      if (typeof owner !== 'number' || owner < -1 || owner >= data.authors.length) {
        throw new Error(`${file.path} has an owner outside the author list`);
      }
    }
  }
  const forecast = data.forecast as Partial<Forecast>;
  if (!Array.isArray(forecast.hotspots)) throw new Error('hotspots missing');
  if (typeof forecast.summary !== 'string' || forecast.summary.length === 0) {
    throw new Error('forecast summary missing');
  }
  for (let index = 1; index < forecast.hotspots.length; index += 1) {
    const previous = forecast.hotspots[index - 1];
    const current = forecast.hotspots[index];
    if (!isRecord(previous) || !isRecord(current)) throw new Error('hotspot shape');
    if (typeof previous.risk !== 'number' || typeof current.risk !== 'number') throw new Error('hotspot risk');
    if (current.risk > previous.risk) throw new Error('hotspots must be sorted by risk');
    if (previous.risk < 0 || previous.risk > 1 || current.risk < 0 || current.risk > 1) {
      throw new Error('hotspot risk out of range');
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
