# Task 7 — discovery and demo selection

Completed 2026-09-24 at concept fidelity. The interface uses generated data only. Prices and availability are fictional EUR examples, with no ticketing connection, purchase, reservation, or live event inventory.

## Delivered

- Combined stand, tier, category, people, and maximum per-person demo-price filters. South standing areas omit the seated tiers, while seated stands omit the terrace tier. A clear action and a no-results reset restore the full list.
- A paged, keyboard-operable result list and block/section/row/place controls limited to matching generated places. The scene dims nonmatching places and excludes them from picking; the mini-map shows the filtered stand or selected place. Changing filters clears an excluded selection and returns a preview to overview.
- Textual available, unavailable, and selected states, with an availability legend. An unavailable place remains inspectable at quantity one, explains why it cannot be added, and offers an explicit available alternative.
- For seated groups, a quantity of two to four requires consecutive available generated seats in the same row and block. For standing areas, a quantity describes people associated with one illustrative sample area, without an assigned spot or adjacency promise. The standing demo action is capped at four people; this is not a venue capacity claim.
- Selected-place details include location, type, tier, category, price per person, availability, illustrative features, and an explicit unverified sightline/occlusion notice. Adding a place creates a local confirmation with a demo total and repeated no-ticket disclosure. The selection can be removed; no payment or hold state exists.

## Verification

- `npm run build` passes strict TypeScript and Vite production compilation.
- `npm test` includes deterministic quantity and combined-filter checks, alongside the existing geometry and camera suites.
- `npm run test:browser` still passes pointer picking, all four stand previews, reduced motion, keyboard/touch navigation, responsive widths, and WebGL fallback.
- `npm run test:discovery` passes combined filtering, tier-option behavior, standing and seated group totals, local confirmation, preview reset when a filter excludes the selected place, empty state, unavailable alternative, and 390 px overflow check.
- `npm run check` passes the clean-room inventory and history audit.

The quantity and availability rules are generated demo logic. They do not establish real seat adjacency, standing capacity, prices, benefits, or inventory. Full cross-browser and assistive-technology verification remains Task 9.
