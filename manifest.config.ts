import pkg from './package.json' with { type: 'json' };

/**
 * The extension manifest, generated at build time so the name, description
 * and version have one source of truth: package.json. Renaming the product
 * means changing `displayName` there.
 *
 * No permissions are requested: the viewer is an extension page that reads
 * files the user picks, so it needs no host or tab access. Fewer permissions
 * also means a faster, simpler store review.
 */
export function buildManifest(): chrome.runtime.ManifestV3 {
  return {
    manifest_version: 3,
    name: pkg.displayName,
    description: pkg.description,
    version: pkg.version,
    action: {
      default_title: `Open ${pkg.displayName}`,
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
    background: { service_worker: 'background.js', type: 'module' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: 'Open the log viewer',
      },
    },
    minimum_chrome_version: '116',
  };
}
