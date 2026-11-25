import { isTextEntry } from '../core/download';
import { splitTagged, type Pattern } from '../core/highlights';
import { visibleStructures, type Structure } from '../core/pretty';
import { LEVEL_COUNT } from '../core/lineStore';
import { nextLevels } from '../core/levelPick';
import { compileQuery } from '../core/query';
import { computeWindow, scrollTopForRow } from '../core/virtual';
import { GAP_SMALL, GAP_STEP } from '../core/view';
import { rowAtUnit, wrapColumns } from '../core/wrap';
import type { Request, Response, Row, ViewQuery } from '../worker/protocol';
import { openShortcuts, setupHelpMenu } from './help';
import { RuleStore } from './rules';
import { fileNameFromUrl } from '../core/autoOpen';
import { rememberRecent } from '../core/recent';
import { VIEW_HEARTBEAT_MS, VIEW_KEY_PREFIX } from '../core/restore';
import { NetworkFailure, fetchAsFile, hasAccess, setupAutoOpen } from './sources';
import { setupTheme } from './theme';

// First, so the page paints in the right theme.
setupTheme();

const ROW_HEIGHT = 20;
const MAX_RENDERED_CHARS = 5000;
const LEVEL_LABELS = ['No level', 'Errors', 'Warnings', 'Info', 'Debug', 'Trace'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const startScreen = $('start');
const viewer = $('viewer');
const fileInput = $<HTMLInputElement>('file');
const drop = $<HTMLLabelElement>('drop');
const progress = $('progress');
const fileName = $('file-name');
const search = $<HTMLInputElement>('q');
const searchBox = search.parentElement!;
const matchCount = $('match-count');
const filterBtn = $<HTMLButtonElement>('filter');
const ctxGroup = $('ctx');
const caseBtn = $<HTMLButtonElement>('case');
const regexBtn = $<HTMLButtonElement>('regex');
const levelsBar = $('levels');
const log = $('log');
const spacer = $('spacer');
const rowsEl = $('rows');
const status = $('status');
const bookmarkStatus = $('bookmark-status');

const worker = new Worker(new URL('../worker/parser.worker.ts', import.meta.url), { type: 'module' });
const send = (m: Request) => worker.postMessage(m);

const state = {
  lines: 0,
  loadMs: 0,
  viewId: 0,
  rowCount: 0,
  matches: 0,
  cache: new Map<number, Row>(),
  requested: '',
  current: -1,
  /** When the last jump landed, so the landing line can flash. */
  flashAt: 0,
  /** Word wrap on, and the screen-line layout for the current view once the worker sends it. */
  wrap: false,
  wrapCols: 0,
  starts: null as Uint32Array | null,
  /** Row to bring back to the top once a new wrap layout arrives (keeps your place on toggle). */
  anchorRow: -1,
  highlight: null as RegExp | null,
  query: { text: '', caseSensitive: false, regex: false, filter: true, context: 0, levels: [] } as ViewQuery,
};

// ---- Opening a file ------------------------------------------------------

const loading = $('loading');
const loadingBar = $('loading-bar');
/** Swaps the start screen for the loading mark while a log downloads or is read. */
function showLoading(title: string, detail = ''): void {
  startScreen.hidden = true;
  loading.hidden = false;
  $('loading-title').textContent = title;
  $('loading-detail').textContent = detail;
  loadingBar.style.width = '0';
}
/** Back to the start screen, e.g. after a failed download (its message is in #progress). */
function showStart(): void {
  loading.hidden = true;
  startScreen.hidden = false;
}

function open(file: File): void {
  progress.textContent = `Reading ${file.name}…`;
  showLoading(`Opening ${file.name}`);
  fileName.textContent = file.name;
  fileName.title = file.name;
  document.title = `${file.name} · Grepsy`;
  send({ type: 'open', file });
}

// Pasting: a button that reveals a text box, or Ctrl+V anywhere on the start screen.
const pasteBox = $('paste-box');
const pasteInput = $<HTMLTextAreaElement>('paste-input');
const openPasted = (text: string) => {
  if (text.trim()) open(new File([text], 'pasted.log', { type: 'text/plain' }));
};
$('paste-btn').addEventListener('click', () => {
  pasteBox.hidden = false;
  pasteInput.focus();
});
$('paste-open').addEventListener('click', () => openPasted(pasteInput.value));
document.addEventListener('paste', (e) => {
  // A paste into a field (the URL box, the paste area) belongs to that field.
  if (startScreen.hidden || isTextEntry(e.target as HTMLElement | null)) return;
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    e.preventDefault();
    openPasted(text);
  }
});

fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) open(f);
});
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
document.addEventListener('dragleave', () => drop.classList.remove('over'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f) open(f);
});
$('home').addEventListener('click', () => {
  location.href = 'viewer.html';
});

// Chrome closes this tab if Grepsy reloads or updates; a fresh note lets the
// background script reopen the log afterwards (see core/restore.ts).
const noteKey = `${VIEW_KEY_PREFIX}${crypto.randomUUID()}`;
let noteTimer = 0;
function keepOpenNote(src: string): void {
  const write = () => void chrome.storage.local.set({ [noteKey]: { src, seen: Date.now() } });
  write();
  clearInterval(noteTimer);
  noteTimer = window.setInterval(write, VIEW_HEARTBEAT_MS);
}
// Not removed on pagehide: Chrome fires it when it closes the tab for an
// update too, which is exactly when the note is needed. A closed tab's note
// simply goes stale.

// Opening by URL: the "Open a URL" box, or ?src= when the background
// script redirected a file:// log tab here.
const urlBox = $<HTMLFormElement>('url-box');
const urlInput = $<HTMLInputElement>('url-input');
/** Opens a log by link; says whether it worked, and if not, whether the request got no answer at all. */
async function openUrl(url: string, askForAccess: boolean): Promise<'ok' | 'network' | 'failed'> {
  progress.classList.remove('error');
  progress.textContent = `Downloading ${url}…`;
  showLoading(`Downloading ${fileNameFromUrl(url)}`, new URL(url).protocol === 'file:' ? 'from this computer' : `from ${new URL(url).host}`);
  try {
    open(await fetchAsFile(url, askForAccess));
    void rememberRecent(chrome.storage.local, url);
    keepOpenNote(url);
    return 'ok';
  } catch (err) {
    showStart();
    progress.classList.add('error');
    progress.textContent = (err as Error).message;
    return err instanceof NetworkFailure ? 'network' : 'failed';
  }
}
$('url-btn').addEventListener('click', () => {
  urlBox.hidden = false;
  urlInput.focus();
});
urlBox.addEventListener('submit', (e) => {
  e.preventDefault();
  void openUrl(urlInput.value.trim(), true);
});
// ?src= comes from the toolbar popup (a link or a recent log) or from an
// auto-opened file:// tab. If the request got no answer and the site still
// needs the user's OK (the browser blocks the response without it), fill in
// the URL box and wait for a click: Chrome only shows the prompt after one.
// A real answer such as a 404 is shown as it is.
const params = new URLSearchParams(location.search);
const src = params.get('src');
if (src) {
  void openUrl(src, false).then(async (result) => {
    if (result !== 'network' || (await hasAccess(src).catch(() => true))) return;
    urlBox.hidden = false;
    urlInput.value = src;
    urlInput.focus();
    progress.classList.remove('error');
    progress.textContent = `Click Open to let Grepsy read from ${new URL(src).host}.`;
  });
}
if (!src) startScreen.hidden = false;
if (params.has('paste')) $('paste-btn').click();
void setupAutoOpen();

// ---- Talking to the worker -----------------------------------------------

