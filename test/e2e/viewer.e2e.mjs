/* global chrome, navigator, window, Buffer */
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

  // Filter is on by default: only matches stay.
  assert.equal(await page.getAttribute('#filter', 'aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('5 rows'));
  await page.waitForFunction(() => document.querySelectorAll('.gap').length === 2);

  await page.click('[data-ctx="2"]');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('9 rows'));

  await page.waitForSelector('.gap');
  await page.locator('.gap').last().click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('12 rows'));
  // Revealed lines can be hidden again, back to the filtered view.
  await page.waitForSelector('.row.revealed');
  assert.match(await page.getAttribute('.row .fold', 'title'), /^Hide \d+ lines? again$/);
  await page.click('.row .fold');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('9 rows'));
  assert.equal(await page.locator('.row.revealed').count(), 0);
  await page.locator('.gap').last().click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('12 rows'));

  await page.locator('.row .gutter').first().click();
  await page.waitForSelector('.row.bookmarked');
  assert.equal(await page.textContent('#bookmark-status'), '1 bookmarked');
  assert.equal(await page.isVisible('#bm-next'), true, 'bookmark stepping buttons appear');

  // Copy shown: every visible line, revealed ones included, no gap rows.
  // (Headless can't grant clipboard access to an extension page, so catch the write.)
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (t) => void (window.__copied = t);
  });
  await page.click('#copy-shown');
  await page.waitForFunction(() => document.querySelector('#copy-shown').textContent.startsWith('Copied'));
  assert.equal(await page.textContent('#copy-shown'), 'Copied 11 lines', '12 rows on screen, one of them a gap');
  const copied = await page.evaluate(() => window.__copied);
  assert.equal(copied.split('\n').filter(Boolean).length, 11);
  assert.doesNotMatch(copied, /hidden/);
  // Save as .log downloads the same lines.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-shown')]);
  assert.equal(download.suggestedFilename(), 'sample-shown.log');

  // Save the search, then reuse it from Quick filters in one click.
  await page.click('#save-search');
  await page.click('#rules-toggle');
  await page.waitForSelector('.rule-term');
  await page.fill('#q', '');
  await page.waitForFunction(() => document.querySelector('#match-count').textContent === '');
  await page.click('.rule-term');
  assert.equal(await page.inputValue('#q'), 'timeout');
  await page.waitForFunction(() => document.querySelector('#match-count').textContent === '3 matches');
  assert.equal(await page.isHidden('#rules-panel'), true, 'the dropdown closes to show the results');
  await page.click('#rules-toggle');
  await page.click('.rule-remove');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#rules-panel'), true);

  await page.click('#filter');
  await page.fill('#q', '');
  await page.waitForFunction(() => document.querySelector('#match-count').textContent === '');
  await page.locator('#log').focus();
  await page.keyboard.press('n');
  await page.waitForSelector('.row.current');
  assert.match(await page.textContent('.row.current'), /ERROR \[payments\]/);
  // The landing line flashes once, then settles.
  await page.waitForSelector('.row.current.flash');

  // Hiding warnings collapses them into a gap. (The DEBUG line stays: it is bookmarked.)
  // A plain click shows only that level; a second click shows all again.
  await page.click('.level[data-code="1"]');
  assert.equal(await page.locator('.level[aria-pressed="true"]').count(), 1);
  // Only errors (and the bookmarked DEBUG line: bookmarks always show).
  await page.waitForFunction(
    () => document.querySelector('.row.lv1') && ![...document.querySelectorAll('.row')].some((r) => /INFO|WARN/.test(r.textContent)),
  );
  await page.click('.level[data-code="1"]');
  await page.waitForFunction(() => document.querySelectorAll('.level[aria-pressed="false"]').length === 0);
  // Ctrl+click hides just one level.
  await page.click('.level[data-code="2"]', { modifiers: ['Control'] });
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('11 rows'));
  await page.waitForSelector('.gap');
  assert.equal(await page.locator('.row', { hasText: 'WARN' }).count(), 0);
  assert.equal(await page.locator('.row', { hasText: 'DEBUG' }).count(), 1);

  // Quick filters: add one, mark it as a highlight, and find it again after a reload.
  await page.click('#rules-toggle');
  await page.fill('#rule-input', 'user_id=42');
  await page.press('#rule-input', 'Enter');
  assert.equal(await page.textContent('#rules-toggle'), 'Quick filters 1');
  assert.equal(await page.locator('mark.hl0').count(), 0, 'a new quick filter is not a highlight');
  await page.click('.rules .swatch.off');
  await page.waitForSelector('mark.hl0', { state: 'attached' });
  // Saved terms edit in place with ✎.
  await page.click('.rule-edit-btn');
  await page.fill('.rule-edit', 'user_id=56');
  await page.press('.rule-edit', 'Enter');
  await page.waitForFunction(() => document.querySelector('.rule-term')?.textContent === 'user_id=56');
  await page.click('.rule-edit-btn');
  await page.fill('.rule-edit', 'user_id=42');
  await page.press('.rule-edit', 'Enter');
  await page.waitForFunction(() => document.querySelector('.rule-term')?.textContent === 'user_id=42');
  await page.reload();
  await page.setInputFiles('#file', sample);
  await page.waitForSelector('mark.hl0', { state: 'attached' });
  await page.click('#rules-toggle');
  await page.click('.rule-remove');
  await page.waitForFunction(() => !document.querySelector('mark.hl0'));
  await page.click('#log');
  assert.equal(await page.isHidden('#rules-panel'), true, 'a click on the log closes the dropdown');

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
  const gzLines = ['09:00 INFO start', '09:01 ERROR failed {"order":"A-1182","code":504}', '09:02 INFO saved body=<order id="A-1"><item>pen</item></order> req={"a":1}'];
  await page.setInputFiles('#file', { name: 'app.log.gz', mimeType: 'application/gzip', buffer: gzipSync(gzLines.join('\n')) });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('3 rows'));
  await page.waitForSelector('.json-btn');
  assert.equal(await page.locator('.json-btn').count(), 2);
  await page.locator('.json-btn').first().click();
  await page.waitForSelector('#json-dialog[open]');
  assert.equal(await page.textContent('#json-body pre'), JSON.stringify({ order: 'A-1182', code: 504 }, null, 2));
  await page.keyboard.press('Escape');
  // A line with XML and JSON shows both, laid out.
  await page.locator('.json-btn').last().click();
  await page.waitForSelector('#json-dialog[open]');
  assert.deepEqual(await page.locator('.json-name').allTextContents(), ['1 of 2 · body', '2 of 2 · req']);
  assert.equal(await page.locator('#json-body pre').first().textContent(), '<order id="A-1">\n  <item>pen</item>\n</order>');
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
  assert.equal(await popup.locator('#url').count(), 0, 'no link box: links open from their tab');
  await popup.close();
  // A second link, opened in the viewer, joins the list.
  const otherUrl = logUrl.replace('remote.log', 'other.log');
  await page.goto(`chrome-extension://${id}/viewer.html?src=${encodeURIComponent(otherUrl)}`);
  await page.waitForFunction(() => document.querySelector('#file-name')?.textContent === 'other.log');

  popup = await openPopup();
  await popup.waitForFunction(() => document.querySelectorAll('.recent li').length === 2);
  assert.deepEqual(await popup.locator('.recent-name').allTextContents(), ['other.log', 'remote.log']);
  await popup.locator('.recent li').nth(1).hover();
  await popup.locator('.recent-remove').nth(1).click();
  await popup.waitForFunction(() => document.querySelectorAll('.recent li').length === 1);
  let tab = await viewerFrom(popup, (p) => p.click('.recent-open'));
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
  assert.equal(await popup.isHidden('#open-file'), true, 'on a text tab, opening that tab is the only action');
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

  // Big gaps offer a few lines from either end instead of only "show all".
  const big = ['needle start', ...Array.from({ length: 198 }, (_, i) => `filler ${i}`), 'needle end'].join('\n');
  await page.goto(`chrome-extension://${id}/viewer.html`);
  await page.setInputFiles('#file', { name: 'big.log', mimeType: 'text/plain', buffer: Buffer.from(big) });
  await page.waitForSelector('#viewer:not([hidden])');
  await page.fill('#q', 'needle');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('3 rows'));
  const rowsAre = (n) => page.waitForFunction((n) => document.querySelector('#status').textContent.startsWith(`${n} rows`), n);
  assert.match(await page.textContent('.gap.big'), /198 lines hidden/);
  // Show more reveals 5 lines down from the line above, then keeps going down.
  await page.click('.gap-act:has-text("↓ 5 more")');
  await rowsAre(8);
  await page.click('.gap-act:has-text("↓ 5 more")');
  await rowsAre(13);
  // The two steps joined into one block with one ⌄.
  await page.waitForSelector('.row .fold[title="Hide 10 lines again"]');
  assert.equal(await page.locator('.row .fold').count(), 1);
  assert.equal(await page.getAttribute('.row .fold', 'title'), 'Hide 10 lines again');
  await page.click('.row .fold');
  await rowsAre(3);
  // Clicking the row itself is "show more"; show all opens the rest.
  await page.click('.gap.big .gutter');
  await rowsAre(8);
  await page.click('.gap-act:has-text("show all")');
  await rowsAre(200);
  await page.waitForSelector('.row .fold[title="Hide 198 lines again"]');
  assert.equal(await page.locator('.row .fold').count(), 1, 'the steps and the rest are one block');
  // A gap at the top of the file grows up from the first line on show.
  await page.fill('#q', 'needle end');
  await rowsAre(2);
  assert.equal(await page.locator('.gap-act:has-text("↓ 5 more")').count(), 0, 'nothing above the first line to grow down from');
  await page.click('.gap-act:has-text("↑ 5 more")');
  await rowsAre(7);
  await page.waitForSelector('.row.revealed');
  assert.equal(await page.textContent('.row.revealed .text'), 'filler 193');
  await page.click('.gap-act:has-text("↑ 5 more")');
  await rowsAre(12);

  // Word wrap (Alt+Z): long lines wrap, each row exactly as tall as its text.
  const wide = ['short one', 'long ' + 'abcdefghij'.repeat(60), 'tab\tseparated\tline ' + 'x'.repeat(300), 'short two'].join('\n');
  await page.goto(`chrome-extension://${id}/viewer.html`);
  await page.setInputFiles('#file', { name: 'wide.log', mimeType: 'text/plain', buffer: Buffer.from(wide) });
  await page.waitForSelector('#viewer:not([hidden]) .row .text');
  await page.locator('#log').focus();
  await page.keyboard.press('Alt+KeyZ');
  await page.waitForSelector('.rows.wrap');
  assert.equal(await page.getAttribute('#wrap-toggle', 'aria-pressed'), 'true');
  const fit = await page.$$eval('.rows.wrap .row', (rows) =>
    rows.map((r) => [Math.round(r.getBoundingClientRect().height), Math.round(r.querySelector('.text').getBoundingClientRect().height)]),
  );
  assert.ok(fit[1][0] > 20, 'the long line wraps');
  for (const [row, text] of fit) assert.equal(text, row, 'each row is as tall as its wrapped text');
  // The last line is still reachable at the bottom.
  await page.evaluate(() => { const l = document.querySelector('#log'); l.scrollTop = l.scrollHeight; });
  await page.waitForSelector('.row:has-text("short two")');
  await page.click('#wrap-toggle');
  await page.waitForSelector('.rows:not(.wrap)');
  assert.equal(await page.getAttribute('#wrap-toggle', 'aria-pressed'), 'false');

  // Auto-open is on by default (this test browser already allows file access,
  // so no setup step shows; that path is unit tested). It can be turned off.
  popup = await openPopup();
  await popup.waitForFunction(() => document.querySelector('#auto-open-btn')?.textContent === 'Turn off');
  assert.match(await popup.textContent('#auto-open-title'), /Always open \.log files/);
  assert.match(await popup.textContent('#auto-open-status'), /^On\./);
  // The same switch covers websites, after one Allow click (all-sites access isn't asked at install).
  await popup.waitForSelector('#auto-open-web:not([hidden])');
  await popup.click('#auto-open-btn');
  await popup.waitForFunction(() => document.querySelector('#auto-open-btn')?.textContent === 'Turn on');
  await popup.waitForSelector('#auto-open-web', { state: 'hidden' });
  assert.equal(await popup.isHidden('#file-access-step'), true);
  await popup.close();

  // The start screen's card shares the setting.
  await page.goto(`chrome-extension://${id}/viewer.html`);
  await page.waitForFunction(() => document.querySelector('#auto-open-btn')?.textContent === 'Turn on');
  await page.click('#auto-open-btn');
  await page.waitForFunction(() => document.querySelector('#auto-open-btn')?.textContent === 'Turn off');

  assert.deepEqual(errors, []);
  console.log('e2e: all checks passed');
} finally {
  await ctx.close();
}
