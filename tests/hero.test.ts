import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { buildHeroStadium } from '../src/hero/heroStadium';
import { ENVELOPE, EXTENT_POINTS, fitView, HERO_VIEW, plinthFaces, PYLONS, ROOF_LIFT_MAX, SLOT_ASPECT, toSlot, viewBasis, WALL_HEIGHT } from '../src/hero/framing';
import { BUILD, buildState, crowdRise, IDLE, mastHeight, pylonProgress, STATIC_T, stayReach, stripeReveal, tierProgress } from '../src/hero/timeline';

// Instance counts per part; a change here means the hero geometry recipe changed.
const EXPECTED = { pitch: 15, markings: 47, tiers: 8266, crowd: 337, facade: 466, roof: 48, truss: 152, pylons: 24 };

test('hero stadium has stable parts, eight pylons and bounded build metadata', () => {
  const hero = buildHeroStadium();
  try {
    const counts = Object.fromEntries(Object.entries(hero.parts).map(([name, part]) => [name, part.count]));
    assert.deepEqual(counts, EXPECTED);
    assert.equal(PYLONS.length, 8);
    const masts = hero.parts.pylons.mesh; const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    let tall = 0; for (let i = 0; i < masts.count; i++) { masts.getMatrixAt(i, m); m.decompose(p, q, s); if (s.y > 60 && Math.abs(q.x) + Math.abs(q.z) < 1e-6) tall++; }
    assert.equal(tall, 8, 'eight vertical pylon masts');
    for (const [name, part] of Object.entries(hero.parts)) {
      assert.equal(part.build.length, part.count * 3, name);
      for (let i = 0; i < part.build.length; i += 3) {
        const [u, rho, stand] = part.build.subarray(i, i + 3);
        assert.ok(u >= 0 && u <= 1 && rho >= 0 && rho <= 1, `${name}[${i / 3}] u=${u} rho=${rho}`);
        assert.ok(Number.isInteger(stand) && stand >= 0 && stand <= 6, `${name}[${i / 3}] stand=${stand}`);
      }
      assert.ok(part.mesh.instanceMatrix.array.every(Number.isFinite), `${name}: finite matrices`);
    }
    // The wave runs South → North: the Südtribüne's front row starts first, the North stand last.
    const t = hero.parts.tiers.build; let south = 1, north = 0;
    for (let i = 0; i < t.length; i += 3) { if (t[i + 2] === 0) south = Math.min(south, t[i]); if (t[i + 2] === 2) north = Math.max(north, t[i]); }
    assert.ok(south < .1 && north > .9, `south u ${south}, north u ${north}`);
    // BUILD.tiers.lead is where the wave begins: the Südtribüne's front row (rho 0) must sit there.
    let lead = 1; for (let i = 0; i < t.length; i += 3) if (t[i + 2] === 0 && t[i + 1] === 0) lead = Math.min(lead, t[i]);
    assert.ok(Math.abs(lead - BUILD.tiers.lead) < .03, `South front row u ${lead}, BUILD.tiers.lead ${BUILD.tiers.lead}`);
    assert.ok(hero.stats.drawCalls <= 60 && hero.stats.triangles <= 150000, JSON.stringify(hero.stats));
    console.log(`Hero stadium: ${hero.stats.drawCalls} draw calls, ${hero.stats.triangles} triangles, ${hero.stats.instances} instances, built in ${hero.stats.buildMs.toFixed(1)} ms (Node).`);
  } finally { hero.dispose(); }
});