worker.onmessage = (e: MessageEvent<Response>) => {
  const m = e.data;
  switch (m.type) {
    case 'progress': {
      const pct = m.totalBytes ? Math.min(99, Math.round((m.bytes / m.totalBytes) * 100)) : 0;
      progress.textContent = `Reading… ${m.lines.toLocaleString()} lines (${pct}%)`;
      loadingBar.style.width = `${pct}%`;
      $('loading-detail').textContent = `${m.lines.toLocaleString()} lines · ${pct}%`;
      break;
    }
    case 'loaded':
      state.lines = m.lines;
      state.loadMs = m.ms;
      buildLevelButtons(m.counts);
      startScreen.hidden = true;
      loading.hidden = true;
      viewer.hidden = false;
      requestView();
      log.focus();
      break;
    case 'view':
      if (m.id !== state.viewId) return;
      state.rowCount = m.rowCount;
      state.matches = m.matches;
      state.cache.clear();
      state.requested = '';
      searchBox.classList.toggle('invalid', m.error !== null);
      searchBox.title = m.error ?? '';
      matchCount.textContent = state.query.text && !m.error ? `${m.matches.toLocaleString()} ${m.matches === 1 ? "match" : "matches"}` : '';
      bookmarkStatus.textContent = m.bookmarks ? `${m.bookmarks} bookmarked` : '';
      $('bookmark-nav').hidden = m.bookmarks === 0;
      status.textContent =
        `${m.rowCount.toLocaleString()} rows · ${state.lines.toLocaleString()} lines · read in ${state.loadMs.toLocaleString()} ms`;
      if (state.wrap) requestWrap(true);
      render();
      break;
    case 'wrap':
      if (m.id !== state.viewId || m.cols !== state.wrapCols || !state.wrap) return;
      state.starts = m.starts;
      if (state.anchorRow >= 0) {
        const row = Math.min(state.anchorRow, state.rowCount - 1);
        state.anchorRow = -1;
        log.scrollTop = scrollTopForRow(m.starts[row]!, log.clientHeight, m.starts[state.rowCount]!, ROW_HEIGHT);
      }
      render();
      break;
    case 'rows':
      if (m.id !== state.viewId) return;
      m.rows.forEach((r, i) => state.cache.set(m.start + i, r));
      render();
      break;
    case 'export':
      void finishExport(m.blob, m.lines);
      break;
    case 'found':
      if (m.id !== state.viewId || m.row === null) return;
      state.current = m.row;
      state.flashAt = performance.now();
      scrollToRow(m.row);
      break;
  }
};

function requestView(): void {
  state.viewId++;
  const q = compileQuery(state.query);
  state.highlight = q.kind === 'ok' ? q.highlight : null;
  send({ type: 'view', id: state.viewId, query: { ...state.query, levels: [...state.query.levels] } });
}

// ---- Rendering ------------------------------------------------------------

let frame = 0;
function render(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    draw();
  });
}

/** The wrap layout, if it matches the rows on show. */
function layout(): Uint32Array | null {
  const st = state.starts;
  return state.wrap && st && st.length === state.rowCount + 1 ? st : null;
}

/** Which rows to draw, and where, in rows (no wrap) or wrapped screen lines. */
function visibleRows(): { first: number; count: number; offset: number; totalHeight: number } {
  const st = layout();
  if (!st) return computeWindow(log.scrollTop, log.clientHeight, state.rowCount, ROW_HEIGHT);
  // Work in screen lines, then map back to whole rows.
  const w = computeWindow(log.scrollTop, log.clientHeight, st[state.rowCount]!, ROW_HEIGHT);
  const first = rowAtUnit(st, w.first);
  const offset = w.offset - (w.first - st[first]!) * ROW_HEIGHT;
  let last = first;
  while (last < state.rowCount && st[last]! < w.first + w.count) last++;
  return { first, count: last - first, offset, totalHeight: w.totalHeight };
}

function draw(): void {
  const st = layout();
  // Wrap is on but the layout for these rows is still on its way: keep the
  // old screen for that moment rather than flash an unwrapped one.
  if (state.wrap && !st && state.rowCount > 0) return;
  const w = visibleRows();
  rowsEl.classList.toggle('wrap', st !== null);
  spacer.style.height = `${w.totalHeight}px`;
  rowsEl.style.transform = `translateY(${w.offset}px)`;

  let missing = false;
  const out: HTMLElement[] = [];
  for (let r = w.first; r < w.first + w.count; r++) {
    const row = state.cache.get(r);
    if (!row) {
      missing = true;
      const blank = document.createElement('div');
      blank.className = 'row';
      out.push(blank);
      continue;
    }
    const el = row.kind === 'gap' ? gapEl(row) : lineEl(row, r);
    if (st && row.kind === 'line') el.style.height = `${(st[r + 1]! - st[r]!) * ROW_HEIGHT}px`;
    out.push(el);
  }
  rowsEl.replaceChildren(...out);

  if (missing) {
    // Fetch a screen above and below too, so small scrolls need no round trip.
    const start = Math.max(0, w.first - w.count);
    const key = `${state.viewId}:${start}`;
    if (key !== state.requested) {
      state.requested = key;
      send({ type: 'rows', id: state.viewId, start, count: w.count * 3 });
    }
  }
}

