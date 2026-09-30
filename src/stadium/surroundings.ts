import * as THREE from 'three';
import { applyTextures, type TextureSet } from './materials';
import { BOARD, GROUND_Y, Painter, applyGround, groundMaterial, marksMaterial } from './ground';
import { buildTrees, type TreeSite } from './trees';
import { buildBuildings, type Building } from './buildings';

// An illustrative, orbitable setting drawn from the supplied aerial views.
// +X is east, +Z is south, and the stadium is centered at the origin.
// Task 8: the layout below is unchanged (same shapes, same seeded positions); it now paints a tint, material masks
// and paint marks for the ground shader (ground.ts), and places real trees (trees.ts) and procedural buildings,
// sheds, cars and track (buildings.ts).
const SUN_SHADOW:[number,number]=[.743,-.669]; // ground direction of the sun's shadows (the sun stands at 228°)
export function buildSurroundings(compact = false, forceTrees: 'near' | 'far' | null = null) {
  const root = new THREE.Group();
  root.name = 'Stadium district';
  const size = BOARD, paint = new Painter(compact ? 1024 : 2048, compact ? 512 : 1024);
  let seed = 1909;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  // The old painter drew pixel speckle here; its random draws are kept so every seeded position stays where it was.
  const skip = (n: number) => { for (let i = 0; i < n; i++) random(); };
  const trees: TreeSite[] = [];
  const tree = (x: number, z: number, r: number, shade: number) => {
    if (Math.abs(x) < 111 && Math.abs(z) < 133) return;
    trees.push({ x, z, r, shade });
  };

  paint.rect('#4a6034', 'grass', -425, -425, size, size);
  skip(29000 * 4);
  // Soft variation across the grass (mowing, wear, damp ground), tint only.
  const tr = (() => { let s = 77; return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 420; i++) paint.patch(-425 + tr() * size, -425 + tr() * size, 8 + tr() * 34, ['rgba(96,112,54,.35)', 'rgba(52,76,36,.3)', 'rgba(108,106,62,.25)', 'rgba(62,86,44,.3)'][Math.floor(tr() * 4)]);
  // Athletics ground immediately west: oval lanes, infield, and pitch.
  paint.oval('#3a403b', 'asphalt', -237, 25, 104, 156);
  paint.oval('#8c4034', 'track', -237, 25, 91, 145);
  paint.oval('#7d392f', 'track', -237, 25, 77, 131);
  for (let n = 0; n < 8; n++) paint.ellipseMark(-237, 25, 90 - n * 1.9, 144 - n * 1.9, .1);
  paint.oval('#446a36', 'lawn', -237, 25, 67, 118);
  paint.rect('#48723a', 'lawn', -295, -64, 116, 177);
  for (let n = 0; n < 15; n++) paint.rect(n % 2 ? 'rgba(112,150,70,.09)' : 'rgba(20,60,24,.08)', null, -295 + n * 7.7, -64, 7.7, 177);
  paint.mark([[-290,-59],[-184,-59],[-184,108],[-290,108],[-290,-59]], .12);
  paint.mark([[-290,24.5],[-184,24.5]], .12);
  paint.ellipseMark(-237, 24.5, 9.15, 9.15, .12, 64);
  paint.rect('#474c4a', 'paving', -137, -103, 20, 225);
  for (let n = 0; n < 10; n++) paint.rect(n % 2 ? '#6c7069' : '#565b56', null, -137 + n * 1.8, -103, 1.3, 225);

  // East parking: asphalt, bay markings, planted islands, and parked cars.
  paint.rect('#4b504c', 'asphalt', 119, -152, 251, 302);
  paint.rect('#5a5d58', 'asphalt', 130, -140, 225, 278);
  for (let row = 0; row < 8; row++) {
    const z = -126 + row * 34;
    paint.rect(row % 2 ? '#585b56' : '#5f615b', 'asphalt', 133, z, 219, 24);
    for (let col = 0; col < 25; col++) {
      const x = 135 + col * 8.6;
      paint.mark([[x,z],[x,z+9]], .12); paint.mark([[x,z+15],[x,z+24]], .12);
    }
    paint.mark([[133,z+12],[352,z+12]], .12, [3, 3]);
    if (row < 7) {
      paint.rect('#4d6039', 'lawn', 133, z + 25, 219, 5);
      paint.rect('#9a9a92', 'paving', 133, z + 24.7, 219, .3); paint.rect('#9a9a92', 'paving', 133, z + 30, 219, .3);
      for (let col = 0; col < 8; col++) tree(146 + col * 27, z + 27.5, 2.4 + random() * 1.5, col % 4);
    }
  }
  paint.line('#3a403c', 'asphalt', 8, [[117,-174],[386,-174],[386,170],[118,170]]);
  // Railway corridor beyond the outer parking edge: ballast bed (rails, sleepers and masts are geometry).
  paint.rect('#6a675d', 'ballast', 386, -425, 32, 850);
  for (const cx of [397.5, 407.5]) paint.rect('#57544b', null, cx - 1.5, -425, 3, 850);

  // Forecourt and access route in front of the south facade.
  paint.rect('#65665e', 'paving', -112, 128, 229, 67);
  paint.rect('#77756a', 'paving', -98, 138, 201, 43);
  for (let n = 0; n < 34; n++) paint.rect('rgba(222,212,185,.12)', null, -97.2 + n * 6, 138, .4, 43);
  const road: [number, number][] = [[-375,207],[-240,195],[-120,193],[-20,209],[107,199],[185,170],[250,159]];
  paint.line('#8d8b83', 'paving', 15, road); paint.line('#3d4340', 'asphalt', 11, road);
  paint.mark(road, .15, [4, 6]);
  // Worn edge lines, 0.3 m inside each kerb.
  const offset = (d: number) => road.map(([x, z], i) => { const a = road[Math.max(0, i - 1)], b = road[Math.min(road.length - 1, i + 1)], l = Math.hypot(b[0]-a[0], b[1]-a[1]); return [x - (b[1]-a[1]) / l * d, z + (b[0]-a[0]) / l * d] as [number, number]; });
  paint.mark(offset(5.1), .12); paint.mark(offset(-5.1), .12);
  for (let n = 0; n < 19; n++) tree(-120+n*13, 213+(n%3)*2, 3+random()*2.5, n%4);

  // North-side allotments: patchwork garden plots, sheds, and wooded edge.
  paint.rect('#465c35', 'grass', -365, -414, 730, 265);
  const plots = ['#4f6340','#5e6644','#62553f','#405a39','#5a6947','#665d45'];
  const huts: [number, number, number][] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 27; col++) {
    const x = -359 + col * 26 + (row % 2) * 3, z = -406 + row * 30;
    paint.rect('#6d6858', 'ballast', x, z, 24, 27);
    const plot = Math.floor(random() * plots.length);
    paint.rect(plots[plot], plot === 2 || plot === 5 ? 'soil' : 'grass', x+1, z+1, 22, 25);
    // Task 9: beds and rows inside most plots (tint only, from the patch stream so the seeded layout is untouched).
    if (tr() > .3) { const n = 3 + Math.floor(tr() * 5), across = tr() > .5, tone = ['rgba(46,62,28,.45)', 'rgba(92,74,48,.4)', 'rgba(70,86,40,.35)'][Math.floor(tr() * 3)];
      for (let k = 0; k < n; k++) across ? paint.rect(tone, null, x + 2.5, z + 2.5 + k * 20 / n, 19, 1.1) : paint.rect(tone, null, x + 2.5 + k * 17 / n, z + 2.5, 1.1, 22); }
    if (random() > .53) huts.push([x+4+random()*10, z+4+random()*12, 3+random()*2]);
    if (random() > .34) tree(x+5+random()*14, z+6+random()*15, 2+random()*2.4, row%4);
  }
  for (let n = 0; n < 5; n++) paint.line('#77725e', 'ballast', 3, [[-380,-370+n*55],[380,-370+n*55]]);
  for (let n = 0; n < (compact ? 40 : 180); n++) tree(-390+random()*780, -187+random()*52, 3+random()*5, Math.floor(random()*4));
  for (let n = 0; n < 75; n++) tree(-400+random()*800, 231+random()*171, 3+random()*4, Math.floor(random()*4));
  for (let n = 0; n < 45; n++) tree(-394+random()*70, -180+random()*405, 3+random()*5, Math.floor(random()*4));

  // Service lots and low buildings continue past the southern tree line.
  paint.rect('#50574f', 'asphalt', -138, 270, 280, 140);
  paint.rect('#5f635d', 'asphalt', -123, 280, 250, 120);
  for (let n = 0; n < 9; n++) tree(-130+n*29, 258, 3+random()*3, n%4);
  const buildings: Building[] = [
    [-94,324,62,31,8,0xb4b7ab],[5,349,74,41,7,0xd5d4c8],[94,340,43,44,6,0xa6aea6],
    [-253,270,112,37,6,0x949f95],[-300,348,81,45,8,0xb4bcb1],[267,306,95,48,7,0xb8bcb0],
  ];
  // Contact shade on the ground at each building's foot.
  for (const [x,z,w,d] of buildings) paint.rect('rgba(10,16,12,.35)', null, x - w/2 - 1.2, z - d/2 - 1.2, w + 2.4, d + 2.4);
  // Task 9: buildings and sheds all stand outside the sun's shadow map, so their sun shadows are painted, as the
  // trees' are (height × cot 47.9° along the shadow direction; buildings to the top of the parapet).
  const cast = (h: number): [number, number] => [SUN_SHADOW[0] * h * .904, SUN_SHADOW[1] * h * .904];
  for (const [x,z,w,d,h] of buildings) paint.castShadow(x, z, w, d, cast(h + .9), .5);
  for (const [x,z,w] of huts) paint.castShadow(x, z, w, 3.6, cast(2.9), .45);
  skip(19000 * 5);
  // Under every tree a soft contact shade; beyond the sun's shadow map (300 m square) also its sun shadow, painted.
  for (const t of trees) {
    paint.shade(t.x, t.z, t.r * .95, t.r * .8, .3);
    if (Math.abs(t.x) > 150 || Math.abs(t.z) > 150) paint.shade(t.x + SUN_SHADOW[0] * t.r * 1.4, t.z + SUN_SHADOW[1] * t.r * 1.4, t.r * 1.05, t.r * .85, .38);
  }
  // The old tree loop's random draws (height and yaw per tree) and the sheds' (yaw) keep the car positions seeded.
  skip(trees.length * 2 + huts.length);

  const parking: [number,number,number][] = [];
  for (let row=0; row<8; row++) for (let col=0; col<25; col++) for (let side=0; side<2; side++)
    if (random()>.27) parking.push([140+col*8.6,-124+row*34+side*16,0]);
  for (let row=0; row<4; row++) for (let col=0; col<16; col++)
    if (random()>.36) parking.push([-110+col*14,285+row*27,Math.PI/2]);
  for (const [x,z] of parking) paint.shade(x, z, 2.6, 1.5, .28);

  const layers = paint.textures();
  // One ground mesh to the horizon: the board inside, fields and hedgerows outside, fading into the fog.
  const groundMat = groundMaterial(layers);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 96), groundMat);
  ground.rotation.x = -Math.PI/2; ground.position.y = GROUND_Y; ground.receiveShadow = true; ground.name = 'ground'; root.add(ground);
  const marksMat = marksMaterial();
  const marks = paint.marksMesh(marksMat); root.add(marks);

  const forest = buildTrees(trees, compact, forceTrees);root.add(forest.root);
  const district = buildBuildings({ buildings, sheds: huts, cars: parking, compact });root.add(district.root);
  return { root, shadowOnly: forest.shadowOnly, trees: forest,
    // The textured ground and district materials, once the CC0 sets arrive.
    applyTextures(sets: Record<string, TextureSet>) { applyGround(groundMat, sets); applyTextures(root, sets); },
    dispose() {
      forest.dispose(); district.dispose();
      ground.geometry.dispose(); groundMat.dispose(); marksMat.dispose(); marks.geometry.dispose();
      layers.tint.dispose(); layers.maskA.dispose(); layers.maskB.dispose();
    } };
}
