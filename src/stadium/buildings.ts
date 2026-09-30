import * as THREE from 'three';
import { surface } from './materials';
import { GROUND_Y } from './ground';

// Buildings, sheds, cars and the railway (Task 8). Every footprint and position comes from the district layout in
// surroundings.ts; only the geometry is new. Generic, original forms: no signage, no traced buildings.
//  - Service buildings: a textured façade body on a dark plinth, window bands per floor, a parapet and coping, a
//    bitumen roof with plant units and vents, and roller doors on the side facing the road.
//  - Allotment sheds: boarded bodies with pitched roofs in a few colours, and a door.
//  - Cars: a bevelled body (clear-coat on `high`) with a glasshouse and wheels, under 200 triangles.
//  - Railway: two tracks of rails on sleepers (sleepers on `high` only) and overhead-line masts.
export type Building=[x:number,z:number,w:number,d:number,h:number,roof:number];
type Batch={geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[];colors:THREE.Color[]};
const rng=(seed:number)=>()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);

// A unit gable roof: ridge along x, eaves at y = 0 on z = ±0.5, ridge at y = 1.
function gable(){
  const p=[-.5,0,-.5, .5,0,-.5, .5,1,0, -.5,1,0,  .5,0,.5, -.5,0,.5, -.5,1,0, .5,1,0,  -.5,0,.5, -.5,0,-.5, -.5,1,0,  .5,0,-.5, .5,0,.5, .5,1,0];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setIndex([0,2,1,0,3,2, 4,6,5,4,7,6, 8,10,9, 11,13,12]);g.computeVertexNormals();return g.toNonIndexed();
}
// Car geometry, length along x, wheels on y = 0: [body, glasshouse and wheels].
function carGeometries(){
  const shape=(pts:[number,number][])=>new THREE.Shape(pts.map(([x,y])=>new THREE.Vector2(x,y)));
  const extrude=(pts:[number,number][],depth:number,bevel:number)=>new THREE.ExtrudeGeometry(shape(pts),{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,curveSegments:1}).translate(0,0,-depth/2);
  const body=extrude([[-2.15,.3],[2.15,.3],[2.22,.58],[2.08,.84],[-2.08,.9],[-2.22,.62]],1.7,.05);
  const cabin=extrude([[-1.55,.86],[1.0,.86],[.42,1.36],[-1.22,1.4]],1.5,.05);
  const wheels=[-1,1].flatMap(sx=>[-1,1].map(sz=>new THREE.BoxGeometry(.66,.62,.22).translate(sx*1.35,.31,sz*.8)));
  const dark=merge([cabin,...wheels]);cabin.dispose();wheels.forEach(w=>w.dispose());
  return [body,dark] as const;
}
function merge(list:THREE.BufferGeometry[]){
  const parts=list.map(g=>g.index?g.toNonIndexed():g),p:number[]=[],n:number[]=[];
  for(const g of parts){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);}
  parts.forEach((g,i)=>{if(g!==list[i])g.dispose();});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));return g;
}

