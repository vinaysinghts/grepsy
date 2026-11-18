/**
 * Builds the list of rows the viewer shows: line indexes (>= 0) and "gap"
 * rows standing for a run of hidden lines. A gap row is stored as
 * `-(start + 1)`, where `start` is the first hidden line; it runs up to the
 * next visible line (or the end of the file).
 */
export interface ViewInput {
  lineCount: number;
  /** Whether a line passes the level toggles. */
  levelOn: (i: number) => boolean;
  /** Whether a line matches the search; null when there is no search. */
  isMatch: ((i: number) => boolean) | null;
  /** Hide non-matching lines (true) or only highlight matches (false). */
  filter: boolean;
  /** Lines of context to keep around each match when filtering. */
  context: number;
  /** Lines always shown: bookmarks and gaps the user expanded. */
  forced: (i: number) => boolean;
}

export function buildView(v: ViewInput): Int32Array {
  const n = v.lineCount;
  const useMatches = v.filter && v.isMatch !== null;
  let near: Uint8Array | null = null;
  if (useMatches) {
    near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (v.levelOn(i) && v.isMatch!(i)) {
        const from = Math.max(0, i - v.context);
        const to = Math.min(n - 1, i + v.context);
        for (let j = from; j <= to; j++) near[j] = 1;
      }
    }
  }
  const rows: number[] = [];
  let inGap = false;
  for (let i = 0; i < n; i++) {
    const visible = v.forced(i) || (v.levelOn(i) && (near === null || near[i] === 1));
    if (visible) {
      rows.push(i);
      inGap = false;
    } else if (!inGap) {
      rows.push(-(i + 1));
      inGap = true;
    }
  }
  return Int32Array.from(rows);
}

export function isGap(row: number): boolean {
  return row < 0;
}

export function gapStart(row: number): number {
  return -row - 1;
}

/** First hidden line and the line after the last, for the gap at `rows[index]`. */
export function gapRange(rows: Int32Array, index: number, lineCount: number): [number, number] {
  const start = gapStart(rows[index]!);
  const next = rows[index + 1];
  return [start, next === undefined ? lineCount : next];
}
