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

// A believable demo log: deterministic, no real data.
function demoLog() {
  let seed = 7;
  const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
  const services = ['gateway', 'payments', 'auth', 'pool', 'cache'];
  const lines = [];
  for (let i = 0; i < 4000; i++) {
    const t = `2026-11-16 09:${String(14 + Math.floor(i / 600)).padStart(2, '0')}:${String(Math.floor(i / 10) % 60).padStart(2, '0')}.${String((i * 37) % 1000).padStart(3, '0')}`;
    const r = rnd(100);
    const svc = services[rnd(services.length)];
    if (r < 3) {
      lines.push(`${t} ERROR [payments] request failed: timeout after 3 retries {"order":"A-${1000 + i}","code":504,"retries":3}`);
      lines.push('    at PaymentsClient.charge (payments.js:118)');
    } else if (r < 9) lines.push(`${t} WARN  [${svc}] upstream timeout after 3000ms, retrying (${1 + rnd(3)}/3)`);
    else if (r < 25) lines.push(`${t} DEBUG [${svc}] cache hit ratio=0.${80 + rnd(19)} keys=${18000 + rnd(900)}`);
    else lines.push(`${t} INFO  [${svc}] GET /v2/orders 200 in ${10 + rnd(90)}ms user_id=${rnd(60)}`);
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

const logPath = join(tmpdir(), 'payments-service.log');
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
await page.goto(`chrome-extension://${new URL(sw.url()).host}/viewer.html`);
await page.screenshot({ path: join(root, 'store/1-start.png') });

await page.setInputFiles('#file', logPath);
await page.waitForSelector('#viewer:not([hidden]) .row .gutter');
await page.click('#rules-toggle');
for (const term of ['payments', 'user_id=42']) {
  await page.fill('#rule-input', term);
  await page.press('#rule-input', 'Enter');
}
await page.fill('#q', 'timeout');
await page.click('#filter');
await page.click('[data-ctx="2"]');
await page.waitForSelector('.gap');
await page.waitForTimeout(300);
await page.screenshot({ path: join(root, 'store/2-filter-and-highlight.png') });

await page.click('#rules-toggle');
await page.click('#filter');
await page.fill('#q', '');
await page.waitForTimeout(300);
await page.locator('#log').focus();
await page.keyboard.press('n');
await page.keyboard.press('n');
await page.waitForSelector('.row.current .json-btn');
await page.click('.row.current .json-btn');
await page.waitForSelector('#json-dialog[open]');
await page.screenshot({ path: join(root, 'store/3-json-and-errors.png') });
await page.keyboard.press('Escape');

await page.click('#help-toggle');
await page.screenshot({ path: join(root, 'store/4-help-and-feedback.png') });
await page.keyboard.press('Escape');

await page.emulateMedia({ colorScheme: 'light' });
await page.click('#rules-toggle');
await page.fill('#q', 'timeout');
await page.click('#filter');
await page.waitForSelector('.gap');
await page.waitForTimeout(300);
await page.screenshot({ path: join(root, 'store/5-light-theme.png') });
await ctx.close();
console.log('store assets written to public/icons and store/');
