# Grepsy: a fast, private log viewer for Chromium browsers

Open huge log files in your browser, then filter, highlight and jump between errors. Files never leave your computer, and the extension asks for no permissions.

> **Status:** early rebuild. The previous extension, LogLens, lives in [`legacy/`](legacy/) for reference while features are ported.

## Develop

```sh
npm install
npm run dev      # rebuild into dist/ on every change
npm run check    # lint, typecheck, tests and production build
```

To load it in your browser, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `dist/` folder. The same steps work in Edge, Brave, Vivaldi and Opera.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure TypeScript: streaming line reader, level detection. No DOM or `chrome.*`, so it is unit tested and can run in a worker. |
| `src/viewer/` | The viewer page UI. |
| `src/background/` | Service worker: opens the viewer from the toolbar icon or `Ctrl+Shift+L`. |
| `manifest.config.ts` | Generates `manifest.json` from `package.json` (name, version, description). |
| `test/` | Vitest unit tests. |
| `docs/adr/` | Architecture decision records. |

## Renaming

The product name is `displayName` in `package.json`. The manifest and UI read it from there.

## License

MIT
