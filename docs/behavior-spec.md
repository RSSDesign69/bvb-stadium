# BVB 3D Stadium behavior specification

Version 0.1 — 2026-09-24. This specification defines intended behavior; the application is not implemented in Task 1. Evidence IDs refer to the observation log and input manifest. Details beyond those observations are original product decisions.

## Purpose and release scope

Let a visitor understand Signal Iduna Park's architecture, find an illustrative place, compare the view toward the pitch, and save a local demo selection. Choose fidelity A: recognizable architectural concept, with representative generated viewpoints. No viewpoint is currently verified against a known camera position. Real seat/row accuracy, ticket sales, real events, exact capacities, access promises, and venue-grade sightline claims are outside this release.

Keep this disclosure visible in overview, details, preview, and demo selection: **Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold.** Short contextual labels may supplement it: “Illustrative view,” “Demo price,” and “Sample standing position.”

## Journey and states

The initial state is a readable shell and a loading region. On success, show an elevated stadium overview with no committed selection, a stand legend, filters, and controls. Choosing a stand focuses it; choosing a place opens its details. “Preview view” enters a camera transition followed by a place preview. “Back to stadium” or Escape returns to the prior overview camera and selected-place context. “Add to demo selection” produces a local confirmation, without reserving inventory or taking payment.

States: `loading`, `overview`, `stand-focused`, `place-selected`, `flying-to-preview`, `preview`, `returning`, and `unavailable-3d`. Filters and demo selection are orthogonal state, not alternate camera modes. A filter change that excludes the selected place clears the selection, exits preview, restores overview, and announces why. A new selection cancels any prior camera transition; stale animation callbacks must not overwrite it. Escape during a flight cancels the flight and restores a safe overview. Focus returns to the originating control when preview closes.

## Testable requirements

| ID / task | Required user-visible behavior | Acceptance check | Basis |
| --- | --- | --- | --- |
| B01 / 2 | Black canvas, yellow primary actions, square controls, readable system typography, persistent independent-demo identity. | At 390, 768, 1024, and 1280 px widths, controls and disclosure remain usable without overlap or horizontal page overflow. | Design brief, original layout |
| B02 / 3 | Four distinct stands, a prominent South terrace, connected corners, yellow roof pylons, trusses, pitch, aisles, tunnels, barriers, and concourse structure. | Review all four elevations and interior views against curated references; reject a generic oval bowl. Keep uncertain proportions documented as assumptions. | Venue plan, imagery |
| B03 / 4 | Thousands of generated selectable seated places plus standing areas. Stable demo IDs distinguish stand, block, section, row, and seat where applicable. | Pick fixtures from each stand and resolve the same IDs across reloads. Standing locations show no assigned seat number or adjacency promise. | Task brief; standing distinction |
| B04 / 5 | Drag/orbit, bounded zoom, reset, and stand focus work by pointer, touch, and labeled controls. | Each method reaches all stands, never loses the stadium, and resets to the same overview. Touch gestures do not block use of surrounding controls. | V01, S02 |
| B05 / 5 | Hover and keyboard focus identify a place. Selection exposes details without relying on color. | Hover/focus does not change selection. Pointer/touch activation and a navigable HTML place list select the same stable ID. A drag does not accidentally select. | V02, original accessibility |
| B06 / 6 | Explicit preview action moves to a generated eye position and allows bounded look/zoom. | Low, middle, and high samples produce distinct viewpoints; geometry remains present and no flight passes through a roof/stand. View limits prevent walking outside the chosen place. | V03–V08 |
| B07 / 6 | Back/Escape restores overview; mini-map identifies stand, selected position, and facing direction. | Repeat preview/return for each stand; details, map, and camera stay synchronized, including interrupted flights. | V04, V08, V09 |
| B08 / 7 | Filter by stand, tier/category, quantity, and per-place demo price. | Combined filters update the list, map, and scene consistently; clear/reset restores results; no results gives a useful reset action. Unavailable tiers are disabled or omitted for standing areas. | S01–S03 |
| B09 / 7 | Details explain location, seated/standing type, demo category, price, availability, illustrative benefits, and known model occlusions. | Missing facts show “Not verified”; no invented view percentage, seat guarantee, official benefit, accessibility guarantee, or 360-photo claim. | V09, S03, original truthfulness |
| B10 / 7 | Demo availability has available, unavailable, and selected states. | Attempting an unavailable choice explains the state and offers an explicit alternative; it never silently swaps places. Quantity checks use generated data only; no false standing adjacency. | V03, original alternative behavior |
| B11 / 7 | Demo selection action confirms only local selection. | Confirmation repeats demo disclosure; no payment form, countdown, hold, real reservation, or “secure checkout” claim. | V09, task scope |
| B12 / 8 | Optional original crowd, lighting, pitch activity, scoreboard, and abstract boundary displays. | Pause works; moving elements cannot obscure controls or change claimed static sightlines. No real kits, players, sponsors, footage, or music. | V06, task brief |
| B13 / 2, 6, 8 | Respect reduced motion and offer an explicit atmosphere pause. | With reduced motion enabled before load or changed during use, camera jumps safely or uses a short fade; automatic orbit, flights, and continuous atmosphere stop. | Task brief; unverified in video |
| B14 / 9 | Keyboard and assistive technology can complete discovery, preview, return, and demo selection. | Visible focus, labeled buttons, logical focus order, textual availability, concise status announcements; arrow controls only capture keys while relevant controls are focused. No need to tab through thousands of canvas objects. | Original accessibility requirements |
| B15 / 9 | Handle loading, thumbnail delay, failure, empty results, and unavailable WebGL. | Simulated scene failure/context loss keeps filters/details and a simple original 2D plan/list usable; Retry is available. A failed preview never strands focus or removes Back. | V07, original resilience |

