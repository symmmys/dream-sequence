# ADR-0008: Intrinsic corridor length and visible tesseract rendering

- Status: Accepted
- Date: 2026-11-08

## Context

The demo corridors crossed large ambient fourth-coordinate and terrain-elevation differences. Traversal distance was calculated directly from the ambient R4 arc length, making short demonstrations take a long time. The tesseract renderer used a one-pixel LineSystem while the follow camera targeted the player, which made the object difficult to notice at the default viewpoint.

## Decisions

1. Add `intrinsicLengthScale` to `SpatialCorridor`, defaulting to `1`. Its allowed range is `(0, 1]`. Proper distance is ambient sampled arc length multiplied by this value. This represents metric compression within an anomaly without altering the world slices, ambient centreline, corridor chunks, or topology.
2. Set both geometry-demo anomalies to `0.32`, and configure demo traversal to 12 units/s walk, 18 units/s sprint, and 10 units/s for entities.
3. Render the tesseract as one dynamically updated tube mesh for its 32 edges plus 16 visible vertex markers. Retain engine-independent R4 projection and XW rotation.
4. Render the tesseract as visible chamber geometry, but keep the follow camera centered on the character model. During corridor traversal, the explicit render-anchor target takes precedence. The earlier tesseract-focused camera behavior was superseded by ADR-0010.

## Consequences

- Existing corridor definitions remain compatible because the new property defaults to `1`.
- Distant slices remain distant and explicitly connected; topology does not change.
- Demo travel time is reduced without changing the destination's 4D coordinate.
- The tesseract uses 17 render meshes (one edge mesh and sixteen small markers) sharing one material. This is a modest, bounded cost for the isolated test chamber.
- Camera focus remains player-centric; the tesseract is inspected by moving or orbiting the camera, not by displacing the character-follow target.
- The browser still needs a manual WebGL pass to confirm visual appearance on the target GPU/browser.
