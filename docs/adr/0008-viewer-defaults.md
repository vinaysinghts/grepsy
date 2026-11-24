# 8. Defaults that match how people triage logs

Date: 2026-11-23 · Status: accepted

## Context

First feedback from real use: people search to narrow a log, not to highlight within it; they want one level at a time; they retype the same searches; and they open local `.log` files in Chrome expecting Grepsy to take over.

## Decision

- **Filter is on by default.** Typing a search hides non-matching lines. The Filter button turns it off.
- **Regex stays off by default.** Log text is full of regex metacharacters (`[payments]`, `(1/3)`, `user.id`, `$12.50`). As a regex, `[payments]` matches any one of those letters, and a half-typed `(` is an error. Literal search is right for pasted text; `.*` is one click away.
- **A level click shows only that level;** clicking it again shows all. Ctrl/⌘+click adds or removes one level. An empty selection means all, never nothing (`src/core/levelPick.ts`).
- **Saved searches reuse the Highlights list** instead of a second list. **Save** by the search box stores the term (with its regex flag); each saved term has a **Filter** button. One list means one place to manage terms, and every saved search is also highlighted.
- **Gaps open like a code review diff.** A gap of 10 lines or fewer opens fully in one click (a "show more" step there would only cost clicks). A bigger gap stays one bar, `↓ 5 more · show all · ↑ 5 more`: ↑ grows the lines below it upwards, ↓ grows the lines above it downwards, clicking the bar itself grows the block you are already opening. Each step is clamped to the gap, so it stops at the next line on show, and the bar disappears once the gap is empty. The worker merges opened ranges that touch or overlap, so a run of revealed lines is one block with one ⌄.
- **Copy shown / Save as .log** export exactly the lines on screen (filter results, context and opened gaps, no gap rows). The worker builds a `Blob` in chunks; copying over 50 MB is refused in favour of saving.
- **Auto-open is on by default.** `file:///*` moves from optional to install-time host permissions (file access shows no install warning). Chrome still keeps "Allow access to file URLs" off until the user flips it, which no extension can do, so the popup and start screen show that one step. Turning auto-open off is saved as `autoOpen: false`.

- **One auto-open switch for local files and web `.log` links,** on by default; off turns off both. Seeing web tab URLs needs access to every site, which Chrome shows as "read and change all your data on all websites". Asking that at install would warn every user, slow store review, and disable Grepsy for existing users until they re-approved, so the popup asks for it with one **Allow websites** click instead. Once allowed, a tab whose path looks like a log is taken over only after it loads and reports a plain text content type. The popup's **Open this file in Grepsy** stays the one-click path without it.
- **Back is never a trap.** Each tab remembers the last URL it left for the viewer (in session storage), and that URL isn't redirected again, so Back from the viewer shows the original log.

## Consequences

- Fewer clicks for the common path; the less common choices stay one click away.
- Users who turned auto-open off keep it off. Everyone else gets it once file access is on.
- Moving `file:///*` to install-time is checked by Chrome on update; if Chrome ever showed a warning for it, existing users would be asked to re-approve.
