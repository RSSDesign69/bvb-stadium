// Record the actual production UI; no reference footage or simulated frames.
// The only overlay is a pointer indicator, because headless video omits the system cursor.
const { chromium } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

// Generated place data and stand layout come from the app source, so scene clicks target real places.
async function loadSceneData() {
  const { createServer } = await import('vite');
  const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const [places, layout, camera, THREE] = await Promise.all([
      server.ssrLoadModule('/src/places/demo.ts'), server.ssrLoadModule('/src/stadium/layout.ts'),
      server.ssrLoadModule('/src/viewer/camera.ts'), import('three'),
    ]);
    return { ...places, ...layout, ...camera, THREE };
  } finally { await server.close(); }
}

// Mirrors StadiumEngine.focusBlock for the middle block that choosing a stand frames,
// then the orbit (OrbitControls: theta -= 2π·dx/height·rotateSpeed) and zoom-in commands applied after it.
const ROTATE_SPEED = .65, ZOOM_STEP = .85, MIN_DISTANCE = 150;
function framedPose({ DEMO, STANDS, world, THREE }, stand, angle, zooms) {
  const blocks = DEMO.blocks.filter(b => b.stand === stand), block = blocks[Math.floor(blocks.length / 2)];
  const target = new THREE.Vector3(...world(stand, block.center * .4, STANDS[stand].inner * .32, 8));
  const sphere = new THREE.Spherical().setFromVector3(new THREE.Vector3(...world(stand, block.center * .6, 170, 135)).sub(target));
  sphere.theta -= angle;
  for (let i = 0; i < zooms; i++) sphere.radius = Math.max(MIN_DISTANCE, sphere.radius * ZOOM_STEP);
  return { block, position: target.clone().add(new THREE.Vector3().setFromSpherical(sphere)), target };
}

