export interface QueryOptions {
  text: string;
  caseSensitive: boolean;
  regex: boolean;
}

export type CompiledQuery =
  | { kind: 'empty' }
  | { kind: 'ok'; test: RegExp; highlight: RegExp }
  | { kind: 'error'; message: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Turns the search box into regular expressions: one for testing a line, and
 * a global one for finding every match to highlight. Plain text is matched
 * literally; an invalid regex is reported instead of throwing.
 *
 * Spaces are part of the search, exactly as typed: " steps" finds "Test Steps"
 * but not "diagnosticSteps". Only an all-space search counts as empty.
 */
export function compileQuery(o: QueryOptions): CompiledQuery {
  if (o.text.trim() === '') return { kind: 'empty' };
  const text = o.text;
  const source = o.regex ? text : escapeRegExp(text);
  const flags = o.caseSensitive ? '' : 'i';
  try {
    const test = new RegExp(source, flags);
    if (test.test('')) return { kind: 'error', message: 'This pattern matches empty text' };
    return { kind: 'ok', test, highlight: new RegExp(source, flags + 'g') };
  } catch (e) {
    return { kind: 'error', message: (e as Error).message };
  }
}
