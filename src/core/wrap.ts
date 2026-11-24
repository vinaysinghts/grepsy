/**
 * Word wrap for the virtual log view. The viewer only draws the rows on
 * screen, so it has to know every row's height up front. With a monospace
 * font and `word-break: break-all`, a line of N characters in a box C
 * characters wide takes exactly ceil(N / C) screen lines, so heights can be
 * counted from text length alone, without measuring the DOM.
 *
 * Heights are kept as a prefix sum of screen lines ("units"): `starts[r]` is
 * the first unit of row r, and `starts[rowCount]` is the total.
 */

/** Tab stops in wrapped lines (matches `tab-size` in styles.css). */
export const TAB_SIZE = 4;

/** Screen lines a line of text takes when wrapped at `cols` characters. */
export function visualLines(text: string, cols: number): number {
  if (cols < 1 || text.length <= cols && !text.includes('\t')) return 1;
  let lines = 1;
  let col = 0;
  for (let i = 0; i < text.length; i++) {
    let w = 1;
    if (text.charCodeAt(i) === 9) w = TAB_SIZE - (col % TAB_SIZE);
    if (col + w > cols && col > 0) {
      lines++;
      col = 0;
      if (text.charCodeAt(i) === 9) w = TAB_SIZE;
    }
    col += w;
  }
  return lines;
}

/** Prefix sums of screen lines for `count` rows. */
export function wrapStarts(count: number, unitsOf: (row: number) => number): Uint32Array {
  const starts = new Uint32Array(count + 1);
  let total = 0;
  for (let r = 0; r < count; r++) {
    starts[r] = total;
    total += unitsOf(r);
  }
  starts[count] = total;
  return starts;
}

/** The row holding screen line `unit` (the last row whose start is <= unit). */
export function rowAtUnit(starts: Uint32Array, unit: number): number {
  let lo = 0;
  let hi = starts.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= unit) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** How many characters fit in a box `width` pixels wide, at `charWidth` pixels each. */
export function wrapColumns(width: number, charWidth: number): number {
  return Math.max(20, Math.floor(width / Math.max(1, charWidth)));
}
