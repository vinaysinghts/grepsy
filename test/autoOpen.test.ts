import { describe, expect, it } from 'vitest';
import { autoOpenView, autoOpenWanted, fileNameFromUrl, isLoadableSource, shouldAutoOpen } from '../src/core/autoOpen';

describe('shouldAutoOpen', () => {
  it.each([
    'file:///var/log/app.log',
    'file:///C:/logs/server.LOG',
    'file:///tmp/app.log.3',
    'file:///tmp/app.log.gz',
    'file:///tmp/worker.out',
    'file:///tmp/events.jsonl',
    'file:///tmp/my%20app.log',
  ])('opens %s', (url) => expect(shouldAutoOpen(url)).toBe(true));

  it.each([
    'file:///home/me/notes.txt',
    'file:///home/me/report.pdf',
    'file:///home/me/catalog.html',
    'https://example.com/app.log',
    'chrome-extension://abc/viewer.html',
    'not a url',
  ])('leaves %s alone', (url) => expect(shouldAutoOpen(url)).toBe(false));
});

describe('isLoadableSource', () => {
  it('allows file and web URLs only', () => {
    expect(isLoadableSource('file:///a.log')).toBe(true);
    expect(isLoadableSource('https://x.dev/a.log')).toBe(true);
    expect(isLoadableSource('javascript:alert(1)')).toBe(false);
    expect(isLoadableSource('data:text/plain,hi')).toBe(false);
    expect(isLoadableSource('')).toBe(false);
  });
});

describe('fileNameFromUrl', () => {
  it('takes the last path segment', () => {
    expect(fileNameFromUrl('file:///var/log/my%20app.log')).toBe('my app.log');
    expect(fileNameFromUrl('https://x.dev/logs/a.log.gz?sig=1')).toBe('a.log.gz');
    expect(fileNameFromUrl('https://x.dev/')).toBe('download.log');
  });
});

describe('autoOpenView', () => {
  const ready = { wanted: true, hasPermission: true, fileAccess: true };

  it('is on by default once Chrome lets Grepsy read local files', () => {
    expect(autoOpenView(ready)).toMatchObject({ on: true, button: 'Turn off', showStep: false });
  });

  it('shows the file access step until the user turns it on', () => {
    const v = autoOpenView({ ...ready, fileAccess: false });
    expect(v).toMatchObject({ on: false, button: 'Turn off', showStep: true });
    expect(v.status).toMatch(/One step left/);
  });

  it('stays off, with no step, when the user turned it off', () => {
    expect(autoOpenView({ ...ready, wanted: false })).toMatchObject({ on: false, button: 'Turn on', showStep: false });
    expect(autoOpenView({ ...ready, wanted: false, fileAccess: false }).showStep).toBe(false);
  });

  it('asks again if the file permission was removed', () => {
    expect(autoOpenView({ ...ready, hasPermission: false })).toMatchObject({ on: false, button: 'Allow' });
  });
});

describe('autoOpenWanted', () => {
  it('defaults to on', () => {
    expect(autoOpenWanted(undefined)).toBe(true);
    expect(autoOpenWanted(true)).toBe(true);
    expect(autoOpenWanted(false)).toBe(false);
  });
});
