// Clicking the toolbar icon (or the keyboard shortcut) opens the viewer in a new tab.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
});
