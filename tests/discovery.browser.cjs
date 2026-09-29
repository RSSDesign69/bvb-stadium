const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:5178';

(async () => {
  const browser = await chromium.launch({channel: process.env.TEST_BROWSER || 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist']});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'overview');
  const panel = page.getByRole('complementary', {name: 'Place explorer'});
  const stage = number => expect(panel).toHaveAttribute('data-stage', String(number));
  const chooseStand = async name => {
    const change = page.getByRole('button', {name: 'Change stand', exact: true});
    if (await change.isVisible().catch(() => false)) await change.click();
    await page.locator('.stand-selector').getByRole('button', {name, exact: true}).click();
  };
  // Places are chosen in the scene: hover the place nearest a low/middle/high sample (or in a given row) until
  // the hover card names it, then click, which opens its preview. The camera mirrors engine.focusBlock for the
  // stand's middle block, the framing a stand choice applies. Candidates need a demo group for `people`,
  // or must be unavailable when `unavailable` is set.
  const pickInScene = async (stand, {level = 'middle', row = null, people = 1, unavailable = false} = {}) => {
    await page.locator('.scene-frame').scrollIntoViewIfNeeded();
    const candidates = await page.evaluate(async ({stand, level, row, people, unavailable}) => {
      const {DEMO, describePlace, samplePlace} = await import('/src/places/demo.ts');
      const {STANDS, world} = await import('/src/stadium/layout.ts');
      const {demoGroup} = await import('/src/commerce/demo/discovery.ts');
      const T = await import('/node_modules/three/build/three.module.js');
      const box = document.querySelector('.scene-host').getBoundingClientRect();
      const blocks = DEMO.blocks.filter(b => b.stand === stand), block = blocks[Math.floor(blocks.length / 2)], sample = samplePlace(block, level);
      const camera = new T.PerspectiveCamera(43, box.width / box.height, .08, 1200);
      camera.position.set(...world(stand, block.center * .6, 170, 135));
      camera.lookAt(...world(stand, block.center * .4, STANDS[stand].inner * .32, 8));
      camera.updateMatrixWorld();
      return DEMO.places
        .filter(p => p.stand === stand && (!row || p.rowId === row) && (unavailable ? p.availability === 'unavailable' : demoGroup(p, people)))
        .map(p => ({p, d: Math.hypot(...p.eye.map((v, i) => v - sample.eye[i]))})).sort((a, b) => a.d - b.d)
        .map(({p}) => {
          const v = new T.Vector3(p.position[0], p.position[1] + .54, p.position[2]).project(camera);
          return {id: p.id, label: `${STANDS[stand].name}${describePlace(p)}Click`, x: box.x + (v.x + 1) * box.width / 2, y: box.y + (1 - v.y) * box.height / 2};
        })
        .filter(c => c.x > box.left + 8 && c.x < box.right - 8 && c.y > box.top + 8 && c.y < box.bottom - 8).slice(0, 30);
    }, {stand, level, row, people, unavailable});
    for (const c of candidates) {
      await page.mouse.move(c.x, c.y);
      const named = await page.waitForFunction(label => document.querySelector('.hover-card')?.textContent.startsWith(label), c.label, {timeout: 1000}).then(() => true, () => false);
      if (!named) continue;
      await page.mouse.click(c.x, c.y);
      await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'preview');
      await stage(4);
      await expect(page.locator('.place-id')).toHaveText(c.id);
      return c.id;
    }
    throw new Error(`No pickable ${level} place in the ${stand} stand`);
  };
  // A scene choice opens its preview; Escape returns to the review of that place.
  const review = async () => {
    await page.locator('.scene-frame').press('Escape');
    await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'overview');
    await stage(3);
  };
  const preview = async () => {
    await page.getByRole('button', {name: 'Preview this view'}).click();
    await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'preview');
    await stage(4);
  };
  await stage(1);
  await expect(page.locator('.discovery-filters')).toBeHidden();
  await expect(page.locator('.representative-views')).toHaveCount(0);
  await chooseStand('West stand');
  await stage(2);
  await expect(page.locator('.scene-selection-guide')).toBeVisible();
  await expect(page.locator('.result-pages')).toBeHidden();
  await expect(page.locator('.place-fields')).toBeHidden();
  const novicePlace = await pickInScene('west');
  await review();
  await expect(page.locator('.selected-details')).not.toContainText('Demo price');
  await expect(page.locator('.discovery-filters')).toBeHidden();
  await preview();
  await page.locator('.scene-frame').press('Escape');
  await stage(3);
  await expect(page.getByRole('button', {name: 'Preview this view'})).toBeFocused();
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  await expect(panel.getByRole('heading', {level: 3})).toBeFocused();
  // Choosing the same place again keeps one canonical selection.
  assert.equal(await pickInScene('west'), novicePlace);
  await review();
  await page.getByRole('button', {name: 'Change stand', exact: true}).click();
  await stage(1);
  await chooseStand('South stand');
  await stage(2);
  assert.ok((await page.locator('.orientation .mini-map').getAttribute('aria-label')).includes('Filtered to South stand'));
  await pickInScene('south');
  await review();
  assert.match(await page.locator('.selected-details').textContent(), /Standing area · unassigned/);
  const tickets = page.locator('.ticket-context');
  await tickets.getByLabel('People', {exact: true}).selectOption('3');
  await expect(tickets).toContainText('Illustrative total€60');
  await preview();
  await expect(page.getByRole('button', {name: 'Preview this view'})).toHaveCount(0);
  await page.getByRole('button', {name: /Save viewpoint/}).click();
  await expect(page.getByRole('button', {name: 'Remove saved viewpoint'})).toHaveCount(1);
  assert.match(await page.locator('.saved-viewpoint-confirmation').textContent(), /3 people/);
  assert.match(await page.locator('.saved-viewpoint-confirmation').textContent(), /standing-area sample/);
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  await chooseStand('West stand');
  await stage(2);
  await pickInScene('west', {unavailable: true});
  assert.equal(await page.getByRole('button', {name: /Save viewpoint/}).isDisabled(), true);
  assert.match(await page.locator('.unavailable-note').textContent(), /unavailable in the demo/);
  await page.getByRole('button', {name: 'Show available alternative'}).click();
  await stage(3);
  await expect(page.locator('.unavailable-note')).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Preview this view'})).toBeEnabled();
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  // The alternative framed its own block; choosing the stand again frames the middle block.
  await chooseStand('West stand');
  await stage(2);
  const savedId = await pickInScene('west', {people: 4});
  await tickets.getByLabel('People', {exact: true}).selectOption('4');
  await page.getByRole('button', {name: /Save viewpoint/}).click();
  assert.match(await page.locator('.saved-viewpoint-confirmation').textContent(), /4 people/);
  assert.match(await page.locator('.saved-viewpoint-confirmation').textContent(), /viewing location in the model/);
  // An exact place: a specific upper-tier row in block 04, chosen directly in the scene.
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  const exactPlace = await pickInScene('west', {level: 'high', row: 'DEMO-WEST-04-UPPER-R11'});
  assert.match(exactPlace, /^DEMO-WEST-04-UPPER-R11-S\d+$/);
  await review();
  await expect(page.locator('.place-id')).toHaveText(exactPlace);
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  await chooseStand('South stand');
  await stage(2);
  // The saved viewpoint is independent of the current selection: it can be reopened, then removed.
  const saved = page.locator('.saved-viewpoint-confirmation');
  await expect(saved).toContainText('4 people · West stand');
  await saved.getByRole('button', {name: /4 people/}).click();
  await page.waitForFunction(() => document.querySelector('.scene-host')?.dataset.mode === 'preview');
  await stage(4);
  await expect(page.locator('.place-id')).toHaveText(savedId);
  await expect(tickets.getByLabel('People', {exact: true})).toHaveValue('4');
  await expect(page.getByRole('button', {name: /Save viewpoint/})).toHaveCount(0);
  await page.getByRole('button', {name: 'Remove saved viewpoint'}).click();
  await expect(saved).toHaveCount(0);
  await expect(page.locator('.discovery-notice')).toContainText('Saved viewpoint removed');
  await page.getByRole('button', {name: 'Change place', exact: true}).click();
  await stage(2);
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await chooseStand('West stand');
  await stage(2);
  const recovered = await pickInScene('west', {level: 'low'});
  await page.locator('.scene-host canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true})));
  await expect(page.getByRole('alert')).toContainText('3D graphics paused');
  await stage(3);
  await expect(page.locator('.place-id')).toHaveText(recovered);
  await expect(page.getByRole('button', {name: 'Preview this view'})).toBeDisabled();
  await page.getByRole('button', {name: 'Retry 3D'}).click();
  await expect(page.getByRole('button', {name: 'Preview this view'})).toBeEnabled();
  await preview();
  await expect(page.locator('.place-id')).toHaveText(recovered);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS four-stage flow with scene picking, Back/Edit focus, ticket quantity, exact place, unavailable state and alternative, saved viewpoint reopen/remove, mobile preview, WebGL recovery');
})().catch(error => { console.error(error); process.exit(1); });
