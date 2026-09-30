# Explorer stadium fidelity — task list

Execution-ready backlog for bringing the 3D explorer's stadium up to, and past, the fidelity of the hero animation's stadium, with photoreal materials and a matching pass on the surroundings. Authored 2026-09-29 from a side-by-side design review of the settled hero (`?hero-t=90.5`) and the explorer (home view with the roof on and off, a low exterior view and a close exterior view).

**Visual quality outranks token efficiency on this project.** Iterate until it looks right. Do not stop at "works."

## Why this work exists (the review, in brief)

The hero looks more real despite having *less* detail, because its shape is consistent and its lighting is controlled. The explorer's outer shell falls apart for structural reasons:

| | Hero (`src/hero/heroStadium.ts`) | Explorer (`src/stadium/model.ts`) |
|---|---|---|
| Outline | One continuous rounded-rectangle outer wall | Four separate flat wall slabs (`box(local(0,outer,17),[length+3,34,1.1])`), with open corners |
| Corners | Closed with curved glazed walls | Open. The radial corner terraces stick out past the walls, and their stepped undersides are visible |
| Mass | Every tier row is a solid column down to the ground | Tiers are 0.6 m slabs floating in the air, so you see through them at low angles |
| Roof | One extruded rounded ring with a clean curved edge | Four rectangles plus four overlapping corner squares. Square outline, no visible edge thickness |
| Default view | Roof on. The ring frames the bowl | Roof cutaway is on by default, so the whole roof disappears and the silhouette goes with it |
| Brightness and colour | Hemisphere 1.3 / sun 2.6. Yellow surfaces get a little self-light so they stay brand yellow | Hemisphere 2.7 / sun 3.1 at 1.25 exposure. The roof blows out to near-white, the pitch looks pastel, the yellow drifts toward olive |
| Pylons | 1.2 m masts, thin 0.2 m stays landing on the roof ring | 0.85 m masts, 0.32 m stays. They read as aerials |
| Grounding | Dark plinth, so edges contrast strongly | No shadows, no contact darkening, a flat district board floating in a dark-teal void |

## Product decisions (locked — do not re-litigate)

| Decision | Choice |
|---|---|
| Hero | **Frozen.** No file under `src/hero/`, `tests/hero*`, or `public/media/hero-stadium-poster.webp` changes. The explorer *ports* the hero's recipes; it does not share code with it. It may import the hero's outline constants read-only from `src/hero/framing.ts` (three-free and already in the main bundle) so the two silhouettes stay aligned |
| Art direction | **Push toward photoreal**: physically based materials with textures, image-based lighting, shadows, contact shading. Stay in daylight; no time-of-day system |
| Third-party assets | **CC0 assets are allowed** (for example Poly Haven, ambientCG), each with a full provenance record. Nothing sourced from reference photos of the real stadium, and nothing traced |
| Roof cutaway | **"Pull the roof back to a ring"** replaces "hide the roof." With cutaway on, the roof's inner edge animates back to about 25 m behind the front row (the hero's opening). With cutaway off, and always in seat previews, it sits at the realistic 8 m |
| Surroundings | A lighting pass **and new geometry for trees and buildings**. The layout of the district (`src/stadium/surroundings.ts`) stays |
| Phones | A **noticeably simpler look is acceptable** to hold frame rate (no contact shading, no bloom, smaller shadows, 1K textures, billboard trees) |

## Reference material

- **Hero (visual target for shape and proportion):** `src/hero/heroStadium.ts` (outer wall, corner arcs, roof ring, pylons, solid tiers), `src/hero/framing.ts` (`BOWL`, `WALL_HEIGHT`, `ROOF_Y`, `PYLON`, `PYLONS`), `src/hero/renderer.ts` (light rig, the self-light patch that keeps yellow on brand under ACES, the adaptive quality guard). Render its settled pose with `?hero-t=90.5`. **Read these; do not edit them.**
- **Explorer today:** `src/stadium/model.ts` (geometry, per-instance stand tags, pick groups), `src/stadium/layout.ts` (stands, tiers, `world()`), `src/viewer/engine.ts` (renderer, lights, the render-on-demand loop, picking, cutaway, preview flights), `src/stadium/surroundings.ts` (canvas-painted ground, instanced trees, boxes for buildings and cars), `src/atmosphere/matchday.ts` (crowd and players).
- **Clean-room rules:** `docs/clean-room.md` and `provenance/README.md`. Photo-derived production assets need a license and attribution review, which Task 1 adds for CC0.

## Repository facts the implementer must respect

