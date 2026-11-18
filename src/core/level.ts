export type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE';

/** Only the start of a line is checked, where formats put the level. */
const SCAN_LIMIT = 120;

const TOKEN = /(?:^|[\s[(|"'=:])(FATAL|CRIT(?:ICAL)?|ERROR|ERR|SEVERE|WARN(?:ING)?|INFO|NOTICE|DEBUG|TRACE|VERBOSE)(?=$|[\s\])|"':,])/i;
const JSON_LEVEL = /"(?:level|severity|lvl)"\s*:\s*"([a-z]+)"/i;

const ALIASES: Record<string, Level> = {
  fatal: 'ERROR',
  crit: 'ERROR',
  critical: 'ERROR',
  error: 'ERROR',
  err: 'ERROR',
  severe: 'ERROR',
  warn: 'WARN',
  warning: 'WARN',
  info: 'INFO',
  notice: 'INFO',
  debug: 'DEBUG',
  trace: 'TRACE',
  verbose: 'TRACE',
};

/**
 * Finds the log level of a line from its level field, such as
 * `2026-11-16 09:14:05 WARN [payments] ...` or `{"level":"error", ...}`.
 *
 * Unlike a keyword search over the whole line, a message that merely
 * mentions "error" (e.g. `INFO retrying after error`) keeps its real level.
 * Returns null when the line has no recognisable level, such as a stack
 * trace continuation line.
 */
export function detectLevel(line: string): Level | null {
  const head = line.length > SCAN_LIMIT ? line.slice(0, SCAN_LIMIT) : line;
  const json = JSON_LEVEL.exec(head);
  if (json) return ALIASES[(json[1] ?? '').toLowerCase()] ?? null;
  const match = TOKEN.exec(head);
  if (!match) return null;
  return ALIASES[(match[1] ?? '').toLowerCase()] ?? null;
}
