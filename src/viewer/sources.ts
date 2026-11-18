import { fileNameFromUrl, isLoadableSource } from '../core/autoOpen';

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

  const refresh = async () => {
    const { autoOpen } = await chrome.storage.local.get('autoOpen');
    const hasPermission = await chrome.permissions.contains({ origins: ['file:///*'] });
    const on = autoOpen === true && hasPermission;
    const fileAccess = await chrome.extension.isAllowedFileSchemeAccess();
    btn.textContent = on ? 'Turn off' : 'Turn on';
    btn.setAttribute('aria-pressed', String(on));
    status.textContent = on
      ? fileAccess
        ? 'On. Any .log file you open in this browser comes straight here.'
        : 'Almost on. Finish the step below.'
      : 'Any .log file you open in this browser comes straight here.';
    step.hidden = !on || fileAccess;
  };

  btn.addEventListener('click', async () => {
    if (btn.getAttribute('aria-pressed') === 'true') {
      await chrome.storage.local.set({ autoOpen: false });
      await chrome.permissions.remove({ origins: ['file:///*'] });
    } else {
      // Must be called straight from the click so Chrome shows its prompt.
      const granted = await chrome.permissions.request({ origins: ['file:///*'] });
      if (granted) await chrome.storage.local.set({ autoOpen: true });
    }
    await refresh();
  });
  fileAccessBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  });
  window.addEventListener('focus', () => void refresh());
  await refresh();
}
