import { describe, expect, it } from 'vitest';
import { LineSplitter } from '../src/core/lineSplitter';

function splitAll(chunks: string[]): string[] {
  const s = new LineSplitter();
  const out = chunks.flatMap((c) => s.push(c));
  return [...out, ...s.flush()];
}

describe('LineSplitter', () => {
  it('splits LF, CRLF and CR line endings', () => {
    expect(splitAll(['a\nb\r\nc\rd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('joins a line that spans chunks', () => {
    expect(splitAll(['hel', 'lo\nwor', 'ld'])).toEqual(['hello', 'world']);
  });

  it('treats CRLF split across chunks as one line ending', () => {
    expect(splitAll(['a\r', '\nb'])).toEqual(['a', 'b']);
  });

  it('keeps empty lines', () => {
    expect(splitAll(['a\n\n\nb\n'])).toEqual(['a', '', '', 'b']);
  });

  it('does not add a line for a trailing newline', () => {
    expect(splitAll(['a\n'])).toEqual(['a']);
  });

  it('returns nothing for empty input', () => {
    expect(splitAll([''])).toEqual([]);
  });

  it('gives the same result for any chunking', () => {
    const text = 'one\r\ntwo\nthree\r\r\nfour\n';
    const whole = splitAll([text]);
    for (let size = 1; size <= text.length; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
      expect(splitAll(chunks)).toEqual(whole);
    }
  });
});
