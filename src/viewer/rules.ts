import type { Pattern } from '../core/highlights';
import { compileQuery } from '../core/query';

export interface HighlightRule {
  term: string;
  color: number;
  /** The term is a regular expression (saved from a regex search). */
  regex?: boolean;
}

const STORAGE_KEY = 'highlightRules';
export const COLOR_COUNT = 6;
export const MAX_RULES = 20;

/** Highlight rules, saved in extension storage so they apply to every log. */
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
          .map((r) => ({ term: r.term, color: r.color, ...(r.regex === true ? { regex: true } : {}) }))
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

  add(term: string, regex = false): boolean {
    const t = term.trim();
    if (!t || this.rules.length >= MAX_RULES) return false;
    if (regex && compileQuery({ text: t, caseSensitive: false, regex: true }).kind !== 'ok') return false;
    if (this.rules.some((r) => r.term.toLowerCase() === t.toLowerCase() && !!r.regex === regex)) return false;
    const used = new Set(this.rules.map((r) => r.color));
    let color = 0;
    while (used.has(color) && color < COLOR_COUNT - 1) color++;
    if (used.has(color)) color = this.rules.length % COLOR_COUNT;
    this.rules = [...this.rules, { term: t, color, ...(regex ? { regex: true } : {}) }];
    this.save();
    return true;
  }

  remove(index: number): void {
    this.rules = this.rules.filter((_, i) => i !== index);
    this.save();
  }

  /** Patterns for splitTagged: terms match literally (or as a regex if saved as one), ignoring case. */
  patterns(): Pattern[] {
    const out: Pattern[] = [];
    for (const r of this.rules) {
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