1. **Branch first.** `main` was clean at authoring time. Create a working branch (for example `explorer-fidelity`) before any change. **Do not commit or push unless the user asks.**
2. **The clean-room audit is strict** (`npm run check`, also the pre-commit hook). Every working file, including untracked ones, needs an entry in `provenance/inventory.json`. Binaries carry a `sha256`. Third-party files need `origin: third-party` plus source URL, author, exact license, SHA-256, attribution text, modifications and redistribution decision (see `provenance/README.md`). Any new dev tool or npm package goes into `provenance/dependencies.json` *before* it is installed.
3. **Downloading needs the user's explicit approval.** Before downloading any asset or tool, present a table (file, source URL, license page, resolution, download size) and wait for a clear yes. Approval covers only the files listed.
4. **Picking contracts.** The engine raycasts `stadium.pickGroups` (seats) and uses `stadium.solids` to block clicks on seats hidden behind walls. A hit on a solid reads `object.userData.stands[instanceId]` to choose a stand. `tests/model.test.ts` pins these picks (for example `(0, 90) → south`, `(44, -70) → north`, `(0, 0) → null`). Any new shell geometry must be in `solids` and must resolve to the right stand.
5. **Existing budget gates** in `tests/quality.browser.cjs`: desktop overview `drawCalls < 200 && triangles < 650000` (line ~73); phone `triangles < 350000 && drawCalls < 160` and 4× CPU `p95 < 100 ms` (line ~155). This work will exceed the count gates. Replace them with the budgets in Task 11 and record why; do not delete them. The frame-time gate stays.
6. **Draw-call reporting.** The engine writes `renderer.info.render.calls` to `data-draw-calls`. With an `EffectComposer`, `info` auto-resets on every pass, so the number would report only the last full-screen pass. Set `renderer.info.autoReset = false`, reset once per frame, and report the main scene pass (`data-draw-calls`, `data-triangles`) separately from the total including shadows and post (`data-draw-calls-total`).
7. **Render-on-demand loop.** `engine.ts` only draws when `dirty`. It draws every frame while a flight runs or while the match-day atmosphere animates (the crowd and players move). Every new cost (shadows, post-processing) must respect this: static work should cost nothing on frames where nothing changed.
8. `buildStadium(compact)` and `buildSurroundings(compact)` take `window.innerWidth < 700` as the compact flag. Build the quality tiers on this, don't replace it.
9. The app runs in `StrictMode`, so the engine mounts twice in dev and can be recreated on "Retry 3D." Textures, PMREM environments, render targets and loaders must be disposed or shared through a ref-counted cache, with no leaked WebGL contexts.
10. `three@0.186.1`, which includes everything needed as addons: `EffectComposer`, `RenderPass`, `GTAOPass`, `SMAAPass`, `UnrealBloomPass`, `OutputPass`, `Sky`, `HDRLoader`/`RGBELoader`, `KTX2Loader` (the Basis transcoder lives in `three/examples/jsm/libs/basis/`), `GLTFLoader` and the meshopt decoder. **Add no runtime npm dependencies.** Transcoder files served from `public/` need inventory entries (`THREE-UPSTREAM`).
11. Follow the repo's compact code style (`src/viewer/engine.ts`) and its completion-doc convention. The completion record for this work is `docs/explorer-fidelity-completion.md`.
12. A Vite dev server may already be running on 5173. Reuse it. The browser suites run against a dev server (`TEST_URL=http://127.0.0.1:5173`), not `vite preview`.

## Execution order

Task 1 has a human checkpoint (download approval), so start it right after Task 0 and carry on with Tasks 2–4 while approval is pending.

| Task | Scope | Depends on | Recommended model | Reasoning | Expected effort |
|---|---|---|---|---|---|
| 0 | Preflight, baseline, capture harness, hero-frozen guard | — | Opus 5.5 | medium | Small |
| 1 | CC0 asset shortlist, approval, download, processing, provenance | 0 (+ user approval) | Opus 5.5 | high | Medium, with a wait |
| 2 | Explorer shell: curved outer wall, closed corners, pylons | 0 | Opus 5.5 | high | Geometry |
| 3 | Solid stands built from a cross-section profile | 2 | Opus 5.5 | max | Geometry-heavy, picking-sensitive |
| 4 | Roof ring and the ring cutaway | 2 | Opus 5.5 | high | Geometry and interaction |
| 5 | Material system: triplanar mapping, PBR library, lazy texture load | 1, 3, 4 | Opus 5.5 | max | Core of the photoreal look |
| 6 | Lighting and rendering: IBL, sun shadows, post-processing, quality tiers | 5 | Opus 5.5 | max | Core of the photoreal look |
| 7 | Close-range detail and distance-based detail | 6 | Opus 5.5 | high | Detail modelling |
| 8 | Surroundings: ground materials, horizon, trees, buildings | 1, 6 | Opus 5.5 | max | Large |
| 9 | Visual review loop and critique | 7, 8 | Opus 5.5, optional Fable 5.1 critique pass | max | Iterative visual QA |
| 10 | Picking, preview-flight and accessibility regression | 9 | Opus 5.5 | high | Verification |
| 11 | Performance, budgets and bundle gate | 10 | Opus 5.5 | high | Verification |
| 12 | Provenance, credits, docs and release integration | 11 | Opus 5.5 | medium | Housekeeping |

---

## Task 0 — Preflight, baseline, capture harness, hero-frozen guard

**Goal:** a recorded baseline, a repeatable way to see every change, and a tripwire that keeps the hero untouched.

