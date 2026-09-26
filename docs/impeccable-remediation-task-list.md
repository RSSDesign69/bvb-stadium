# Stadium explorer remediation task list

Execution-ready backlog derived from the Impeccable critique of the root stadium-explorer surface on 2026-09-26.

## Product decision

Treat the product as an **architectural seat-view experience**, not a simulated ticket shop.

- Primary outcome: reach and understand a representative stadium viewpoint quickly.
- Secondary outcome: browse an exact illustrative stand/block/row/place when desired.
- Remove or demote fictional commerce language that implies a real ticket funnel.
- Preserve the existing BVB concept identity, Area typography, 3D model, accessibility behavior, honest-data disclosures, and non-WebGL fallback.

## Efficient execution order

Run tasks in order. Tasks 3 and 4 may run in parallel after Task 2. Task 5 begins after both are complete. Task 6 is the single final integration pass.

| Task | Scope | Depends on | Recommended model | Reasoning | Expected effort |
|---|---|---|---|---|---|
| 1 | Specify the four-stage interaction model | — | `gpt-6-luna` | medium | Small, decision-focused documentation task |
| 2 | Implement progressive discovery and Advanced mode | 1 | `gpt-6-sol` | high | State and component restructuring across the core flow |
| 3 | Elevate selected-place review and desktop composition | 2 | `gpt-6-sol` | medium | Focused React/CSS layout work |
| 4 | Adapt mobile density, touch targets, and typography | 2 | `gpt-6-sol` | high | Responsive and accessibility-sensitive changes |
| 5 | Remove transactional ambiguity and create a meaningful end state | 3, 4 | `gpt-6-luna` | high | Copy/state cleanup with a small local feature |
| 6 | Integrate, harden, and run the release gate | 5 | `gpt-6-sol` | high | Cross-flow regression and browser verification |

`gpt-6-astra` is not necessary for the scoped tasks. Use it only if Task 2 reveals that the explorer state must be substantially re-architected beyond the plan below.

## Shared constraints for every task

1. Work from this file and only inspect the files listed for the task before expanding scope.
2. Preserve unrelated user changes and the existing clean-room/provenance system.
3. Use the supplied Area font files; do not replace or download fonts.
4. Keep the official BVB crest inside the clearly labeled independent-concept framing.
5. Do not weaken keyboard access, reduced-motion behavior, modal focus management, live announcements, or the WebGL fallback.
6. Use `apply_patch` for source edits.
7. Run the task-specific checks, then stop. Do not perform an open-ended polish loop.
8. Update `provenance/inventory.json` for every new tracked file.

---

## Task 1 — Specify the four-stage interaction model

**Goal:** Remove ambiguity before implementation by defining the exact state model and content hierarchy.

**Read:**

- `docs/impeccable-remediation-task-list.md`
- `src/viewer/StadiumExplorer.tsx`
- `src/places/schema.ts`
- `src/commerce/demo/discovery.ts`

**Deliverable:** Add `docs/explorer-flow-spec.md` containing:

1. Four stages: **Choose stand → Choose place → Review place → Preview or save**.
2. Entry and exit conditions for each stage.
3. The one primary and no more than two secondary actions per stage.
4. Back/Edit behavior and preserved state.
5. Novice path: stand → three representative views → review → preview.
6. Advanced path: explicit “Choose an exact place” disclosure containing filters and block/row/place controls.
7. Rules for synchronizing canvas clicks, stand switcher, results, and exact selectors.
8. Loading, empty, unavailable, error, and reduced-motion behavior.
9. Copy replacements for ticket-like terminology.

**Acceptance criteria:**

- The spec answers every item above without changing application code.
- No stage presents more than four peer decisions.
- “Step 01 of 04” is defined as dynamic state rather than decorative text.
- The novice path can reach a preview without pagination or exact-place fields.

**Verification:**

```bash
npm run check
```

**Session prompt:**

> Execute Task 1 from `docs/impeccable-remediation-task-list.md`. Produce only the flow specification and its provenance entry. Do not edit application code.

---

## Task 2 — Implement progressive discovery and Advanced mode

**Goal:** Convert the overloaded discovery rail into the real four-stage flow defined by Task 1.

**Read:**

