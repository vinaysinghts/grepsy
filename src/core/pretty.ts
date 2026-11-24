/**
 * Finds structured values in a log line and lays them out for reading:
 * JSON (`{"order":"A-1182"}`), and the bracketed dumps many loggers print
 * that are not JSON, such as Java's `User{id=7, tags=[a, b]}` or Python's
 * `{'a': 1}`. A line can hold several; each is returned in order.
 */

export interface Structure {
  /** The bracketed text as it appears in the line. */
  raw: string;
  /** Where it starts and ends in the line. */
  start: number;
  end: number;
  /** A name written right before the bracket, like `User` in `User{id=7}` or `req` in `req={...}`. */
  name: string;
  /** True when the text is valid JSON. */
  json: boolean;
  /** The value laid out over several lines. */
  pretty: string;
}

/** A `key=` or `key:` pair, which plain tags like `[main]` or `[2026-11-16 10:00]` lack. */
const PAIR = /["']?[A-Za-z_][\w.$-]*["']?\s*[=:]/;

/** Cheap pre-check used while rendering, before a full scan. */
export function mayContainStructure(line: string): boolean {
  return (line.includes('{') || line.includes('[')) && (line.includes('=') || line.includes(':'));
}

/** Every structured value in the line, outermost only, left to right. */
export function findStructures(line: string): Structure[] {
  const out: Structure[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c !== '{' && c !== '[') {
      i++;
      continue;
    }
    const end = matchBracket(line, i);
    if (end === -1) {
      i++;
      continue;
    }
    const raw = line.slice(i, end + 1);
    const found = readStructure(raw);
    if (found) {
      // `User{...}`, `req={...}` or `ctx: {...}` name the value; a plain word before a space does not.
      const name = /([A-Za-z_][\w.$]*)(?:\s*[=:]\s*)?$/.exec(line.slice(0, i))?.[1] ?? '';
      out.push({ raw, start: i, end: end + 1, name, ...found });
      i = end + 1;
    } else {
      i++;
    }
  }
  return out;
}

function readStructure(raw: string): { json: boolean; pretty: string } | null {
  if (raw.length < 3) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
      return { json: true, pretty: JSON.stringify(value, null, 2) };
    }
  } catch {
    // Not JSON: fall through to the loose reading.
  }
  if (!PAIR.test(raw)) return null;
  return { json: false, pretty: prettyLoose(raw) };
}

/**
 * The index of the bracket closing the one at `from`, or -1. Quoted text
 * (single or double quotes) is skipped; if quotes don't pair up, as with an
 * apostrophe in `{msg=don't}`, it tries again ignoring quotes.
 */
export function matchBracket(s: string, from: number): number {
  const withQuotes = scan(s, from, true);
  return withQuotes !== -1 ? withQuotes : scan(s, from, false);
}

function scan(s: string, from: number, quotes: boolean): number {
  const stack: string[] = [];
  let quote = '';
  for (let i = from; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (quotes && (c === '"' || c === "'")) quote = c;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '(') stack.push(')');
    else if (c === '}' || c === ']' || c === ')') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

const OPEN: Record<string, string> = { '{': '}', '[': ']' };

/** Indents a non-JSON dump: a new line after each opening bracket and comma. */
export function prettyLoose(raw: string, indent = '  '): string {
  let out = '';
  let depth = 0;
  let quote = '';
  const nl = () => '\n' + indent.repeat(depth);
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (quote) {
      out += c;
      if (c === '\\' && i + 1 < raw.length) out += raw[++i];
      else if (c === quote) quote = '';
      continue;
    }
    if ((c === '"' || c === "'") && raw.indexOf(c, i + 1) !== -1) {
      quote = c;
      out += c;
    } else if (OPEN[c]) {
      // Keep empty brackets like [] on one line.
      if (raw[i + 1] === OPEN[c]) {
        out += c + OPEN[c];
        i++;
        continue;
      }
      depth++;
      out += c + nl();
      while (raw[i + 1] === ' ') i++;
    } else if (c === '}' || c === ']') {
      depth = Math.max(0, depth - 1);
      out = out.replace(/[ \t]+$/, '') + nl() + c;
    } else if (c === ',') {
      out += c + nl();
      while (raw[i + 1] === ' ') i++;
    } else {
      out += c;
    }
  }
  return out;
}
