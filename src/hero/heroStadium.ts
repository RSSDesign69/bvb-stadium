import * as THREE from 'three';
import { STANDS, STAND_ORDER, inTunnel, rowDepth, rowFloor, tiers, world } from '../stadium/layout';
import { BOWL, PLINTH, PLINTH_COLORS, PYLON, PYLONS, ROOF_Y, SCREEN_RIGHT, WALL_HEIGHT, type P3 } from './framing';

// Lightweight hero diorama. Recipes follow src/stadium/model.ts (tiers, tunnels, aisle steps, radial
// corners, façade, roof, trusses, pylons) but it never touches the place dataset, and the bowl is
// closed by a rounded outer wall (see BOWL in framing.ts). Every tier row is a solid column from the
// plinth surface to its tread, so the build reads as mass rising and nothing floats over the plinth.
type Stand = (typeof STAND_ORDER)[number];
export const STAND_CODE = { south: 0, west: 1, north: 2, east: 3, corner: 4, pitch: 5, pylon: 6 } as const;
export type HeroPartName = 'pitch' | 'markings' | 'tiers' | 'crowd' | 'facade' | 'roof' | 'truss' | 'pylons';
export const HERO_PALETTE = {
  concrete: 0x6c736f, terrace: 0xb0931c, seatYellow: 0xe0b912, seatDark: 0x4f5652, southA: 0xf6c900, southB: 0xd9b20f,
  step: 0xf6c900, dark: 0x151d21, lip: 0x505955, glass: 0x3f5352, wall: 0x465758, mullion: 0x8d9795,
  roof: 0x9fa6a1, steel: 0x858d8a, light: 0xe5eadd, pylon: 0xf6c900, pitchA: 0x316e3e, pitchB: 0x2b6338, line: 0xf1f2d5, // pitch lit to ≈ the animatic's #387d47
  // Supporters: dark and warm cream with yellow scarves. Pure white flecks read as noise on the terrace (Task 6).
  crowd: [0xe9dfbd, 0x151d21, 0xffd900],
};
// Idle crowd flecks on the Südtribüne's front half (the animatic's crowd), placed by a seeded generator.
export const CROWD = { seed: 0x09b, rows: 30, pitch: 1.7, density: .3, size: [1, 1.25, .5] as P3, mix: [.3, .45] };
const mulberry32 = (seed: number) => () => {
  seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const BAND_ROWS = 5, AISLE = 1.3, ROOF_OPENING = 25; // roof inner edge, metres behind each stand's front row
// Deepest row across the whole bowl (lower and upper tiers combined) normalizes rho.
export const BOWL_DEPTH = Math.max(...STAND_ORDER.flatMap(s => tiers(s).map(t => t.offset + (t.rows - 1) * t.depth)));

// Per instance, `aBuild` = (u, rho, stand): u is 0 at the South end and 1 at the North end (from
// world Z), rho is the normalized distance from the pitch. Parts share the same attribute layout.
export interface HeroPart { mesh: THREE.InstancedMesh; build: Float32Array; count: number }
interface Batch { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: number[]; colors: number[]; meta: number[]; extra?: number[] }

export function buildHeroStadium() {
  const started = performance.now();
  const group = new THREE.Group(); group.name = 'Hero stadium';
  const roofGroup = new THREE.Group(); roofGroup.name = 'Hero roof'; group.add(roofGroup);
  const box = new THREE.BoxGeometry(1, 1, 1), rod = new THREE.CylinderGeometry(1, 1, 1, 6), standing = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const matte = () => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const batch = (geometry: THREE.BufferGeometry, material: THREE.Material): Batch => ({ geometry, material, matrices: [], colors: [], meta: [] });
  const B: Record<HeroPartName, Batch> = {
    pitch: batch(box, matte()), markings: batch(box, new THREE.MeshBasicMaterial({ color: HERO_PALETTE.line })),
    tiers: batch(box, matte()), crowd: { ...batch(standing, matte()), extra: [] }, facade: batch(box, matte()),
    roof: batch(box, matte()), truss: batch(rod, matte()),
    pylons: batch(rod, new THREE.MeshStandardMaterial({ roughness: .62, metalness: 0 })),
  };
  const dummy = new THREE.Object3D(), color = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), d = new THREE.Vector3();
  // uz is the world Z that sets the instance's u: parts that sit on a column reuse the column's Z.
  const push = (b: Batch, hex: number, uz: number, rho: number, stand: number) => {
    dummy.updateMatrix(); b.matrices.push(...dummy.matrix.elements);
    color.setHex(hex); b.colors.push(color.r, color.g, color.b); b.meta.push(uz, Math.min(1, Math.max(0, rho)), stand);
  };
  const cube = (b: Batch, [x, y, z]: P3, [w, h, dd]: P3, hex: number, yaw: number, uz: number, rho: number, stand: number) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(w, h, dd); push(b, hex, uz, rho, stand);
  };
  const beam = (b: Batch, p: P3, q: P3, r: number, hex: number, uz: number, rho: number, stand: number) => {
    a.set(...p); d.set(...q).sub(a);
    dummy.position.copy(a).addScaledVector(d, .5); dummy.quaternion.setFromUnitVectors(Y, d.clone().normalize()); dummy.scale.set(r, d.length(), r);
    push(b, hex, uz, rho, stand);
  };

  // Pitch surround, 14 stripes and markings (model.ts dimensions). Stripes' u gives the far → near wipe.
  // The surround takes the u of its South edge, so it lays down with the first (farthest) stripe.
  cube(B.pitch, [0, .05, 0], [85, .1, 122], HERO_PALETTE.dark, 0, 61, 0, STAND_CODE.pitch);
  for (let i = 0; i < 14; i++) { const z = -52.5 + 3.75 + i * 7.5; cube(B.pitch, [0, .15, z], [68, .1, 7.5], i % 2 ? HERO_PALETTE.pitchA : HERO_PALETTE.pitchB, 0, z, 0, STAND_CODE.pitch); }
  const LW = .45, LY = .21;
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    cube(B.markings, [(x0 + x1) / 2, LY, (z0 + z1) / 2], [len + LW, .02, LW], HERO_PALETTE.line, Math.atan2(z0 - z1, x1 - x0), (z0 + z1) / 2, 0, STAND_CODE.pitch);
  };
  line(-34, -52.5, 34, -52.5); line(-34, 52.5, 34, 52.5); line(-34, -52.5, -34, 52.5); line(34, -52.5, 34, 52.5); line(-34, 0, 34, 0);
  for (let i = 0; i < 24; i++) { const t0 = i / 24 * Math.PI * 2, t1 = (i + 1) / 24 * Math.PI * 2; line(Math.cos(t0) * 9.15, Math.sin(t0) * 9.15, Math.cos(t1) * 9.15, Math.sin(t1) * 9.15); }
  for (const sign of [-1, 1]) {
    for (const [hw, depth] of [[20.16, 16.5], [9.16, 5.5]]) { const z0 = sign * 52.5, z1 = sign * (52.5 - depth); line(-hw, z0, -hw, z1); line(-hw, z1, hw, z1); line(hw, z1, hw, z0); }
    const z = sign * 52.7;
    for (const x of [-3.66, 3.66]) cube(B.markings, [x, 1.22, z], [.3, 2.44, .3], HERO_PALETTE.line, 0, z, 0, STAND_CODE.pitch);
    cube(B.markings, [0, 2.44, z], [7.62, .3, .3], HERO_PALETTE.line, 0, z, 0, STAND_CODE.pitch);
  }

  // Stands: per row, each block splits into two halves (and around the vomitory on the front rows),
  // so u varies smoothly along the long stands. Seat bands sit on each column, clear of the aisles.
  const T = B.tiers;
  for (const stand of STAND_ORDER) {
    const cfg = STANDS[stand], code = STAND_CODE[stand], yaw = Math.atan2(cfg.out[0], cfg.out[2]), bw = cfg.length / cfg.blocks, south = stand === 'south';
    const at = (along: number, depth: number, y: number) => world(stand, along, depth, y);
    for (const tier of tiers(stand)) {
      const rowZero: { s0: number; s1: number; z: number }[] = [];
      for (let r = 0; r < tier.rows; r++) {
        const depth = rowDepth(stand, tier, r), floor = rowFloor(tier, r), rho = (depth - cfg.inner) / BOWL_DEPTH;
        const band = Math.floor(r / BAND_ROWS) % 2, seat = south ? (band ? HERO_PALETTE.southB : HERO_PALETTE.southA) : band ? HERO_PALETTE.seatDark : HERO_PALETTE.seatYellow;
        let previousZ = 0;
        for (let b = 0; b < cfg.blocks; b++) {
          const b0 = -cfg.length / 2 + bw * b, b1 = b0 + bw, mid = b0 + bw / 2, gap = inTunnel(r, 0) ? 1.35 : 0;
          const halves = [[b0, mid - gap], [mid + gap, b1]];
          for (const [h, [s0, s1]] of halves.entries()) {
            const [x, , z] = at((s0 + s1) / 2, depth, 0);
            cube(T, [x, floor / 2, z], [s1 - s0, floor, tier.depth], south ? HERO_PALETTE.terrace : HERO_PALETTE.concrete, yaw, z, rho, code);
            const t0 = s0 === b0 ? s0 + AISLE / 2 : s0, t1 = s1 === b1 ? s1 - AISLE / 2 : s1, [sx, , sz] = at((t0 + t1) / 2, depth + .12, 0);
            cube(T, [sx, floor + .06, sz], [t1 - t0, .12, tier.depth * .62], seat, yaw, z, rho, code);
            // Aisle step on the block edge rises with the later of its two neighbouring columns.
            if (h === 0 && b > 0) { const [ax, , az] = at(b0, depth, 0); cube(T, [ax, floor + .03, az], [AISLE, .07, .17], HERO_PALETTE.step, yaw, Math.min(z, previousZ), rho, code); }
            if (r === 0) rowZero.push({ s0, s1, z });
            previousZ = z;
          }
        }
      }
      // Vomitories: a dark recess filling each front gap, just below the first tread. It rises with the
      // front rows it sits between, and the upper-tier lip and glazed band rise with row 0.
      const front = rowDepth(stand, tier, 0) - tier.depth / 2, back = rowDepth(stand, tier, 4) + tier.depth / 2;
      const rhoFront = (rowDepth(stand, tier, 0) - cfg.inner) / BOWL_DEPTH;
      for (let b = 0; b < cfg.blocks; b++) {
        const [x, , z] = at(-cfg.length / 2 + bw * (b + .5), (front + back) / 2, 0), h = tier.floor - .5;
        cube(T, [x, h / 2, z], [2.7, h, back - front], HERO_PALETTE.dark, yaw, z, rhoFront, code);
      }
      if (tier.tier === 'upper') for (const { s0, s1, z } of rowZero) {
        const [x, , lz] = at((s0 + s1) / 2, cfg.inner + tier.offset - 2, 0);
        cube(T, [x, tier.floor - .6, lz], [s1 - s0, .6, 3.6], HERO_PALETTE.lip, yaw, z, rhoFront, code);
        cube(T, [x, tier.floor - 4, lz], [s1 - s0, 4.5, 1.2], HERO_PALETTE.glass, yaw, z, rhoFront, code);
      }
    }
  }
  // Crowd: one fleck per occupied spot on the South terrace's front rows, standing on the seat strip, clear
  // of the aisles and vomitories. aCrowd = (rise delay, two twinkle phases, twinkle rate), all seeded.
  const rng = mulberry32(CROWD.seed), south = STANDS.south, [cw, ch, cd] = CROWD.size, sbw = south.length / south.blocks, terrace = tiers('south')[0];
  for (let r = 1; r < CROWD.rows; r++) for (let along = -south.length / 2 + CROWD.pitch / 2; along < south.length / 2; along += CROWD.pitch) {
    const spot = along + (rng() - .5) * .5, inBlock = ((spot + south.length / 2) % sbw) - sbw / 2, roll = rng(), pick = rng();
    if (roll > CROWD.density || Math.abs(inBlock) > sbw / 2 - AISLE || inTunnel(r, inBlock / 1.4)) continue;
    const depth = rowDepth('south', terrace, r) + .12, [x, , z] = world('south', spot, depth, 0);
    dummy.position.set(x, rowFloor(terrace, r) + .12, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(cw, ch, cd);
    push(B.crowd, HERO_PALETTE.crowd[pick < CROWD.mix[0] ? 0 : pick < CROWD.mix[0] + CROWD.mix[1] ? 1 : 2], z, (depth - south.inner) / BOWL_DEPTH, STAND_CODE.south);
    B.crowd.extra!.push(rng(), rng() * Math.PI * 2, rng() * Math.PI * 2, rng());
  }
  // Four radial corner terraces (model.ts recipe), segments widened at the back so no slits open.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const tier of tiers('north')) for (let r = 0; r < tier.rows; r++) {
    const radius = 3 + tier.offset + r * tier.depth, h = rowFloor(tier, r), rho = (radius - 3) / BOWL_DEPTH, segments = 8;
    const band = Math.floor(r / BAND_ROWS) % 2, len = (radius + tier.depth / 2 + .1) * Math.PI / 2 / segments;
    for (let j = 0; j < segments; j++) {
      const angle = (j + .5) / segments * Math.PI / 2, x = sx * (BOWL.cornerX + radius * Math.cos(angle)), z = sz * (BOWL.cornerZ + radius * Math.sin(angle));
      const yaw = Math.atan2(-sz * Math.cos(angle), -sx * Math.sin(angle));
      cube(T, [x, h / 2, z], [len, h, tier.depth + .2], HERO_PALETTE.concrete, yaw, z, rho, STAND_CODE.corner);
      cube(T, [x, h + .06, z], [len * .82, .12, tier.depth * .62], band ? HERO_PALETTE.seatDark : HERO_PALETTE.seatYellow, yaw, z, rho, STAND_CODE.corner);
    }
  }
  // Player tunnel and dugouts (model.ts), low on the west touchline.
  cube(T, [-38.5, 1.4, 0], [6, 2.8, 5], HERO_PALETTE.dark, 0, 0, 0, STAND_CODE.west); cube(T, [-38, 3, 0], [7, .4, 5.5], HERO_PALETTE.lip, 0, 0, 0, STAND_CODE.west);
  for (const z of [-13, 13]) { cube(T, [-37, 1, z], [3, 2, 8], HERO_PALETTE.glass, 0, z, 0, STAND_CODE.west); cube(T, [-37, 2.1, z], [3.5, .2, 9], HERO_PALETTE.lip, 0, z, 0, STAND_CODE.west); }

  // Façade: straight stand walls plus quarter arcs, with glass bands and mullions (model.ts rhythm).
  const F = B.facade, wallY = WALL_HEIGHT / 2, glassRows = [5, 12, 23, 30];
  const wallSegment = (p: P3, q: P3, outward: P3, stand: number, glassEvery: number) => {
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]), yaw = Math.atan2(p[2] - q[2], q[0] - p[0]), mx = (p[0] + q[0]) / 2, mz = (p[2] + q[2]) / 2;
    cube(F, [mx, wallY, mz], [len + .6, WALL_HEIGHT, 1.1], HERO_PALETTE.wall, yaw, mz, 1, stand);
    const panes = Math.max(1, Math.round(len / glassEvery)), pane = len / panes;
    for (let i = 0; i < panes; i++) {
      const t = (i + .5) / panes, cx = p[0] + (q[0] - p[0]) * t + outward[0] * .7, cz = p[2] + (q[2] - p[2]) * t + outward[2] * .7;
      for (const h of glassRows) cube(F, [cx, h, cz], [pane - 1.5, 2.7, .3], HERO_PALETTE.glass, yaw, cz, 1, stand);
      const ex = p[0] + (q[0] - p[0]) * i / panes + outward[0] * .8, ez = p[2] + (q[2] - p[2]) * i / panes + outward[2] * .8;
      cube(F, [ex, wallY - .5, ez], [.4, WALL_HEIGHT - 1, 1], HERO_PALETTE.mullion, yaw, ez, 1, stand);
    }
  };
  const R = BOWL.wallRadius, CX = BOWL.cornerX, CZ = BOWL.cornerZ;
  for (const stand of STAND_ORDER) {
    const { out, tangent } = STANDS[stand], half = out[0] ? CZ : CX, reach = out[0] ? CX + R : CZ + R;
    const p: P3 = [out[0] * reach - tangent[0] * half, 0, out[2] * reach - tangent[2] * half], q: P3 = [out[0] * reach + tangent[0] * half, 0, out[2] * reach + tangent[2] * half];
    wallSegment(p, q, out, STAND_CODE[stand], 8);
  }
  const ARC = 8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let j = 0; j < ARC; j++) {
    const a0 = j / ARC * Math.PI / 2, a1 = (j + 1) / ARC * Math.PI / 2, am = (a0 + a1) / 2;
    const pt = (t: number): P3 => [sx * (CX + R * Math.cos(t)), 0, sz * (CZ + R * Math.sin(t))];
    wallSegment(pt(a0), pt(a1), [sx * Math.cos(am), 0, sz * Math.sin(am)], STAND_CODE.corner, 9);
  }

  // Roof: one rounded-ring slab (no overlaps, so it fades cleanly), trusses along the openings, light bars.
  // As in the animatic, the roof covers the outer half of the bowl, so the lower tiers and the South
  // terrace stay visible from the hero camera (model.ts's opening, 8 m behind the front row, hides them).
  const RF = B.roof, TR = B.truss, ring = new THREE.Shape(), hole = new THREE.Path(), RR = BOWL.roofRadius;
  const hx = STANDS.east.inner + ROOF_OPENING - CX, hz = STANDS.south.inner + ROOF_OPENING - CZ;
  for (const [sx, sz, a] of [[1, 1, 0], [-1, 1, .5], [-1, -1, 1], [1, -1, 1.5]]) {
    ring.absarc(sx * CX, sz * CZ, RR, a * Math.PI, (a + .5) * Math.PI, false);
    hole.absellipse(sx * CX, sz * CZ, hx, hz, a * Math.PI, (a + .5) * Math.PI, false, 0);
  }
  ring.holes.push(hole);
  const slabGeometry = new THREE.ExtrudeGeometry(ring, { depth: .7, bevelEnabled: false, curveSegments: 10 });
  slabGeometry.rotateX(Math.PI / 2); slabGeometry.translate(0, ROOF_Y + .35, 0);
  const roofSlab = new THREE.Mesh(slabGeometry, new THREE.MeshStandardMaterial({ color: HERO_PALETTE.roof, roughness: .85, metalness: 0 }));
  roofSlab.name = 'hero-roof-slab'; roofGroup.add(roofSlab);
  for (const stand of STAND_ORDER) {
    const cfg = STANDS[stand], code = STAND_CODE[stand], yaw = Math.atan2(cfg.out[0], cfg.out[2]), at = (u: number, dd: number, y: number) => world(stand, u, dd, y);
    const outer = (cfg.out[0] ? CX : CZ) + RR, z = at(0, outer, 0)[2];
    const tIn = cfg.inner + ROOF_OPENING - 1, half = cfg.out[0] ? CZ : CX;
    beam(TR, at(-half, tIn, 39.5), at(half, tIn, 39.5), .28, HERO_PALETTE.steel, z, 1, code);
    beam(TR, at(-half, tIn, 45), at(half, tIn, 45), .24, HERO_PALETTE.steel, z, 1, code);
    for (let u = -half; u < half; u += 9) {
      beam(TR, at(u, tIn, 39.5), at(Math.min(u + 4.5, half), tIn, 45), .18, HERO_PALETTE.steel, z, 1, code);
      beam(TR, at(Math.min(u + 4.5, half), tIn, 45), at(Math.min(u + 9, half), tIn, 39.5), .18, HERO_PALETTE.steel, z, 1, code);
      beam(TR, at(u, tIn, 39.5), at(u, outer - 1, 40), .19, HERO_PALETTE.steel, z, 1, code);
      const [lx, , lz] = at(u, tIn, 0); cube(RF, [lx, 38.8, lz], [3, .2, 1], HERO_PALETTE.light, yaw, z, 1, code);
    }
  }

  // Eight yellow pylons, each with two stays to its corner roof: one to the opening's corner and one
  // to the rim (model.ts anchors, moved onto the rounded roof).
  const P = B.pylons, rim = (RR - 1.5) * Math.SQRT1_2;
  PYLONS.forEach(([x, z]) => {
    const sx = Math.sign(x), sz = Math.sign(z), top: P3 = [x, PYLON.height, z];
    beam(P, [x, 0, z], top, PYLON.radius, HERO_PALETTE.pylon, z, 0, STAND_CODE.pylon);
    // Stays stay light beside the heavier masts, so the pair reads as a column with cables, not an aerial.
    beam(P, top, [sx * (CX + hx * Math.SQRT1_2), 40, sz * (CZ + hz * Math.SQRT1_2)], .2, HERO_PALETTE.pylon, z, 1, STAND_CODE.pylon);
    beam(P, top, [sx * (CX + rim), 40, sz * (CZ + rim)], .2, HERO_PALETTE.pylon, z, 1, STAND_CODE.pylon);
  });

  // u runs over the bowl's tier extent: 0 at the South end, 1 at the North end.
  let zMax = 0; for (let i = 0; i < T.meta.length; i += 3) zMax = Math.max(zMax, Math.abs(T.meta[i]));
  const uAt = (z: number) => Math.min(1, Math.max(0, (zMax - z) / (2 * zMax)));
  const parts = {} as Record<HeroPartName, HeroPart>;
  for (const [name, b] of Object.entries(B) as [HeroPartName, Batch][]) {
    const count = b.meta.length / 3, build = new Float32Array(b.meta);
    for (let i = 0; i < build.length; i += 3) build[i] = uAt(build[i]);
    const geometry = b.geometry.clone(); geometry.setAttribute('aBuild', new THREE.InstancedBufferAttribute(build, 3));
    if (b.extra) geometry.setAttribute('aCrowd', new THREE.InstancedBufferAttribute(new Float32Array(b.extra), 4));
    const mesh = new THREE.InstancedMesh(geometry, b.material, count); mesh.name = `hero-${name}`;
    mesh.instanceMatrix.array.set(b.matrices);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.colors), 3);
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    (name === 'roof' || name === 'truss' ? roofGroup : group).add(mesh);
    parts[name] = { mesh, build, count };
  }
  box.dispose(); rod.dispose(); standing.dispose();

  // Plinth: unlit, with the placeholder's exact face colours so the first frame swaps seamlessly.
  const plinthGeometry = new THREE.BoxGeometry(PLINTH.halfX * 2, PLINTH.depth, PLINTH.halfZ * 2);
  const normals = plinthGeometry.getAttribute('normal'), colors: number[] = [], top = new THREE.Color(PLINTH_COLORS.top);
  const sides = PLINTH_COLORS.sides.map(c => new THREE.Color(c));
  for (let i = 0; i < normals.count; i++) {
    const n: P3 = [normals.getX(i), normals.getY(i), normals.getZ(i)], c = n[1] > .5 ? top : n[0] * SCREEN_RIGHT[0] + n[2] * SCREEN_RIGHT[2] < 0 ? sides[0] : sides[1];
    colors.push(c.r, c.g, c.b);
  }
  plinthGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const plinth = new THREE.Mesh(plinthGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  plinth.name = 'hero-plinth'; plinth.position.y = -PLINTH.depth / 2; group.add(plinth);

  const meshes = [plinth, roofSlab, ...Object.values(parts).map(p => p.mesh)];
  const triangles = meshes.reduce((sum, m) => sum + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3 * (m instanceof THREE.InstancedMesh ? m.count : 1), 0);
  const stats = { drawCalls: meshes.length, triangles, instances: Object.values(parts).reduce((s, p) => s + p.count, 0), buildMs: performance.now() - started };
  return { group, roof: roofGroup, roofSlab, plinth, parts, stats, uAt, dispose() {
    for (const m of meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); if (m instanceof THREE.InstancedMesh) m.dispose(); }
  } };
}
export type HeroStadium = ReturnType<typeof buildHeroStadium>;
