export const PALETTE = [
  '#d4764e',
  '#6aa8c8',
  '#7d9a78',
  '#d6b25e',
  '#c47b8a',
  '#8f7bb5',
  '#4f9d8d',
  '#c9844a',
];

export function colorFor(index: number): string {
  if (index < PALETTE.length) return PALETTE[index] ?? PALETTE[0];
  const hue = Math.round((index * 137.508) % 360);
  return hslToHex(hue, 42, 62);
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lig - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
