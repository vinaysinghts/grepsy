import { describe, expect, it } from 'vitest';
import { nextLevels } from '../src/core/levelPick';

const all = [1, 2, 3, 4, 0];

describe('nextLevels', () => {
  it('shows only the clicked level', () => {
    expect(nextLevels(all, all, 1, false)).toEqual([1]);
    expect(nextLevels([1], all, 2, false)).toEqual([2]);
  });
  it('shows everything again on a second click', () => {
    expect(nextLevels([1], all, 1, false)).toEqual(all);
  });
  it('adds or removes one level with Ctrl/⌘', () => {
    expect(nextLevels([1], all, 2, true)).toEqual([1, 2]);
    expect(nextLevels([1, 2], all, 1, true)).toEqual([2]);
    expect(nextLevels(all, all, 4, true)).toEqual([1, 2, 3, 0]);
  });
  it('never shows nothing', () => {
    expect(nextLevels([1], all, 1, true)).toEqual(all);
  });
});
