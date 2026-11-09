# ADR-0010: Render-Space Third-Person Camera and Unrestricted Orbit

- Status: Accepted
- Date: 2026-11-08

## Context

The shared third-person follow camera previously constructed its boom in authoritative world coordinates and projected the resulting point. In compactified Poincare slices, a fixed world-space offset can become extremely small in render space. The same camera controller is reused after anomaly handoffs, so the apparent camera distance changed substantially when the active slice transform changed. The geometry-demo camera also had a special focus override aimed at the tesseract rather than the character model.

The movement controllers use `R` as a vertical axis in some modes and called `preventDefault()` for every `R` keydown. That intercepted browser reload shortcuts such as Ctrl+R and Cmd+R.

## Decisions

1. Express third-person camera distance in render-space units. Project the character root first, then construct the camera boom around the rendered character focus. This keeps camera framing consistent when the active world slice changes its spatial transform.
2. Derive the character focus from the projected root plus a scaled model-height offset. Do not special-case the tesseract as the follow target. Explicit corridor render-anchor positions and targets remain authoritative while traversing legacy Bezier corridors.
3. Add right-mouse-drag orbit control to the follow camera. The orbit pitch is continuous and is not clamped to an arbitrary gameplay angle. A pitch-dependent camera up-vector transports orientation continuously across the poles. The existing left-drag character turning remains unchanged.
4. Preserve wheel zoom, lower the minimum boom distance, and substantially increase the maximum zoom distance. The main-world and geometry-demo camera presets may use different defaults and limits.
5. Ignore movement keydowns while Ctrl, Meta, or Alt is held. Normal `R` movement remains available, while browser/system shortcuts are allowed to propagate.

## Consequences

- The same render-space camera distance is maintained in Euclidean and Poincare slices, including after a slice transition.
- Camera zoom is no longer inadvertently compressed by the world projection.
- The 4D preview room's default follow view centers on the character model; the tesseract remains visible as chamber geometry.
- Right-drag can orbit through vertical orientations without a fixed pitch clamp. Left-drag continues to turn the character.
- Ctrl+R and Cmd+R are no longer suppressed by movement handlers.
- Camera placement is clamped through the active transform's render-chart constraint when one is available, preserving the open-ball validity requirement of Poincare charts.
