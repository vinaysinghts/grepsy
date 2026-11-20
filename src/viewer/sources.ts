import { autoOpenView, fileNameFromUrl, isLoadableSource } from '../core/autoOpen';

/**
 * Downloads a log from a URL into a File. For web URLs the browser asks the
 * user to allow access to just that site the first time (an optional
 * permission); file:// URLs need the auto-open setting.
 */
export async function fetchAsFile(url: string, askForAccess: boolean): Promise<File> {
  if (!isLoadableSource(url)) throw new Error('Only file, http and https links can be opened.');
  const u = new URL(url);
  if (askForAccess && u.protocol !== 'file:') {
    const granted = await chrome.permissions.request({ origins: [`${u.origin}/*`] });
    if (!granted) throw new Error(`Access to ${u.host} was not allowed.`);
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      u.protocol === 'file:'
        ? 'Could not read the file. Check that "Allow access to file URLs" is on for this extension.'
        : `Could not download from ${u.host}.`,
    );
  }
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  return new File([await res.blob()], fileNameFromUrl(url));
}

/** The "Open .log files automatically" card on the start screen. */
export async function setupAutoOpen(): Promise<void> {
  const btn = document.getElementById('auto-open-btn') as HTMLButtonElement;
  const status = document.getElementById('auto-open-status')!;
  const step = document.getElementById('file-access-step')!;
  const fileAccessBtn = document.getElementById('file-access-btn')!;
  if (!chrome.permissions || !chrome.storage) return;

  let needsFileAccess = false;
  const refresh = async () => {
    const { autoOpen } = await chrome.storage.local.get('autoOpen');
    const view = autoOpenView({
      wanted: autoOpen === true,
      hasPermission: await chrome.permissions.contains({ origins: ['file:///*'] }),
      fileAccess: await chrome.extension.isAllowedFileSchemeAccess(),
      needsFileAccess,
    });
    btn.textContent = view.button;
    btn.setAttribute('aria-pressed', String(view.on));
    status.textContent = view.status;
    step.hidden = !view.showStep;
  };

  btn.addEventListener('click', async () => {
    if (btn.getAttribute('aria-pressed') === 'true') {
      needsFileAccess = false;
      await chrome.storage.local.set({ autoOpen: false });
      await chrome.permissions.remove({ origins: ['file:///*'] });
    } else if (!(await chrome.extension.isAllowedFileSchemeAccess())) {
      // Chrome throws "Extension must have file access enabled to request
      // 'file:///*'" if we ask now, so guide the user to the toggle first.
      needsFileAccess = true;
    } else {
      needsFileAccess = false;
      try {
        // Must follow the click closely so Chrome shows its prompt.
        const granted = await chrome.permissions.request({ origins: ['file:///*'] });
        if (granted) await chrome.storage.local.set({ autoOpen: true });
      } catch (err) {
        status.textContent = `Could not turn this on: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
    }
    await refresh();
  });
  fileAccessBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });
  window.addEventListener('focus', () => void refresh());
  await refresh();
}
