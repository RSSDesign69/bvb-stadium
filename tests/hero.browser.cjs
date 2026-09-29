// Hero stadium animation (hero-animation-task-list.md, Task 7): behaviour, fallbacks, accessibility, layout,
// and, against the production build, performance and bundle budgets.
//   TEST_URL (default http://127.0.0.1:4173, `vite preview`), TEST_BROWSER (default chrome).
//   HERO_BASELINE_URL / HERO_BASELINE_DIST: a pre-hero build (served / on disk) for the LCP and bundle deltas.
//   HERO_PERF=0 skips the throttled performance section. Numbers go to .cache/qa/hero.json.
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const base = process.env.TEST_URL || 'http://127.0.0.1:4173', baseline = process.env.HERO_BASELINE_URL, baselineDist = process.env.HERO_BASELINE_DIST;
const STATIC_T = '90.500'; // src/hero/timeline.ts: the still pose shared by pause, session-skip, poster and reduced motion
const report = { date: new Date().toISOString(), url: base, checks: [] };
const pass = (name, detail) => { report.checks.push({ name, ...detail }); console.log('PASS', name, detail ? JSON.stringify(detail) : ''); };
const launch = () => chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = xs => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const p95 = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * .95))]; };

// Page instrumentation, installed before any app code: hero phase log, layout shifts, LCP, and (optionally) every
// display frame's rAF timestamp. performance.now() starts at navigation, so every time is from navigation.
function instrument({ frames }) {
  const h = window.__hero = { phases: [], shifts: 0, lcp: null, raf: [] };
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) h.shifts += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { const e = l.getEntries().at(-1); h.lcp = { time: e.startTime, tag: e.element?.tagName.toLowerCase() ?? null, id: e.element?.id ?? null }; }).observe({ type: 'largest-contentful-paint', buffered: true });
  const watch = () => {
    const art = document.querySelector('.hero-art'); if (!art) return requestAnimationFrame(watch);
    const log = () => { const phase = art.dataset.heroPhase; if (h.phases.at(-1)?.phase !== phase) h.phases.push({ phase, time: performance.now(), t: Number(art.dataset.heroT ?? 0) }); };
    log(); new MutationObserver(log).observe(art, { attributes: true, attributeFilter: ['data-hero-phase'] });
  };
  requestAnimationFrame(watch);
  if (frames) { const tick = t => { h.raf.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
}
async function open(browser, options = {}, { frames = false, init, url = base, throttle } = {}) {
  const context = await browser.newContext({ ...DESKTOP, ...options }), page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  await context.addInitScript(instrument, { frames });
  if (init) await context.addInitScript(init);
  if (throttle) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  await page.goto(url);
  return { context, page, errors, requests };
}
const art = page => page.locator('.hero-art');
const data = page => art(page).evaluate(e => ({ ...e.dataset }));
const phases = page => page.evaluate(() => window.__hero.phases.map(p => p.phase));
const phaseIs = (page, list, timeout = 15000) => page.waitForFunction(l => l.includes(document.querySelector('.hero-art')?.dataset.heroPhase), list, { timeout });
const heroT = page => art(page).evaluate(e => Number(e.dataset.heroT));
const frameCount = page => art(page).evaluate(e => Number(e.dataset.heroFrame ?? 0));
const rendererRequested = requests => requests.some(u => /\/renderer[-.]/.test(u));
async function frozenFor(page, ms = 400) { const a = await frameCount(page); await sleep(ms); return a === await frameCount(page); }
async function advancing(page, ms = 400) { const a = await frameCount(page); await page.waitForFunction(n => Number(document.querySelector('.hero-art').dataset.heroFrame) > n, a, { timeout: ms * 5 }); return true; }
const scrollTo = (page, top) => page.evaluate(y => window.scrollTo({ top: y === 'past-hero' ? document.querySelector('.intro').getBoundingClientRect().bottom + scrollY + 40 : y, behavior: 'instant' }), top);
// Mean absolute RGB difference (0–255) of two PNG screenshots, decoded in the page.
function diff(page, a, b) {
  return page.evaluate(async ([a, b]) => {
    const load = async s => { const i = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob()); const c = new OffscreenCanvas(i.width, i.height), g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const [x, y] = await Promise.all([load(a), load(b)]); let sum = 0;
    for (let i = 0; i < x.length; i += 4) sum += Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]);
    return sum / (x.length / 4 * 3);
  }, [a.toString('base64'), b.toString('base64')]);
}
async function frozenShot(browser, t) {
  const { context, page, errors } = await open(browser, {}, { url: `${base}/?hero-t=${t}` });
  await page.waitForFunction(() => { const h = document.querySelector('.hero-art'); return h?.dataset.heroReady !== undefined && h.dataset.heroFrame; }, null, { timeout: 20000 });
  await sleep(260); // the canvas's 150 ms fade-in
  const png = await art(page).screenshot(); assert.deepEqual(errors, []);
  return { png, page, context };
}