/** A JSON or XML value inside a line: underlined, and opens pretty-printed on click. */
function valueEl(lineNumber: number, v: Structure): HTMLElement {
  const el = document.createElement('span');
  el.className = 'pv';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  const what = v.kind === 'xml' ? 'XML' : 'JSON';
  el.title = `Pretty print this ${what}`;
  const open = () => showStructures(lineNumber, [v]);
  el.addEventListener('click', () => {
    // Selecting text to copy it shouldn't open the dialog.
    if (window.getSelection()?.toString()) return;
    open();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  return el;
}

/** Matches the .flash animation in styles.css. */
const FLASH_MS = 900;

function lineEl(row: Extract<Row, { kind: 'line' }>, index: number): HTMLElement {
  const div = document.createElement('div');
  div.className =
    `row lv${row.level}` +
    (row.bookmarked ? ' bookmarked' : '') +
    (row.extra ? ' revealed' : '') +
    (index === state.current ? ' current' : '');
  // A jump makes the landing line flash once, so the eye finds it. Rows are
  // rebuilt while scrolling, so the animation resumes where it was.
  if (index === state.current) {
    const age = performance.now() - state.flashAt;
    if (age < FLASH_MS) {
      div.classList.add('flash');
      div.style.animationDelay = `${-age}ms`;
    }
  }
  const gutter = document.createElement('button');
  gutter.type = 'button';
  gutter.className = 'gutter';
  gutter.textContent = String(row.line + 1);
  gutter.title = row.bookmarked ? 'Remove bookmark' : 'Bookmark this line';
  gutter.setAttribute('aria-pressed', String(row.bookmarked));
  gutter.addEventListener('click', () => {
    state.viewId++;
    send({ type: 'bookmark', id: state.viewId, line: row.line });
  });
  const text = document.createElement('span');
  text.className = 'text';
  const shown = row.text.length > MAX_RENDERED_CHARS ? row.text.slice(0, MAX_RENDERED_CHARS) + ' …' : row.text;
  // JSON and XML values get a dotted underline; clicking one pretty-prints it.
  const values = visibleStructures(row.text, MAX_RENDERED_CHARS);
  const holders = values.map((v) => valueEl(row.line + 1, v));
  // Log text is untrusted: it only ever goes in as text nodes, never as HTML.
  let at = 0;
  for (const span of splitTagged(shown, patterns())) {
    // Cut the span where a value starts or ends, so each piece lands in one place.
    let rest = span.text;
    while (rest) {
      const v = values.findIndex((x) => at >= x.start && at < x.end);
      const next = v >= 0 ? values[v]!.end : Math.min(...values.filter((x) => x.start > at).map((x) => x.start), Infinity);
      const piece = rest.slice(0, Math.max(1, next - at));
      rest = rest.slice(piece.length);
      at += piece.length;
      let node: Node | string = piece;
      if (span.tag !== null) {
        const mark = document.createElement('mark');
        if (span.tag >= 0) mark.className = `hl${span.tag}`;
        mark.textContent = piece;
        node = mark;
      }
      const holder = v >= 0 ? holders[v]! : text;
      if (v >= 0 && holder.parentNode !== text) text.append(holder);
      holder.append(node);
    }
  }
  div.append(gutter, text);
  if (row.revealed) {
    const { start, end, count } = row.revealed;
    // A faint "hide N lines" after the first line of an opened run folds it
    // back. It sits after the text, styled like the gap bars, so it never
    // covers the line number and the log still reads like a plain file.
    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'fold';
    const label = `Hide ${count.toLocaleString()} ${count === 1 ? 'line' : 'lines'} again`;
    fold.textContent = `hide ${count.toLocaleString()} ${count === 1 ? 'line' : 'lines'}`;
    fold.title = label;
    fold.setAttribute('aria-label', label);
    fold.addEventListener('click', () => {
      state.viewId++;
      send({ type: 'collapse', id: state.viewId, start, end });
    });
    div.append(fold);
  }
  return div;
}

function patterns(): Pattern[] {
  const list = state.highlight ? [{ re: state.highlight, tag: -1 }] : [];
  return list.concat(ruleStore.patterns());
}

function gapEl(row: Extract<Row, { kind: 'gap' }>): HTMLElement {
  const n = row.end - row.start;
  const expand = ([start, end]: [number, number]) => {
    state.viewId++;
    send({ type: 'expand', id: state.viewId, start, end });
  };
  const g = document.createElement('span');
  g.className = 'gutter';
  g.textContent = '⋯';
  const label = document.createElement('span');
  const line = document.createElement('span');
  line.className = 'line';
  const hidden = `${n.toLocaleString()} ${n === 1 ? 'line' : 'lines'} hidden`;

  // Only the buttons act; the "N lines hidden" text is just a label.
  const div = document.createElement('div');
  div.className = n > GAP_SMALL ? 'gap big' : 'gap';
  label.textContent = `${hidden}:`;
  const act = (text: string, title: string, range: [number, number]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gap-act';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', () => expand(range));
    return b;
  };
  const acts: HTMLElement[] = [];
  // Small gaps open whole: a "show more" step would only cost clicks. A big
  // gap stays one bar that shrinks from either edge as lines are revealed,
  // and goes away once it is empty, so revealed blocks join up.
  // ↓ grows the lines above the gap downwards; ↑ grows the lines below upwards.
  // Neither is offered at the edge of the file, where there is nothing to grow.
  if (n > GAP_SMALL && row.start > 0) {
    acts.push(act(`↓ ${GAP_STEP} more`, `Show ${GAP_STEP} more lines below the line above`, [row.start, row.start + GAP_STEP]));
  }
  acts.push(act('show all', `Show all ${n.toLocaleString()} lines`, [row.start, row.end]));
  if (n > GAP_SMALL && row.end < state.lines) {
    acts.push(act(`↑ ${GAP_STEP} more`, `Show ${GAP_STEP} more lines above the line below`, [row.end - GAP_STEP, row.end]));
  }
  div.append(g, label, ...acts, line);
  return div;
}

function scrollToRow(row: number): void {
  const st = layout();
  const top = st
    ? scrollTopForRow(st[row]!, log.clientHeight, st[state.rowCount]!, ROW_HEIGHT)
    : scrollTopForRow(row, log.clientHeight, state.rowCount, ROW_HEIGHT);
  log.scrollTop = Math.max(0, top - log.clientHeight / 3);
  render();
}

log.addEventListener('scroll', render);
window.addEventListener('resize', () => {
  if (state.wrap) requestWrap(false);
  render();
});

// ---- Word wrap -------------------------------------------------------------

const wrapBtn = $<HTMLButtonElement>('wrap-toggle');

/** Characters that fit beside the gutter, leaving room for the { } and hide buttons. */
function measureColumns(): number {
  const probe = document.createElement('div');
  probe.className = 'row';
  probe.style.visibility = 'hidden';
  const g = document.createElement('span');
  g.className = 'gutter';
  const t = document.createElement('span');
  t.className = 'text';
  t.style.padding = '0';
  t.textContent = 'x'.repeat(100);
  probe.append(g, t);
  rowsEl.append(probe);
  const box = t.getBoundingClientRect();
  const textLeft = box.left - probe.getBoundingClientRect().left;
  probe.remove();
  return wrapColumns(log.clientWidth - textLeft - WRAP_RESERVE, box.width / 100);
}
/** Room kept right of wrapped text for the buttons that follow it. */
const WRAP_RESERVE = 150;

/** Asks the worker for a wrap layout if the width changed or the rows did (`fresh`). */
function requestWrap(fresh: boolean): void {
  const cols = measureColumns();
  if (!fresh && cols === state.wrapCols && layout()) return;
  // A new width moves every row: keep the one at the top in place.
  if (!fresh && state.anchorRow < 0 && layout()) state.anchorRow = topRow();
  state.wrapCols = cols;
  rowsEl.style.setProperty('--wrap-cols', String(cols));
  send({ type: 'wrap', id: state.viewId, cols });
}

/** The row at the top of the screen. */
function topRow(): number {
  const st = layout();
  const w = st
    ? computeWindow(log.scrollTop, log.clientHeight, st[state.rowCount]!, ROW_HEIGHT, 0)
    : computeWindow(log.scrollTop, log.clientHeight, state.rowCount, ROW_HEIGHT, 0);
  return st ? rowAtUnit(st, w.first) : w.first;
}

function setWrap(on: boolean): void {
  if (on === state.wrap) return;
  state.anchorRow = topRow();
  state.wrap = on;
  wrapBtn.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('wrap', on ? '1' : '0');
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  if (on) {
    state.wrapCols = 0;
    requestWrap(true);
  } else {
    state.starts = null;
    const row = state.anchorRow;
    state.anchorRow = -1;
    log.scrollTop = scrollTopForRow(row, log.clientHeight, state.rowCount, ROW_HEIGHT);
  }
  render();
}
wrapBtn.addEventListener('click', () => setWrap(!state.wrap));
try {
  if (localStorage.getItem('wrap') === '1') {
    state.wrap = true;
    wrapBtn.setAttribute('aria-pressed', 'true');
  }
} catch {
  // See setWrap.
}

// ---- Toolbar --------------------------------------------------------------

function buildLevelButtons(counts: number[]): void {
  levelsBar.replaceChildren();
  const on: number[] = [];
  // Show errors first, then the rest in order; "no level" last.
  const order = [1, 2, 3, 4, 5, 0].filter((c) => c < LEVEL_COUNT);
  for (const code of order) {
    const count = counts[code] ?? 0;
    on.push(code);
    if (count === 0) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'level';
    b.dataset.code = String(code);
    b.setAttribute('aria-pressed', 'true');
    b.title = `Show only ${LEVEL_LABELS[code]!.toLowerCase()} (click again for all; Ctrl+click to add or remove)`;
    b.append(LEVEL_LABELS[code]!);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = count.toLocaleString();
    b.append(n);
    b.addEventListener('click', (e) => {
      state.query.levels = nextLevels(state.query.levels, allLevels, code, e.ctrlKey || e.metaKey);
      for (const other of levelsBar.querySelectorAll<HTMLButtonElement>('.level')) {
        other.setAttribute('aria-pressed', String(state.query.levels.includes(Number(other.dataset.code))));
      }
      requestView();
    });
    levelsBar.append(b);
  }
  state.query.levels = on;
  allLevels = [...on];
}
let allLevels: number[] = [];

function toggle(btn: HTMLButtonElement, apply: (on: boolean) => void): void {
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    apply(on);
    requestView();
  });
}
toggle(filterBtn, (on) => {
  state.query.filter = on;
  ctxGroup.hidden = !on;
});
toggle(caseBtn, (on) => (state.query.caseSensitive = on));
toggle(regexBtn, (on) => (state.query.regex = on));