(async () => {
  const data = await loadSceneData();
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, recordVideo: { dir: '.cache/demo', size: { width: 1440, height: 1050 } } });
  await context.addInitScript(() => addEventListener('DOMContentLoaded', () => {
    const pointer = document.createElement('div');
    pointer.setAttribute('aria-hidden', 'true');
    pointer.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2v23l6.5-6 4.2 9.3 4-1.8-4.1-9.2H21z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
    Object.assign(pointer.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' });
    document.body.append(pointer);
    addEventListener('mousemove', e => { pointer.style.left = `${e.clientX - 2}px`; pointer.style.top = `${e.clientY - 2}px`; }, true);
  }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const pause = (ms = 2400) => page.waitForTimeout(ms);
  const mode = value => page.waitForFunction(v => document.querySelector('.scene-host')?.dataset.mode === v, value, { timeout: 15000 });
  let cursor = { x: 720, y: 520 };
  const moveTo = async (x, y) => { await page.mouse.move(x, y, { steps: Math.max(8, Math.round(Math.hypot(x - cursor.x, y - cursor.y) / 18)) }); cursor = { x, y }; };
  const click = async locator => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await moveTo(box.x + box.width / 2, box.y + box.height / 2);
    await pause(250);
    await page.mouse.down(); await page.mouse.up();
  };
  const hover = async locator => { const box = await locator.boundingBox(); await moveTo(box.x + box.width / 2, box.y + box.height / 2); };
  const smoothScroll = async y => { await page.evaluate(top => window.scrollTo({ top, behavior: 'smooth' }), y); await pause(1200); };
  const standCard = name => page.locator('.stand-selector').getByRole('button', { name, exact: true });
  // Hover a generated place in the framed stand until the scene's own hover card confirms it, then click it.
  // Choosing a stand frames it from outside, so orbit round to face its places and zoom in, as the guide says.
  const ORBIT = Math.PI * .86, ZOOMS = 2;
  const orbitAndZoom = async () => {
    const box = await page.locator('.scene-host').boundingBox();
    const y = box.y + box.height * .42, x = box.x + box.width * .22, dx = ORBIT * box.height / (2 * Math.PI * ROTATE_SPEED);
    await moveTo(x, y); await pause(300);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 90 }); cursor = { x: x + dx, y };
    await page.mouse.up();
    await pause(900);
    for (let i = 0; i < ZOOMS; i++) { await click(page.getByRole('button', { name: 'Zoom in', exact: true })); await pause(600); }
    await pause(1200);
  };
  const clickScenePlace = async (stand, candidates) => {
    const { THREE, describePlace } = data, pose = framedPose(data, stand, ORBIT, ZOOMS);
    const box = await page.locator('.scene-host').boundingBox();
    const camera = new THREE.PerspectiveCamera(43, box.width / box.height, .08, 1200);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld();
    for (const place of candidates(pose.block)) {
      const v = new THREE.Vector3(place.position[0], place.position[1] + .54, place.position[2]).project(camera);
      const x = box.x + (v.x + 1) * box.width / 2, y = box.y + (1 - v.y) * box.height / 2;
      await moveTo(x, y);
      const matched = await page.waitForFunction(text => document.querySelector('.hover-card')?.textContent.includes(text), describePlace(place), { timeout: 700 }).then(() => true, () => false);
      if (!matched) continue;
      await pause(1600);
      await page.mouse.down(); await page.mouse.up();
      return place;
    }
    await page.screenshot({ path: '.cache/demo/failure.png' });
    throw new Error(`No clickable ${stand} place found in the framed view`);
  };
  const around = (list, index) => list.map((item, i) => [Math.abs(i - index), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
  try {
    // 1. Opening screen.
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
    await mode('overview');
    await moveTo(1100, 420);
    await pause(3000);
    // 2. Overview of the four stands and the roof cutaway.
    const frameTop = await page.locator('.workspace').evaluate(el => el.getBoundingClientRect().top + window.scrollY - 12);
    await smoothScroll(frameTop);
    await pause();
    const roof = page.getByLabel('Roof cutaway');
    await click(roof); await pause();
    await click(roof); await pause(1600);
    // 3. West stand: choose the stand, click a generated seat in the scene, then look around.
    await click(standCard('West stand'));
    await mode('overview'); await pause();
    await orbitAndZoom();
    const west = await clickScenePlace('west', block => {
      const rows = block.sections.find(s => s.tier === 'lower').rows.slice(8, 16);
      return rows.flatMap(row => around(row.places, Math.floor(row.places.length / 2)).slice(0, 4)).filter(p => p.availability === 'available');
    });
    await mode('preview');
    await pause();
    const turnLeft = page.getByRole('button', { name: 'Turn left', exact: true });
    await click(turnLeft); await pause(500); await click(turnLeft); await pause(1800);
    // Escape returns to the stadium view with the place still under review.
    await page.keyboard.press('Escape');
    await mode('overview');
    await pause();
    // 4. South stand: change stand, click a standing-area sample, preview it for two people and save it.
    await click(page.getByRole('button', { name: 'Change stand', exact: true }).first());
    await pause(1200);
    await click(standCard('South stand'));
    await mode('overview'); await pause();
    await orbitAndZoom();
    const south = await clickScenePlace('south', block => {
      const samples = block.sections[0].rows.flatMap(row => row.places);
      return around(samples, Math.floor(samples.length / 2)).filter(p => p.availability === 'available');
    });
    await mode('preview');
    await pause();
    const people = page.getByLabel('People');
    await hover(people); await pause(400); await people.selectOption('2'); await pause();
    await click(page.getByRole('button', { name: /Save viewpoint/ }));
    await page.locator('.saved-viewpoint-confirmation').waitFor();
    await pause(3000);
    // 5. Reset the stadium and return to the opening screen.
    await click(page.getByRole('button', { name: 'Reset stadium', exact: true }));
    await mode('overview'); await pause();
    await smoothScroll(0);
    await pause(2600);
    if (errors.length) throw new Error(errors.join('\n'));
    await context.close();
    await fs.mkdir('public/media', { recursive: true });
    await page.video().saveAs(path.resolve('public/media/terrace-atlas-demo.webm'));
    console.log(`Recorded public/media/terrace-atlas-demo.webm (${west.id}, ${south.id})`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
