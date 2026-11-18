# 1. Rebuild instead of refactoring LogLens

Date: 2026-11-18 · Status: accepted

## Context

LogLens (now in `legacy/`) works, but:

- All logic sits in one 2,165-line function with shared mutable state, so features can't be tested or changed in isolation.
- It only activates on `file:///…*.log` URLs, which means users must first turn on "Allow access to file URLs". That is the biggest drop-off point for new users.
- It waits for Chrome to render the whole file as text, then splits it on the main thread. Very large files freeze the tab.
- Errors are detected by keyword (`err`, `fail`, `alert` …) anywhere in a line, which gives many false positives.
- Page HTML is built from strings in 15 places while log content is untrusted input.

## Decision

Start a new codebase in TypeScript with a build, tests and CI, and port the proven ideas one by one: virtual scrolling, context gaps, multi-color highlights, presets, bookmarks and the JSON viewer.

## Consequences

- The legacy code stays in the repo as a reference until feature parity, then it is deleted.
- The early weeks deliver less visible change than a refactor would, but every ported feature arrives with tests.
