/** Parses simple duration strings like "15m", "7d", "1h" into milliseconds. */
export function parseDurationMs(value: string): number {
  const match = value.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration string: ${value}`);

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * unitMs[unit];
}
