import type { StandId, Tier, Vec3 } from '../places/schema';
// Original concept dimensions in metres; no measured stand/row data.
// World axes: +X east, +Z south, +Y up. Pitch convention: 105 x 68 m.
export const STAND_ORDER: StandId[] = ['south', 'west', 'north', 'east'];
export const STANDS: Record<StandId, { name: string; localName: string; out: Vec3; tangent: Vec3; length: number; blocks: number; inner: number }> = {
  south: { name: 'South stand', localName: 'Südtribüne', out: [0,0,1], tangent: [-1,0,0], length: 90, blocks: 6, inner: 61 },
  west: { name: 'West stand', localName: 'Westtribüne', out: [-1,0,0], tangent: [0,0,1], length: 126, blocks: 7, inner: 41 },
  north: { name: 'North stand', localName: 'Nordtribüne', out: [0,0,-1], tangent: [1,0,0], length: 90, blocks: 5, inner: 61 },
  east: { name: 'East stand', localName: 'Osttribüne', out: [1,0,0], tangent: [0,0,-1], length: 126, blocks: 7, inner: 41 },
};
export interface TierLayout { tier: Tier; rows: number; depth: number; rise: number; floor: number; offset: number }
export function tiers(stand: StandId): TierLayout[] {
  return stand === 'south'
    ? [{tier:'terrace',rows:44,depth:.9,rise:.64,floor:2,offset:0}]
    : [{tier:'lower',rows:20,depth:.9,rise:.55,floor:2,offset:0},
       {tier:'upper',rows:24,depth:.92,rise:.64,floor:16,offset:23}];
}
export function world(stand: StandId, along: number, depth: number, height: number): Vec3 {
  const {out,tangent}=STANDS[stand];
  return [out[0]*depth+tangent[0]*along,height,out[2]*depth+tangent[2]*along];
}
export function rowFloor(t: TierLayout, row: number) { return t.floor + row*t.rise; }
export function rowDepth(stand: StandId,t: TierLayout,row: number) { return STANDS[stand].inner+t.offset+row*t.depth; }
// The inner rows leave an opening at the centre of each block for a vomitory.
export function inTunnel(row: number, alongInBlock: number) { return row < 5 && Math.abs(alongInBlock)<1.35; }
