// Hero visual review (Task 6): scrub filmstrips, a real-time smoothness curve and the poster ↔ canvas swap.
// Everything runs in Chrome (no ffmpeg): frames come from ?hero-t=<s>, contact sheets are composed on a
// canvas, and the real-time capture (Playwright video) is decoded frame by frame with requestVideoFrameCallback.
// Needs a running app: TEST_URL (default http://127.0.0.1:4173), Chrome via TEST_BROWSER.
//   node scripts/hero-filmstrip.cjs [label] [--no-video] [--no-sheets] [--scrub]
// Output: .cache/hero/filmstrip/<label>/ (git-ignored).
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.TEST_URL || 'http://127.0.0.1:4173';
const args = process.argv.slice(2), flag = name => args.includes(`--${name}`);
const label = args.find(a => !a.startsWith('--')) || 'latest';
const out = path.resolve('.cache/hero/filmstrip', label);
const TIMES = [0, .3, .6, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.6, 5, 5.4, 5.8, 6.2, 6.5, 7, 9, 12];
const STATIC_T = 90.5; // src/hero/timeline.ts: the poster / reduced-motion / session-skip pose
const LAYOUTS = [
  { name: '1440', viewport: { width: 1440, height: 900 }, cell: 600, columns: 5 },
  { name: '390', viewport: { width: 390, height: 844 }, cell: 537, columns: 5 },
];
// Smoothness: a sample every 100 ms; a spike is > 3× the local median (±5 samples) and clear of the noise floor.
const SAMPLE = .1, WINDOW = 5, SPIKE = 3, FLOOR = .15, ACCENT = [6, 6.7];
const launch = () => chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const fmt = t => (Math.round(t * 1000) / 1000).toString();

// Loads a frozen time and waits until the canvas has drawn and its 150 ms fade-in has finished.
async function frozen(page, t) {
  const errors = []; const onError = e => errors.push(e.message); page.on('pageerror', onError);
  await page.goto(`${base}/?hero-t=${t}`);
  await page.waitForFunction(() => { const h = document.querySelector('.hero-art'); return h?.dataset.heroReady !== undefined && h.dataset.heroFrame; }, null, { timeout: 20000 });
  await page.waitForTimeout(260);
  page.off('pageerror', onError);
  if (errors.length) throw new Error(`hero-t=${t}: ${errors.join('\n')}`);
}
const slot = page => page.locator('.hero-art').boundingBox();

// Draws a labelled grid of PNGs (base64) on a canvas and returns the sheet as a PNG buffer.
async function composeSheet(page, title, cells, cellWidth, columns) {
  const dataUrl = await page.evaluate(async ({ title, cells, cellWidth, columns }) => {
    const images = await Promise.all(cells.map(c => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = `data:image/png;base64,${c.png}`; })));
    const cellHeight = Math.round(cellWidth * images[0].height / images[0].width), gap = 10, head = 56, caption = 30, rows = Math.ceil(cells.length / columns);
    const canvas = document.createElement('canvas'); canvas.width = columns * cellWidth + (columns + 1) * gap; canvas.height = head + rows * (cellHeight + caption + gap) + gap;
    const g = canvas.getContext('2d'); g.fillStyle = '#0b0c0b'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#fffdf2'; g.font = '600 22px system-ui, sans-serif'; g.fillText(title, gap + 4, 36);
    cells.forEach((c, i) => {
      const x = gap + (i % columns) * (cellWidth + gap), y = head + Math.floor(i / columns) * (cellHeight + caption + gap);
      g.drawImage(images[i], x, y + caption, cellWidth, cellHeight);
      g.strokeStyle = '#2b2e2a'; g.strokeRect(x + .5, y + caption + .5, cellWidth - 1, cellHeight - 1);
      g.fillStyle = '#ffd900'; g.font = '600 17px system-ui, sans-serif'; g.fillText(c.label, x + 2, y + 21);
      if (c.note) { g.fillStyle = '#9aa39e'; g.font = '14px system-ui, sans-serif'; g.fillText(c.note, x + 2 + g.measureText(c.label).width + 64, y + 21); }
    });
    return canvas.toDataURL('image/png');
  }, { title, cells, cellWidth, columns });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