test('settled hero, with the roof fully lifted, stays inside the padded frame at both slot shapes', () => {
  const hero = buildHeroStadium();
  try {
    hero.roof.position.y = ROOF_LIFT_MAX; hero.group.updateMatrixWorld(true);
    const points: THREE.Vector3[] = [], corner = new THREE.Vector3(), m = new THREE.Matrix4();
    hero.group.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const geometry = o.geometry as THREE.BufferGeometry, position = geometry.getAttribute('position');
      const count = o instanceof THREE.InstancedMesh ? o.count : 1;
      for (let i = 0; i < count; i++) {
        if (o instanceof THREE.InstancedMesh) o.getMatrixAt(i, m).premultiply(o.matrixWorld); else m.copy(o.matrixWorld);
        for (let v = 0; v < position.count; v++) { corner.fromBufferAttribute(position, v).applyMatrix4(m); assert.ok(Number.isFinite(corner.x + corner.y + corner.z), o.name); points.push(corner.clone()); }
      }
    });
    const box = new THREE.Box3().setFromPoints(points);
    assert.ok(box.min.x >= -105.01 && box.max.x <= 105.01 && box.min.z >= -126.01 && box.max.z <= 126.01, 'within the plinth footprint');
    assert.ok(box.min.y >= -5.01 && box.max.y <= 63.5, `height ${box.min.y}–${box.max.y}`);
    // Every idle camera pose (sway plus parallax at full deflection, and the neutral pose) keeps the padding.
    const { azimuth: az, elevation: el, motion } = HERO_VIEW;
    const poses = [viewBasis(), ...[-1, 1].flatMap(sa => [-1, 0, 1].map(se => viewBasis(az + sa * motion.azimuth, el + se * motion.elevation)))];
    for (const aspect of [SLOT_ASPECT.wide, SLOT_ASPECT.stacked]) {
      const fit = fitView(aspect), pad = HERO_VIEW.padding - 1e-9;
      for (const basis of poses) for (const point of points) {
        const [x, y] = toSlot([point.x, point.y, point.z], fit, basis);
        assert.ok(x >= pad && x <= 1 - pad && y >= pad && y <= 1 - pad, `${point.toArray().map(n => n.toFixed(1))} → ${x.toFixed(3)}, ${y.toFixed(3)} at ${aspect}`);
      }
      // The frame is tight: across the idle envelope, some extent point touches the padding on at least one axis.
      const slot = ENVELOPE.flatMap(basis => EXTENT_POINTS.map(e => toSlot(e, fit, basis)));
      assert.ok(slot.some(([x, y]) => Math.abs(x - HERO_VIEW.padding) < 1e-6 || Math.abs(y - HERO_VIEW.padding) < 1e-6));
      const { top, sides } = plinthFaces(fit);
      assert.equal(top.length, 4); assert.equal(sides.length, 2);
    }
  } finally { hero.dispose(); }
});

