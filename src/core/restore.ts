import { isLoadableSource } from './autoOpen';

/**
 * Chrome closes an extension's pages when the extension reloads or updates.
 * Each viewer showing a log opened by link keeps a "still open" note fresh;
 * after an update the background script reopens the logs whose notes were
 * fresh, as their original links. Notes from tabs the user closed go stale
 * quickly, so those are never reopened.
 */
export const VIEW_KEY_PREFIX = 'openView:';
/** How often an open viewer refreshes its note. */
export const VIEW_HEARTBEAT_MS = 20_000;
/** A note older than this belongs to a tab that was already closed. */
export const VIEW_FRESH_MS = 60_000;

export interface OpenViewNote {
  src: string;
  seen: number;
}

/** The links to reopen, from everything in storage (untrusted shape), oldest note first, no repeats. */
export function viewsToRestore(items: Record<string, unknown>, now: number): string[] {
  const notes: OpenViewNote[] = [];
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(VIEW_KEY_PREFIX) || typeof value !== 'object' || value === null) continue;
    const n = value as Partial<OpenViewNote>;
    if (typeof n.src !== 'string' || typeof n.seen !== 'number' || !isLoadableSource(n.src)) continue;
    if (now - n.seen > VIEW_FRESH_MS) continue;
    notes.push({ src: n.src, seen: n.seen });
  }
  notes.sort((a, b) => a.seen - b.seen);
  return [...new Set(notes.map((n) => n.src))];
}
