# Task 2 handoff

Task 1 establishes Terrace Atlas, an isolated local Git repository, independent behavior specification, reference observations, and provenance/audit workflow. The source workspace task list remains the numbered task authority. This handoff does not start Tasks 2–10.

For Task 2, build the responsive original product shell with TypeScript and React. Read the external Dortmund design brief for token observations; author components and layout independently. Start with black canvas, yellow primary action, square controls, semantic color aliases, and locally available system fonts. Do not register proprietary BVB fonts or reproduce its crest. The original product wordmark is plain text: Terrace Atlas.

Suggested structure once implementation begins:

```text
src/app/                 shell, state, error boundaries
src/ui/                  original accessible components and design tokens
src/stadium/             independently generated geometry (Task 3)
src/places/              typed demo places, separate from verified inputs (Task 4)
src/viewer/              navigation, picking, camera state (Tasks 5–6)
src/commerce/demo/       fictional pricing and availability (Task 7)
src/atmosphere/          original optional effects (Task 8)
public/                 only individually registered release assets
```

Use original lightweight placeholders for the scene and map in Task 2. Present overview controls, discovery controls, and a selected-place panel with explicit placeholder/demo states; do not imply that 3D selection already works. Check 390/768/1024/1280 px widths, focus visibility, keyboard order, readable contrast, and reduced motion.

Install only necessary dependencies, choose current compatible versions, and capture direct/transitive provenance with a lockfile. React, React DOM, TypeScript, Vite, and Three.js are proposals in the dependency register, not preinstalled or preapproved versions. Apply the relevant React guidance when implementation begins.

Keep reference videos, screenshots, photos, and ZIP contents outside this repository. Update the file inventory and run `python3 scripts/audit_clean_room.py` before commits. No deployment or ticket integration is part of Task 2.
