import type { WeatherFile } from './types.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidFile {
  file: WeatherFile;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidDirectory {
  directory: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function squarify(sizes: number[], bounds: Box): Box[] {
  const result = sizes.map(() => ({ x: bounds.x, y: bounds.y, w: 0, h: 0 }));
  const total = sizes.reduce((sum, size) => sum + Math.max(0, size), 0);
  if (total <= 0 || bounds.w <= 0 || bounds.h <= 0) return result;
  const area = bounds.w * bounds.h;
  const items = sizes
    .map((size, index) => ({ index, area: (Math.max(0, size) / total) * area }))
    .filter((item) => item.area > 0)
    .sort((a, b) => b.area - a.area || a.index - b.index);

  let x = bounds.x;
  let y = bounds.y;
  let w = bounds.w;
  let h = bounds.h;
  let cursor = 0;
  while (cursor < items.length && w > 0.5 && h > 0.5) {
    const short = Math.min(w, h);
    const row: typeof items = [];
    let rowArea = 0;
    let best = Number.POSITIVE_INFINITY;
    while (cursor + row.length < items.length) {
      const next = items[cursor + row.length];
      if (!next) break;
      const nextArea = rowArea + next.area;
      const score = worst([...row, next], nextArea, short);
      if (row.length > 0 && score > best) break;
      row.push(next);
      rowArea = nextArea;
      best = score;
    }
    if (row.length === 0 || rowArea <= 0) break;
    placeRow(row, rowArea, { x, y, w, h }, result);
    const thickness = rowArea / short;
    if (w < h) {
      y += thickness;
      h -= thickness;
    } else {
      x += thickness;
      w -= thickness;
    }
    cursor += row.length;
  }
  return result.map((box) => clampBox(box, bounds));
}

export function layoutMap(files: WeatherFile[], width: number, height: number): {
  files: LaidFile[];
  directories: LaidDirectory[];
} {
  const margin = 12;
  const bounds = {
    x: margin,
    y: margin,
    w: Math.max(0, width - margin * 2),
    h: Math.max(0, height - margin * 2),
  };
  const groups = new Map<string, WeatherFile[]>();
  for (const file of files) {
    const key = file.directory || 'root';
    const list = groups.get(key);
    if (list) list.push(file);
    else groups.set(key, [file]);
  }
  const directories = [...groups.entries()].map(([directory, list]) => ({
    directory,
    list,
    size: list.reduce((sum, file) => sum + Math.max(4, file.loc), 0),
  }));
  const boxes = squarify(
    directories.map((directory) => directory.size),
    bounds,
  );
  const laidDirectories: LaidDirectory[] = [];
  const laidFiles: LaidFile[] = [];
  directories.forEach((directory, index) => {
    const island = inset(boxes[index] ?? bounds, 5);
    laidDirectories.push({ directory: directory.directory, ...island });
    const top = island.h > 46 ? 16 : 4;
    const inner = {
      x: island.x + 4,
      y: island.y + top,
      w: Math.max(0, island.w - 8),
      h: Math.max(0, island.h - top - 4),
    };
    const fileBoxes = squarify(
      directory.list.map((file) => Math.max(4, file.loc)),
      inner,
    );
    directory.list.forEach((file, fileIndex) => {
      const fileBox = fileBoxes[fileIndex] ?? inner;
      laidFiles.push({ file, ...fileBox });
    });
  });
  return { files: laidFiles, directories: laidDirectories };
}

function placeRow(
  row: Array<{ index: number; area: number }>,
  rowArea: number,
  bounds: Box,
  result: Box[],
): void {
  const { x, y, w, h } = bounds;
  if (w < h) {
    const thickness = rowArea / w;
    let offset = 0;
    for (const item of row) {
      const width = item.area / thickness;
      result[item.index] = { x: x + offset, y, w: width, h: thickness };
      offset += width;
    }
    return;
  }
  const thickness = rowArea / h;
  let offset = 0;
  for (const item of row) {
    const height = item.area / thickness;
    result[item.index] = { x, y: y + offset, w: thickness, h: height };
    offset += height;
  }
}

function worst(row: Array<{ area: number }>, rowArea: number, short: number): number {
  if (rowArea <= 0 || short <= 0) return Number.POSITIVE_INFINITY;
  const thickness = rowArea / short;
  let max = 0;
  for (const item of row) {
    const length = item.area / thickness;
    if (length <= 0 || thickness <= 0) return Number.POSITIVE_INFINITY;
    const ratio = Math.max(length / thickness, thickness / length);
    if (ratio > max) max = ratio;
  }
  return max;
}

function inset(box: Box, amount: number): Box {
  return clampBox(
    {
      x: box.x + amount,
      y: box.y + amount,
      w: box.w - amount * 2,
      h: box.h - amount * 2,
    },
    box,
  );
}

function clampBox(box: Box, parent: Box): Box {
  const x = Math.max(parent.x, box.x);
  const y = Math.max(parent.y, box.y);
  const right = Math.min(parent.x + parent.w, box.x + box.w);
  const bottom = Math.min(parent.y + parent.h, box.y + box.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}
