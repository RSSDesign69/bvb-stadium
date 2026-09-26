# Task 10 — portfolio release preparation

Prepared 2026-09-26. Scope: a reviewable local static portfolio release, not a public deployment. No hosting destination or Git remote is configured.

- Added a linked, accessible credits/demo page with an independence disclaimer, illustrative-data limits, original asset credits, runtime license notices and a text alternative for the silent walkthrough.
- Recorded the working production UI: roof toggle, seated and standing previews, camera turn/return and a local demo selection. No reference footage or audio used.
- Added a repeatable recording script, Node version pin, reproducible release command, distribution allowlist and SHA-256 manifest. The package excludes external reference files and source workspace contents.
- Added portfolio copy and root-path deployment instructions, plus a separate proposal covering surveyed geometry, sightline evidence, authorized event inventory, holds, checkout and operational acceptance.
- Preserved existing staged and unstaged work. No commits, pushes or public deployment performed.

Validation: clean-room audit passes; all 9 model/data tests pass (150 flight paths and 225 synthetic sightline rays); TypeScript and production build pass; 8 allowlisted site files packaged. Chrome production checks pass for disclosures, credits, runtime notices, video playback, return navigation and 390/768/1440 px layouts. The credits page has zero axe WCAG 2 A/AA and 2.1 AA rule violations. Demo-discovery regression checks pass. The discovery test now waits for the React selection update after the engine reports overview, correcting a timing race in its immediate count assertion. The silent WebM is 35.92 seconds, 1440 × 1050, approximately 6.3 MiB; representative frames were visually inspected. The existing 587.90 kB engine chunk advisory remains. Prior Task 9 evidence remains scoped to its documented environments. Physical devices, Safari/WebKit, manual screen readers, venue-grade geometry and live ticketing remain unverified.
