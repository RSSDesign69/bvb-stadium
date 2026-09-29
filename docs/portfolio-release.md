# Terrace Atlas portfolio release

Prepared 2026-09-26 as a local static release candidate. The source is published on GitHub (`origin`: RSSDesign69/bvb-stadium, branch `main`); no public site deployment has been performed. The deployable artifact is `.cache/portfolio-release/site/`; only that directory should be uploaded to a static host at the domain root. `handoff/` and the checksum manifest are reviewer material, not runtime files. Never publish the workspace directory: it contains excluded external reference material.

## Reproduce

Use Node 24.11.1 (recorded in `.nvmrc`), npm with the committed lockfile, Python 3.9+ and Git. From the repository root:

```sh
nvm use # optional if Node 24.11.1 is already active
npm ci
npm run release
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173. With Chrome installed and preview running, run `npm run test:release`, `npm run test:hero` and `TEST_URL=http://127.0.0.1:4173 npm run test:discovery` for production browser verification. `release` runs the clean-room audit, model/data tests, TypeScript/build and an allowlist check of the distribution. It recreates `.cache/portfolio-release/` and records SHA-256 digests for every site file. Original media and notices must match their reviewed provenance hashes. Existing staged work is not altered. The source remains private/UNLICENSED; this preparation does not grant a reuse license.

## Re-record the walkthrough

Chrome must be installed. Install Playwright's isolated video recorder once with `PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install ffmpeg`. With the production preview running, run `npm run record:demo`. This writes `public/media/terrace-atlas-demo.webm`, a silent recording of the actual app. Scene clicks target generated places projected from the app source, and a pointer indicator is the only overlay (headless video omits the system cursor). The camera flights are unmodified. Startup and interaction time depend on the host, so recordings are reproducible in behavior, not byte-identical.

Review the full recording and text alternative in `public/credits.html`; then update its SHA-256 entry in `provenance/inventory.json` and run `npm run release` again. The video uses only original app visuals and device system fonts. No external footage or audio is included. The credits page uses native playback controls with no autoplay or preload; the viewer does not download the recording unless requested.

## Hero animation

The opening section's stadium is rendered live with Three.js from `src/hero/`, a lightweight diorama derived from the project's own layout. It builds over 6.5 s on the first load of a browser session, then idles (the roof lifts and settles, the camera sways, and fine pointers add parallax). Later loads in the same session start settled, via `sessionStorage` key `terrace:hero:played:v1`. **Pause animation** / **Play animation** and **Replay** are the art's only controls. The pause choice persists for the session (`terrace:hero:paused:v1`). The renderer chunk loads after first paint and shares the explorer's `three` chunk.

`public/media/hero-stadium-poster.webp` (1200 × 800, WebP with alpha) is a still of the settled pose. It is used only for session-skip, reduced motion, Save-Data, low-end devices, missing WebGL, a lost WebGL context and the frame-rate guard. `?hero-t=<seconds>` freezes the animation and draws a single frame, for tests and review.

To regenerate the poster after changing the hero's geometry, palette or lighting, start the dev server, then run `TEST_URL=http://127.0.0.1:5173 node scripts/render-hero-poster.cjs`. Update the poster's SHA-256 in `provenance/inventory.json` and run `npm run release` again. `npm run test:hero` checks behaviour and fallbacks. Against this production preview it also checks the CPU-throttled frame, LCP and bundle budgets. Set `HERO_BASELINE_URL` / `HERO_BASELINE_DIST` to a pre-hero build to measure the deltas. `node scripts/hero-filmstrip.cjs` writes review contact sheets to `.cache/hero/`. Evidence is in `hero-animation-completion.md`.

## Portfolio copy

“Terrace Atlas is an independent, interactive stadium concept inspired by Signal Iduna Park. Explore four distinct stands, choose representative or exact generated places, preview illustrative viewpoints and save one viewpoint locally. Built with TypeScript, React and Three.js using original procedural geometry and match-day visuals. Places, views, prices and availability are illustrative. No tickets are sold.”

Do not describe this as an official viewer, exact seat preview, live inventory system or ticket purchase experience. The app, credits page, video and README retain the independent-concept framing. A generated place count is a software dataset count, not stadium capacity. Automated synthetic sightline tests do not validate real-world views.

## Credits and release evidence

`public/credits.html` supplies the short demo, text alternative, independence statement, asset origin summary, limits and a link to complete runtime MIT notices. `provenance/inputs.json` records source references; reference media stays external-only. `provenance/inventory.json` records original files and shipped media. `provenance/dependencies.json` records the dependency supply chain. No reference ZIP, photo, proprietary font, official crest, sponsor art or external video is bundled.

See `task-10-completion.md` for current verification and `tasks-8-9-completion.md` for prior browser/quality evidence. Safari/WebKit, physical-device performance, manual screen readers and surveyed sightlines remain unverified. See `venue-grade-proposal.md` for the separate surveyed-model and authorized-commerce scope.

## Deployment handoff

Serve `site/` as static files over HTTPS at the domain root. No backend, environment secrets, accounts or analytics are required. Preserve `THIRD_PARTY_NOTICES.txt`, `credits.html` and `media/`; configure WebM as `video/webm` and WebP as `image/webp` (the hero poster). Serve index/credits with revalidation and hashed JS/CSS with long-lived caching. If deploying under a subpath, first configure Vite's base and repeat link/asset checks at that path; the present artifact targets `/`.

After upload, verify the visible disclosure, credits/notices/video links, WebGL rendering (the hero build and the explorer), one seated and one standing preview, return controls and the saved viewpoint on the public URL. Check that only the allowlisted site files are exposed. Keep the previous artifact for rollback. Publication status must only be updated after an actual deployment and public smoke check.
