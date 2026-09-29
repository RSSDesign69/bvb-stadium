# Hero stadium build animation — task list

Execution-ready backlog for the animated 3D stadium that fills the right side of the hero. Authored 2026-09-28 from a design review of the live hero, the existing 3D explorer and an approved animatic.

**Visual quality and interaction feel outrank token efficiency on this project.** Iterate until it looks right. Do not stop at "works."

## Product decisions (locked — do not re-litigate)

| Decision | Choice |
|---|---|
| Direction | **"A + C hybrid"**: a low-poly diorama in the explorer's matte style, built by a continuous *wave* of tiers rising from the Südtribüne (South Stand), with the roof-lift idle motion borrowed from direction C |
| Build length | **6.5 s**, followed by a continuous idle state |
| Repeat visits | **Session-skip**: the full build plays on the first load per browser session. Later loads in the same session start in the settled state. A **Replay** control always plays the full build again |
| Interaction | **Decorative**, with subtle pointer parallax (fine pointers only). No click behaviour |
| Mobile / narrow | A **smaller stacked version** below the hero copy |
| Background | Stadium on a small plinth over the hero's black. **No green landscape** from the explorer |
| Copy | Headline and paragraph stay **static**. One sync: the yellow accent under "from every angle." sweeps as the pylons land |
| Accent sync | The hero's existing radial glow (about 82% / 34%) brightens once at the pylon flash |

## Reference material

- **Animatic:** [docs/hero-animation/animatic-reference.html](hero-animation/animatic-reference.html). Open it in a browser. Use the **"A + C hybrid"** toggle and the three frames (1.5 s, 4.9 s, 7.0 s). Its geometry is a simplified stand-in, so **do not port its drawing code**. Its **timing constants and palette are the choreography source of truth**: `tierH()` (build wave), the roof, pylon and plinth timings in `frameA()`, and its colours. Ignore direction C except for the idle roof-lift.
- **Real model recipes:** `src/stadium/layout.ts` (stands, tiers, `world()`, `inTunnel()`) and `src/stadium/model.ts` (materials, pylons, roof and truss layout). The real pylon-to-roof height ratio (62 m : 39 m ≈ 1.6) matches the animatic (6.8 : 4.2), so proportions carry over directly.
- **Design system:** [borussia-dortmund-design-system.md](../borussia-dortmund-design-system.md). Black and yellow lead, square-edged, reduced-motion support is mandatory.

## Repository facts the implementer must respect

1. **Uncommitted work exists** in `.claude/launch.json`, `docs/portfolio-release.md`, `provenance/inventory.json`, `public/THIRD_PARTY_NOTICES.txt`, `public/credits.html`, `public/media/terrace-atlas-demo.webm`, `scripts/record-demo.cjs`, `tests/release.browser.cjs`. Preserve it. Never revert, stash or reformat those files beyond the specific edits below. **Do not commit or push** unless asked.
2. **The clean-room audit is strict** (`npm run check`, also the pre-commit hook): every working file, including untracked ones, needs an entry in `provenance/inventory.json`, and binaries carry a `sha256`. Add entries as you create files. No external imagery, footage, fonts or logos in the art. Geometry is derived only from the project's original model.
3. **Do not import `src/stadium/model.ts` or `src/places/demo.ts` from the hero.** They eagerly generate about 19k illustrative places. The hero needs its own lightweight geometry (Task 2).
4. **Existing tests target `.scene-host canvas`** (`tests/browser.cjs`, `discovery.browser.cjs`, `quality.browser.cjs`). The hero canvas must **not** live inside `.scene-host` or use `.scene-frame` / `.scene-host` class names.
5. The app runs in `StrictMode` (`src/main.tsx`), so effects mount twice in dev. Hero setup and teardown must be idempotent, with no leaked WebGL contexts.
6. `three@0.186.1`, React 19, Vite 8, TypeScript 7. Node 24. Tests use Playwright with Chrome (`TEST_BROWSER`, `TEST_URL`, default `http://127.0.0.1:4173`). A dev server may already be running on port 5173; reuse it rather than starting another.
7. Follow the repo's compact code style (see `src/viewer/engine.ts`) and its completion-doc convention (`docs/task-N-completion.md`).

