/* global chrome */
// Renders the extension icons, Chrome Web Store screenshots (1280x800) and
// the small promo tile (440x280). Run after `npm run build`:
//   npm run store:screenshots
// Outputs: public/icons/*.png and store/*.png (both committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
mkdirSync(join(root, 'store'), { recursive: true });

const ACCENT = '#4c8dff';
const BG = '#0e1014';

// The mark: three log lines, the last one shorter, with a search lens.
const iconSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${BG}"/>
  <g stroke="${ACCENT}" stroke-width="11" stroke-linecap="round" fill="none">
    <path d="M28 38h52"/><path d="M28 64h72"/><path d="M28 90h28"/>
    <circle cx="84" cy="88" r="14" stroke-width="9"/><path d="M95 99l9 9" stroke-width="9"/>
  </g>
</svg>`;

// A believable demo log from an order service: deterministic, no real data.
// It mixes the shapes real services write: JSON payloads, Python dict reprs,
// tracebacks and long SQL lines, so every screenshot has something to show.
function demoLog() {
  let seed = 11;
  // Use the high bits: the low bits of this LCG repeat with a short period.
  const rnd = (n) => Math.floor(((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * n);
  const pick = (a) => a[rnd(a.length)];
  const lines = [];
  let ms = (14 * 3600 + 2 * 60) * 1000;
  const ts = () => {
    ms += 40 + rnd(900);
    const d = new Date(Date.UTC(2026, 10, 24) + ms).toISOString();
    return d.slice(0, 10) + ' ' + d.slice(11, 23);
  };
  const paths = ['/v1/orders', '/v1/cart', '/v1/orders/{id}', '/v1/payments/intent', '/health'];
  for (let i = 0; i < 3000; i++) {
    const r = rnd(100);
    // A small pool of orders, so one order shows up in many kinds of line.
    const order = `A-${10400 + rnd(30) * 7}`;
    const user = 100 + rnd(400);
    if (i > 6 && r < 1) {
      lines.push(`${ts()} ERROR [payments] charge failed {"order":"${order}","amount":${20 + rnd(180)}.90,"currency":"EUR","code":504,"error":"upstream timeout","retries":3}`);
      lines.push('Traceback (most recent call last):');
      lines.push('  File "/app/payments/gateway.py", line 214, in charge');
      lines.push('    resp = self.session.post(url, json=body, timeout=3.0)');
      lines.push('requests.exceptions.ReadTimeout: HTTPSConnectionPool(host=\'psp.example.net\', port=443): Read timed out. (read timeout=3.0)');
    } else if (r < 5) {
      lines.push(`${ts()} WARN  [payments] gateway slow: ${2100 + rnd(900)}ms, retrying (attempt ${1 + rnd(3)}/3) order=${order}`);
    } else if (r < 12) {
      lines.push(`${ts()} DEBUG [worker] task received task={'order': '${order}', 'id': '${(rnd(0xffff) + 0x1000).toString(16)}', 'queue': '${pick(['payments', 'emails', 'invoices'])}', 'retries': ${rnd(3)}, 'eta': None, 'priority': ${pick(['True', 'False'])}}`);
    } else if (r < 16) {
      lines.push(`${ts()} DEBUG [db] SELECT o.id, o.status, o.total, c.email, c.country FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = '${order}' AND c.deleted_at IS NULL FOR UPDATE OF o SKIP LOCKED -- ${3 + rnd(40)}ms`);
    } else if (r < 21) {
      lines.push(`${ts()} INFO  [api] request body={"order":"${order}","items":[{"sku":"SKU-${1000 + rnd(900)}","qty":${1 + rnd(3)}}],"shipping":"${pick(['standard', 'express'])}","coupon":null}`);
    } else if (r < 26) {
      lines.push(`${ts()} DEBUG [cache] hit ratio=0.${80 + rnd(19)} keys=${18000 + rnd(900)} evicted=${rnd(40)}`);
    } else {
      const path = pick(paths);
      lines.push(`${ts()} INFO  [api] ${path === '/health' ? 'GET' : pick(['GET', 'POST'])} ${path.replace('{id}', order)} ${pick([200, 200, 200, 201, 204])} in ${8 + rnd(90)}ms user_id=${user}`);
    }
  }
  return lines.join('\n');
}

const browser = await chromium.launch();
const plain = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await plain.setViewportSize({ width: size, height: size });
  await plain.setContent(`<body style="margin:0;background:transparent">${iconSvg(size)}</body>`);
  await plain.screenshot({ path: join(root, 'public/icons', `icon${size}.png`), omitBackground: true });
}
await plain.setViewportSize({ width: 440, height: 280 });
await plain.setContent(`
  <body style="margin:0;width:440px;height:280px;background:${BG};display:flex;align-items:center;justify-content:center;gap:22px;font-family:Inter,system-ui,sans-serif">
    ${iconSvg(96)}
    <div><div style="color:#e6e8ee;font-size:44px;font-weight:700;letter-spacing:-0.02em">Grepsy</div>
    <div style="color:#a3a9b8;font-size:16px;margin-top:4px">Huge logs. Instant filters.<br>Nothing uploaded.</div></div>
  </body>`);
await plain.screenshot({ path: join(root, 'store/promo-small-440x280.png') });
await browser.close();

const logPath = join(tmpdir(), 'orders-service.log');
writeFileSync(logPath, demoLog());

const ctx = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
const page = await ctx.newPage();
// Theme is auto by default; headless Chromium reports a light system, so pin dark for the main shots.
await page.emulateMedia({ colorScheme: 'dark' });
const extId = new URL(sw.url()).host;

// 1: the popup offering to open the plain text log in the current tab, drawn
// over a tab showing that log as Chrome does. Headless Chromium has no
// toolbar, so the popup is rendered on its own (with the active tab stubbed)
// and placed where Chrome would show it.
const popupPage = await ctx.newPage();
await popupPage.emulateMedia({ colorScheme: 'dark' });
await popupPage.addInitScript(() => {
  chrome.tabs.query = async () => [{ id: 1, url: 'file:///var/log/orders-service.log' }];
  chrome.scripting.executeScript = async () => [{ result: 'text/plain' }];
});
await popupPage.goto(`chrome-extension://${extId}/popup.html`);
await popupPage.waitForSelector('#this-tab:not([hidden])');
await popupPage.waitForTimeout(200);
const popupPng = await popupPage.locator('body').screenshot();
await popupPage.close();
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
await page.setContent(`
  <body style="margin:0;height:800px;background:#fff;overflow:hidden;font-family:Inter,system-ui,sans-serif">
    <div style="height:40px;background:#dfe3ea;display:flex;align-items:center;padding:0 12px;gap:10px">
      <div style="flex:1;height:26px;border-radius:13px;background:#fff;color:#444;font-size:13px;display:flex;align-items:center;padding:0 14px">file:///var/log/orders-service.log</div>
      <div style="width:28px;height:28px;border-radius:6px;background:#c7cdd8;display:flex;align-items:center;justify-content:center">${iconSvg(20)}</div>
    </div>
    <pre style="margin:8px;font:13px/1.35 monospace;color:#000;white-space:pre-wrap">${escape(demoLog().split('\n').slice(0, 60).join('\n'))}</pre>
    <img src="data:image/png;base64,${popupPng.toString('base64')}" style="position:absolute;top:44px;right:12px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.35)">
  </body>`);
