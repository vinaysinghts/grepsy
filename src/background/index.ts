import { autoOpenWanted, shouldAutoOpen } from '../core/autoOpen';
import { pendingToRun } from '../core/currentTab';
import { viewerPath } from '../core/recent';

const viewerUrl = (src: string) => chrome.runtime.getURL(viewerPath({ src }));

// The toolbar icon (and Ctrl+Shift+L) shows popup.html, set in the manifest;
// every popup action opens the viewer in a tab.

// Auto-open (on unless the user turned it off): a tab that opens a local log
// is sent to the viewer. Chrome only reveals file:// tab URLs here once the
// user has turned on "Allow access to file URLs" for Grepsy.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  // info.url is only set when the URL changes; a reload or a file opened from
  // the desktop into a new tab may only report status, so fall back to tab.url.
  const url = info.url ?? (info.status === 'loading' ? tab.url : undefined);
  if (!url || !shouldAutoOpen(url)) return;
  void chrome.storage.local.get('autoOpen').then(({ autoOpen }) => {
    if (autoOpenWanted(autoOpen)) void chrome.tabs.update(tabId, { url: viewerUrl(url) });
  });
});

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
