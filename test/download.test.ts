import { describe, expect, it } from 'vitest';
import { httpFailureMessage, isHtmlResponse, isTextEntry, networkFailureMessage } from '../src/core/download';

describe('isTextEntry', () => {
  it.each([{ tagName: 'INPUT' }, { tagName: 'input' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }])(
    'treats %o as a text field',
    (t) => expect(isTextEntry(t)).toBe(true),
  );

  it.each([null, undefined, {}, { tagName: 'BODY' }, { tagName: 'DIV', isContentEditable: false }])(
    'treats %o as the page',
    (t) => expect(isTextEntry(t)).toBe(false),
  );
});

describe('networkFailureMessage', () => {
  it('points file:// users at the file access toggle', () => {
    expect(networkFailureMessage('file:///var/log/app.log')).toMatch(/Allow access to file URLs/);
  });

  it('names the host and suggests downloading for web links', () => {
    const msg = networkFailureMessage('https://logs.example.com/app.log');
    expect(msg).toMatch(/^Could not download from logs\.example\.com\./);
    expect(msg).toMatch(/downloading the file/);
  });
});

describe('httpFailureMessage', () => {
  it.each([
    [404, 'Not Found', 'example.com answered 404 Not Found: the file was not found.'],
    [403, '', 'example.com answered HTTP 403: you may need to sign in or lack access.'],
    [401, 'Unauthorized', 'example.com answered 401 Unauthorized: you may need to sign in or lack access.'],
    [502, '', 'example.com answered HTTP 502: the server had a problem.'],
    [418, "I'm a teapot", "example.com answered 418 I'm a teapot."],
  ])('%i %s', (status, text, expected) => {
    expect(httpFailureMessage('example.com', status, text)).toBe(expected);
  });
});

describe('isHtmlResponse', () => {
  it.each(['text/html', 'text/html; charset=utf-8', 'TEXT/HTML', 'application/xhtml+xml'])('%s is a page', (ct) =>
    expect(isHtmlResponse(ct)).toBe(true),
  );

  it.each([null, '', 'text/plain', 'application/octet-stream', 'application/gzip', 'application/json'])(
    '%s is not a page',
    (ct) => expect(isHtmlResponse(ct)).toBe(false),
  );
});
