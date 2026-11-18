export type ThemeChoice = 'auto' | 'light' | 'dark';

const KEY = 'grepsy.theme';
const ORDER: ThemeChoice[] = ['auto', 'light', 'dark'];
const LABEL: Record<ThemeChoice, string> = { auto: 'Theme: auto', light: 'Theme: light', dark: 'Theme: dark' };

/** Auto → light → dark → auto. */
export function nextTheme(t: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(t) + 1) % ORDER.length] ?? 'auto';
}

export function parseTheme(v: unknown): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'auto';
}

/** The palette to paint: auto follows the system setting. */
export function resolveTheme(t: ThemeChoice, systemPrefersLight: boolean): 'light' | 'dark' {
  if (t === 'auto') return systemPrefersLight ? 'light' : 'dark';
  return t;
}

// localStorage (not chrome.storage) because it is synchronous: the theme is set before first paint, with no flash.
function load(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(KEY));
  } catch {
    return 'auto';
  }
}

function save(t: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

/** Applies the saved theme now and wires every [data-theme-toggle] button. */
export function setupTheme(): void {
  const media = matchMedia('(prefers-color-scheme: light)');
  let choice = load();
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'));
  const apply = (): void => {
    document.documentElement.dataset.theme = resolveTheme(choice, media.matches);
    for (const b of buttons) {
      b.dataset.choice = choice;
      b.title = `${LABEL[choice]} (click to change)`;
      b.setAttribute('aria-label', LABEL[choice]);
    }
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      choice = nextTheme(choice);
      save(choice);
      apply();
    });
  }
  media.addEventListener('change', apply);
  apply();
}