## Execution order

Run in order. Tasks 4 and 5 touch the same component, so run them sequentially.

| Task | Scope | Depends on | Recommended model | Reasoning | Expected effort |
|---|---|---|---|---|---|
| 0 | Preflight, baseline, and the `fi` ligature fix | — | Opus 5.5 | medium | Small |
| 1 | Hero layout slot and spoiler-free placeholder (no WebGL) | 0 | Opus 5.5 | medium | Focused React/CSS |
| 2 | Lightweight hero stadium geometry, with unit tests | 0 | Opus 5.5 | high | Geometry-heavy |
| 3 | Timeline, renderer and the 6.5 s build choreography | 1, 2 | Opus 5.5 | max | The core of the work |
| 4 | Idle loop, pointer parallax, copy and glow sync | 3 | Opus 5.5 | high | Motion polish |
| 5 | Session-skip, pause/replay control, lifecycle, fallbacks | 4 | Opus 5.5 | high | Robustness |
| 6 | Visual review loop: filmstrip, motion smoothness, critique | 5 | Opus 5.5, optional Fable 5.1 critique pass | max | Iterative visual QA |
| 7 | Tests, performance and bundle gate | 6 | Opus 5.5 | high | Verification |
| 8 | Provenance, credits, docs and release integration | 7 | Opus 5.5 | medium | Housekeeping |

---

## Task 0 — Preflight and the `fi` ligature fix

**Goal:** establish a green baseline and fix a typography bug that sits directly beside the new art.

**Steps**
1. Run `npm run check`, `npm test`, `npm run build`, then with a preview server on 4173: `npm run test:browser`, `npm run test:discovery`, `npm run test:quality`. Record the results and the current `vite build` chunk sizes (the engine chunk is about 587.9 kB). If anything is already failing, report it and continue. Don't fix unrelated failures.
2. **Fix the ligature bug.** The hero paragraph renders "find" as "fnd" and "fictional" as "fctional". This was reproduced: the DOM text is correct, and the width changes when ligatures are disabled, so the `fi` ligature glyph in Area Inktrap renders incorrectly. Add `font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0;` at the `:root` or `body` level in `src/refinements.css`. Confirm visually that the hero paragraph, the "Stadium explorer" panel copy, and any other "fi" / "fl" words are correct. Screenshot before and after.

**Acceptance**
- The baseline results are recorded in the completion doc.
- Hero copy reads "find an illustrative place" and "fictional match" correctly at 1440 and 390 px.
- No other visual change.

---

## Task 1 — Hero layout slot and placeholder (no WebGL yet)

**Goal:** create the space the art will occupy, with no layout shift and no empty-hero moment.

**Measured starting point** (live hero, 1440 × 900): the hero is 484 px tall. The copy container is 860 px wide, so about 440 px of clear space sits to its right, or up to about 640 px if the art may sit behind the tail of the headline. At 1024 px only about 350 px is free.