- `docs/explorer-flow-spec.md`
- `src/viewer/StadiumExplorer.tsx`
- `src/places/demo.ts`
- `src/commerce/demo/discovery.ts`
- `src/styles.css`
- `src/refinements.css`
- `tests/discovery.browser.cjs`

**Implementation:**

- Add explicit stage state derived from current selection/view state; avoid duplicated state when it can be derived.
- Replace the static progress text with the current stage and meaningful label.
- Default to the novice path with three representative views after stand selection.
- Put filters, result pagination, and block/tier/row/place selectors inside a native disclosure labeled “Choose an exact place.”
- Synchronize canvas, stand buttons, recommended views, results, and selectors to one selected-place model.
- Preserve filter values and selection when entering or leaving Advanced mode.
- Keep all current loading, empty, unavailable, and WebGL error recovery paths functional.
- Do not add a new component library or runtime dependency.

**Acceptance criteria:**

- Initial discovery shows one primary decision: choose a stand.
- Selecting a stand reveals no more than three recommended viewpoints plus the Advanced disclosure.
- The stage indicator advances accurately and supports Back/Edit.
- A novice reaches Preview without seeing pagination or exact selectors.
- Advanced mode retains the full exact-place capability.
- Existing screen-reader status updates remain accurate.

**Verification:**

```bash
npm run build
npm test
npm run test:discovery
```

**Session prompt:**

> Execute Task 2 from `docs/impeccable-remediation-task-list.md` using `docs/explorer-flow-spec.md` as the source of truth. Implement the progressive four-stage discovery flow and Advanced exact-place mode. Run only the listed verification commands.

---

## Task 3 — Elevate review and preview; repair desktop composition

**Goal:** Make the selected viewpoint and preview action unmistakable while keeping the 3D artifact present during browsing.

**Read:**

- `docs/explorer-flow-spec.md`
- `src/viewer/StadiumExplorer.tsx`
- `src/styles.css`
- `src/refinements.css`
- `tests/browser.cjs`

**Implementation:**

- Replace the result-heavy state with a compact selected-place review when a place is chosen.
- Put “Preview this view” at the top of the Review stage as the sole primary action.
- Add a clear secondary “Change place” action.
- On wide screens, make the scene column sticky within the explorer while the place rail scrolls; avoid the empty teal field below the canvas.
- Keep the mini-map, Back/Escape behavior, camera focus restoration, and reduced-motion behavior unchanged.
- Resolve naming inconsistencies among stand names and local names according to the flow spec.

**Acceptance criteria:**

- The primary preview action is visible without scrolling after a place is selected at 1440×900.
- The selected place, type, location, and sightline warning are visible with the primary action.
- The model remains visually present throughout desktop place review.
- No new nested scrolling traps are introduced for keyboard or trackpad users.

**Verification:**

```bash
npm run build
npm run test:browser
```

**Session prompt:**

> Execute Task 3 from `docs/impeccable-remediation-task-list.md`. Focus only on selected-place review, preview-action hierarchy, naming consistency, and wide-screen composition. Preserve the completed Task 2 state model.

---

## Task 4 — Adapt mobile density, touch targets, and typography

**Goal:** Preserve priority rather than merely stacking the desktop experience.

**Read:**

- `docs/explorer-flow-spec.md`
- `src/viewer/StadiumExplorer.tsx`
- `src/styles.css`
- `src/refinements.css`
- `tests/quality.browser.cjs`

**Implementation:**

- Keep Advanced mode collapsed by default on narrow screens.
- Surface selected-place review and Preview immediately after a mobile selection.
- Make every actionable target at least 44×44 CSS pixels, including pagination and selects.
- Raise essential auxiliary text below 12px to a readable role; keep only genuinely nonessential identifiers smaller.
- Group camera controls into fewer visible decisions without removing accessible commands; an overflow/disclosure is acceptable.
- Ensure the mobile sequence prioritizes scene → stand/view choice → review → preview before atmosphere and advanced controls where practical.
- Verify 320px, 390px, 768px, and 200% text enlargement.

**Acceptance criteria:**

- No horizontal overflow at the specified widths or 200% text size.
- All interactive targets meet 44×44 CSS pixels.
- No stage exposes more than four peer actions without grouping.
- The user reaches Preview without traversing all filters and results.
- Keyboard, screen-reader labeling, and reduced-motion behavior remain intact.

