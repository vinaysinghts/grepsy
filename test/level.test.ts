import { describe, expect, it } from 'vitest';
import { detectLevel } from '../src/core/level';

describe('detectLevel', () => {
  it.each([
    ['2026-11-16 09:14:05.601 WARN  [payments] upstream timeout', 'WARN'],
    ['2026-11-16 09:14:11.640 ERROR [payments] request failed', 'ERROR'],
    ['[2026-07-13 12:00:01] INFO  Starting the auth engine', 'INFO'],
    ['Nov 16 09:14:02 host app[312]: DEBUG cache hit', 'DEBUG'],
    ['level=warning msg="disk almost full"', 'WARN'],
    ['{"ts":"2026-11-16T09:14:05Z","level":"error","msg":"boom"}', 'ERROR'],
    ['{"severity":"INFO","message":"ok"}', 'INFO'],
    ['[FATAL] out of memory', 'ERROR'],
    ['[ERR] connection reset', 'ERROR'],
  ])('reads the level of %s', (line, level) => {
    expect(detectLevel(line)).toBe(level);
  });

  it('uses the level field, not words later in the message', () => {
    expect(detectLevel('09:14:02 INFO retrying after error from upstream')).toBe('INFO');
  });

  it('does not match level words inside other words', () => {
    expect(detectLevel('terror information debugger')).toBeNull();
  });

  it('returns null for lines without a level', () => {
    expect(detectLevel('    at com.example.Service.call(Service.java:42)')).toBeNull();
    expect(detectLevel('')).toBeNull();
  });
});
