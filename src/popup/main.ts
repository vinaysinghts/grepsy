import {
  forgetRecent,
  loadRecent,
  parseUrlInput,
  recentSource,
  timeAgo,
  viewerPath,
  type RecentLog,
} from '../core/recent';
import { accessStep, originPattern, tabOffer, type PendingOpen, type TabOffer } from '../core/currentTab';
import { setupAutoOpen } from '../viewer/sources';
import { setupTheme } from '../viewer/theme';

// First, so the popup paints in the right theme.
setupTheme();

/**
 * The toolbar popup: quick ways in. Every action opens the viewer in a tab,
 * because a log needs the room. The popup never reads a file itself: Chrome
 * closes a popup as soon as a file chooser takes focus, so "Open a log file"
 * hands off to the viewer's start screen.
 *
 * When the active tab is a plain text file (a local .log, or a web link the
 * browser shows as text), the popup leads with "Open this file in Grepsy",
 * which turns that same tab into the viewer. Clicking the icon grants
 * activeTab, which is what lets the popup see the tab's URL and ask it for
 * its content type; no tab access is held otherwise.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const urlForm = $<HTMLFormElement>('url-form');
const urlInput = $<HTMLInputElement>('url');
const urlError = $('url-error');
const list = $<HTMLUListElement>('recent');
const empty = $('recent-empty');

function openViewer(path: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

if (/Mac/i.test(navigator.platform)) {
  $('shortcut').innerHTML = '<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>';
}

$('open-file').addEventListener('click', () => openViewer(viewerPath()));
$('open-paste').addEventListener('click', () => openViewer(viewerPath({ paste: true })));

urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = parseUrlInput(urlInput.value);
  if (!url) {
    urlError.textContent = 'Enter an http, https or file link.';
    urlError.hidden = false;
    urlInput.focus();
    return;
  }
  openViewer(viewerPath({ src: url }));
});
urlInput.addEventListener('input', () => {
  urlError.hidden = true;
});

function drawRecent(items: RecentLog[]): void {
  const now = Date.now();
  list.replaceChildren(
    ...items.map((r) => {
      const li = document.createElement('li');
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'recent-open';
      open.title = r.url;
      const name = document.createElement('span');
      name.className = 'recent-name';
      name.textContent = r.name;
      const time = document.createElement('span');
      time.className = 'recent-time';
      time.textContent = timeAgo(r.openedAt, now);
      const from = document.createElement('span');
      from.className = 'recent-from';
      from.textContent = recentSource(r.url);
      open.append(name, time, from);
      open.addEventListener('click', () => openViewer(viewerPath({ src: r.url })));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'recent-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${r.name} from recent`);
      remove.title = 'Remove from recent';
      remove.addEventListener('click', async () => {
        await forgetRecent(chrome.storage.local, r.url);
        drawRecent(await loadRecent(chrome.storage.local));
      });
      li.append(open, remove);
      return li;
    }),
  );
  empty.hidden = items.length > 0;
}

void loadRecent(chrome.storage.local).then(drawRecent);

// ---- The active tab --------------------------------------------------------

/** Asks the tab what it is showing. Null when Chrome won't let us look (e.g. file:// without file access). */
async function contentTypeOf(tabId: number): Promise<string | null> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.contentType });
    return typeof res?.result === 'string' ? res.result : null;
  } catch {
    return null;
  }
}

const tabError = $('tab-error');
function showTabError(text: string): void {
  tabError.textContent = text;
  tabError.hidden = false;
}

function goToViewer(tabId: number, url: string): void {
  void chrome.tabs.update(tabId, { url: chrome.runtime.getURL(viewerPath({ src: url })) });
  window.close();
}

async function openTab(tabId: number, offer: TabOffer): Promise<void> {
  tabError.hidden = true;
  const origin = originPattern(offer.url);
  const step = accessStep(offer, {
    fileAccess: await chrome.extension.isAllowedFileSchemeAccess(),
    granted: await chrome.permissions.contains({ origins: [origin] }),
  });
  if (step === 'file-toggle') {
    $('tab-step').hidden = false;
    return;
  }
  if (step === 'open') return goToViewer(tabId, offer.url);

  // Chrome may close this popup while its prompt is up; the background script
  // then finishes the job from this note when the permission arrives.
  const pending: PendingOpen = { tabId, url: offer.url, origin, at: Date.now() };
  await chrome.storage.session.set({ pendingOpen: pending });
  let granted: boolean;
  try {
    granted = await chrome.permissions.request({ origins: [origin] });
  } catch (err) {
    await chrome.storage.session.remove('pendingOpen');
    return showTabError(`Could not ask for access: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!granted) {
    await chrome.storage.session.remove('pendingOpen');
    const where = offer.local ? 'local files' : new URL(offer.url).host;
    return showTabError(`Grepsy needs your OK to read ${where}. Click again and choose Allow.`);
  }
  // Normally the background script has already moved the tab; if not, do it here.
  const { pendingOpen } = await chrome.storage.session.get('pendingOpen');
  if (pendingOpen) {
    await chrome.storage.session.remove('pendingOpen');
    goToViewer(tabId, offer.url);
  }
}

async function offerActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) return;
  const offer = tabOffer({ url: tab.url, contentType: await contentTypeOf(tab.id) });
  if (!offer) return;
  const tabId = tab.id;
  $('tab-name').textContent = offer.name;
  $('tab-from').textContent = offer.local ? 'on this computer' : `from ${new URL(offer.url).host}`;
  $('open-file').classList.remove('primary');
  $('this-tab').hidden = false;
  $('open-tab').addEventListener('click', () => void openTab(tabId, offer));
  $('tab-step-btn').addEventListener('click', () => {
    void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    window.close();
  });
}

void offerActiveTab();
void setupAutoOpen();
