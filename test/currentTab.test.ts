import { describe, expect, it } from 'vitest';
import { accessStep, isPlainText, originPattern, pendingToRun, tabOffer, PENDING_TTL_MS } from '../src/core/currentTab';

describe('tabOffer', () => {
  it('offers plain text tabs, local or on the web', () => {
    expect(tabOffer({ url: 'file:///var/log/app.log', contentType: 'text/plain' })).toEqual({
      url: 'file:///var/log/app.log',
      name: 'app.log',
      local: true,
    });
    expect(tabOffer({ url: 'https://ci.example.com/build/42/raw', contentType: 'text/plain; charset=utf-8' })).toEqual({
      url: 'https://ci.example.com/build/42/raw',
      name: 'raw',
      local: false,
    });
    expect(tabOffer({ url: 'file:///tmp/notes', contentType: 'text/plain' })?.name).toBe('notes');
  });

  it('never offers HTML, XML or other web pages, whatever the URL says', () => {
    expect(tabOffer({ url: 'https://example.com/', contentType: 'text/html' })).toBeNull();
    expect(tabOffer({ url: 'https://example.com/app.log', contentType: 'text/html' })).toBeNull();
    expect(tabOffer({ url: 'file:///var/log/', contentType: 'text/html' })).toBeNull();
    expect(tabOffer({ url: 'file:///tmp/page.xhtml', contentType: 'application/xhtml+xml' })).toBeNull();
    expect(tabOffer({ url: 'https://example.com/feed.xml', contentType: 'text/xml' })).toBeNull();
    expect(tabOffer({ url: 'https://example.com/a.png', contentType: 'image/png' })).toBeNull();
    expect(tabOffer({ url: 'https://example.com/app.js', contentType: 'text/javascript' })).toBeNull();
  });

  it('ignores tabs the viewer cannot load', () => {
    expect(tabOffer({ url: 'chrome://settings', contentType: 'text/plain' })).toBeNull();
    expect(tabOffer({ url: 'chrome-extension://abc/viewer.html', contentType: 'text/html' })).toBeNull();
    expect(tabOffer({ url: undefined, contentType: null })).toBeNull();
  });

  it('falls back to the file name only for local files it could not inspect', () => {
    expect(tabOffer({ url: 'file:///var/log/app.log.1', contentType: null })?.local).toBe(true);
    expect(tabOffer({ url: 'file:///C:/logs/server%20out.txt', contentType: null })?.name).toBe('server out.txt');
    expect(tabOffer({ url: 'file:///home/me/page.html', contentType: null })).toBeNull();
    expect(tabOffer({ url: 'https://example.com/app.log', contentType: null })).toBeNull();
  });

  it('drops the #fragment', () => {
    expect(tabOffer({ url: 'https://example.com/app.log#L20', contentType: 'text/plain' })?.url).toBe(
      'https://example.com/app.log',
    );
  });
});

describe('isPlainText', () => {
  it('accepts text and newline-delimited JSON, case and parameters aside', () => {
    expect(isPlainText('TEXT/PLAIN;charset=UTF-8')).toBe(true);
    expect(isPlainText('application/x-ndjson')).toBe(true);
    expect(isPlainText('text/html')).toBe(false);
  });
});

describe('accessStep', () => {
  const local = { url: 'file:///a.log', name: 'a.log', local: true };
  const web = { url: 'https://example.com/a.log', name: 'a.log', local: false };
  it('sends local files to the file-access toggle first', () => {
    expect(accessStep(local, { fileAccess: false, granted: false })).toBe('file-toggle');
    expect(accessStep(local, { fileAccess: true, granted: false })).toBe('request');
    expect(accessStep(local, { fileAccess: true, granted: true })).toBe('open');
  });
  it('asks for a site only when it is not granted yet', () => {
    expect(accessStep(web, { fileAccess: false, granted: false })).toBe('request');
    expect(accessStep(web, { fileAccess: false, granted: true })).toBe('open');
  });
});

describe('originPattern', () => {
  it('names the permission the viewer needs', () => {
    expect(originPattern('file:///var/log/a.log')).toBe('file:///*');
    expect(originPattern('https://ci.example.com:8443/x/a.log')).toBe('https://ci.example.com:8443/*');
  });
});

describe('pendingToRun', () => {
  const p = { tabId: 3, url: 'https://example.com/a.log', origin: 'https://example.com/*', at: 1000 };
  it('keeps a fresh, well-formed request', () => {
    expect(pendingToRun(p, 2000)).toEqual(p);
  });
  it('drops stale requests, mismatched origins and junk', () => {
    expect(pendingToRun(p, 1000 + PENDING_TTL_MS + 1)).toBeNull();
    expect(pendingToRun({ ...p, origin: 'https://other.com/*' }, 2000)).toBeNull();
    expect(pendingToRun({ ...p, url: 'javascript:alert(1)' }, 2000)).toBeNull();
    expect(pendingToRun(undefined, 2000)).toBeNull();
    expect(pendingToRun({ tabId: '3' }, 2000)).toBeNull();
  });
});
