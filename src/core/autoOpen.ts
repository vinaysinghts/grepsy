/** Log-looking file names: app.log, app.log.1, app.log.gz, worker.out, events.jsonl … */
const LOG_NAME = /\.(log(\.\d+)?(\.gz)?|out|err|jsonl)$/i;

/** Whether a tab URL is a local log file the viewer should take over. */
export function shouldAutoOpen(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'file:' && LOG_NAME.test(decodeURIComponent(u.pathname));
}

/**
 * Whether a web tab URL looks like a log worth checking for auto-open. The
 * name is only a first filter: the page must also turn out to be plain text.
 */
export function shouldAutoOpenWeb(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return (u.protocol === 'https:' || u.protocol === 'http:') && LOG_NAME.test(decodeURIComponent(u.pathname));
}

/** Web origins auto-open needs for .log links on websites: every site, asked for with one click in the popup. */
export const WEB_ORIGINS = ['https://*/*', 'http://*/*'];

/**
 * Whether to send this tab to the viewer, given the URL it last left for the
 * viewer. Without this, Back from the viewer would land on the log and be
 * sent straight back: a trap.
 */
export function isReturnVisit(url: string, lastRedirected: unknown): boolean {
  return typeof lastRedirected === 'string' && lastRedirected === url;
}

/** The URLs the viewer may load from its `?src=` parameter. */
export function isLoadableSource(url: string): boolean {
  try {
    return ['file:', 'http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** A readable file name for a URL, e.g. "app.log" from file:///var/log/app.log. */
export function fileNameFromUrl(url: string): string {
  try {
    const parts = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean);
    return parts[parts.length - 1] ?? 'download.log';
  } catch {
    return 'download.log';
  }
}

export interface AutoOpenFacts {
  /** The user wants auto-open. On unless they turned it off (saved `autoOpen: false`). */
  wanted: boolean;
  /** The file:///* host permission is granted (it is asked for at install). */
  hasPermission: boolean;
  /** "Allow access to file URLs" is on for the extension. Only the user can turn it on. */
  fileAccess: boolean;
}

export interface AutoOpenView {
  on: boolean;
  /** What the button does: turn the setting on or off, or ask Chrome for file:///* again. */
  button: 'Turn on' | 'Turn off' | 'Allow';
  status: string;
  /** Show the "Allow access to file URLs" step. */
  showStep: boolean;
}

/**
 * What the auto-open switch shows. It is on by default, but Chrome keeps
 * "Allow access to file URLs" off for every extension until the user flips
 * it, so until then the switch shows that one setup step.
 */
export function autoOpenView(f: AutoOpenFacts): AutoOpenView {
  if (!f.wanted) {
    return { on: false, button: 'Turn on', status: 'Off. .log files open as plain text.', showStep: false };
  }
  if (!f.fileAccess) {
    return {
      on: false,
      button: 'Turn off',
      status: 'One step left: let Grepsy read files on this computer.',
      showStep: true,
    };
  }
  if (!f.hasPermission) {
    return { on: false, button: 'Allow', status: 'Grepsy needs your OK to read local files.', showStep: false };
  }
  return { on: true, button: 'Turn off', status: 'On. .log files you open in Chrome open in Grepsy.', showStep: false };
}

/** The saved setting: auto-open is on unless the user turned it off. */
export function autoOpenWanted(saved: unknown): boolean {
  return saved !== false;
}
