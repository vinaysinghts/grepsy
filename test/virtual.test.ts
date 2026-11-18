import { describe, expect, it } from 'vitest';
import { computeWindow, MAX_SCROLL_HEIGHT, scrollTopForRow } from '../src/core/virtual';

describe('computeWindow', () => {
  it('draws the rows on screen plus overscan', () => {
    const w = computeWindow(2000, 400, 1000, 20, 5);
    expect(w.first).toBe(95);
    expect(w.offset).toBe(95 * 20);
    expect(w.totalHeight).toBe(20_000);
    expect(w.first + w.count).toBeGreaterThanOrEqual(100 + 20);
  });

  it('never goes past the last row', () => {
    const w = computeWindow(19_600, 400, 1000, 20);
    expect(w.first + w.count).toBe(1000);
  });

  it('handles an empty list', () => {
    expect(computeWindow(0, 400, 0, 20)).toEqual({ first: 0, count: 0, offset: 0, totalHeight: 0 });
  });

  it('scales very tall lists so the scrollbar still reaches the end', () => {
    const rows = 50_000_000;
    const top = computeWindow(0, 400, rows, 20);
    expect(top.totalHeight).toBe(MAX_SCROLL_HEIGHT);
    expect(top.first).toBe(0);
    const bottom = computeWindow(MAX_SCROLL_HEIGHT - 400, 400, rows, 20);
    expect(bottom.first + bottom.count).toBe(rows);
  });

  it('scrollTopForRow puts that row on screen', () => {
    for (const rows of [1000, 50_000_000]) {
      const target = Math.floor(rows / 2);
      const top = scrollTopForRow(target, 400, rows, 20);
      const w = computeWindow(top, 400, rows, 20);
      expect(target).toBeGreaterThanOrEqual(w.first);
      expect(target).toBeLessThan(w.first + w.count);
    }
  });
});
