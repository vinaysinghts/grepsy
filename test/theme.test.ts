import { describe, expect, it } from 'vitest';
import { nextTheme, parseTheme, resolveTheme } from '../src/viewer/theme';

describe('theme', () => {
  it('cycles auto, light, dark', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });

  it('falls back to auto for unknown saved values', () => {
    expect(parseTheme(null)).toBe('auto');
    expect(parseTheme('sepia')).toBe('auto');
    expect(parseTheme('light')).toBe('light');
  });

  it('follows the system only in auto', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});
