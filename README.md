# Logify Chrome Extension

Logify is a high-performance, developer-focused local log viewer extension for Google Chrome. It transforms raw `.log` files loaded in the browser into an interactive, beautifully formatted, and easily navigable console UI capable of rendering millions of lines smoothly using virtual scrolling.

---

## Key Features

*   ⚡ **Virtual Scrolling Viewport**: Handles massive logs (up to 1,000,000+ lines) at 60 FPS by rendering only visible rows on screen.
*   🔍 **RegEx Filter & Search Toggles**: Powerful search bar with instant highlight updates, match-casing toggle, and RegEx engine active by default. Includes a vector SVG funnel toggle button to enable/disable filtering:
    *   **Filter Enabled**: Only matching lines are shown, with collapsed context gaps.
    *   **Filter Disabled (Search-Only Mode)**: All log lines remain visible at 100% opacity, with matches highlighted for easy scrolling.
*   📣 **Dynamic Toast Notifications**: Informs you with responsive toast messages whenever you toggle filtering states or copy text.
*   🏷️ **Interactive Severity Filters**: Instantly filter logs by `Error` (🔴), `Warning` (⚠️), or `Bookmarks` (⭐) severity counts.
*   📝 **Exceptions & Traceback Highlighting**: Detects Java, Python, and JavaScript stack trace lines (e.g. `at ...`, `caused by:`, `File "...", line ...`) automatically and marks them as errors.
*   📐 **Zero-Shift Gutter Layout**: Displays formatting tools `{}` on hover, line numbers, and the expand context button `>` (automatically hidden when filtering is disabled). 
*   🔄 **Toggleable Gutter Context**: In Filter Mode, clicking `>` on a matching row reveals 5 lines of surrounding context above/below, changing the arrow to `▼`. Click it again to collapse it.
*   🧭 **Down-First Navigation Groups**: Cycle through matches/errors or bookmarks. Next/Down buttons (`⤓` / `F8` / `F2`) are positioned first (on the left) to match downstream scanning ergonomics, followed by Previous/Up (`⤒` / `Shift+F8` / `Shift+F2`).
*   ⚙️ **Custom Keyword Manager**: Click the extension popup icon in the browser toolbar to add, modify, or delete custom warning and error highlight keywords.
*   🌈 **Multi-Color Highlights Panel**: Open the highlights overlay card (`Alt + H` or taskbar button) containing 10 inputs. Each field supports regex by default, highlights instantly in a unique vibrant color, and features a pushpin button (📌) to persist terms.
*   📋 **Custom Filter Presets Dropdown**: Manage up to 10 custom search/filter presets inside the popup setting screen. 
    *   **Interactive Editing**: Click any saved preset in the popup list to load its values back into the inputs for quick modifications.
    *   **Space Preservation**: Preserves trailing and leading spaces (e.g. `'view '`) in your preset terms.
    *   Select presets instantly using the glassmorphic taskbar dropdown to filter or highlight search terms.
*   🎨 **Rich Minimalist Aesthetics**: Glassmorphic floating taskbar, Outfit typeface, Fira Code/Mono console fonts, and high-contrast pastel multicolor highlights for maximum readability on black layouts.

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
5. The extension is now active! The Logify logo will appear in your extensions list.

---

## How to Use

1. **Load a Log File**: Open any local log file (`.log` extension) in Chrome or drag and drop a log file directly into a Chrome browser tab.
2. **Explore**:
    *   Click the **Gutter area** or **Line numbers** to bookmark lines.
    *   Hover over rows and click **`{}`** to automatically format and prettify any structured bracket (`{}`, `[]`, `()`) or JSON data in a modal popup.
    *   Click **`>`** to expand context around a match, and click **`▼`** to collapse it back.
    *   Enter text/RegEx in the search box to filter rows. Use `|` (pipe) to search multiple keywords at once (each term will get a distinct pastel highlight color!).
3. **Configure Custom Keywords**: Click the **Logify** icon in the extensions toolbar to customize which keywords should automatically highlight as errors or warnings.

---

## File Structure

```text
├── manifest.json       # Extension metadata and permissions
├── background.js       # Background service worker (intercepts raw text loading)
├── content.js          # Core engine (virtual scroll viewport, parser, handlers)
├── content.css         # Styling (viewer layouts, animations, highlights)
├── popup.html          # Extension action popup HTML
├── popup.js            # Keyword storage and propagation script
├── popup.css           # Popup layout styling rules
├── icon*.png           # Full-bleed minimalist logo assets (16, 32, 48, 128)
└── README.md           # Documentation
```
