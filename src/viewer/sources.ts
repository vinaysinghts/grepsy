import { autoOpenView, fileNameFromUrl, isLoadableSource } from '../core/autoOpen';
import { HTML_PAGE_MESSAGE, httpFailureMessage, isHtmlResponse, networkFailureMessage } from '../core/download';

/**
 * Downloads a log from a URL into a File. For web URLs the browser asks the
 * user to allow access to just that site the first time (an optional
 * permission); file:// URLs need the auto-open setting.
 */
export async function fetchAsFile(url: string, askForAccess: boolean): Promise<File> {
  if (!isLoadableSource(url)) throw new Error('Only file, http and https links can be opened.');
  const u = new URL(url);
  if (askForAccess && u.protocol !== 'file:') {
    let granted: boolean;
    try {
      granted = await chrome.permissions.request({ origins: [`${u.origin}/*`] });
    } catch (err) {
      throw new Error(`Could not ask for access to ${u.host}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!granted) throw new Error(`Grepsy needs your OK to read from ${u.host}. Click Open again and choose Allow.`);
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(networkFailureMessage(url));
  }
  if (!res.ok) throw new Error(httpFailureMessage(u.host, res.status, res.statusText));
  if (isHtmlResponse(res.headers.get('content-type'))) throw new Error(HTML_PAGE_MESSAGE);
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