ctxGroup.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.addEventListener('click', () => {
    ctxGroup.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    state.query.context = Number(b.dataset.ctx);
    requestView();
  });
});

let typing = 0;
search.addEventListener('input', () => {
  clearTimeout(typing);
  typing = window.setTimeout(() => {
    state.query.text = search.value;
    state.current = -1;
    requestView();
  }, 150);
});

// ---- Keyboard -------------------------------------------------------------

function findNext(target: 'match' | 'error' | 'bookmark', direction: 1 | -1): void {
  if (state.rowCount === 0) return;
  const from = state.current >= 0 ? state.current : direction === 1 ? -1 : state.rowCount;
  send({ type: 'find', id: state.viewId, fromRow: from, direction, target });
}

search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    findNext('match', e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    log.focus();
  }
});

document.addEventListener('keydown', (e) => {
  if (viewer.hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    search.focus();
    search.select();
    return;
  }
  if (e.key === 'F2') {
    e.preventDefault();
    findNext('bookmark', e.shiftKey ? -1 : 1);
    return;
  }
  // Alt+Z, as in VS Code. e.code, because Alt changes e.key on a Mac (Ω).
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyZ') {
    e.preventDefault();
    setWrap(!state.wrap);
    return;
  }
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === '/') {
    e.preventDefault();
    search.focus();
  } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    findNext('error', e.shiftKey ? -1 : 1);
  }
});

