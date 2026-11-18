import { detectLevel, type Level } from './level';
import { readLines } from './readLines';

export interface Summary {
  lines: number;
  levels: Record<Level, number>;
}

/** Counts lines and levels in a file. A first, end-to-end use of the core. */
export async function summarize(blob: Blob): Promise<Summary> {
  const summary: Summary = {
    lines: 0,
    levels: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, TRACE: 0 },
  };
  for await (const batch of readLines(blob)) {
    for (const line of batch) {
      summary.lines++;
      const level = detectLevel(line);
      if (level) summary.levels[level]++;
    }
  }
  return summary;
}
