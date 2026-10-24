import assert from 'node:assert/strict';
import { test } from 'node:test';
import { squarify } from '../src/treemap.ts';

test('a single weight fills the bounds', () => {
  const [box] = squarify([5], { x: 2, y: 3, w: 40, h: 20 });
  assert.ok(box);
  assert.ok(Math.abs(box.x - 2) < 0.01);
  assert.ok(Math.abs(box.y - 3) < 0.01);
  assert.ok(Math.abs(box.w - 40) < 0.01);
  assert.ok(Math.abs(box.h - 20) < 0.01);
});

test('equal weights tile a square without overlap or waste', () => {
  const boxes = squarify([1, 1, 1, 1], { x: 0, y: 0, w: 100, h: 100 });
  const area = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  assert.ok(Math.abs(area - 10000) < 1);
  for (const box of boxes) {
    assert.ok(box.w > 0 && box.h > 0);
    const ratio = Math.max(box.w / box.h, box.h / box.w);
    assert.ok(ratio < 1.2);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.ok(overlap < 0.1);
    }
  }
});