// ---- Quick filters -------------------------------------------------------

const ruleStore = new RuleStore();
const rulesPanel = $('rules-panel');
const rulesToggle = $<HTMLButtonElement>('rules-toggle');
const rulesList = $('rules-list');
const ruleForm = $<HTMLFormElement>('rule-form');
const ruleInput = $<HTMLInputElement>('rule-input');

function drawRules(): void {
  rulesList.replaceChildren(
    ...ruleStore.rules.map((r, i) => {
      const li = document.createElement('li');
      // The dot marks the filter as a highlight (colored in every log) or not.
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = r.highlight ? `swatch hl${r.color}` : 'swatch off';
      sw.setAttribute('aria-pressed', String(r.highlight));
      sw.title = r.highlight ? 'Highlighted in every log: click to stop' : 'Click to highlight in every log';
      sw.setAttribute('aria-label', `Highlight ${r.term}`);
      sw.addEventListener('click', () => ruleStore.toggleHighlight(i));
      // The term itself is the filter.
      const term = document.createElement('button');
      term.type = 'button';
      term.className = 'rule-term';
      term.textContent = r.term;
      term.title = `Show only lines matching ${r.term}`;
      term.addEventListener('click', () => {
        setRulesOpen(false);
        applySearch(r.term, r.regex === true);
      });
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'rule-btn rule-edit-btn';
      edit.textContent = '✎';
      edit.title = 'Edit';
      edit.setAttribute('aria-label', `Edit ${r.term}`);
      edit.addEventListener('click', () => editRule(i, term));
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rule-btn rule-remove';
      rm.textContent = '×';
      rm.setAttribute('aria-label', `Remove ${r.term}`);
      rm.addEventListener('click', () => ruleStore.remove(i));
      li.append(sw, term);
      if (r.regex) {
        const re = document.createElement('span');
        re.className = 'rule-re';
        re.textContent = '.*';
        re.title = 'Regular expression';
        li.append(re);
      }
      li.append(edit, rm);
      return li;
    }),
  );
  rulesToggle.textContent = ruleStore.rules.length ? `Quick filters ${ruleStore.rules.length}` : 'Quick filters';
  render();
}