export function buildBuildings({buildings,sheds,cars,compact}:{buildings:Building[];sheds:[number,number,number][];cars:[number,number,number][];compact:boolean}){
  const root=new THREE.Group();root.name='District buildings';
  const r=rng(1904),dummy=new THREE.Object3D(),batches=new Map<string,Batch>();
  const std=(color:number,roughness:number,metalness:number,s?:Parameters<typeof surface>[1])=>surface(new THREE.MeshStandardMaterial({color,roughness,metalness}),s);
  const m={
    facade:std(0xffffff,.85,0,{set:'buildingFacade',scale:1.96,mono:.6,contrast:.8,macro:.06}),
    plinth:std(0x4a4d49,.9,0,{set:'concrete',scale:2.71,mono:.35,contrast:.8}),
    coping:std(0x8a8c86,.8,0,{set:'precast',scale:2.5,mono:.4,contrast:.6}),
    roof:std(0x3b3d3b,.92,0,{set:'flatRoof',scale:20,mono:.5,contrast:.9,macro:.12}),
    plant:std(0x9aa09f,.5,.6,{set:'cladding',scale:1.2,mono:1,contrast:.5}),
    door:std(0x6e7678,.55,.5,{set:'cladding',scale:.9,mono:1,contrast:.7}),
    glass:surface(new THREE.MeshPhysicalMaterial({color:0x1f2b30,roughness:.08,metalness:0,ior:1.5,envMapIntensity:1.1}),{glass:true}),
    shed:std(0xffffff,.9,0,{set:'buildingFacade',scale:1,mono:.8,contrast:.5,macro:.1}),
    shedRoof:std(0xffffff,.75,0,{set:'roofSheet',scale:1.2,mono:1,contrast:.4}),
    dark:std(0x1b1d1c,.8,0),
    carBody:compact?new THREE.MeshStandardMaterial({roughness:.35,metalness:.3}):new THREE.MeshPhysicalMaterial({roughness:.38,metalness:.35,clearcoat:1,clearcoatRoughness:.08}),
    carDark:new THREE.MeshPhysicalMaterial({color:0x14191b,roughness:.12,metalness:.1,envMapIntensity:1.2}),
    steel:std(0x8d9394,.4,.8,{set:'paintedSteel',scale:2.5,mono:1,contrast:.4}),
    sleeper:std(0x8e8a80,.9,0,{set:'concrete',scale:2.71,mono:.5,contrast:.8}),
  };
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10),roofGeometry=gable(),[carBody,carDark]=carGeometries();
  function add(key:string,geometry:THREE.BufferGeometry,material:THREE.Material,p:[number,number,number],s:[number,number,number],yaw=0,color?:THREE.Color){
    let b=batches.get(key);if(!b){b={geometry,material,matrices:[],colors:[]};batches.set(key,b);}
    dummy.position.set(...p);dummy.rotation.set(0,yaw,0);dummy.scale.set(...s);dummy.updateMatrix();b.matrices.push(dummy.matrix.clone());b.colors.push(color??new THREE.Color(1,1,1));
  }
  const facades=[0xc9c5b8,0xb7b9b1,0xd6d2c4,0xa9aea8,0xc2b8a4,0xbcc0bb];
  // Service buildings.
  buildings.forEach(([x,z,w,d,h],i)=>{
    const y0=GROUND_Y,top=y0+h,tone=new THREE.Color(facades[i%facades.length]),floors=Math.max(1,Math.floor((h-1)/3.4));
    add('body',box,m.facade,[x,y0+h/2,z],[w,h,d],0,tone);
    add('plinth',box,m.plinth,[x,y0+.3,z],[w+.16,.6,d+.16]);
    // The side facing the road (north, toward the stadium) has roller doors at ground level.
    const doors=2+Math.floor(r()*3),span=w-8;
    for(let k=0;k<doors;k++)add('door',box,m.door,[x-span/2+span*(k+.5)/doors,y0+2.3,z-d/2-.05],[4.2,4.6,.14]);
    for(let f=0;f<floors;f++){
      const y=y0+1.3+f*3.4+.8;
      add('glass',box,m.glass,[x,y,z+d/2+.04],[w-3,1.5,.1]);
      if(f>0||doors===0)add('glass',box,m.glass,[x,y,z-d/2-.04],[w-3,1.5,.1]);
      for(const sx of [-1,1])add('glass',box,m.glass,[x+sx*(w/2+.04),y,z],[.1,1.5,d-3]);
    }
    // Parapet with coping, and the roof inside it.
    for(const sz of [-1,1])add('coping',box,m.coping,[x,top+.45,z+sz*(d/2-.15)],[w+.1,.9,.4]);
    for(const sx of [-1,1])add('coping',box,m.coping,[x+sx*(w/2-.15),top+.45,z],[.4,.9,d-.2]);
    add('roof',box,m.roof,[x,top+.08,z],[w-.5,.16,d-.5]);
    const units=1+Math.floor(r()*3);
    for(let k=0;k<units;k++){const uw=3+r()*4,ud=2.5+r()*3,uh=1.8+r()*1.4;add('plant',box,m.plant,[x+(r()-.5)*(w-uw-4),top+.16+uh/2,z+(r()-.5)*(d-ud-4)],[uw,uh,ud]);}
    for(let k=0;k<2+Math.floor(r()*3);k++)add('vent',cylinder,m.plant,[x+(r()-.5)*(w-4),top+.9,z+(r()-.5)*(d-4)],[.35+r()*.25,1.5,.35+r()*.25]);
  });
  // Allotment sheds: walls 2.1 m, a gable roof with 0.25 m overhang, a door on the long side.
  const walls=[0x7a5d42,0x5f6b4d,0x8a7a5e,0x6d5443,0x4f5a55],roofs=[0x5b2a24,0x2f3a2e,0x3c3f40,0x6a3a2a,0x232627];
  for(const [x,z,w] of sheds){
    const yaw=(r()-.5)*.3,wall=new THREE.Color(walls[Math.floor(r()*walls.length)]),roof=new THREE.Color(roofs[Math.floor(r()*roofs.length)]);
    add('shed',box,m.shed,[x,GROUND_Y+1.05,z],[w,2.1,3.6],yaw,wall);
    add('shedRoof',roofGeometry,m.shedRoof,[x,GROUND_Y+2.1,z],[w+.5,1.1,4.1],yaw,roof);
    const c=Math.cos(yaw),s=Math.sin(yaw);add('shedDoor',box,m.dark,[x+s*1.81,GROUND_Y+.95,z+c*1.81],[.9,1.9,.06],yaw);
  }
  // Cars: body colour per car; clear-coat on high.
  const paints=[0xd8d9d0,0x29363b,0xa5aaa7,0x6c797c,0xc3c4b9,0x59615e,0x7a2c2a,0x2c3f5c,0x1c1d1f];
  for(const [x,z,yaw] of cars){
    const c=new THREE.Color(paints[Math.floor(r()*paints.length)]);
    add('carBody',carBody,m.carBody,[x,GROUND_Y,z],[1,1,1],yaw+(r()-.5)*.04,c);add('carDark',carDark,m.carDark,[x,GROUND_Y,z],[1,1,1],yaw);
  }
  // Railway: two electrified tracks in the ballast corridor (x 386–418).
  for(const cx of [397.5,407.5]){
    for(const side of [-1,1])add('rail',box,m.steel,[cx+side*.7175,GROUND_Y+.23,0],[.07,.15,850]);
    if(!compact)for(let z=-424.7;z<425;z+=.65)add('sleeper',box,m.sleeper,[cx,GROUND_Y+.08,z],[2.6,.16,.26]);
  }
  for(let z=-420;z<425;z+=60)for(const [x,arm] of [[392,1],[413,-1]]){
    add('mast',cylinder,m.steel,[x,GROUND_Y+4,z],[.14,8,.14]);add('arm',box,m.steel,[x+arm*2.8,GROUND_Y+7.4,z],[5.6,.09,.09]);
  }
  const meshes:THREE.InstancedMesh[]=[];
  for(const [key,b] of batches){
    const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.matrices.length);mesh.name=`district-${key}`;
    b.matrices.forEach((mx,i)=>{mesh.setMatrixAt(i,mx);mesh.setColorAt(i,b.colors[i]);});mesh.computeBoundingSphere();
    mesh.castShadow=key!=='sleeper'&&key!=='glass';mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
  }
  return {root,dispose(){
    new Set([box,cylinder,roofGeometry,carBody,carDark]).forEach(g=>g.dispose());Object.values(m).forEach(x=>x.dispose());meshes.forEach(x=>x.dispose());
  }};
}
