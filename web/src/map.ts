import { isTestPath } from '../../analyzer/src/signals.ts';
import type { Author, Dataset } from './types.ts';
import { layoutMap, type LaidDirectory, type LaidFile } from './treemap.ts';

export interface MapHandlers {
  hover: (tile: LaidFile | null, point: { x: number; y: number } | null) => void;
  select: (tile: LaidFile | null, point: { x: number; y: number } | null) => void;
}

interface Drop {
  x: number;
  y: number;
  vy: number;
  len: number;
  wind: number;
  kind: 'rain' | 'mist';
}

const COLS = 48;
const ROWS = 32;

export class WeatherMap {
  private dataset: Dataset | null = null;
  private frame = 0;
  private highlight: string | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private laid: { files: LaidFile[]; directories: LaidDirectory[] } | null = null;
  private terrain = document.createElement('canvas');
  private dirty = true;
  private field: Float64Array | null = null;
  private fieldKey = '';
  private drops: Drop[] = [];
  private stormTiles: LaidFile[] = [];
  private climate = 1;
  private lastRender = 0;
  private reduceMotion: boolean;
  private readonly onPointerMove: (event: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onClick: (event: PointerEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: MapHandlers,
  ) {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onPointerMove = (event) => {
      const point = this.eventPoint(event);
      this.handlers.hover(this.hit(point.x, point.y), point);
    };
    this.onPointerLeave = () => this.handlers.hover(null, null);
    this.onClick = (event) => {
      const point = this.eventPoint(event);
      this.handlers.select(this.hit(point.x, point.y), point);
    };
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('click', this.onClick);
  }

  setDataset(dataset: Dataset): void {
    this.dataset = dataset;
    this.climate = 1;
    for (const file of dataset.files) {
      for (const value of file.series.churn) this.climate = Math.max(this.climate, value);
    }
    this.frame = Math.max(0, dataset.frames.length - 1);
    this.highlight = null;
    this.drops = [];
    this.laid = null;
    this.field = null;
    this.dirty = true;
  }

  setFrame(frame: number): void {
    if (!this.dataset) return;
    const next = clamp(frame, 0, this.dataset.frames.length - 1);
    if (next === this.frame) return;
    this.frame = next;
    this.field = null;
    this.dirty = true;
  }

  focus(path: string | null): void {
    this.highlight = path;
  }

  invalidate(): void {
    this.dirty = true;
  }

  tileBox(path: string): LaidFile | null {
    return this.laid?.files.find((tile) => tile.file.path === path) ?? null;
  }

  currentFrame(): number {
    return this.frame;
  }

  render(time: number): void {
    this.resize();
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.dataset || !this.laid) {
      this.paintWater(ctx);
      return;
    }
    if (this.dirty) {
      this.refreshStorms();
      this.drawTerrain();
      this.dirty = false;
    }
    ctx.drawImage(this.terrain, 0, 0, this.width, this.height);
    this.ensureField();
    if (this.field) {
      drawIsolines(ctx, this.field, COLS, ROWS, this.width, this.height, this.reduceMotion ? 0 : time);
    }
    const dt = this.lastRender === 0 ? 1 / 60 : Math.min(0.05, (time - this.lastRender) / 1000);
    this.lastRender = time;
    this.drawStorms(ctx, time);
    this.drawRain(ctx, dt);
    this.drawLabels(ctx);
    this.drawHighlight(ctx);
    this.drawVignette(ctx);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height && dpr === this.dpr && this.laid) return;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.laid = this.dataset ? layoutMap(this.dataset.files, width, height) : null;
    this.field = null;
    this.dirty = true;
  }

  private refreshStorms(): void {
    if (!this.laid) return;
    const frame = this.frame;
    const ranked = [...this.laid.files].sort(
      (a, b) => (b.file.series.churn[frame] ?? 0) - (a.file.series.churn[frame] ?? 0),
    );
    this.stormTiles = ranked
      .filter((tile) => (tile.file.series.churn[frame] ?? 0) / this.climate >= 0.28)
      .slice(0, 5);
  }

  private drawTerrain(): void {
    this.terrain.width = this.canvas.width;
    this.terrain.height = this.canvas.height;
    const ctx = this.terrain.getContext('2d');
    if (!ctx || !this.dataset || !this.laid) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.paintWater(ctx);
    for (const directory of this.laid.directories) {
      roundRect(ctx, directory.x, directory.y, directory.w, directory.h, 12);
      ctx.fillStyle = 'rgba(8, 12, 20, 0.42)';
      ctx.fill();
      if (directory.h > 46 && directory.w > 48) {
        ctx.fillStyle = 'rgba(214, 178, 94, 0.78)';
        ctx.font = '600 10px Figtree, sans-serif';
        ctx.fillText(directoryLabel(directory.directory), directory.x + 10, directory.y + 13);
      }
    }
    const frame = this.frame;
    for (const tile of this.laid.files) {
      const alive = (tile.file.series.net[frame] ?? 0) > 0;
      const owner = authorAt(this.dataset, tile.file.series.owner[frame] ?? -1);
      const complexity = tile.file.series.complexity[frame] ?? 0;
      const elevation = clamp(complexity / 36, 0, 1);
      roundRect(ctx, tile.x + 1, tile.y + 1, Math.max(0, tile.w - 2), Math.max(0, tile.h - 2), 5);
      if (!alive) {
        ctx.fillStyle = '#141b28';
        ctx.fill();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(214, 178, 94, 0.18)';
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const pigment = owner?.color ?? '#8d97a8';
      const ridge = mixHex(mixHex(pigment, '#243044', 0.55), '#f4ecdf', 0.12 + elevation * 0.28);
      const shade = mixHex(mixHex(pigment, '#141b28', 0.62), '#07090d', 0.25);
      const gradient = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + tile.h);
      gradient.addColorStop(0, ridge);
      gradient.addColorStop(1, shade);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = mixHex(pigment, '#f4ecdf', 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (complexity >= 12 && tile.w > 28 && tile.h > 20) {
        ctx.strokeStyle = 'rgba(244, 236, 223, 0.16)';
        roundRect(ctx, tile.x + 5, tile.y + 5, tile.w - 10, tile.h - 10, 3);
        ctx.stroke();
      }
    }
  }

  private paintWater(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#1a2740');
    gradient.addColorStop(0.55, '#10182a');
    gradient.addColorStop(1, '#070b12');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    const moon = ctx.createRadialGradient(this.width * 0.82, this.height * 0.18, 0, this.width * 0.82, 40, this.width * 0.45);
    moon.addColorStop(0, 'rgba(214, 178, 94, 0.16)');
    moon.addColorStop(1, 'rgba(214, 178, 94, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = 'rgba(214, 178, 94, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 18; y < this.height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  private ensureField(): void {
    if (!this.laid) return;
    const key = `${this.width}x${this.height}:${this.frame}:${this.laid.files.length}`;
    if (this.field && this.fieldKey === key) return;
    this.fieldKey = key;
    this.field = buildField(this.laid.files, this.frame, this.width, this.height);
  }

  private drawStorms(ctx: CanvasRenderingContext2D, time: number): void {
    const frame = this.frame;
    for (const tile of this.stormTiles) {
      const churn = tile.file.series.churn[frame] ?? 0;
      const intensity = clamp(churn / this.climate, 0, 1);
      const x = tile.x + tile.w / 2;
      const y = tile.y + tile.h / 2;
      const radius = Math.min(tile.w, tile.h) * (0.42 + intensity * 0.5);
      const spin = this.reduceMotion ? 0.6 : time * 0.00045 * (0.6 + intensity);
      ctx.save();
      const disc = ctx.createRadialGradient(x, y, radius * 0.1, x, y, radius);
      disc.addColorStop(0, `rgba(7, 10, 16, ${0.18 + intensity * 0.35})`);
      disc.addColorStop(1, 'rgba(7, 10, 16, 0)');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.strokeStyle = `rgba(232, 236, 244, ${0.18 + intensity * 0.45})`;
      ctx.lineWidth = 1.25;
      for (let arm = 0; arm < 3; arm += 1) {
        ctx.beginPath();
        for (let step = 0; step <= 28; step += 1) {
          const angle = (step / 28) * 4.4 + (arm * Math.PI * 2) / 3;
          const distance = radius * (0.12 + step / 34);
          const px = Math.cos(angle) * distance;
          const py = Math.sin(angle) * distance * 0.72;
          if (step === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
      if (!this.reduceMotion && intensity > 0.84 && Math.sin(time * 0.004 + x) > 0.985) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = '#f7f4ee';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y - radius * 0.2);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x - 2, y + 2);
        ctx.lineTo(x + 8, y + radius * 0.35);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawRain(ctx: CanvasRenderingContext2D, dt: number): void {
    if (!this.laid) return;
    const frame = this.frame;
    const wind = Math.sin(frame * 1.7) * 0.7;
    if (this.reduceMotion) {
      for (const tile of this.laid.files) this.drawStaticRain(ctx, tile, frame, wind);
      return;
    }
    for (const tile of this.laid.files) {
      if (this.drops.length > 460) break;
      const bugfix = tile.file.series.bugfix[frame] ?? 0;
      const edits = tile.file.series.testEdits[frame] ?? 0;
      const testFile = isTestPath(tile.file.path);
      if (!testFile && bugfix > 0 && Math.random() < Math.min(0.75, (0.22 + Math.min(bugfix, 40) / 50) * dt * 36)) {
        this.drops.push(makeDrop(tile, 'rain', wind));
      }
      if (testFile && edits > 0 && Math.random() < Math.min(0.55, 0.3 * dt * 30)) {
        this.drops.push(makeDrop(tile, 'mist', wind));
      }
    }
    ctx.lineWidth = 1;
    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      if (!drop) continue;
      drop.y += drop.vy * dt;
      drop.x += drop.wind * 28 * dt;
      if (drop.y > this.height + 8) {
        this.drops.splice(index, 1);
        continue;
      }
      ctx.strokeStyle = drop.kind === 'rain' ? 'rgba(190, 220, 232, 0.75)' : 'rgba(120, 196, 176, 0.55)';
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x + drop.wind * 4, drop.y + drop.len);
      ctx.stroke();
    }
  }

  private drawStaticRain(ctx: CanvasRenderingContext2D, tile: LaidFile, frame: number, wind: number): void {
    const bugfix = tile.file.series.bugfix[frame] ?? 0;
    const edits = tile.file.series.testEdits[frame] ?? 0;
    const testFile = isTestPath(tile.file.path);
    const count = testFile ? (edits > 0 ? 6 : 0) : bugfix > 0 ? 8 : 0;
    ctx.strokeStyle = testFile ? 'rgba(120, 196, 176, 0.7)' : 'rgba(190, 220, 232, 0.8)';
    for (let index = 0; index < count; index += 1) {
      const seed = hash(`${tile.file.path}:${frame}:${index}`);
      const x = tile.x + (seed % 1000) / 1000 * tile.w;
      const y = tile.y + ((seed >>> 10) % 1000) / 1000 * tile.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + wind * 4, y + 8);
      ctx.stroke();
    }
  }

  private drawLabels(ctx: CanvasRenderingContext2D): void {
    if (!this.dataset) return;
    const frame = this.frame;
    ctx.font = '600 12px Figtree, sans-serif';
    ctx.textBaseline = 'middle';
    for (const tile of this.laid?.files ?? []) {
      if ((tile.file.series.net[frame] ?? 0) <= 0 || tile.w < 58 || tile.h < 22) continue;
      const accompanied = accompaniedSoFar(tile.file.series.accompanied, frame);
      ctx.fillStyle = 'rgba(9, 12, 18, 0.45)';
      const label = ellipsize(ctx, tile.file.name, tile.w - (accompanied ? 22 : 12));
      ctx.fillText(label, tile.x + 7, tile.y + tile.h / 2 + 1);
      ctx.fillStyle = 'rgba(244, 236, 223, 0.94)';
      ctx.fillText(label, tile.x + 6, tile.y + tile.h / 2);
      if (accompanied) {
        ctx.fillStyle = '#7dcebb';
        ctx.fillRect(tile.x + tile.w - 12, tile.y + 6, 5, 5);
      }
    }
  }

  private drawHighlight(ctx: CanvasRenderingContext2D): void {
    if (!this.highlight || !this.laid) return;
    const tile = this.laid.files.find((entry) => entry.file.path === this.highlight);
    if (!tile) return;
    ctx.save();
    ctx.strokeStyle = '#f4ecdf';
    ctx.lineWidth = 2;
    roundRect(ctx, tile.x + 1, tile.y + 1, Math.max(0, tile.w - 2), Math.max(0, tile.h - 2), 5);
    ctx.stroke();
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const vignette = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.35,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private hit(x: number, y: number): LaidFile | null {
    const tiles = this.laid?.files ?? [];
    for (let index = tiles.length - 1; index >= 0; index -= 1) {
      const tile = tiles[index];
      if (!tile) continue;
      if (x >= tile.x && y >= tile.y && x <= tile.x + tile.w && y <= tile.y + tile.h) return tile;
    }
    return null;
  }

  private eventPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

function authorAt(dataset: Dataset, index: number): Author | null {
  if (index < 0) return null;
  return dataset.authors[index] ?? null;
}

function accompaniedSoFar(values: number[], frame: number): boolean {
  for (let index = 0; index <= frame && index < values.length; index += 1) {
    if ((values[index] ?? 0) > 0) return true;
  }
  return false;
}

function makeDrop(tile: LaidFile, kind: Drop['kind'], wind: number): Drop {
  return {
    x: tile.x + Math.random() * tile.w,
    y: tile.y + Math.random() * tile.h,
    vy: kind === 'rain' ? 320 + Math.random() * 220 : 90 + Math.random() * 70,
    len: kind === 'rain' ? 8 + Math.random() * 8 : 4 + Math.random() * 4,
    wind,
    kind,
  };
}

function buildField(tiles: LaidFile[], frame: number, width: number, height: number): Float64Array {
  const field = new Float64Array(COLS * ROWS);
  for (const tile of tiles) {
    const value = tile.file.series.complexity[frame] ?? 0;
    if (value <= 0 || tile.w <= 0 || tile.h <= 0 || width <= 0 || height <= 0) continue;
    const x0 = clampIndex(Math.floor((tile.x / width) * (COLS - 1)) - 1, COLS);
    const x1 = clampIndex(Math.ceil(((tile.x + tile.w) / width) * (COLS - 1)) + 1, COLS);
    const y0 = clampIndex(Math.floor((tile.y / height) * (ROWS - 1)) - 1, ROWS);
    const y1 = clampIndex(Math.ceil(((tile.y + tile.h) / height) * (ROWS - 1)) + 1, ROWS);
    const cx = tile.x + tile.w / 2;
    const cy = tile.y + tile.h / 2;
    for (let gy = y0; gy <= y1; gy += 1) {
      for (let gx = x0; gx <= x1; gx += 1) {
        const px = (gx / (COLS - 1)) * width;
        const py = (gy / (ROWS - 1)) * height;
        const dx = (px - cx) / (tile.w * 0.65);
        const dy = (py - cy) / (tile.h * 0.65);
        const cell = gy * COLS + gx;
        field[cell] = (field[cell] ?? 0) + value * Math.exp(-(dx * dx + dy * dy) * 1.35);
      }
    }
  }
  return field;
}

const EDGE_PAIRS: Array<Array<[number, number]>> = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 0], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 1], [2, 3]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[0, 3]],
  [],
];

function drawIsolines(
  ctx: CanvasRenderingContext2D,
  field: Float64Array,
  cols: number,
  rows: number,
  width: number,
  height: number,
  time: number,
): void {
  let max = 0;
  for (const value of field) if (value > max) max = value;
  if (max <= 0) return;
  const levels = [0.32, 0.5, 0.68, 0.84].map((ratio) => max * ratio);
  ctx.save();
  ctx.lineWidth = 1.35;
  ctx.setLineDash([7, 8]);
  ctx.lineDashOffset = -time * 0.02;
  ctx.lineJoin = 'round';
  levels.forEach((level, index) => {
    ctx.strokeStyle = index % 2 === 0 ? 'rgba(214, 178, 94, 0.78)' : 'rgba(244, 236, 223, 0.42)';
    ctx.beginPath();
    for (let y = 0; y < rows - 1; y += 1) {
      for (let x = 0; x < cols - 1; x += 1) {
        const v0 = field[y * cols + x] ?? 0;
        const v1 = field[y * cols + x + 1] ?? 0;
        const v2 = field[(y + 1) * cols + x + 1] ?? 0;
        const v3 = field[(y + 1) * cols + x] ?? 0;
        let mask = 0;
        if (v0 >= level) mask |= 1;
        if (v1 >= level) mask |= 2;
        if (v2 >= level) mask |= 4;
        if (v3 >= level) mask |= 8;
        const corners = [
          pointAt(x, y, cols, rows, width, height),
          pointAt(x + 1, y, cols, rows, width, height),
          pointAt(x + 1, y + 1, cols, rows, width, height),
          pointAt(x, y + 1, cols, rows, width, height),
        ];
        const values = [v0, v1, v2, v3];
        for (const [a, b] of EDGE_PAIRS[mask] ?? []) {
          const start = edgePoint(a ?? 0, corners, values, level);
          const end = edgePoint(b ?? 0, corners, values, level);
          ctx.moveTo(start[0], start[1]);
          ctx.lineTo(end[0], end[1]);
        }
      }
    }
    ctx.stroke();
  });
  ctx.restore();
}

function pointAt(x: number, y: number, cols: number, rows: number, width: number, height: number): [number, number] {
  return [(x / (cols - 1)) * width, (y / (rows - 1)) * height];
}

function edgePoint(
  edge: number,
  corners: Array<[number, number]>,
  values: number[],
  level: number,
): [number, number] {
  const pairs: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  const pair = pairs[edge] ?? [0, 1];
  const i0 = pair[0] ?? 0;
  const i1 = pair[1] ?? 1;
  const c0 = corners[i0] ?? [0, 0];
  const c1 = corners[i1] ?? [0, 0];
  const v0 = values[i0] ?? 0;
  const v1 = values[i1] ?? 0;
  const span = v1 - v0;
  const t = span === 0 ? 0.5 : clamp((level - v0) / span, 0, 1);
  return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t];
}

function directoryLabel(directory: string): string {
  if (!directory || directory === 'root') return 'ROOT';
  return directory.split('/').join(' / ').toUpperCase();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > max) next = next.slice(0, -1);
  return `${next}…`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mixHex(a: string, b: string, t: number): string {
  const from = hex(a);
  const to = hex(b);
  const amount = clamp(t, 0, 1);
  const channel = (index: number) => Math.round((from[index] ?? 0) + ((to[index] ?? 0) - (from[index] ?? 0)) * amount);
  return `#${channel(0).toString(16).padStart(2, '0')}${channel(1).toString(16).padStart(2, '0')}${channel(2).toString(16).padStart(2, '0')}`;
}

function hex(value: string): [number, number, number] {
  const raw = value.replace('#', '');
  return [Number.parseInt(raw.slice(0, 2), 16), Number.parseInt(raw.slice(2, 4), 16), Number.parseInt(raw.slice(4, 6), 16)];
}

function hash(value: string): number {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampIndex(value: number, limit: number): number {
  return clamp(value, 0, limit - 1);
}