await page.screenshot({ path: join(root, 'store/1-open-from-tab.png') });

await page.goto(`chrome-extension://${extId}/viewer.html`);
await page.setInputFiles('#file', logPath);
await page.waitForSelector('#viewer:not([hidden]) .row .gutter');
const settle = () => page.waitForTimeout(350);

// 2: search with context lines, plus two quick filters highlighted in colour.
await page.click('#rules-toggle');
for (const term of ['payments', 'upstream timeout', 'A-10421']) {
  await page.fill('#rule-input', term);
  await page.press('#rule-input', 'Enter');
}
await page.locator('.rules .swatch.off').nth(0).click();
await page.locator('.rules .swatch.off').nth(0).click();
await page.keyboard.press('Escape');
await page.fill('#q', 'timeout');
await page.click('[data-ctx="2"]');
await page.waitForSelector('.gap');
await settle();
await page.screenshot({ path: join(root, 'store/2-filter-and-highlight.png') });

// 3: pretty print. JSON and Python dicts are underlined in place; one click opens it.
await page.fill('#q', '');
await page.click('[data-ctx="0"]');
await page.locator('#log').focus();
await page.keyboard.press('n');
await settle();
await page.locator('.row .pv').filter({ hasText: "'queue'" }).first().click();
await page.waitForSelector('#json-dialog[open]');
await settle();
await page.screenshot({ path: join(root, 'store/3-pretty-print.png') });
await page.keyboard.press('Escape');

// 4: quick filters, one click to show only matching lines, with long lines wrapped.
await page.click('#rules-toggle');
await page.locator('.rule-term').filter({ hasText: 'A-10421' }).click();
await page.keyboard.press('Alt+KeyZ');
await page.waitForSelector('.rows.wrap');
await page.click('#rules-toggle');
await settle();
await page.screenshot({ path: join(root, 'store/4-quick-filters-and-wrap.png') });
await page.keyboard.press('Escape');
await page.click('#wrap-toggle');

// 5: the light theme, errors only, with values underlined and quick filters highlighted.
await page.emulateMedia({ colorScheme: 'light' });
await page.fill('#q', 'ERROR');
await page.click('#case');
await page.click('[data-ctx="5"]');
await page.waitForSelector('.gap');
await settle();
await page.screenshot({ path: join(root, 'store/5-light-theme.png') });
await ctx.close();
console.log('store assets written to public/icons and store/');
