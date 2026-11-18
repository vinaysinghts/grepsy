import { LineSplitter } from './lineSplitter';

/** True when the blob starts with the gzip magic bytes (1f 8b). */
export async function isGzip(blob: Blob): Promise<boolean> {
  if (blob.size < 2) return false;
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  return head[0] === 0x1f && head[1] === 0x8b;
}

/**
 * Streams a file (or any Blob) line by line without loading it all into one
 * string, so memory stays flat while a multi-GB log is read. Gzipped files
 * (`.log.gz`, rotated logs) are decompressed on the fly.
 */
export async function* readLines(blob: Blob): AsyncGenerator<string[]> {
  const splitter = new LineSplitter();
  let bytes = blob.stream();
  if (await isGzip(blob)) bytes = bytes.pipeThrough(new DecompressionStream('gzip')) as typeof bytes;
  const reader = bytes.pipeThrough(new TextDecoderStream()).getReader();
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
