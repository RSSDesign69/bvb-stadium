export type StandId = 'south' | 'west' | 'north' | 'east';
export type Tier = 'lower' | 'upper' | 'terrace';
export type Vec3 = readonly [number, number, number];
export type Availability = 'available' | 'unavailable';
export interface PlaceBase {
  id: string; blockId: string; sectionId: string; rowId: string;
  stand: StandId; tier: Tier; position: Vec3; eye: Vec3; direction: Vec3;
  priceCategory: 'terrace' | 'end' | 'sideline'; demoPrice: number;
  benefits: readonly string[]; availability: Availability;
  provenance: 'generated-demo-v1'; verified: false;
  sightline: 'Unverified — illustrative geometry';
}
export type Place = PlaceBase & (
  { kind: 'seat'; seatNumber: number; rowNumber: number } |
  { kind: 'standing-area'; areaLabel: string; sampleBand: number }
);
export interface Row { id: string; number: number; kind: 'seated-row' | 'terrace-band'; places: Place[] }
export interface Section { id: string; tier: Tier; rows: Row[] }
export interface Block { id: string; label: string; stand: StandId; center: number; width: number; sections: Section[] }
export interface PlaceDataset { provenance: 'generated-demo-v1'; blocks: Block[]; places: Place[] }
