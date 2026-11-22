import pkg from './package.json' with { type: 'json' };

/**
 * The extension manifest, generated at build time so the name, description
 * and version have one source of truth: package.json. Renaming the product
 * means changing `displayName` there. `storeName` is the full title shown in
 * the Chrome Web Store and on chrome://extensions (the store reads it from the
 * manifest and does not let you edit it); `short_name` keeps the bare name
 * where space is tight.
 *
 * Install-time permissions are `storage` (saved highlight rules) and
 * `activeTab` + `scripting` (the popup's "Open this file in Grepsy"); none
 * shows an install warning. Host access is optional and requested
 * at the moment a user turns on a feature that needs it. The viewer is an extension page that reads files the user
 * picks, so it needs no host or tab access. Fewer permissions also means a
 * faster, simpler store review.
 */
export function buildManifest(): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: pkg.storeName,
    short_name: pkg.displayName,
    description: pkg.description,
    version: pkg.version,
    action: {
      default_title: pkg.displayName,
      default_popup: 'popup.html',
      default_icon: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png',
      },
    },
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    // activeTab + scripting: when the user clicks the icon, the popup may look
    // at that one tab (its URL and content type) to offer "Open this file in
    // Grepsy". Neither shows an install warning, and access ends when the tab
    // navigates.
    permissions: ['storage', 'activeTab', 'scripting'],
    // Asked for only when the user turns a feature on: file:// for opening
    // local logs automatically, and a site's origin when opening a log by URL.
    optional_host_permissions: ['file:///*', 'https://*/*', 'http://*/*'],
    background: { service_worker: 'background.js', type: 'module' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: 'Show the Grepsy popup',
      },
    },
    minimum_chrome_version: '116',
  };
}
