# Provenance register

`inputs.json` identifies research inputs, source URLs/paths, review status, hashes for local files, permitted project use, and publication restrictions. Its image metadata comes from the curated pack; licenses have not been independently re-cleared for distribution. No reference media is bundled.

`inventory.json` enumerates every authored repository file and its provenance. Original files use the project restriction `UNLICENSED`; this does not assign a third-party license or grant redistribution rights. No broad open-source license has been selected by the owner.

`dependencies.json` records the direct and transitive packages resolved for the React/Vite/Three.js viewer and its test tooling. Beyond the user-supplied demo fonts and crest recorded in `inventory.json`, the only external images the app ships are the reviewed CC0 explorer textures and sky in `public/assets/explorer/`. Each shipped file has its own inventory entry, which traces to a `cc0-asset` record in `inputs.json`; see "CC0 production assets" in `docs/clean-room.md`. The app ships no external models, audio, or place datasets. Tooling used only to inspect external media is not an application dependency.

For future third-party assets, add a file inventory entry with `origin: third-party`, source IDs, author, exact license, SHA-256, attribution text, modification disclosure, and allowed distribution. For generated geometry/data, record the original generator and source assumptions; label output illustrative. For dependencies, capture all lockfile-resolved packages, not just top-level names.

The manifests are review records, not proof of rights. Unknown permission means do not bundle the asset. Keep research facts, user-visible observations, and original design choices distinguishable.

The app generates its own geometry and demo data. External research files now reside in ignored paths within the reorganized workspace; they remain untracked and excluded from the production bundle. Task 1 paths/hashes are retained as historical metadata where applicable.
