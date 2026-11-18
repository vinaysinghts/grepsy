import type { Pattern } from '../core/highlights';
import { compileQuery } from '../core/query';

export interface HighlightRule {
  term: string;
  color: number;
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

  add(term: string): boolean {
    const t = term.trim();
    if (!t || this.rules.length >= MAX_RULES) return false;
    if (this.rules.some((r) => r.term.toLowerCase() === t.toLowerCase())) return false;
    const used = new Set(this.rules.map((r) => r.color));
    let color = 0;
    while (used.has(color) && color < COLOR_COUNT - 1) color++;
    if (used.has(color)) color = this.rules.length % COLOR_COUNT;
    this.rules = [...this.rules, { term: t, color }];
    this.save();
    return true;
  }

  remove(index: number): void {
    this.rules = this.rules.filter((_, i) => i !== index);
    this.save();
  }

  /** Patterns for splitTagged: rule terms match literally, ignoring case. */
  patterns(): Pattern[] {
    const out: Pattern[] = [];
    for (const r of this.rules) {
      const q = compileQuery({ text: r.term, caseSensitive: false, regex: false });
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