**Steps**
1. Restructure `.intro` (in `src/refinements.css`; `src/styles.css` has the older rules) into a two-column layout at **≥ 960 px**: copy left, `.hero-art` right. Keep the h1 sizes and the 620 px paragraph measure.
2. The art slot uses a **3:2 aspect ratio** (matching the animatic's 600 × 400 frame). At 1440 px it should render about 600 × 400. It may extend into the hero's vertical padding, but the **hero height must stay ≤ 540 px**, and at 1440 × 900 the "Stadium explorer" heading must remain fully above the fold.
3. Below **960 px**, stack the art **below the hero paragraph**, width `min(100%, 480px)`, aspect ratio 8:5. At 390 px wide the slot is no taller than about 240 px, so the explorer stays close to the fold.
4. Markup: `<div class="hero-art" aria-hidden="true">`. The art is decorative, so it has no alt text and is not focusable, except for the control cluster added in Task 5. The canvas will be a child of this slot.
5. **Spoiler-free placeholder:** pure CSS or inline SVG, visible on first paint: the plinth parallelogram silhouette (about 12% brighter than the hero black) plus the glow. **Never show the finished stadium as a placeholder on the first visit**, or the build would appear to restart from a completed state.
6. Keep the existing glow (`radial-gradient` around 82% / 34%), but make its position and intensity CSS variables (for example `--hero-glow-x`, `--hero-glow-y`, `--hero-pulse`) so Task 4 can drive them. Re-centre it on the art slot.
7. Reserve the slot with `aspect-ratio` so nothing shifts when the canvas appears (target CLS ≤ 0.02 for the hero).

**Acceptance**
- Screenshots at 1440, 1024, 768 and 390 px show no overflow (`scrollWidth ≤ innerWidth`), copy left and slot right (≥ 960) or stacked (< 960).
- The heading stays above the fold at 1440 × 900.
- Existing tests still pass.

---

## Task 2 — Lightweight hero stadium geometry

**Goal:** a Three.js model of the stadium, built without the place dataset, whose parts carry the metadata the build wave needs.

**Steps**
1. Create `src/hero/heroStadium.ts` (and `src/hero/`). It may import `three` and `src/stadium/layout.ts` **only**. Derive block centres from `STANDS` (`width = length / blocks`, `center = -length/2 + width*(b+.5)`). Reuse `tiers()`, `world()`, `rowDepth()`, `rowFloor()`, `inTunnel()`.
2. Recreate these visual parts at a hero-appropriate fidelity, following the recipes in `src/stadium/model.ts`:
   - Plinth (the 210 × 252 base plate), striped pitch (14 stripes, `#387d47` / `#317040`) with white markings, four stands (tiers with per-row floors, yellow aisle steps, tunnel gaps), four radial corner terraces, façade (outer wall with glass panels and mullions), roof slabs with truss beams and white light bars, and the **eight yellow pylons**.
   - **Seating reads as yellow bands:** the explorer gets its yellow from per-seat instances that the hero does not have. Add one cheap instanced strip per row per block, alternating yellow (`#e0b912` / `#f6c900`) and concrete/dark, so tiers read like the animatic. The South terrace is olive-gold (`#96862c`) with yellow bands.
   - Palette: start from the `materials` in `model.ts`, then tune to match the animatic's colours. Final approval is visual (Task 6).
3. **Per-instance build metadata** on every tier and façade instance: `stand`, a normalized depth `u` (0 at the South end, 1 at the North end, computed from world Z), and a normalized distance from the pitch `rho` in [0, 1] across the whole bowl (lower and upper tiers combined). Provide these as instanced attributes (or a parallel typed array) so a shader or CPU pass can compute each instance's start time.
4. Batch by material and geometry. **Budgets:** ≤ 60 draw calls, ≤ 150 000 triangles, geometry build time logged (target ≤ 120 ms under 4× CPU throttle). Report the actual numbers.
5. **No see-through gaps:** from the hero camera (Task 3) it must never be possible to see through gaps under the terraces to the plinth at any point in the build. Per-row slabs are fine in the final state (the explorer looks the same), but during the build the tiers must read as **solid mass rising**. If the row slabs float, add underlying fill boxes per block per tier (or clip slabs at the plinth surface) so the growth reads as solid concrete.
6. Duplicating geometry recipes from `model.ts` is acceptable. Cross-reference it in a comment. **Do not change the behaviour of `model.ts`** unless you extract a shared helper that leaves `tests/model.test.ts` and the explorer's browser tests passing, with no visual change to the explorer (compare screenshots before and after).
7. Add `tests/hero.test.ts` (Node test, same style as `tests/model.test.ts`) and register it in `scripts/test.mjs`. Test: instance counts are stable, all `u` and `rho` are within [0, 1], eight pylons exist, the bounding box is within expected extents, no NaNs, and `heroStadium.ts` does not transitively import `places/demo`.

**Acceptance**
- `npm test` passes, including the new tests.
- Budget numbers are recorded in the completion doc.
- A static render of the final state looks like a cleaner cousin of the explorer's stadium, on black, with no landscape.

---

## Task 3 — Timeline, renderer and the 6.5 s build

**Goal:** the core deliverable. A deterministic, scrubbable build sequence that matches the approved choreography.

**Architecture**
- `src/hero/timeline.ts`: **pure functions of time** `t` (seconds). No `Date`, no `performance.now`, no randomness that is not seeded. All constants live in one exported table with a comment beside each.
- `src/hero/HeroStadium.tsx`: the React component. It lazy-loads and owns the renderer.
- Loading: the hero chunk is loaded via dynamic import **after first paint** (`requestIdleCallback` with a ~1200 ms timeout, or `load`, whichever is first). It must not delay the h1's paint or block the explorer chunk. The build clock **starts on the first rendered frame while the slot is visible**, so a slow load never causes missed beats. On the first frame, cross-fade from the placeholder to the canvas in 150 ms.
- Renderer: `WebGLRenderer({ alpha: true, antialias: true })`, transparent clear (so the hero glow shows through), sRGB output, ACES tone mapping with an exposure comparable to the explorer's (1.25), DPR capped at 1.75 (1.4 on the stacked mobile version). Lighting: hemisphere light plus one directional key, both matte. **No shadow maps.** Use a soft blob contact shadow under the plinth, or none.
- **Camera:** `OrthographicCamera`, **azimuth 45°, elevation 30°** (the classic 2:1 dimetric read). It views from the **north side**, so the Südtribüne (`out = [0,0,1]`) is the **far short end** and its yellow terrace faces the viewer. Choose the NE or NW corner that composes best. Fit the frustum to the slot with **≥ 6% padding around the final state, including the fully lifted roof and the pylon tips**. Refit on resize.
- Determinism hook: support `?hero-t=<seconds>` in every build. It freezes the animation at that time and renders a single frame. Also expose `data-hero-phase` (`placeholder | build | settled | idle | static | paused`) and `data-hero-frame` (a render counter) on `.hero-art`, so tests can observe it.

**Choreography** (all values from the animatic; times in seconds; `easeO` = 1−(1−x)³, `easeQ` = 1−(1−x)²)

| Time | Beat | Specification |
|---|---|---|
| 0 | Plinth | Visible from the first frame (the placeholder silhouette matches it) |
| 0.05–0.6 | Pitch wipe | Stripes reveal far → near (about 14 stripes, each fading over 0.25 of the wipe). White markings appear at ≥ 0.57 |
| 0.55–3.9 | **Tier build wave** | Each tier instance rises from the ground with `easeO` over 0.7 s. Start time = `0.55 + 1.5·u + 0.91·rho`, where `u` is 0 at the South end and 1 at the North end, and `rho` is the normalized distance from the pitch. Result: a **continuous ripple sweeping from the Südtribüne toward the viewer**, not four separate blocks |
| 3.4–4.6 | Façade | Uniform rise with `easeQ`, reaching full wall height |
| 4.6–5.8 | Roof | Descends from about **0.75 × wall height** above its final position with `easeQ` while **fading in over the first ~55%** of the travel. It must be fully opaque with `depthWrite` on in its final state, with no sorting artefacts. Trusses arrive with it. Faint upward streak lines (optional) along the roof edge during descent |
| 5.8–6.5 | Pylons | `scale.y` 0 → 1 with `easeO`. Eight pylons, with a slight stagger (≤ 0.15 s) by position |
| 6.2 | Accent | One brightness pulse of the yellow: a single ring expanding on the plinth surface (ends by 7.4 s), and `--hero-pulse` 0 → 1 → 0 for the glow (Task 4 wires the CSS) |
| 6.5 | Settled | Build complete. Idle begins (Task 4) with **no discontinuity** at this instant |

**Motion principles to enforce**
- Front-load: something visible at 0 s, the first tiers rising by about 0.6 s.
- Accelerate through the middle, then let the last landings settle. No linear motion.
- Overlap the phases: the façade begins before the last tiers finish, and the roof begins before the façade ends (the table above already does this; keep it).
- No pops. Every property is continuous in `t`.

**Steps**
1. Implement `timeline.ts`: `buildState(t)` returns per-phase progress values (pitch wipe, façade, roof offset and opacity, pylon growth, accent). Per-instance tier progress can be computed in a vertex shader from `uT` plus the instance attributes (preferred, so scrubbing is free), or on the CPU.
2. Growth method for tiers: either slabs **rise from y = 0 to their final elevation with a world-space clip below the plinth surface**, or scale from their base. Pick whichever reads as **solid mass growing** (see Task 2 step 5).
3. Implement the renderer, camera fit, resize handling, and the `?hero-t` freeze.
4. Verify by scrubbing `?hero-t=` through 0, 0.3, 0.6, 1.0, 1.5, 2.0, 3.0, 4.0, 4.9, 5.4, 5.8, 6.2, 6.5, 7.0. Compare against the animatic's three frames at 1.5 / 4.9 / 7.0 side by side.

**Acceptance**
- At `?hero-t=1.5` the South terrace is visibly further along than the North, and the Südtribüne reads yellow first. At `?hero-t=4.9` the façade is up and the roof is a fading ghost above it. At `?hero-t=7` the roof and eight pylons are complete.
- The build plays start to finish in 6.5 s at the target frame rate with no visual popping.
- The stadium is centred in the slot, with ≥ 6% padding, at 1440 and at the stacked 390 px layout.

---

## Task 4 — Idle loop, pointer parallax, copy and glow sync

**Goal:** the stadium stays alive, subtly, and the surrounding hero reacts to the build finishing.

**Idle motion** (begins at 6.5 s; no jump; loops are deliberately out of phase so no repeat is visible)
- **Roof lift:** sinusoidal between **0.10 and 0.26 × wall height** above rest (the animatic's final frame shows about 0.26), **period 16 s**. This is the "roof cutaway" echo of the explorer's toggle.
- **Camera sway:** azimuth ±4°, **period 21 s** (chosen not to divide evenly into 16 s).
- **Crowd flicker on the South terrace:** small instanced marks (white, dark, yellow) with per-instance irregular twinkling, seeded and deterministic. Fade in from 6.0 s. Cheap: one instanced draw call.
- Optional, only if within budget: a slow highlight gradient travelling up the pylons about every 9 s.
- Idle renders **at most 30 fps** (the build runs at full rate), to save battery.

**Pointer parallax**
- Fine pointers only (`(pointer: fine)`). The listener is on the **hero section**, not the canvas.
- Target offset: azimuth ±3.5°, elevation ±1.5°, critically damped smoothing (τ ≈ 250 ms). Returns to neutral over about 1.2 s when the pointer leaves.
- **Off during the build.** Ease its influence in from 0 to 1 across 6.0–7.0 s so the choreography is never disturbed.
- Disabled for coarse pointers and for `prefers-reduced-motion`. No gyroscope. No cursor changes. No click behaviour.

**Copy and glow sync**
- **Accent underline** under "from every angle." (the `h1 em`): a 4 px yellow bar, `transform: scaleX(0 → 1)`, `transform-origin: left`, sweeping over **5.9–6.6 s** and staying afterwards. Drive it from the timeline via a CSS class or variable so it stays in sync with the pylons landing, even when scrubbing. In reduced-motion and the session-skip case it is simply present. The h1 and paragraph must not shift by even 1 px. **If in review this underline looks redundant against the yellow text, stop and ask the product owner. Do not decide unilaterally.**
- **Glow pulse:** `--hero-pulse` (0 → 1 → 0, peaking at 6.2–6.3 s, about 600 ms) modulates the glow's intensity by at most +35%.

**Acceptance**
- No visible jump at 6.5 s in a frame-by-frame capture across 6.3–6.7 s.
- Sway and roof lift never appear to loop within a 60 s observation.
- The parallax feels weighty and damped, never twitchy.
- The h1 and paragraph bounding boxes are identical before and after the animation runs.

---

## Task 5 — Session-skip, controls, lifecycle and fallbacks

**Goal:** make it behave well in the real world.

**Session-skip**
- `sessionStorage` key `terrace:hero:played:v1`. Mark as played once the timeline passes **3.0 s**. Wrap all storage access in `try/catch`. If storage is blocked, treat every load as a first visit.
- Rule: first visit in a session → the full 6.5 s build. Any later load in the same session → start directly in the settled state: show the **poster** (below) immediately, mount the canvas underneath at the settled pose, and cross-fade (200 ms). Then idle, with the yellow ring pulse playing once. No build.

**Controls** (a real `<button>` cluster in the bottom-right corner of the art slot; the only focusable content in the art)
- **Pause / Play animation**: this satisfies WCAG 2.2.2, since the build plus idle exceeds 5 s. Visible from the first frame, low emphasis, ≥ 44 × 44 px target, with the same look as the existing "Pause atmosphere" button (square-edged, same border and type). Pausing during the build **jumps to the settled composition** (a 200 ms cross-fade, not a hard cut). Pausing later freezes the current idle pose. `aria-pressed` reflects state, and the label changes.
- **Replay**: plays the full build from 0 at any time (hidden under `prefers-reduced-motion`, which never animates).
- Persist the pause choice in `sessionStorage` (`terrace:hero:paused:v1`).

**Lifecycle**
- The clock and render loop run only while the tab is visible **and** the hero is on screen (`IntersectionObserver` + `visibilitychange`, with delta capped at 0.06 s like the explorer's engine). When stopped, the render loop is fully cancelled with no GPU work.
- If the hero is scrolled offscreen at load time, the build starts when it first becomes visible.
- Dispose everything on unmount (geometries, materials, textures, renderer, `forceContextLoss`). Setup and teardown must be **idempotent for React StrictMode**. Use the browser to verify that navigating to `credits.html` and back does not accumulate WebGL contexts.

**Reduced motion** (`prefers-reduced-motion: reduce`, live-updating)
- No animation loop, no idle, no parallax. Render **one settled frame** (or show the poster). `data-hero-phase="static"`. The underline is simply present. The pause and replay controls are hidden.

**Fallbacks**
- **Poster asset:** `public/media/hero-stadium-poster.webp` (with alpha, sized for 2× of the largest slot, about 1200 × 800), generated by a script (`scripts/render-hero-poster.cjs`) from the real renderer at the settled pose (`?hero-t=7` with a mid roof-lift), using `canvas.toBlob('image/webp')`. It is used **only** for the session-skip cross-fade, reduced motion, and the failure cases below.
- Show the poster with no WebGL loaded at all when: WebGL is unavailable, `webglcontextlost` fires (no error UI, since the art is decorative), `navigator.connection.saveData` is true, or `navigator.hardwareConcurrency ≤ 2` / `deviceMemory ≤ 2` where those are available.
- **Adaptive quality guard:** measure frame intervals for the first 1.5 s of the build. If p95 > 50 ms, drop DPR to 1. If still bad after a further 1 s, jump to the settled frame and swap to the poster. Record the outcome in `data-hero-quality` (`full | reduced | poster`).
- **Contingency gate:** if the performance budgets in Task 7 cannot be met on mid-tier hardware even with the guard, **stop and ask the product owner** before switching to a pre-rendered video. Video has real trade-offs (no alpha in Safari-compatible formats, so it must bake the hero background).

**Acceptance**
- First load in a fresh context builds. A second load in the same context is settled within 1.5 s with no build. A new context builds again.
- The pause button freezes rendering (`data-hero-frame` stops incrementing). Scrolling the explorer into view freezes it as well.
- Reduced-motion shows the static frame with no rAF loop.
- Blocked storage still works (build on every load, no exceptions).

---

## Task 6 — Visual review loop

**Goal:** judge the motion by looking at it. This is where quality is won. Do not skip or abbreviate it.

**Steps**
1. Write `scripts/hero-filmstrip.cjs` (Playwright + Chrome, outputs to `.cache/hero/`, which is git-ignored). It loads `/?hero-t=<t>` for `t ∈ {0, 0.3, 0.6, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.6, 5.0, 5.4, 5.8, 6.2, 6.5, 7.0, 9.0, 12.0}` at **1440 × 900** and **390 × 844**, crops the art slot, and composes labelled contact sheets (PNG grids). **Open the contact sheets and look at them.**
2. Also record a real-time capture of the full build (Playwright video, as in `scripts/record-demo.cjs`), extract a frame every 100 ms, and compute the **frame-to-frame pixel-difference curve** for the art slot. It should be smooth: flag any single-frame spike above 3× the local median, except at the designed accent pulse (about 6.2 s). Fix any pop you find.
3. Critique against this checklist, then fix and re-shoot. **Minimum two full rounds.**
   - South terrace reads as the leading yellow at 1.5 s. The wave reads as one ripple, not four blocks.
   - No z-fighting or flicker on tier tops. No cracks between rows mid-wave. No see-through gaps under the terraces at any time.
   - The façade rise, roof fade-in and pylon growth overlap gracefully, with no dead time between phases.
   - The roof is fully opaque and sorted correctly at 5.8 s and afterwards.
   - The final composition has ≥ 6% padding, with pylon tips and the lifted roof unclipped.
   - Colours match the animatic and the explorer's palette. The art feels like the same product.
   - The silhouette stays legible at the stacked 390 px size. The hero copy still leads the eye, and the art does not fight the headline.
   - The static poster is indistinguishable from the settled canvas at the swap.
4. Save the final contact sheets as evidence in the completion doc.
5. **Optional second opinion** (recommended if the product owner has Fable 5.1 available): run a *critique-only* pass. Give it the final contact sheets, the animatic frames and this checklist. Ask what looks amateur, what pops, and what would raise the polish. Apply the worthwhile findings. Do not let that pass rewrite the architecture.

**Acceptance**
- The completion doc includes the final contact sheets, the smoothness curve and a short critique log covering what was changed in each round.

---

## Task 7 — Tests, performance and bundle gate

**Steps**
1. **Unit tests** (in `tests/hero.test.ts`): `buildState(t)` is bounded and monotone where expected. Phase endpoints hit exactly 0 and 1. Idle is continuous at 6.5 s (the values just before and after agree). No NaNs across a dense sweep of `t ∈ [0, 60]`.
2. **Browser test** `tests/hero.browser.cjs` with npm script `test:hero`. Assert:
   - The canvas lives inside `.hero-art`, is `aria-hidden`, and is not under `.scene-host`.
   - `data-hero-phase` goes `placeholder → build → settled/idle` within 9 s on a fresh context.
   - Frames at `?hero-t=0`, `=3` and `=7` differ, and two loads at the same `hero-t` match.
   - Session-skip, pause, replay, offscreen freeze, reduced-motion, `webglcontextlost` → poster, blocked storage.
   - **axe** WCAG 2A/AA/2.1AA clean, including the new buttons (contrast, ≥ 44 px targets, visible focus, names).
   - No horizontal overflow at 390 / 768 / 1440.
   - **CLS ≤ 0.02** during load (PerformanceObserver).
   - `.hero-art` remains inert to clicks (nothing navigates or toggles from clicking the art).
3. **Regression:** `npm run check`, `npm test`, `npm run build`, then `test:browser`, `test:discovery`, `test:quality`, `test:release`, all green with unchanged thresholds. The hero must not affect the explorer's `drawCalls`, `triangles` or timing thresholds.
4. **Performance budgets** (Playwright CDP CPU 4× throttling, on the production build):
   - Build phase: frame interval **p95 < 34 ms** at 1440; **p95 < 50 ms** at the 390 px layout.
   - Idle: capped at 30 fps; main-thread work per frame stays small (report the numbers).
   - **LCP:** the h1 remains the LCP element, and LCP regresses by no more than about 100 ms versus the Task 0 baseline.
   - **Bundle:** hero code adds ≤ 40 kB gzipped beyond the shared `three` chunk, and `three` is loaded **once**, in a chunk shared with the explorer. Report the before and after `vite build` output. The existing 587.9 kB advisory is unchanged.
5. Add `test:hero` to `package.json`. Do not fold it into `npm test`, which stays the fast Node suite.

**Acceptance:** all commands above pass, and the numbers are in the completion doc.

---

## Task 8 — Provenance, credits, docs and release

**Steps**
1. **Provenance:** add `provenance/inventory.json` entries for every new file (source, tests, scripts, docs, the poster). Use `origin: original`, `license: UNLICENSED`, the same `source_ids` as neighbouring files, plus `THREE-UPSTREAM` for files that import three. Binaries carry `sha256`. Keep entries sorted by path and preserve the file's existing formatting. Verify with `npm run check`.
2. **Credits:** add a short note to `public/credits.html` (and `THIRD_PARTY_NOTICES.txt` only if a runtime dependency changed, which it should not) saying the hero animation is original and derived from the project's own illustrative model. Keep the page axe-clean.
3. **Packaging:** add `media/hero-stadium-poster.webp` to the allowlist in `scripts/package_release.py`. Update `docs/portfolio-release.md`, `README.md` and `docs/ui-components.md` with a hero-animation section: behaviour, session-skip, controls, fallbacks, `?hero-t` and how to regenerate the poster.
4. **Completion record:** write `docs/hero-animation-completion.md` in the style of `docs/task-10-completion.md`: what was built, budgets and measurements, the critique log, the filmstrips, the decisions taken, the deviations from this document, and what remains unverified (for example Safari/WebKit, physical devices, screen readers).
5. Run `npm run release` and report the result. **Do not commit or push.**

---

## Definition of done

- The build reads as one continuous, confident 6.5 s motion, with the Südtribüne leading, followed by a calm idle that never visibly loops.
- Session-skip, pause, replay, reduced-motion and every fallback path work, and none is silent or broken.
- The hero copy is unshifted, the headline is the LCP element, and the explorer is untouched and green.
- Budgets in Task 7 are met, and the evidence sits in `docs/hero-animation-completion.md`.
- `npm run check` passes.

## Out of scope

- Re-recording the demo video (`public/media/terrace-atlas-demo.webm`) unless `scripts/record-demo.cjs` breaks because of the hero.
- Any change to the explorer's behaviour, model, or data.
- Direction C as a standalone experience, sound, gyroscope input, and any click behaviour on the art.
- Public deployment.

## Escalate to the product owner (don't decide alone)

1. The accent underline looks redundant in review (Task 4).
2. The performance budgets cannot be met and a pre-rendered video looks necessary (Task 5).
3. Any need to change `src/stadium/model.ts` beyond a zero-visual-diff extraction (Task 2).
