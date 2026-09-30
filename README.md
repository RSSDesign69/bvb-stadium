# BVB 3D Stadium

An independent stadium exploration concept, beginning with Signal Iduna Park in Dortmund. Explore the architecture, compare illustrative places, and preview the pitch from a generated viewpoint.

**Tasks 1–10 implemented; portfolio release prepared locally at concept fidelity:** original four-stand 3D model, 19,304 generated seats, 60 unassigned standing-area samples, navigation, first-person previews, a four-stage stand → place → review → preview flow, an Advanced exact-place mode, one locally saved viewpoint, and optional original match-day atmosphere. Every place, price, availability state, and sightline is illustrative.

## Run the viewer

Requires Node.js 24.11.1 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` for a production build, `npm test` for model and demo-data checks, and `npm run check` for the clean-room audit. With the dev server running and Chrome installed, `npm run test:browser` and `npm run test:discovery` check interaction flows. Install the isolated Firefox test engine with `PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install firefox`, then run `npm run test:quality` for Chrome/Firefox atmosphere, accessibility, and mobile-emulation checks. `npm run test:hero` checks the animated hero (see below). Browser screenshots and reports are written to `.cache/qa/`.

The original product name is a working name, not a claim of trademark clearance. This project has no affiliation with Borussia Dortmund, the stadium operator, or a ticket seller.

## Project decisions

- Fidelity A: a recognizable architectural concept. Generated places and sightlines are illustrative; no measured seat data is available.
- Standalone portfolio demo with fictional prices and availability. No checkout, reservations, accounts, or ticketing integration.
- Original geometry, interface, copy, and procedural materials. No reference ZIP contents, official crest, proprietary fonts, sponsor artwork, or reference photos are bundled.
- TypeScript, React, and Three.js power the viewer. Pinned dependencies and transitive provenance are recorded; browser runtime license notices ship with the app.

## Start here

1. Read [the behavior specification](docs/behavior-spec.md) and [the observation log](docs/reference-observations.md).
2. Follow [the clean-room protocol](docs/clean-room.md) and [provenance instructions](provenance/README.md).
3. See the [Tasks 3–6 completion record](docs/tasks-3-6-completion.md) and [Task 7 completion record](docs/task-7-completion.md) for model and demo-commerce limits. See [Tasks 8–9](docs/tasks-8-9-completion.md) and the [video parity checklist](docs/behavior-parity.md) for atmosphere, QA evidence, and remaining validation limits.
4. Use the [UI component reference](docs/ui-components.md) when changing shared controls, typography, spacing, or interaction states.
5. See the [hero animation completion record](docs/hero-animation-completion.md) for the animated hero's design, budgets and evidence.

## Verify the foundation

Requires Git and Python 3.9+; no package installation or network access is needed.

```sh
python3 scripts/audit_clean_room.py
git config --local core.hooksPath .githooks
```

The hook runs the same audit before each commit. It checks working files, the Git index, historical paths, and reachable historical blobs. See the protocol for its limits. `npm run check` is an optional alias if Node/npm is installed.

This directory is its own Git repository inside a larger workspace. Run Git commands from here. The source is published at [github.com/RSSDesign69/bvb-stadium](https://github.com/RSSDesign69/bvb-stadium) (`origin`, branch `main`). This publishes the source only; the site itself has not been deployed.

## Required product disclosure

“Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold.”

Choose a stand, then one of three representative views, review the place, and choose **Preview this view**; then **Save viewpoint** to keep it for this visit. Open **Choose an exact place** for the stand, tier, category, people, and optional fictional demo-price filters, results, and block/row/seat controls. The saved viewpoint lives only in the page, is not persisted, and reserves nothing. Drag to orbit or look, use the labeled zoom/direction buttons, and press Escape to return. Roof cutaway (pulling the roof back to a ring) applies only in overview. Reduced motion skips flights and stops match-day animation. Atmosphere can be paused or switched off; Clear-view preview hides decorative crowd/players while retaining physical structure. The [portfolio release guide](docs/portfolio-release.md) covers the demo video, credits, reproducible package and deployment handoff. See the separate [venue-grade and ticketing proposal](docs/venue-grade-proposal.md). No public deployment has been performed. Physical-device, manual screen-reader, Safari/WebKit, and venue-grade sightline validation are not claimed.

## Hero animation

The opening section shows a decorative 3D stadium that builds itself in 6.5 s: the pitch, then a wave of tiers rising from the South stand, the façade, the roof and the eight pylons. A slow idle follows: the roof lifts and settles, the camera sways, and fine pointers add a little parallax. The yellow line under "from every angle." sweeps in as the pylons land. The geometry is a lightweight diorama in `src/hero/`, derived from the explorer's own layout. It never loads the place dataset.

- **Once per visit.** The full build plays on the first load in a browser session. Later loads start settled. **Replay** plays the build again.
- **Controls.** **Pause animation** / **Play animation** (with `aria-pressed`) and **Replay** sit in the art's bottom-right corner. They are its only focusable content. Pausing during the build cross-fades to the settled pose. The choice lasts for the session.
- **Fallbacks.** Reduced motion, Save-Data, low-end devices, missing WebGL, a lost context and a failed frame-rate guard all show a still poster (`public/media/hero-stadium-poster.webp`) instead of the live canvas. The loop stops while the hero is offscreen or the tab is hidden.
- **Testing.** `?hero-t=<seconds>` freezes the animation at that time and draws one frame. `.hero-art` exposes `data-hero-phase` and `data-hero-frame`. With `npm run build` and `vite preview` running on 4173, `npm run test:hero` covers behaviour, fallbacks, accessibility, layout, and the CPU-throttled performance and bundle budgets.
- **Poster.** Regenerate it after changing the hero's look with `TEST_URL=http://127.0.0.1:5173 node scripts/render-hero-poster.cjs` (dev server running), then update its SHA-256 in `provenance/inventory.json`.

