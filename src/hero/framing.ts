// Hero camera framing shared by the first-paint placeholder and the WebGL renderer.
// Pure maths with no three.js import, so the placeholder can ship in the main bundle.
// World axes follow src/stadium/layout.ts: +X east, +Z south (Südtribüne), +Y up.
export type P3 = readonly [number, number, number];
export type P2 = readonly [number, number];

export const HERO_VIEW = {
  azimuth: Math.PI / 4,    // 45° off the north–south axis, from the NW corner
  elevation: Math.PI / 6,  // 30°: the classic 2:1 dimetric read
  padding: .06,            // minimum clear margin on every side of the slot
  // The idle camera turns the diorama about its vertical axis: sway (±4°) plus pointer parallax (±3.5°
  // azimuth, ±1.5° elevation), from IDLE in timeline.ts. The frame fits every pose in this envelope.
  motion: { azimuth: 7.5 * Math.PI / 180, elevation: 1.5 * Math.PI / 180 },
};
// The camera sits north-west, so the Südtribüne is the far short end and faces the viewer.
// NW keeps the South terrace upper-right in the frame, clear of the headline's tail.
export const viewDir = (azimuth: number, elevation: number): P3 => [-Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), -Math.cos(elevation) * Math.cos(azimuth)];
export const VIEW_DIR = viewDir(HERO_VIEW.azimuth, HERO_VIEW.elevation);
export const SLOT_ASPECT = { wide: 3 / 2, stacked: 8 / 5 };

// The diorama base: the explorer's 210 × 252 m plate, thickened so it reads as a plinth.
export const PLINTH = { halfX: 105, halfZ: 126, depth: 5 };
// Plinth face colours (sRGB). The placeholder and the unlit WebGL plinth both use these, so the swap is seamless.
export const PLINTH_COLORS = { top: '#1f201d', sides: ['#171815', '#121311'] as const };
// Closed bowl outline: a rounded rectangle whose quarter arcs are centred on the explorer's corner
// terrace origins (model.ts: ±44, ±63), just clear of the outermost corner rows (≈ 47.8 m).
export const BOWL = { cornerX: 44, cornerZ: 63, wallRadius: 48.5, roofRadius: 50.5 };
export const WALL_HEIGHT = 34;       // façade top (model.ts: 34 m wall centred at 17 m)
export const ROOF_Y = 39.2;          // roof slab centre at rest
export const ROOF_LIFT_MAX = .26 * WALL_HEIGHT;
export const PYLON = { height: 62, radius: 1.2 }; // mast 2.4 m across: the animatic's 26:1 column (model.ts's .85 m read as a 1 px line)
export const PYLONS: P2[] = [[88, 74], [57, 112]].flatMap(([x, z]) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => [sx * x, sz * z] as P2));

const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: P3): P3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Orthographic screen basis: right and up vectors for a camera at dir, looking at the origin. Every
// pose orbits the stadium's vertical axis, so the frustum can stay fixed in screen space.
export function viewBasis(azimuth = HERO_VIEW.azimuth, elevation = HERO_VIEW.elevation) {
  const dir = viewDir(azimuth, elevation), forward: P3 = [-dir[0], -dir[1], -dir[2]], right = norm(cross(forward, [0, 1, 0]));
  return { dir, right, up: cross(right, forward) };
}
export const { right: SCREEN_RIGHT, up: SCREEN_UP } = viewBasis();
export const toScreen = (p: P3, basis: { right: P3; up: P3 } = { right: SCREEN_RIGHT, up: SCREEN_UP }): P2 => [dot(p, basis.right), dot(p, basis.up)];
// Poses sampled across the idle envelope: azimuth every 0.5°, elevation at five steps.
export const ENVELOPE = Array.from({ length: 31 }, (_, i) => (i / 15 - 1) * HERO_VIEW.motion.azimuth).flatMap(da =>
  [-1, -.5, 0, .5, 1].map(de => viewBasis(HERO_VIEW.azimuth + da, HERO_VIEW.elevation + de * HERO_VIEW.motion.elevation)));

