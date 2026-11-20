import { describe, expect, it } from 'vitest';
import { autoOpenView, fileNameFromUrl, isLoadableSource, shouldAutoOpen } from '../src/core/autoOpen';

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
  const off = { wanted: false, hasPermission: false, fileAccess: false, needsFileAccess: false };

  it('starts off with no step', () => {
    expect(autoOpenView(off)).toMatchObject({ on: false, button: 'Turn on', showStep: false });
  });

  it('asks for file access first when Turn on is clicked without it', () => {
    const v = autoOpenView({ ...off, needsFileAccess: true });
    expect(v).toMatchObject({ on: false, button: 'Turn on', showStep: true });
    expect(v.status).toMatch(/First/);
  });

  it('is on only with the setting, the permission and file access', () => {
    expect(autoOpenView({ wanted: true, hasPermission: true, fileAccess: true, needsFileAccess: false }))
      .toMatchObject({ on: true, button: 'Turn off', showStep: false });
  });

  it('shows the step again if file access is switched off later', () => {
    expect(autoOpenView({ wanted: true, hasPermission: true, fileAccess: false, needsFileAccess: false }))
      .toMatchObject({ on: false, showStep: true });
  });

  it('hides the step once file access is on, ready for Turn on', () => {
    expect(autoOpenView({ ...off, fileAccess: true, needsFileAccess: true }))
      .toMatchObject({ on: false, button: 'Turn on', showStep: false });
  });
});