**Steps**
1. Create the working branch. Run `npm run check`, `npm test`, `npm run build`, then with the dev server: `npm run test:browser`, `npm run test:discovery`, `npm run test:quality`, `npm run test:hero`. Record the results and the `vite build` chunk sizes (index, engine, `three`, `StadiumExplorer`, hero renderer). Report pre-existing failures and continue; don't fix unrelated ones.
2. **Capture harness:** add `scripts/explorer-captures.cjs` (Playwright, Chrome, headless with `--enable-webgl --ignore-gpu-blocklist`, `deviceScaleFactor: 2`). It renders a fixed set of **named poses** to `.cache/explorer/<label>/` and composes a labelled contact sheet. Poses are set deterministically through a dev-only hook, `?explorer-pose=<name>` (read in `engine.ts`; applies the camera, cutaway and atmosphere state, pauses the match clock at a fixed time, then marks `data-pose-ready`). Poses:
   - `home-cutaway`, `home-roof`: today's `HOME` with the cutaway on and off
   - `hero-match`: the camera at the hero's azimuth 45° and elevation 30° from the NW, looking at the origin, with a long lens (fov ≈ 12°) to approximate the hero's orthographic read. This is the silhouette comparison
   - `exterior-low`: the lowest allowed polar angle (`maxPolarAngle` 1.05), SE corner
   - `facade-close`: the minimum distance, looking at the west façade
   - `corner-close`: the minimum distance at the NE corner, pylons in frame
   - `preview-south`, `preview-west-upper`, `preview-east-lower`: seat previews (roof on, looking at the pitch and the roof's underside)
   - `phone-home`: 390 × 844 at the compact tier
   Also capture the hero at `?hero-t=90.5` into the same sheet, next to `hero-match`.
3. Write down the baseline sheet as `baseline`. Every later task re-runs the harness and compares against it.
4. **Hero-frozen guard:** record the SHA-256 of every file under `src/hero/`, `tests/hero.test.ts`, `tests/hero.browser.cjs` and `public/media/hero-stadium-poster.webp` in the completion doc. The final check (Task 12) re-hashes and must match. Also record the hero renderer chunk size; it must not change.
5. **Performance baseline:** with atmosphere running, record `data-draw-calls`, `data-triangles` and the p95 frame interval over 5 s at `home-cutaway` (1440 × 900, 1× CPU) and `phone-home` (4× CPU). Note the machine and GPU.

**Acceptance**
- The baseline results, chunk sizes, hashes and performance numbers are in `docs/explorer-fidelity-completion.md`.
- The `baseline` contact sheet exists and every pose renders the same way on two consecutive runs.

---

## Task 1 — CC0 asset shortlist, approval, download, processing and provenance

**Goal:** a small, curated, fully documented set of CC0 materials, a sky image and tree models, compressed for the web.

**Steps**
1. **Policy first:** add a "CC0 production assets" section to `docs/clean-room.md`: what is allowed (generic CC0 material scans, HDRIs and models from sources that publish an explicit CC0 license per asset), what is not (anything depicting the real stadium, its signage or its surroundings, and anything traced from reference imagery), and the review steps (license page captured, author recorded, SHA-256 of the original and of every processed output). Update the "Current production asset inventory is empty" sentence.
2. **Shortlist** (desktop 2K, phone 1K unless noted). Prefer Poly Haven and ambientCG. Verify the license on each asset's own page; do not assume a whole site is CC0.
   - Stadium: exposed concrete (smooth cast), precast concrete (stand risers), corrugated or standing-seam metal cladding, roof membrane or metal roof sheet, painted steel (pylons, trusses), glass (roughness variation only, or procedural), rubber or resin flooring (concourse), and optionally plastic for the seats.
   - Pitch and ground: grass turf, mown grass, asphalt, concrete paving, gravel or ballast, athletics track surface, soil or garden plots.
   - Sky: **one daylight HDRI**, partly cloudy with a clear sun disc, 2K for the environment lighting (1K on phones). Note the sun's direction in the image.
   - Trees: two or three broadleaf species suited to a German park setting. Either CC0 glTF models, or a CC0 leaf and bark atlas for trees built in-repo. **Hard budget: ≤ 2,000 triangles per tree at the near level of detail.** Photogrammetry trees over that budget are decimated (record the tool and settings) or rejected.
   - Buildings: CC0 façade, roof and window textures (or procedural in Task 8).
3. **Stop and ask the user for download approval**, with a table: asset, source URL, license page URL, author, resolution, maps, download size. Download only what is approved.
4. **Processing pipeline:** add `scripts/process-assets.mjs`. It converts textures to **KTX2** (colour and roughness/AO maps as ETC1S, normal maps as UASTC, mipmaps on, colour maps flagged sRGB) and models to glTF with **meshopt** compression. Recommended tooling: `@gltf-transform/cli` plus KTX-Software `toktx`, as build-time-only dev dependencies recorded in `provenance/dependencies.json` first (versions, licenses). **Commit processed outputs only** under `public/assets/explorer/`, never the source downloads; keep those in the git-ignored `.cache/assets-src/`. The script must be deterministic and rerunnable.
5. Pack roughness, AO and metalness into one texture where the source allows (the glTF ORM convention) to cut downloads and texture slots.
6. **Provenance:** one inventory entry per shipped file (`origin: third-party`, source URL, author, `CC0-1.0`, SHA-256 of the original download and of the shipped file, modifications, attribution text). Add a CC0 acknowledgement block to `public/THIRD_PARTY_NOTICES.txt` and a short credits section to `public/credits.html` (CC0 needs no attribution; give it anyway). Add the Basis transcoder files to `public/` with `THREE-UPSTREAM` provenance.
7. Budgets: total shipped assets **≤ 14 MB for desktop** and **≤ 6 MB for phones** (phones load their own 1K set), with GPU texture memory **≤ 160 MB desktop / ≤ 64 MB phone**. Record the actual numbers.

**Acceptance**
- `npm run check` passes with the new assets.
- Every shipped asset is traceable from inventory entry → license page → processing step.
- Nothing was downloaded without approval.

---

## Task 2 — Explorer shell: curved outer wall, closed corners, pylons

**Goal:** the explorer reads as **one building** with the hero's silhouette, at explorer scale.

**Steps**
1. Create `src/stadium/shell.ts`. Import `BOWL`, `WALL_HEIGHT`, `ROOF_Y`, `PYLON` and `PYLONS` from `src/hero/framing.ts` **read-only**. The explorer outline must match the hero's (straight stand walls plus quarter arcs of radius 48.5 m around `(±44, ±63)`).
2. Build the outer wall as **continuous geometry**, not boxes. Extrude the rounded-rectangle outline (straight runs plus arc segments; at least 16 segments per quarter so the curve reads smooth at `corner-close`) into a wall with real thickness, plus:
   - a base band or plinth course (about 1.5 m, darker, heavier)
   - a top edge or parapet under the roof
   - a curtain-wall zone with mullions every 8–9 m (the hero's rhythm) and horizontal transoms at the four glazing rows (`[5, 12, 23, 30]` m)
   Keep this geometry low-detail for now; Task 7 adds depth.
3. **Close the corners.** The corner terraces now sit inside the curved corner walls, and nothing of the terrace underside is visible from outside at any allowed camera angle (check `exterior-low` and `corner-close`).
4. **Pylons:** hero proportions (mast radius 1.2 m, stays 0.2 m). Stays anchor on the new roof ring: one at the opening's corner, one at the rim, as in `heroStadium.ts`. Where a mast meets the curved wall or the roof edge, it passes cleanly (no z-fighting, no floating collar). Match the hero's read at `hero-match`.
5. Remove the old façade boxes, the corner roof squares and the old pylons from `model.ts`, and replace them with the shell. Keep the pitch, markings, goals, tunnel and dugouts.
6. **Picking:** every shell mesh is added to `solids`. Give single (non-instanced) meshes `userData.stand` or a per-face stand lookup, and extend the engine's stand lookup to use it. Better still, add a pure `standAt(x, z)` helper to `layout.ts` (N/S stand if `|x| ≤ length/2` beyond the stand's inner line, E/W likewise, corner → `null`) and use it for any shell hit that has no instance tag. `tests/model.test.ts` picks keep passing. Add cases for a corner-wall hit (`null`) and an outer-wall hit on each stand.

**Acceptance**
- At `hero-match`, the explorer silhouette (wall outline, corners, pylon positions and proportions) matches the hero's settled pose. Put them side by side in the sheet.
- No visible gaps, seams or terrace undersides at `exterior-low` and `corner-close`.
- `npm test` passes.

---

## Task 3 — Solid stands from a cross-section profile

**Goal:** stands read as raked concrete mass, like the hero's solid tiers, at a fraction of the cost of one column per row.

**Steps**
1. For each stand and tier, build a **2D cross-section profile** from `layout.ts` (`rowDepth`, `rowFloor`, tread depth and riser height per row). Close it into a solid: treads and risers on top, a sloped underside (soffit) below, a back wall at the concourse, and a front wall to the pitch. Extrude it along each stand's length. For the corners, sweep the same profile along the quarter arc (at least 16 segments; the current 8-segment corners look faceted up close).
2. **Tread tops must stay exactly at `rowFloor`**, because seats and standing places (`DEMO.places`) sit on them. Check this with a unit test: sample places and assert the tread under each is within ±2 cm.
3. **Vomitories:** the front five rows have an opening at each block centre (`inTunnel`). Cut real tunnel openings through the profile (split the extrusion per half-block for the front rows, with a dark recessed tunnel mouth, side walls and a ceiling). They must look like tunnels, not missing geometry, at `preview-*` and `home-roof`.
4. Keep the details that exist today: the yellow aisle step marks, the rails on the vomitory sides, the upper-tier lip, the glazed band and the South terrace crush barriers. Re-seat them on the new solid.
5. The underside of the upper tier is **visible from lower-tier seat previews**. Give it structure (raker beams every block width) so it doesn't read as a flat plane.
6. Triangles: the stands should use **fewer** triangles than today's per-row slabs. Record the before and after.
7. Tag every stand solid for picking (per stand, or through `standAt`). Seats must still be pickable. Seat meshes are the first raycast target, so check that the new solid doesn't block them (the tread must not sit above the seat base).

**Acceptance**
- No see-through gaps under or between rows from any allowed camera angle.
- The tread-height test passes.
- Seat picking works at `home-cutaway` in all four stands (manual check plus the existing browser suites).

---

## Task 4 — Roof ring and the ring cutaway

**Goal:** the roof matches the hero's rounded ring, and "Roof cutaway" pulls the inner edge back instead of hiding the roof.

**Steps**
1. Build the roof as a rounded-ring slab, as in the hero (`absarc` outline at `BOWL.roofRadius`, elliptical-corner opening), with:
   - an **outer edge band of real thickness** (about 2.5 m deep, darker than the top surface)
   - an underside separate from the top surface (dark soffit)
   - trusses and light bars along the inner edge (the explorer's existing truss recipe, following the new edge)
2. **Two openings, one topology.** Generate the ring twice, with the opening at 8 m and at 25 m behind each stand's front row, **with identical vertex counts and order**, and store the 25 m version as a **morph target**. `morphTargetInfluences[0]` then animates the opening, and three's raycaster already honours morph targets, so the roof stays a correct pick occluder at every opening. The trusses and light bars move with the inner edge through a shared per-frame offset (instanced, one uniform).
3. **Cutaway behaviour** in `engine.ts`: `setCutaway(true)` eases the opening to 25 m over about 600 ms (smoothstep, driven by the existing frame loop, so it marks `dirty` while animating). `setCutaway(false)` eases back to 8 m. Seat previews always use 8 m. The roof never becomes invisible. Reduced motion snaps with no animation. The `.roof-toggle` label and behaviour stay the same; update its helper copy if it mentions hiding the roof.
4. Pylon stays stay attached to the edge anchors as the opening moves (reuse the hero's approach: stays follow the moving anchor).
5. A translucent strip about 4 m wide along the inner edge (a polycarbonate-style panel): alpha-blended, high roughness, no depth write, `renderOrder` above the roof slab. It must not flicker against the trusses.
6. The shadow map (Task 6) must be updated when the opening changes. Leave a hook for it.

**Acceptance**
- At `home-cutaway`, the roof reads as a ring with the seats visible (compare with the hero). At `home-roof`, it reads as a full roof with the realistic opening.
- Toggling is smooth, reversible at any moment and correct under reduced motion.
- Picks are occluded correctly by the roof at both openings (browser check, plus a unit test raycasting at a point covered only at 8 m).

---

## Task 5 — Material system: triplanar mapping, PBR library, lazy texture load

**Goal:** photoreal surfaces that tile at real-world scale on every box, extrusion and instance, with no stretching.

**Steps**
1. **World-space triplanar mapping.** Almost every explorer surface is a scaled unit box, so standard texture coordinates stretch. Write `src/stadium/materials.ts` with a triplanar patch (via `onBeforeCompile`, the same technique as the hero's `patch()`, with a `customProgramCacheKey`). It samples colour, normal (with a proper triplanar normal blend such as the "whiteout" or reoriented-normal method) and ORM by world position at a per-material scale in metres, blended by the surface normal. It must work with `InstancedMesh`, morph targets and the roof ring.
2. **Material library** (all `MeshStandardMaterial` unless noted), each with a real-world tiling scale and tuned roughness:
   - `concrete` (stand solids, soffits), `precast` (risers), `cladding` (outer wall panels), `steel` (trusses, mullions), `pylonPaint` (brand yellow, painted steel)
   - `roofTop`, `roofSoffit`, `polycarbonate`
   - `glass`: `MeshPhysicalMaterial` with low roughness, a hint of an interior colour behind it, and environment reflections. Avoid real transmission (expensive); fake depth with a darker, slightly blue base colour plus reflectivity
   - `turf` for the pitch, keeping the 14 mowing stripes as a colour modulation on top of the turf texture
   - `seatPlastic` for seats, keeping the per-instance colours (discovery dimming depends on `instanceColor`)
3. **Brand colour integrity.** The yellows (seats `#e0b912` / `#f6c900`, pylons `#f6c900`) must render on brand. Evaluate tone mapping: ACES (today), `AgXToneMapping` and `NeutralToneMapping` (Khronos PBR Neutral, designed to preserve base colours). Pick the one that keeps a pylon in the sun closest to `#f6c900` without dulling the concrete; document the swatch comparison. If ACES stays, port the hero's yellow self-light idea as a subtle term, not a flat glow.
4. **Macro variation to hide tiling:** blend a low-frequency noise (or a second, larger-scale sample) into colour and roughness on large surfaces (roof, walls, turf, ground). No visible repetition at `home-roof` or `exterior-low`.
5. **Lazy, progressive loading:** the first frame renders with untextured materials in the final palette (so it already looks right). KTX2 textures load after the first frame through a shared, ref-counted `KTX2Loader` cache (`detectSupport(renderer)`, transcoder from `public/`). The swap happens in one frame per material with no layout or camera change. Expose `data-textures="pending|ready"` on `.scene-host`. The phone tier loads the 1K set.
6. Dispose of everything on engine dispose. A StrictMode double mount must not load textures twice or leak them (check with `renderer.info.memory.textures` after mount → unmount → mount).

**Acceptance**
- No stretching or visible tiling at `facade-close`, `corner-close` or `preview-*`.
- The brand-yellow swatch comparison is in the completion doc.
- The first frame is not delayed by textures (compare time to `data-draw-calls` against the baseline).

---

## Task 6 — Lighting and rendering: IBL, sun shadows, post-processing, quality tiers

**Goal:** a believable daylight scene, where the building is grounded, lit by its sky and sits in a real atmosphere.

**Steps**
1. **Image-based lighting:** load the approved HDRI with `HDRLoader` and pre-filter it with `PMREMGenerator` into `scene.environment`. Use it as the visible background too, or a blurred version of it (`backgroundBlurriness`), so the dark-teal clear colour disappears. Tune `environmentIntensity` together with the lights. Replace the hemisphere light; keep one `DirectionalLight` as the sun, **aligned with the HDRI's sun direction**.
2. **Sun shadows:** `PCFSoftShadowMap`. The shadow camera frustum fits the stadium and its immediate surroundings (about 300 × 300 m). 4096² on desktop, 1024² on phones. Stadium solids, roof, trusses and pylons cast; the ground, stands and pitch receive. The crowd and players neither cast nor receive (cost). **Static shadows:** `renderer.shadowMap.autoUpdate = false`, with `needsUpdate = true` only when geometry changes (roof opening animation, textures ready, quality change). Tune the bias so there is no acne on the treads and no peter-panning under the pylons. The sun's shadow falling across the bowl from the roof edge is **the** photoreal cue at `preview-*`; get it right.
3. **Post-processing** with `EffectComposer`: `RenderPass` → `GTAOPass` (contact shading; half resolution; tuned so tread edges, corners and wall bases darken without halos) → optional `UnrealBloomPass` (high threshold, so only the light bars and bright sky reflections bloom; default off if it looks cheap) → `SMAAPass` → `OutputPass` (tone mapping and colour space). Turn off the renderer's own `antialias` when the composer is active. Render through the composer only on dirty frames (fact 7).
4. **Quality tiers** in `src/viewer/quality.ts`: `high` (desktop: everything above, DPR cap 1.75) and `compact` (phones: no GTAO, no bloom, 1024² shadows, 1K textures, billboard-only trees, DPR cap 1.4). Choose the tier from the existing compact flag, and allow `?quality=high|compact` for testing. Expose `data-quality`.
5. **Adaptive guard**, the hero's idea at explorer scale: over the first 2 s with atmosphere running, if the p95 frame interval exceeds 34 ms on `high`, step down (GTAO off → shadows 2048 → DPR 1) and record the step in `data-quality-step`. Never step down during a flight.
6. **Atmospheric perspective:** fog (`FogExp2` or a height fog in the ground shader) colour-matched to the HDRI's horizon, so distant ground fades into the sky rather than ending at a hard board edge (Task 8 extends the ground).
7. Remove the old light rig and exposure settings. The seat previews (`preview-*`) must look right too: roof soffit in shade, pitch in sun, no blown highlights.

**Acceptance**
- At `home-roof` and `exterior-low`, the stadium looks grounded (contact shading at the wall base, roof-edge shadows on the stands), with no dark-teal void anywhere.
- Frames where nothing changes cost no shadow render (verify through the draw-call counters).
- The `compact` tier renders correctly at `phone-home` and meets the 4× CPU p95 < 100 ms gate.

---

## Task 7 — Close-range detail and distance-based detail

**Goal:** the explorer holds up at the minimum orbit distance and in seat previews, where the hero never had to.

**Steps**
1. **Curtain-wall depth:** mullions stand proud of the glass (about 0.3 m), glass recessed; spandrel panels between glazing rows; a visible floor slab edge at each level behind the glass.
2. **Base and entrances:** a solid base course; entrance recesses with canopies on each stand (4–8 total, generic, no signage); two stair or ramp cores per corner (original geometry, no tracing).
3. **Roof edge:** the edge band gets a gutter line and panel joints; the top surface gets standing seams (normal map plus a few real edges on the band); the soffit gets purlins visible from `preview-*`.
4. **Pylons:** tapered masts, base plinths, stay anchor plates and a crown detail at the top. Brand yellow, painted-steel roughness.
5. **Trusses:** keep the triangular trusses, and add node plates if they read at `corner-close`.
6. **Distance-based detail:** the detail from steps 1–5 lives in separate instanced meshes, hidden beyond a camera distance (about 260 m, tuned so the switch never pops visibly; fade if needed). On `compact`, detail only shows in seat previews.
7. Keep the whole stadium within the Task 11 triangle budget at `home-roof`, where most detail should be hidden.

**Acceptance**
- `facade-close`, `corner-close` and `preview-*` hold up under inspection at 2× DPR: no flat planes where depth is expected, no z-fighting, no floating parts.
- No visible pop while zooming between the minimum and maximum distance (record a short capture, as in the hero's filmstrip script).

---

## Task 8 — Surroundings: ground materials, horizon, trees, buildings

**Goal:** a setting that matches the stadium's photoreal look, so the new building doesn't sit in a toy landscape.

**Steps**
1. **Ground as a splat map:** keep the canvas painter in `surroundings.ts` as the *layout*, but have it also emit a **mask texture** (RGBA channels, for example grass / asphalt / track / plots-or-gravel) plus a low-frequency tint map. A ground shader blends the tiled CC0 detail textures (triplanar or planar at world scale) by the mask, with the tint for macro variation. Paint markings (parking bays, track lanes, road dashes) stay as a separate crisp decal layer from the canvas, not blurred into the textures.
2. **Horizon:** extend the ground beyond the 850 m board with a large ring (to about 3 km) using grass and fields at low detail, fading into the fog and HDRI horizon. No visible board edge from any allowed camera angle, including `maxDistance` 550 at `maxPolarAngle`.
3. **Trees:** replace the icosahedron canopies with the approved species (Task 1). Instanced per species, with random rotation, scale and colour variation per instance. **Levels of detail:** the full mesh within about 250 m of the camera (desktop only), crossed billboards or impostors beyond, baked by an in-repo script from the approved models (`scripts/bake-impostors.cjs`, deterministic, outputs recorded in provenance as generated). Trees cast into the static shadow map near the stadium only. Budget: **≤ 250k triangles for all trees on desktop, ≤ 40k on phones.** An optional subtle wind sway in the vertex shader stops under reduced motion and when the atmosphere is paused.
4. **Buildings:** replace the six service buildings and the allotment sheds with procedural buildings (in `surroundings.ts` or a new `src/stadium/buildings.ts`): parapets, rooftop plant units, window bands (façade texture or procedural), loading doors, sheds with pitched roofs. Keep their positions and footprints from the current layout.
5. **Cars** (in scope as part of the setting): replace the two boxes with a bevelled car proxy (body plus cabin, ≤ 200 triangles), keep the colour variety, and use a clear-coat material on `high` (`MeshPhysicalMaterial` `clearcoat`) and standard on `compact`.
6. **Other surfaces:** the athletics track and pitch to the west, the railway corridor (ballast texture, rails with a steel material), the forecourt paving, roads with asphalt and worn markings.
7. The stadium's footprint exclusion (`|x| < 111 && |z| < 133` for trees) must still hold. Widen it if the new outer wall needs clearance.

**Acceptance**
- At `home-roof`, `exterior-low` and `phone-home`, the surroundings look like the same world as the stadium: same light, same material realism, no toy geometry left.
- No visible board edge or tiling. Tree levels of detail don't pop visibly while orbiting.
- The triangle budgets for trees are met and recorded.

---

## Task 9 — Visual review loop and critique

**Goal:** judge it by looking at it. This is where quality is won. Do not skip or abbreviate it.

**Steps**
1. Re-run the capture harness and produce `before-after` sheets: baseline next to the current state for every pose, plus `hero-match` next to the hero poster.
2. Critique each pose as a principal-level 3D and product designer, and write the critique in the completion doc. Check:
   - silhouette parity with the hero
   - value structure: can you read the building's shape in greyscale? Desaturate the captures to check
   - material separation: concrete, steel, glass and roof each read as themselves
   - brand yellow
   - shadow quality and direction consistency with the sky
   - tiling
   - scale cues: do people, seats, cars and trees read at the right size?
   - the surroundings' coherence with the stadium
3. Fix, recapture, repeat. **At least three rounds.** Keep each round's sheet in `.cache/explorer/` (git-ignored) and list them in the completion doc.
4. Optional second opinion: run a separate critique pass (Fable 5.1 is recommended) over the final sheets, with no access to this task list, asking only "what looks fake, and why?" Address its top findings or record why not.

**Acceptance**
- The final sheets are listed, every critique item is resolved or explicitly deferred with a reason, and the explorer at `hero-match` reads at least as real as the hero.

---

## Task 10 — Picking, preview flights and accessibility regression

**Goal:** the explorer still works exactly as before.

**Steps**
1. Unit tests (`tests/model.test.ts`): the existing stand picks, the new corner and outer-wall picks, the roof occlusion at both openings, and the tread-height check (Task 3).
2. Browser: `npm run test:browser`, `test:discovery` and `test:quality` pass. Manually check picking in each stand at `home-cutaway` and `home-roof`, and that clicks on a seat hidden behind the new walls or the roof don't select it.
3. **Preview flights:** for a sample of at least 30 places across every stand and tier, assert that the flight route and the eye position never pass through solid geometry (raycast along the route segments against `solids`, allowing a small tolerance at the eye). The flight's top-down leg (`[0, altitude, 0]`) must clear the roof at the 8 m opening.
4. Reduced motion: the cutaway snaps, tree wind stops and the flights still snap (existing behaviour).
5. Context loss and "Retry 3D": the engine recreates cleanly, textures come back from the cache, nothing leaks (`renderer.info.memory` before and after).
6. Axe checks in the existing suites still pass. The canvas's `aria-label` is unchanged.

**Acceptance:** all of the above pass, with results recorded.

---

## Task 11 — Performance, budgets and bundle gate

**Goal:** the new look within agreed budgets, enforced by tests.

**Budgets**

| Metric | Desktop `high` (1440 × 900) | Phone `compact` (390 × 844 emulation) |
|---|---|---|
| Main-pass draw calls (`data-draw-calls`) | ≤ 250 | ≤ 180 |
| Total draw calls incl. shadows and post (`data-draw-calls-total`) | ≤ 350 | ≤ 220 |
| Main-pass triangles (`data-triangles`) | ≤ 1,200,000 | ≤ 450,000 |
| p95 frame interval, atmosphere running | ≤ 20 ms at 1× CPU | < 100 ms at 4× CPU (existing gate, unchanged) |
| Asset download (after first frame) | ≤ 14 MB | ≤ 6 MB |
| GPU texture memory | ≤ 160 MB | ≤ 64 MB |
| Time to first explorer frame | ≤ baseline + 150 ms | ≤ baseline + 150 ms |
| Engine chunk growth | ≤ 70 kB gzip | — |
| Hero renderer chunk, main index chunk | unchanged (± 1 kB) | — |

**Steps**
1. Measure every budget. Profile the worst frame with Chrome's performance panel if p95 misses, and fix the cause (usually GTAO resolution, shadow-map size or tree levels of detail) before lowering the look.
2. Update `tests/quality.browser.cjs`: replace the old count gates with the table above (read `data-draw-calls`, `data-draw-calls-total`, `data-triangles`), and wait for `data-textures="ready"` before measuring. Keep the frame-time gate. Comment the reason for the change, referencing this task.
3. Add a check that a static camera with atmosphere paused triggers no renders, and that one dirty frame does not re-render the shadow map.

**Acceptance:** every budget is met, or the miss goes to the product owner. Numbers are in the completion doc, and the updated gates pass.

---

## Task 12 — Provenance, credits, docs and release integration

**Steps**
1. **Provenance:** inventory entries for every new file (source, scripts, tests, docs, processed assets, transcoder, impostor bakes). Original files use `origin: original`, `license: UNLICENSED`, `source_ids` like their neighbours plus `THREE-UPSTREAM` where three is imported. Third-party files as in Task 1. `npm run check` passes.
2. **Credits and notices:** confirm `public/credits.html` and `public/THIRD_PARTY_NOTICES.txt` list every CC0 asset. The credits page stays axe-clean.
3. **Packaging:** add `public/assets/explorer/**` and the transcoder to the allowlist in `scripts/package_release.py`.
4. **Docs:** update `README.md`, `docs/ui-components.md` and `docs/portfolio-release.md`: quality tiers, `?quality=`, `?explorer-pose=`, the ring cutaway, the asset pipeline (`scripts/process-assets.mjs`, `scripts/bake-impostors.cjs`) and the capture harness.
5. **Completion record:** `docs/explorer-fidelity-completion.md`, in the style of `docs/hero-animation-completion.md`: what was built, budgets and measurements, the critique rounds, asset list, decisions, deviations from this document, and what is unverified (Safari/WebKit, physical phones, low-end GPUs).
6. **Hero-frozen check:** re-hash the files from Task 0 step 4. They must match exactly.
7. Run `npm run release` and report the result. **Do not commit or push** unless the user asks.

---

## Definition of done

- At `hero-match`, the explorer has the hero's silhouette. Everywhere else, it reads as a photoreal building: closed, solid, grounded, correctly lit, with brand-accurate yellows.
- "Roof cutaway" pulls the roof back to a ring, smoothly and reversibly, and seat previews show the full roof.
- The surroundings look like the same world: textured ground, a real horizon, real trees and buildings.
- Picking, previews, discovery, reduced motion, context loss and accessibility behave exactly as before.
- The Task 11 budgets are met and enforced. The hero is byte-identical to the baseline.
- `npm run check` passes, and every third-party asset is fully documented.

## Out of scope

- Any change to the hero (code, tests, poster).
- Night or time-of-day lighting, weather, floodlights switching on.
- Replacing the crowd figures or players (`src/atmosphere/matchday.ts`) beyond material tuning. Escalate if they clash visibly with the new look (see below).
- Re-recording the demo video (`public/media/terrace-atlas-demo.webm`).
- WebGPU, a new rendering library, or any runtime npm dependency.
- Public deployment.

## Escalate to the product owner (don't decide alone)

1. Any need to edit a hero file.
2. A budget in Task 11 can't be met without a visible loss in quality on `high`.
3. The approved assets turn out unsuitable, or the license on an asset page is ambiguous.
4. The box-figure crowd and players look clearly out of place next to the photoreal stadium (a follow-up task may be warranted).
5. The demo video now misrepresents the product and should be re-recorded.
6. The brand yellow can't be held without a tone-mapping choice that visibly hurts the rest of the scene.
