# 5. Ask for host access only when a feature needs it

Date: 2026-11-19 · Status: accepted

## Context

Two features need access beyond the extension's own pages: opening local `.log` files automatically (needs `file://` access) and opening a log by URL (needs access to that site). Requesting these at install time would show a scary "read your data on all websites" warning to everyone, including people who only ever drop files in.

## Decision

- Install-time permissions stay at `storage` only.
- `file:///*`, `https://*/*` and `http://*/*` are listed as **optional** host permissions.
- "Open .log files automatically" requests `file:///*` when the user turns it on. The background script then redirects tabs whose URL looks like a log (`.log`, `.log.N`, `.log.gz`, `.out`, `.err`, `.jsonl`) to `viewer.html?src=…`. Chrome also requires the user to turn on "Allow access to file URLs", and the start screen links to that page.
- "Open a URL" requests access to that one site's origin at the moment of the click.
- `?src=` only accepts `file:`, `http:` and `https:` URLs. The viewer page is not web-accessible, so other sites cannot navigate to it.

## Consequences

- The install prompt shows no warnings. Users see one targeted prompt per feature, in context.
- Turning auto-open off also gives back the `file://` permission.
- The `file://` redirect can't be covered by the headless e2e test, because Chrome offers no flag for the per-extension file-access toggle. The URL matching is unit tested, and the `?src=` loading path is e2e tested over HTTP.
