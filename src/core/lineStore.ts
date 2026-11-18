import { detectLevel, type Level } from './level';

/** Numeric level codes, stored one byte per line. 0 means "no level yet". */
export const LEVEL_CODES: Record<Level, number> = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4, TRACE: 5 };
export const LEVEL_NAMES: readonly (Level | null)[] = [null, 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'];
export const LEVEL_COUNT = LEVEL_NAMES.length;

const BLOCK = 4096;

/**
 * Holds every line of a file plus a one-byte level per line.
 *
 * Lines live in fixed-size blocks so appending millions of them never copies
 * one giant array. A line with no level of its own (a stack trace frame, a
 * wrapped message) takes the level of the line above it, so an error's
 * traceback is filtered together with the error.
 */
export class LineStore {
  private blocks: string[][] = [];
  private levels = new Uint8Array(BLOCK);
  private lastLevel = 0;
  readonly counts = new Array<number>(LEVEL_COUNT).fill(0);
  length = 0;

  append(lines: readonly string[]): void {
    for (const line of lines) {
      const i = this.length;
      if (i % BLOCK === 0) this.blocks.push([]);
      this.blocks[this.blocks.length - 1]!.push(line);
      if (i >= this.levels.length) {
        const grown = new Uint8Array(this.levels.length * 2);
        grown.set(this.levels);
        this.levels = grown;
      }
      const own = detectLevel(line);
      const code = own ? LEVEL_CODES[own] : this.lastLevel;
      this.levels[i] = code;
      this.lastLevel = code;
      this.counts[code]!++;
      this.length++;
    }
  }

  text(i: number): string {
    return this.blocks[Math.floor(i / BLOCK)]![i % BLOCK]!;
  }

  level(i: number): number {
    return this.levels[i]!;
  }
}
