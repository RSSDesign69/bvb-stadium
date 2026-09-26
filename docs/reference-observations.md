# Reference observations

Review date: 2026-09-24. These are original descriptions of visible output, not source-code analysis. Source IDs map to `provenance/inputs.json`.

## Video: REF-VIDEO

The supplied MP4 is 1716 × 1080, 60 fps, approximately 54.58 seconds, with no audio stream reported. Review used stills at 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, and 54 seconds, plus 6–9 and 21–24 seconds to inspect transitions. Times below are approximate; this is sampled visual review, not an exhaustive playback or interaction test.

The displayed event is set in a different stadium. Its oval shape, event identities, branding, numerical values, benefit claims, and UI artwork are not Dortmund evidence and will not be reproduced.

| ID | Time | Visible evidence | Original product requirement |
| --- | --- | --- | --- |
| V01 | 00:00, 00:05 | Elevated exterior and roof views; stadium angle changes; camera controls include reset and zoom icons. | Orbit and zoom a Dortmund-specific four-stand model; provide explicit reset controls. |
| V02 | 00:05, 00:20 | Hover cards identify a place with location and price-like metadata. | Hover/focus reveals a generated place's identity, status, and demo price. |
| V03 | 00:06–00:09 | A place card changes and successive frames move from overview toward an interior view. A message reports that the chosen place is occupied and another is shown. | Make selection changes clear. For unavailable demo places, offer an explicit alternative instead of silently replacing the user's choice. |
| V04 | 00:10, 00:15 | Elevated interior viewpoints show the pitch; guidance invites looking around and zooming; a return control appears. | Limited first-person look, bounded zoom, and a prominent return action. |
| V05 | 00:20–00:24 | Overview, new place card, then a low interior viewpoint near the touchline. | Distinct generated eye positions must produce visibly different previews. |
| V06 | 00:25, 00:30 | Low viewpoint changes direction; pitch figures appear at changed positions. | User-controlled look direction and original optional match-day animation. |
| V07 | 00:35, 00:40 | Back in overview; another place card and temporary thumbnail loading text. | Restore overview and show an honest preview loading state. |
| V08 | 00:45, 00:50, 00:54 | High interior view, changed look direction, then overview. | Upper-level sample and repeatable preview/return cycle. |
| V09 | Throughout | Overview inset, separate camera diagram, and a details card with tier/block/row/place, price, benefits, image, and primary selection action. | Keep one synchronized orientation cue and place details; show only illustrative benefits and demo actions. |

The recording shows view-percentage labels, 360-degree badges, and checkout-style language. These do not substantiate calculated visibility, panoramic imagery, payment functionality, inventory accuracy, or real benefits. Terrace Atlas will not use an unvalidated numerical view score or imply a purchase.

Not established by this video: exact selectable-place count, internal geometry generation, picking technique, keyboard behavior, touch behavior, reduced motion, screen-reader support, real-time inventory, checkout operation, mini-map click behavior, error handling, or mobile performance. These are product requirements where specified, not claims about the reference.

## Screenshot: REF-SCREENSHOT

The supplied image is a single 2D ticket-selection state. It visibly contains quantity decrement/increment buttons, a two-handle price range, stand and tier dropdowns, a labeled stadium plan, zoom/reset-like icons, seats/prices tabs, and a price-category panel. The panel distinguishes some restricted-view categories. Stand labels place West at the top, South at the left, North at the right, and East at the bottom of this particular rotated plan.

S01: provide quantity, price, stand, and tier controls. S02: provide a venue orientation cue and zoom/reset. S03: present categories and restricted-view information in text as well as color. These controls' operation, inventory semantics, and underlying coordinates cannot be verified from a still image. Its prices and colored dots are not current availability data. Do not trace its plan or copy its brand assets.

## Architectural references

`IMG-AERIAL-STADIUM` visibly shows four stand masses around a rectangular pitch, connected corners, yellow external roof pylons, and truss spans around the roof opening. `IMG-INTERIOR-PANORAMA` shows steep banks of seating, tier divisions, roof trusses, and a close relationship between stands and pitch. These observations establish a visual direction, not dimensions or a named seat view. The panorama is a wide photograph, not a 360-degree capture.

The remaining five files have verified hashes and recorded source/license metadata; their visual contents were not independently inspected in Task 1. Inspect them during venue modeling before making further claims.

## Public venue facts

The official [stadium plan](https://www.bvb.de/de/en/signal-iduna-park/stadium-visit/stadium-plan.html) identifies West, East, South, and North stands, distinguishes seating from standing, and identifies the South Stand with the Yellow Wall. This supports the four-stand naming and standing-area distinction. Its prose is not a measured survey and includes potentially confusing block/accessibility wording; do not convert it directly into a seat map.

The official [ticket price page](https://www.bvb.de/de/en/tickets/ticket-information/ticket-prices.html) distinguishes categories, standing places, and concessions. It is evidence for category-based discovery, not a source of live inventory. No real prices are imported. The [stadium visit](https://www.bvb.de/de/en/signal-iduna-park/stadium-visit.html) and [Südtribüne](https://www.bvb.de/de/en/signal-iduna-park/suedtribuene.html) pages were accessed as context; no numerical capacity or dimensional claims are adopted.

## Implementation parity tracking

Tasks 8–9 now record implementation and validation in the [written behavior parity checklist](behavior-parity.md) and [quality completion record](tasks-8-9-completion.md). These map every V/S observation to the original build and explicitly document differences, test evidence, and remaining limitations. Keyboard, reduced motion, loading/error states, and performance were independently checked rather than inferred from the video.
