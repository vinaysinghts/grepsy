# Grepsy: a fast, private log viewer for Chromium browsers

Open huge log files in your browser, then filter, highlight and jump between errors. Files never leave your computer, and the extension asks for no access to your sites or tabs.

> **Status:** early rebuild. The previous extension, LogLens, lives in [`legacy/`](legacy/) for reference while features are ported.

## Develop

```sh
npm install
npm run dev      # rebuild into dist/ on every change
npm run check    # lint, typecheck, tests and production build
npm run e2e      # load dist/ in Chromium and click through the viewer
```

## Using it

- **Open:** click the toolbar icon (or press `Ctrl+Shift+L`), then drop or choose a log file, or paste text. Gzipped logs (`.gz`) are decompressed automatically.
- **Search:** type in the search box. `Aa` matches case and `.*` switches to a regular expression.
- **Filter:** turn on **Filter** to hide lines that don't match. Pick **context ±2/±5** to keep lines around each match, and click a "lines hidden" row to reveal it.
- **Levels:** click Errors, Warnings, Info or Debug to hide or show them. Stack trace lines follow the level of the line they belong to.
- **Bookmarks:** click a line number. Use `F2` / `Shift+F2` to jump between bookmarks.
- **JSON:** lines that contain JSON get a `{ }` button that shows it pretty-printed.
- **Highlights:** open **Highlights** and add terms to color them in every log. They are saved across sessions.
- **Help and feedback:** the **?** menu has keyboard shortcuts, known issues, and links to report a bug or suggest a feature. See [docs/issue-workflow.md](docs/issue-workflow.md).
- **Jump:** `Enter` / `Shift+Enter` for the next or previous match, `N` / `Shift+N` for the next or previous error, `/` or `Ctrl+F` to search.

To load it in your browser, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist/` folder. The same steps work in Edge, Brave, Vivaldi and Opera.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure TypeScript: streaming line reader, level detection, line store, search, view model, virtual scrolling maths. No DOM or `chrome.*`, so it is unit tested. |
| `src/worker/` | The parsing worker and its message protocol. Holds the file's lines off the main thread. |
| `src/viewer/` | The viewer page UI. |
| `src/background/` | Service worker: opens the viewer from the toolbar icon or `Ctrl+Shift+L`. |
| `manifest.config.ts` | Generates `manifest.json` from `package.json` (name, version, description). |
| `test/` | Vitest unit tests, plus `test/e2e/` for the browser test. |
| `docs/adr/` | Architecture decision records. |

## Renaming

The product name is `displayName` in `package.json`. The manifest and UI read it from there.

## License

MIT
