import * as THREE from 'three';
import { BOWL, PYLON, PYLONS, ROOF_Y } from '../hero/framing';
import type { Vec3 } from '../places/schema';
import { STANDS, STAND_ORDER, world } from './layout';
import { Mesher, loop, sweep, type V3 } from './sweep';
import { aroundOutline } from './shell';

// Roof: the hero's rounded ring (outer arcs of radius 50.5 m around (±44, ±63), elliptical corners on the
// opening), with a 2.5 m edge band, a dark soffit and a 4 m translucent strip along the inner edge.
// The opening sits `o` metres behind each stand's front row. The slab and strip are generated at both
// openings with the same vertex order, and the cutaway opening is a morph target, so one influence animates
// the ring and three's raycaster still sees the roof where it is drawn. Trusses, light bars and the pylon stays
// that follow the inner edge are instanced and re-laid on the CPU, which keeps picking and shadows exact.
export const ROOF_OPENING={closed:8,cutaway:25};
const K=24,STRIP=4,TOP=ROOF_Y+.35,BOTTOM=ROOF_Y-.35,BAND=2.5,BAND_T=.5,CX=BOWL.cornerX,CZ=BOWL.cornerZ,RR=BOWL.roofRadius;
export const hole=(o:number)=>({hx:STANDS.east.inner+o-CX,hz:STANDS.south.inner+o-CZ});
const outline=(rx:number,rz:number)=>[[1,1],[-1,1],[-1,-1],[1,-1]].flatMap(([sx,sz],q)=>
  Array.from({length:K+1},(_,k)=>{const a=(q+k/K)*Math.PI/2;return [sx*CX+rx*Math.cos(a),sz*CZ+rz*Math.sin(a)] as [number,number];}));
