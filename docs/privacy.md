# Grepsy privacy policy

_Last updated: 22 November 2026_

Grepsy is a log viewer that runs entirely inside your browser.

## What Grepsy does with your data

- **Log files and pasted text** are read and processed on your computer, in the extension's own page. They are never uploaded, sent to a server, or shared with anyone.
- **Logs opened from a URL** are downloaded straight from that address by your browser. Grepsy does not send them anywhere else.
- **Highlight rules** you create are saved with the browser's extension storage (`chrome.storage`) so they are there next time. If you use browser sync, your browser may sync them to your other devices.
- **Your theme choice** is saved in the extension's local storage on this device.

## What Grepsy does not do

- No analytics, tracking, advertising or telemetry.
- No accounts and no sign-in.
- No remote code: everything Grepsy runs ships inside the extension package.
- No selling or transfer of data to anyone.

## Permissions

| Permission | When it is asked | Why |
| --- | --- | --- |
| `storage` | At install (shows no warning) | Saves your highlight rules. |
| `activeTab`, `scripting` | At install (show no warning) | Only when you click the Grepsy icon: checks whether the current tab is a plain text file, so the popup can offer to open it. Nothing from the page is read or sent. |
| Access to `file:///*` | At install (shows no warning). Chrome also needs you to turn on "Allow access to file URLs" | Sends local `.log` files you open in the browser to the viewer, and lets the viewer read them. You can turn this off in the popup. |
| Access to `http://*/*`, `https://*/*` | Only when you open a log from a URL or from the current tab, and only for that site; or for all sites if you turn on "Also .log links on websites" | Downloads the log you asked for. |

You can remove optional permissions at any time on the extension's details page.

## Bug reports

The **Report a bug** link opens a GitHub issue form prefilled with the Grepsy version and browser version. Nothing from your logs is included, and nothing is sent until you submit the form yourself on GitHub, under GitHub's own privacy policy.

## Contact

Questions about this policy: open a discussion at https://github.com/vinaysinghts/grepsy/discussions.
