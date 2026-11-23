# 8. Defaults that match how people triage logs

Date: 2026-11-23 · Status: accepted

## Context

First feedback from real use: people search to narrow a log, not to highlight within it; they want one level at a time; they retype the same searches; and they open local `.log` files in Chrome expecting Grepsy to take over.

## Decision

- **Filter is on by default.** Typing a search hides non-matching lines. The Filter button turns it off.
- **Regex stays off by default.** Log text is full of regex metacharacters (`[payments]`, `(1/3)`, `user.id`, `$12.50`). As a regex, `[payments]` matches any one of those letters, and a half-typed `(` is an error. Literal search is right for pasted text; `.*` is one click away.
- **A level click shows only that level;** clicking it again shows all. Ctrl/⌘+click adds or removes one level. An empty selection means all, never nothing (`src/core/levelPick.ts`).
- **Saved searches reuse the Highlights list** instead of a second list. **Save** by the search box stores the term (with its regex flag); each saved term has a **Filter** button. One list means one place to manage terms, and every saved search is also highlighted.
- **Big gaps (over 40 lines) offer the first 20, the last 20, or all.** Each opened piece folds back on its own with ⌄, because the worker keeps every opened range.
- **Copy shown / Save as .log** export exactly the lines on screen (filter results, context and opened gaps, no gap rows). The worker builds a `Blob` in chunks; copying over 50 MB is refused in favour of saving.
- **Auto-open is on by default.** `file:///*` moves from optional to install-time host permissions (file access shows no install warning). Chrome still keeps "Allow access to file URLs" off until the user flips it, which no extension can do, so the popup and start screen show that one step. Turning auto-open off is saved as `autoOpen: false`.

## Consequences

- Fewer clicks for the common path; the less common choices stay one click away.
- Users who turned auto-open off keep it off. Everyone else gets it once file access is on.
- Moving `file:///*` to install-time is checked by Chrome on update; if Chrome ever showed a warning for it, existing users would be asked to re-approve.