## Photoreal explorer

The explorer's stadium shares the hero's silhouette (continuous rounded wall, closed corners, roof ring, eight pylons) and is lit and textured for a photoreal daylight look: CC0 material scans, one daylight sky for image-based light, a static sun shadow map, contact shading and fog to the horizon. Records: [task list](docs/explorer-fidelity-task-list.md) and [completion record](docs/explorer-fidelity-completion.md).

- **Roof cutaway** pulls the roof's inner edge back to a ring about 25 m behind the front row, over 600 ms (instant under reduced motion). Unchecked, and always in seat previews, the opening is the realistic 8 m. The roof is never hidden.
- **Quality tiers.** `high` (desktop: GTAO, SMAA, 4096² shadows, near trees, people figures near the camera) and `compact` (screens under 700 px wide: 1024² shadows, tree impostors, box figures, the phone texture set). `?quality=high|compact` overrides the choice. An adaptive guard steps `high` down if frames run slow. `.scene-host` exposes `data-quality`, `data-textures`, `data-roof-opening`, `data-draw-calls`, `data-draw-calls-total`, `data-triangles`, `data-frames` and `data-shadow-renders`.
- **Textures.** The CC0 set is processed by `node scripts/process-assets.mjs` from the approved manifest `scripts/explorer-assets.json` into KTX2 under `public/assets/explorer/` (sources stay in the git-ignored `.cache/assets-src/`; any new download needs approval first). Textures load after the first frame. Tree foliage clumps and impostors are baked on the GPU at runtime, so no baked files ship.
- **Review captures (dev server only).** `?explorer-pose=<name>` sets a named camera pose from `src/viewer/poses.ts`. `node scripts/explorer-captures.cjs <label>` renders every pose to `.cache/explorer/<label>/` with a contact sheet, a greyscale sheet and the hero pair. Options: `--compare=<label>`, `--only=a,b`, `--perf` (first frame and frame times) and `--zoom` (detail pop check).

## Prepare the portfolio artifact

Run `npm run release` to audit, test, build and package `.cache/portfolio-release/site/` with a SHA-256 manifest. The footer links to credits and the recorded demo. See [Task 10 evidence](docs/task-10-completion.md) and the [release guide](docs/portfolio-release.md).
