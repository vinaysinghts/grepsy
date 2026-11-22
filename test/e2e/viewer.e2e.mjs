/* global chrome */
// End-to-end check: loads the built extension (dist/) in Chromium, opens a
// log and exercises search, filter, context, gap expansion, bookmarks and
// error navigation. Run with `npm run e2e` after `npm run build`.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const sample = fileURLToPath(new URL('../fixtures/sample.log', import.meta.url));

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const errors = [];
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/viewer.html`);

  await page.setInputFiles('#file', sample);
  await page.waitForSelector('#viewer:not([hidden]) .row .gutter');
  assert.match(await page.textContent('#status'), /^12 rows · 12 lines/);
  assert.match(await page.textContent('#levels'), /Errors4/, 'stack frames count with their error');

  await page.fill('#q', 'timeout');
  await page.waitForFunction(() => document.querySelector('#match-count').textContent === '3 matches');
  await page.waitForSelector('mark');

  await page.click('#filter');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('5 rows'));
  await page.waitForFunction(() => document.querySelectorAll('.gap').length === 2);

  await page.click('[data-ctx="2"]');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('9 rows'));

  await page.waitForSelector('.gap');
  await page.locator('.gap').last().click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('12 rows'));

  await page.locator('.row .gutter').first().click();
  await page.waitForSelector('.row.bookmarked');
  assert.equal(await page.textContent('#bookmark-status'), '1 bookmarked');

  await page.click('#filter');
  await page.fill('#q', '');
  await page.waitForFunction(() => document.querySelector('#match-count').textContent === '');
  await page.locator('#log').focus();
  await page.keyboard.press('n');
  await page.waitForSelector('.row.current');
  assert.match(await page.textContent('.row.current'), /ERROR \[payments\]/);

  // Hiding warnings collapses them into a gap. (The DEBUG line stays: it is bookmarked.)
  await page.click('.level[data-code="2"]');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('11 rows'));
  await page.waitForSelector('.gap');
  assert.equal(await page.locator('.row', { hasText: 'WARN' }).count(), 0);
  assert.equal(await page.locator('.row', { hasText: 'DEBUG' }).count(), 1);

  // Highlight rules: add one, see it color the text, and find it again after a reload.
  await page.click('#rules-toggle');
  await page.fill('#rule-input', 'user_id=42');
  await page.press('#rule-input', 'Enter');
  await page.waitForSelector('mark.hl0', { state: 'attached' });
  assert.equal(await page.textContent('#rules-toggle'), 'Highlights 1');
  await page.reload();
  await page.setInputFiles('#file', sample);
  await page.waitForSelector('mark.hl0', { state: 'attached' });
  await page.click('#rules-toggle');
  await page.click('.rule-remove');
  await page.waitForFunction(() => !document.querySelector('mark.hl0'));

  // Help menu: bug links carry the version and browser, never log content.
  await page.click('#help-toggle');
  const bugUrl = new URL(await page.getAttribute('#report-bug', 'href'));
  assert.equal(bugUrl.searchParams.get('template'), 'bug_report.yml');
  assert.equal(bugUrl.searchParams.get('version'), version);
  assert.ok(bugUrl.searchParams.get('browser'));
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#help-menu'), true);
  await page.locator('#log').focus();
  await page.keyboard.press('?');
  await page.waitForSelector('#shortcuts[open]');

  await page.keyboard.press('Escape');

  // Theme: auto follows the system; the button cycles light then dark, and the choice survives a reload.
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.locator('.toolbar [data-theme-toggle]').click();
  if ((await theme()) !== 'light') throw new Error('theme button did not switch to light');
  await page.reload();
  if ((await theme()) !== 'light') throw new Error('light theme was not remembered');
  await page.locator('[data-theme-toggle]:visible').click();
  await page.locator('[data-theme-toggle]:visible').click();
  if ((await theme()) !== 'dark') throw new Error('auto theme did not follow the dark system setting');

  // A gzipped log with JSON in a line: decompressed on open, JSON shown pretty-printed.
  await page.reload();
  const gzLines = ['09:00 INFO start', '09:01 ERROR failed {"order":"A-1182","code":504}', '09:02 INFO done'];
  await page.setInputFiles('#file', { name: 'app.log.gz', mimeType: 'application/gzip', buffer: gzipSync(gzLines.join('\n')) });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('3 rows'));
  await page.waitForSelector('.json-btn');
  assert.equal(await page.locator('.json-btn').count(), 1);
  await page.click('.json-btn');
  await page.waitForSelector('#json-dialog[open]');
  assert.equal(await page.textContent('#json-body'), JSON.stringify({ order: 'A-1182', code: 504 }, null, 2));
  await page.keyboard.press('Escape');

  // Pasted text opens like a file.
  await page.reload();
  await page.click('#paste-btn');
  await page.fill('#paste-input', '09:00 WARN pasted one\n09:01 INFO pasted two');
  await page.click('#paste-open');
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('2 rows'));
  assert.equal(await page.textContent('#file-name'), 'pasted.log');

  // Pasting a link into the URL box keeps it there instead of opening the
  // link text as a log (issue #13).
  await page.reload();
  await page.click('#url-btn');
  await page.focus('#url-input');
  await page.evaluate(() => {
    const input = document.querySelector('#url-input');
    const data = new DataTransfer();
    data.setData('text/plain', 'https://example.com/app.log');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  assert.equal(await page.isHidden('#start'), false, 'start screen stays open');
  assert.notEqual(await page.textContent('#file-name'), 'pasted.log');

  // ?src= loads a log by URL (used when a file:// log tab is redirected here).
  const server = createServer((req, res) => {
    // /private/ pretends to be a site that doesn't let extensions read it without host access.
    const cors = req.url.startsWith('/private/') ? {} : { 'access-control-allow-origin': '*' };
    if (req.url === '/missing.log') {
      res.writeHead(404, { 'content-type': 'text/plain', ...cors });
      res.end('not found');
    } else if (req.url === '/page.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
      res.end('<!doctype html><title>Logs</title>');
    } else {
      res.writeHead(200, { 'content-type': 'text/plain', ...cors });
      res.end(readFileSync(sample));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const logUrl = `http://127.0.0.1:${server.address().port}/logs/remote.log`;
  await page.goto(`chrome-extension://${id}/viewer.html?src=${encodeURIComponent(logUrl)}`);
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('12 rows'));
  assert.equal(await page.textContent('#file-name'), 'remote.log');

  // Toolbar popup: the icon shows it, and every action opens the viewer in a tab.
  const manifest = JSON.parse(readFileSync(new URL('../../dist/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.action.default_popup, 'popup.html');
  const openPopup = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`chrome-extension://${id}/popup.html`);
    return p;
  };
  const viewerFrom = async (p, action) => {
    // The popup closes itself once it has opened the tab, which can cut the click short.
    const [tab] = await Promise.all([ctx.waitForEvent('page'), action(p).catch(() => {})]);
    tab.on('pageerror', (e) => errors.push(e.message));
    await tab.waitForLoadState();
    return tab;
  };
  let popup = await openPopup();
  // Logs opened by link are remembered.
  await popup.waitForSelector('.recent-name');
  assert.equal(await popup.textContent('.recent-name'), 'remote.log');
  assert.equal(await popup.textContent('.recent-from'), new URL(logUrl).host);
  // A bad link is caught in the popup.
  await popup.fill('#url', 'javascript:alert(1)');
  await popup.press('#url', 'Enter');
  await popup.waitForSelector('#url-error:not([hidden])');
  // A link opens in the viewer.
  const otherUrl = logUrl.replace('remote.log', 'other.log');
  await popup.fill('#url', otherUrl);
  let tab = await viewerFrom(popup, (p) => p.press('#url', 'Enter'));
  await tab.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('12 rows'));
  assert.equal(await tab.textContent('#file-name'), 'other.log');
  await tab.close();
  if (!popup.isClosed()) await popup.close();

  popup = await openPopup();
  await popup.waitForFunction(() => document.querySelectorAll('.recent li').length === 2);
  assert.deepEqual(await popup.locator('.recent-name').allTextContents(), ['other.log', 'remote.log']);
  await popup.locator('.recent li').nth(1).hover();
  await popup.locator('.recent-remove').nth(1).click();
  await popup.waitForFunction(() => document.querySelectorAll('.recent li').length === 1);
  tab = await viewerFrom(popup, (p) => p.click('.recent-open'));
  await tab.waitForFunction(() => document.querySelector('#file-name')?.textContent === 'other.log');
  await tab.close();
  if (!popup.isClosed()) await popup.close();

  popup = await openPopup();
  tab = await viewerFrom(popup, (p) => p.click('#open-paste'));
  await tab.waitForSelector('#paste-box:not([hidden])');
  await tab.close();
  if (!popup.isClosed()) await popup.close();

  popup = await openPopup();
  tab = await viewerFrom(popup, (p) => p.click('#open-file'));
  await tab.waitForSelector('#drop');
  await tab.close();
  if (!popup.isClosed()) await popup.close();

  // On a plain text tab the popup offers to open that tab in place. Headless
  // Chromium can't click the toolbar icon (which grants activeTab), so the
  // popup is told which tab is active and what it shows; the rest is real.
  const popupForTab = async (url, contentType) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(
      ({ url, contentType }) => {
        const query = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = async () => {
          const me = await chrome.tabs.getCurrent();
          const [tab] = (await query({})).filter((t) => t.id !== me.id).sort((a, b) => b.id - a.id);
          return [{ ...tab, url }];
        };
        chrome.scripting.executeScript = async () => [{ result: contentType }];
        chrome.permissions.contains = async () => true;
      },
      { url, contentType },
    );
    await p.goto(`chrome-extension://${id}/popup.html`);
    return p;
  };
  const textTab = await ctx.newPage();
  await textTab.goto(logUrl);
  popup = await popupForTab(logUrl, 'text/plain');
  await popup.waitForSelector('#this-tab:not([hidden])');
  assert.equal(await popup.textContent('#tab-name'), 'remote.log');
  assert.equal(await popup.getAttribute('#open-file', 'class'), 'tool-btn', 'the tab offer is the main action');
  await Promise.all([textTab.waitForURL(/viewer\.html\?src=/), popup.click('#open-tab').catch(() => {})]);
  await textTab.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('12 rows'));
  assert.equal(await textTab.textContent('#file-name'), 'remote.log');
  if (!popup.isClosed()) await popup.close();
  // Web pages never get the offer, even with a log-like URL.
  await textTab.goto(`${new URL(logUrl).origin}/page.html`);
  popup = await popupForTab(`${new URL(logUrl).origin}/app.log`, 'text/html');
  await popup.waitForSelector('.popup-foot');
  await popup.waitForTimeout(200);
  assert.equal(await popup.isHidden('#this-tab'), true);
  await popup.close();
  await textTab.close();

  // A link to a site Grepsy may not read yet waits in the URL box for a click,
  // because Chrome only shows the permission prompt after one.
  const privateUrl = logUrl.replace('/logs/', '/private/');
  await page.goto(`chrome-extension://${id}/viewer.html?src=${encodeURIComponent(privateUrl)}`);
  await page.waitForFunction(() => document.querySelector('#progress')?.textContent.startsWith('Click Open'));
  assert.equal(await page.inputValue('#url-input'), privateUrl);
  assert.equal(await page.isVisible('#url-box'), true);

  // Failed downloads explain themselves instead of opening anything.
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, expected] of [
    ['/missing.log', /answered 404 Not Found: the file was not found/],
    ['/page.html', /web page, not a log file/],
  ]) {
    await page.goto(`chrome-extension://${id}/viewer.html?src=${encodeURIComponent(base + path)}`);
    await page.waitForSelector('#progress.error');
    assert.match(await page.textContent('#progress'), expected);
    assert.equal(await page.isHidden('#viewer'), true);
  }
  server.close();

  // The auto-open card starts switched off.
  await page.goto(`chrome-extension://${id}/viewer.html`);
  await page.waitForFunction(() => document.querySelector('#auto-open-btn')?.textContent === 'Turn on');

  assert.deepEqual(errors, []);
  console.log('e2e: all checks passed');
} finally {
  await ctx.close();
}
