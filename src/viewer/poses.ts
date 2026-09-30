// Dev-only capture poses for scripts/explorer-captures.cjs, applied through ?explorer-pose=<name>.
// Orbit poses are spherical around a target (three's convention: phi from +Y, theta from +Z toward +X).
// Place poses run a seat preview of samplePlace(middle block of the stand, level), always with the roof on.
import type { StandId, Vec3 } from '../places/schema';
import { HOME, HOME_TARGET } from './camera';
export type DevPose =
  | { kind:'orbit'; cutaway:boolean; target:Vec3; fov:number; position?:Vec3; theta?:number; phi?:number; radius?:number; fit?:boolean }
  | { kind:'place'; stand:StandId; level:'low'|'middle'|'high' };
// The match clock is frozen here so the crowd, players, ball and scoreboard are identical on every run.
export const POSE_CLOCK=24;
// hero-match: the hero's camera direction (azimuth 45° from the NW, elevation 30°, src/hero/framing.ts HERO_VIEW)
// with a long lens, so perspective approaches the hero's orthographic read. `fit` frames the 210 × 252 m plate.
export const HERO_AZIMUTH=Math.PI/4,HERO_ELEVATION=Math.PI/6;
export const POSES:Record<string,DevPose>={
  'home-cutaway':{kind:'orbit',cutaway:true,position:HOME,target:HOME_TARGET,fov:43},
  'home-roof':{kind:'orbit',cutaway:false,position:HOME,target:HOME_TARGET,fov:43},
  'hero-match':{kind:'orbit',cutaway:false,target:[0,0,0],fov:12,theta:Math.PI+HERO_AZIMUTH,phi:Math.PI/2-HERO_ELEVATION,fit:true},
  'exterior-low':{kind:'orbit',cutaway:false,target:HOME_TARGET,fov:43,theta:Math.PI/4,phi:1.05,radius:400},
  // The close poses aim at the outer wall itself (the orbit's minimum distance, 150 m, measured from the wall):
  // orbiting the pitch centre at 150 m puts the camera above the roof, where no façade is visible.
  'facade-close':{kind:'orbit',cutaway:false,target:[-92.5,17,0],fov:43,theta:-Math.PI/2,phi:1.05,radius:150},
  'corner-close':{kind:'orbit',cutaway:false,target:[78.3,17,-97.3],fov:43,theta:Math.PI*.75,phi:1.05,radius:150},
  // Straight down (just inside the orbit's minimum polar angle): the ring cutaway's reach, and roof pick occlusion.
  'top-down':{kind:'orbit',cutaway:true,target:[0,0,0],fov:43,theta:0,phi:.18,radius:420},
  // Inside the bowl, cutaway on, looking into the NE corner: stand ends, corner sweep and the tier junctions.
  'bowl-corner':{kind:'orbit',cutaway:true,position:[-5,62,10],target:[62,12,-78],fov:43},
  // Task 8 district reviews: the service buildings and forecourt road from the stadium side, and the east car park
  // with its planted islands, trees and the railway beyond.
  'district-south':{kind:'orbit',cutaway:false,position:[60,70,190],target:[-20,0,320],fov:43},
  'parking-east':{kind:'orbit',cutaway:false,position:[150,45,-150],target:[300,0,-20],fov:43},
  'preview-south':{kind:'place',stand:'south',level:'middle'},
  'preview-west-upper':{kind:'place',stand:'west',level:'high'},
  'preview-east-lower':{kind:'place',stand:'east',level:'low'},
  'phone-home':{kind:'orbit',cutaway:true,position:HOME,target:HOME_TARGET,fov:43},
};
// Everything the hero frames: the plate corners at ground level and the pylon tips (62 m).
export const FIT_POINTS:Vec3[]=[-1,1].flatMap(sx=>[-1,1].flatMap(sz=>[[sx*105,0,sz*126],[sx*88,62,sz*74],[sx*57,62,sz*112]] as Vec3[]));
