# 2. The viewer is an extension page that needs no permissions

Date: 2026-11-18 · Status: accepted

## Context

LogLens injected a content script into `file://` pages and replaced the page body. That needs host permissions plus the file-URL toggle, it fights the page's own rendering, and it behaves differently across Chromium browsers.

## Decision

The viewer is `viewer.html` inside the extension, opened in its own tab by the toolbar icon or `Ctrl+Shift+L`. Files arrive through the File API (picker, drag and drop, paste). The manifest requests **no permissions** beyond `storage` (added for saved highlight rules; it triggers no install warning).

Opening `file://` logs automatically is planned as an *optional* feature that asks for access only when the user turns it on.

## Consequences

- Works the same on Chrome, Edge, Brave, Vivaldi, Opera and Arc.
- Store review is simpler, and "no permissions, nothing uploaded" becomes a selling point.
- Users who open logs by double-clicking need the optional feature to skip a step.
