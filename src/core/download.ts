/**
 * Pure helpers for opening a log from a URL, kept free of DOM and chrome.*
 * so they can be unit tested in Node.
 */

/** The bits of an event target the paste handler looks at. */
export interface PasteTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

/**
 * Whether a paste landed in a text field (the URL box, the search box, the
 * paste area …). Those pastes belong to the field; only a paste on the page
 * itself should open the clipboard as a log.
 */
export function isTextEntry(target: PasteTarget | null | undefined): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

/** The message shown when the request itself fails (no HTTP status at all). */
export function networkFailureMessage(url: string): string {
  const u = new URL(url);
  if (u.protocol === 'file:') {
    return 'Could not read the file. Check that "Allow access to file URLs" is on for this extension.';
  }
  return (
    `Could not download from ${u.host}. The site may be down, need you to sign in, ` +
    'or block downloads from extensions. Try downloading the file and opening it here instead.'
  );
}

/** The message shown when the server answers with an error status. */
export function httpFailureMessage(host: string, status: number, statusText: string): string {
  const reason =
    status === 401 || status === 403
      ? 'you may need to sign in or lack access'
      : status === 404
        ? 'the file was not found'
        : status >= 500
          ? 'the server had a problem'
          : '';
  const code = statusText ? `${status} ${statusText}` : `HTTP ${status}`;
  return `${host} answered ${code}${reason ? `: ${reason}` : ''}.`;
}

/**
 * Whether a response is a web page rather than a log, e.g. a GitHub or
 * dashboard page instead of its "raw" link.
 */
export function isHtmlResponse(contentType: string | null): boolean {
  return /^\s*(text\/html|application\/xhtml\+xml)\b/i.test(contentType ?? '');
}

export const HTML_PAGE_MESSAGE =
  'That link is a web page, not a log file. Use the "raw" or download link for the log instead.';