// Conservative outline of the settled stadium, including the fully lifted roof and pylon tips.
// tests/hero.test.ts checks that every vertex of the built model lies inside this frame.
const box = (x: number, y0: number, y1: number, z: number): P3[] => [y0, y1].flatMap(y => [[x, y, z], [x, y, -z], [-x, y, z], [-x, y, -z]] as P3[]);
const roofTop = ROOF_Y + .5 + ROOF_LIFT_MAX, trussTop = ROOF_Y + 6.5 + ROOF_LIFT_MAX;
export const EXTENT_POINTS: P3[] = [
  ...box(PLINTH.halfX, -PLINTH.depth, 0, PLINTH.halfZ),
  // Lifted roof: the rounded outer edge sampled every 7.5°, and the truss crowns along the openings.
  ...Array.from({ length: 13 }, (_, i) => i / 12 * Math.PI / 2).flatMap(a => box(BOWL.cornerX + BOWL.roofRadius * Math.cos(a) + .5, roofTop, roofTop, BOWL.cornerZ + BOWL.roofRadius * Math.sin(a) + .5)),
  ...box(45, trussTop, trussTop, 86), ...box(66, trussTop, trussTop, 64),
  ...PYLONS.flatMap(([x, z]) => [[x + PYLON.radius, PYLON.height + PYLON.radius, z + PYLON.radius], [x - PYLON.radius, PYLON.height + PYLON.radius, z - PYLON.radius]] as P3[]),
];

export interface HeroFit { center: P2; width: number; height: number; aspect: number }
// Fit an orthographic frustum (in metres) to the slot aspect with the padding on every side, for every
// pose in the idle envelope. center is the frustum's offset in screen space from the origin.
export function fitView(aspect: number, points: readonly P3[] = EXTENT_POINTS, poses = ENVELOPE): HeroFit {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const basis of poses) for (const p of points) { const [x, y] = toScreen(p, basis); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let width = (x1 - x0) / (1 - 2 * HERO_VIEW.padding), height = (y1 - y0) / (1 - 2 * HERO_VIEW.padding);
  if (width / height < aspect) width = height * aspect; else height = width / aspect;
  return { center: [(x0 + x1) / 2, (y0 + y1) / 2], width, height, aspect };
}
// Slot coordinates in [0, 1], x to the right and y downward (SVG / CSS convention), at the neutral pose by default.
export function toSlot(p: P3, fit: HeroFit, basis?: { right: P3; up: P3 }): P2 {
  const [x, y] = toScreen(p, basis);
  return [.5 + (x - fit.center[0]) / fit.width, .5 - (y - fit.center[1]) / fit.height];
}

// The plinth's visible faces in slot coordinates: the top plus the two side faces facing the camera.
export function plinthFaces(fit: HeroFit) {
  const { halfX: x, halfZ: z, depth: d } = PLINTH;
  const top: P3[] = [[x, 0, z], [x, 0, -z], [-x, 0, -z], [-x, 0, z]];
  const sides: { normal: P3; quad: P3[] }[] = [
    { normal: [0, 0, -1], quad: [[x, 0, -z], [-x, 0, -z], [-x, -d, -z], [x, -d, -z]] },
    { normal: [0, 0, 1], quad: [[-x, 0, z], [x, 0, z], [x, -d, z], [-x, -d, z]] },
    { normal: [-1, 0, 0], quad: [[-x, 0, -z], [-x, 0, z], [-x, -d, z], [-x, -d, -z]] },
    { normal: [1, 0, 0], quad: [[x, 0, z], [x, 0, -z], [x, -d, -z], [x, -d, z]] },
  ];
  const visible = sides.filter(s => dot(s.normal, VIEW_DIR) > 0);
  // Sort so the face lit from the left (screen) comes first; the renderer uses the same order.
  visible.sort((a, b) => dot(a.normal, SCREEN_RIGHT) - dot(b.normal, SCREEN_RIGHT));
  return { top: top.map(p => toSlot(p, fit)), sides: visible.map(s => s.quad.map(p => toSlot(p, fit))) };
}
