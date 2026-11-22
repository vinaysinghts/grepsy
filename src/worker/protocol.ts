// Messages between the viewer page and the parsing worker.

export interface ViewQuery {
  text: string;
  caseSensitive: boolean;
  regex: boolean;
  filter: boolean;
  context: number;
  /** Level codes that are switched on (see LEVEL_CODES; 0 = no level). */
  levels: number[];
}

export type Request =
  | { type: 'open'; file: File }
  | { type: 'view'; id: number; query: ViewQuery }
  | { type: 'expand'; id: number; start: number; end: number }
  | { type: 'collapse'; id: number; start: number; end: number }
  | { type: 'bookmark'; id: number; line: number }
  | { type: 'rows'; id: number; start: number; count: number }
  | { type: 'find'; id: number; fromRow: number; direction: 1 | -1; target: 'match' | 'error' | 'bookmark' };

export type Row =
  | {
      kind: 'line';
      line: number;
      text: string;
      level: number;
      bookmarked: boolean;
      /**
       * Set on the first line of a run the user revealed from a gap: the
       * lines that run covers, so it can be hidden again.
       */
      revealed?: { start: number; end: number; count: number };
      /** Shown only because the user revealed it from a gap. */
      extra?: boolean;
    }
  | { kind: 'gap'; start: number; end: number };

export type Response =
  | { type: 'progress'; lines: number; bytes: number; totalBytes: number }
  | { type: 'loaded'; lines: number; counts: number[]; ms: number }
  | { type: 'view'; id: number; rowCount: number; matches: number; bookmarks: number; error: string | null }
  | { type: 'rows'; id: number; start: number; rows: Row[] }
  | { type: 'found'; id: number; row: number | null };