**Verification:**

```bash
npm run build
npm run test:quality
```

**Session prompt:**

> Execute Task 4 from `docs/impeccable-remediation-task-list.md`. Adapt the completed progressive flow for mobile and accessibility. Fix target sizes, essential small text, action grouping, and selection-to-preview ordering. Run the quality suite once after implementation.

---

## Task 5 — Remove transactional ambiguity and create a meaningful end state

**Goal:** Align language and final actions with an architectural seat-view experience.

**Read:**

- `docs/explorer-flow-spec.md`
- `src/App.tsx`
- `src/viewer/StadiumExplorer.tsx`
- `src/places/schema.ts`
- `src/commerce/demo/discovery.ts`
- `public/credits.html`

**Implementation:**

- Replace “Add to demo selection” and basket language with “Save viewpoint.”
- Store one saved viewpoint locally in component state; do not add accounts, persistence, or external APIs.
- Offer “View saved viewpoint” and “Remove saved viewpoint.”
- Demote fictional price and availability to optional demo metadata in Advanced mode, or remove it from the novice path entirely.
- Consolidate repeated disclaimers into the persistent disclosure bar, About dialog, and one contextual note near Advanced demo data.
- Preserve the explicit statement that views and place data are illustrative and no tickets are sold.
- Do not add share/export functionality in this pass.

**Acceptance criteria:**

- The novice path contains no checkout/basket terminology.
- Saving and removing a viewpoint gives immediate accessible feedback.
- No interface claims real inventory, measured sightlines, or ticket availability.
- The end state reinforces the selected viewpoint rather than a fictional purchase.

**Verification:**

```bash
npm run build
npm test
npm run test:discovery
```

**Session prompt:**

> Execute Task 5 from `docs/impeccable-remediation-task-list.md`. Align the experience around architectural viewpoint exploration, replace the demo basket with a local saved viewpoint, and consolidate disclosures without weakening their meaning.

---

## Task 6 — Integrate, harden, and run the release gate

**Goal:** Finish the complete remediation in one bounded validation pass.

**Read:**

- `docs/impeccable-remediation-task-list.md`
- `docs/explorer-flow-spec.md`
- All files changed by Tasks 2–5
- `tests/browser.cjs`
- `tests/discovery.browser.cjs`
- `tests/quality.browser.cjs`
- `tests/release.browser.cjs`

**Implementation:**

- Update browser tests to encode the final four-stage flow, Advanced mode, Preview visibility, saved-viewpoint end state, target sizes, and narrow-screen ordering.
- Remove unreachable legacy commerce UI and dead CSS after the new flow is verified.
- Check loading, empty, unavailable, WebGL failure, context loss, reduced motion, modal focus, keyboard camera, and 200% text states.
- Perform one batched visual review at 1440×900 and 390×844.
- Fix all issues revealed by that batch in one edit pass, then run one confirmation pass and stop.
- Update credits/provenance for changed or added tracked files.

**Acceptance criteria:**

- Every P1 and P2 item in the 2026-09-26 critique is resolved.
- The novice flow reaches a representative preview in four clear stages.
- Advanced exact-place browsing remains available and recoverable.
- Desktop and mobile have no overflow, clipped content, inaccessible controls, or misleading progress.
- All release checks pass.

**Verification:**

```bash
npm run check
npm test
npm run build
npm run test:browser
npm run test:discovery
npm run test:quality
npm run test:release
```

**Session prompt:**

> Execute Task 6 from `docs/impeccable-remediation-task-list.md`. Integrate and harden the completed remediation, update tests and provenance, perform the single bounded desktop/mobile visual pass, and run the complete release gate. Do not redesign beyond unresolved acceptance criteria.

## Completion definition

The backlog is complete when:

- The four-stage indicator is truthful.
- A first-time user can reach a representative preview without Advanced mode.
- Exact-place browsing remains available behind an explicit disclosure.
- Preview is visible immediately after selection.
- The experience ends with a saved viewpoint rather than a fictional purchase.
- Mobile targets, typography, density, and ordering pass the Task 4 criteria.
- All Task 6 release commands pass.
