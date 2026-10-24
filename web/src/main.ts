import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/500-italic.css';
import '@fontsource/fraunces/600-italic.css';
import { climateMax, describeTile, frameBlurb, stormWord } from './conditions.ts';
import { WeatherMap, type MapHandlers } from './map.ts';
import './style.css';
import type { Dataset, WeatherFile } from './types.ts';

const eyebrow = required<HTMLElement>('#eyebrow');
const kicker = required<HTMLElement>('#kicker');
const nowcast = required<HTMLElement>('#nowcast');
const outlook = required<HTMLElement>('#outlook');
const summary = required<HTMLElement>('#summary');
const frameCopy = required<HTMLElement>('#frame-copy');
const hotspots = required<HTMLElement>('#hotspots');
const legend = required<HTMLElement>('#legend');
const metrics = required<HTMLElement>('#metrics');
const play = required<HTMLButtonElement>('#play');
const range = required<HTMLInputElement>('#range');
const readout = required<HTMLElement>('#readout');
const spark = required<HTMLCanvasElement>('#spark');
const tooltip = required<HTMLElement>('#tooltip');
const stage = required<HTMLElement>('#stage');
const canvas = required<HTMLCanvasElement>('#map');
const fileInput = required<HTMLInputElement>('#file');
const demoButton = required<HTMLButtonElement>('#demo');

let dataset: Dataset | null = null;
let frame = 0;
let playing = false;
let speed = 1;
let pinnedPath: string | null = null;
let lastTick = performance.now();
let accumulated = 0;

const handlers: MapHandlers = {
  hover(tile, point) {
    if (pinnedPath) return;
    showTooltip(tile, point);
  },
  select(tile) {
    pinnedPath = tile && pinnedPath === tile.file.path ? null : tile?.file.path ?? null;
    map.focus(pinnedPath);
    markHotspots();
    if (!tile || !pinnedPath) {
      tooltip.hidden = true;
      return;
    }
    const box = map.tileBox(tile.file.path);
    showTooltip(tile, box ? { x: box.x + box.w / 2, y: box.y + 8 } : null);
  },
};

const map = new WeatherMap(canvas, handlers);
renderLegend();

demoButton.addEventListener('click', () => {
  void loadUrl(datasetUrl());
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    loadData(JSON.parse(text) as unknown);
  }).catch(() => {
    nowcast.textContent = 'That file is not a codebase-weather dataset.';
  });
});
play.addEventListener('click', togglePlay);
range.addEventListener('pointerdown', () => {
  playing = false;
  syncPlay();
});
range.addEventListener('input', () => setFrame(Number(range.value), false));
for (const button of document.querySelectorAll<HTMLButtonElement>('.speeds button')) {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed ?? 1);
    for (const peer of document.querySelectorAll<HTMLButtonElement>('.speeds button')) {
      peer.setAttribute('aria-pressed', peer === button ? 'true' : 'false');
    }
  });
}
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (!dataset) return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'ArrowRight') setFrame(frame + 1);
  else if (event.key === 'ArrowLeft') setFrame(frame - 1);
  else if (event.key === 'Home') setFrame(0);
  else if (event.key === 'End') setFrame(dataset.frames.length - 1);
});
new ResizeObserver(() => drawSpark()).observe(required<HTMLElement>('.scrub'));
document.fonts?.ready.then(() => map.invalidate()).catch(() => undefined);

void loadUrl(datasetUrl()).catch((error: unknown) => {
  nowcast.textContent = error instanceof Error ? error.message : 'Could not load the dataset.';
});
requestAnimationFrame(loop);

function loop(now: number): void {
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  if (playing && dataset) {
    accumulated += dt * speed;
    while (accumulated > 0.88) {
      accumulated -= 0.88;
      if (frame >= dataset.frames.length - 1) {
        playing = false;
        syncPlay();
        break;
      }
      setFrame(frame + 1, false);
    }
  }
  map.render(now);
  requestAnimationFrame(loop);
}

