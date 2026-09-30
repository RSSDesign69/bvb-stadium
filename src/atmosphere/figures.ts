import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Anonymous low-poly people for close views (Task 9, approved by the product owner 2026-09-29): a tapered torso,
// arms and legs, and a head with a darker crown for hair. No faces, kits or likenesses. Origin on the floor, +z is
// the way the figure faces, y up. The body takes the per-instance clothing colour through white vertex colours;
// trousers and hands are baked darker. The head is a separate mesh, so it takes a skin tone per instance.
const UP=new THREE.Vector3(0,1,0);
// A tapered limb or trunk from a to b (radius ra at a, rb at b), depth squashed by `flat`, with a vertex colour.
// Limbs are open-ended (their ends are buried in the torso or hidden); the torso keeps its caps.
function limb(a:THREE.Vector3,b:THREE.Vector3,ra:number,rb:number,sides:number,shade:number,flat=1){
  const d=b.clone().sub(a),g=new THREE.CylinderGeometry(rb,ra,d.length(),sides,1,sides<7).scale(1,1,flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,d.clone().normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  return tint(g,shade);
}
function tint(g:THREE.BufferGeometry,shade:number){
  g.deleteAttribute('uv');const n=g.attributes.position.count;g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(n*3).fill(shade),3));return g;
}
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const TROUSERS=.16;
function body(kind:'seated'|'standing'|'player'){
  const parts:THREE.BufferGeometry[]=[];
  if(kind==='seated'){
    // Sitting back on the seat pan (place + 0.45 m), leaning forward a little, arms toward the lap. The shins are
    // left out: from any seat they are hidden by the row in front. 60 triangles.
    parts.push(limb(v(0,.5,-.08),v(0,1.02,-.03),.15,.19,7,1,.62));
    for(const s of [-1,1]){
      parts.push(limb(v(s*.19,.98,-.04),v(s*.17,.63,.16),.052,.04,4,1));
      parts.push(limb(v(s*.1,.52,-.02),v(s*.1,.55,.42),.075,.065,4,TROUSERS));
    }
  }else{
    const h=kind==='player'?1.02:1;
    parts.push(limb(v(0,.9*h,0),v(0,1.44*h,.02),.16,.2,7,1,.6));
    for(const s of [-1,1]){
      parts.push(limb(v(s*.21,1.4*h,.02),v(s*.25,.9*h,.04),.055,.042,4,1));
      // Players' legs are animated separately (matchday.ts); spectators stand still.
      if(kind!=='player')parts.push(limb(v(s*.1,.92,0),v(s*.11,.04,.02),.085,.06,4,TROUSERS));
    }
  }
  const g=mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p));parts.forEach(p=>p.dispose());return g;
}
function head(y:number){
  const g=new THREE.SphereGeometry(.095,6,4).scale(1,1.26,1.1).translate(0,y,0);
  const neck=new THREE.CylinderGeometry(.05,.055,.12,4,1,true).translate(0,y-.14,0);
  // Hair: the top and back of the head darker (a multiplier on the instance's skin tone).
  const p=g.attributes.position,c=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){const top=p.getY(i)-y>.03||(p.getZ(i)<-.02&&p.getY(i)-y>-.09);c.fill(top?.34:1,i*3,i*3+3);}
  g.deleteAttribute('uv');g.setAttribute('color',new THREE.BufferAttribute(c,3));
  const m=mergeGeometries([g.toNonIndexed(),tint(neck,1).toNonIndexed()]);g.dispose();neck.dispose();return m;
}
export function figureGeometries(){
  return {seated:{body:body('seated'),head:head(1.16)},standing:{body:body('standing'),head:head(1.6)},player:{body:body('player'),head:head(1.63)}};
}
// Clothing and skin palettes: muted, mostly the home colours, never a kit.
export const CLOTHES=[0xd2ad22,0xd2ad22,0x1d2122,0x1d2122,0x444a47,0x2a3344,0xc9c8bf,0xb49f6c,0x6b2f2b,0xd2ad22];
export const SKIN=[0xc49a7c,0x9d7458,0x6d4c3a,0xd9b79a,0xb5876a,0x4f372b];
