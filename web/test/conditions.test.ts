import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pressureWord, rainWord, stormWord } from '../src/conditions.ts';

test('storm, pressure, and rain words follow the scale', () => {
  assert.equal(stormWord(0, 10), 'calm');
  assert.equal(stormWord(1, 10), 'breeze');
  assert.equal(stormWord(9, 10), 'storm');
  assert.equal(pressureWord(0), 'unformed coast');
  assert.equal(pressureWord(4), 'low pressure');
  assert.equal(pressureWord(30), 'high pressure');
  assert.equal(rainWord(0, 0, false), 'dry air');
  assert.equal(rainWord(2, 0, false), 'drizzle');
  assert.equal(rainWord(4, 10, true), 'test mist');
});
