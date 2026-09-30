// Explorer fidelity capture harness: renders the named poses of src/viewer/poses.ts (?explorer-pose=<name>, dev
// server only) and the settled hero (?hero-t=90.5), then composes a labelled contact sheet. Everything runs in Chrome.
// Needs a running dev server: TEST_URL (default http://127.0.0.1:5173), Chrome via TEST_BROWSER.
//   node scripts/explorer-captures.cjs [label] [--only=a,b] [--compare=<label>] [--untextured]
//   node scripts/explorer-captures.cjs [label] --perf[=runs]   (performance only, see perf() below)
// Output: .cache/explorer/<label>/<pose>.png, sheet.png, sheet-grey.png, hero-pair.png, report.json (git-ignored). --compare diffs every pose
// against another label's captures and writes compare-<label>.png plus the per-pose numbers into report.json.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.TEST_URL || 'http://127.0.0.1:5173';
const args = process.argv.slice(2), option = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const label = args.find(a => !a.startsWith('--')) || 'latest', compare = option('compare'), only = option('only')?.split(',');
const extra = option('query') ? `&${option('query')}` : ''; // --query=a=1&b=2 appends dev parameters
const perfRuns = args.includes('--perf') ? 3 : Number(option('perf')) || 0;
const root = path.resolve('.cache/explorer'), out = path.join(root, label);
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
// Sheet order: the silhouette pair first, then the stadium from far to near, then the seat previews.
const POSES = [
  { name: 'hero', note: 'hero ?hero-t=90.5 (frozen, reference)', context: DESKTOP, hero: true },
  { name: 'hero-match', note: 'explorer at the hero camera, fov 12°' },
  { name: 'home-cutaway', note: 'HOME, cutaway on' }, { name: 'home-roof', note: 'HOME, cutaway off' },
  { name: 'exterior-low', note: 'SE, polar 1.05, r 400' }, { name: 'facade-close', note: 'W façade, 150 m from the wall' },
  { name: 'corner-close', note: 'NE corner, 150 m from the wall' }, { name: 'phone-home', note: '390 × 844, compact', context: PHONE },
  { name: 'bowl-corner', note: 'NE corner from inside, cutaway on' },
  { name: 'top-down', note: 'straight down, cutaway on' },
  { name: 'district-south', note: 'service buildings and road' }, { name: 'parking-east', note: 'car park, trees, railway' },
  { name: 'preview-south', note: 'seat preview' }, { name: 'preview-west-upper', note: 'seat preview' }, { name: 'preview-east-lower', note: 'seat preview' },
].filter(p => !only || only.includes(p.name));
const launch = () => chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const frames = (page, n = 3) => page.evaluate(n => new Promise(resolve => { const step = k => k ? requestAnimationFrame(() => step(k - 1)) : resolve(); step(n); }), n);
const png = buffer => buffer.toString('base64');

// Renders one pose and returns the canvas screenshot. Overlays drawn over the canvas (mini-map, hover card,
// back button) are hidden so the sheet shows the 3D scene only.
async function capture(browser, pose) {
  const context = await browser.newContext(pose.context || DESKTOP), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    if (pose.hero) {
      await page.goto(`${base}/?hero-t=90.5`);
      await page.waitForFunction(() => { const h = document.querySelector('.hero-art'); return h?.dataset.heroReady !== undefined && h.dataset.heroFrame; }, null, { timeout: 30000 });
      await page.waitForTimeout(260);
      return { image: await page.locator('.hero-art').screenshot(), stats: {} };
    }
    await page.goto(`${base}/?explorer-pose=${pose.pose || pose.name}${extra}${pose.query || ''}`);
    await page.addStyleTag({ content: '.scene-frame > :not(.scene-host) { visibility: hidden !important; }' });
    await page.locator('.scene-frame').scrollIntoViewIfNeeded();
    await page.waitForFunction(name => document.querySelector('.scene-host')?.dataset.poseReady === name, pose.name, { timeout: 30000 });
    // Task 5: textures and the sky arrive after the first frame; capture the finished look (unless --untextured).
    if (!args.includes('--untextured')) await page.waitForFunction(() => ['ready', 'failed'].includes(document.querySelector('.scene-host')?.dataset.textures), null, { timeout: 60000 });
    await frames(page, 4);
    const stats = await page.locator('.scene-host').evaluate(el => ({ detail: el.dataset.detail, drawCalls: +el.dataset.drawCalls, drawCallsTotal: +el.dataset.drawCallsTotal, triangles: +el.dataset.triangles, shadowRenders: +el.dataset.shadowRenders, textures: el.dataset.textures, quality: el.dataset.quality, mode: el.dataset.mode, atmosphere: el.dataset.atmosphere, matchTime: el.dataset.matchTime }));
    const image = await page.locator('.scene-host canvas').screenshot();
    if (errors.length) throw new Error(`${pose.name}: ${errors.join('\n')}`);
    return { image, stats };
  } finally { await context.close(); }
}