async function behaviour(browser) {
  // First load in a fresh context: canvas placement, phase sequence, CLS, LCP element, session flag.
  {
    const { context, page, errors, requests } = await open(browser);
    await phaseIs(page, ['settled', 'idle'], 12000);
    const log = await page.evaluate(() => window.__hero);
    const seq = log.phases.map(p => p.phase), settledAt = log.phases.find(p => p.phase === 'settled' || p.phase === 'idle').time;
    assert.deepEqual(seq.slice(0, 3), ['placeholder', 'build', 'settled'], seq.join(' → '));
    assert.ok(settledAt < 9000, `settled at ${settledAt} ms`);
    const canvas = await page.evaluate(() => { const c = document.querySelectorAll('canvas.hero-canvas'); return { count: c.length, inArt: !!c[0]?.closest('.hero-art'), hidden: c[0]?.getAttribute('aria-hidden'), underScene: !!c[0]?.closest('.scene-host, .scene-frame') }; });
    assert.deepEqual(canvas, { count: 1, inArt: true, hidden: 'true', underScene: false });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('terrace:hero:played:v1')), '1');
    assert.ok(log.shifts <= .02, `CLS ${log.shifts}`);
    assert.equal(log.lcp?.tag, 'h1', JSON.stringify(log.lcp));
    // three is fetched once, in one chunk shared by the explorer engine and the hero renderer.
    // (Vite dev adds a deps/three.js facade that re-exports the same three.module chunk.)
    const three = requests.map(u => u.split('?')[0]).filter(u => /three\.module[-.]/.test(u));
    assert.equal(three.length, 1, three.join('\n')); assert.ok(rendererRequested(requests));
    await phaseIs(page, ['idle']);
    pass('first visit builds', { phases: seq, settledMs: Math.round(settledAt), cls: +log.shifts.toFixed(4), lcp: log.lcp });

    // Session-skip: a reload in the same context starts settled, never builds, and is idle within 1.5 s.
    await page.reload(); await phaseIs(page, ['idle'], 5000);
    const skip = await page.evaluate(() => window.__hero), idleAt = skip.phases.find(p => p.phase === 'idle').time;
    assert.equal((await data(page)).heroStart, 'skip'); assert.ok(!skip.phases.some(p => p.phase === 'build'), skip.phases.map(p => p.phase).join());
    assert.ok(idleAt < 1500, `idle at ${idleAt} ms`);
    assert.equal(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.intro')).getPropertyValue('--hero-underline'))), 1);
    assert.deepEqual(errors, []);
    pass('session-skip reload', { idleMs: Math.round(idleAt), phases: skip.phases.map(p => p.phase) });
    await context.close();
  }
  // A new context builds again.
  {
    const { context, page } = await open(browser); await phaseIs(page, ['build']);
    assert.equal((await data(page)).heroStart, 'build'); pass('new context builds again'); await context.close();
  }
  // Deterministic frames: ?hero-t=0, 3 and 7 differ; two loads at the same time match.
  {
    const shots = {};
    for (const t of [0, 3, 7]) { const s = await frozenShot(browser, t); shots[t] = s; }
    const again = await frozenShot(browser, 3), page = shots[0].page;
    const d = { '0-3': await diff(page, shots[0].png, shots[3].png), '3-7': await diff(page, shots[3].png, shots[7].png), '0-7': await diff(page, shots[0].png, shots[7].png), '3-3': await diff(page, shots[3].png, again.png) };
    assert.ok(d['0-3'] > 2 && d['3-7'] > 2 && d['0-7'] > 2, JSON.stringify(d)); assert.ok(d['3-3'] < .5, JSON.stringify(d));
    assert.equal(await frozenFor(again.page, 300), true, 'a frozen time draws once');
    assert.equal(await again.page.locator('.hero-controls').count(), 0);
    for (const s of [...Object.values(shots), again]) await s.context.close();
    pass('?hero-t frames', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(3)])));
  }
  // Pause during the build jumps to the still pose; a paused reload stays paused; play, pause in idle, replay.
  {
    const { context, page, errors } = await open(browser);
    await page.waitForFunction(() => Number(document.querySelector('.hero-art')?.dataset.heroT) > 1);
    const pause = page.getByRole('button', { name: 'Pause animation' });
    await pause.click();
    await page.waitForFunction(t => document.querySelector('.hero-art').dataset.heroT === t, STATIC_T);
    const play = page.getByRole('button', { name: 'Play animation' });
    assert.equal(await play.getAttribute('aria-pressed'), 'true'); assert.equal((await data(page)).heroPhase, 'paused');
    assert.equal(await frozenFor(page), true, 'paused: data-hero-frame stops');
    await page.waitForFunction(() => !document.querySelector('.hero-snapshot'));
    await page.reload(); await phaseIs(page, ['paused']);
    assert.equal((await data(page)).heroStart, 'settled'); assert.equal(await frozenFor(page), true);
    await page.getByRole('button', { name: 'Play animation' }).click(); await phaseIs(page, ['idle']); assert.ok(await advancing(page));
    assert.equal(await page.getByRole('button', { name: 'Pause animation' }).getAttribute('aria-pressed'), 'false');
    await sleep(400); await page.getByRole('button', { name: 'Pause animation' }).click(); await phaseIs(page, ['paused']);
    const held = await heroT(page); assert.ok(held > 90.5, `idle pause keeps its pose (${held})`); await sleep(300); assert.equal(await heroT(page), held);
    await page.getByRole('button', { name: 'Replay' }).click(); await phaseIs(page, ['build']);
    assert.ok(await heroT(page) < 1.5); assert.ok(await advancing(page));
    assert.equal(await page.getByRole('button', { name: 'Pause animation' }).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('terrace:hero:paused:v1')), null);
    assert.deepEqual(errors, []);
    // Offscreen: scrolling the explorer into view stops the loop; scrolling back resumes it.
    await scrollTo(page, 'past-hero'); await sleep(150);
    assert.ok(await art(page).evaluate(e => e.getBoundingClientRect().bottom < 0));
    assert.equal(await frozenFor(page), true, 'offscreen: data-hero-frame stops');
    await scrollTo(page, 0); assert.ok(await advancing(page));
    pass('pause, paused reload, play, idle pause, replay, offscreen freeze', { idlePauseT: held });
    await context.close();
  }
  // Reduced motion: the poster, no WebGL chunk, no loop, no controls, the underline present.
  {
    const { context, page, errors, requests } = await open(browser, { reducedMotion: 'reduce' });
    await phaseIs(page, ['static']); await page.waitForFunction(() => document.querySelector('.hero-art').dataset.heroPosterLoaded !== undefined);
    await sleep(1500);
    const s = await page.evaluate(() => ({ canvas: document.querySelectorAll('canvas.hero-canvas').length, frame: document.querySelector('.hero-art').dataset.heroFrame ?? null, poster: getComputedStyle(document.querySelector('.hero-poster')).opacity, underline: ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(document.querySelector('.intro h1 em'), '::after').transform) }));
    assert.deepEqual(s, { canvas: 0, frame: null, poster: '1', underline: true }); // full width: reduced motion drops the transform
    assert.equal(await page.locator('.hero-controls').isVisible(), false); assert.equal(rendererRequested(requests), false);
    assert.deepEqual(errors, []);
    pass('reduced motion', s); await context.close();
  }
  // webglcontextlost → poster, the stage disposed, no error UI.
  {
    const { context, page, errors } = await open(browser);
    await page.waitForFunction(() => Number(document.querySelector('.hero-art')?.dataset.heroT) > .5);
    await page.evaluate(() => document.querySelector('canvas.hero-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await phaseIs(page, ['static']); await page.waitForFunction(() => !document.querySelector('canvas.hero-canvas'));
    const s = await page.evaluate(() => ({ quality: document.querySelector('.hero-art').dataset.heroQuality, poster: getComputedStyle(document.querySelector('.hero-poster')).opacity, controls: document.querySelectorAll('.hero-controls').length }));
    assert.deepEqual(s, { quality: 'poster', poster: '1', controls: 0 }); assert.deepEqual(errors, []);
    pass('context lost → poster', s); await context.close();
  }
  // Low-end devices never load WebGL.
  {
    const { context, page, errors, requests } = await open(browser, {}, { init: () => Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 2 }) });
    await phaseIs(page, ['static']); await sleep(1500);
    assert.equal(rendererRequested(requests), false); assert.equal((await data(page)).heroQuality, 'poster'); assert.deepEqual(errors, []);
    pass('hardwareConcurrency 2 → poster, no WebGL chunk'); await context.close();
  }
  // Blocked storage: every load is a first visit, and the controls still work, with no exceptions.
  {
    const { context, page, errors } = await open(browser, {}, { init: () => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }) });
    await page.waitForFunction(() => Number(document.querySelector('.hero-art')?.dataset.heroT) > 3.2);
    await page.reload(); await phaseIs(page, ['build']); assert.equal((await data(page)).heroStart, 'build');
    await page.getByRole('button', { name: 'Pause animation' }).click(); await phaseIs(page, ['paused']);
    await page.getByRole('button', { name: 'Play animation' }).click(); await phaseIs(page, ['idle']);
    assert.deepEqual(errors, []);
    pass('blocked storage'); await context.close();
  }
}

