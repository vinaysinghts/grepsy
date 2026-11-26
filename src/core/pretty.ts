/**
 * Finds JSON and XML values in a log line and lays them out for reading,
 * such as `failed {"order":"A-1182"}` or `got <error code="504">timeout</error>`.
 * A line can hold several; each is returned in order. Other bracketed text
 * (`[main]`, `User{id=7}`) is left alone: it is too often just a tag.
 * Python dicts and lists (`{'hosts': None}`) count too, since Python services
 * often log them with `repr()`.
 */

export interface Structure {
  /** The text as it appears in the line. */
  raw: string;
  /** Where it starts and ends in the line. */
  start: number;
  end: number;
  /** A name written right before it, like `req` in `req={...}`. */
  name: string;
  /** `python` is a Python dict or list as `repr()` prints it: `{'a': None, 'b': True}`. */
  kind: 'json' | 'python' | 'xml';
  /** The value laid out over several lines. */
  pretty: string;
}

/** Cheap pre-check used while rendering, before a full scan. */
export function mayContainStructure(line: string): boolean {
  // Whitespace may sit after the bracket: `{ "a": 1 }` and `[ {...} ]` are as common as `{"a":1}`.
  return /[{[]\s*["'{]/.test(line) || /<[A-Za-z_][^>]*>/.test(line);
}

/** How far into a line to look for values; past it, scanning costs too much per row. */
export const MAX_SCANNED_CHARS = 200_000;

/**
 * The values to underline when only the first `drawn` characters of a line
 * are shown. They are found in the whole line, so a long JSON value that runs
 * past the cut still opens in full; its underline stops at the cut.
 */
export function visibleStructures(line: string, drawn: number): Structure[] {
  const scanned = line.length > MAX_SCANNED_CHARS ? line.slice(0, MAX_SCANNED_CHARS) : line;
  if (!mayContainStructure(scanned)) return [];
  return findStructures(scanned)
    .filter((v) => v.start < drawn)
    .map((v) => (v.end > drawn ? { ...v, end: drawn } : v));
}

/** Every JSON or XML value in the line, outermost only, left to right. */
export function findStructures(line: string): Structure[] {
  const out: Structure[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    const found = c === '{' || c === '[' ? readJson(line, i) : c === '<' ? readXml(line, i) : null;
    if (!found) {
      i++;
      continue;
    }
    // `req={...}` or `body: <a/>` name the value; a plain word before a space does not.
    const name = /([A-Za-z_][\w.$]*)(?:\s*[=:]\s*)?$/.exec(line.slice(0, i))?.[1] ?? '';
    out.push({ ...found, start: i, name });
    i = found.end;
  }
  return out;
}

// ---- JSON -----------------------------------------------------------------

function readJson(line: string, start: number): Omit<Structure, 'start' | 'name'> | null {
  const end = matchJsonBracket(line, start);
  if (end === -1) return null;
  const raw = line.slice(start, end + 1);
  if (raw.length < 3) return null;
  let kind: 'json' | 'python' = 'json';
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    const json = pythonToJson(raw);
    if (json === null) return null;
    try {
      value = JSON.parse(json);
      kind = 'python';
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Object.keys(value).length === 0) return null;
  const pretty = kind === 'json' ? JSON.stringify(value, null, 2) : prettyPython(value, '');
  return { raw, end: end + 1, kind, pretty };
}

/** The index of the bracket closing the one at `from`, skipping strings in either quote, or -1. */
function matchJsonBracket(s: string, from: number): number {
  const stack: string[] = [];
  let quote = '';
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

// ---- Python literals ------------------------------------------------------

const PY_WORDS: Record<string, string> = { None: 'null', True: 'true', False: 'false' };
const WORD = /[A-Za-z_]\w*/y;
const NUMBER = /\d[\d.]*(?:[eE][+-]?\d+)?/y;

/**
 * Rewrites a Python dict or list literal as JSON text, or returns null when
 * it holds anything else (a call, a set, a bare name). Strings may use either
 * quote; None, True and False become JSON words; a trailing comma is dropped.
 */
function pythonToJson(src: string): string | null {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      let text = '';
      let j = i + 1;
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] !== '\\') {
          text += src[j];
          continue;
        }
        const e = src[++j];
        if (e === 'x') {
          text += String.fromCharCode(parseInt(src.slice(j + 1, j + 3), 16));
          j += 2;
        } else if (e === 'u') {
          text += String.fromCharCode(parseInt(src.slice(j + 1, j + 5), 16));
          j += 4;
        } else {
          text += { n: '\n', t: '\t', r: '\r', '0': '\0' }[e ?? ''] ?? e ?? '';
        }
      }
      if (j >= src.length) return null;
      out += JSON.stringify(text);
      i = j + 1;
      continue;
    }
    NUMBER.lastIndex = i;
    const num = /\d/.test(c) ? NUMBER.exec(src)?.[0] : undefined;
    if (num) {
      out += num;
      i += num.length;
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(src)?.[0];
    if (word) {
      const json = PY_WORDS[word];
      if (!json) return null;
      out += json;
      i += word.length;
      continue;
    }
    if (c === ',') {
      let k = i + 1;
      while (k < src.length && /\s/.test(src[k]!)) k++;
      if (src[k] === '}' || src[k] === ']') {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/** Lays a value out like Python's pprint would read: single quotes, None, True, False. */
function prettyPython(value: unknown, pad: string): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return pyString(value);
  if (typeof value !== 'object') return String(value);
  const inner = pad + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => inner + prettyPython(v, inner)).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `${inner}${pyString(k)}: ${prettyPython(v, inner)}`).join(',\n')}\n${pad}}`;
}

/** A string as Python's repr writes it: single quotes unless the text holds one. */
function pyString(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
  return q + (q === "'" ? body.replace(/'/g, "\\'") : body) + q;
}

// ---- XML ------------------------------------------------------------------

type Token = { kind: 'open' | 'close' | 'empty' | 'other'; name: string; text: string } | { kind: 'text'; text: string };

const TAG = /^<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/;

/**
 * Reads one XML element starting at `from`: tags must nest and close, and it
 * has to contain a child element or an attribute, so a lone `<id>` or a
 * `<b>x</b>` in prose isn't offered.
 */
function readXml(line: string, from: number): Omit<Structure, 'start' | 'name'> | null {
  const tokens: Token[] = [];
  const stack: string[] = [];
  let i = from;
  let elements = 0;
  let attrs = false;
  while (i < line.length) {
    if (line[i] === '<') {
      const rest = line.slice(i);
      const other = /^<!\[CDATA\[[\s\S]*?\]\]>|^<!--[\s\S]*?-->|^<\?[\s\S]*?\?>/.exec(rest);
      if (other) {
        if (stack.length === 0) return null;
        tokens.push({ kind: 'other', name: '', text: other[0] });
        i += other[0].length;
        continue;
      }
      const m = TAG.exec(rest);
      if (!m) return null;
      const [text, slash, name, attr, self] = m as unknown as [string, string, string, string, string];
      if (attr.trim()) attrs = true;
      if (slash) {
        if (stack.pop() !== name) return null;
        tokens.push({ kind: 'close', name, text });
      } else if (self) {
        tokens.push({ kind: 'empty', name, text });
        elements++;
      } else {
        stack.push(name);
        tokens.push({ kind: 'open', name, text });
        elements++;
      }
      i += text.length;
      if (stack.length === 0) {
        if (elements < 2 && !attrs) return null;
        return { raw: line.slice(from, i), end: i, kind: 'xml', pretty: prettyXml(tokens) };
      }
    } else {
      if (stack.length === 0) return null;
      const next = line.indexOf('<', i);
      const end = next === -1 ? line.length : next;
      tokens.push({ kind: 'text', text: line.slice(i, end) });
      i = end;
    }
  }
  return null;
}

/** One tag per line, indented by depth; short text stays beside its tags. */
function prettyXml(tokens: Token[]): string {
  const lines: string[] = [];
  let depth = 0;
  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t]!;
    const pad = '  '.repeat(depth);
    if (tok.kind === 'open') {
      const text = tokens[t + 1];
      const close = tokens[t + 2];
      // <name>text</name> on one line.
      if (text?.kind === 'text' && close?.kind === 'close') {
        lines.push(pad + tok.text + text.text.trim() + close.text);
        t += 2;
        continue;
      }
      if (text?.kind === 'close') {
        lines.push(pad + tok.text + text.text);
        t += 1;
        continue;
      }
      lines.push(pad + tok.text);
      depth++;
    } else if (tok.kind === 'close') {
      depth = Math.max(0, depth - 1);
      lines.push('  '.repeat(depth) + tok.text);
    } else if (tok.kind === 'text') {
      if (tok.text.trim()) lines.push(pad + tok.text.trim());
    } else {
      lines.push(pad + tok.text);
    }
  }
  return lines.join('\n');
}