// Lays the captures out in a grid with each cell fitted (letterboxed) to one cell size, whatever its aspect.
// filter: a canvas filter for the images only (Task 9's value check uses 'grayscale(1)').
async function composeSheet(page, title, cells, cellWidth = 700, cellHeight = 438, columns = 3, filter = 'none') {
  const dataUrl = await page.evaluate(async ({ title, cells, cellWidth, cellHeight, columns, filter }) => {
    const images = await Promise.all(cells.map(c => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = `data:image/png;base64,${c.png}`; })));
    const gap = 12, head = 60, caption = 30, rows = Math.ceil(cells.length / columns);
    const canvas = document.createElement('canvas'); canvas.width = columns * cellWidth + (columns + 1) * gap; canvas.height = head + rows * (cellHeight + caption + gap) + gap;
    const g = canvas.getContext('2d'); g.fillStyle = '#0b0c0b'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#fffdf2'; g.font = '600 22px system-ui, sans-serif'; g.fillText(title, gap + 4, 38);
    cells.forEach((c, i) => {
      const x = gap + (i % columns) * (cellWidth + gap), y = head + Math.floor(i / columns) * (cellHeight + caption + gap), im = images[i];
      const s = Math.min(cellWidth / im.width, cellHeight / im.height), w = im.width * s, h = im.height * s;
      g.fillStyle = '#151614'; g.fillRect(x, y + caption, cellWidth, cellHeight);
      g.filter = filter; g.drawImage(im, x + (cellWidth - w) / 2, y + caption + (cellHeight - h) / 2, w, h); g.filter = 'none';
      g.fillStyle = '#ffd900'; g.font = '600 17px system-ui, sans-serif'; g.fillText(c.label, x + 2, y + 21);
      if (c.note) { const w = g.measureText(c.label).width; g.fillStyle = '#9aa39e'; g.font = '14px system-ui, sans-serif'; g.fillText(c.note, x + 14 + w, y + 21); }
    });
    return canvas.toDataURL('image/png');
  }, { title, cells, cellWidth, cellHeight, columns, filter });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