async function sheets(browser) {
  const report = {};
  for (const layout of LAYOUTS) {
    const context = await browser.newContext({ viewport: layout.viewport, deviceScaleFactor: 2 });
    const page = await context.newPage(), cells = [];
    for (const t of TIMES) {
      await frozen(page, t);
      const [box, phase] = await Promise.all([slot(page), page.locator('.hero-art').getAttribute('data-hero-phase')]);
      const png = await page.screenshot({ clip: box });
      await fs.writeFile(path.join(out, 'frames', `${layout.name}-${fmt(t)}.png`), png);
      cells.push({ png: png.toString('base64'), label: `t = ${fmt(t)} s`, note: phase });
      if (t === TIMES[TIMES.length - 1]) {
        // The whole hero at the settled pose: does the copy still lead, and does the art fight the headline?
        const intro = await page.locator('.intro').boundingBox();
        await fs.writeFile(path.join(out, `hero-${layout.name}.png`), await page.screenshot({ clip: intro }));
        report[layout.name] = { slot: box, intro };
      }
    }
    const blank = await context.newPage();
    const sheet = await composeSheet(blank, `Hero build — ${layout.viewport.width} × ${layout.viewport.height} (art slot, ?hero-t)`, cells, layout.cell, layout.columns);
    await fs.writeFile(path.join(out, `sheet-${layout.name}.png`), sheet);
    console.log(`sheet-${layout.name}.png: ${TIMES.length} frames`);
    await context.close();
  }
  return report;
}

