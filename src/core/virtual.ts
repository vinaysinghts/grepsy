/** Browsers cap element height (Chrome at ~33.5M px), so tall lists are scaled. */
export const MAX_SCROLL_HEIGHT = 15_000_000;

export interface Window {
  /** First row to draw. */
  first: number;
  /** How many rows to draw. */
  count: number;
  /** Pixel offset of the first drawn row inside the scroll content. */
  offset: number;
  /** Height of the scroll content. */
  totalHeight: number;
}

/**
 * Works out which rows are on screen for a scroll position. Lists taller than
 * MAX_SCROLL_HEIGHT map the scrollbar proportionally onto rows, so a
 * 10-million-line file still scrolls from top to bottom.
 */
export function computeWindow(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
  overscan = 10,
): Window {
  const fullHeight = rowCount * rowHeight;
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + 1;
  if (fullHeight <= MAX_SCROLL_HEIGHT) {
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const last = Math.min(rowCount, first + visibleRows + overscan * 2);
    return { first, count: Math.max(0, last - first), offset: first * rowHeight, totalHeight: fullHeight };
  }
  const totalHeight = MAX_SCROLL_HEIGHT;
  const maxScroll = Math.max(1, totalHeight - viewportHeight);
  const ratio = Math.min(1, Math.max(0, scrollTop / maxScroll));
  const topRow = Math.round(ratio * Math.max(0, rowCount - visibleRows + 1));
  const first = Math.max(0, topRow - overscan);
  const last = Math.min(rowCount, topRow + visibleRows + overscan);
  return { first, count: last - first, offset: scrollTop - (topRow - first) * rowHeight, totalHeight };
}

/** Scroll position that puts `row` at the top of the viewport. */
export function scrollTopForRow(row: number, viewportHeight: number, rowCount: number, rowHeight: number): number {
  const fullHeight = rowCount * rowHeight;
  if (fullHeight <= MAX_SCROLL_HEIGHT) return row * rowHeight;
  const visibleRows = Math.ceil(viewportHeight / rowHeight) + 1;
  const maxScroll = MAX_SCROLL_HEIGHT - viewportHeight;
  return (row / Math.max(1, rowCount - visibleRows + 1)) * maxScroll;
}
