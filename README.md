# BVB 3D Stadium

An independent stadium exploration concept, beginning with Signal Iduna Park in Dortmund. Explore the architecture, compare illustrative places, and preview the pitch from a generated viewpoint.

**Tasks 1–10 implemented; portfolio release prepared locally at concept fidelity:** original four-stand 3D model, 19,304 generated seats, 60 unassigned standing-area samples, navigation, first-person previews, a four-stage stand → place → review → preview flow, an Advanced exact-place mode, one locally saved viewpoint, and optional original match-day atmosphere. Every place, price, availability state, and sightline is illustrative.

## Run the viewer

Requires Node.js 24.11.1 (see `.nvmrc`).

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` for a production build, `npm test` for model and demo-data checks, and `npm run check` for the clean-room audit. With the dev server running and Chrome installed, `npm run test:browser` and `npm run test:discovery` check interaction flows. Install the isolated Firefox test engine with `PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install firefox`, then run `npm run test:quality` for Chrome/Firefox atmosphere, accessibility, and mobile-emulation checks. Browser screenshots are written to `.cache/qa/`.

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

## Verify the foundation

Requires Git and Python 3.9+; no package installation or network access is needed.

```sh
python3 scripts/audit_clean_room.py
git config --local core.hooksPath .githooks
```

The hook runs the same audit before each commit. It checks working files, the Git index, historical paths, and reachable historical blobs. See the protocol for its limits. `npm run check` is an optional alias if Node/npm is installed.

This directory is its own Git repository inside a larger workspace. Run Git commands from here. No remote is configured; nothing has been published.

## Required product disclosure

“Independent stadium concept. Places, views, prices, and availability are illustrative. No tickets are sold.”

Choose a stand, then one of three representative views, review the place, and choose **Preview this view**; then **Save viewpoint** to keep it for this visit. Open **Choose an exact place** for the stand, tier, category, people, and optional fictional demo-price filters, results, and block/row/seat controls. The saved viewpoint lives only in the page, is not persisted, and reserves nothing. Drag to orbit or look, use the labeled zoom/direction buttons, and press Escape to return. Roof cutaway applies only in overview. Reduced motion skips flights and stops match-day animation. Atmosphere can be paused or switched off; Clear-view preview hides decorative crowd/players while retaining physical structure. The [portfolio release guide](docs/portfolio-release.md) covers the demo video, credits, reproducible package and deployment handoff. See the separate [venue-grade and ticketing proposal](docs/venue-grade-proposal.md). No public deployment has been performed. Physical-device, manual screen-reader, Safari/WebKit, and venue-grade sightline validation are not claimed.

## Prepare the portfolio artifact

Run `npm run release` to audit, test, build and package `.cache/portfolio-release/site/` with a SHA-256 manifest. The footer links to credits and the recorded demo. See [Task 10 evidence](docs/task-10-completion.md) and the [release guide](docs/portfolio-release.md).