async function accessibilityAndLayout(browser) {
  const axe = async (page, state) => {
    const result = await new AxeBuilder({ page }).include('.intro').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `axe: ${state}`);
  };
  for (const [label, options] of [['1440', DESKTOP], ['390', MOBILE]]) {
    const { context, page, errors } = await open(browser, options);
    await phaseIs(page, ['build']); await axe(page, `${label} build`);
    const buttons = page.locator('.hero-controls button');
    assert.equal(await buttons.count(), 2);
    for (const box of await buttons.evaluateAll(b => b.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }))) assert.ok(box[0] >= 44 && box[1] >= 44, `target ${box}`);
    assert.deepEqual(await buttons.evaluateAll(b => b.map(e => e.textContent.trim())), ['Pause animation', 'Replay']);
    // Visible focus: keyboard focus from the copy lands on the pause button with the site's 3 px outline.
    await page.locator('.intro h1').click(); await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => { const e = document.activeElement, c = getComputedStyle(e); return { name: e.textContent.trim(), visible: e.matches(':focus-visible'), outline: `${c.outlineStyle} ${c.outlineWidth}` }; });
    assert.deepEqual(focus, { name: 'Pause animation', visible: true, outline: 'solid 3px' });
    await page.keyboard.press('Enter'); await phaseIs(page, ['paused']); await axe(page, `${label} paused`);
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Play animation', 'focus stays on the toggle');
    // Nothing else in the art is focusable.
    assert.equal(await art(page).evaluate(e => [...e.querySelectorAll('a,button,input,select,textarea,[tabindex]')].filter(x => !x.closest('.hero-controls')).length), 0);
    assert.deepEqual(errors, []);
    pass(`axe, targets, names and focus at ${label}`, focus); await context.close();
  }
  // No horizontal overflow at any layout, with the canvas and controls in place.
  {
    const { context, page } = await open(browser);
    const widths = {};
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.reload(); await page.waitForFunction(() => document.querySelector('.hero-art')?.dataset.heroReady !== undefined);
      widths[width] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(widths[width][0] <= widths[width][1], `overflow at ${width}: ${widths[width]}`);
    }
    pass('no horizontal overflow', widths); await context.close();
  }
  // The art is inert: clicking it (away from the controls) navigates, toggles and focuses nothing.
  {
    const { context, page, errors } = await open(browser);
    await phaseIs(page, ['build']); await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'overview');
    const before = await page.evaluate(() => ({ url: location.href, scroll: scrollY, pressed: document.querySelector('.hero-controls button').getAttribute('aria-pressed'), mode: document.querySelector('.scene-host').dataset.mode, dialogs: document.querySelectorAll('[role=dialog]').length, active: document.activeElement.tagName }));
    const box = await art(page).boundingBox();
    for (const [fx, fy] of [[.5, .5], [.3, .35], [.7, .6], [.15, .8]]) {
      const x = box.x + box.width * fx, y = box.y + box.height * fy;
      assert.equal(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('a,button,input,select,[tabindex],[role=button]'), [x, y]), false);
      await page.mouse.click(x, y);
    }
    await sleep(300);
    const after = await page.evaluate(() => ({ url: location.href, scroll: scrollY, pressed: document.querySelector('.hero-controls button').getAttribute('aria-pressed'), mode: document.querySelector('.scene-host').dataset.mode, dialogs: document.querySelectorAll('[role=dialog]').length, active: document.activeElement.tagName }));
    assert.deepEqual(after, before); assert.equal((await data(page)).heroPhase, 'build'); assert.deepEqual(errors, []);
    pass('art is inert to clicks'); await context.close();
  }
  // The explorer is unaffected: its draw calls and triangles match a page whose hero renderer is blocked.
  {
    const stats = async block => {
      const context = await browser.newContext(DESKTOP), page = await context.newPage();
      if (block) await page.route(/\/renderer[-.][^/]*$/, r => r.abort());
      await page.goto(base); await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'overview' && document.querySelector('.scene-host').dataset.drawCalls);
      await page.waitForFunction(() => ['build', 'static'].includes(document.querySelector('.hero-art').dataset.heroPhase));
      await sleep(500);
      const s = await page.locator('.scene-host').evaluate(e => ({ drawCalls: e.dataset.drawCalls, triangles: e.dataset.triangles, phase: document.querySelector('.hero-art').dataset.heroPhase }));
      await context.close(); return s;
    };
    const withHero = await stats(false), without = await stats(true);
    assert.equal(withHero.phase, 'build'); assert.equal(without.phase, 'static');
    assert.deepEqual([withHero.drawCalls, withHero.triangles], [without.drawCalls, without.triangles]);
    pass('explorer draw calls and triangles unchanged by the hero', { drawCalls: +withHero.drawCalls, triangles: +withHero.triangles });
  }
}

