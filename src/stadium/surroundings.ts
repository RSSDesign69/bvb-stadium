import * as THREE from 'three';

// An illustrative, orbitable setting drawn from the supplied aerial views.
// +X is east, +Z is south, and the stadium is centered at the origin.
export function buildSurroundings(compact = false) {
  const root = new THREE.Group();
  root.name = 'Stadium district';
  const size = 850, pixels = 2048, scale = pixels / size;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = pixels;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  let seed = 1909;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const px = (n: number) => (n + size / 2) * scale;
  const rect = (color: string, x: number, z: number, w: number, d: number) => {
    ctx.fillStyle = color; ctx.fillRect(px(x), px(z), w * scale, d * scale);
  };
  const oval = (color: string, x: number, z: number, rx: number, rz: number) => {
    ctx.beginPath(); ctx.ellipse(px(x), px(z), rx * scale, rz * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  };
  const line = (color: string, width: number, points: [number, number][], dash: number[] = []) => {
    ctx.beginPath(); points.forEach(([x, z], i) => i ? ctx.lineTo(px(x), px(z)) : ctx.moveTo(px(x), px(z)));
    ctx.strokeStyle = color; ctx.lineWidth = width * scale;
    ctx.setLineDash(dash.map(n => n * scale)); ctx.stroke(); ctx.setLineDash([]);
  };
  const trees: [number, number, number, number][] = [];
  const tree = (x: number, z: number, r: number, shade: number) => {
    if (Math.abs(x) < 111 && Math.abs(z) < 133) return;
    oval('rgba(15,28,18,.37)', x + 2, z + 2, r, r * .75);
    trees.push([x, z, r, shade]);
  };

  rect('#496440', -425, -425, size, size);
  for (let i = 0; i < 29000; i++) {
    const x = -425 + random() * size, z = -425 + random() * size, s = .3 + random() * 1.6;
    rect(['#536b45', '#435f3b', '#607550', '#686949'][Math.floor(random() * 4)], x, z, s, s);
  }
  // Athletics ground immediately west: oval lanes, infield, and pitch.
  oval('#333c36', -237, 25, 104, 156);
  oval('#a74b40', -237, 25, 91, 145);
  oval('#934238', -237, 25, 77, 131);
  for (let n = 0; n < 7; n++) {
    ctx.beginPath(); ctx.ellipse(px(-237), px(25), (89 - n * 2) * scale, (143 - n * 2) * scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(237,220,197,.64)'; ctx.lineWidth = .48 * scale; ctx.stroke();
  }
  oval('#39743e', -237, 25, 67, 118);
  rect('#428349', -295, -64, 116, 177);
  for (let n = 0; n < 15; n++) rect(n % 2 ? 'rgba(105,159,81,.12)' : 'rgba(14,72,35,.1)', -295 + n * 7.7, -64, 7.7, 177);
  line('#e5e3c7', .7, [[-290,-59],[-184,-59],[-184,108],[-290,108],[-290,-59]]);
  rect('#3c4140', -137, -103, 20, 225);
  for (let n = 0; n < 10; n++) rect(n % 2 ? '#70746d' : '#555a55', -137 + n * 1.8, -103, 1.3, 225);

  // East parking: asphalt, bay markings, planted islands, and parked cars.
  rect('#4e534f', 119, -152, 251, 302);
  rect('#62655f', 130, -140, 225, 278);
  for (let row = 0; row < 8; row++) {
    const z = -126 + row * 34;
    rect(row % 2 ? '#60635d' : '#696b64', 133, z, 219, 24);
    for (let col = 0; col < 25; col++) {
      const x = 135 + col * 8.6;
      line('rgba(222,221,198,.62)', .5, [[x,z],[x,z+9]]);
      line('rgba(222,221,198,.62)', .5, [[x,z+15],[x,z+24]]);
    }
    if (row < 7) {
      rect('#475d42', 133, z + 25, 219, 5);
      for (let col = 0; col < 8; col++) tree(146 + col * 27, z + 27.5, 2.4 + random() * 1.5, col % 4);
    }
  }
  line('#363c39', 8, [[117,-174],[386,-174],[386,170],[118,170]]);
  // Railway corridor beyond the outer parking edge.
  rect('#5b5b53', 386, -425, 32, 850);
  for (let z = -420; z < 425; z += 5) rect('#6d695b', 390, z, 25, 1.2);
  for (const x of [395, 401, 407, 413]) line('#adb1a8', .85, [[x,-425],[x,425]]);

  // Forecourt and access route in front of the south facade.
  rect('#66675f', -112, 128, 229, 67);
  rect('#807d71', -98, 138, 201, 43);
  for (let n = 0; n < 34; n++) line('rgba(222,212,185,.2)', .35, [[-97+n*6,138],[-97+n*6,180]]);
  const road: [number, number][] = [[-375,207],[-240,195],[-120,193],[-20,209],[107,199],[185,170],[250,159]];
  line('#343b38', 15, road); line('#696c65', 10, road); line('#d6cbb1', .5, road, [4,6]);
  for (let n = 0; n < 19; n++) tree(-120+n*13, 213+(n%3)*2, 3+random()*2.5, n%4);

  // North-side allotments: patchwork garden plots, sheds, and wooded edge.
  rect('#405a39', -365, -414, 730, 265);
  const plots = ['#557246','#6e7949','#7c6747','#3b6740','#6c8053','#847651'];
  const huts: [number, number, number][] = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 27; col++) {
    const x = -359 + col * 26 + (row % 2) * 3, z = -406 + row * 30;
    rect('#8b8263', x, z, 24, 27);
    rect(plots[Math.floor(random() * plots.length)], x+1, z+1, 22, 25);
    if (random() > .53) huts.push([x+4+random()*10, z+4+random()*12, 3+random()*2]);
    if (random() > .34) tree(x+5+random()*14, z+6+random()*15, 2+random()*2.4, row%4);
  }
  for (let n = 0; n < 5; n++) line('#8a846a', 3, [[-380,-370+n*55],[380,-370+n*55]]);
  for (let n = 0; n < (compact ? 40 : 180); n++) tree(-390+random()*780, -187+random()*52, 3+random()*5, Math.floor(random()*4));
  for (let n = 0; n < 75; n++) tree(-400+random()*800, 231+random()*171, 3+random()*4, Math.floor(random()*4));
  for (let n = 0; n < 45; n++) tree(-394+random()*70, -180+random()*405, 3+random()*5, Math.floor(random()*4));

  // Service lots and low buildings continue past the southern tree line.
  rect('#525b55', -138, 270, 280, 140);
  rect('#696e67', -123, 280, 250, 120);
  for (let n = 0; n < 9; n++) tree(-130+n*29, 258, 3+random()*3, n%4);
  const roofs: [number,number,number,number,number,number][] = [
    [-94,324,62,31,8,0xb4b7ab],[5,349,74,41,7,0xd5d4c8],[94,340,43,44,6,0xa6aea6],
    [-253,270,112,37,6,0x949f95],[-300,348,81,45,8,0xb4bcb1],[267,306,95,48,7,0xb8bcb0],
  ];
  const addBox = (x:number,z:number,w:number,d:number,h:number,color:number) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), material);
    mesh.position.set(x,-1.8+h/2,z); root.add(mesh);
  };
  roofs.forEach(([x,z,w,d,h,color]) => { addBox(x,z,w,d,h,0x777c76); addBox(x,z,w+1.5,d+1.5,.65,color); root.children.at(-1)!.position.y = -1.8+h+.3; });
  for (let n = 0; n < 19000; n++) {
    ctx.fillStyle = random() > .5 ? 'rgba(255,245,218,.035)' : 'rgba(0,18,11,.045)';
    ctx.fillRect(random()*pixels,random()*pixels,1+random()*2,1+random()*2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size,size), new THREE.MeshStandardMaterial({ map:texture, roughness:1 }));
  ground.rotation.x = -Math.PI/2; ground.position.y = -1.8; root.add(ground);

  // A few instanced meshes give the map height without adding hundreds of draw calls.
  const dummy = new THREE.Object3D();
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0), new THREE.MeshStandardMaterial({ roughness:1, flatShading:true }), trees.length);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.3,.43,1,5), new THREE.MeshStandardMaterial({ color:0x605840, roughness:1 }), trees.length);
  const greens = [0x426f3c,0x55804a,0x65884a,0x789156];
  trees.forEach(([x,z,r,shade],i) => {
    const h = 3.2+r*.5;
    dummy.position.set(x,-1.8+h/2,z); dummy.scale.set(1,h,1); dummy.rotation.set(0,0,0); dummy.updateMatrix(); trunk.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,-1.8+h+r*.55,z); dummy.scale.set(r,r*(.85+random()*.25),r); dummy.rotation.set(0,random()*6.28,0); dummy.updateMatrix();
    canopy.setMatrixAt(i,dummy.matrix); canopy.setColorAt(i,new THREE.Color(greens[shade]));
  });
  canopy.computeBoundingSphere(); trunk.computeBoundingSphere(); root.add(canopy,trunk);
  const sheds = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xaaa38b,roughness:1}),huts.length);
  huts.forEach(([x,z,w],i) => { dummy.position.set(x,-.6,z); dummy.rotation.set(0,random()*.15,0); dummy.scale.set(w,2.4,4); dummy.updateMatrix(); sheds.setMatrixAt(i,dummy.matrix); });
  sheds.computeBoundingSphere(); root.add(sheds);

  const parking: [number,number,number][] = [];
  for (let row=0; row<8; row++) for (let col=0; col<25; col++) for (let side=0; side<2; side++)
    if (random()>.27) parking.push([140+col*8.6,-124+row*34+side*16,0]);
  for (let row=0; row<4; row++) for (let col=0; col<16; col++)
    if (random()>.36) parking.push([-110+col*14,285+row*27,Math.PI/2]);
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.1,1.2,2.1),new THREE.MeshStandardMaterial({roughness:.65}),parking.length);
  const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(2.15,.55,1.85),new THREE.MeshStandardMaterial({color:0x39494a,roughness:.35}),parking.length);
  const colors = [0xd8d9d0,0x29363b,0xa5aaa7,0x6c797c,0xc3c4b9,0x59615e];
  parking.forEach(([x,z,yaw],i) => {
    dummy.rotation.set(0,yaw,0); dummy.scale.set(1,1,1); dummy.position.set(x,-.9,z); dummy.updateMatrix();
    cars.setMatrixAt(i,dummy.matrix); cars.setColorAt(i,new THREE.Color(colors[Math.floor(random()*colors.length)]));
    dummy.position.y = -.05; dummy.updateMatrix(); glass.setMatrixAt(i,dummy.matrix);
  });
  cars.computeBoundingSphere(); glass.computeBoundingSphere(); root.add(cars,glass);
  return { root, dispose() {
    root.traverse(object => { if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      if (object instanceof THREE.InstancedMesh) object.dispose();
    }});
    texture.dispose();
  }};
}
