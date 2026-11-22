# Store listing copy

Text for the Chrome Web Store and Microsoft Edge Add-ons listings. Images are in `store/` (regenerate with `npm run store:screenshots`).

## Name

Grepsy: Log Viewer (read from the manifest `name`, set by `storeName` in package.json; the dashboard does not let you edit it)

## Short description (132 characters max, read from the manifest `description`)

Open huge log files in your browser. Filter, highlight and jump between errors instantly. Nothing is uploaded.

## Category

Developer Tools

## Detailed description

Grepsy opens log files with millions of lines and lets you find what matters in seconds, without leaving your browser and without uploading anything.

Drop in a .log, .txt, .jsonl or .gz file, paste text, or open a URL. Then:

• Search as you type, with match-case and regular expressions
• Filter to matching lines, with ±2 or ±5 lines of context, and click to reveal hidden lines
• Show or hide Errors, Warnings, Info and Debug lines; stack traces stay with their error
• Press N to jump to the next error, Enter for the next match
• Color any term with saved highlight rules
• Bookmark lines and jump between them with F2
• Pretty-print JSON found inside a log line
• Light, dark, or follow your system theme
• Viewing a plain text log in a tab? Click the Grepsy icon and open it right there
• Optional: open .log files from your computer straight in Grepsy

Built for speed: a 1 million line, 76 MB log is ready in under a second. Lines are parsed in a background worker and drawn with virtual scrolling, so the page stays responsive.

Private by design: your files never leave your computer. No analytics, no accounts, no remote code. Nothing is asked at install beyond storage for your highlight rules and a one-tab look when you click the Grepsy icon.

Open source: https://github.com/vinaysinghts/grepsy

## Single purpose (for the review form)

View, search and filter log files locally in the browser.

## Permission justifications (for the review form)

- **storage:** saves the user's highlight rules between sessions.
- **activeTab:** when the user clicks the Grepsy icon, lets the popup read the current tab's URL so it can offer to open a plain text log from that tab in the viewer.
- **scripting:** with activeTab only, runs a one-line check (`document.contentType`) in the current tab after the icon is clicked, so the offer appears only for plain text files and never on web pages. No other code is injected and nothing is read from the page.
- **Optional host permission file:///*:** requested only when the user turns on "Open .log files automatically", to redirect local .log files to the viewer.
- **Optional host permissions http://*/*, https://*/*:** requested only when the user opens a log from a URL, to download that file.
- **Remote code:** none.

## Data usage disclosures

Grepsy does not collect or transmit any user data. Privacy policy: https://vinaysinghts.github.io/grepsy/privacy
