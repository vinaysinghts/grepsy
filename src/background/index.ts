import { shouldAutoOpen } from '../core/autoOpen';

const viewerUrl = (src?: string) =>
  chrome.runtime.getURL('viewer.html') + (src ? `?src=${encodeURIComponent(src)}` : '');

// Clicking the toolbar icon (or the keyboard shortcut) opens the viewer in a new tab.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: viewerUrl() });
});

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
