# Reference behavior parity — Task 9

Compared 2026-09-25 against the timestamped user-visible observations in [reference-observations.md](reference-observations.md), originally sampled from the supplied approximately 55-second video. No reference source code, shaders, geometry, artwork, or commercial data were inspected or reused. Tested build: current Tasks 8–9 working tree, package 0.6.0, original procedural model. This is behavioral comparison, not pixel/venue equivalence.

| Reference | Implemented behavior and test | Result / deliberate limit |
| --- | --- | --- |
| V01, 0:00/0:05 | Elevated original four-stand model, orbit/zoom, reset, full-roof/cutaway. `test:browser` pointer/roof/reset checks. | Pass; Dortmund concept geometry, not the reference's oval stadium. |
| V02, 0:05/0:20 | Hover card; keyboard-equivalent result/place controls and text details. Actual known-seat projection and pointer pick checked. | Pass; generated IDs/prices only. |
| V03, 0:06–0:09 | Selection, routed flight, unavailable state, explicit available-alternative action. Browser and discovery suites. | Pass; alternative is chosen explicitly, not silently substituted. |
| V04, 0:10/0:15 | Bounded interior look and zoom, prominent Back/Escape, focus restoration. | Pass in representative previews. No measured seat-view claim. |
| V05, 0:20–0:24 | Distinct generated low/middle/high eye positions for every block; twelve rendered stand/height previews. | Pass; standing-area samples are unassigned. |
| V06, 0:25/0:30 | Look direction changes; original players, ball and crowd move. Atmosphere pause/off and clear-view controls. | Pass; fictional match and anonymous geometry. |
| V07, 0:35/0:40 | Repeatable return to saved overview, loading/error state, Retry. | Pass; scene loading replaces thumbnail loading because previews are rendered, not photographs. |
| V08, 0:45/0:50/0:54 | Upper/mid/low previews, look changes, repeatable overview return. | Pass; full roof remains in previews. |
| V09, throughout | Synchronized position/direction mini-map, generated block/section/row/place details, demo price/features, local demo selection. | Pass for relevant concept behavior. No photographic preview, 360 capture badge, verified benefits, checkout or numerical view score. |
| S01, screenshot | Stand/tier/category/quantity/max-price controls and matching results. | Pass. Uses a maximum-price selector rather than copying the two-handle slider. No live inventory. |
| S02, screenshot | Orientation map, labeled zoom/reset. | Pass. North-up map rather than the reference's rotated plan. |
| S03, screenshot | Text price categories, available/unavailable state, and explicit unverified sightline/occlusion explanation. | Concept scope checked. No fabricated restricted-view categories or seat-level certification. |

Evidence: `tests/browser.cjs`, `tests/discovery.browser.cjs`, `tests/quality.browser.cjs`, and `tests/model.test.ts`; generated screenshots/report in `.cache/qa/`. [The completion record](tasks-8-9-completion.md) lists test environments, metrics, and limits. Keyboard, touch, reduced motion, loading failures, accessibility, and performance are independent product checks: the supplied video does not establish those capabilities of the reference.
