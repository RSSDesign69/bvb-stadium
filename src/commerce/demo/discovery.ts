import { DEMO } from '../../places/demo';
import type { Place, StandId, Tier } from '../../places/schema';

export type Category = Place['priceCategory'];
export interface DiscoveryFilters {
  stand: StandId | 'all';
  tier: Tier | 'all';
  category: Category | 'all';
  quantity: 1 | 2 | 3 | 4;
  maxPrice: number | null;
}
export const DEFAULT_FILTERS: DiscoveryFilters = {
  stand: 'all', tier: 'all', category: 'all', quantity: 1, maxPrice: null,
};
export interface DemoGroup { places: readonly Place[]; people: number; total: number; kind: Place['kind'] }

const rows = new Map<string, readonly Place[]>();
const positions = new Map<string, number>();
for (const block of DEMO.blocks) for (const section of block.sections) for (const row of section.rows) {
  rows.set(row.id, row.places);
  row.places.forEach((place, index) => positions.set(place.id, index));
}

// This is a fictional limit for the demo action, not a venue capacity or standing allocation.
export const DEMO_STANDING_PEOPLE_LIMIT = 4;

export function demoGroup(place: Place, quantity: number): DemoGroup | null {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4 || place.availability !== 'available') return null;
  if (place.kind === 'standing-area') {
    if (quantity > DEMO_STANDING_PEOPLE_LIMIT) return null;
    return { places: [place], people: quantity, total: place.demoPrice * quantity, kind: 'standing-area' };
  }
  const row = rows.get(place.rowId);
  const index = positions.get(place.id);
  if (!row || index === undefined) return null;
  const group = row.slice(index, index + quantity);
  if (group.length !== quantity || group.some((item, offset) =>
    item.kind !== 'seat' || item.seatNumber !== place.seatNumber + offset ||
    item.availability !== 'available' || item.blockId !== place.blockId)) return null;
  return { places: group, people: quantity, total: group.reduce((sum, item) => sum + item.demoPrice, 0), kind: 'seat' };
}

export function matchesDiscovery(place: Place, filters: DiscoveryFilters): boolean {
  if (filters.stand !== 'all' && place.stand !== filters.stand) return false;
  if (filters.tier !== 'all' && place.tier !== filters.tier) return false;
  if (filters.category !== 'all' && place.priceCategory !== filters.category) return false;
  if (filters.maxPrice !== null && place.demoPrice > filters.maxPrice) return false;
  // With one person, retain unavailable places so their state and alternatives stay inspectable.
  return filters.quantity === 1 || demoGroup(place, filters.quantity) !== null;
}

export function filterDemoPlaces(filters: DiscoveryFilters): Place[] {
  return DEMO.places.filter(place => matchesDiscovery(place, filters));
}

export function unavailableReason(place: Place, quantity: number): string {
  if (place.availability === 'unavailable') return 'This place is unavailable in the demo. No selection was added.';
  if (place.kind === 'standing-area') return 'This sample area cannot support that demo quantity. No space is reserved or assigned.';
  return `This generated row does not have ${quantity} consecutive available seats starting here.`;
}
