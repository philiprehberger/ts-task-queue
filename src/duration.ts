const UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

export function parseDuration(value: string | number): number {
  if (typeof value === 'number') return value;

  const match = value.match(DURATION_RE);
  if (!match) {
    throw new Error(`Invalid duration: "${value}". Use format like "5m", "1h", "30s", "100ms", "1d"`);
  }

  return parseInt(match[1], 10) * UNITS[match[2]];
}
