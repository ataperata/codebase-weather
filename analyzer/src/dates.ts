const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function normalizeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const full = date.toISOString();
  return full.endsWith('.000Z') ? full.slice(0, -5) + 'Z' : full;
}

interface UtcParts {
  y: number;
  m: number;
  d: number;
}

function utcParts(iso: string): UtcParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

export function formatSpan(startIso: string, endIso: string): string {
  const start = utcParts(startIso);
  const end = utcParts(endIso);
  if (!start || !end) return startIso;
  if (start.y === end.y && start.m === end.m && start.d === end.d) {
    return `${start.d} ${MONTHS[start.m]} ${start.y}`;
  }
  if (start.y === end.y && start.m === end.m) {
    return `${start.d}–${end.d} ${MONTHS[start.m]} ${start.y}`;
  }
  if (start.y === end.y) {
    return `${start.d} ${MONTHS[start.m]} – ${end.d} ${MONTHS[end.m]} ${start.y}`;
  }
  return `${start.d} ${MONTHS[start.m]} ${start.y} – ${end.d} ${MONTHS[end.m]} ${end.y}`;
}

export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