type Face={m:number;v:V3[];n:V3};
// Faces in a fixed order for any opening; m indexes the material groups (0 top, 1 soffit, 2 edge, 3 strip).
function faces(o:number):Face[]{
  const {hx,hz}=hole(o),out=outline(RR,RR),band=outline(RR-BAND_T,RR-BAND_T),slab=outline(hx+STRIP,hz+STRIP),inner=outline(hx,hz),n=out.length,list:Face[]=[];
  const quad=(m:number,a:V3,b:V3,c:V3,d:V3,normal:V3)=>list.push({m,v:[a,b,c],n:normal},{m,v:[a,c,d],n:normal});
  const at=(p:[number,number],y:number):V3=>[p[0],y,p[1]];
  const side=(p:[number,number],q:[number,number],sign:number):V3=>{const dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz);return [sign*dz/l,0,-sign*dx/l];};
  for(let i=0;i<n;i++){
    const j=(i+1)%n;
    quad(0,at(out[i],TOP),at(out[j],TOP),at(slab[j],TOP),at(slab[i],TOP),[0,1,0]);
    quad(1,at(band[i],BOTTOM),at(band[j],BOTTOM),at(slab[j],BOTTOM),at(slab[i],BOTTOM),[0,-1,0]);
    // The outline runs anticlockwise seen from above (+X toward +Z), so (dz, -dx) points outward.
    quad(2,at(slab[i],TOP),at(slab[j],TOP),at(slab[j],BOTTOM),at(slab[i],BOTTOM),side(slab[i],slab[j],-1));
    quad(2,at(out[i],TOP),at(out[j],TOP),at(out[j],TOP-BAND),at(out[i],TOP-BAND),side(out[i],out[j],1));
    quad(2,at(out[i],TOP-BAND),at(out[j],TOP-BAND),at(band[j],TOP-BAND),at(band[i],TOP-BAND),[0,-1,0]);
    quad(2,at(band[i],TOP-BAND),at(band[j],TOP-BAND),at(band[j],BOTTOM),at(band[i],BOTTOM),side(band[i],band[j],-1));
    quad(3,at(inner[i],TOP-.15),at(inner[j],TOP-.15),at(slab[j],TOP-.15),at(slab[i],TOP-.15),[0,1,0]);
  }
  return list;
}
function geometry(base:Face[],target:Face[],keep:(m:number)=>boolean){
  const order=[0,1,2,3].filter(keep),g=new THREE.BufferGeometry(),p:number[]=[],t:number[]=[],nn:number[]=[];
  order.forEach((m,gi)=>{
    const start=p.length/3;
    base.forEach((f,i)=>{
      if(f.m!==m)return;const [a,b,c]=f.v,e=target[i].v;
      const cx=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),cy=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),cz=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      // Wind by the base triangle; the target reuses the same order so each vertex morphs to its partner.
      const idx=cx*f.n[0]+cy*f.n[1]+cz*f.n[2]<0?[0,2,1]:[0,1,2];
      for(const k of idx){p.push(...f.v[k]);t.push(...e[k]);nn.push(...f.n);}
    });
    g.addGroup(start,p.length/3-start,gi);
  });
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nn,3));
  g.morphAttributes.position=[new THREE.Float32BufferAttribute(t,3)];
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}
const Y=new THREE.Vector3(0,1,0),A=new THREE.Vector3(),D=new THREE.Vector3(),dummy=new THREE.Object3D();
const beamMatrix=(a:Vec3,b:Vec3,r:number)=>{A.set(...a);D.set(...b).sub(A);dummy.position.copy(A).addScaledVector(D,.5);dummy.quaternion.setFromUnitVectors(Y,D.clone().normalize());dummy.scale.set(r,D.length(),r);dummy.updateMatrix();return dummy.matrix.clone();};
const boxMatrix=(p:Vec3,s:Vec3,yaw:number)=>{dummy.position.set(...p);dummy.rotation.set(0,yaw,0);dummy.scale.set(...s);dummy.updateMatrix();return dummy.matrix.clone();};
// A level bar of cross-section w × h from a to b (box geometry).
const barMatrix=(a:Vec3,b:Vec3,w:number,h:number)=>{dummy.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);dummy.rotation.set(0,Math.atan2(b[0]-a[0],b[2]-a[2]),0);dummy.scale.set(w,h,Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]));dummy.updateMatrix();return dummy.matrix.clone();};
// Task 7 soffit structure: purlin rings every 5 m from 2 m behind the translucent strip, and radial girders every
// 9 m on the straights and every 18° round the corners. Both sit under the soffit and follow the opening.
const PURLIN={first:STRIP+2,pitch:5,w:.25,h:.4},GIRDER={w:.4,h:.9};
// Truss recipe from model.ts, moved onto the inner edge: chords 1 m inside the opening, bracing every 9 m,
// radial ties back to the rim (lying on the roof sheet, Task 7), and a light bar under each bay.
function edgeLayout(o:number){
  const beams:THREE.Matrix4[]=[],lights:THREE.Matrix4[]=[],stays:THREE.Matrix4[]=[],plates:THREE.Matrix4[]=[],purlins:THREE.Matrix4[]=[],girders:THREE.Matrix4[]=[];
  const {hx,hz}=hole(o);
  for(const stand of STAND_ORDER){
    const cfg=STANDS[stand],at=(u:number,d:number,y:number)=>world(stand,u,d,y),yaw=Math.atan2(cfg.out[0],cfg.out[2]);
    const half=cfg.out[0]?CZ:CX,outer=(cfg.out[0]?CX:CZ)+RR,tIn=cfg.inner+o-1;
    beams.push(beamMatrix(at(-half,tIn,39.5),at(half,tIn,39.5),.28),beamMatrix(at(-half,tIn,45),at(half,tIn,45),.24));
    for(let u=-half;u<half;u+=9){
      beams.push(beamMatrix(at(u,tIn,39.5),at(Math.min(u+4.5,half),tIn,45),.18),beamMatrix(at(Math.min(u+4.5,half),tIn,45),at(Math.min(u+9,half),tIn,39.5),.18));
      beams.push(beamMatrix(at(u,tIn,TOP+.18),at(u,outer-1,TOP+.18),.19));
      lights.push(boxMatrix(at(u,tIn,38.8),[3,.2,1],yaw));
      girders.push(barMatrix(at(u,cfg.inner+o+STRIP+.5,BOTTOM-GIRDER.h/2),at(u,outer-BAND_T-.3,BOTTOM-GIRDER.h/2),GIRDER.w,GIRDER.h));
    }
  }
  for(const [sx,sz] of [[1,1],[-1,1],[-1,-1],[1,-1]])for(let a=18;a<90;a+=18){
    const c=Math.cos(a*Math.PI/180),s=Math.sin(a*Math.PI/180),r0=STRIP+.5,r1=RR-BAND_T-.3,y=BOTTOM-GIRDER.h/2;
    girders.push(barMatrix([sx*(CX+(hx+r0)*c),y,sz*(CZ+(hz+r0)*s)],[sx*(CX+r1*c),y,sz*(CZ+r1*s)],GIRDER.w,GIRDER.h));
  }
  for(let k=PURLIN.first;Math.max(hx,hz)+k<RR-BAND_T-1.5;k+=PURLIN.pitch){
    const ring=outline(hx+k,hz+k),y=BOTTOM-PURLIN.h/2;
    ring.forEach((p,i)=>{const q=ring[(i+1)%ring.length];purlins.push(barMatrix([p[0],y,p[1]],[q[0],y,q[1]],PURLIN.w,PURLIN.h));});
  }
  // Pylon stays (hero recipe): one to the opening's corner, which follows the edge, and one to the rim. Each end
  // has an anchor: a fin plate on the mast's crown collar, and a base plate on the roof.
  const rim=(RR-1.5)*Math.SQRT1_2;
  for(const [x,z] of PYLONS){
    const sx=Math.sign(x),sz=Math.sign(z),top:Vec3=[x,PYLON.height,z];
    for(const end of [[sx*(CX+hx*Math.SQRT1_2),40,sz*(CZ+hz*Math.SQRT1_2)],[sx*(CX+rim),40,sz*(CZ+rim)]] as Vec3[]){
      stays.push(beamMatrix(top,end,.2));
      const yaw=Math.atan2(end[0]-x,end[2]-z),dx=Math.sin(yaw),dz=Math.cos(yaw);
      plates.push(boxMatrix([x+dx*1.55,PYLON.height-.55,z+dz*1.55],[.08,1.1,1.1],yaw),boxMatrix([end[0],TOP+.2,end[2]],[1.3,.7,1.3],yaw));
    }
  }
  return {beams,lights,stays,plates,purlins,girders};
}
// Edge-band panel joints every 3 m round the outline, standing 4 cm proud (close-range detail).
function joints(){
  return aroundOutline(3,RR+.02,RR).map(({x,z,ox,oz})=>boxMatrix([x,TOP-BAND/2,z],[.07,BAND-.1,.06],Math.atan2(ox,oz)));
}

