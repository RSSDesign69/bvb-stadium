# Terrace Atlas portfolio release

Prepared 2026-09-26 as a local static release candidate. No public deployment or Git remote is configured. The deployable artifact is `.cache/portfolio-release/site/`; only that directory should be uploaded to a static host at the domain root. `handoff/` and the checksum manifest are reviewer material, not runtime files. Never publish the workspace directory: it contains excluded external reference material.

## Reproduce

Use Node 24.11.1 (recorded in `.nvmrc`), npm with the committed lockfile, Python 3.9+ and Git. From the repository root:

```sh
nvm use # optional if Node 24.11.1 is already active
npm ci
npm run release
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

Open http://127.0.0.1:4173. With Chrome installed and preview running, run `npm run test:release` and `TEST_URL=http://127.0.0.1:4173 npm run test:discovery` for production browser verification. `release` runs the clean-room audit, model/data tests, TypeScript/build and an allowlist check of the distribution. It recreates `.cache/portfolio-release/` and records SHA-256 digests for every site file. Original media and notices must match their reviewed provenance hashes. Existing staged work is not altered. The source remains private/UNLICENSED; this preparation does not grant a reuse license.

## Re-record the walkthrough

Chrome must be installed. Install Playwright's isolated video recorder once with `PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install ffmpeg`. With the production preview running, run `npm run record:demo`. This writes `public/media/terrace-atlas-demo.webm`, a silent recording of the actual app. The camera flights are unmodified. Startup and interaction time depend on the host, so recordings are reproducible in behavior, not byte-identical.

Review the full recording and text alternative in `public/credits.html`; then update its SHA-256 entry in `provenance/inventory.json` and run `npm run release` again. The video uses only original app visuals and device system fonts. No external footage or audio is included. The credits page uses native playback controls with no autoplay or preload; the viewer does not download the recording unless requested.

## Portfolio copy

“Terrace Atlas is an independent, interactive stadium concept inspired by Signal Iduna Park. Explore four distinct stands, compare generated places, preview illustrative viewpoints and try a local demo selection. Built with TypeScript, React and Three.js using original procedural geometry and match-day visuals. Places, views, prices and availability are illustrative. No tickets are sold.”

Do not describe this as an official viewer, exact seat preview, live inventory system or ticket purchase experience. The app, credits page, video and README retain the independent-concept framing. A generated place count is a software dataset count, not stadium capacity. Automated synthetic sightline tests do not validate real-world views.

## Credits and release evidence

`public/credits.html` supplies the short demo, text alternative, independence statement, asset origin summary, limits and a link to complete runtime MIT notices. `provenance/inputs.json` records source references; reference media stays external-only. `provenance/inventory.json` records original files and shipped media. `provenance/dependencies.json` records the dependency supply chain. No reference ZIP, photo, proprietary font, official crest, sponsor art or external video is bundled.

See `task-10-completion.md` for current verification and `tasks-8-9-completion.md` for prior browser/quality evidence. Safari/WebKit, physical-device performance, manual screen readers and surveyed sightlines remain unverified. See `venue-grade-proposal.md` for the separate surveyed-model and authorized-commerce scope.

## Deployment handoff

Serve `site/` as static files over HTTPS at the domain root. No backend, environment secrets, accounts or analytics are required. Preserve `THIRD_PARTY_NOTICES.txt`, `credits.html` and `media/`; configure WebM as `video/webm`. Serve index/credits with revalidation and hashed JS/CSS with long-lived caching. If deploying under a subpath, first configure Vite's base and repeat link/asset checks at that path; the present artifact targets `/`.

After upload, verify the visible disclosure, credits/notices/video links, WebGL rendering, one seated and one standing preview, return controls and demo selection on the public URL. Check that only the allowlisted site files are exposed. Keep the previous artifact for rollback. Publication status must only be updated after an actual deployment and public smoke check.
