import { describe, expect, it } from 'vitest';
import { COLOR_COUNT, RuleStore } from '../src/viewer/rules';

// RuleStore saves to chrome.storage when it exists; in Node it keeps rules in memory.
function store(...terms: string[]): RuleStore {
  const s = new RuleStore();
  for (const t of terms) s.add(t);
  return s;
}

describe('RuleStore editing', () => {
  it('changes a term in place, keeping its color', () => {
    const s = store('timeout', 'user_id=42');
    const color = s.rules[1]!.color;
    expect(s.edit(1, 'user_id=7')).toBe(true);
    expect(s.rules[1]).toEqual({ term: 'user_id=7', color });
  });

  it('keeps spaces as typed', () => {
    const s = store('steps');
    expect(s.edit(0, ' steps')).toBe(true);
    expect(s.rules[0]!.term).toBe(' steps');
  });

  it('refuses empty text and duplicates', () => {
    const s = store('a', 'b');
    expect(s.edit(0, '   ')).toBe(false);
    expect(s.edit(0, 'B')).toBe(false);
    expect(s.rules.map((r) => r.term)).toEqual(['a', 'b']);
  });

  it('refuses an invalid pattern for a regex term', () => {
    const s = new RuleStore();
    s.add('user_\\d+', true);
    expect(s.edit(0, '(')).toBe(false);
    expect(s.edit(0, 'order_\\d+')).toBe(true);
  });

  it('cycles colors', () => {
    const s = store('a');
    const start = s.rules[0]!.color;
    s.nextColor(0);
    expect(s.rules[0]!.color).toBe((start + 1) % COLOR_COUNT);
  });
});