export function buildRoof(m:{roofTop:THREE.Material;roofSoffit:THREE.Material;roofEdge:THREE.Material;polycarbonate:THREE.Material;steel:THREE.Material;light:THREE.Material;pylon:THREE.Material;gutter:THREE.Material}){
  const group=new THREE.Group();group.name='Roof ring, trusses and stays';
  const base=faces(ROOF_OPENING.closed),target=faces(ROOF_OPENING.cutaway);
  const slab=new THREE.Mesh(geometry(base,target,k=>k<3),[m.roofTop,m.roofSoffit,m.roofEdge]);slab.name='roof-ring';
  const strip=new THREE.Mesh(geometry(base,target,k=>k===3),m.polycarbonate);strip.name='roof-strip';strip.renderOrder=2;
  // The 8 m opening has the most purlin rings: allocate for it and draw `count` of them.
  const layout=edgeLayout(ROOF_OPENING.closed);
  const instanced=(geometry:THREE.BufferGeometry,material:THREE.Material,count:number,name:string)=>{const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=name;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);return mesh;};
  const rod=new THREE.CylinderGeometry(1,1,1,6),box=new THREE.BoxGeometry(1,1,1);
  const truss=instanced(rod,m.steel,layout.beams.length,'roof-truss'),lights=instanced(box,m.light,layout.lights.length,'roof-lights'),stays=instanced(rod.clone(),m.pylon,layout.stays.length,'pylon-stays');
  const plates=instanced(box.clone(),m.pylon,layout.plates.length,'stay-anchors');
  const purlins=instanced(box.clone(),m.steel,layout.purlins.length,'soffit-purlins'),girders=instanced(box.clone(),m.steel,layout.girders.length,'soffit-girders');
  // Gutter upstand along the outer top edge and a drip line under the edge band: real edges on the band.
  const rim=new Mesher();
  for(const p of [[RR-.35,RR+.06,TOP-.05,TOP+.28],[RR-.02,RR+.06,TOP-BAND-.04,TOP-BAND+.16]])sweep(rim,[{d:p[0],y:p[2],m:'gutter'},{d:p[1],y:p[2],m:'gutter'},{d:p[1],y:p[3],m:'gutter'},{d:p[0],y:p[3],m:'gutter'}],loop(CX,CZ,K),{closed:true});
  const rimBuilt=rim.build({gutter:m.gutter}),gutter=new THREE.Mesh(rimBuilt.geometry,rimBuilt.material);gutter.name='roof-gutter';
  const jointList=joints(),joint=new THREE.InstancedMesh(box.clone(),m.gutter,jointList.length);joint.name='edge-joints';
  jointList.forEach((mx,i)=>joint.setMatrixAt(i,mx));joint.computeBoundingSphere();
  // Roof pieces resolve stand picks from the hit point (layout.ts standAt); the stays belong to no stand.
  slab.userData.byPoint=truss.userData.byPoint=lights.userData.byPoint=gutter.userData.byPoint=true;
  group.add(slab,strip,truss,lights,stays,plates,gutter,joint,purlins,girders);
  let opening=NaN;
  function setOpening(o:number){
    if(o===opening)return;opening=o;
    const k=(o-ROOF_OPENING.closed)/(ROOF_OPENING.cutaway-ROOF_OPENING.closed);slab.morphTargetInfluences![0]=strip.morphTargetInfluences![0]=k;
    const l=edgeLayout(o);
    for(const [mesh,list] of [[truss,l.beams],[lights,l.lights],[stays,l.stays],[plates,l.plates],[purlins,l.purlins],[girders,l.girders]] as const){
      list.forEach((mx,i)=>mesh.setMatrixAt(i,mx));mesh.count=list.length;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
  setOpening(ROOF_OPENING.closed);
  // Close-range detail (joints) hides with distance; the soffit structure shows only from under the roof.
  return {group,slab,strip,solids:[slab,truss,lights,stays,plates,gutter],detail:{close:[joint],inside:[purlins,girders]},setOpening,get opening(){return opening;}};
}
