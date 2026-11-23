import { isTextEntry } from '../core/download';
import { splitTagged, type Pattern } from '../core/highlights';
import { extractJson, mayContainJson } from '../core/json';
import { LEVEL_COUNT } from '../core/lineStore';
import { nextLevels } from '../core/levelPick';
import { compileQuery } from '../core/query';
import { computeWindow, scrollTopForRow } from '../core/virtual';
import type { Request, Response, Row, ViewQuery } from '../worker/protocol';
import { openShortcuts, setupHelpMenu } from './help';
import { RuleStore } from './rules';
import { fileNameFromUrl } from '../core/autoOpen';
import { rememberRecent } from '../core/recent';
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

function draw(): void {
  const w = computeWindow(log.scrollTop, log.clientHeight, state.rowCount, ROW_HEIGHT);
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
    out.push(row.kind === 'gap' ? gapEl(row) : lineEl(row, r));
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

function lineEl(row: Extract<Row, { kind: 'line' }>, index: number): HTMLElement {
  const div = document.createElement('div');
  div.className =
    `row lv${row.level}` +
    (row.bookmarked ? ' bookmarked' : '') +
    (row.extra ? ' revealed' : '') +
    (index === state.current ? ' current' : '');
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
  // Log text is untrusted: it only ever goes in as text nodes, never as HTML.
  for (const span of splitTagged(shown, patterns())) {
    if (span.tag === null) {
      text.append(span.text);
    } else {
      const mark = document.createElement('mark');
      if (span.tag >= 0) mark.className = `hl${span.tag}`;
      mark.textContent = span.text;
      text.append(mark);
    }
  }
  div.append(gutter, text);
  if (row.revealed) {
    const { start, end, count } = row.revealed;
    // A fold arrow, like a code editor's: ⌄ on an opened run folds it back.
    const fold = document.createElement('button');
    fold.type = 'button';
    fold.className = 'fold';
    fold.textContent = '⌄';
    const label = `Hide ${count.toLocaleString()} ${count === 1 ? 'line' : 'lines'} again`;
    fold.title = label;
    fold.setAttribute('aria-label', label);
    fold.addEventListener('click', () => {
      state.viewId++;
      send({ type: 'collapse', id: state.viewId, start, end });
    });
    div.prepend(fold);
  }
  if (mayContainJson(row.text)) {
    const found = extractJson(row.text);
    if (found) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'json-btn';
      btn.textContent = '{ }';
      btn.title = 'View JSON';
      btn.setAttribute('aria-label', `View JSON on line ${row.line + 1}`);
      btn.addEventListener('click', () => showJson(row.line + 1, found.value));
      div.append(btn);
    }
  }
  return div;
}

function patterns(): Pattern[] {
  const list = state.highlight ? [{ re: state.highlight, tag: -1 }] : [];
  return list.concat(ruleStore.patterns());
}

/** Lines a "show first / last" click reveals from a big gap. */
const GAP_STEP = 20;

function gapEl(row: Extract<Row, { kind: 'gap' }>): HTMLElement {
  const n = row.end - row.start;
  const expand = (start: number, end: number) => {
    state.viewId++;
    send({ type: 'expand', id: state.viewId, start, end });
  };
  const fold = document.createElement('span');
  fold.className = 'fold';
  fold.setAttribute('aria-hidden', 'true');
  fold.textContent = '›';
  const g = document.createElement('span');
  g.className = 'gutter';
  g.textContent = '⋯';
  const label = document.createElement('span');
  const line = document.createElement('span');
  line.className = 'line';
  const hidden = `${n.toLocaleString()} ${n === 1 ? 'line' : 'lines'} hidden`;

  if (n <= GAP_STEP * 2) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gap';
    label.textContent = `${hidden}, click to show`;
    btn.append(fold, g, label, line);
    btn.addEventListener('click', () => expand(row.start, row.end));
    return btn;
  }
  // A big gap: opening it all would push the lines you care about far away,
  // so offer a few lines from the top or bottom of it too.
  const div = document.createElement('div');
  div.className = 'gap big';
  label.textContent = `${hidden}:`;
  const act = (text: string, title: string, start: number, end: number) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gap-act';
    b.textContent = text;
    b.title = title;
    b.addEventListener('click', () => expand(start, end));
    return b;
  };
  div.append(
    fold,
    g,
    label,
    act(`↑ first ${GAP_STEP}`, `Show the ${GAP_STEP} lines right after the line above`, row.start, row.start + GAP_STEP),
    act(`↓ last ${GAP_STEP}`, `Show the ${GAP_STEP} lines right before the line below`, row.end - GAP_STEP, row.end),
    act('show all', `Show all ${n.toLocaleString()} lines`, row.start, row.end),
    line,
  );
  return div;
}

function scrollToRow(row: number): void {
  const top = scrollTopForRow(row, log.clientHeight, state.rowCount, ROW_HEIGHT);
  log.scrollTop = Math.max(0, top - log.clientHeight / 3);
  render();
}

log.addEventListener('scroll', render);
window.addEventListener('resize', render);

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
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === '/') {
    e.preventDefault();
    search.focus();
  } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    findNext('error', e.shiftKey ? -1 : 1);
  }
});

// ---- Highlight rules ------------------------------------------------------

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
      const sw = document.createElement('span');
      sw.className = `swatch hl${r.color}`;
      const term = document.createElement('span');
      term.className = 'rule-term';
      term.textContent = r.term;
      term.title = r.term;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rule-remove';
      rm.textContent = '×';
      rm.setAttribute('aria-label', `Remove highlight ${r.term}`);
      rm.addEventListener('click', () => ruleStore.remove(i));
      const filterBtnEl = document.createElement('button');
      filterBtnEl.type = 'button';
      filterBtnEl.className = 'rule-filter';
      filterBtnEl.textContent = 'Filter';
      filterBtnEl.title = `Show only lines matching ${r.term}`;
      filterBtnEl.addEventListener('click', () => {
        setRulesOpen(false);
        applySearch(r.term, r.regex === true);
      });
      if (r.regex) {
        const re = document.createElement('span');
        re.className = 'rule-re';
        re.textContent = '.*';
        re.title = 'Regular expression';
        term.after(re);
      }
      li.append(sw, term, filterBtnEl, rm);
      return li;
    }),
  );
  rulesToggle.textContent = ruleStore.rules.length ? `Highlights ${ruleStore.rules.length}` : 'Highlights';
  render();
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
  if (!rulesPanel.hidden && !rulesPanel.contains(e.target as Node)) setRulesOpen(false);
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

// Save: the current search joins the Highlights list, ready to reuse.
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
function showJson(lineNumber: number, value: unknown): void {
  $('json-line').textContent = lineNumber.toLocaleString();
  jsonBody.textContent = JSON.stringify(value, null, 2);
  jsonDialog.showModal();
}
$('json-copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(jsonBody.textContent ?? '');
});