## Place and commerce semantics

Use synthetic IDs visibly distinct from official seat numbers, such as `DEMO-SOUTH-AREA-01`. The later typed schema must distinguish seated places from standing areas and carry world position, eye direction, provenance, and verification state. A standing preview samples a position within an area, not a reserved personal spot. Benefits and prices belong to demo data, with no import from a ticket shop. Keep any future verified venue data in a separate source with event/configuration dates.

A quantity filter may offer adjacent generated seats only where the synthetic row model supports it. Standing quantity represents people in a demo area. Prices use a single stated demo currency and consistent per-place/total wording. Unknown or restricted sightlines should remain visible in details; do not calculate a confidence percentage without a validated method.

## Interaction and quality targets

Keyboard: Tab through standard controls, Enter/Space activate, Escape leaves preview, and labeled directional/zoom/reset controls mirror pointer gestures. Provide a stand/block/row search or list that avoids thousands of sequential tab stops. First-person controls adjust orientation only; no unbounded free-flight mode.

Task 9 should measure latest stable desktop Chrome, Firefox, and Safari plus iOS Safari and Android Chrome on recorded device/browser versions. Initial engineering targets are median 60 fps on a representative laptop and at least 30 fps on a representative mid-range phone during navigation, with a lower-detail fallback. Record actual hardware, frame timings, and load conditions; these are targets, not achieved benchmarks. Aim for a usable shell before 3D is ready and no app-induced main-thread task over 200 ms during normal selection. Set final geometry, payload, and memory budgets after the first original model exists.

Use readable contrast (4.5:1 for normal text, 3:1 for large text and essential UI graphics), visible focus, and touch targets around 44 px where possible. Test screen-reader announcements, zoomed text, and reduced motion directly.

## Explicit gaps

No CAD/survey, measured stand elevations, row risers, licensed position-known panoramas, exact railings, verified restricted-view flags, event configuration, or ticketing contract is available. These gaps do not prevent a clearly illustrative concept. They do prevent claims of exact seat views, current availability, real benefits, or purchase capability. Selected verified sample views remain a future goal requiring additional evidence.
