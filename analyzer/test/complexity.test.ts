import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateComplexity } from '../src/complexity.ts';

test('counts branches, boolean operators, and ternaries', () => {
  const source = `
    function f(a, b) {
      if (a && b) return 1;
      for (let i = 0; i < 3; i++) {
        if (i) n++;
      }
      return a ? 1 : 0;
    }
  `;
  assert.equal(estimateComplexity(source).complexity, 6);
});

test('ignores decisions hiding in strings and comments', () => {
  const source = [
    '// if (a && b)',
    'const label = "if (a && b) { for (;;) {} }";',
    '# python style note',
    'function f() {',
    '  return 1;',
    '}',
  ].join('\n');
  assert.equal(estimateComplexity(source).complexity, 1);
  assert.equal(estimateComplexity(source).loc, 4);
});

test('does not treat optional chaining as a ternary', () => {
  const source = `function f(value) { return value?.name ?? value; }`;
  assert.equal(estimateComplexity(source).complexity, 1);
});
