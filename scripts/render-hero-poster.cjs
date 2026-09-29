// Render the hero poster from the real WebGL stage: the settled still pose (STATIC_T in src/hero/timeline.ts,
// mid roof-lift, no sway) at 2× the largest 600 × 400 slot, encoded in the page as WebP with alpha.
// Needs a running app: TEST_URL (default http://127.0.0.1:4173), Chrome via TEST_BROWSER.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const STATIC_T = 90.5, SIZE = { width: 1200, height: 800 };
const output = path.resolve('public/media/hero-stadium-poster.webp');

(async () => {
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    // 1440 × 900 gives the 600 × 400 slot; ?hero-dpr=2 renders its canvas at 1200 × 800.
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/?hero-t=${STATIC_T}&hero-dpr=2`);
    await page.waitForFunction(() => document.querySelector('.hero-art')?.dataset.heroFrame, null, { timeout: 20000 });
    const { dataUrl, width, height } = await page.evaluate(() => new Promise((resolve, reject) => {
      const host = document.querySelector('.hero-art'), canvas = host.querySelector('canvas.hero-canvas');
      host.addEventListener('hero-captured', event => {
        if (!event.detail) return reject(new Error('Canvas encoding failed'));
        const reader = new FileReader(); reader.onload = () => resolve({ dataUrl: reader.result, width: canvas.width, height: canvas.height }); reader.readAsDataURL(event.detail);
      }, { once: true });
      host.dispatchEvent(new CustomEvent('hero-capture', { detail: { type: 'image/webp', quality: .9 } }));
    }));
    if (errors.length) throw new Error(errors.join('\n'));
    if (width !== SIZE.width || height !== SIZE.height) throw new Error(`Poster canvas is ${width} × ${height}, expected ${SIZE.width} × ${SIZE.height}`);
    if (!dataUrl.startsWith('data:image/webp;')) throw new Error('This browser did not encode WebP');
    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    await fs.writeFile(output, bytes);
    console.log(`${path.relative(process.cwd(), output)}: ${width} × ${height}, ${(bytes.length / 1024).toFixed(1)} kB, sha256 ${crypto.createHash('sha256').update(bytes).digest('hex')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
