import { WEB_ORIGINS, autoOpenView, autoOpenWanted, fileNameFromUrl, isLoadableSource } from '../core/autoOpen';
import { HTML_PAGE_MESSAGE, httpFailureMessage, isHtmlResponse, networkFailureMessage } from '../core/download';

/**
 * The request never got an answer: the site is down, or (for a site Grepsy
 * has no access to) the browser blocked the response.
 */
export class NetworkFailure extends Error {}

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
    throw new NetworkFailure(networkFailureMessage(url));
  }
  if (!res.ok) throw new Error(httpFailureMessage(u.host, res.status, res.statusText));
  if (isHtmlResponse(res.headers.get('content-type'))) throw new Error(HTML_PAGE_MESSAGE);
  return new File([await res.blob()], fileNameFromUrl(url));
}

/**
 * The auto-open switch, on the start screen and in the toolbar popup. Auto-open
 * is on by default; the file:///* permission is granted at install, so the only
 * step left is Chrome's "Allow access to file URLs", which only the user can flip.
 */
export async function setupAutoOpen(): Promise<void> {
  const btn = document.getElementById('auto-open-btn') as HTMLButtonElement;
  const status = document.getElementById('auto-open-status')!;
  const step = document.getElementById('file-access-step')!;
  const fileAccessBtn = document.getElementById('file-access-btn')!;
  if (!chrome.permissions || !chrome.storage) return;

  const refresh = async () => {
    const { autoOpen } = await chrome.storage.local.get('autoOpen');
    const view = autoOpenView({
      wanted: autoOpenWanted(autoOpen),
      hasPermission: await chrome.permissions.contains({ origins: ['file:///*'] }),
      fileAccess: await chrome.extension.isAllowedFileSchemeAccess(),
    });
    btn.textContent = view.button;
    btn.setAttribute('aria-pressed', String(view.on));
    status.textContent = view.status;
    step.hidden = !view.showStep;
  };

  btn.addEventListener('click', async () => {
    const action = btn.textContent;
    if (action === 'Turn off') {
      await chrome.storage.local.set({ autoOpen: false });
    } else if (action === 'Turn on') {
      await chrome.storage.local.set({ autoOpen: true });
    } else {
      try {
        // Must follow the click closely so Chrome shows its prompt.
        await chrome.permissions.request({ origins: ['file:///*'] });
      } catch (err) {
        status.textContent = `Could not ask for access: ${err instanceof Error ? err.message : String(err)}`;
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

/**
 * "Also .log links on websites": off by default because it needs access to
 * every site, which Chrome shows as a strong warning. Asked for on the click.
 */
export async function setupAutoOpenWeb(): Promise<void> {
  const btn = document.getElementById('auto-open-web-btn') as HTMLButtonElement | null;
  const status = document.getElementById('auto-open-web-status');
  if (!btn || !status || !chrome.permissions || !chrome.storage) return;
  const refresh = async () => {
    const { autoOpenWeb } = await chrome.storage.local.get('autoOpenWeb');
    const on = autoOpenWeb === true && (await chrome.permissions.contains({ origins: WEB_ORIGINS }));
    btn.textContent = on ? 'Turn off' : 'Turn on';
    btn.setAttribute('aria-pressed', String(on));
    status.textContent = on
      ? 'On. Plain text .log links on websites open in Grepsy.'
      : 'Off. Needs access to read pages on all sites, asked for when you turn it on.';
  };
  btn.addEventListener('click', async () => {
    if (btn.getAttribute('aria-pressed') === 'true') {
      await chrome.storage.local.set({ autoOpenWeb: false });
      await chrome.permissions.remove({ origins: WEB_ORIGINS }).catch(() => false);
    } else {
      // Chrome may close the popup during its prompt; the background script
      // then finishes turning this on.
      await chrome.storage.session.set({ pendingAutoOpenWeb: Date.now() });
      try {
        const granted = await chrome.permissions.request({ origins: WEB_ORIGINS });
        await chrome.storage.session.remove('pendingAutoOpenWeb');
        if (granted) await chrome.storage.local.set({ autoOpenWeb: true });
      } catch (err) {
        await chrome.storage.session.remove('pendingAutoOpenWeb');
        status.textContent = `Could not ask for access: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
    }
    await refresh();
  });
  await refresh();
}

/**
 * Whether the viewer can download `url` without asking first. Web links need
 * the site's optional permission; Chrome only shows that prompt after a click
 * on this page, so a link handed over by the popup may have to wait for one.
 */
export async function hasAccess(url: string): Promise<boolean> {
  const u = new URL(url);
  if (u.protocol === 'file:') return true;
  return chrome.permissions.contains({ origins: [`${u.origin}/*`] });
}
