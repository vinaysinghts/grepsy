# Logify Chrome Extension

Logify is a high-performance, developer-focused local log viewer extension for Google Chrome. It transforms raw `.log` files loaded in the browser into an interactive, beautifully formatted, and easily navigable console UI capable of rendering millions of lines smoothly using virtual scrolling.

---

## Key Features

*   ⚡ **Virtual Scrolling Viewport**: Handles massive logs (up to 1,000,000+ lines) at 60 FPS by rendering only visible rows on screen.
*   🔍 **RegEx Filter & Search**: Powerful search bar with instant highlight updates, match-casing toggle, and RegEx engine active by default.
*   🏷️ **Interactive Severity Filters**: Instantly filter logs by `Error` (🔴), `Warning` (⚠️), or `Bookmarks` (⭐) severity counts.
*   📝 **Exceptions & Traceback Highlighting**: Detects Java, Python, and JavaScript stack trace lines (e.g. `at ...`, `caused by:`, `File "...", line ...`) automatically and marks them as errors.
*   📐 **Zero-Shift Gutter Layout**: Displays the format button `{}` (on hover), expand context button `>` (always visible on matching rows), and line numbers side-by-side. 
*   🔄 **Toggleable Gutter Context**: Expanding a filtered row reveals 5 lines of context above/below, changing the arrow indicator to `▼`. Click it again to collapse the context back instantly.
*   🧭 **Bidirectional Navigation Groups**: Custom taskbar groups allow you to cycle forward and backward through errors/matches or bookmarked lines.
*   ⚙️ **Custom Keyword Manager**: Click the extension popup icon in the browser toolbar to add, modify, or delete custom warning and error highlight keywords in real time.
*   🎨 **Rich Minimalist Aesthetics**: Glassmorphic floating taskbar, Outfit typeface, and high-contrast pastel multicolor highlights for maximum readability on black layouts.

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
