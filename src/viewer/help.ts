import { REPO_URL } from '../config';

function browserName(): string {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[] } })
    .userAgentData?.brands;
  const real = brands?.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) ?? brands?.find((b) => /chromium/i.test(b.brand));
  return real ? `${real.brand} ${real.version}` : navigator.userAgent;
}

function version(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'dev';
  }
}

/** Links for the help menu. Bug reports are prefilled with version and browser only, never log content. */
export function helpLinks(): { knownIssues: string; reportBug: string; suggestFeature: string } {
  const bug = new URL(`${REPO_URL}/issues/new`);
  bug.searchParams.set('template', 'bug_report.yml');
  bug.searchParams.set('version', version());
  bug.searchParams.set('browser', browserName());
  return {
    knownIssues: `${REPO_URL}/issues?q=is%3Aissue+is%3Aopen`,
    reportBug: bug.toString(),
    suggestFeature: `${REPO_URL}/discussions/categories/ideas`,
  };
}

export function setupHelpMenu(): void {
  const toggle = document.getElementById('help-toggle') as HTMLButtonElement;
  const menu = document.getElementById('help-menu')!;
  const dialog = document.getElementById('shortcuts') as HTMLDialogElement;
  const links = helpLinks();
  (document.getElementById('known-issues') as HTMLAnchorElement).href = links.knownIssues;
  (document.getElementById('report-bug') as HTMLAnchorElement).href = links.reportBug;
  (document.getElementById('suggest-feature') as HTMLAnchorElement).href = links.suggestFeature;

  const setOpen = (open: boolean) => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });
  menu.addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.getElementById('show-shortcuts')!.addEventListener('click', () => dialog.showModal());
}

export function openShortcuts(): void {
  (document.getElementById('shortcuts') as HTMLDialogElement).showModal();
}
