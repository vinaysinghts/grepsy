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
  /** The user asked for auto-open (saved setting). */
  wanted: boolean;
  /** Chrome granted the optional file:///* host permission. */
  hasPermission: boolean;
  /** "Allow access to file URLs" is on for the extension. */
  fileAccess: boolean;
  /** The user clicked "Turn on" while file access was still off. */
  needsFileAccess: boolean;
}

export interface AutoOpenView {
  on: boolean;
  button: 'Turn on' | 'Turn off';
  status: string;
  /** Show the "Allow access to file URLs" step. */
  showStep: boolean;
}

/**
 * What the auto-open card shows. Chrome refuses to grant file:///* (it throws)
 * until "Allow access to file URLs" is on, so that toggle is the first step,
 * not the last.
 */
export function autoOpenView(f: AutoOpenFacts): AutoOpenView {
  const on = f.wanted && f.hasPermission && f.fileAccess;
  if (on) {
    return {
      on,
      button: 'Turn off',
      status: 'On. Any .log file you open in this browser comes straight here.',
      showStep: false,
    };
  }
  if (!f.fileAccess && (f.needsFileAccess || f.wanted)) {
    return {
      on,
      button: 'Turn on',
      status: 'First, let Grepsy read local files. Then come back and click Turn on.',
      showStep: true,
    };
  }
  return {
    on,
    button: 'Turn on',
    status: 'Any .log file you open in this browser comes straight here.',
    showStep: false,
  };
}
