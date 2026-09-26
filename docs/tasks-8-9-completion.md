# Tasks 8–9 — match-day atmosphere and concept quality

Implementation and verification: 2026-09-25. Scope is fidelity A, an independent architectural concept with generated places. This record does not certify real seat views, restricted-view categories, ticket inventory, or physical-device performance. Existing staged work was preserved; nothing was published.

## Task 8 implementation

`src/atmosphere/matchday.ts` creates anonymous geometric spectators, two fictional teams of eleven players, a moving ball, two scoreboards, boundary displays, and broad fill lighting. Everything is generated from original code. The score starts at a fictional 0–0 at 46:00 and advances only while animation runs. It is not a live match. Kits are plain aqua/coral, with no player identities, sponsor art, club crest, audio, footage, image downloads, or third-party model assets.

The desktop scene has 4,392 decorative figures; compact mobile has 1,420. These counts are rendering choices, not attendance or availability. Repeated crowd geometry uses eight instanced draws; only four crowd cohort transforms move. Player matrices update in the engine, without React state updates on each animation frame. Texture text refreshes once per simulated second. There are no shadow maps, flashing lights, or postprocessing effects.

Match-day atmosphere can be switched off or paused. Reduced-motion preferences stop atmosphere movement as well as skipping camera flights. Animation suspends when the canvas is offscreen or the document is hidden. When paused/off, rendering is demand-driven. The canvas pixel ratio remains capped, with fewer figures and simplified seats on mobile.

Clear-view preview is on by default: it removes decorative spectators and pitch activity during the camera flight and preview. The caption explicitly identifies when crowd is hidden or simulated. Roofs, terraces, rails, barriers, and other stadium structures remain present; clear view is not a promise of an unobstructed real view. Controls live outside the canvas and remain available in all atmosphere states.

## Task 9 evidence

The accompanying automated suites cover:

- Model/data invariants, distinct low/middle/high viewpoints, 150 representative flight paths, and 225 rays from generated samples toward the centre and goals with roof structure present. These are synthetic geometry checks, not venue survey validation.
- Pointer hover/picking, orbit dragging without accidental selection, bounded look/zoom, reset, roof controls, all twelve stand/height previews, synchronized orientation arrows, Escape/return and focus restoration, interrupted flights, and reselection.
- Demo stand/tier/category/quantity/price filters, standing-area semantics, unavailable alternatives, local selection totals, filter-induced selection reset, and recoverable empty results.
- Atmosphere pause/resume/off, live reduced-motion changes, offscreen suspension, all four stands with both clear and decorative-crowd previews, and compact crowd budgets.
- Keyboard focus, labeled native controls, modal focus confinement and inert background, contrast/semantics scans with axe, 200% text enlargement, responsive widths, touch buttons, and emulated touch drag/pinch.
- Loading announcements, lazy-engine failure/retry, WebGL unavailability, context loss, and continued access to the place explorer without 3D. Errors have a live alert. Failed module downloads require a page reload because browsers can cache rejected dynamic imports; Retry performs that reload.

Final run results:

| Check | Result |
| --- | --- |
| TypeScript / production build | Pass. Lazy Three.js engine: 587.90 kB raw / 147.84 kB gzip. Vite retains its >500 kB chunk advisory. |
| Model and demo-data tests | 9 suites pass, including 150 flight paths and 225 sample pitch rays. |
| Chrome 153.0.8010.53 | Navigation, discovery, fallback, atmosphere, accessibility, and emulated-mobile checks pass. |
| Firefox 155.0 | Atmosphere controls, offscreen pause, reduced motion, and clear/crowd previews for all four stands pass. |
| axe 4.13.0 / WCAG 2 A, AA and 2.1 AA rule tags | Zero violations in seven tested states: desktop overview, standing crowd preview, modal, empty results, mobile overview, engine loading, engine load error. Not an accessibility certification. |
| Desktop atmosphere overview, 1440 × 1050 | 191 draw calls / 613,684 triangles; within the existing <200 / <650,000 budget. |
| Mobile atmosphere overview, 390 × 844, DPR 2 capped to 1.4 | 153 draw calls / 322,596 triangles; <160 / <350,000 budget. |
| Chrome mobile emulation, 4× CPU slowdown, host GPU unchanged | 132 sampled frame intervals over ~2.2 seconds: median 16.7 ms, p95 16.8 ms. A short local sample, not a sustained or real-device benchmark. |
| Enlarged text / layout | 200% computed text sizes at 640 px and normal layouts at 390/768/1024/1280 px checked; no horizontal document overflow. |
| Clean-room audit | Pass: 43 working files, 22 unchanged index entries, 1 commit / 14 historical blobs; 13 external-media hashes excluded. |
| WebKit / Safari | Not passed: frozen macOS 14 WebKit rejected `PushAPIEnabled` during test page creation. No application result inferred from this tooling failure. |

The final display review corrected mirrored lettering by giving pitch-facing boundary screens plain backs. Modal background controls are inert while open, scene controls have explicit group semantics, loading/errors announce status, and canvas captions have a solid dark backing for contrast. Local screenshots and machine-readable results are generated in ignored `.cache/qa/`; none are production assets.

## Restricted views and visual review

The four-stand/roof review and architectural photo comparisons from [Tasks 3–6](tasks-3-6-completion.md) remain applicable. Task 9 checks original rendered overview/full-roof images, twelve seated/standing sample views, and a South terrace view with decorative foreground spectators. The new crowd can visibly obstruct a simulated view; its placement is not a calibrated occupancy model. The clear-view switch helps inspect structural geometry without silently claiming the real venue would be empty.

All generated places retain “Sightline: not verified” and identify possible roof-support, rail, barrier, and terrace-step occlusions. There is no “unrestricted” badge, numeric visibility score, or invented venue restricted-view inventory. Position-known photos/panoramas and measured venue geometry are still required to validate real restricted views. Broad architectural comparison and synthetic rays cannot substitute for that evidence.

## Reproduce

```sh
npm ci
npm run build
npm test
npm run check
PLAYWRIGHT_BROWSERS_PATH=.cache/browsers npx playwright install firefox
npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
# In another terminal, with Google Chrome installed:
npm run test:browser
npm run test:discovery
npm run test:quality
```

The quality suite defaults to installed Chrome plus the isolated Firefox download. `QUALITY_ENGINES=webkit` can be used on a supported host with a compatible WebKit installation. The attempted macOS 14 compatibility build failed to create a page with `Page.overrideSetting: Unknown setting: PushAPIEnabled`; it is not recorded as a pass. `QUALITY_ENGINES=chrome` restricts it to Chrome; `TEST_URL` changes the dev-server URL. The browser tests use Vite development modules for projection and loading-failure injection. `npm run build` verifies the separately split production bundles.

## Limits and release follow-up

Automated accessibility checks and browser focus tests are not a VoiceOver/NVDA listening session or a WCAG conformance certification. CPU slowdown and mobile viewport/touch emulation do not simulate mobile GPU bandwidth, thermal throttling, battery drain, or a real iPhone/Android browser. A short sampled timing run is not a sustained performance benchmark. The macOS 14 WebKit build supplied by Playwright is frozen and was incompatible with this Playwright protocol (see above), so no Safari/WebKit result is claimed. Physical-device, current Safari, manual screen-reader, and measured venue-view validation remain explicit follow-up work before making those release claims. Task 10 publication/release work was not requested.
