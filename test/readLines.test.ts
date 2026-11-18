import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { isGzip, readLines } from '../src/core/readLines';

async function all(blob: Blob): Promise<string[]> {
  const out: string[] = [];
  for await (const batch of readLines(blob)) out.push(...batch);
  return out;
}

describe('readLines', () => {
  it('reads plain text line by line', async () => {
    expect(await all(new Blob(['a\r\nb\nc']))).toEqual(['a', 'b', 'c']);
  });

  it('decompresses gzipped logs', async () => {
    const text = Array.from({ length: 5000 }, (_, i) => `09:00 INFO line ${i}`).join('\n');
    const gz = new Blob([gzipSync(Buffer.from(text))]);
    expect(await isGzip(gz)).toBe(true);
    const lines = await all(gz);
    expect(lines).toHaveLength(5000);
    expect(lines[4999]).toBe('09:00 INFO line 4999');
  });

  it('decodes UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('héllo ✓\nwörld');
    const blob = new Blob([bytes.slice(0, 2), bytes.slice(2, 9), bytes.slice(9)]);
    expect(await all(blob)).toEqual(['héllo ✓', 'wörld']);
  });

  it('does not treat short or plain files as gzip', async () => {
    expect(await isGzip(new Blob(['x']))).toBe(false);
    expect(await isGzip(new Blob(['hello']))).toBe(false);
  });
});
