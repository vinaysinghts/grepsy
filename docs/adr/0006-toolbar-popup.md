# 6. A toolbar popup in front of the viewer

Date: 2026-11-20 · Status: accepted

## Context

Clicking the toolbar icon used to open a new viewer tab straight away. That costs a tab even when the user only wanted to reopen yesterday's log or paste a link, and it gives no room for shortcuts. A log itself needs a full tab to read, so the viewer can't move into a popup.

## Decision

- The icon (and `Ctrl+Shift+L`) shows `popup.html`: **Open a log file**, **Paste text**, a link box (removed in [ADR 7](0007-open-current-tab.md)), and up to 8 **recent** logs. Every action opens the viewer in a tab and closes the popup.
- The popup never reads a file. Chrome closes a popup when a file chooser takes focus, so the `change` event would be lost; "Open a log file" hands off to the viewer's start screen.
- The popup passes work to the viewer through its URL: `?src=<link>` or `?paste=1`. No messaging or shared state is needed, and reloading the tab repeats the action.
- Recent logs are only those opened by link (web URLs, and local `file://` logs sent by auto-open). A picked or pasted file can't be reopened without the user choosing it again, so it isn't listed rather than listed and broken. Only the link, its file name and a time are stored, in `chrome.storage.local`.
- Site access is still asked for in the viewer (see [ADR 5](0005-optional-permissions.md)). If a `?src=` download fails and the site has not been granted, the viewer fills in its URL box and asks for a click, because Chrome only shows the permission prompt after one.

## Consequences

- One click fewer for repeat logs and links, and no stray empty tabs.
- `chrome.action.onClicked` no longer fires (it never does once a popup is set), so the service worker only handles auto-open.
- Logic that decides anything (recent list, link parsing, viewer paths) lives in `src/core/recent.ts` and is unit tested; the popup itself is covered by the e2e test.
