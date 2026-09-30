import { BOWL, PYLON, PYLONS, ROOF_Y, WALL_HEIGHT } from '../hero/framing';
import type { Vec3 } from '../places/schema';
import { arc, loop, sweep, type Mesher, type P2, type Station } from './sweep';

// Outer shell: the hero's closed outline (straight stand walls plus quarter arcs of radius 48.5 m around
// (±44, ±63), read from src/hero/framing.ts) as one continuous wall, with a heavier base course, a coping,
// a recessed louvre band up to the roof, and a curtain-wall zone of four glazing rows with structural fins every
// 8–9 m (the hero's rhythm).
// Task 7 depth: each glazing row is recessed 0.35 m behind the cladding, under a head reveal and over a
// projecting floor-slab nose; secondary mullions every 1.7 m stand 0.25 m proud of the glass. Six entrances are
// cut into the wall's lower band, and two stair cores stand against each corner arc.
// Profiles are in radius coordinates around each corner centre; the wall's centre line sits on the outline.
export const WALL={half:.55,base:-.3,plinth:1.5,top:WALL_HEIGHT-.6,coping:WALL_HEIGHT+.2};
export const GLASS_ROWS=[5,12,23,30],GLASS_HALF=1.35;
export const FACE={cladding:.55,glass:.2,nose:.75,slab:.4}; // outward offsets from the outline (m), slab nose depth
export const ENTRY={head:3,door:-.45,canopy:6.5};           // entrance recess head, door plane, canopy reach
export const SEGMENTS=24; // per quarter arc: smooth at corner-close
const R=BOWL.wallRadius,CX=BOWL.cornerX,CZ=BOWL.cornerZ;
const rect=(d0:number,d1:number,y0:number,y1:number,[bottom,outer,top,inner]:string[]):P2[]=>
  [{d:d0,y:y0,m:bottom},{d:d1,y:y0,m:outer},{d:d1,y:y1,m:top},{d:d0,y:y1,m:inner}];