// Mean absolute RGB difference (of 255) and the share of pixels differing by more than 8 and 24.
async function diff(page, a, b) {
  return page.evaluate(async ({ a, b }) => {
    const load = s => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = `data:image/png;base64,${s}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: [ia.width, ia.height, ib.width, ib.height] };
    const read = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const da = read(ia), db = read(ib); let sum = 0, over8 = 0, over24 = 0;
    for (let i = 0; i < da.length; i += 4) { const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; sum += d; if (d > 8) over8++; if (d > 24) over24++; }
    const n = da.length / 4; return { meanAbsDiff: +(sum / n).toFixed(3), shareOver8: +(over8 / n).toFixed(5), shareOver24: +(over24 / n).toFixed(5) };
  }, { a, b });
}

// Performance at the default page state (HOME, cutaway on, atmosphere running; no pose hook, so the clock runs):
// time to the first explorer frame, main-pass counters, and rAF intervals over 5 s after the clock passes 0.2 s.
// Desktop 1440 × 900 at 1× CPU; phone 390 × 844 at 4× CPU (the tests/quality.browser.cjs phone gate).
async function perf(browser, name, options, cpu) {
  const context = await browser.newContext(options), page = await context.newPage();
  await page.addInitScript(() => {
    const start = performance.now();
    new MutationObserver((_, observer) => { const host = document.querySelector('.scene-host'); if (host?.dataset.drawCalls) { window.__firstFrameMs = performance.now() - start; observer.disconnect(); } })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-draw-calls'] });
  });
  try {
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(base); await page.locator('.scene-frame').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Number(document.querySelector('.scene-host')?.dataset.matchTime) > .2, null, { timeout: 60000 });
    const timing = await page.evaluate(() => new Promise(resolve => {
      const intervals = []; let last = performance.now(); const start = last;
      const tick = t => { intervals.push(t - last); last = t; if (t - start < 5000) requestAnimationFrame(tick); else { intervals.shift(); intervals.sort((a, b) => a - b); const at = q => +intervals[Math.floor(intervals.length * q)].toFixed(2); resolve({ samples: intervals.length, medianMs: at(.5), p95Ms: at(.95), maxMs: +intervals.at(-1).toFixed(2) }); } };
      requestAnimationFrame(tick);
    }));
    const host = await page.locator('.scene-host').evaluate(el => ({ atmosphere: el.dataset.atmosphere, drawCalls: +el.dataset.drawCalls, triangles: +el.dataset.triangles, firstFrameMs: Math.round(window.__firstFrameMs) }));
    return { name, cpu, ...host, ...timing };
  } finally { await context.close(); }
}

// Task 7 pop check: exterior-low (SE, polar 1.05) from the orbit's minimum to maximum distance, with the detail
// switch left to the engine, then at the first distance past the switch with detail forced on and off. The on/off
// difference there is the most a switch could pop. Writes zoom.png (filmstrip) and zoom.json.
async function zoom() {
  const browser = await launch(), cells = [], report = { label, date: new Date().toISOString(), steps: [] };
  try {
    const radii = (option('radii') || '150,250,330,370,385,395,420,480,550').split(',').map(Number);
    let past = null;
    for (const r of radii) {
      const { image, stats } = await capture(browser, { name: 'exterior-low', query: `&pose-radius=${r}` });
      report.steps.push({ radius: r, ...stats }); cells.push({ label: `r ${r} m`, note: `detail: ${stats.detail}, ${stats.triangles} tris`, png: png(image) });
      if (past === null && !String(stats.detail).includes('close')) past = r;
      console.log(r, stats.detail, stats.triangles);
    }
    if (past !== null) {
      const on = await capture(browser, { name: 'exterior-low', query: `&pose-radius=${past}&detail=on` }), off = await capture(browser, { name: 'exterior-low', query: `&pose-radius=${past}&detail=off` });
      const page = await browser.newPage(), d = await diff(page, png(on.image), png(off.image));
      report.switch = { radius: past, onVsOff: d }; console.log('switch at', past, JSON.stringify(d));
      cells.push({ label: `r ${past} forced on`, png: png(on.image) }, { label: `r ${past} forced off`, note: `Δ ${d.meanAbsDiff}, >8: ${(d.shareOver8 * 100).toFixed(2)}%`, png: png(off.image) });
      await fs.writeFile(path.join(out, 'zoom.png'), await composeSheet(page, `Zoom sweep — ${label}`, cells));
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(out, 'zoom.json'), JSON.stringify(report, null, 2));
}

(async () => {
  await fs.mkdir(out, { recursive: true });
  if (perfRuns) {
    const browser = await launch(), runs = [];
    try {
      for (let i = 0; i < perfRuns; i++) for (const [name, options, cpu] of [['home-cutaway', { viewport: DESKTOP.viewport, deviceScaleFactor: 1 }, 1], ['phone-home', PHONE, 4]]) {
        const r = await perf(browser, name, options, cpu); runs.push(r); console.log(JSON.stringify(r));
      }
      const report = { label, date: new Date().toISOString(), base, chrome: browser.version(), runs };
      await fs.writeFile(path.join(out, 'perf.json'), JSON.stringify(report, null, 2));
    } finally { await browser.close(); }
    return;
  }
  if (args.includes('--zoom')) return zoom();
  const browser = await launch(), report = { label, date: new Date().toISOString(), base, chrome: browser.version(), poses: {} };
  try {
    const cells = [];
    for (const pose of POSES) {
      const { image, stats } = await capture(browser, pose);
      await fs.writeFile(path.join(out, `${pose.name}.png`), image);
      report.poses[pose.name] = stats; cells.push({ label: pose.name, note: pose.note, png: png(image) });
      console.log(`${pose.name}.png`, JSON.stringify(stats));
    }
    const page = await browser.newPage();
    if (!only) {
      await fs.writeFile(path.join(out, 'sheet.png'), await composeSheet(page, `Explorer captures — ${label}`, cells));
      // Task 9 review aids: the value structure (greyscale) and the silhouette pair at a size that shows detail.
      await fs.writeFile(path.join(out, 'sheet-grey.png'), await composeSheet(page, `Explorer captures, greyscale — ${label}`, cells, 700, 438, 3, 'grayscale(1)'));
      const pair = cells.filter(c => c.label === 'hero' || c.label === 'hero-match');
      if (pair.length === 2) await fs.writeFile(path.join(out, 'hero-pair.png'), await composeSheet(page, `hero (left) · hero-match (right) — ${label}`, pair, 1100, 688, 2));
    }
    if (compare) {
      const pairs = [];
      for (const pose of POSES) {
        const other = await fs.readFile(path.join(root, compare, `${pose.name}.png`)).catch(() => null);
        if (!other) continue;
        const mine = await fs.readFile(path.join(out, `${pose.name}.png`)), result = await diff(page, png(other), png(mine));
        report.poses[pose.name] = { ...report.poses[pose.name], [`vs ${compare}`]: result };
        pairs.push({ label: `${pose.name} · ${compare}`, png: png(other) }, { label: `${pose.name} · ${label}`, note: `Δ ${result.meanAbsDiff ?? 'size'}`, png: png(mine) });
        console.log(`${pose.name} vs ${compare}`, JSON.stringify(result));
      }
      if (pairs.length) await fs.writeFile(path.join(out, `compare-${compare}.png`), await composeSheet(page, `${compare} (left) → ${label} (right)`, pairs, 700, 438, 2));
    }
  } finally { await browser.close(); }
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Captures: ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
