import * as THREE from 'three';
// Profile sweeps: a closed 2D cross-section (d outward from the pitch, y up) carried along a path of stations.
// Each profile point names the material of the edge that starts at it; '' marks a face that is never seen
// (on the ground or buried in the wall) and is not emitted. Caps close open sweeps with the full profile.
export type V3=[number,number,number];
export interface P2 { d:number; y:number; m:string }
// A station places the profile: world = base + out * d, at height y. t is the path direction there.
export interface Station { bx:number; bz:number; ox:number; oz:number; tx:number; tz:number }
export const straight=(out:readonly number[],tangent:readonly number[],u0:number,u1:number):Station[]=>
  [u0,u1].map(u=>({bx:tangent[0]*u,bz:tangent[2]*u,ox:out[0],oz:out[2],tx:tangent[0],tz:tangent[2]}));
// Quarter arc around (cx, cz) from the +X side (θ = 0) to the +Z side (θ = π/2), mirrored by sx and sz.
export const arc=(cx:number,cz:number,sx:number,sz:number,segments:number,a0=0,a1=Math.PI/2):Station[]=>
  Array.from({length:segments+1},(_,k)=>{const a=a0+(a1-a0)*k/segments;return {bx:cx,bz:cz,ox:sx*Math.cos(a),oz:sz*Math.sin(a),tx:-sx*Math.sin(a),tz:sz*Math.cos(a)};});
// The closed rounded rectangle: quarter arcs around (±cx, ±cz), joined by straight runs (one quad each).
export const loop=(cx:number,cz:number,segments:number):Station[]=>[[1,1],[-1,1],[-1,-1],[1,-1]].flatMap(([sx,sz],q)=>
  Array.from({length:segments+1},(_,k)=>{const a=(q+k/segments)*Math.PI/2;return {bx:sx*cx,bz:sz*cz,ox:Math.cos(a),oz:Math.sin(a),tx:-Math.sin(a),tz:Math.cos(a)};}));

export class Mesher {
  private parts=new Map<string,{p:number[];n:number[];t:number[]}>();
  tag=0;
  private part(m:string){let q=this.parts.get(m);if(!q)this.parts.set(m,q={p:[],n:[],t:[]});return q;}
  // Winding follows the intended normal, so every front face points out of the solid.
  tri(m:string,a:V3,b:V3,c:V3,na:V3,nb:V3,nc:V3){
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;
    if(fx*fx+fy*fy+fz*fz<1e-12)return;
    if(fx*(na[0]+nb[0]+nc[0])+fy*(na[1]+nb[1]+nc[1])+fz*(na[2]+nb[2]+nc[2])<0){[b,c]=[c,b];[nb,nc]=[nc,nb];}
    const q=this.part(m);q.p.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);q.n.push(na[0],na[1],na[2],nb[0],nb[1],nb[2],nc[0],nc[1],nc[2]);q.t.push(this.tag);
  }
  quad(m:string,a:V3,b:V3,c:V3,d:V3,na:V3,nb:V3,nc:V3,nd:V3){this.tri(m,a,b,c,na,nb,nc);this.tri(m,a,c,d,na,nc,nd);}
  // One geometry with a group per material, plus a per-triangle tag (in group order) for picking.
  build(materials:Record<string,THREE.Material>){
    const keys=[...this.parts.keys()].sort(),parts=keys.map(k=>this.parts.get(k)!),geometry=new THREE.BufferGeometry();
    const size=parts.reduce((a,q)=>a+q.p.length,0),p=new Float32Array(size),n=new Float32Array(size),t=new Uint8Array(size/9);
    let at=0;parts.forEach((q,i)=>{geometry.addGroup(at/3,q.p.length/3,i);p.set(q.p,at);n.set(q.n,at);t.set(q.t,at/9);at+=q.p.length;});
    geometry.setAttribute('position',new THREE.BufferAttribute(p,3));geometry.setAttribute('normal',new THREE.BufferAttribute(n,3));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return {geometry,material:keys.map(k=>materials[k]),tags:t};
  }
}

// sides:false emits only the caps (a region that closes the side of a neighbouring, larger sweep).
export function sweep(mesh:Mesher,profile:P2[],stations:Station[],{closed=false,cap='concrete',sides=true}:{closed?:boolean;cap?:string|null;sides?:boolean}={}){
  const pts=profile.filter((p,i)=>{const q=profile[(i+1)%profile.length];return Math.hypot(q.d-p.d,q.y-p.y)>1e-6;});
  let area=0;pts.forEach((p,i)=>{const q=pts[(i+1)%pts.length];area+=p.d*q.y-q.d*p.y;});const s=Math.sign(area);
  const at=(st:Station,p:P2):V3=>[st.bx+st.ox*p.d,p.y,st.bz+st.oz*p.d];
  const spans=closed?stations.length:stations.length-1;
  if(sides)pts.forEach((a,i)=>{
    if(!a.m)return;const b=pts[(i+1)%pts.length],ed=b.d-a.d,ey=b.y-a.y,len=Math.hypot(ed,ey),nd=s*ey/len,ny=-s*ed/len;
    for(let j=0;j<spans;j++){
      const s0=stations[j],s1=stations[(j+1)%stations.length],n0:V3=[s0.ox*nd,ny,s0.oz*nd],n1:V3=[s1.ox*nd,ny,s1.oz*nd];
      mesh.quad(a.m,at(s0,a),at(s0,b),at(s1,b),at(s1,a),n0,n0,n1,n1);
    }
  });
  if(closed||!cap)return;
  const faces=THREE.ShapeUtils.triangulateShape(pts.map(p=>new THREE.Vector2(p.d,p.y)),[]);
  for(const [st,sign] of [[stations[0],-1],[stations[stations.length-1],1]] as const){
    const n:V3=[st.tx*sign,0,st.tz*sign];
    for(const [a,b,c] of faces)mesh.tri(cap,at(st,pts[a]),at(st,pts[b]),at(st,pts[c]),n,n,n);
  }
}
