# LDRS Grid adaptation

The shared matrix loading animation in `src/matrix-loader.css` adapts the staggered
wave timing and jump animation from UI Ball's **LDRS Grid**, under the MIT license.
Copyright (c) 2022 Griffin Johnston. See the accompanying LICENSE.

Pinned source: https://github.com/GriffinJohnston/ldrs/tree/f759f65beb8ab4f4a1f010438072180693ca01ec
Original: `src/elements/grid.scss` and `grid.ts`, package version 1.1.9.
Reviewed 2026-11-10. Updates are manual; retain local adaptations and license.

Local changes flatten the perspective grid to 4×4 square cells, reduce motion to
35% of a cell with an opacity wave, use currentColor, size indicators at 14px
(11px in tabs), and stop animation for reduced motion. Shared CSS supports React
and plain JavaScript; only cell markup differs. No runtime package, remote fetch,
framework adapter or registration is required. The desktop markup helper is
`apps/desktop/src/matrix-loader.mjs`.

Selection: LDRS's MIT source adapter fits both renderers and permits square-cell
customization. Its stock custom element hides circular cells in a shadow root.
The existing stepped box-shadow loader was smaller in code but did not produce a
smooth wave. The dedicated zzzzshawn/matrix collection was excluded because its
custom proprietary license restricts reusable component distribution; the SVG
icantcodefyi collection had no explicit repository license at review time.
This is a narrow functional/license comparison, not a full ecosystem-health audit.
