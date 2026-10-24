export interface ComplexityReading {
  complexity: number;
  loc: number;
}

/**
 * Decision-point complexity for a source blob.
 * Starts at 1 and adds one for each branch keyword, boolean operator, or ternary.
 * Strings and comments are removed first so prose does not become weather.
 */
export function estimateComplexity(source: string): ComplexityReading {
  const code = stripForComplexity(source);
  const loc = countLoc(source);
  let complexity = 1;
  const patterns = [
    /\b(if|elif|elsif|elseif|for|foreach|while|catch|except|case|when|until)\b/g,
    /&&/g,
    /\|\|/g,
    /\band\b/g,
    /\bor\b/g,
    /(?<!\?)\?(?![:.?])/g,
  ];
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) complexity += matches.length;
  }
  return { complexity, loc };
}

export function heuristicComplexity(loc: number): number {
  return Math.max(1, Math.round(1 + Math.log2(Math.max(1, loc) + 1)));
}

export function countLoc(source: string): number {
  let count = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/')
    ) {
      continue;
    }
    count += 1;
  }
  return count;
}

export function stripForComplexity(source: string): string {
  let out = '';
  let index = 0;
  const length = source.length;
  while (index < length) {
    const current = source[index];
    const next = source[index + 1];
    if (current === '/' && next === '/') {
      while (index < length && source[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (index < length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index = Math.min(length, index + 2);
      continue;
    }
    if (current === '"' || current === "'" || current === '`') {
      index = skipString(source, index);
      out += ' ';
      continue;
    }
    if (current === '#' && isHashComment(source, index)) {
      while (index < length && source[index] !== '\n') index += 1;
      continue;
    }
    out += current ?? '';
    index += 1;
  }
  return out;
}

function isHashComment(source: string, index: number): boolean {
  const previous = index === 0 ? '\n' : source[index - 1];
  const next = source[index + 1] ?? '';
  const previousOk = previous === '\n' || previous === ' ' || previous === '\t' || previous === '\r';
  const nextOk = next === ' ' || next === '\t' || next === '\n' || next === '!' || next === '';
  return previousOk && nextOk;
}

function skipString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const current = source[index];
    if (current === '\\') {
      index += 2;
      continue;
    }
    if (current === quote) return index + 1;
    index += 1;
  }
  return index;
}
