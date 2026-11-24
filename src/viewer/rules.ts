import type { Pattern } from '../core/highlights';
import { compileQuery } from '../core/query';

export interface HighlightRule {
  term: string;
  color: number;
  /** The term is a regular expression (saved from a regex search). */
  regex?: boolean;
  /** Colored in every log. Off: the filter is only one click away in the list. */
  highlight: boolean;
}

const STORAGE_KEY = 'highlightRules';
export const COLOR_COUNT = 6;
export const MAX_RULES = 20;

/**
 * Quick filters, saved in extension storage so they apply to every log.
 * Each one filters in one click and can also be marked as a highlight.
 * (Stored under the old "highlightRules" key so saved terms carry over.)
 */
export class RuleStore {
  rules: HighlightRule[] = [];
  private listeners: (() => void)[] = [];

  async load(): Promise<void> {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      const saved: unknown = data[STORAGE_KEY];
      if (Array.isArray(saved)) {
        this.rules = saved
          .filter((r): r is HighlightRule => typeof r?.term === 'string' && Number.isInteger(r?.color))
          // Terms saved before quick filters were all highlights, so they stay highlighted.
          .map((r) => ({ term: r.term, color: r.color, highlight: r.highlight !== false, ...(r.regex === true ? { regex: true } : {}) }))
          .slice(0, MAX_RULES);
      }
    } catch {
      // Storage unavailable (e.g. page opened outside the extension): keep rules in memory only.
    }
    this.emit();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  add(term: string, regex = false, highlight = false): boolean {
    // Kept exactly as typed: a leading space is meaningful (" steps" ≠ "steps").
    const t = term;
    if (!t.trim() || this.rules.length >= MAX_RULES) return false;
    if (regex && compileQuery({ text: t, caseSensitive: false, regex: true }).kind !== 'ok') return false;
    if (this.rules.some((r) => r.term.toLowerCase() === t.toLowerCase() && !!r.regex === regex)) return false;
    const used = new Set(this.rules.map((r) => r.color));
    let color = 0;
    while (used.has(color) && color < COLOR_COUNT - 1) color++;
    if (used.has(color)) color = this.rules.length % COLOR_COUNT;
    this.rules = [...this.rules, { term: t, color, highlight, ...(regex ? { regex: true } : {}) }];
    this.save();
    return true;
  }

  /** Changes a saved term's text. Refuses empty, duplicate or (for regex terms) invalid text. */
  edit(index: number, term: string): boolean {
    const rule = this.rules[index];
    if (!rule || !term.trim()) return false;
    const regex = rule.regex === true;
    if (regex && compileQuery({ text: term, caseSensitive: false, regex: true }).kind !== 'ok') return false;
    const clash = this.rules.some(
      (r, i) => i !== index && r.term.toLowerCase() === term.toLowerCase() && !!r.regex === regex,
    );
    if (clash) return false;
    this.rules = this.rules.map((r, i) => (i === index ? { ...r, term } : r));
    this.save();
    return true;
  }

  /** Turns coloring a saved term in every log on or off. */
  toggleHighlight(index: number): void {
    if (!this.rules[index]) return;
    this.rules = this.rules.map((r, i) => (i === index ? { ...r, highlight: !r.highlight } : r));
    this.save();
  }

  remove(index: number): void {
    this.rules = this.rules.filter((_, i) => i !== index);
    this.save();
  }

  /** Patterns for splitTagged, for terms marked as highlights: literal (or regex if saved as one), ignoring case. */
  patterns(): Pattern[] {
    const out: Pattern[] = [];
    for (const r of this.rules) {
      if (!r.highlight) continue;
      const q = compileQuery({ text: r.term, caseSensitive: false, regex: r.regex === true });
      if (q.kind === 'ok') out.push({ re: q.highlight, tag: r.color });
    }
    return out;
  }

  private save(): void {
    try {
      void chrome.storage.local.set({ [STORAGE_KEY]: this.rules });
    } catch {
      // See load().
    }
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