/** Swaps a saved term for a text box; Enter or leaving it saves, Escape cancels. */
function editRule(index: number, term: HTMLElement): void {
  const rule = ruleStore.rules[index];
  if (!rule) return;
  const input = document.createElement('input');
  input.className = 'rule-edit';
  input.value = rule.term;
  input.setAttribute('aria-label', 'Edit quick filter');
  input.spellcheck = false;
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save && input.value !== rule.term && ruleStore.edit(index, input.value)) return; // redrawn by onChange
    drawRules();
    rulesList.querySelectorAll<HTMLElement>('.rule-edit-btn')[index]?.focus();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') {
      e.stopPropagation(); // keep the dropdown open
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  term.replaceWith(input);
  input.focus();
  input.select();
}

ruleStore.onChange(drawRules);
void ruleStore.load();

function setRulesOpen(open: boolean): void {
  rulesPanel.hidden = !open;
  rulesToggle.setAttribute('aria-expanded', String(open));
  if (open) ruleInput.focus();
}
rulesToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  setRulesOpen(rulesPanel.hidden);
});
// Closes on a click elsewhere or Escape, like the help menu.
document.addEventListener('click', (e) => {
  // composedPath, not contains: a click can replace its own target (editing a term).
  if (!rulesPanel.hidden && !e.composedPath().includes(rulesPanel)) setRulesOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !rulesPanel.hidden) {
    setRulesOpen(false);
    rulesToggle.focus();
  }
});
ruleForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (ruleStore.add(ruleInput.value)) ruleInput.value = '';
});

