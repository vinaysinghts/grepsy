import { describe, expect, it } from 'vitest';
import { RuleStore } from '../src/viewer/rules';

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
    expect(s.rules[1]).toEqual({ term: 'user_id=7', color, highlight: false });
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
});

describe('RuleStore quick filters', () => {
  it('adds filters without coloring them, unless asked', () => {
    const s = new RuleStore();
    s.add('timeout');
    s.add('retry', false, true);
    expect(s.rules.map((r) => r.highlight)).toEqual([false, true]);
    expect(s.patterns()).toHaveLength(1);
  });

  it('marks a filter as a highlight and back', () => {
    const s = store('timeout');
    s.toggleHighlight(0);
    expect(s.patterns()).toHaveLength(1);
    s.toggleHighlight(0);
    expect(s.patterns()).toHaveLength(0);
  });

  it('keeps terms saved before quick filters highlighted', async () => {
    const saved = [{ term: 'old', color: 2 }, { term: 'new', color: 1, highlight: false }];
    (globalThis as { chrome?: unknown }).chrome = { storage: { local: { get: async () => ({ highlightRules: saved }), set: async () => {} } } };
    try {
      const s = new RuleStore();
      await s.load();
      expect(s.rules.map((r) => [r.term, r.highlight])).toEqual([['old', true], ['new', false]]);
    } finally {
      delete (globalThis as { chrome?: unknown }).chrome;
    }
  });
});
