/**
 * Finds JSON and XML values in a log line and lays them out for reading,
 * such as `failed {"order":"A-1182"}` or `got <error code="504">timeout</error>`.
 * A line can hold several; each is returned in order. Other bracketed text
 * (`[main]`, `User{id=7}`) is left alone: it is too often just a tag.
 */

export interface Structure {
  /** The text as it appears in the line. */
  raw: string;
  /** Where it starts and ends in the line. */
  start: number;
  end: number;
  /** A name written right before it, like `req` in `req={...}`. */
  name: string;
  kind: 'json' | 'xml';
  /** The value laid out over several lines. */
  pretty: string;
}

/** Cheap pre-check used while rendering, before a full scan. */
export function mayContainStructure(line: string): boolean {
  return line.includes('{"') || line.includes('[{') || line.includes('["') || /<[A-Za-z_][^>]*>/.test(line);
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
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Object.keys(value).length === 0) return null;
    return { raw, end: end + 1, kind: 'json', pretty: JSON.stringify(value, null, 2) };
  } catch {
    return null;
  }
}

/** The index of the bracket closing the one at `from`, skipping JSON strings, or -1. */
function matchJsonBracket(s: string, from: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i;
    }
  }
  return -1;
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