/** Puts `text` in the search box and filters by it, as if typed. */
function applySearch(text: string, regex: boolean): void {
  search.value = text;
  state.query.text = text;
  state.query.regex = regex;
  regexBtn.setAttribute('aria-pressed', String(regex));
  state.query.filter = true;
  filterBtn.setAttribute('aria-pressed', 'true');
  ctxGroup.hidden = false;
  state.current = -1;
  saveSearchBtn.disabled = !text.trim();
  requestView();
}

// Save: the current search joins the Quick filters list, ready to reuse.
const saveSearchBtn = $<HTMLButtonElement>('save-search');
saveSearchBtn.addEventListener('click', () => {
  if (ruleStore.add(search.value, state.query.regex)) {
    saveSearchBtn.textContent = '★';
    setTimeout(() => (saveSearchBtn.textContent = '☆'), 1200);
  }
});
search.addEventListener('input', () => (saveSearchBtn.disabled = !search.value.trim()));

// ---- Bookmarks, copy and save ----------------------------------------------

$('bm-prev').addEventListener('click', () => findNext('bookmark', -1));
$('bm-next').addEventListener('click', () => findNext('bookmark', 1));

let exportMode: 'copy' | 'save' = 'copy';
const copyBtn = $<HTMLButtonElement>('copy-shown');
const saveBtn = $<HTMLButtonElement>('save-shown');
/** The clipboard copes badly with very large text; past this, suggest saving instead. */
const COPY_LIMIT_BYTES = 50 * 1024 * 1024;

function flash(btn: HTMLButtonElement, text: string): void {
  const was = btn.dataset.label ?? btn.textContent ?? '';
  btn.dataset.label = was;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = was), 1500);
}

copyBtn.addEventListener('click', () => {
  exportMode = 'copy';
  send({ type: 'export', id: state.viewId });
});
saveBtn.addEventListener('click', () => {
  exportMode = 'save';
  send({ type: 'export', id: state.viewId });
});

async function finishExport(blob: Blob, lines: number): Promise<void> {
  const count = `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'}`;
  if (exportMode === 'save') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const base = fileName.textContent?.replace(/(\.log)?(\.gz)?$/i, '') || 'log';
    a.download = `${base}-shown.log`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    flash(saveBtn, `Saved ${count}`);
    return;
  }
  if (blob.size > COPY_LIMIT_BYTES) {
    flash(copyBtn, 'Too big to copy, use Save');
    return;
  }
  try {
    await navigator.clipboard.writeText(await blob.text());
    flash(copyBtn, `Copied ${count}`);
  } catch {
    flash(copyBtn, 'Copy failed, use Save');
  }
}

// ---- Help -----------------------------------------------------------------

setupHelpMenu();
document.addEventListener('keydown', (e) => {
  if (viewer.hidden || e.target instanceof HTMLInputElement) return;
  if (e.key === '?') {
    e.preventDefault();
    openShortcuts();
  }
});

// ---- JSON viewer ----------------------------------------------------------

const jsonDialog = $<HTMLDialogElement>('json-dialog');
const jsonBody = $('json-body');
let shownPretty = '';
function showStructures(lineNumber: number, found: Structure[]): void {
  $('json-line').textContent = lineNumber.toLocaleString();
  jsonBody.replaceChildren();
  found.forEach((f, i) => {
    if (found.length > 1 || f.name) {
      const h = document.createElement('div');
      h.className = 'json-name';
      const what = f.name || (f.kind === 'xml' ? 'XML' : 'JSON');
      h.textContent = found.length > 1 ? `${i + 1} of ${found.length} · ${what}` : what;
      jsonBody.append(h);
    }
    const pre = document.createElement('pre');
    pre.textContent = f.pretty;
    jsonBody.append(pre);
  });
  shownPretty = found.map((f) => f.pretty).join('\n\n');
  jsonDialog.showModal();
}
$('json-copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(shownPretty);
});
