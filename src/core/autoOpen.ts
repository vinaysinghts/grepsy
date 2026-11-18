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
