// End-to-end check: loads the built extension (dist/) in Chromium, opens a
// log and exercises search, filter, context, gap expansion, bookmarks and
// error navigation. Run with `npm run e2e` after `npm run build`.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
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

  assert.deepEqual(errors, []);
  console.log('e2e: all checks passed');
} finally {
  await ctx.close();
}
