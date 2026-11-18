import { LineSplitter } from './lineSplitter';

/**
 * Streams a file (or any Blob) line by line without loading it all into one
 * string, so memory stays flat while a multi-GB log is read.
 */
export async function* readLines(blob: Blob): AsyncGenerator<string[]> {
  const splitter = new LineSplitter();
  const reader = blob.stream().pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = splitter.push(value);
      if (lines.length > 0) yield lines;
    }
  } finally {
    reader.releaseLock();
  }
  const rest = splitter.flush();
  if (rest.length > 0) yield rest;
}
