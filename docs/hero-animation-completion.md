# Hero stadium animation — completion record

Tracks [hero-animation-task-list.md](hero-animation-task-list.md). **Tasks 0–3 complete (2026-09-28). Tasks 4–8 complete (2026-09-29).** Nothing is committed or pushed.

## Summary

The hero's right side now holds a live, decorative 3D stadium, derived only from the project's own layout. It builds in 6.5 s: the plinth, then a pitch wipe, a wave of tiers rising from the Südtribüne, the façade, the roof and eight pylons, ending on a yellow accent pulse. A calm idle follows, with a roof lift, camera sway, a crowd flicker on the South terrace, a pylon glint and damped pointer parallax. It plays once per browser session. It has Pause / Play and Replay controls, and a still poster for reduced motion and every failure path. The headline stays static and remains the LCP element, and the explorer is untouched.

| Budget (Task 7) | Target | Measured (production build) |
|---|---|---|
| Build frame interval p95, 1440, 4× CPU | < 34 ms | **16.8 ms** on a 60 Hz clock (0 dropped frames) |
| Build frame interval p95, 390 (mobile emulation), 4× CPU | < 50 ms | **16.7 ms** on a 60 Hz clock |
| Idle frame rate | ≤ 30 fps | **30.0 fps**; ≈ 1–1.5 ms main-thread work per hero frame at 4× CPU |
| LCP element / regression vs the pre-hero build | h1, ≤ ~100 ms | **h1**, +4 to +12 ms (1× CPU), +24 to +32 ms (4× CPU) |
| Hero code beyond `three` | ≤ 40 kB gzip | renderer chunk **10.7 kB**; all JS+CSS growth over the pre-hero build **24.1 kB** |
| `three` loaded | once, shared | **one** `three.module` chunk, shared by the explorer engine and the hero renderer |
| Hero CLS | ≤ 0.02 | **0.0025** (the page's pre-existing header font-swap shift; the hero adds none) |
| Draw calls / triangles | ≤ 60 / ≤ 150,000 | **10 / 115,056** |

Evidence images are in the git-ignored `.cache/hero/evidence/` (regenerate by rerunning the steps below).

## Task 0 — Preflight and the `fi` ligature fix

### Baseline (before any hero change)

| Command | Result |
|---|---|
| `npm run check` | PASS — 69 working files, 67 index entries, 13 commits, 139 historical blobs |
| `npm test` | PASS — 10/10 |
| `npm run build` | PASS — see chunk sizes below |
| `npm run test:browser` | **FAIL (pre-existing)** — times out waiting for the "Lower view" button (`tests/browser.cjs:47`) |
| `npm run test:discovery` | **FAIL (pre-existing)** — expects three `.representative-views button` (`tests/discovery.browser.cjs:29`) |
| `npm run test:quality` | **FAIL (pre-existing)** — times out waiting for the "Middle view" button (`tests/quality.browser.cjs:69`) |

The three browser failures predate this work. Commit `a5a852f` ("Refine saved viewpoints and stadium controls") removed the representative Lower/Middle/Upper view buttons from `StadiumExplorer.tsx`, but the browser suites still use them. Per the task list, they were reported and not fixed.

Running the browser suites needs two things:
- `tests/browser.cjs` imports `/src/places/demo.ts` directly, so the suites must run against a **Vite dev server**, not `vite preview`. Against 4173 it fails immediately with "Failed to fetch dynamically imported module".
- The suites default to port **5178**, not 4173. The baseline and after-change runs used `TEST_URL=http://127.0.0.1:5173` (the dev server that was already running).

Baseline `vite build` output:

```
dist/index.html                            0.63 kB │ gzip:   0.39 kB
dist/assets/index-D9PW47NA.css            25.18 kB │ gzip:   6.05 kB
dist/assets/StadiumExplorer-C_TZhJON.js   20.33 kB │ gzip:   7.26 kB
dist/assets/index-BizW5QE_.js            225.03 kB │ gzip:  70.58 kB
dist/assets/engine-CYSQZEF0.js           593.69 kB │ gzip: 150.14 kB
```

The engine chunk is **593.69 kB**, not the ~587.9 kB the task list quotes. That is the current baseline for the Task 7 bundle gate.

### Ligature fix

Area Inktrap's `fi` / `fl` ligature glyphs render blank ("fnd", "fctional"). The fix disables standard ligatures:

- `src/refinements.css` `:root`: `font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0;`
- `public/credits.html` has its own `@font-face` and showed the same bug ("affliated", "fgures", "identifes", "fctional"). The same two declarations went onto its inline `body` rule, the only edit to that file.

Verified visually at 1440 and 390 on the app, and at 1000 on credits. Every hero `.intro` / `h1` / `p` / `h2` bounding box measured identically before and after, so there is no other visual change. Evidence: `t0-ligature-{before,after}-1440.png`, `t0-ligature-after-390.png`, `t0-credits-{before,after}.png`.

## Task 1 — Hero layout slot and placeholder

**Files:** `src/hero/HeroArt.tsx` (new), `src/hero/framing.ts` (new), `src/App.tsx` (mounts `<HeroArt/>` inside `.intro`), `src/refinements.css` (hero section appended).

- **≥ 960 px:** `.intro` becomes a two-column grid. The art column is `min(600px, 100% − 620px − 48px)`, so it only ever gives way to the paragraph's 620 px measure. The copy spans both columns (`justify-self: start`) and stacks above the art (`z-index: 1`). The headline's tail may pass over the art's upper-left, which is empty sky in this camera framing. The copy drops by `clamp(0px, 12vw − 140px, 40px)` so line one of the headline stays clear of the left-corner pylon tips (≈ 128 px down in a 600 × 400 slot). Vertical padding is `clamp(56px, 290px − 16vw, 96px)`, which keeps the hero ≤ 540 px.
- **< 960 px:** stacked below the paragraph, `width: min(100%, 480px)`, `aspect-ratio: 8 / 5`, gap `clamp(28px, 5vw, 40px)`, bottom padding `clamp(40px, 6vw, 64px)`.
- **Markup:** `<div class="hero-art" aria-hidden="true" data-hero-phase="placeholder">`, a child of `.intro`, never inside `.scene-host`. `pointer-events: none`.
- **Placeholder:** an inline SVG of the plinth only (top face plus the two camera-facing sides). The polygons come from `plinthFaces(fitView(aspect))` in `framing.ts`, the same framing the WebGL camera will use. Colours come from `PLINTH_COLORS` (top `#1f201d`, about 12% above black). The Task 2 plinth mesh is unlit with `toneMapped: false` and uses those same colours, so the canvas's first frame should overlay the placeholder exactly. Both slot shapes are rendered, and CSS picks one per breakpoint.
- **Glow:** it moved from `.intro`'s background to `.hero-art::before`, centred on the slot. Its size is `135%` of the slot width with `closest-side`, which is ≈ 405 px radius at 1440 (the old glow was ≈ 404 px). Driven by `--hero-glow-x`, `--hero-glow-y` (default 50% / 50%) and `--hero-pulse` (0–1, applied as `brightness(1 + .35 × pulse)`). `.intro` is now `isolation: isolate; overflow: clip`, so the glow never paints over neighbouring sections.

| Viewport | Hero height | Art slot (x, y, w × h) | Explorer h2 bottom / fold | Overflow |
|---|---|---|---|---|
| 1440 × 900 | 519 px (≤ 540) | 768, 183, 600 × 400 | 718 / 900 | none |
| 1024 × 768 | 380 px | 719, 219, 254 × 169 | 567 / 768 | none |
| 768 × 1024 | 611 px (stacked) | 38, 388, 480 × 300 | 794 / 1024 | none |
| 390 × 844 | 578 px (stacked) | 16, 459, 358 × 224 (≤ 240) | 784 / 844 | none |

**Production build (`vite preview`):** hero CLS **0** at 1440 and 390. The page's only layout shift is a pre-existing 0.0023 in the header during font swap. The LCP element is still the **h1**, at ≈ 250 ms. `.hero-art` has no focusable descendants. Evidence: `t1-slot-{1440,1024,768,390}.png`.

The main bundle grew by 2.7 kB raw / 1.2 kB gzip (framing maths, placeholder, CSS). The engine chunk is unchanged. `heroStadium.ts` is not imported by the app yet.

## Task 2 — Lightweight hero stadium geometry

**Files:** `src/hero/heroStadium.ts` (new), `tests/hero.test.ts` (new), `scripts/test.mjs` (builds and runs both Node suites).

`buildHeroStadium()` imports only `three`, `src/stadium/layout.ts` and the three.js-free `src/hero/framing.ts`, and the import-graph test enforces this. It returns `{ group, roof, roofSlab, plinth, parts, stats, dispose }`. `parts` has one `InstancedMesh` per material: `pitch`, `markings`, `tiers`, `facade`, `roof` (light bars), `truss` and `pylons`. Each carries an instanced `aBuild` attribute `(u, rho, stand)` and exposes the same data as `parts[name].build`.

- `u` is 0 at the South end and 1 at the North end, normalized over the bowl's tier Z extent (±109.9 m).
- `rho = distance from the pitch-side edge / BOWL_DEPTH (44.16 m)`, over lower and upper tiers combined. Façade, roof and pylon stays have `rho = 1`.
- `stand` codes: 0 south, 1 west, 2 north, 3 east, 4 corner, 5 pitch, 6 pylon.
- Seat strips, aisle steps, vomitory fills, the concourse lip and the glazed band all reuse the `u` / `rho` of the column they sit on. An aisle step takes the later of its two neighbours, so nothing overtakes the mass beneath it.

### Budgets (measured)

| Metric | Budget | Actual |
|---|---|---|
| Draw calls | ≤ 60 | **9** (plinth, roof slab, 7 instanced parts) |
| Triangles | ≤ 150,000 | **111,012** |
| Instances | — | 9,018 (tiers 8,266) |
| Build time, Chrome, no throttle | — | 12.8 ms median (5 runs) |
| Build time, Chrome, 4× CPU throttle | ≤ 120 ms | **47.8 ms** median (43.8–52.9) |
| Build time, Node | — | ≈ 23 ms |

Most of the triangles are tier columns and strips. Hidden bottom and inner faces could be dropped in Task 7 if headroom is needed.

### Geometry decisions

- **Solid mass by construction.** Every tier row is a column from the plinth surface to its tread (not the explorer's floating 0.6 m slab), and each vomitory gap is filled with a dark recess. Growing columns can never reveal the plinth underneath (Task 2 step 5). In the settled state it looks the same as the explorer from above.
- **Wave granularity.** Every block row is split into halves, and the front five rows split around the vomitory as in `model.ts`, so `u` changes about every 9 m along the long stands. Corners use the explorer's radial 8-segment recipe, widened at the back so no slits open between segments.
- **Seat bands.** Seats are one strip per row per half-block, alternating in bands of 5 rows. Sides and corners use yellow `#e0b912` and dark concrete `#4f5652`; the South terrace is olive-gold `#96862c` columns with `#f6c900` / `#d9b20f` strips. Strips stop short of the aisles, where yellow steps sit.
- **Closed bowl.** The explorer's corner terraces reach ≈ 47.8 m from the corner origins (±44, ±63), beyond its stand façades, and its corners are open. The hero uses a rounded-rectangle outer wall: straight stand walls plus quarter arcs of radius 48.5 m around those same origins, with glass bands and mullions in the explorer's rhythm. This matches the animatic's rounded-ring outline. `BOWL` in `framing.ts` holds the constants.
- **Roof.** One exact extruded rounded-ring slab, with no overlapping pieces, so it can fade without double-opacity patches. As in the animatic, the roof covers only the outer half of the bowl: its opening is **25 m** behind each stand's front row, where `model.ts` uses 8 m. The explorer's opening hid almost all the yellow tiers from this camera. Trusses and light bars sit along the new opening edge, and the pylon stays land on the opening corner and the rim.
- **Pylons.** Eight masts at the `model.ts` positions, 62 m tall, radius 0.85, each with two stays: 24 instances in total.
- **Plinth.** 210 × 252 m, as in the explorer, but 5 m deep so it reads as a diorama base. Unlit (`MeshBasicMaterial`, `toneMapped: false`), with the placeholder's exact face colours.
- **Camera side.** `framing.ts` fixes the camera at NW (azimuth 45°, elevation 30°). The Südtribüne is the far short end, in the upper right of the frame and clear of the headline. The frame fits the settled model, with the roof fully lifted (0.26 × 34 m) and the pylon tips, with ≥ 6% padding. The test checks every vertex against both slot shapes.

### Tests (`tests/hero.test.ts`)

1. Instance counts per part are pinned. There are eight vertical 62 m masts. Every `u` and `rho` is in [0, 1] and every stand code is valid. Matrices are finite. The South front row has `u < 0.1` and the North back row has `u > 0.9`. The draw-call and triangle budgets hold.
2. With the roof fully lifted, every vertex is finite, inside the plinth footprint, and within the padded frame at 3:2 and 8:5. The fit is tight.
3. `heroStadium.ts`'s runtime import graph is exactly `framing.ts`, `heroStadium.ts` and `layout.ts`: no `places/demo`, no `stadium/model`.

`npm test`: **13/13 pass**. `model.test.ts` is unchanged, and `model.ts` was not modified.

### Visual check

A throwaway preview page (git-ignored `.cache/hero-preview/`, served by the dev server) renders the settled model with the explorer's lights and tone mapping. Evidence: `t2-settled-{1300,600,358}.png`. It reads as a cleaner cousin of the explorer: the same materials and proportions, a closed bowl, a readable pitch with markings, the yellow Südtribüne facing the viewer and eight pylons, on black with no landscape.

The same page approximates the build wave on the CPU (world-Y scale per instance, start `0.55 + 1.5u + 0.91ρ`, `easeO` over 0.7 s). Evidence: `t2-wave-cpu-{1.0,1.5,2.5}.png`. At 1.5 s the Südtribüne is complete and yellow while the North stand hasn't started. The ripple is continuous through the corners, and the mass is always solid.

## Handoff notes for Task 3

- **File naming.** The slot component is `src/hero/HeroArt.tsx`, not `HeroStadium.tsx`. On macOS's case-insensitive filesystem, `./HeroStadium` would resolve to `heroStadium.ts`. `HeroArt` should lazy-load the renderer module (for example `src/hero/renderer.ts`) after first paint.
- **Culling flat instances.** With world-Y scaling, instances that haven't started have k = 0. They collapse onto the plinth top at y = 0, z-fight with it and reveal the finished layout. The shader must cull k ≤ 0, for example by moving `gl_Position` out of the clip volume. The animatic draws tops dark (`#4b514d`) until tiers have height, which is worth copying.
- **Camera.** `fitView(aspect)` gives the ortho frustum in metres. Target = `center[0]·SCREEN_RIGHT + center[1]·SCREEN_UP`, position = target + `VIEW_DIR`·d, `up = SCREEN_UP`. The preview page shows exactly this setup.
- **Lighting.** The explorer's lights (hemisphere 2.7 plus sun 3.1 at exposure 1.25) push the roof close to white on black. It competes with the headline. Tune in Task 3/6: a lower hemisphere intensity, or a darker `HERO_PALETTE.roof`.
- **Placeholder hand-off.** After the 150 ms cross-fade, hide the placeholder SVG so it never shows through gaps during the build.
- **Pitch wipe.** Stripe order is available as `u` (0.28–0.72 across the stripes), so rescale it for the far → near wipe. The surround (`pitch` instance 0) has `u = 0.5`.

## Task 3 — Timeline, renderer and the 6.5 s build

**Files:** `src/hero/timeline.ts` (new), `src/hero/renderer.ts` (new), `src/hero/HeroArt.tsx` (loader), `src/refinements.css` (canvas cross-fade), `src/hero/heroStadium.ts` (metadata and palette fixes, below), `tests/hero.test.ts` (timeline test), `provenance/inventory.json` (two entries).

### Architecture

- **`timeline.ts`** is pure: no clock, no randomness, and no three.js. One exported `BUILD` table holds every constant, with a comment beside each. `buildState(t)` returns pitch wipe, markings, façade, roof offset and opacity, streaks, accent pulse and ring. Per-instance helpers (`tierProgress`, `stripeReveal`, `pylonProgress`, `mastHeight`, `stayReach`) mirror the shaders.
- **Per-instance growth runs in vertex shaders** (`onBeforeCompile` patches with a per-kind `customProgramCacheKey`), driven by `uT` and each instance's `aBuild = (u, rho, stand)`. Scrubbing to any `t` therefore costs one frame. The rules:
  - **Tiers:** scale in world Y about the plinth surface, `k = easeO((t − (.55 + 1.5u + .91ρ)) / .7)`. The columns are solid from y = 0 (Task 2), so the growth reads as mass rising. Tops blend from the animatic's dark `#4b514d` to their colour over the first 30 % of the rise.
  - **Façade:** one uniform world-Y scale.
  - **Pitch:** per-stripe alpha, ordered far → near by `u`.
  - **Pylons:** each mast grows from the ground. Its two stays string from the moving tip to their roof anchor over the last 55 % of the rise. The anchor follows the roof lift, so Task 4's idle lift keeps the stays attached.
  - **Culling:** anything with zero reveal is moved outside the clip volume, so nothing flat ever marks the plinth or hints at the layout.
- **Roof:** the whole roof group (slab, trusses and light bars) translates and fades. The roof descends with `easeQ` from `(.10 + .75) × wall` to `.10 × wall` above rest. The rest lift of 0.10 is the idle lift's trough, so Task 4 can start its sinusoid from zero velocity at 6.5 s. Opacity is `smoothstep(travel / .55)`. Depth writes turn on once it is opaque (from 5.0 s). It stays in the transparent pass with alpha exactly 1, so fading never swaps shader programs mid-animation. The same is true of the pitch and markings.
- **Streaks:** 32 thin yellow bars rise from the roof rim during the descent, at ≤ 0.4 opacity. They fade in over the first 25 % of the travel and out from 55 % to landing.
- **Accent (6.2 s):** a rounded-rectangle ring on the plinth top, drawn with an SDF of the façade outline. It expands 1 → 14 m beyond the wall with `easeO`, fades at the plinth edge, and is gone by 7.3 s. `--hero-pulse` (0 → 1 → 0, peak 6.25 s, 650 ms) is written on `.hero-art`, so the existing CSS glow already brightens. The same pulse adds an emissive flash to the pylons.
- **Renderer:** `WebGLRenderer({ alpha, antialias })` with transparent clear, sRGB output, ACES at exposure 1.25, and DPR ≤ 1.75 (≤ 1.4 below 960 px). There are no shadow maps. The camera is an `OrthographicCamera` built from `fitView(measured aspect)` in `framing.ts` (NW, 45° / 30°, ≥ 6 % padding) and refits on resize.
- **Loading:** `HeroArt` arms after the first painted frame, then imports `./renderer` on `requestIdleCallback` (1200 ms timeout) or `load`, whichever comes first. The build clock starts on the first frame rendered while the slot is on screen and the tab is visible. Delta is capped at 0.06 s, as in the explorer. On that frame `data-hero-ready` is set: the canvas fades in over 150 ms, then the placeholder is hidden. The render loop cancels itself once t ≥ 7.4 s, when the pose is final.
- **Test hooks:** `?hero-t=<s>` freezes and renders exactly one frame, plus one per canvas resize. `.hero-art` exposes `data-hero-phase` (`placeholder → build → settled`, or `static` under reduced motion), `data-hero-frame` and `data-hero-t`.
- **StrictMode:** setup is cancelled if unmounted before the import resolves, and `dispose()` is idempotent. It frees geometries, materials, the renderer and observers, then calls `forceContextLoss()`. Exactly one `canvas.hero-canvas` exists after the dev double mount.

### Choreography as built

| Time (s) | Beat | As built |
|---|---|---|
| 0 | Plinth | The unlit plinth only. It overlays the placeholder exactly |
| 0.05–0.57 | Pitch wipe | The animatic formula `(w·1.15 − (i/14)·.9)/.25`. The surround lays down with the far stripe |
| 0.57–0.85 | Markings | Smoothstep fade (the animatic pops them in at w ≥ .95) |
| 0.55–3.66 | Tier wave | `.55 + 1.5u + .91ρ`, easeO over 0.7 s |
| 3.4–4.6 | Façade | Uniform easeQ |
| 4.6–5.8 | Roof | easeQ descent from 0.75 × wall above its landing. Opaque from about 5.0 s |
| 5.8–6.5 | Pylons | Per mast: 0.55 s easeO, staggered 0–0.15 s from South to North, so the last one lands at exactly 6.5 s |
| 6.0–6.65 / 6.2–7.3 | Accent | Pulse / ring |
| 6.5 | Settled | `data-hero-phase="settled"`. The loop stops at 7.4 s (Task 4 adds idle) |

### Visual tuning

Measured against the animatic palette (pixel samples of `?hero-t=7` at 2×):

| Surface | First pass (explorer lights) | Final | Animatic |
|---|---|---|---|
| Roof | `#bbc0b8`–near white | `#a8ada1`–`#b9bdaf` | `#b0b7b2`–`#b9bfba` |
| Pitch | `#57aa5e` | `#419348` | `#387d47` |
| South terrace | `#a39733` (olive) | clearly yellow-gold | `#f6c900` / `#d9b20f` tops |
| Pylon | `#8d821d` | `#a99e3e` average over the lit and shadow sides | `#ffd900` / `#c9a800` |

- Lights: the explorer's colours and sun direction at hemisphere **1.3** and sun **2.6** (explorer: 2.7 / 3.1), with exposure unchanged at 1.25.
- ACES compresses saturated yellow toward olive. Yellow surfaces therefore get a small self-light term: `uGlow = 0.6 × albedo` on pylons, and on tier instances whose linear colour passes a yellow mask. Seats and steps pass it; concrete and the olive risers don't.
- The South terrace risers moved from `#96862c` to `#b0931c`. From this camera the risers make up most of the terrace, and with the olive the Südtribüne didn't read as "yellow first".

### Verification

- `npm test`: **14/14 pass**. The new timeline test sweeps `t ∈ [0, 12]` in 1 ms steps. It checks that every scalar is bounded and moves by no more than its designed slope, and it checks every beat: all zero at 0, stripes down before the markings, the roof ghost at 4.9 s, opaque at 5.8 s, pylons complete at 6.5 s, pulse peak in 6.2–6.3 s, and the accents gone at 7.4 s. It also asserts that the South front row is complete while the North front row has not started at 1.5 s.
- `npm run check`: PASS (76 working files). `tsc --noEmit`: clean.
- **Scrub filmstrips:** `.cache/hero/evidence/t3-scrub-1440.png` and `t3-scrub-390.png` cover the 14 times in the task (individual frames alongside), and `t3-vs-animatic.png` puts them side by side with the animatic at 1.5 / 4.9 / 7.0. At 1.5 s the Südtribüne is up and yellow while the North stand hasn't started, and the wave runs continuously through the corners. At 4.9 s the façade is complete and the roof is a translucent ghost with streaks. At 7.0 s the roof, the eight pylons with stays, and the fading ring are all in place. The frame is centred with clear padding at 1440 (600 × 400 slot), 1024 (254 × 169) and 390 (358 × 224).
- **Pop check:** a pixel-difference curve over `?hero-t` every 50 ms from 0 to 7.5 s, on the 600 × 400 slot, flagged **no spikes above 3× the local median**. The one steep onset was the roof appearing, 0.06 → 2.08 in one step, with a slope kink as it turned opaque. Switching the roof opacity to smoothstep fixed it: the steps are now 0.84 → 2.19 → 2.94 → 3.38 → 3.54 and decay smoothly to 0 at 5.85 s.
- **Real time, dev and `vite preview`, 1440 × 900:**
  - First frame ≈ 150–290 ms after navigation.
  - `placeholder → build → settled` after **6.57 s** of wall time.
  - Build-frame interval p50 / p95: **16.7 / 16.8 ms**, over 388 frames.
  - The loop stops by itself at t = 7.41 s.
  - One canvas, the placeholder hidden, no console errors.
  - With CDP 4× CPU throttling the first frame arrives at 1.1 s and p95 stays 16.7 ms, because per-frame CPU work is a handful of uniform writes.
- **Lifecycle:**
  - Reduced motion renders one `static` frame at t = 7.4.
  - Loading with the hero scrolled offscreen renders nothing (phase stays `placeholder`); the build starts from 0 when it scrolls in, and freezes (frame counter stops) when scrolled away.
  - Resizing 1440 → 800 refits (canvas 480 × 300) with a single redraw.
  - A frozen `?hero-t` page draws exactly once.
- **Browser pane:** `?hero-t=7` at 1024 px renders the settled stadium beside the copy, with no console errors. The explorer is unaffected.

### Bundle

```
dist/assets/renderer-BqVkUEBz.js          19.26 kB │ gzip:   8.04 kB
dist/assets/StadiumExplorer-V5Sz6OtP.js   19.65 kB │ gzip:   7.04 kB
dist/assets/engine-C-V8I2NK.js            49.37 kB │ gzip:  15.04 kB
dist/assets/index-CDESht9r.js            228.73 kB │ gzip:  72.22 kB
dist/assets/three.module-Berx7pOE.js     573.03 kB │ gzip: 144.53 kB
```

`three` is now one chunk shared by the explorer engine and the hero renderer, loaded once. The hero renderer chunk (with its geometry) is **8.04 kB gzip**. The > 500 kB advisory now names `three.module` (573.0 kB) instead of `engine` (593.7 kB before), because Rolldown split the shared dependency out. It is the same code, not new weight.

### Handoff notes for Task 4

- Idle should take over at `t ≥ BUILD.settled`. The roof lands at `BUILD.roof.rest × WALL_HEIGHT` (the 0.10 trough) with zero velocity, so `lift = .18 − .08·cos(2π(t − 6.5)/16)` (× wall) continues it smoothly. Drive `uRoofLift` and `roof.position.y` from it; the stays follow automatically.
- Camera sway and parallax: rotate the `VIEW_DIR` azimuth and refit. `fitView` already covers the lifted roof, but ±4° of sway needs a margin check (`EXTENT_POINTS` against rotated screen bases).
- The render loop currently stops at `BUILD.end`. Idle needs it to continue at ≤ 30 fps.
- `--hero-pulse` is already written on `.hero-art`. The accent underline sweep (5.9–6.6 s) still needs its CSS variable.

## Task 4 — Idle loop, pointer parallax, copy and glow sync

**Files:** `src/hero/timeline.ts` (the `IDLE` table, `STATIC_T`, idle fields on `buildState`), `src/hero/framing.ts` (camera orbit and motion envelope), `src/hero/heroStadium.ts` (seeded crowd part), `src/hero/renderer.ts` (idle loop, parallax, crowd and glint shaders), `src/refinements.css` (underline), `tests/hero.test.ts`.

### Idle motion (all pure functions of t, τ = t − 6.5)

- **Roof lift:** `(.18 − .08·cos(2πτ/16)) × wall`, so .10 → .26 → .10 over 16 s. At 6.5 s this is exactly the build's rest lift (.10) with zero velocity, so it continues without a seam.
- **Camera sway:** azimuth `4° · smooth(τ/5) · sin(2πτ/21)`. The amplitude eases in over 5 s, so the camera also leaves 6.5 s at rest. Roof (16 s) and sway (21 s) only realign every 336 s.
- **Crowd:** 504 seeded flecks (one instanced draw call) on the Südtribüne's front 30 rows, 45 % white, 30 % dark, 25 % yellow. Each stands up from 6.0 s over 0.35 s, staggered by seed over 0.6 s. It then twinkles on two unrelated per-fleck sines in the vertex shader, which lighten and add emissive.
- **Pylon glint (optional, included):** a highlight band sweeps up the eight masts every 9⅓ s, taking 30 % of the period, first at t ≈ 10.5 s. It is a uniform in the existing pylon shader, so it adds no draw call. It only wraps while it is off the masts.
- **Frame rate:** the build draws every display frame. From `BUILD.end` (7.4 s, once the ring and pulse are over), idle draws at most 30 fps. The 60 → 30 change therefore happens when motion is nearly still, not at 6.5 s.
- **Camera model:** every pose now orbits the stadium's vertical axis through the origin with a fixed, off-centre orthographic frustum. `fitView` fits the union of all poses in the envelope: ±7.5° azimuth (sway plus parallax) and ±1.5° elevation. The frame keeps ≥ 6 % padding at every idle pose. The envelope costs 0.4 % of stadium size at 3:2 and 2.3 % at 8:5. The placeholder uses the same fit, so it still overlays the first frame exactly.

### Pointer parallax

- Listener on the `.intro` section (`pointermove` / `pointerleave`), gated by `(pointer: fine)` and ignoring touch. It maps to ±3.5° azimuth and ±1.5° elevation.
- A critically damped follow uses the exact solution, with ω = 1/τ and τ = 250 ms, so it is stable at any frame interval and never overshoots. A step settles 95 % in ≈ 1.19 s, which is also the return to neutral on `pointerleave`.
- Influence is `smooth((t − 6)/1)`, 0 until 6.0 s and 1 from 7.0 s. It is off under `?hero-t`, while paused and under reduced motion.

### Copy and glow sync

- **Underline:** `.intro h1 em::after`, a 4 px `--yellow-400` bar at `bottom: −.14em`, `transform: scaleX(var(--hero-underline))` from the left. The timeline drives it (smoothstep over 5.9–6.6 s) through `--hero-underline` on `.intro`. It is present under reduced motion (CSS), in session-skip and in the poster fallbacks (HeroArt sets it before paint). It is absolutely positioned and transform-only.
- **Glow:** `--hero-pulse` (0 → 1 → 0, peak 6.25 s, 650 ms) now lives on `.intro` with the underline. The existing `.hero-art::before` filter lifts it by at most +35 %. Both variables are written only when their value changes, so idle frames cause no style work.

### Measurements

| Check | Result |
|---|---|
| Jump at 6.5 s | None. Mean frame-to-frame pixel difference over `?hero-t` 6.30–6.70 s in 1/60 s steps, 600 × 400 slot: 0.54 → 0.10, falling smoothly through 6.5 s (0.375, 0.368, 0.331). The largest local bump (0.41 at 6.583 s) is < 1.5× its neighbours. At 1/120 s steps it halves (0.21), so it is motion, not a pop |
| Idle loops within 60 s | None. Unit test: for every candidate period 1–60 s (0.05 s steps), the (lift, sway) pose drifts by more than 20 % of its range |
| Frame rate, real time (1440, dev) | Build 59.9 fps, idle **30.0 fps** |
| Copy boxes | h1, `h1 em` and paragraph `getBoundingClientRect()` identical before load and after the full run: `72,215.39,860.34,137` / `72,288.89,496.05,63.5` / `72,409.98,620,58.88` |
| Parallax | Full right deflection turns the diorama visibly with the lifted roof and pylon tips unclipped. It returns to neutral when the pointer leaves |
| Geometry | 10 draw calls (+1 crowd), 117,060 triangles, 9,522 instances |

### Underline review (escalation point 1)

The underline was reviewed at 1440 and 390. In my view it isn't redundant: the headline is already yellow, but the bar is a different kind of mark. It is a hard horizontal that lands with the pylons and gives the build a final beat in the copy. It is fully built, so removing it is a one-rule CSS change. **This remains the product owner's call**, and the evidence is `h1-*.png` / `a-90.5.png`.

## Task 5 — Session-skip, controls, lifecycle and fallbacks

**Files:** `src/hero/HeroArt.tsx` (rewritten), `src/hero/renderer.ts`, `src/refinements.css`, `scripts/render-hero-poster.cjs` (new), `public/media/hero-stadium-poster.webp` (new), `provenance/inventory.json` (two new entries, five notes updated).

### Behaviour

- **Still pose `STATIC_T` = 90.5 s:** τ = 84 s on the idle curve (84 = 16·5.25 = 21·4 = 9⅓·9). It has mid roof-lift (.18) and rising, zero sway, the glint resting and no accents. The poster, reduced motion, pause-to-settled and session-skip all use it, so idle resumes from any of them without a jump.
- **Session-skip:** `terrace:hero:played:v1` is set when the build passes 3.0 s. All storage access is try/catch, so blocked storage means every load is a first visit. Later loads render the poster (fading in over the plinth placeholder as it decodes), and the stage mounts underneath at `STATIC_T` with no canvas fade. The poster then fades out over 200 ms, idle runs, and the accent (ring, glow pulse and pylon flash) plays once, 0.2 s later, through `buildState(t, accentAt)`.
- **Controls:** a `role="group"` "Stadium animation" in the slot's bottom-right, styled like "Pause atmosphere" (square, 1 px `#8b9691` border, 13 px), on a translucent `#182021` fill for low emphasis. Both buttons are 44 px tall.
  - **Pause / Play animation:** `aria-pressed` is true when paused, and the label switches. Pausing during the build (or before 7.4 s) jumps to `STATIC_T` behind a 200 ms snapshot cross-fade. The last frame is drawn into a 2D canvas overlay that fades out; the underline eases over the same 200 ms. Pausing in idle freezes the current pose. The choice persists in `terrace:hero:paused:v1`, and a paused reload shows the settled pose (poster → one canvas frame), `data-hero-phase="paused"`.
  - **Replay:** cross-fades back to t = 0 and plays the full build, also un-pausing.
  - Hidden under reduced motion, in every poster fallback, and under `?hero-t`.
  - Below 960 px, both collapse to 44 × 44 icon buttons with the text kept as a visually hidden name. The labelled pair covered the plinth's front corner in the 8:5 slot.
- **Lifecycle:** the loop runs only while visible, on screen and not paused, with delta capped at 0.06 s. A stopped loop has no pending rAF. A hero offscreen at load builds on first view (Task 3). Disposal is idempotent, with `forceContextLoss`; see the WebGL context check under Verification.
- **Reduced motion (live):** at load, WebGL is never loaded, the poster shows, the phase is `static`, the controls are hidden and the underline is present. Switching reduce on while the stage runs draws one `static` frame at `STATIC_T` (instant, no fade) and stops. Switching it off continues idle from `STATIC_T` without rebuilding. The stage's own `MediaQueryList` listener was not delivered reliably in Chrome. Frames now compare the value, and HeroArt also calls `stage.motionChanged()` from its own listener.
- **Fallbacks (poster, no error UI):**
  - Without WebGL loaded at all: no `WebGL2RenderingContext`, `saveData`, `hardwareConcurrency ≤ 2` or `deviceMemory ≤ 2`, a failed import, or a `WebGLRenderer` constructor that throws.
  - After start: `webglcontextlost`, or the quality guard. The stage hands over, the poster loads and fades in over the live canvas (≥ 220 ms), and only then is the stage disposed. The phase ends `static` with `data-hero-quality="poster"`.
- **Quality guard:** p95 of frame intervals over the first 1.5 s of the build, skipping the first three frames, which carry shader compilation. If it is over 50 ms, DPR drops to 1 and `data-hero-quality="reduced"`. If a further 1 s is still over 50 ms, the stage jumps to `STATIC_T` and hands over to the poster. Otherwise it stays `full`.
- **Poster:** `scripts/render-hero-poster.cjs` loads `/?hero-t=90.5&hero-dpr=2` (the 600 × 400 slot at 1440 × 900) and dispatches a `hero-capture` event. The stage then re-renders and calls `canvas.toBlob('image/webp', .9)` in the same task, so the drawing buffer is intact. Output: **1200 × 800 WebP with alpha, 102.1 kB.** The 3:2 poster is shown in the 8:5 stacked slot, scaled to 98.2 % × 104.8 % (`--poster-w` / `--poster-h` from the two `fitView` results), so its metres-per-pixel and centre match that slot's camera exactly. The crop only removes padding. Regenerate:

```bash
TEST_URL=http://127.0.0.1:5173 node scripts/render-hero-poster.cjs
```

The `sha256` in `provenance/inventory.json` must then be updated.

### Verification (scratch Playwright runs, dev server and production `vite preview`, 1440 × 900)

26/26 checks passed on both the dev server (StrictMode) and the production build:

| Check | Result |
|---|---|
| First load in a fresh context | `placeholder → build → settled → idle`, and the played flag is set after 3 s |
| Reload in the same context | Settled in **144–146 ms**, phases `placeholder → idle`, no build. The poster ends at opacity 0, the underline is present, and the accent pulse replays (peak 0.998) |
| New context | Builds again |
| Pause during build | `data-hero-t` jumps to 90.500, `data-hero-frame` stops (93 → 93), the label reads "Play animation" with `aria-pressed="true"`, and the snapshot overlay is removed afterwards |
| Paused reload | `paused`, one frame, frozen |
| Play, then pause in idle | Play resumes idle from 90.5 s. Pausing in idle freezes the pose (t unchanged) |
| Replay | Back in `build` at t = 0.28 s |
| Offscreen | Scrolling to the explorer freezes the frame counter, and scrolling back resumes it |
| Reduced motion | `static`, no hero canvas, poster at opacity 1, controls `display: none`. Off → idle from 90.5 s. On again → one frame at 90.5 s, then stopped |
| Blocked storage (`sessionStorage` getter throws) | Builds on reload, no page errors |
| `WEBGL_lose_context` | Poster, stage disposed (no hero canvas), `static` / `poster`, no page errors |
| `hardwareConcurrency = 2`, `saveData` | Poster; the renderer chunk is never requested |
| Quality guard (rAF callbacks forced to ≥ 55 ms) | `build` at 0.99 s, handed to the poster at 4.4 s, ending `static` / `poster` |
| WebGL contexts, app → `credits.html` → back | One `canvas.hero-canvas` and two WebGL contexts (hero + explorer) before and after. No accumulation |
| Poster vs live canvas at `STATIC_T` | Aligned at 1440, 1024 and 390. Mean absolute difference 2.7 / 3.3 / 3.3 of 255, from resampling on thin lines. Task 6 judges the swap visually |
| axe (WCAG 2A/AA, 2.1 A/AA, 2.2 AA) on `.intro` | No violations at 1440, 390 and paused |
| Overflow | `scrollWidth` equals `innerWidth` at 1440 and 390 with the controls |

`npm test` 15/15, `npm run check` PASS (78 working files), `tsc --noEmit` clean.

### Bundle after Tasks 4–5

```
dist/assets/index-BLXd4mlU.css            28.22 kB │ gzip:   6.81 kB
dist/assets/layout-Duoqcp0c.js             0.96 kB │ gzip:   0.45 kB
dist/assets/StadiumExplorer-xkzg5Wda.js   19.65 kB │ gzip:   7.04 kB
dist/assets/renderer-C-z-gNbR.js          25.96 kB │ gzip:  10.49 kB
dist/assets/engine-CQHr57z5.js            49.37 kB │ gzip:  15.04 kB
dist/assets/index-CNzxMLJZ.js            232.53 kB │ gzip:  73.59 kB
dist/assets/three.module-Berx7pOE.js     573.03 kB │ gzip: 144.53 kB
```

The renderer chunk grew from 8.04 to 10.49 kB gzip. The main chunk grew 1.4 kB gzip for the controls, session logic and poster fit. Rolldown now splits `src/stadium/layout.ts` into a 0.45 kB chunk shared by the explorer and the hero. `three` is still one shared chunk.

## Task 6 — Visual review loop

**Files:** `scripts/hero-filmstrip.cjs` (new), `src/hero/timeline.ts`, `src/hero/renderer.ts`, `src/hero/heroStadium.ts`, `src/hero/framing.ts`, `src/hero/HeroArt.tsx`, `src/refinements.css`, `tests/hero.test.ts`, `public/media/hero-stadium-poster.webp` (regenerated), `provenance/inventory.json` (script entry, new poster `sha256`).

### Tooling

`scripts/hero-filmstrip.cjs` runs entirely in Chrome, because this machine has neither ffmpeg nor PIL. Output goes to the git-ignored `.cache/hero/filmstrip/<label>/`.

- **Contact sheets:** `?hero-t` at the 19 specified times, at 1440 × 900 and 390 × 844 (DSF 2), cropped to the art slot and composed on a canvas with time and phase labels. Individual frames go in `frames/`. The whole hero at 12 s goes in `hero-{1440,390}.png`.
- **Swap check:** the live canvas at `STATIC_T` against the poster (a reduced-motion load), with a ×6 difference image and the mean absolute difference.
- **Real-time smoothness:** a Playwright video of a fresh first visit, decoded frame by frame with `requestVideoFrameCallback` at half speed.
  - Video time maps to hero time through a `data-hero-t` log.
  - The 100 ms samples are differenced over the art slot and normalised to 100 ms, because the 25 fps video alternates 80 and 120 ms gaps.
  - A spike is anything over 3× the local median (±5 samples), except in the designed accent at 6.0–6.7 s.
- **`--scrub`:** a deterministic curve at `?hero-t` steps of 1/30 s over 0–8 s. This turned out to be essential: the video capture has its own duplicate-then-catch-up jitter, and the scrub separates real pops from capture artefacts.

```bash
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers TEST_URL=http://127.0.0.1:5173 node scripts/hero-filmstrip.cjs final --scrub
```

(`PLAYWRIGHT_BROWSERS_PATH` points Playwright at the project-local ffmpeg it needs for video, as `record:demo` does.)

### Critique log

**Round 0 (baseline).** Evidence: `t6-round0-sheet-{1440,390}.png`, `t6-round0-smoothness.png`, `t6-round0-roof-pylon-beats.png`.

| Finding | Evidence | Fix |
|---|---|---|
| **Dead beat at 5.8–6.05 s.** The roof had eased to rest, and the far pylons, which rose first (South → North), were hidden behind it until they cleared its height | Video difference 0.13 / 0.09 at 5.9 / 6.0 s, then 4.8 at 6.1 s | Pylons start at **5.6 s** and rise over **0.75 s** (the animatic's 0.7), overlapping the roof landing. They are staggered **North → South**, so the near masts, which stand clear of the façade, lead. The last still lands at 6.5 s |
| **Roof ghost too abrupt.** The fade followed easeQ travel, which is fastest at the start, so this large pale shape went 0 → 1 in 0.4 s | The build's largest frame difference (9.1 at 4.7 s) | Opacity is smoothstep over the first **45 % of the time** (opaque by 5.14 s, ≈ 70 % of the travel). It is still a translucent ghost at 4.9 s |
| **Streaks read as a picket fence of posts on the rim** | 5.0 s zoom | Each streak fades out along its length (vertex alpha `(1 − y)^1.6`) and is thinner (0.4 m) |
| **Frame drops as each part first appeared** (tiers 0.54 s, façade 3.39 s, roof 4.59 s, pylons 5.59 s, crowd 5.99 s) | ≈ 30 ms frames at each onset. The display froze longer than the JS gap (lazy GPU pipeline creation) | `compileAsync` links every program before the first frame, and the first frame draws every part. At t = 0 each part is culled in its vertex shader or has zero opacity, so the frame is identical to the gated one and to the placeholder |
| **Two long frames (≈ 50 + 80 ms) at 0.10–0.15 s**, in dev and production | Long-task log: the explorer's engine chunk arrives ≈ 100 ms after the hero's first frame, runs an 80 ms model build, then draws a first frame of 644k triangles | `HeroArt` mounts the stage after the explorer's first frame (`.scene-host[data-draw-calls]`, read only) plus one more frame, capped at 1.2 s. The placeholder is identical to the first frame and the clock starts on it, so the wait is invisible. The explorer is untouched |

**Round 1.** Evidence: `t6-round1-scrub.png`.

| Finding | Evidence | Fix |
|---|---|---|
| **The wave began at 0.85 s, not 0.55 s,** leaving the pitch alone for 0.3 s. `u` spans the whole bowl, so the Südtribüne's front row sits at u ≈ 0.2, and the animatic's `tierH()` has the same property | Scrub mean 0.035 over 0.6–0.9 s. Per-instance starts: earliest 0.85 s | `start = .55 + 1.5·max(0, u − lead)/(1 − lead) + .91ρ` with **`lead = .2`**, the South front row. It is `BUILD.tiers.lead`, and a unit test ties it to the geometry. The first tier rises at 0.55 s and the last still lands at 3.66 s, so it keeps its overlap with the façade (scrub mean 0.32 over 0.6–0.9 s) |
| **The video froze at 5.9–6.1 s,** while the stage drew a steady 17 ms. From 5.9 s every frame rescaled the headline underline and changed `filter: brightness()` on the ≈ 810 px glow, which forced repaints | Recording with those two effects neutralised removed the 6.2 s jump (1.33 against 3.92) | The underline gets `will-change: transform`. Where `plus-lighter` is supported (`@supports`), the pulse is now an additive copy of the glow at 35 % strength (`#0c0d09`) whose `opacity` follows `--hero-pulse`; other engines keep the filter. Over the hero black this equals `brightness(1 + .35·pulse)`: measured against the old filter, max 2 / 255 per channel and mean 0.24. It is compositor-only |

**Round 2 and the Fable 5.1 critique-only pass.** Evidence: `t6-round2-sheet-*.png`, `t6-critique-before-after.png`. The pass was given the round-2 sheets, the hero crops, the swap images, both curves, the animatic comparison and the checklist.

| Finding | Decision |
|---|---|
| Pylons read as "TV aerials": 1 px masts with stays as heavy as the masts | **Applied.** Mast radius 0.85 → **1.2 m**, the animatic's 26 : 1 column. Stays 0.32 → **0.2 m**. `PYLON.radius` feeds `fitView`, so the placeholder, framing and poster all follow |
| Crowd flecks read as dirt or snow | **Applied.** Pure white → warm cream `#e9dfbd`. Mix changed from 45 % light / 30 % dark to 30 % light / 45 % dark, plus scarves. Density 0.4 → 0.3 (504 → 337 flecks). The twinkle is softer: it mixes 30 % toward a warm white with 0.25 emissive (was 45 % / 0.35) |
| The accent ring reads as a selection outline | **Applied.** Peak opacity × 0.6 (`BUILD.ring.peak`) and a finer core (0.3 m half-width + 0.5 m feather, was 0.45 + 0.6) |
| The pitch is the most saturated colour | **Applied, toward the animatic.** Stripe inputs `#316e3e` / `#2b6338`, which render close to the animatic's `#387d47`. They rendered ≈ `#419348` before |
| Tier backs are exposed between the roof and the façade | **Declined.** This is the idle roof lift ("the roof lifts clear of the walls"), a locked decision. Zooms at 7 / 12 / 90.5 s show a clean band with no see-through or sorting fault |
| The roof value dominates | **Declined.** It was matched to the animatic's measured roof in Task 3, and the headline (`#fffdf2`) stays clearly brighter |
| Dead beat at 5.8–6.0 s; flat stretch at 3.4–4.6 s; real-time hitch at 4.4 s; spike at 9.5 s | **Declined, with evidence.** In the scrub, 5.83–5.97 s reads ≈ 0.01 because two masts a few px wide change ≈ 0.01 % of the slot while visibly rising, so the metric understates thin features. From 3.66 s the façade rises alone (the specified timing), with continuous motion (≈ 0.3). The 4.4 s and 9.5 s flags exist only in the video. The stage logs no build frame over 18 ms, and the programs are already warmed at t = 0 |
| Pose mismatch at the poster swap | **Declined.** The poster is the exact `STATIC_T` pose. The difference is edge resampling (a 1200 px bitmap against a DPR 1.75 / 1.4 canvas), with no offset or colour shift. It was regenerated after the pylon change anyway |

**Round 3 (final).** Evidence: `t6-round3-sheet-{1440,390}.png`, `t6-final-*.png`.

### Checklist (final round)

| Check | Result |
|---|---|
| South terrace leads in yellow at 1.5 s; the wave is one ripple | Yes. The first South rows leave the plinth at 0.6 s. At 1.5 s the Südtribüne is up and yellow, and the ripple runs continuously through both corners to the North by 3.66 s |
| No z-fighting, cracks or see-through gaps | None found in the 2× frames or the zooms at 2.0, 2.5, 3.0 and 12 s. The columns are solid from the plinth, and unrevealed instances are culled |
| Façade, roof and pylons overlap with no dead time | Façade 3.4–4.6 s (over the last tiers), roof 4.6–5.8 s, pylons 5.6–6.5 s (over the roof landing). The scrub curve has no gap except the thin-mast measurement effect above |
| Roof opaque and sorted from 5.8 s | Opaque from 5.14 s, with depth writes on. No sorting artefacts at 5.4, 5.8, 6.2 or 12 s, or at 90.5 s |
| ≥ 6 % padding, pylon tips and lifted roof unclipped | Yes at both widths (fitted over the idle envelope, Task 4). The thicker masts are included in `EXTENT_POINTS` |
| Colours match the animatic and the explorer | Matte explorer materials with the animatic's roof value and pitch green. Yellow leads on the South terrace and pylons |
| Legible at 390 px; the copy leads | Yes (`t6-final-hero-390.png`). At 1440 the headline's tail passes over empty sky in the slot (`t6-final-hero-1440.png`) |
| Poster indistinguishable at the swap | Mean absolute difference **2.71 / 255** at 1440 and **3.34** at 390, all of it edge resampling. It is hidden inside the 200 ms cross-fade |

### Measurements (final)

| Measure | Dev (5173) | Production (`vite preview`) |
|---|---|---|
| Scrub curve (1/30 s, 0–8 s) | **0 spikes** | — |
| Real-time 100 ms samples: spikes outside the accent | **0** (302 video frames) | **0** (301 video frames) |
| Designed accent flag | 6.2 s (5.2 against a median of 1.3) | 6.1 s (5.4 against 1.3) |
| Stage build-frame interval p50 / p95 / max, while recording | 17 / 18 / 18 ms | 17 / 17 / 18 ms |
| Build frames over 25 ms, 4 runs without recording | 0 | 0 |
| First hero frame after navigation | ≈ 615 ms | ≈ 545 ms (was ≈ 180 ms; see Deviations) |
| Session-skip reload | — | poster at 17 ms, `idle` at 487 ms, no errors |

The smoothness curves are `t6-final-smoothness-{dev,prod}.png` (100 ms samples plus every decoded video frame) and `t6-final-scrub.png`. The sawtooth in the per-frame curve after 7.4 s is the 25 fps capture beating against the 30 fps idle cap.

`npm test` **15/15**, `tsc --noEmit` clean, `npm run check` PASS (79 working files). Geometry: 10 draw calls, **115,056 triangles**, 9,355 instances. The renderer chunk is **10.71 kB gzip** (Task 5: 10.49 kB), and the CSS is 6.90 kB gzip (Task 5: 6.81 kB). The `three` chunk is unchanged.

## Task 7 — Tests, performance and bundle gate

**Files:** `tests/hero.test.ts` (one new test), `tests/hero.browser.cjs` (new), `package.json` (`test:hero`, not part of `npm test`).

### Unit tests

New test: *timeline is finite over a minute, monotone where designed, and its phases end exactly on 0 and 1*.

- A 1 ms sweep of `t ∈ [0, 60]` finds every `buildState` field finite.
- Pitch, markings, façade, roof opacity, parallax and underline never decrease. The roof never rises during the build. The ring only expands while it is shown. The idle lift stays within .10–.26 × wall. Per-instance tier and pylon progress is monotone for a grid of `u` and `rho` values.
- Every phase starts on exactly 0 and ends on exactly 1: pitch, markings, façade, roof opacity, parallax and underline, and they stay at 1. Pulse, ring and streaks return to exactly 0, and the ring ends at its full radius.
- Every scalar agrees on either side of 6.5 s (to 1 µs).

Together with the Task 3–4 tests (a 1 ms continuity sweep, the beats, zero velocity at 6.5 s, and no idle loop within 60 s), `npm test` is **16/16**.

### Browser suite (`npm run test:hero`)

Chrome through Playwright, one fresh context per scenario. It needs a running app at `TEST_URL` (default `http://127.0.0.1:4173`). The performance and bundle section runs only when `TEST_URL` serves this checkout's `dist/`, so budgets are never taken from the dev server. `HERO_BASELINE_URL` / `HERO_BASELINE_DIST` point it at a pre-hero build for the deltas, and `HERO_PERF=0` skips the section. The report goes to `.cache/qa/hero.json`.

| Check | Result (production, `vite preview`) |
|---|---|
| Canvas inside `.hero-art`, `aria-hidden`, not under `.scene-host` / `.scene-frame`; exactly one | Pass |
| Fresh context: `placeholder → build → settled → idle` | Settled at **7.07 s** after navigation (budget 9 s) |
| `?hero-t=0 / 3 / 7` differ; two loads at the same time match | Mean RGB difference 16.3 / 16.1 / 27.1; repeat load **0.000**; a frozen page draws once and has no controls |
| Session-skip | The reload is `idle` at **≈ 0.52–0.55 s**, never enters `build`, and the underline is present. A new context builds again |
| Pause during the build | `data-hero-t` jumps to 90.500, `data-hero-frame` stops, `aria-pressed="true"`, "Play animation". A paused reload stays `paused` |
| Play, pause in idle, replay | Play resumes idle. An idle pause holds its pose (t ≈ 91). Replay returns to `build` at t < 1.5 s and clears the paused flag |
| Offscreen | Scrolling the explorer into view stops the frame counter; scrolling back resumes it |
| Reduced motion | `static`, poster at opacity 1, no hero canvas, no `data-hero-frame`, renderer chunk never requested, controls hidden, underline full width |
| `WEBGL_lose_context` | `static` / `poster`, stage disposed, controls removed, no page errors |
| `hardwareConcurrency = 2` | Poster; renderer chunk never requested |
| Blocked `sessionStorage` (getter throws) | Builds on reload; pause and play work; no exceptions |
| axe (WCAG 2 A/AA, 2.1 A/AA, 2.2 AA) on `.intro` | 0 violations at 1440 and 390, both building and paused |
| Targets, names, focus | Both buttons ≥ 44 × 44 at both widths, named "Pause animation" / "Replay". Tab from the copy lands on Pause with `:focus-visible` and a solid 3 px outline. Enter toggles it, and focus stays on "Play animation". Nothing else in the art is focusable |
| Horizontal overflow at 390 / 768 / 1440 | None |
| CLS during load | **0.0025** (the pre-existing header font swap) |
| Art inert to clicks | Four clicks across the art: no navigation, scroll, toggle, dialog or focus change, and the build continues |
| Explorer unaffected | 197 draw calls / 644,094 triangles, identical to a page whose hero renderer request is aborted |

The suite also passes against the dev server, under StrictMode (the performance section skips itself there).

### Regression

| Command | Result |
|---|---|
| `npm run check` | PASS (80 working files) |
| `npm test` | PASS 16/16 |
| `npm run build` | PASS (`tsc --noEmit` clean) |
| `npm run test:release` (production) | PASS, including axe on the updated credits page |
| `npm run test:browser` (dev) | **FAIL, pre-existing, unchanged:** `tests/browser.cjs:47` waits for "Lower view". Its first check (hover, picking, drag, reset, roof) passes |
| `npm run test:discovery` (dev) | **FAIL, pre-existing, unchanged:** `tests/discovery.browser.cjs:29` expects three `.representative-views` buttons |
| `npm run test:quality` (dev) | **FAIL, pre-existing, unchanged:** `tests/quality.browser.cjs:69` waits for "Middle view". Its explorer overview thresholds (`drawCalls < 200`, `triangles < 650000`), atmosphere pause and offscreen checks run before that line and pass |

The three explorer suites fail at exactly the lines recorded in the Task 0 baseline. Commit `a5a852f` removed the representative-view buttons they use. The hero does not change the explorer's draw calls, triangles or timing (see "Explorer unaffected" above). Making those suites green means rewriting explorer tests against the committed explorer UI. That is outside the hero scope, so it was not done here.

### Performance (production build, Chrome, CDP 4× CPU throttling)

Frame intervals are every display frame's `requestAnimationFrame` timestamp between `build` and `settled`, so they include the explorer's own rendering below the hero.

| Measure | Run 1 (60 Hz display clock) | Run 2 (battery, 30 Hz clock) |
|---|---|---|
| Build, 1440: frames, p50 / p95 / max | 389; 16.7 / **16.8** / 16.8 ms | 195; 33.3 / 33.4 / 33.5 ms |
| Build, 390 mobile emulation (DSF 3, touch): frames, p50 / p95 / max | 388; 16.7 / **16.7** / 16.8 ms | 195; 33.3 / 33.4 / 33.4 ms |
| Build wall time | 6.49 s | 6.51 s |
| Idle frame rate | 30.0 fps | 30.0 fps |
| Idle main-thread work per hero frame (idle minus paused, same page) | 1.53 ms | 0.99 ms |
| Page main-thread work per second, idle / hero paused | 190 / 144 ms | 107 / 78 ms |

A third run, after the dropped-frame and cadence reporting was added, repeated run 2: a 33.3 ms clock, **0 dropped frames** at both widths, 30 fps idle, 0.94 ms per hero frame, 21/21 checks. During runs 2 and 3 the Mac was on battery at 20 %, and Chrome clocked even an empty page at 33.3 ms. Both runs dropped no frames, and every build interval was one display period. The suite now records the empty-page cadence (`display clock`) and a dropped-frame count, so a throttled clock is visible in the report. Run 1 is the budget evidence. At a 30 Hz clock the 1440 budget (p95 < 34 ms) still passes, but with no headroom for a single dropped frame.

### LCP (1440, 5 fresh loads each, median; three runs)

The baseline is `HEAD` (`a5a852f`, before any hero work), built with `git archive HEAD` in a scratch directory and served by `vite preview` on port 4174.

| CPU | Current | Pre-hero baseline | Delta | LCP element |
|---|---|---|---|---|
| 1× | 84–88 ms | 76–80 ms | **+4 to +12 ms** | h1 (`#page-title`) in every run |
| 4× | 220–240 ms | 196–208 ms | **+24 to +32 ms** | h1 in every run |

### Bundle

Pre-hero baseline (`HEAD`), then the current build:

```
dist/assets/index-D9PW47NA.css            25.18 kB │ gzip:   6.05 kB
dist/assets/StadiumExplorer-C_TZhJON.js   20.33 kB │ gzip:   7.26 kB
dist/assets/index-BizW5QE_.js            225.03 kB │ gzip:  70.58 kB
dist/assets/engine-CYSQZEF0.js           593.69 kB │ gzip: 150.14 kB

dist/assets/index-BROl9Ht6.css            28.63 kB │ gzip:   6.90 kB
dist/assets/layout-Duoqcp0c.js             0.96 kB │ gzip:   0.45 kB
dist/assets/StadiumExplorer-ChXkMY_p.js   19.65 kB │ gzip:   7.04 kB
dist/assets/renderer-DToiszQZ.js          26.52 kB │ gzip:  10.71 kB
dist/assets/engine-BoBuuKtO.js            49.37 kB │ gzip:  15.05 kB
dist/assets/index-BhTTYhlZ.js            232.96 kB │ gzip:  73.75 kB
dist/assets/three.module-Berx7pOE.js     573.03 kB │ gzip: 144.53 kB
```

- The hero renderer chunk, with its geometry and shaders, is **10.7 kB gzip**.
- The whole JS + CSS payload grew by **24.1 kB gzip** (the test's level-9 gzip). This is conservative. It includes the placeholder, controls and session logic in the main chunk (+3.2 kB), the CSS (+0.85 kB), the per-chunk overhead of splitting `three` out of `engine`, and the three.js classes that only the hero uses. Both figures are within the 40 kB gate.
- `three` is one chunk (`three.module`, 573.0 kB), fetched once and shared by both renderers. The > 500 kB advisory is otherwise unchanged. It now names `three.module` instead of `engine` because Rolldown split the shared dependency out (Task 3), and the combined `engine + three.module` is 622.4 kB against the old 593.7 kB `engine`.

## Task 8 — Provenance, credits, docs and release

- **Provenance:** a new `tests/hero.browser.cjs` entry (`origin: original`, `UNLICENSED`, `TASK-BRIEF` + `DESIGN-BRIEF`; it doesn't import three). New `sha256` for `public/credits.html`. Dated notes added to the entries for this completion record, `README.md`, `docs/portfolio-release.md`, `docs/ui-components.md`, `scripts/package_release.py` and `package.json`. The Task 2–6 files and the poster already had entries (the poster with `sha256`, the three.js importers with `THREE-UPSTREAM`). The entries stay sorted by path, in the file's existing two-space format. `npm run check` passes with 80 working files.
- **Credits:** one sentence in "Original work & asset credits" says the animated stadium and its poster are original and derived from the project's own illustrative model. `THIRD_PARTY_NOTICES.txt` is unchanged, because no runtime dependency changed. The page stays axe-clean (`test:release`).
- **Packaging:** `media/hero-stadium-poster.webp` is added to the `scripts/package_release.py` allowlist, which also checks its inventory `sha256`.
- **Docs:**
  - `README.md` gets a "Hero animation" section covering behaviour, session-skip, controls, fallbacks, `?hero-t`, `test:hero` and poster regeneration, plus a link to this record.
  - `docs/portfolio-release.md` gets a "Hero animation" section, `test:hero` among the production checks, and `image/webp` plus a hero check in the deployment handoff.
  - `docs/ui-components.md` gets "Hero animation controls".
- **Release:** `npm run release` → **PASS**: the audit, 16/16 tests and the build pass, and 20 reviewed site files are packaged at `.cache/portfolio-release/`, including `media/hero-stadium-poster.webp` (105,004 bytes).

Not committed or pushed.

## Deviations from the task list

- The ligature fix was also applied to `public/credits.html`, which has its own font stack and showed the same bug.
- Component file name `HeroArt.tsx`, as explained under the handoff notes.
- `heroStadium.ts` also imports `src/hero/framing.ts`, a three.js-free hero module, so the placeholder and the geometry share one source of truth for the plinth, pylons and bowl outline.
- Hero-specific geometry differs from `model.ts` in three places: a closed rounded bowl wall, a roof opening at 25 m instead of 8 m, and solid tier columns. Pylon stays are re-anchored onto the rounded roof. `model.ts` itself is unchanged.
- The hero glow now lives on `.hero-art::before`, not in `.intro`'s background, so it follows the art slot at every breakpoint.
- Task 3: markings fade in over 0.57–0.85 s, and the roof opacity uses smoothstep. The animatic pops markings in and ramps the roof linearly, which conflicts with "no pops".
- Task 3: pylons rise over 0.55 s each, not the animatic's 0.7 s, so the ≤ 0.15 s stagger still lands every mast by 6.5 s.
- Task 3: the accent ring follows the rounded façade outline, not the animatic's ellipse, and is clipped to the plinth top ("on the plinth surface").
- Task 3: the roof settles 0.10 × wall above rest (the idle lift's trough), so the settled pose and the start of Task 4's idle are the same frame.
- Task 3: lighting (hemisphere 1.3, sun 2.6), a yellow self-light term, and South terrace risers `#b0931c` instead of `#96862c`. See Visual tuning.
- Task 4: the camera orbits the stadium's vertical axis with a fixed, off-centre frustum fitted over the whole idle envelope (±7.5° azimuth, ±1.5° elevation), instead of a per-pose refit. So sway and parallax never zoom, at a cost of 0.4 % (3:2) / 2.3 % (8:5) in stadium size.
- Task 4: the idle frame cap starts at 7.4 s (when the accents end), not 6.5 s, so the 60 → 30 fps change never coincides with the handoff.
- Task 4: `--hero-pulse` moved from `.hero-art` to `.intro`, alongside the new `--hero-underline`.
- Task 5: `.hero-art` is no longer `aria-hidden` (Task 1), because it now holds the focusable controls, and axe's `aria-hidden-focus` forbids that. The placeholder SVG, poster, canvas and snapshot are each `aria-hidden` instead.
- Task 5: the poster pose is `?hero-t=90.5` (`STATIC_T`), not "`?hero-t=7` with a mid roof-lift". 90.5 s is the point on the idle curve with mid lift and zero sway, so the poster, reduced motion, pause and session-skip share one pose, and idle continues from it seamlessly. `?hero-dpr=` (frozen only) and the `hero-capture` event exist only for the poster script.
- Task 5: reduced motion at load shows the poster and never loads WebGL (the task allows "or show the poster"). If motion is re-enabled, the stage mounts and idles from the still pose rather than building.
- Task 5: the pause toggle's visible label changes and `aria-pressed` is set, as specified. ARIA practice normally keeps a toggle's name fixed when it uses `aria-pressed`. Worth a screen-reader check in Task 7/8.
- Task 5: below 960 px the controls are icon-only (with accessible names), so they don't cover the stadium.
- Task 3: `heroStadium.ts` metadata fixes. Upper-tier vomitory fills and the lip and glazed band take the `rho` of their tier's front row (they were 0, which raised them as early black pillars). The pitch surround takes the `u` of its South edge, so it lays down with the first stripe. `buildHeroStadium()` also returns `uAt(z)`. Instance counts are unchanged.
- Task 6: the tier wave is measured from the Südtribüne's front row: `u' = max(0, u − .2)/.8`. The task list's formula (and the animatic's `tierH()`) normalises `u` over the whole bowl, so the first tier rose at 0.85 s, not the 0.55 s in the choreography table and the "first tiers rising by about 0.6 s" principle. The end of the wave (3.66 s) is unchanged.
- Task 6: pylons run 5.6–6.5 s (0.75 s each, staggered North → South), not 5.8–6.5 s South → North. The specified start left a dead beat after the roof landing.
- Task 6: roof opacity is smoothstep over the first 45 % of the roof's *time* (≈ 70 % of its travel), not 55 % of its travel.
- Task 6: pylon masts are 2.4 m across (radius 1.2), not `model.ts`'s 1.7 m, to match the animatic's column weight. The stays are 0.4 m. The crowd uses cream, dark and yellow at density 0.3, not the animatic's white-led mix. The ring peaks at 0.6 opacity. The pitch inputs are darker, so they render at the animatic's green.
- Task 6: the hero stage mounts after the explorer's first frame (capped at 1.2 s). This keeps the explorer's start-up off the build, but the first hero frame moves from ≈ 0.18 s to ≈ 0.55 s after navigation (production), behind the identical plinth placeholder. The build clock starts on that frame, so no beat is lost.
- Task 6: where `plus-lighter` is supported, the glow pulse is an additive overlay with animated opacity instead of `filter: brightness()`. It is visually equivalent (≤ 2 / 255) and compositor-only. Other engines keep the filter.

- Task 7: the regression step asks for `test:browser`, `test:discovery` and `test:quality` to be green. They still fail at their pre-existing Task 0 points, which come from commit `a5a852f`'s removal of the representative-view buttons, not from the hero. Fixing them means rewriting explorer tests, which is outside this task list's scope. The hero's effect on the explorer is checked directly instead: `test:hero` shows identical draw calls and triangles with and without the hero.
- Task 7: the bundle gate is reported two ways. The renderer chunk is 10.7 kB. The total JS + CSS growth over the pre-hero build is 24.1 kB, which conservatively includes three.js classes used only by the hero and the cost of the `three` split. The engine baseline is 593.69 kB, not the task list's 587.9 kB (Task 0).
- Task 7: the LCP baseline was measured live against the pre-hero `HEAD` build, under the same conditions, rather than taken from the Task 1 figure. Build frame intervals are the page's display frames (rAF), which include the explorer's rendering, not only the stage's own draws.
- Task 7: `test:hero` runs its performance and bundle section only when `TEST_URL` serves this checkout's `dist/`. It records the browser's empty-page frame clock, because on battery Chrome clocks rAF at 30 Hz.

## Not yet verified

- Safari/WebKit and Firefox rendering of the placeholder, layout and hero. Only Chrome was used. The `plus-lighter` glow path and its `filter` fallback have not been compared outside Chrome.
- Physical devices. All measurements used Playwright's Chrome on one Apple-silicon Mac, with CDP CPU throttling and device emulation. That is not a mid-tier phone or laptop GPU. CPU throttling slows JavaScript, not the GPU.
- Manual screen readers. In particular, how the pause toggle's changing label plus `aria-pressed` is announced (see the Task 5 deviation).
- The explorer browser suites past their pre-existing failure points.
- Scrolling away still leaves the phase unchanged (`build` / `idle`). `paused` is reserved for the user's pause, and the frozen frame counter shows the suspension.
- The quality guard was exercised with artificially slowed frames only. It never triggered in any throttled run, because p95 stayed at one display period. It is untested on real low-end hardware.
- Task 6 judged motion from Playwright's Chrome, both headless and in its video capture. The capture adds duplicate-frame jitter, so the deterministic scrub curve and the stage's own frame log are the primary evidence. No physical device or display has been filmed.
- The glow pulse uses `mix-blend-mode: plus-lighter` only under `@supports`. Engines without it (before Safari 15.4 / Firefox 99) keep the original `filter: brightness()` pulse. Only Chrome's path was exercised.