test('hero geometry never pulls in the place dataset or the explorer model', () => {
  const seen = new Set<string>(), queue = [resolve('src/hero/heroStadium.ts')];
  while (queue.length) {
    const file = queue.pop()!; if (seen.has(file)) continue; seen.add(file);
    const source = readFileSync(file, 'utf8');
    // Type-only imports are erased at build time and cannot load modules.
    for (const [, spec] of source.matchAll(/^import\s+(?!type\b)[^'"]*from\s+'([^']+)'/gm)) {
      if (!spec.startsWith('.')) continue;
      queue.push(resolve(dirname(file), spec.endsWith('.ts') ? spec : `${spec}.ts`));
    }
  }
  const local = [...seen].map(f => f.slice(resolve('.').length + 1)).sort();
  assert.deepEqual(local, ['src/hero/framing.ts', 'src/hero/heroStadium.ts', 'src/stadium/layout.ts']);
  assert.ok(!local.some(f => /places\/demo|stadium\/model/.test(f)));
});

test('build timeline is bounded, continuous and hits its beats', () => {
  const keys = ['pitch', 'markings', 'facade', 'roofOffset', 'roofOpacity', 'streakLength', 'streakOpacity', 'pulse', 'ringRadius', 'ringOpacity', 'sway', 'parallax', 'underline'] as const;
  const at = (t: number) => buildState(t), dt = 1e-3;
  // Continuity: no scalar jumps by more than its steepest designed slope allows in 1 ms (no pops).
  let previous = at(0);
  for (let t = dt; t <= 12; t += dt) {
    const s = at(t);
    for (const k of keys) {
      assert.ok(Number.isFinite(s[k]), `${k} at ${t}`);
      const scale = k === 'roofOffset' || k === 'streakLength' || k === 'ringRadius' ? 60 : 1;
      assert.ok(Math.abs(s[k] - previous[k]) <= .02 * scale, `${k} jumps at t=${t.toFixed(3)}: ${previous[k]} → ${s[k]}`);
    }
    for (const k of ['pitch', 'markings', 'facade', 'roofOpacity', 'streakOpacity', 'pulse', 'ringOpacity', 'parallax', 'underline'] as const) assert.ok(s[k] >= 0 && s[k] <= 1, `${k} bounded at ${t}`);
    // The glint only wraps while it is off the mast (≥ 3 widths clear), so it never pops.
    if (Math.abs(s.glint - previous.glint) > .02) assert.ok([s.glint, previous.glint].every(g => g < -3 * IDLE.glint.width || g > 1 + 3 * IDLE.glint.width), `glint wraps on the mast at ${t}`);
    previous = s;
  }
  // Beats: plinth only at 0; everything settled by 6.5; accents gone by 7.4.
  const zero = at(0);
  assert.deepEqual([zero.pitch, zero.markings, zero.facade, zero.roofOpacity, zero.pulse, zero.ringOpacity], [0, 0, 0, 0, 0, 0]);
  assert.equal(stripeReveal(at(BUILD.markings.start).pitch, 13 / 14), 1, 'every stripe is down before the markings');
  assert.equal(at(4.6).facade, 1); assert.equal(at(4.6).roofOpacity, 0);
  assert.ok(at(4.9).roofOpacity > .3 && at(4.9).roofOpacity < 1 && at(4.9).roofOffset > WALL_HEIGHT * .3, 'roof is a ghost above the façade at 4.9 s');
  assert.equal(at(5.8).roofOpacity, 1); assert.ok(Math.abs(at(5.8).roofOffset - BUILD.roof.rest * WALL_HEIGHT) < 1e-9);
  assert.equal(at(BUILD.settled).phase, 'settled'); assert.equal(at(BUILD.settled - dt).phase, 'build');
  for (const u of [0, .5, 1]) { assert.equal(mastHeight(pylonProgress(BUILD.settled, u)), 1); assert.equal(stayReach(pylonProgress(BUILD.settled, u)), 1); assert.equal(pylonProgress(BUILD.pylons.start, u), 0); }
  assert.ok(BUILD.pylons.start < BUILD.roof.end, 'pylons overlap the roof landing: no dead beat');
  assert.equal(tierProgress(BUILD.facade.end, 1, 1), 1, 'last tier lands before the façade completes');
  const peak = Array.from({ length: 1001 }, (_, i) => 5.8 + i * .001).reduce((a, t) => at(t).pulse > at(a).pulse ? t : a, 5.8);
  assert.ok(peak >= 6.2 && peak <= 6.3 && at(peak).pulse === 1, `pulse peaks at ${peak}`);
  assert.equal(at(BUILD.end).ringOpacity, 0); assert.equal(at(BUILD.end).pulse, 0);
  // The wave leads from the Südtribüne: at 1.5 s its front row is up while the North stand has not started.
  assert.equal(tierProgress(1.5, 0, 0), 1); assert.equal(tierProgress(1.5, 1, 0), 0);
  // Front-loaded: the first tiers leave the plinth as the pitch wipe ends, not a beat later.
  assert.equal(tierProgress(BUILD.tiers.start, BUILD.tiers.lead, 0), 0); assert.ok(tierProgress(.7, BUILD.tiers.lead, 0) > .5);
});

test('timeline is finite over a minute, monotone where designed, and its phases end exactly on 0 and 1', () => {
  const at = (t: number) => buildState(t), dt = 1e-3;
  // One-way properties: reveals only grow, the roof only descends during the build, the ring only expands.
  const rising = ['pitch', 'markings', 'facade', 'roofOpacity', 'parallax', 'underline'] as const;
  let previous = at(0);
  for (let t = dt; t <= 60; t += dt) {
    const s = at(t);
    for (const [k, v] of Object.entries(s)) if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} at ${t}`);
    for (const k of rising) assert.ok(s[k] >= previous[k], `${k} falls at t=${t.toFixed(3)}`);
    if (t <= IDLE.start) assert.ok(s.roofOffset <= previous.roofOffset + 1e-12, `roof rises during the build at ${t}`);
    if (t > BUILD.ring.start && t <= BUILD.ring.end) assert.ok(s.ringRadius >= previous.ringRadius, `ring shrinks at ${t}`);
    if (t >= IDLE.start) assert.ok(s.roofOffset >= .10 * WALL_HEIGHT - 1e-9 && s.roofOffset <= .26 * WALL_HEIGHT + 1e-9, `idle lift at ${t}`);
    previous = s;
  }
  for (const u of [0, .25, .5, .75, 1]) for (const rho of [0, .5, 1]) {
    let p = 0; for (let t = 0; t <= 8; t += .01) { const k = tierProgress(t, u, rho); assert.ok(k >= p, `tier (${u}, ${rho}) falls at ${t}`); p = k; }
    for (let t = 0, p = 0; t <= 8; t += .01) { const k = pylonProgress(t, u); assert.ok(k >= p); p = k; }
  }
  // Each phase starts on exactly 0 and ends on exactly 1 (or back at exactly 0 for the accents).
  const { pitch, markings, facade, roof, accent, ring } = BUILD, { parallax, underline } = IDLE;
  const ends: [keyof ReturnType<typeof at>, number, number][] = [['pitch', pitch.start, pitch.end], ['markings', markings.start, markings.end], ['facade', facade.start, facade.end],
    ['roofOpacity', roof.start, roof.start + roof.fade * (roof.end - roof.start)], ['parallax', parallax.from, parallax.to], ['underline', underline.start, underline.end]];
  for (const [k, a, b] of ends) { assert.equal(at(a)[k], 0, `${k} at ${a}`); assert.equal(at(b)[k], 1, `${k} at ${b}`); assert.equal(at(b + 10)[k], 1, `${k} stays at 1`); }
  assert.equal(at(accent.start).pulse, 0); assert.equal(at(accent.peak).pulse, 1); assert.equal(at(accent.end).pulse, 0);
  assert.equal(at(ring.start).ringOpacity, 0); assert.equal(at(ring.end).ringOpacity, 0); assert.equal(at(ring.end).ringRadius, ring.to);
  assert.equal(at(roof.end).streakOpacity, 0); assert.equal(at(roof.start).streakOpacity, 0);
  assert.equal(tierProgress(BUILD.tiers.start, 0, 0), 0); assert.equal(tierProgress(BUILD.facade.start + BUILD.tiers.rise, 1, 1), 1);
  // Idle takes over at 6.5 s with every scalar continuous (the values either side agree).
  const e = 1e-6, before = at(IDLE.start - e), after = at(IDLE.start + e);
  for (const [k, v] of Object.entries(before)) if (typeof v === 'number' && k !== 't') assert.ok(Math.abs(v - (after[k as keyof typeof after] as number)) < 1e-3, `${k} jumps at 6.5 s: ${v} → ${after[k as keyof typeof after]}`);
});

test('idle continues the build without a jump and never visibly loops', () => {
  const at = (t: number) => buildState(t), e = 1e-4, { start } = IDLE;
  // Continuity and zero velocity at 6.5 s for the roof lift and the camera sway.
  for (const k of ['roofOffset', 'sway'] as const) {
    assert.ok(Math.abs(at(start + e)[k] - at(start - e)[k]) < 1e-6, `${k} continuous at 6.5`);
    const v0 = (at(start - e)[k] - at(start - 2 * e)[k]) / e, v1 = (at(start + 2 * e)[k] - at(start + e)[k]) / e;
    assert.ok(Math.abs(v0) < 1e-3 && Math.abs(v1) < 1e-3, `${k} leaves 6.5 s at rest (${v0}, ${v1})`);
  }
  // Ranges: roof .10–.26 × wall above rest, sway within ±4°, and sway plus parallax inside the framed envelope.
  let lo = Infinity, hi = -Infinity, sway = 0;
  for (let t = start; t < start + 400; t += .01) { const s = at(t); lo = Math.min(lo, s.roofOffset); hi = Math.max(hi, s.roofOffset); sway = Math.max(sway, Math.abs(s.sway)); }
  assert.ok(Math.abs(lo - .10 * WALL_HEIGHT) < 1e-3 && Math.abs(hi - .26 * WALL_HEIGHT) < 1e-3, `roof lift ${lo}–${hi}`);
  assert.ok(sway <= IDLE.sway.azimuth + 1e-9 && sway > IDLE.sway.azimuth * .99);
  assert.ok(IDLE.sway.azimuth + IDLE.parallax.azimuth <= HERO_VIEW.motion.azimuth + 1e-9 && IDLE.parallax.elevation <= HERO_VIEW.motion.elevation + 1e-9);
  // No loop within 60 s: for every candidate period, the (lift, sway) pair drifts by a visible amount.
  for (let d = 1; d <= 60; d += .05) {
    let worst = 0;
    for (let t = start + 6; t < start + 66; t += .25) { const a = at(t), b = at(t + d); worst = Math.max(worst, Math.abs(a.roofOffset - b.roofOffset) / WALL_HEIGHT / .16 + Math.abs(a.sway - b.sway) / (2 * IDLE.sway.azimuth)); }
    assert.ok(worst > .2, `idle repeats after ${d.toFixed(2)} s`);
  }
  // Parallax is shut during the build and fully open after 7 s; the underline sweeps 5.9 → 6.6 s.
  assert.equal(at(6).parallax, 0); assert.equal(at(7).parallax, 1);
  assert.equal(at(5.9).underline, 0); assert.equal(at(6.6).underline, 1); assert.ok(at(6.25).underline > 0 && at(6.25).underline < 1);
  // The crowd stands up after 6.0 s and is complete by 7 s.
  assert.equal(crowdRise(6, 0), 0); assert.equal(crowdRise(7, 1), 1);
  // The still pose sits on the idle curve: mid-lift, no sway, glint off the masts, accents over, underline present.
  const still = at(STATIC_T);
  assert.ok(Math.abs(still.roofOffset - .18 * WALL_HEIGHT) < 1e-9 && Math.abs(still.sway) < 1e-9 && (still.glint < -3 * IDLE.glint.width || still.glint > 1 + 3 * IDLE.glint.width), JSON.stringify(still));
  assert.deepEqual([still.phase, still.pulse, still.ringOpacity, still.underline, still.parallax], ['idle', 0, 0, 1, 1]);
  // A shifted accent (session-skip) plays the pulse and ring once more.
  const shifted = (t: number) => buildState(t, STATIC_T + .2);
  assert.equal(shifted(STATIC_T).pulse, 0); assert.equal(shifted(STATIC_T + .45).pulse, 1); assert.equal(shifted(STATIC_T + 1.6).ringOpacity, 0);
});
