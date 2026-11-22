import { fileNameFromUrl, isLoadableSource } from './autoOpen';

/**
 * Deciding whether the toolbar popup offers "Open this file in Grepsy" for
 * the active tab. Kept free of chrome.* so it can be unit tested.
 *
 * The popup asks the tab what Chrome thinks it is showing
 * (`document.contentType`). Only plain text counts: HTML pages, XML, images
 * and normal websites never get the offer, whatever their URL looks like.
 */

/** Content types Chrome shows as a plain text page and Grepsy can read. */
const TEXT_TYPES = new Set(['text/plain', 'text/x-log', 'application/x-ndjson', 'application/jsonl']);

/**
 * Names that are worth offering when the tab could not be asked: a local file
 * while "Allow access to file URLs" is off, where Chrome blocks scripts.
 */
const TEXT_NAME = /\.(log(\.\d+)?|txt|out|err|jsonl|ndjson)$/i;

export interface TabFacts {
  /** The tab's URL, if Chrome revealed it. */
  url?: string;
  /** `document.contentType` of the page, or null if it could not be read. */
  contentType: string | null;
}

export interface TabOffer {
  url: string;
  /** File name to show, e.g. "app.log". */
  name: string;
  /** A file on this computer (file://) rather than a web link. */
  local: boolean;
}

/** Whether a content type is plain text (ignores parameters like charset). */
export function isPlainText(contentType: string): boolean {
  return TEXT_TYPES.has(contentType.split(';')[0]!.trim().toLowerCase());
}

/** What to offer for the active tab, or null to offer nothing. */
export function tabOffer(f: TabFacts): TabOffer | null {
  if (!f.url || !isLoadableSource(f.url)) return null;
  const u = new URL(f.url);
  const local = u.protocol === 'file:';
  const plain =
    f.contentType !== null
      ? isPlainText(f.contentType)
      : local && TEXT_NAME.test(decodeURIComponent(u.pathname));
  if (!plain) return null;
  // Drop the #fragment: it means nothing to a log download.
  u.hash = '';
  return { url: u.href, name: fileNameFromUrl(u.href), local };
}

export interface AccessFacts {
  /** "Allow access to file URLs" is on for the extension. */
  fileAccess: boolean;
  /** The host permission for the URL (file:///* or the site's origin) is granted. */
  granted: boolean;
}

/**
 * What the button has to do before the viewer can read the tab's file:
 * open it straight away, ask Chrome for the permission first, or (for local
 * files) send the user to the "Allow access to file URLs" toggle, because
 * Chrome refuses to even ask for file:///* until that is on.
 */
export type AccessStep = 'open' | 'request' | 'file-toggle';

export function accessStep(offer: TabOffer, f: AccessFacts): AccessStep {
  if (offer.local && !f.fileAccess) return 'file-toggle';
  return f.granted ? 'open' : 'request';
}

/** The host permission pattern the viewer needs to read `url`. */
export function originPattern(url: string): string {
  const u = new URL(url);
  return u.protocol === 'file:' ? 'file:///*' : `${u.origin}/*`;
}

/** How long a pending "open this tab" survives the popup closing on a permission prompt. */
export const PENDING_TTL_MS = 60_000;

export interface PendingOpen {
  tabId: number;
  url: string;
  origin: string;
  at: number;
}

/** A pending open read back from storage (so untrusted), or null if it is malformed or stale. */
export function pendingToRun(value: unknown, now: number): PendingOpen | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Partial<PendingOpen>;
  if (
    typeof p.tabId !== 'number' ||
    typeof p.url !== 'string' ||
    typeof p.origin !== 'string' ||
    typeof p.at !== 'number' ||
    !isLoadableSource(p.url)
  ) {
    return null;
  }
  if (now - p.at > PENDING_TTL_MS || p.origin !== originPattern(p.url)) return null;
  return p as PendingOpen;
}
