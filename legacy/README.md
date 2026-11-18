> **Legacy code.** This is the original LogLens extension, kept for reference while its features are ported to the rebuild (see the root README). Its icons moved to `public/icons/`, so load it unpacked only after copying them back.

# LogLens Chrome Extension

LogLens is a high-performance, developer-focused local log viewer extension for Google Chrome and Chromium-based browsers (including Edge, Brave, Opera, and Vivaldi). It transforms raw `.log` files loaded in the browser into an interactive, beautifully formatted, and easily navigable console UI capable of rendering millions of lines smoothly using high-performance virtual scrolling.

---

## Interactive Floating Taskbar Layout

LogLens features a glassmorphic floating taskbar at the top of the viewport. Below is a map of the control console and its interactive options:

```text
+-------------------------------------------------------------------------------------------------------------------------+
| [LogLens] Showing: X/Y  [Filter... [⧩][aA][.*]]  [📋 Presets] [⎚ Clear] [⤓][⤒] [⭐⤓][⭐⤒]  | 🔴 X  ⚠️ Y  ⭐ Z |  [⧉] [🖍️] [↩] [🪵] [✕] |
| <-------- LEFT PANEL (Query Console & Controls) ------------------------------------> | <-- CENTER BADGES --> | <--- RIGHT UTILITIES ---> |
+-------------------------------------------------------------------------------------------------------------------------+
```

### 1. Left Panel (Query Console & Navigation)
*   **Logo (`LogLens`)**: Brand indicator.
*   **Lines Counter (`Showing: X / Y`)**: Placed next to the logo. Displays the number of visible lines currently showing in the viewport (`X`) out of the total parsed log lines (`Y`) in real-time.
*   **Search Box (`[Filter... [⧩][aA][.*]]`)**: Type words or regular expressions here to instantly filter lines.
    *   **Filter Toggle Funnel (`⧩` / SVG)**: Toggles filtering behaviour.
        *   *Filter Enabled*: Hides non-matching lines, collapsing them into interactive context gaps.
        *   *Filter Disabled (Search-Only Mode)*: Shows all lines at normal opacity but highlights the matches in bright colors.
    *   **Match Case (`aA`)**: Toggles case-sensitivity for the search input.
    *   **RegEx Mode (`.*`)**: Toggles regular expression parsing for search patterns.
*   **Presets Menu (`📋 Presets`)**: A dropdown lists up to 10 saved filter queries. On opening, it pre-scans matching lines in the background and displays matching counts (e.g. `query (142 matches)`). Preserves leading/trailing spacing in preset terms.
*   **Clear Button (`⎚ Clear`)**: Clears the search input and exits badge filters, returning to full log display. (Only visible when active query is present).
*   **Match/Error Navigation (`⤓` / `⤒`)**: 
    *   Cycle focus to the **Next** match or **Previous** match.
    *   If the filter input is empty, these buttons default to cycling focus through **Errors** (`🔴`) in the log.
    *   Shortcuts: `F8` (Next) / `Shift+F8` (Previous).
*   **Bookmarks Navigation (`⭐⤓` / `⭐⤒`)**:
    *   Cycles focus to the next/previous bookmarked log lines.
    *   Buttons automatically light up in active blue once a bookmark is created, and disable (grey out) when bookmarks count is zero.
    *   Shortcuts: `F2` (Next) / `Shift+F2` (Previous).

### 2. Center Panel (Filter Badges)
*   **Error Badge (`🔴 X`)**: Displays total errors found in the log (including tracebacks). Clicking it filters the viewport to show only error rows.
*   **Warning Badge (`⚠️ Y`)**: Displays total warnings found in the log. Clicking it filters the viewport to show only warning rows.
*   **Bookmarks Badge (`⭐ Z`)**: Displays total bookmarked rows. Clicking it filters the viewport to show only bookmarked rows.

### 3. Right Panel (Utility Panel)
*   **Copy Button (`⧉`)**: Copies all filtered lines to clipboard. (Only visible when filters are active).
*   **Highlights Panel (`🖍️ Highlights`)**: Toggles the 10-field multi-color highlight manager. Type search patterns to assign up to 10 unique pastel colors to different keywords simultaneously. Use the pushpin (📌) button to save terms permanently. Shortcut: `Alt+H`.
*   **Word Wrap Toggle (`↩`)**: Toggles row wrapping. When enabled, the virtual scroll adapts to dynamic row heights automatically. Shortcut: `Alt+W`.
*   **Diagnostics Exporter (`🪵`)**: Copies a structured JSON event log of the last 200 system milestones (parsing times, search inputs, active filters, errors) to clipboard for debugging.
*   **Restore View (`✕`)**: Exits LogLens viewer completely and restores the browser's default raw plain-text display.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Esc` | Clear all active search filters and badge views / Close modal overlays |
| `F8` | Cycle to **Next** error or filtered match |
| `Shift + F8` | Cycle to **Previous** error or filtered match |
| `F2` | Cycle to **Next** bookmarked line |
| `Shift + F2` | Cycle to **Previous** bookmarked line |
| `Alt + W` | Toggle word wrap |
| `Alt + H` | Toggle **Multi-Color Highlights** overlay |

---

## Installation (Local Development Mode)

Since the extension is developed locally, you can load it directly into Google Chrome as an unpacked directory:

1. Open **Google Chrome** and navigate to `chrome://extensions`.
2. Enable **Developer mode** by toggling the switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the extension directory:
   `C:\Users\Lenovo\Documents\vinay\projects\logify-chrome-ext`
5. The extension is now active! The LogLens logo will appear in your extensions list.

---

## How to Use

1. **Load a Log File**: Open any local log file (`.log` extension) in Chrome or drag and drop a log file directly into a Chrome browser tab.
2. **Explore**:
    *   Click the **Gutter area** or **Line numbers** to bookmark lines.
    *   Hover over rows and click **`{}`** to automatically format and prettify any structured bracket (`{}`, `[]`, `()`) or JSON data in a modal popup.
    *   Click **`>`** to expand context around a match, and click **`▼`** to collapse it back.
    *   Enter text/RegEx in the search box to filter rows. Use `|` (pipe) to search multiple keywords at once (each term will get a distinct pastel highlight color!).
3. **Configure Custom Settings**: Click the **LogLens** icon in the extensions toolbar to customize virtual scroll thresholds, warning/error keywords, and preset filters.
