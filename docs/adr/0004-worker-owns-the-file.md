# 4. The worker owns the file; the page asks only for visible rows

Date: 2026-11-18 · Status: accepted

## Context

Searching or filtering a million lines takes tens to hundreds of milliseconds. If that ran on the page's main thread, typing and scrolling would stutter on big files.

## Decision

- A dedicated Web Worker reads the file (ADR 3) into a `LineStore`: lines in 4,096-line blocks plus one byte per line for its level.
- For each search, the worker tests every line once and builds a **view**: an `Int32Array` of row entries, where a value ≥ 0 is a line and a negative value is a gap of hidden lines (`buildView` in `src/core/view.ts`).
- The page only knows the row count. While scrolling, it asks for the rows on screen plus one screen above and below, and draws about 60 DOM rows.
- Lists taller than the browser's maximum element height are scaled (`src/core/virtual.ts`), so very large files still scroll end to end.
- Log text reaches the DOM only as text nodes, never as HTML.

## Consequences

- A 1M-line, 76 MB log loads in about 0.7 s in headless Chromium, and the UI stays responsive while searching.
- Every page interaction is an async round trip; responses carry a view id so stale replies are dropped.
- Memory is still about 2x the file size because lines are JS strings. A later step can store raw bytes plus line offsets if multi-GB files need it.
