# Terrace Atlas

An independent stadium exploration concept, beginning with Signal Iduna Park in Dortmund. Explore the architecture, compare illustrative places, and preview the pitch from a generated viewpoint.

**Task 1 complete: clean-room foundation. The browser application starts in Task 2.**

The original product name is a working name, not a claim of trademark clearance. This project has no affiliation with Borussia Dortmund, the stadium operator, or a ticket seller.

## Project decisions

- Fidelity A: a recognizable architectural concept. Generated places and sightlines are illustrative; no measured seat data is available.
- Standalone portfolio demo with fictional prices and availability. No checkout, reservations, accounts, or ticketing integration.
- Original geometry, interface, copy, and procedural materials. No reference ZIP contents, official crest, proprietary fonts, sponsor artwork, or reference photos are bundled.
- TypeScript, React, and Three.js are the intended implementation stack. No application dependencies are installed yet.

## Start here

1. Read [the behavior specification](docs/behavior-spec.md) and [the observation log](docs/reference-observations.md).
2. Follow [the clean-room protocol](docs/clean-room.md) and [provenance instructions](provenance/README.md).
3. Use [the Task 2 handoff](docs/task-2-handoff.md) for the next implementation step.

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

Task 1 includes specifications, evidence, provenance records, and repository safeguards. Tasks 2–10, including the app, modeling, accessibility verification, and release, remain open.