// Frame intervals during the build (every display frame, from the page's own rAF log) under 4× CPU throttling.
async function buildFrames(browser, options) {
  const { context, page, errors } = await open(browser, options, { frames: true, throttle: 4 });
  await phaseIs(page, ['settled', 'idle'], 20000);
  const { phases, raf } = await page.evaluate(() => window.__hero);
  const from = phases.find(p => p.phase === 'build').time, to = phases.find(p => p.phase === 'settled').time;
  const intervals = []; for (let i = 1; i < raf.length; i++) if (raf[i - 1] >= from && raf[i] <= to) intervals.push(raf[i] - raf[i - 1]);
  assert.deepEqual(errors, []);
  const cadence = median(intervals); // the display clock: 16.7 ms at 60 Hz; Chrome drops to 33.3 ms on battery saver
  return { context, page, frames: intervals.length, dropped: intervals.filter(i => i > cadence * 1.5).length, p50: +median(intervals).toFixed(1), p95: +p95(intervals).toFixed(1), max: +Math.max(...intervals).toFixed(1), buildWallMs: Math.round(to - from) };
}
async function lcp(browser, url, throttle, runs = 5) {
  const times = [], tags = new Set();
  for (let i = 0; i < runs; i++) {
    const { context, page } = await open(browser, {}, { url, throttle });
    await page.waitForLoadState('load'); await sleep(1500);
    const entry = await page.evaluate(() => window.__hero.lcp); times.push(entry.time); tags.add(entry.tag);
    await context.close();
  }
  return { median: Math.round(median(times)), runs: times.map(Math.round), tags: [...tags] };
}
const gz = file => zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length / 1000;
function bundle(dir) {
  const assets = path.join(dir, 'assets'), files = fs.readdirSync(assets).filter(f => /\.(js|css)$/.test(f));
  return Object.fromEntries(files.map(f => [f, +gz(path.join(assets, f)).toFixed(2)]));
}

