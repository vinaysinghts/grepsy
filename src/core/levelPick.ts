/**
 * Which levels to show after a click on a level button.
 *
 * A plain click shows only that level, and a second click on the same one
 * shows everything again. Ctrl/⌘+click adds or removes one level, for views
 * like "errors and warnings". Showing nothing at all is never useful, so an
 * empty result means everything.
 */
export function nextLevels(current: readonly number[], all: readonly number[], code: number, additive: boolean): number[] {
  if (additive) {
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    return next.length ? next : [...all];
  }
  const only = current.length === 1 && current[0] === code;
  return only ? [...all] : [code];
}
