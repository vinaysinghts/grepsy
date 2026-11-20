import {
  forgetRecent,
  loadRecent,
  parseUrlInput,
  recentSource,
  timeAgo,
  viewerPath,
  type RecentLog,
} from '../core/recent';
import { setupTheme } from '../viewer/theme';

// First, so the popup paints in the right theme.
setupTheme();

/**
 * The toolbar popup: quick ways in. Every action opens the viewer in a tab,
 * because a log needs the room. The popup never reads a file itself: Chrome
 * closes a popup as soon as a file chooser takes focus, so "Open a log file"
 * hands off to the viewer's start screen.
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