async function loadUrl(url: string): Promise<void> {
  nowcast.textContent = 'Reading the station log…';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}`);
  loadData((await response.json()) as unknown);
}

function loadData(value: unknown): void {
  if (!isDataset(value)) {
    nowcast.textContent = 'That file is not a codebase-weather dataset.';
    return;
  }
  dataset = value;
  pinnedPath = null;
  frame = Math.max(0, value.frames.length - 1);
  playing = false;
  map.setDataset(value);
  map.setFrame(frame);
  paintStatic();
  syncFrame(true);
  syncPlay();
}

function paintStatic(): void {
  if (!dataset) return;
  document.title = `${dataset.repo.name} · Codebase Weather`;
  eyebrow.textContent = dataset.repo.sample
    ? `Sample station · ${dataset.repo.name}`
    : `Station · ${dataset.repo.name}`;
  outlook.textContent = dataset.forecast.outlook;
  summary.textContent = dataset.forecast.summary;
  metrics.textContent = [
    dataset.metrics.churn,
    dataset.metrics.pressure,
    dataset.metrics.rain,
    dataset.metrics.territory,
    dataset.metrics.relief,
  ].join(' ');
  hotspots.replaceChildren();
  for (const hotspot of dataset.forecast.hotspots) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot';
    button.dataset.path = hotspot.path;
    button.setAttribute('aria-pressed', 'false');
    const width = Math.round(hotspot.risk * 100);
    button.innerHTML = `<span class="hotspot-top"><span class="path">${escapeHtml(hotspot.path)}</span><span class="risk">${hotspot.risk.toFixed(2)}</span></span><span class="meter" aria-hidden="true"><span style="width:${width}%"></span></span><span class="reasons">${escapeHtml(hotspot.reasons[0] ?? '')}</span>`;
    button.addEventListener('click', () => pinPath(hotspot.path));
    hotspots.append(button);
  }
  range.max = String(Math.max(0, dataset.frames.length - 1));
}

function syncFrame(redrawSpark = true): void {
  if (!dataset) return;
  const current = dataset.frames[frame];
  if (!current) return;
  map.setFrame(frame);
  kicker.textContent = current.label;
  nowcast.textContent = headlineFor(dataset, frame);
  frameCopy.textContent = frameBlurb(dataset, frame);
  readout.textContent = `${current.label} · ${frame + 1}/${dataset.frames.length}`;
  range.value = String(frame);
  range.setAttribute('aria-valuetext', `${current.label}. ${current.headline}`);
  if (redrawSpark) drawSpark();
  if (pinnedPath) {
    const tile = map.tileBox(pinnedPath);
    showTooltip(tile, tile ? { x: tile.x + tile.w / 2, y: tile.y + 8 } : null);
  }
}

function setFrame(next: number, redrawSpark = true): void {
  if (!dataset) return;
  frame = clamp(next, 0, dataset.frames.length - 1);
  syncFrame(redrawSpark);
  if (redrawSpark) drawSpark();
  else drawSpark();
}

function togglePlay(): void {
  if (!dataset) return;
  if (!playing && frame >= dataset.frames.length - 1) setFrame(0);
  playing = !playing;
  accumulated = 0;
  syncPlay();
}

function syncPlay(): void {
  play.textContent = playing ? 'Pause' : 'Play';
  play.setAttribute('aria-pressed', playing ? 'true' : 'false');
  play.setAttribute('aria-label', playing ? 'Pause history' : 'Play history');
}

function pinPath(path: string): void {
  pinnedPath = pinnedPath === path ? null : path;
  map.focus(pinnedPath);
  markHotspots();
  const tile = pinnedPath ? map.tileBox(pinnedPath) : null;
  showTooltip(tile, tile ? { x: tile.x + tile.w / 2, y: tile.y + 8 } : null);
}

function markHotspots(): void {
  for (const button of hotspots.querySelectorAll<HTMLButtonElement>('.hotspot')) {
    button.setAttribute('aria-pressed', button.dataset.path === pinnedPath ? 'true' : 'false');
  }
}

function showTooltip(tile: LaidFileLike | null, point: { x: number; y: number } | null): void {
  if (!dataset || !tile || !point) {
    if (!pinnedPath) tooltip.hidden = true;
    return;
  }
  const ownerIndex = tile.file.series.owner[frame] ?? -1;
  const owner = ownerIndex >= 0 ? dataset.authors[ownerIndex]?.name ?? null : null;
  tooltip.innerHTML = `<p class="meta">${escapeHtml(tile.file.language)} · ${tile.file.loc} lines · complexity ${tile.file.series.complexity[frame] ?? 0}</p><strong>${escapeHtml(tile.file.path)}</strong><p>${escapeHtml(describeTile(tile.file, frame, climateMax(dataset), owner))}</p>`;
  tooltip.hidden = false;
  const maxLeft = stage.clientWidth - tooltip.offsetWidth - 8;
  const maxTop = stage.clientHeight - tooltip.offsetHeight - 8;
  tooltip.style.left = `${clamp(point.x + 14, 8, Math.max(8, maxLeft))}px`;
  tooltip.style.top = `${clamp(point.y + 14, 8, Math.max(8, maxTop))}px`;
}

function drawSpark(): void {
  if (!dataset) return;
  const rect = spark.getBoundingClientRect();
  if (rect.width < 2) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  spark.width = Math.floor(rect.width * dpr);
  spark.height = Math.floor(rect.height * dpr);
  const ctx = spark.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const peak = Math.max(1, ...dataset.frames.map((item) => item.totals.churn));
  const slot = width / dataset.frames.length;
  const ceiling = Math.log1p(peak);
  ctx.fillStyle = 'rgba(214, 178, 94, 0.14)';
  ctx.fillRect(0, height - 9, width, 1);
  dataset.frames.forEach((item, index) => {
    const magnitude = Math.log1p(item.totals.churn) / ceiling;
    const bar = Math.max(item.totals.churn > 0 ? 4 : 2, magnitude * (height - 18));
    ctx.fillStyle = index === frame ? '#f3ead7' : 'rgba(214, 178, 94, 0.82)';
    const barWidth = Math.max(2, slot - 3);
    ctx.fillRect(index * slot + 1, height - 10 - bar, barWidth, bar);
    if (item.totals.bugfixes > 0) {
      ctx.fillStyle = '#8ec8d8';
      ctx.fillRect(index * slot + 1, height - 12 - bar, barWidth, 3);
    }
  });
}

function headlineFor(data: Dataset, index: number): string {
  let top: WeatherFile | null = null;
  let topChurn = 0;
  for (const file of data.files) {
    const churn = file.series.churn[index] ?? 0;
    if (churn > topChurn) {
      topChurn = churn;
      top = file;
    }
  }
  if (!top || topChurn <= 0) return 'Quiet water';
  const word = stormWord(topChurn, climateMax(data));
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} over ${top.name}`;
}

function renderLegend(): void {
  const items = [
    ['territory', 'Color is ownership'],
    ['storm', 'Spirals are churn'],
    ['front', 'Gold lines are complexity'],
    ['rain', 'Blue rain is bug-fix commits'],
    ['mist', 'Teal mist is test edits'],
  ];
  legend.replaceChildren();
  for (const [kind, label] of items) {
    const item = document.createElement('li');
    item.innerHTML = `<span class="swatch ${kind}"></span><span>${label}</span>`;
    legend.append(item);
  }
}

function datasetUrl(): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base}demo.json`;
}

function isDataset(value: unknown): value is Dataset {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Dataset>;
  return data.version === 1 && Array.isArray(data.files) && Array.isArray(data.frames) && Array.isArray(data.authors) && !!data.forecast;
}

function required<T extends Element>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[char] ?? char;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface LaidFileLike {
  file: WeatherFile;
}