// Entrances sit between two structural fins on each straight run: W and E twice (z = ±33.6), N and S once across
// two bays (x = 0, the middle fin stays as a pier). side: outward normal; [u0, u1]: span along the run.
export interface Entrance { ox:number; oz:number; u0:number; u1:number }
export const ENTRANCES:Entrance[]=[
  ...[-1,1].flatMap(ox=>[[-37.6,-29.6],[29.6,37.6]].map(([u0,u1])=>({ox,oz:0,u0,u1}))),
  ...[-1,1].map(oz=>({ox:0,oz,u0:-8.6,u1:8.6})),
];
// Stair cores: two per corner, at 30° and 60° round the arc from the E/W side; 7 m wide, 5 m proud, 22 m tall.
export const CORES={angles:[30,60],width:7,depth:5,height:22};
// A point on a straight run: base on the side's centre line, `u` along it (x on N/S, z on E/W).
const station=(ox:number,oz:number,u:number):Station=>({bx:ox?ox*CX:u,bz:oz?oz*CZ:u,ox,oz,tx:oz?1:0,tz:ox?1:0});
// The loop as open pieces: four arcs, and the four straight runs split at the entrances.
function pieces(){
  const out:{stations:Station[];entry:boolean;edge:boolean}[]=[];
  for(const [sx,sz] of [[1,1],[-1,1],[-1,-1],[1,-1]])out.push({stations:arc(sx*CX,sz*CZ,sx,sz,SEGMENTS),entry:false,edge:false});
  for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const half=ox?CZ:CX,cuts=ENTRANCES.filter(e=>e.ox===ox&&e.oz===oz).sort((a,b)=>a.u0-b.u0);let u=-half;
    for(const e of cuts){out.push({stations:[station(ox,oz,u),station(ox,oz,e.u0)],entry:false,edge:true},{stations:[station(ox,oz,e.u0),station(ox,oz,e.u1)],entry:true,edge:false});u=e.u1;}
    out.push({stations:[station(ox,oz,u),station(ox,oz,half)],entry:false,edge:cuts.length>0});
  }
  return out;
}
// The wall above the entrance head: cladding with the four recessed glazing rows. bottom names the underside
// (the entrance recess ceiling); elsewhere it is buried on the lower band.
function upper(bottom:string):P2[]{
  const c=R+FACE.cladding,out:P2[]=[{d:R-WALL.half,y:ENTRY.head,m:bottom},{d:c,y:ENTRY.head,m:'cladding'}];
  for(const h of GLASS_ROWS){
    const y0=h-GLASS_HALF,y1=h+GLASS_HALF,n=R+FACE.nose,g=R+FACE.glass;
    // Slab nose (underside, face, sill), the recessed glass, then the head reveal back out to the cladding.
    out.push({d:c,y:y0-FACE.slab,m:'slabEdge'},{d:n,y:y0-FACE.slab,m:'slabEdge'},{d:n,y:y0,m:'slabEdge'},{d:g,y:y0,m:'facadeGlass'},{d:g,y:y1,m:'reveal'},{d:c,y:y1,m:'cladding'});
  }
  out.push({d:c,y:WALL.top,m:''},{d:R-WALL.half,y:WALL.top,m:'parapet'});
  return out;
}
export function buildWall(mesh:Mesher){
  const path=loop(CX,CZ,SEGMENTS),add=(p:P2[])=>sweep(mesh,p,path,{closed:true});
  const lower=rect(R-WALL.half,R+FACE.cladding,WALL.base,ENTRY.head,['','cladding','','parapet']);
  // The entrance's lower band is only the thin wall behind the glazed doors.
  const door=rect(R-WALL.half,R+ENTRY.door,WALL.base,ENTRY.head,['','doorGlass','','parapet']);
  // Base course: a 1.0 m plinth face with a chamfer back to a ledge at 1.5 m.
  const base:P2[]=[{d:R+.5,y:WALL.base,m:''},{d:R+1.05,y:WALL.base,m:'plinth'},{d:R+1.05,y:1,m:'plinth'},{d:R+.85,y:WALL.plinth,m:'plinth'},{d:R+.5,y:WALL.plinth,m:''}];
  for(const {stations,entry,edge} of pieces()){
    // Pieces beside an entrance keep their end caps: they are the recess's side walls (the far caps are buried).
    sweep(mesh,entry?door:lower,stations,{cap:edge?'reveal':null});
    sweep(mesh,upper(entry?'reveal':''),stations,{cap:null});
    if(!entry)sweep(mesh,base,stations,{cap:edge?'plinth':null});
  }
  add(rect(R-.75,R+.85,WALL.top,WALL.coping,['parapet','parapet','parapet','parapet']));
  // Recessed louvre band from the coping up to the roof soffit: a shadow gap, so the bowl never shows through.
  add(rect(R-.45,R-.2,WALL.coping,ROOF_Y-.35,['','louvre','','louvre']));
}
// Structural fin positions along the outline, every 8–9 m per straight run or arc (the hero's rhythm), each with
// its outward direction. Fins that would clip a pylon mast standing just outside the wall are left out.
export function mullions():{position:Vec3;out:[number,number]}[]{
  const out:{position:Vec3;out:[number,number]}[]=[],d=R+.8;
  const corners=[[1,1],[-1,1],[-1,-1],[1,-1]];
  corners.forEach(([sx,sz],q)=>{
    const a0=q*Math.PI/2,n=Math.round(R*Math.PI/2/8.5);
    for(let i=0;i<n;i++){const a=a0+i/n*Math.PI/2,ox=Math.cos(a),oz=Math.sin(a);out.push({position:[sx*CX+ox*d,0,sz*CZ+oz*d],out:[ox,oz]});}
    // Straight run to the next corner, starting where this arc ends.
    const a1=a0+Math.PI/2,ox=Math.round(Math.cos(a1)),oz=Math.round(Math.sin(a1)),[nx,nz]=corners[(q+1)%4];
    const p:[number,number]=[sx*CX+ox*d,sz*CZ+oz*d],e:[number,number]=[nx*CX+ox*d,nz*CZ+oz*d],len=Math.hypot(e[0]-p[0],e[1]-p[1]),m=Math.round(len/8.5);
    for(let i=0;i<m;i++)out.push({position:[p[0]+(e[0]-p[0])*i/m,0,p[1]+(e[1]-p[1])*i/m],out:[ox,oz]});
  });
  return out.filter(({position:[x,,z]})=>PYLONS.every(([px,pz])=>Math.hypot(x-px,z-pz)>PYLON.radius+1));
}
// Distance along the outline in one quadrant (the glass shader's pane coordinate, materials.ts tpRingS): x on the
// N/S run, then round the arc at radius R, then back along the E/W run to z = 0.
export const QUARTER=CX+R*Math.PI/2+CZ;
export const PANE=QUARTER/Math.round(QUARTER/1.7);   // secondary mullion and glass pane pitch, about 1.7 m
// r is the arc radius the distance is measured at; d the radius the point is placed at.
export function along(s:number,d:number,r=R):{x:number;z:number;ox:number;oz:number}{
  if(s<=CX)return {x:s,z:CZ+d,ox:0,oz:1};
  if(s<CX+r*Math.PI/2){const a=(s-CX)/r;return {x:CX+d*Math.sin(a),z:CZ+d*Math.cos(a),ox:Math.sin(a),oz:Math.cos(a)};}
  return {x:CX+d,z:CZ-(s-CX-r*Math.PI/2),ox:1,oz:0};
}
// Points every `pitch` metres of outline (measured at arc radius r), mirrored into all four quadrants.
export function aroundOutline(pitch:number,d:number,r=R):{x:number;z:number;ox:number;oz:number}[]{
  const quarter=CX+r*Math.PI/2+CZ,n=Math.round(quarter/pitch),out:{x:number;z:number;ox:number;oz:number}[]=[];
  for(let k=0;k<=n;k++){const p=along(k*quarter/n,d,r);
    for(const sx of p.x<1e-6?[1]:[1,-1])for(const sz of p.z<1e-6?[1]:[1,-1])out.push({x:sx*p.x,z:sz*p.z,ox:sx*p.ox,oz:sz*p.oz});}
  return out;
}
// Secondary mullions: one every PANE metres of outline in all four quadrants (mirrored), skipping fins and masts.
export function paneMullions(d:number):{position:Vec3;out:[number,number]}[]{
  const fins=mullions(),f=R+.8; // fins are placed at radius R + 0.8: compare there
  return aroundOutline(PANE,d).filter(({x,z,ox,oz})=>{const fx=x+ox*(f-d),fz=z+oz*(f-d);
    return fins.every(m=>Math.hypot(m.position[0]-fx,m.position[2]-fz)>=.45)&&PYLONS.every(([px,pz])=>Math.hypot(fx-px,fz-pz)>=PYLON.radius+.6);})
    .map(({x,z,ox,oz})=>({position:[x,0,z] as Vec3,out:[ox,oz] as [number,number]}));
}
// Stair core placements: centre on the outline at the given arc angle, with the outward direction.
export function cores():{x:number;z:number;ox:number;oz:number}[]{
  return [[1,1],[-1,1],[-1,-1],[1,-1]].flatMap(([sx,sz])=>CORES.angles.map(deg=>{const a=deg*Math.PI/180,ox=sx*Math.cos(a),oz=sz*Math.sin(a);return {x:sx*CX+ox*R,z:sz*CZ+oz*R,ox,oz};}));
}
