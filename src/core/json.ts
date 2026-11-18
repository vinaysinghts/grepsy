/**
 * Finds the first JSON object or array embedded in a log line, such as
 * `ERROR payment failed {"order":"A-1182","code":504}`. Brackets inside
 * strings are skipped, so `{"msg":"a } b"}` is read correctly.
 * Returns the parsed value and where it sits in the line, or null.
 */
export function extractJson(line: string): { value: unknown; start: number; end: number } | null {
  for (let start = 0; start < line.length; start++) {
    const open = line[start];
    if (open !== '{' && open !== '[') continue;
    const end = matchBracket(line, start);
    if (end === -1) continue;
    const candidate = line.slice(start, end + 1);
    // Skip things like "[gateway]" or "{}" that are valid but carry nothing.
    if (candidate.length < 3) continue;
    try {
      const value: unknown = JSON.parse(candidate);
      if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
        return { value, start, end: end + 1 };
      }
    } catch {
      // Not JSON; keep looking further along the line.
    }
  }
  return null;
}

function matchBracket(s: string, from: number): number {
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

/** Cheap pre-check used while rendering, before trying a full parse. */
export function mayContainJson(line: string): boolean {
  return line.includes('{"') || line.includes('[{') || line.includes('["');
}
