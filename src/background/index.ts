import { shouldAutoOpen } from '../core/autoOpen';
import { viewerPath } from '../core/recent';

const viewerUrl = (src: string) => chrome.runtime.getURL(viewerPath({ src }));

// The toolbar icon (and Ctrl+Shift+L) shows popup.html, set in the manifest;
// every popup action opens the viewer in a tab.

// Optional: when the user turned on "open .log files automatically" (which
// grants file:// access), a tab that opens a local log is sent to the viewer.
// Without that permission Chrome never reveals file:// tab URLs here.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  const url = info.url;
  if (!url || !shouldAutoOpen(url)) return;
  void chrome.storage.local.get('autoOpen').then(({ autoOpen }) => {
    if (autoOpen === true) void chrome.tabs.update(tabId, { url: viewerUrl(url) });
  });
});
