# Stadium explorer flow specification

This specification defines the four-stage architectural seat-view experience. A place is always illustrative generated data; selecting or previewing it never represents a ticket, reservation, verified sightline, or live inventory.

## Interaction model

The four stages are **Choose stand → Choose place → Review place → Preview or save**. The displayed `Step NN of 04` is derived from the current flow stage and selection/view state; it is never decorative or hard-coded. Stage labels accompany the number. The scene remains available throughout discovery.

| Stage | Entry and exit conditions | Primary action | Secondary actions (up to two) |
|---|---|---|---|
| 1. Choose stand | Entry: no stand has been committed in this flow, or the user chooses Edit stand. Exit: a stand is selected by its scene region or stand control. | Choose a stand (the selection itself advances). | View all stands; use the scene to explore. |
| 2. Choose place | Entry: a stand is committed. Show at most three representative viewpoints for that stand, labelled by relative view (lower, middle, upper where available); do not require a generated-place list. Exit: choose a representative view or, in Advanced mode, choose an exact place. | Choose a representative view. | Change stand; disclose “Choose an exact place.” |
| 3. Review place | Entry: a place has been chosen. Show its identifying description, stand/block location, type, and an explicit unverified-sightline note. Exit: preview or edit the place/stand. | Continue to Preview this view. | Change place; change stand. |
| 4. Preview or save | Entry: the selected place is framed in the scene, or a prior preview is reopened. Exit: return to review/discovery, or save/remove the viewpoint locally. | Preview this view when not yet previewing; otherwise Save viewpoint (or View saved viewpoint when one is saved). | Change place; return to stadium overview. |

No stage may expose more than four peer decisions. Within Stage 2, representative views are capped at three and Advanced mode is one disclosure decision. Advanced controls are grouped inside that disclosure, not presented as peer choices in the novice stage. Within the final stage, preview, save, and navigation are actions on one reviewed viewpoint, not competing discovery choices.

## Navigation and state preservation

- **Back** follows the stage order: Preview → Review → Choose place → Choose stand. The scene’s Back/Escape control and a visible Back action use the same transition. Escape retains its current camera-back behavior and must not dismiss an unrelated dialog or steal focus from it.
- **Edit place** from Review or Preview returns to Choose place with the selected stand, active filters, Advanced disclosure state, exact selectors, and scroll position preserved. The current place remains selected until another valid place is chosen.
- **Edit stand** returns to Choose stand. Choosing a different stand updates the stand filter, clears incompatible place selection, resets tier to all, and opens Choose place for the new stand. Other Advanced filter values remain unless incompatible with the new stand; if a value must be normalized, explain that in an announced status.
- Returning from Preview to Review preserves the place and restores focus to the initiating preview control when it remains available. Moving focus to the scene for a preview must not make keyboard navigation lose its way back to the panel.
- Selecting another place replaces the one selected-place model everywhere. A saved viewpoint is independent local component state; changing the current selection does not silently overwrite it.

## Novice and Advanced paths

### Novice path

1. Choose a stand.
2. Choose one of up to three representative views for that stand.
3. Review the selected illustrative place and its location/type/sightline disclosure.
4. Preview the view, then optionally save that viewpoint.

The novice path reaches Preview without pagination, price, quantity, block, row, seat, category, or availability controls. It never requires traversing the complete generated-place dataset.

### Advanced path

Stage 2 contains a native `<details>/<summary>` disclosure explicitly labelled **“Choose an exact place”**. It contains the existing filters (stand, tier, category, people, and optional maximum demo price), matching-place results and pagination, and exact block/tier/row/place selectors. Exact selection enters Review. The filter form and selectors retain their values when the user closes/reopens the disclosure or navigates back from Review/Preview. Generated price and availability are clearly marked optional fictional demo metadata and do not enter the novice path.

## Synchronization rules

- Maintain one canonical selected-place identifier. The scene canvas, stand switcher, representative-view choices, Advanced results, exact selectors, review content, minimap, and Preview all read or update that selection; none owns a competing selection.
- A canvas place click selects that place and enters Review. A canvas click on a stand with no place selects/focuses that stand and enters Choose place.
- A stand-switcher choice and a scene stand choice have identical effects: set the stand, clear an incompatible place, reset incompatible tier to all, focus that stand, and show Choose place.
- A representative view chooses the corresponding available sample for the committed stand and enters Review. When an exact sample is absent under active filters, choose the nearest matching generated sample within that stand and make no claim that it is measured or exact.
- An Advanced result or exact-selector confirmation chooses the same canonical place and enters Review. Changing a filter that excludes the selected place clears that selection and returns to Choose place with a concise live announcement. Pagination changes only the visible result slice, never the selected place.
- Review and Preview descriptions always resolve from the canonical place identifier. The minimap highlights its stand; camera preview uses its illustrative position/direction. An unavailable demo marker remains inspectable, but must not imply a purchasable option.

## Loading, empty, unavailable, error, and motion behavior

- **Loading:** keep Stage 1/2 usable while the model builds. Announce “Building the ground” as a status; disable only scene-dependent camera/preview actions. Controls for selecting a place remain available where their data is ready.
- **Empty results:** keep the Advanced disclosure and filters visible, state that no places match, and offer Reset filters. Do not show stale review information for a cleared selection.
- **Unavailable data:** preserve any already-rendered scene and show a clear inline explanation plus Retry when the model/data can be retried. The place explorer remains usable whenever generated place data is loaded. Never disguise an unavailable generated sample as a verified real-world state.
- **WebGL/model error:** expose the existing alert and retry/reload recovery. Keep stand and place exploration usable without WebGL, including selection and illustrative review text; disable only actions that require the camera. Preserve the non-WebGL fallback and keyboard access.
- **Reduced motion:** respect `prefers-reduced-motion` for camera transitions and decorative atmosphere. Use an immediate/short non-animated camera change where a preview remains available; state that decorative motion is paused. Do not make motion necessary to understand selection or progress.
- **Announcements/focus:** stage changes, selection changes, empty results, filter-driven selection removal, and save/remove feedback use the existing polite live status pattern. Preserve dialog focus management, keyboard camera commands, visible focus, and focus restoration from preview.

## Content hierarchy and terminology

Keep the independent-concept framing and the disclosure that places/views are illustrative, sightlines are unverified, and no tickets are sold. Show that disclosure persistently without repeating a long disclaimer in every card. Stage headings and actions describe exploring a viewpoint, not buying a ticket.

| Replace | Use |
|---|---|
| Find a demo place | Explore a stadium view |
| Add to demo selection / demo basket | Save viewpoint |
| Remove demo selection | Remove saved viewpoint |
| View basket / demo selection | View saved viewpoint |
| Available / unavailable (when it can be mistaken for inventory) | Available in demo / Unavailable in demo |
| Tickets, seats for sale, booking, checkout, reserve | Places, viewpoint, preview, save |
| Quick views (ambiguous) | Representative views |
| Browse matching places | Advanced place controls |
| Step 01 of 04 (static) | Dynamic stage number and stage label, e.g. “Step 2 of 4 · Choose place” |

Fictional prices, demo availability, quantity matching, and benefits remain explicitly optional demo metadata inside Advanced mode. Never present them as current venue data or as evidence of a real sightline.
