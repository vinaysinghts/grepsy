/**
 * Splits a stream of text chunks into lines.
 *
 * Chunks can end anywhere, including in the middle of a line or between the
 * `\r` and `\n` of a Windows line ending, so a partial line is held back until
 * the next chunk (or `flush`) completes it.
 */
export class LineSplitter {
  private pending = '';
  private pendingCR = false;

  /** Feed the next chunk; returns every line it completes. */
  push(chunk: string): string[] {
    if (chunk.length === 0) return [];
    let text = chunk;
    if (this.pendingCR) {
      // The previous chunk ended in "\r": it already ended a line.
      this.pendingCR = false;
      if (text.startsWith('\n')) text = text.slice(1);
    }
    const lines: string[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 10 /* \n */ || ch === 13 /* \r */) {
        lines.push(this.pending + text.slice(start, i));
        this.pending = '';
        if (ch === 13) {
          if (i + 1 < text.length) {
            if (text.charCodeAt(i + 1) === 10) i++;
          } else {
            this.pendingCR = true;
          }
        }
        start = i + 1;
      }
    }
    this.pending += text.slice(start);
    return lines;
  }

  /** Call once the input is finished; returns the last line if it had no line ending. */
  flush(): string[] {
    const rest = this.pending;
    this.pending = '';
    this.pendingCR = false;
    return rest.length > 0 ? [rest] : [];
  }
}
