export interface IdFormatParts {
  prefix: string;
  padLength: number;
}

/** Parses e.g. "OZN###" → { prefix: "OZN", padLength: 3 } */
export function parseIdFormat(format: string): IdFormatParts {
  const match = format.match(/^([A-Za-z0-9]+)(#+)$/);
  if (!match) {
    return { prefix: "OZN", padLength: 3 };
  }
  return { prefix: match[1].toUpperCase(), padLength: match[2].length };
}

export function buildIdFormat(prefix: string, padLength = 3): string {
  const normalized = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const digits = Math.max(2, Math.min(6, padLength || 3));
  return `${normalized || "OZN"}${"#".repeat(digits)}`;
}
