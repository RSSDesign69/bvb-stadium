# Task 1 completion record

Date: 2026-09-24. Product: Terrace Atlas. Repository: `terrace-atlas/`, independently initialized on `codex/task-1-foundation`; no remote or publication.

| Acceptance criterion | Evidence |
| --- | --- |
| New repository and original product name | Independent Git root, package identity, and README |
| Behavior specification from visible observations and public venue information | `behavior-spec.md` plus `reference-observations.md`: sampled video timestamps, screenshot findings, public source links, original acceptance requirements, and explicit unverified items |
| Provenance for dependencies, textures, images, models, and datasets | Three JSON registers enumerate input hashes/licenses, every project file, zero installed application dependencies, zero production assets, and proposed dependency sources |
| Reference ZIP and extracted contents excluded | No ZIP opened/imported; archive/source-directory ignore rules, provenance allowlist, staged-file checks, history checks, and enabled local pre-commit hook |

## Verification

- All seven external imagery files match the supplied manifest's SHA-256 values.
- Video and screenshot hashed; both remain outside the repository. Review frames/contact sheets are temporary and external.
- All local Markdown links resolve; all JSON registers parse.
- Audit passes for the original project files, then is rerun after staging and the initial commit.
- Disposable-repository checks passed: clean baseline, missing-provenance rejection, disguised archive rejection by content, renamed reference-video rejection by hash, force-added ignored-source rejection in the index, and prohibited source detection after deletion from current history tip.
- Ignore rules verified for archives, extracted sources, reference directories, and supplied video naming.

No browser tests, 3D benchmarks, screenshot parity, or actual venue sightline validation are claimed. Those require later implementation tasks. The audit cannot establish absence of semantically copied material or unknown modified reference files; the independent authoring record and review boundary remain essential.

Task 2 can proceed with the shell. Fidelity A and demo-only commerce are recorded defaults from the task brief; no measured seat-level data or verified sample viewpoints are currently available.
