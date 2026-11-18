export interface Pattern {
  /** A global regex, e.g. CompiledQuery.highlight. */
  re: RegExp;
  /** Which style to use: -1 for the search, 0..n for highlight rules. */
  tag: number;
}

export interface TaggedSpan {
  text: string;
  /** null for plain text, otherwise the tag of the pattern that matched. */
  tag: number | null;
}

/**
 * Splits a line by several patterns at once. At each point the earliest
 * match wins; when two start at the same place, the pattern listed first
 * wins, so the search box (listed first) beats highlight rules.
 */
export function splitTagged(line: string, patterns: readonly Pattern[]): TaggedSpan[] {
  const spans: TaggedSpan[] = [];
  let pos = 0;
  let plainStart = 0;
  while (pos < line.length && patterns.length > 0) {
    let bestStart = -1;
    let bestEnd = -1;
    let bestTag = 0;
    for (const p of patterns) {
      p.re.lastIndex = pos;
      let m = p.re.exec(line);
      // Skip empty matches; they would never advance.
      while (m && m[0].length === 0) {
        p.re.lastIndex = m.index + 1;
        m = p.re.exec(line);
      }
      if (m && (bestStart === -1 || m.index < bestStart)) {
        bestStart = m.index;
        bestEnd = m.index + m[0].length;
        bestTag = p.tag;
      }
    }
    if (bestStart === -1) break;
    if (bestStart > plainStart) spans.push({ text: line.slice(plainStart, bestStart), tag: null });
    spans.push({ text: line.slice(bestStart, bestEnd), tag: bestTag });
    pos = plainStart = bestEnd;
  }
  if (plainStart < line.length || spans.length === 0) spans.push({ text: line.slice(plainStart), tag: null });
  return spans;
}
