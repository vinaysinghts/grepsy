import { describe, expect, it } from 'vitest';
import { buildView, GAP_STEP, gapRange, gapStep, mergeRange, type ViewInput } from '../src/core/view';

const base: ViewInput = {
  lineCount: 10,
  levelOn: () => true,
  isMatch: null,
  filter: false,
  context: 0,
  forced: () => false,
};
const matchAt = (...lines: number[]) => (i: number) => lines.includes(i);

describe('buildView', () => {
  it('shows every line with no search or filter', () => {
    expect([...buildView(base)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('only highlights when filter is off', () => {
    expect(buildView({ ...base, isMatch: matchAt(3) }).length).toBe(10);
  });

  it('keeps matches and collapses the rest into gaps when filtering', () => {
    const rows = buildView({ ...base, isMatch: matchAt(3, 7), filter: true });
    expect([...rows]).toEqual([-1, 3, -5, 7, -9]);
    expect(gapRange(rows, 0, 10)).toEqual([0, 3]);
    expect(gapRange(rows, 2, 10)).toEqual([4, 7]);
    expect(gapRange(rows, 4, 10)).toEqual([8, 10]);
  });

  it('adds context lines around matches', () => {
    const rows = buildView({ ...base, isMatch: matchAt(5), filter: true, context: 2 });
    expect([...rows]).toEqual([-1, 3, 4, 5, 6, 7, -9]);
  });

  it('clips context at the start and end of the file', () => {
    const rows = buildView({ ...base, isMatch: matchAt(0, 9), filter: true, context: 1 });
    expect([...rows]).toEqual([0, 1, -3, 8, 9]);
  });

  it('hides lines whose level is switched off', () => {
    const rows = buildView({ ...base, levelOn: (i) => i % 2 === 0 });
    expect([...rows]).toEqual([0, -2, 2, -4, 4, -6, 6, -8, 8, -10]);
  });

  it('ignores matches on lines whose level is off', () => {
    const rows = buildView({ ...base, levelOn: (i) => i !== 3, isMatch: matchAt(3), filter: true });
    expect([...rows]).toEqual([-1]);
  });

  it('always shows bookmarked or expanded lines', () => {
    const rows = buildView({ ...base, isMatch: matchAt(2), filter: true, forced: (i) => i === 8 });
    expect([...rows]).toEqual([-1, 2, -4, 8, -10]);
  });

  it('returns no rows for an empty file', () => {
    expect(buildView({ ...base, lineCount: 0 }).length).toBe(0);
  });
});

describe('mergeRange', () => {
  it('keeps separate ranges apart and sorted', () => {
    expect(mergeRange([[20, 25]], [3, 8])).toEqual([[3, 8], [20, 25]]);
  });
  it('joins a range that touches another', () => {
    expect(mergeRange([[3, 8]], [8, 10])).toEqual([[3, 10]]);
    expect(mergeRange([[8, 10]], [3, 8])).toEqual([[3, 10]]);
  });
  it('joins every range it overlaps', () => {
    expect(mergeRange([[0, 2], [4, 6], [9, 12], [30, 31]], [1, 10])).toEqual([[0, 12], [30, 31]]);
  });
  it('ignores an empty range', () => {
    expect(mergeRange([[1, 2]], [5, 5])).toEqual([[1, 2]]);
  });
});

describe('gapStep', () => {
  it('continues down from the line above by default', () => {
    expect(gapStep({ start: 10, end: 100 })).toEqual([10, 10 + GAP_STEP]);
  });
  it('grows an opened block below the gap upwards', () => {
    expect(gapStep({ start: 10, end: 100, beforeRevealed: true })).toEqual([100 - GAP_STEP, 100]);
  });
  it('grows the block above when both sides were opened', () => {
    expect(gapStep({ start: 10, end: 100, afterRevealed: true, beforeRevealed: true })).toEqual([10, 10 + GAP_STEP]);
  });
  it('goes up from the first shown line when the gap starts the file', () => {
    expect(gapStep({ start: 0, end: 50 })).toEqual([50 - GAP_STEP, 50]);
  });
  it('stops at the next shown line', () => {
    expect(gapStep({ start: 4, end: 8 })).toEqual([4, 8]);
    expect(gapStep({ start: 4, end: 8, beforeRevealed: true })).toEqual([4, 8]);
  });
});
