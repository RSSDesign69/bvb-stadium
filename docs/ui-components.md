# UI component reference

This document records the visual and interaction contract for reusable interface controls in Terrace Atlas. Component changes should preserve the square-edged, high-contrast visual language and remain usable with keyboard, touch, and assistive technology.

## Buttons

### Standard control proportions

- Standard text controls use a minimum height of `44px` and padding of `9px 14px`.
- This proportion is established by the **Pause atmosphere** control and is shared by the top-navigation **About this concept** button and the dialog **Back to the ground** action.
- Icon-only controls, including the dialog close button, keep a minimum `44px × 44px` target and use the same `9px 14px` padding where the icon geometry permits.
- Text-and-icon controls use a compact `14px` gap. Their label-and-icon group is centered, including inside full-width actions.

### Typography

- Text labels in the photographed navigation and dialog button set use Area Inktrap at `14px` and `700` weight: **About this concept** and **Back to the ground**.
- The dialog close mark remains a `28px` icon rather than text, while its control retains the shared `700` weight declaration and standard target size.
- Button labels use sentence case. Avoid uppercase transformation and excessive tracking.
- Arrow marks are decorative and must remain hidden from assistive technology; the button's text supplies its accessible name.

### States and behavior

- Keyboard focus uses the global high-contrast `3px` white outline with a `3px` offset.
- Yellow primary actions retain black text and the existing darker-yellow hover state.
- Disabled controls remain visibly subdued and must not respond to pointer input.
- Dialog buttons participate in the existing focus trap; Escape closes the dialog and restores focus to **About this concept**.

## Dialog heading hierarchy

The About dialog begins directly with **An independent concept.** The former **About the project** eyebrow is intentionally omitted so the dialog title occupies the first content position. The close button remains at the top right and the heading reserves sufficient inline space to avoid overlap.