// The session-skip swap: the poster (as a reduced-motion load shows it) against the live canvas at STATIC_T.
async function swap(browser) {
  const result = {};
  for (const layout of LAYOUTS) {
    const live = await browser.newContext({ viewport: layout.viewport, deviceScaleFactor: 2 });
    const page = await live.newPage(); await frozen(page, STATIC_T);
    const canvasPng = await page.screenshot({ clip: await slot(page) }); await live.close();
    const still = await browser.newContext({ viewport: layout.viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const p2 = await still.newPage(); await p2.goto(base);
    await p2.waitForFunction(() => document.querySelector('.hero-art')?.dataset.heroPosterLoaded !== undefined, null, { timeout: 20000 }); await p2.waitForTimeout(300);
    const posterPng = await p2.screenshot({ clip: await slot(p2) });
    const stats = await p2.evaluate(async ({ a, b }) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${src}`; });
      const [ia, ib] = await Promise.all([load(a), load(b)]), w = ia.width, h = ia.height;
      const read = img => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
      const da = read(ia), db = read(ib), canvas = document.createElement('canvas'); canvas.width = w * 3; canvas.height = h;
      const g = canvas.getContext('2d'); g.drawImage(ia, 0, 0); g.drawImage(ib, w, 0);
      const diff = g.createImageData(w, h); let sum = 0, big = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; sum += d; if (d > 24) big++;
        diff.data[i] = Math.min(255, d * 6); diff.data[i + 1] = Math.min(255, d * 3); diff.data[i + 2] = 0; diff.data[i + 3] = 255;
      }
      g.putImageData(diff, w * 2, 0);
      return { mean: sum / (w * h), over24: big / (w * h), png: canvas.toDataURL('image/png') };
    }, { a: canvasPng.toString('base64'), b: posterPng.toString('base64') });
    await fs.writeFile(path.join(out, `swap-${layout.name}.png`), Buffer.from(stats.png.slice(stats.png.indexOf(',') + 1), 'base64'));
    result[layout.name] = { meanAbsDiff: +stats.mean.toFixed(2), shareOver24: +stats.over24.toFixed(4) };
    console.log(`swap-${layout.name}.png: canvas | poster | difference ×6, mean ${stats.mean.toFixed(2)} / 255`);
    await still.close();
  }
  return result;
}

// Flags samples above SPIKE × the local median (excluding the sample itself), outside the designed accent.
function spikes(curve) {
  return curve.flatMap((s, i) => {
    const near = curve.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).filter((_, j) => j !== Math.min(i, WINDOW)).map(n => n.diff).sort((a, b) => a - b);
    const median = near[Math.floor(near.length / 2)] ?? 0, accent = s.t >= ACCENT[0] && s.t <= ACCENT[1];
    return s.diff > SPIKE * Math.max(median, FLOOR) ? [{ t: +s.t.toFixed(2), diff: +s.diff.toFixed(3), median: +median.toFixed(3), accent }] : [];
  });
}

// Plots one or more curves (mean absolute pixel difference per sample against hero time) with the phase bands.
async function plot(page, title, series, file, step = 'scaled to a 100 ms step') {
  const svg = await page.evaluate(({ title, series, step }) => {
    const W = 1400, H = 540, L = 64, R = 24, T = 80, B = 56, tMax = 10;
    const yMax = Math.max(1, ...series.flatMap(s => s.points.filter(p => p.t >= 0 && p.t <= tMax).map(p => p.diff))) * 1.1;
    const x = t => L + t / tMax * (W - L - R), y = d => H - B - d / yMax * (H - T - B);
    const bands = [['pitch', .05, .85], ['tier wave', .55, 3.66], ['façade', 3.4, 4.6], ['roof', 4.6, 5.8], ['pylons', 5.8, 6.5], ['accent', 6, 7.3], ['idle', 6.5, 10]];
    const colors = ['#ffd900', '#6fb2d8', '#e07a5f'];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="#0b0c0b"/>`;
    s += `<text x="${L}" y="32" fill="#fffdf2" font-size="20" font-weight="600">${title}</text>`;
    bands.forEach(([n, a, b], i) => { const by = 44 + (i % 2) * 14; s += `<rect x="${x(a)}" y="${by}" width="${x(b) - x(a)}" height="10" fill="#9aa39e" fill-opacity=".35"/><text x="${x(a) + 3}" y="${by + 9}" fill="#fffdf2" font-size="10">${n}</text><line x1="${x(a)}" x2="${x(a)}" y1="${by + 10}" y2="${H - B}" stroke="#ffffff" stroke-opacity=".06"/>`; });
    for (let t = 0; t <= tMax; t++) s += `<line x1="${x(t)}" x2="${x(t)}" y1="${H - B}" y2="${H - B + 6}" stroke="#9aa39e"/><text x="${x(t)}" y="${H - B + 22}" fill="#9aa39e" font-size="13" text-anchor="middle">${t} s</text>`;
    for (let k = 0; k <= 4; k++) { const d = yMax * k / 4; s += `<line x1="${L}" x2="${W - R}" y1="${y(d)}" y2="${y(d)}" stroke="#ffffff" stroke-opacity=".08"/><text x="${L - 8}" y="${y(d) + 4}" fill="#9aa39e" font-size="12" text-anchor="end">${d.toFixed(2)}</text>`; }
    series.forEach((c, i) => {
      s += `<polyline fill="none" stroke="${colors[i]}" stroke-width="${i ? 1.25 : 2}" stroke-opacity="${i ? .7 : 1}" points="${c.points.filter(p => p.t <= tMax).map(p => `${x(p.t).toFixed(1)},${y(p.diff).toFixed(1)}`).join(' ')}"/>`;
      s += `<text x="${W - R - 8}" y="${T + 16 + i * 18}" fill="${colors[i]}" font-size="13" text-anchor="end">${c.name}</text>`;
      for (const f of c.flags ?? []) s += `<circle cx="${x(f.t)}" cy="${y(f.diff)}" r="6" fill="none" stroke="${f.accent ? '#9aa39e' : '#ff4d4d'}" stroke-width="2"/>`;
    });
    s += `<text x="${L}" y="${H - 12}" fill="#9aa39e" font-size="12">Mean absolute RGB difference (of 255) between consecutive samples in the art slot, ${step}. Circles: > ${3}× local median (grey = designed accent).</text></svg>`;
    return s;
  }, { title, series, step });
  await page.setViewportSize({ width: 1400, height: 540 });
  await page.setContent(`<body style="margin:0;background:#0b0c0b">${svg}</body>`);
  await fs.writeFile(file, await page.locator('svg').screenshot());
}

// Real-time capture: record a fresh first visit, then decode the video in Chrome and difference the art slot.
async function realtime(browser) {
  const videoDir = path.join(out, 'video');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
  // Log (wall clock, hero t) on every frame the stage draws, to map video time onto hero time.
  await context.addInitScript(() => {
    window.__heroLog = [];
    // React mounts .hero-art after DOMContentLoaded, so watch the whole document for the attribute.
    new MutationObserver(records => { for (const r of records) { const t = Number(r.target.dataset.heroT); if (Number.isFinite(t)) window.__heroLog.push([Date.now(), t]); } })
      .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hero-t'] });
  });
  const created = Date.now(), page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => Number(document.querySelector('.hero-art')?.dataset.heroT) > 10.5, null, { timeout: 30000 });
  const [box, log] = await Promise.all([slot(page), page.evaluate(() => window.__heroLog)]);
  const video = await page.video().path(); await context.close();
  // Hero t = 0 in wall time, from the build frames (t advances with the wall clock during the build).
  const build = log.filter(([, t]) => t > 0 && t < 6);
  const zeroWall = build.map(([w, t]) => w - t * 1000).sort((a, b) => a - b)[Math.floor(build.length / 2)];
  const offset = (zeroWall - created) / 1000;
  const intervals = log.slice(1).map(([w], i) => w - log[i][0]).filter((_, i) => log[i + 1][1] < 6.5).sort((a, b) => a - b);
  const bytes = await fs.readFile(video);

  const analysis = await browser.newPage();
  await analysis.route('http://hero-filmstrip.local/**', route => route.request().url().endsWith('.webm')
    ? route.fulfill({ body: bytes, contentType: 'video/webm' })
    : route.fulfill({ body: '<!doctype html><body style="margin:0;background:#000"><video muted playsinline></video></body>', contentType: 'text/html' }));
  await analysis.goto('http://hero-filmstrip.local/');
  // Decode every frame at half speed (so none are dropped). Each frame is differenced against the previous
  // decoded frame, and each 100 ms sample (the decoded frame nearest its time) against the previous sample.
  const { frames, curve } = await analysis.evaluate(({ box, offset, SAMPLE, end }) => new Promise((resolve, reject) => {
    const video = document.querySelector('video'), w = Math.round(box.width), h = Math.round(box.height);
    const g = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (3 * w * h); };
    const frames = [], curve = []; let last = null, lastTime = -Infinity, sample = 0, sampled = null;
    // The 25 fps video puts consecutive samples 80 or 120 ms apart, so each difference is scaled to 100 ms.
    let sampledTime = 0;
    const take = (data, time) => {
      if (sampled) curve.push({ t: +(sample * SAMPLE).toFixed(2), diff: diff(data, sampled) * SAMPLE / Math.max(.02, time - sampledTime), raw: diff(data, sampled), error: +(time - offset - sample * SAMPLE).toFixed(3) });
      sampled = data; sampledTime = time; sample++;
    };
    const step = (_, meta) => {
      g.drawImage(video, box.x, box.y, w, h, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data, time = meta.mediaTime;
      frames.push({ time, diff: last ? diff(data, last) : 0 });
      // Every pending sample time that this frame has passed goes to whichever neighbour is nearer.
      while (sample * SAMPLE <= end && sample * SAMPLE + offset <= time) {
        const s = sample * SAMPLE + offset;
        if (last && s - lastTime < time - s) take(last, lastTime); else take(data, time);
      }
      last = data; lastTime = time;
      if (!video.ended) video.requestVideoFrameCallback(step);
    };
    video.onended = () => setTimeout(() => resolve({ frames, curve }), 300);
    video.onerror = () => reject(new Error('video decode failed'));
    video.src = 'video.webm'; video.playbackRate = .5;
    video.requestVideoFrameCallback(step); video.play().catch(reject);
  }), { box, offset, SAMPLE, end: 10.5 });
  await analysis.close();
  // Per decoded frame, scaled to 100 ms as well, from hero t = 0 (earlier frames are the page loading).
  const perFrame = frames.slice(1).map((f, i) => ({ t: +(f.time - offset).toFixed(3), diff: f.diff * SAMPLE / Math.max(.02, f.time - frames[i].time) })).filter(f => f.t >= 0);
  const flags = spikes(curve);
  const chart = await browser.newPage();
  await plot(chart, 'Real-time build, 1440 × 900: frame-to-frame difference, art slot (600 × 400)', [
    { name: '100 ms samples', points: curve, flags },
    { name: 'every decoded video frame', points: perFrame },
  ], path.join(out, 'smoothness.png'));
  await chart.close();
  const fps = frames.length / (frames[frames.length - 1].time - frames[0].time);
  const result = {
    videoFrames: frames.length, videoFps: +fps.toFixed(1), offset: +offset.toFixed(3),
    stageFrames: log.length, buildInterval: { p50: intervals[Math.floor(intervals.length * .5)], p95: intervals[Math.floor(intervals.length * .95)], max: intervals[intervals.length - 1] },
    spikes: flags, curve,
  };
  await fs.writeFile(path.join(out, 'smoothness.json'), JSON.stringify(result, null, 1));
  console.log(`smoothness.png: ${frames.length} video frames (${fps.toFixed(1)} fps), offset ${offset.toFixed(3)} s, spikes outside the accent: ${flags.filter(f => !f.accent).length}`);
  for (const f of flags) console.log(`  ${f.accent ? 'accent' : 'SPIKE '} t = ${f.t} s: ${f.diff} vs median ${f.median}`);
  return result;
}

// Deterministic scrub curve at 1/30 s (optional, slow): separates real pops from capture jitter.
async function scrub(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), step = 1 / 30, curve = []; let previous = null;
  for (let i = 0; i * step <= 8; i++) {
    const t = i * step; await frozen(page, t.toFixed(4));
    const png = (await page.screenshot({ clip: await slot(page) })).toString('base64');
    if (previous) curve.push({ t: +t.toFixed(3), diff: await page.evaluate(async ({ a, b }) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${src}`; });
      const [ia, ib] = await Promise.all([load(a), load(b)]), c = new OffscreenCanvas(ia.width, ia.height), g = c.getContext('2d');
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, ia.width, ia.height).data; g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, ia.width, ia.height).data;
      let s = 0; for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); return s / (3 * ia.width * ia.height);
    }, { a: png, b: previous }) });
    previous = png;
  }
  const flags = spikes(curve);
  await plot(page, 'Scrubbed ?hero-t every 1/30 s, 1440 × 900 art slot', [{ name: '1/30 s scrub', points: curve, flags }], path.join(out, 'scrub.png'), 'per 1/30 s step');
  await fs.writeFile(path.join(out, 'scrub.json'), JSON.stringify({ spikes: flags, curve }, null, 1));
  console.log(`scrub.png: ${curve.length} steps, spikes outside the accent: ${flags.filter(f => !f.accent).length}`);
  for (const f of flags) console.log(`  ${f.accent ? 'accent' : 'SPIKE '} t = ${f.t} s: ${f.diff.toFixed(3)} vs median ${f.median}`);
  await context.close();
  return { spikes: flags };
}

(async () => {
  await fs.mkdir(path.join(out, 'frames'), { recursive: true });
  const browser = await launch(), summary = { label, base, at: new Date().toISOString() };
  try {
    if (!flag('no-sheets')) { summary.layouts = await sheets(browser); summary.swap = await swap(browser); }
    if (!flag('no-video')) { const r = await realtime(browser); summary.realtime = { ...r, curve: undefined }; }
    if (flag('scrub')) summary.scrub = await scrub(browser);
  } finally { await browser.close(); }
  await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`→ ${path.relative(process.cwd(), out)}`);
})().catch(error => { console.error(error); process.exit(1); });
