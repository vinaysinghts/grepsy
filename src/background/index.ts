import { autoOpenWanted, isReturnVisit, shouldAutoOpen, shouldAutoOpenWeb } from '../core/autoOpen';
import { isPlainText, pendingToRun } from '../core/currentTab';
import { viewerPath } from '../core/recent';
import { VIEW_KEY_PREFIX, viewsToRestore } from '../core/restore';

const viewerUrl = (src: string) => chrome.runtime.getURL(viewerPath({ src }));

// The toolbar icon (and Ctrl+Shift+L) shows popup.html, set in the manifest;
// every popup action opens the viewer in a tab.

// Auto-open (on unless the user turned it off): a tab that opens a local log
// is sent to the viewer. Chrome only reveals file:// tab URLs here once the
// user has turned on "Allow access to file URLs" for Grepsy.
//
// The same setting covers .log links on websites, once the user has allowed
// Grepsy to see web tabs (one click in the popup). A web page is only taken
// over once it has loaded and Chrome says it is plain text, so HTML pages
// never are.
//
// Each tab remembers the last URL it left for the viewer, so Back from the
// viewer lands on the log instead of bouncing straight back.
const redirectKey = (tabId: number) => `redirected:${tabId}`;

async function sendToViewer(tabId: number, url: string): Promise<void> {
  const key = redirectKey(tabId);
  const { [key]: last } = await chrome.storage.session.get(key);
  if (isReturnVisit(url, last)) return;
  await chrome.storage.session.set({ [key]: url });
  await chrome.tabs.update(tabId, { url: viewerUrl(url) });
}

async function isPlainTextTab(tabId: number): Promise<boolean> {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => document.contentType });
    return typeof res?.result === 'string' && isPlainText(res.result);
  } catch {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // info.url is only set when the URL changes; a reload or a file opened from
  // the desktop into a new tab may only report status, so fall back to tab.url.
  const url = info.url ?? (info.status === 'loading' ? tab.url : undefined);
  if (url && shouldAutoOpen(url)) {
    void chrome.storage.local.get('autoOpen').then(({ autoOpen }) => {
      if (autoOpenWanted(autoOpen)) void sendToViewer(tabId, url);
    });
    return;
  }
  const loaded = info.status === 'complete' ? tab.url : undefined;
  if (loaded && shouldAutoOpenWeb(loaded)) {
    void chrome.storage.local.get('autoOpen').then(async ({ autoOpen }) => {
      if (!autoOpenWanted(autoOpen) || !(await isPlainTextTab(tabId))) return;
      await sendToViewer(tabId, loaded);
    });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(redirectKey(tabId)));

// "Open this file in Grepsy" in the popup may first need the user to allow
// the site (or local files). Chrome can close the popup while its prompt is
// up, so the popup leaves the request in session storage and this finishes
// it once the permission is granted.
chrome.permissions.onAdded.addListener(() => {
  void chrome.storage.session.get('pendingOpen').then(async ({ pendingOpen }) => {
    const run = pendingToRun(pendingOpen, Date.now());
    if (!run || !(await chrome.permissions.contains({ origins: [run.origin] }))) return;
    await chrome.storage.session.remove('pendingOpen');
    await chrome.tabs.update(run.tabId, { url: viewerUrl(run.url) });
  });
});

// Chrome closes Grepsy's tabs when the extension reloads or updates. Reopen
// the logs that were open by link, as their original pages: auto-open then
// brings them back into Grepsy if it is on, and they stay as plain text if not.
// (Files picked from disk or pasted can't be reopened without the user.)
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'update') return;
  void chrome.storage.local.get(null).then(async (items) => {
    const stale = Object.keys(items).filter((k) => k.startsWith(VIEW_KEY_PREFIX));
    const reopen = viewsToRestore(items, Date.now());
    await chrome.storage.local.remove(stale);
    for (const url of reopen) await chrome.tabs.create({ url, active: false });
  });
});