// The browser's own frame clock on an empty page: budgets measured against a 30 Hz clock (Chrome's battery
// throttling) cannot show 60 Hz headroom, so the report records which clock applied.
async function displayCadence(browser) {
  const context = await browser.newContext(), page = await context.newPage(); await page.goto('about:blank');
  const t = await page.evaluate(() => new Promise(done => { const t = []; const f = x => { t.push(x); if (t.length < 90) requestAnimationFrame(f); else done(t); }; requestAnimationFrame(f); }));
  await context.close(); return +median(t.slice(1).map((v, i) => v - t[i])).toFixed(1);
}
async function performance(browser) {
  const cadence = await displayCadence(browser); report.displayCadenceMs = cadence;
  pass('display clock', { cadenceMs: cadence, note: cadence > 20 ? 'throttled to 30 Hz (battery saver?): frame budgets are measured against a 30 Hz clock' : '60 Hz' });
  // Build-phase frame intervals, 4× CPU throttle.
  const wide = await buildFrames(browser, DESKTOP);
  assert.ok(wide.p95 < 34, `1440 build p95 ${wide.p95} ms`);
  pass('build frames at 1440, 4× CPU', (({ context, page, ...r }) => r)(wide));
  // Idle: ≤ 30 fps, and the hero's main-thread cost per idle frame (idle minus paused, same page, same throttle).
  {
    const { page, context } = wide, cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Performance.enable');
    await phaseIs(page, ['idle']); await sleep(500);
    const busy = async ms => { const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value])); const a = await m(), f = await frameCount(page); await sleep(ms); const b = await m(); return { task: (b.TaskDuration - a.TaskDuration) * 1000, frames: await frameCount(page) - f }; };
    const idle = await busy(3000);
    await page.getByRole('button', { name: 'Pause animation' }).click(); await phaseIs(page, ['paused']); await sleep(300);
    const paused = await busy(3000);
    const fps = idle.frames / 3, perFrame = (idle.task - paused.task) / idle.frames;
    assert.ok(fps <= 31 && fps >= 20, `idle ${fps} fps`); assert.equal(paused.frames, 0);
    pass('idle at 1440, 4× CPU', { fps: +fps.toFixed(1), mainThreadMsPerHeroFrame: +perFrame.toFixed(2), mainThreadMsPerSecondIdle: +(idle.task / 3).toFixed(1), mainThreadMsPerSecondPaused: +(paused.task / 3).toFixed(1) });
    await context.close();
  }
  const narrow = await buildFrames(browser, MOBILE);
  assert.ok(narrow.p95 < 50, `390 build p95 ${narrow.p95} ms`);
  pass('build frames at 390, 4× CPU', (({ context, page, ...r }) => r)(narrow)); await narrow.context.close();
  // LCP: the h1 stays the LCP element, within ~100 ms of the pre-hero build when one is given.
  for (const throttle of [undefined, 4]) {
    const now = await lcp(browser, base, throttle), result = { throttle: throttle ?? 1, current: now };
    assert.deepEqual(now.tags, ['h1'], JSON.stringify(now));
    if (baseline) { result.baseline = await lcp(browser, baseline, throttle); result.delta = now.median - result.baseline.median; assert.ok(result.delta <= 100, `LCP +${result.delta} ms`); }
    pass(`LCP at 1440, ${throttle ?? 1}× CPU`, result);
  }
  // Bundle: the hero renderer chunk, total growth over the pre-hero build, and one shared three chunk.
  const now = bundle('dist'), sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const renderer = Object.entries(now).find(([f]) => f.startsWith('renderer-')), three = Object.keys(now).filter(f => fs.readFileSync(path.join('dist/assets', f), 'utf8').includes('WebGLRenderer') && f.endsWith('.js'));
  assert.ok(renderer && renderer[1] <= 40, `renderer ${renderer}`); assert.equal(three.length, 1, `three in ${three}`);
  const result = { gzipKB: now, renderer: renderer[1], threeChunk: three[0] };
  if (baselineDist) { const before = bundle(baselineDist); result.baselineGzipKB = before; result.totalDeltaKB = +(sum(now) - sum(before)).toFixed(2); assert.ok(result.totalDeltaKB <= 40, `+${result.totalDeltaKB} kB`); }
  pass('bundle', result);
}

(async () => {
  const browser = await launch();
  try {
    // Budgets apply to the production build: only run them when TEST_URL serves this checkout's dist/.
    const served = await (await fetch(base)).text().catch(() => '');
    const production = fs.existsSync('dist/index.html') && served === fs.readFileSync('dist/index.html', 'utf8');
    await behaviour(browser);
    await accessibilityAndLayout(browser);
    if (process.env.HERO_PERF === '0') console.log('SKIP performance (HERO_PERF=0)');
    else if (!production) console.log(`SKIP performance and bundle: ${base} is not serving this checkout's dist/ (run npm run build and vite preview)`);
    else await performance(browser);
    fs.mkdirSync('.cache/qa', { recursive: true }); fs.writeFileSync('.cache/qa/hero.json', JSON.stringify(report, null, 1) + '\n');
    console.log(`PASS hero: ${report.checks.length} checks (report: .cache/qa/hero.json)`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
