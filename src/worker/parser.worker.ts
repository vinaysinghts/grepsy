/// <reference lib="webworker" />
import { LineStore } from '../core/lineStore';
import { compileQuery } from '../core/query';
import { readLines } from '../core/readLines';
import { buildView, gapRange, isGap } from '../core/view';
import type { Request, Response, Row, ViewQuery } from './protocol';

// All file data lives here, off the main thread. The page only ever asks for
// the rows on screen, so a multi-GB log never blocks scrolling or typing.

declare const self: DedicatedWorkerGlobalScope;

let store = new LineStore();
let rows: Int32Array = new Int32Array(0);
let query: ViewQuery | null = null;
let matcher: RegExp | null = null;
const bookmarks = new Set<number>();
let expanded = new Uint8Array(0);

function post(msg: Response): void {
  self.postMessage(msg);
}

let loadGeneration = 0;

async function open(file: File): Promise<void> {
  // A newer open (another file picked or dropped mid-load) supersedes this
  // one: each load fills its own store and only the latest one is published.
  const generation = ++loadGeneration;
  const started = performance.now();
  const next = new LineStore();
  let bytes = 0;
  let lastReport = 0;
  for await (const batch of readLines(file)) {
    if (generation !== loadGeneration) return;
    next.append(batch);
    for (const l of batch) bytes += l.length + 1;
    const now = performance.now();
    if (now - lastReport > 100) {
      lastReport = now;
      post({ type: 'progress', lines: next.length, bytes, totalBytes: file.size });
    }
  }
  if (generation !== loadGeneration) return;
  store = next;
  bookmarks.clear();
  expanded = new Uint8Array(store.length);
  rows = new Int32Array(0);
  post({ type: 'loaded', lines: store.length, counts: [...store.counts], ms: Math.round(performance.now() - started) });
}

function rebuild(id: number): void {
  if (!query) return;
  const q = compileQuery(query);
  matcher = q.kind === 'ok' ? q.test : null;
  const on = new Uint8Array(8);
  for (const code of query.levels) on[code] = 1;
  const levelOn = (i: number) => on[store.level(i)] === 1;
  // Test every line once; the view and the match count both read this mask.
  let matches = 0;
  let isMatch: ((i: number) => boolean) | null = null;
  if (matcher) {
    const mask = new Uint8Array(store.length);
    for (let i = 0; i < store.length; i++) {
      if (matcher.test(store.text(i))) {
        mask[i] = 1;
        if (levelOn(i)) matches++;
      }
    }
    isMatch = (i) => mask[i] === 1;
  }
  rows = buildView({
    lineCount: store.length,
    levelOn,
    isMatch,
    filter: query.filter,
    context: query.context,
    forced: (i) => bookmarks.has(i) || expanded[i] === 1,
  });
  post({
    type: 'view',
    id,
    rowCount: rows.length,
    matches,
    bookmarks: bookmarks.size,
    error: q.kind === 'error' ? q.message : null,
  });
}

function getRows(id: number, start: number, count: number): void {
  const out: Row[] = [];
  const end = Math.min(rows.length, start + count);
  for (let r = start; r < end; r++) {
    const v = rows[r]!;
    if (isGap(v)) {
      const [s, e] = gapRange(rows, r, store.length);
      out.push({ kind: 'gap', start: s, end: e });
    } else {
      out.push({ kind: 'line', line: v, text: store.text(v), level: store.level(v), bookmarked: bookmarks.has(v) });
    }
  }
  post({ type: 'rows', id, start, rows: out });
}

function find(id: number, fromRow: number, direction: 1 | -1, target: 'match' | 'error' | 'bookmark'): void {
  const hit = (line: number) =>
    target === 'bookmark' ? bookmarks.has(line)
    : target === 'error' ? store.level(line) === 1
    : matcher !== null && matcher.test(store.text(line));
  const n = rows.length;
  for (let step = 1; step <= n; step++) {
    const r = (((fromRow + step * direction) % n) + n) % n;
    const v = rows[r]!;
    if (!isGap(v) && hit(v)) {
      post({ type: 'found', id, row: r });
      return;
    }
  }
  post({ type: 'found', id, row: null });
}

self.onmessage = (e: MessageEvent<Request>) => {
  const m = e.data;
  switch (m.type) {
    case 'open':
      void open(m.file);
      break;
    case 'view':
      query = m.query;
      expanded.fill(0);
      rebuild(m.id);
      break;
    case 'expand':
      expanded.fill(1, m.start, m.end);
      rebuild(m.id);
      break;
    case 'bookmark':
      if (bookmarks.has(m.line)) bookmarks.delete(m.line);
      else bookmarks.add(m.line);
      rebuild(m.id);
      break;
    case 'rows':
      getRows(m.id, m.start, m.count);
      break;
    case 'find':
      find(m.id, m.fromRow, m.direction, m.target);
      break;
  }
};
