# 7. Open the current tab's text file from the popup

Date: 2026-11-22 · Status: accepted

## Context

People often already have a log open in a tab: a local `.log` or `.txt` shown by Chrome as plain text, or a CI "raw log" link. Copying that URL into the popup's link box is a chore. The popup should notice and offer to open it, but only for plain text: an HTML page, a website or a directory listing must never get the offer.

## Decision

- Add `activeTab` and `scripting` to the install permissions. Neither shows an install warning. Clicking the icon (or `Ctrl+Shift+L`) grants access to that one tab until it navigates.
- When the popup opens, it reads the active tab's URL and runs `document.contentType` in it. The offer appears only for `text/plain` (and newline-delimited JSON) on `file:`, `http:` or `https:`. The file name is never enough on the web: `example.com/app.log` served as HTML gets nothing.
- For local files Chrome blocks scripts until "Allow access to file URLs" is on, so the content type can't be read. There the offer falls back to log-like names (`.log`, `.log.N`, `.txt`, `.out`, `.err`, `.jsonl`, `.ndjson`).
- **Open this file in Grepsy** replaces the tab with `viewer.html?src=<url>` (the back button returns to the plain view). The viewer downloads the file as for any link, so it still needs the site's optional host permission (ADR 5), or `file:///*` plus the file-access toggle for local files. The popup asks for that permission on the click; for local files with the toggle off, it shows the step and a button to the extension's settings first.
- Chrome may close the popup while its permission prompt is up. The popup first writes the request to `chrome.storage.session`; the background script completes it on `permissions.onAdded` if the popup is gone (requests older than a minute are dropped).
- The link box stays, below the main actions, for logs not yet open in a tab. It also feeds the Recent list.

## Consequences

- One click to go from a plain text log tab to the viewer, in the same tab.
- The decision logic (`src/core/currentTab.ts`) is pure and unit tested. The e2e test drives the real popup and tab navigation, but stubs the active tab lookup, because headless Chromium can't click the toolbar icon to grant `activeTab`.
- Granting `file:///*` this way doesn't turn on auto-open; that stays a separate choice.

## Addendum: auto-open in the popup

The "Open .log files automatically" switch (ADR 5) was only on the viewer's start screen, which people rarely see now that the icon shows the popup. The popup now carries the same switch as **Always open .log files in Grepsy**, sharing `setupAutoOpen`. As with the tab offer, if Chrome closes the popup during the `file:///*` prompt, a note in `chrome.storage.session` lets the background script finish turning it on.
