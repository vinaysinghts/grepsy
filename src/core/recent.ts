import { fileNameFromUrl, isLoadableSource } from './autoOpen';

/**
 * Recently opened logs, shown in the toolbar popup. Only logs opened by link
 * (a web URL, or a local file:// log that auto-open sent to the viewer) are
 * kept, because those are the only ones the viewer can open again on its own:
 * a file picked from disk or pasted text can't be reloaded without the user
 * choosing it again. Nothing but the link, a name and a time is stored.
 */
export interface RecentLog {
  url: string;
  name: string;
  /** Epoch milliseconds of the last time it was opened. */
  openedAt: number;
}

export const RECENT_KEY = 'recent';
export const RECENT_MAX = 8;

/** The list with `url` moved (or added) to the front, de-duplicated and capped. */
export function addRecent(list: readonly RecentLog[], url: string, now: number, max = RECENT_MAX): RecentLog[] {
  if (!isLoadableSource(url)) return [...list];
  const entry: RecentLog = { url, name: fileNameFromUrl(url), openedAt: now };
  return [entry, ...list.filter((r) => r.url !== url)].slice(0, max);
}

/** The list without `url`. */
export function removeRecent(list: readonly RecentLog[], url: string): RecentLog[] {
  return list.filter((r) => r.url !== url);
}

/** Whatever is in storage, reduced to valid entries (storage is not trusted to have our shape). */
export function parseRecent(value: unknown): RecentLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is RecentLog =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.url === 'string' &&
        isLoadableSource(r.url) &&
        typeof r.name === 'string' &&
        typeof r.openedAt === 'number',
    )
    .slice(0, RECENT_MAX);
}

/** Where a recent log came from, in a few words: "example.com" or "local file". */
export function recentSource(url: string): string {
  const u = new URL(url);
  return u.protocol === 'file:' ? 'local file' : u.host;
}

/** "just now", "5m ago", "3h ago", "2d ago", or a date for anything older than a week. */
export function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The slice of chrome.storage.local this module uses, so tests can pass a fake. */
export interface KeyValueStore {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function loadRecent(store: KeyValueStore): Promise<RecentLog[]> {
  return parseRecent((await store.get(RECENT_KEY))[RECENT_KEY]);
}

export async function rememberRecent(store: KeyValueStore, url: string, now = Date.now()): Promise<void> {
  await store.set({ [RECENT_KEY]: addRecent(await loadRecent(store), url, now) });
}

export async function forgetRecent(store: KeyValueStore, url: string): Promise<void> {
  await store.set({ [RECENT_KEY]: removeRecent(await loadRecent(store), url) });
}

/**
 * The viewer page to open for a popup action: a log link (`src`), the paste
 * box (`paste`), or the plain start screen.
 */
export function viewerPath(open?: { src: string } | { paste: true }): string {
  if (!open) return 'viewer.html';
  if ('src' in open) return `viewer.html?src=${encodeURIComponent(open.src)}`;
  return 'viewer.html?paste=1';
}

/**
 * What the user typed into the popup's link box, as a URL the viewer can
 * load, or null. A bare "example.com/app.log" is read as https.
 */
export function parseUrlInput(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  return isLoadableSource(withScheme) ? new URL(withScheme).href : null;
}
