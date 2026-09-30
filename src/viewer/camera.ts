import type { StandId, Vec3 } from '../places/schema';
import { STANDS, world } from '../stadium/layout';
export const HOME:Vec3=[235,205,270];
export const HOME_TARGET:Vec3=[0,8,0];
export type Pose={position:Vec3; target:Vec3; fov:number};
// Stand focus faces the chosen block from across the bowl, 180 m away and just over 30° up (inside the orbit's
// polar limit), so every row of the stand shows under the cutaway roof ring, as a spectator opposite would see it.
export function focusPose(stand:StandId,along:number):Pose{
  const depth=STANDS[stand].inner+20,elevation=31*Math.PI/180,r=180;
  return {position:world(stand,along*.6,depth-r*Math.cos(elevation),15+r*Math.sin(elevation)),target:world(stand,along,depth,15),fov:43};
}
export type Flight={points:Vec3[]; destination:Pose; elapsed:number; duration:number};
export function previewRoute(from:Vec3,eye:Vec3):Vec3[]{
  const altitude=Math.max(82,from[1]);
  return [from,[from[0],altitude,from[2]],[0,altitude,0],[0,eye[1]+2,0],eye];
}
export function returnRoute(from:Vec3,destination:Vec3):Vec3[]{
  const altitude=Math.max(82,destination[1]);
  return [from,[0,from[1]+2,0],[0,altitude,0],[destination[0],altitude,destination[2]],destination];
}
export function routePoint(points:Vec3[],progress:number):Vec3{
  if(progress<=0)return points[0];if(progress>=1)return points[points.length-1];
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1],p[2]-points[i][2]));
  let remaining=Math.max(0,Math.min(1,progress))*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
    if(remaining<=lengths[i]&&lengths[i]>0){const f=remaining/lengths[i];return points[i].map((v,j)=>v+(points[i+1][j]-v)*f) as unknown as Vec3;}
    remaining-=lengths[i];
  }
  return points[points.length-1];
}
