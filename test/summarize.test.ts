import { describe, expect, it } from 'vitest';
import { summarize } from '../src/core/summarize';

describe('summarize', () => {
  it('counts lines and levels from a file', async () => {
    const text = [
      '09:00:01 INFO started',
      '09:00:02 WARN slow request',
      '09:00:03 ERROR failed',
      '    at handler (app.js:10)',
      '09:00:04 DEBUG done',
    ].join('\r\n');
    const s = await summarize(new Blob([text]));
    expect(s.lines).toBe(5);
    expect(s.levels).toEqual({ ERROR: 1, WARN: 1, INFO: 1, DEBUG: 1, TRACE: 0 });
  });

  it('handles an empty file', async () => {
    const s = await summarize(new Blob([]));
    expect(s.lines).toBe(0);
  });
});
