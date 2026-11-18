import { describe, expect, it } from 'vitest';
import { fileNameFromUrl, isLoadableSource, shouldAutoOpen } from '../src/core/autoOpen';

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
