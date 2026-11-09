# Geometry Phase 4 — Player-controlled 4D traversal

## Scope delivered

This milestone replaces the previous fixed-duration corridor animation with input-driven travel along the authoritative four-dimensional corridor curve. It also adds a reverse-side Babylon display proxy and completes the basic third-person character movement contract needed by later free-camera work.

## Traversal model

`CorridorTraversalController` now measures the cubic R4 centreline by sampled arc length (128 segments by default). The player's normalized corridor progress changes by:

`deltaProgress = signedInput * movementSpeed * deltaTime / corridorLength`

The default traversal speed is 8 ambient units/second; sprint traversal is 12. Releasing forward/back movement holds the player at the current corridor position. Backward input retraces the curve and can return the player through the mouth they entered. Reaching the far endpoint transfers the player into the destination slice.

The active player's authoritative `spatialPosition4D` is sampled from the R4 centreline plus offsets in all three transported perpendicular frame axes. Together, the centreline tangent and three perpendicular axes provide four independent local movement directions. Babylon receives the lossy 3D display position and projected cross-section offsets. The corridor remains a single `CorridorChunk` graph node; occupancy progress and 4D position are updated on every traversal tick.

### Entry conditions

The player must be within the configured mouth trigger distance, face the corridor mouth, and hold forward movement. The chunk graph must expose the corridor from the player's current or immediately adjacent X/Z chunk. The nearby-chunk check handles mouth positions that fall on a chunk boundary; it does not infer cross-slice adjacency from fourth-coordinate proximity.

### Slice handoff

At the far endpoint the controller updates the player's slice identity, spatial transform, layer mask, and terrain sampler. Cross-section offsets are projected onto the destination slice frame, so in-slice lateral displacement is preserved at exit; the normal component is discarded when the player joins the destination 3D cross-section. It then clears the corridor render anchor and resumes ordinary character movement. Backing out of the entry mouth restores the original slice in the same way.

### Bidirectional rendering

`CorridorRenderer` supports an `anchorT` parameter. The source-side proxy is anchored to the source slice at `t=0`; a second proxy is anchored to the destination slice at `t=1`. This lets a traversal beginning on either side render the corridor in the corresponding slice's local camera frame. The two proxies are display-only; neither defines topology or authoritative position.

The renderer exposes `tangent4D` and three orthonormal `axes4D` with each sample, plus their display-space projections. The player uses all three perpendicular axes while the signed corridor progress supplies the tangent direction. This is the frame contract future free-camera controls can reuse without deriving four-dimensional motion from the lossy 3D mesh.

## Character controls

### Ordinary 3D world

- `W` / `S`: move forward / backward.
- `A` / `D`: strafe left / right.
- `Arrow Left` / `Arrow Right`: rotate.
- Left-mouse drag: turn the character.
- `Space`: jump; gravity returns the character to the terrain surface.
- `Shift`: run.

### Inside an anomaly

- `W` / `S`: advance / retreat along the 4D corridor centreline.
- `A` / `D`: move laterally within the corridor cross-section.
- `R` / `F`: move along the second transported cross-section direction.
- `E` / `Q`: move along the third transported cross-section direction.
- The three cross-section offsets are jointly constrained to the corridor radius.
- `Shift`: increase corridor travel speed.

The player camera remains in its existing follow mode. A toggled free-camera mode and independent forward/back controls for all four ambient axes are intentionally not part of this milestone; the camera implementation can reuse the same tangent and transported frame contract.

## Non-player entities

The existing `beginEntityTransit()` and `tryBeginEntityTransit()` entry points remain available. Registered non-player entities advance through the same R4 centreline and corridor chunk, using their optional positive `corridorSpeed` or the configured entity default. On arrival their slice, transform, layer mask, and terrain-relative world position are updated. A global physics/AI actor registry is still a separate integration task; systems must call one of these entry points when an entity reaches a mouth.

## Changed files

- `src/world/fields/geometry/corridor-traversal-controller.js` — input-driven arc-length movement, retreat, cross-section offsets, occupancy and slice handoff.
- `src/world/fields/geometry/corridor-renderer.js` — source/destination anchoring, interpolated transported 4D frames, exposed 4D tangent and axes.
- `src/demo/geometry-demo-world.js` — reverse-side corridor proxy and per-slice traversal rendering.
- `src/game/player-controller.js` — two-axis ground movement, jumping, input snapshots for all three corridor cross-section axes, and preserved inputs while world movement is suspended.
- `index.html`, `src/main.js`, `src/scene/create-scene.js` and affected imports — build identifier `somnium-20261108-4d-traversal-2` for browser cache separation.
- `tests/corridor-traversal.test.mjs`, `tests/corridor-renderer.test.mjs`, `tests/player-controller.test.mjs` and `tests/world-manager-visibility.test.mjs` — regression coverage.

## Verification

- Node tests: **84 passed, 0 failed**.
- JavaScript source and test syntax: **119/119 passed**.
- Relative JavaScript import targets: **0 missing**.
- Renderer unit test uses a Babylon API stub to verify mouth anchoring and orthonormal 4D frames.
- Browser/WebGL smoke test: **not completed**. Headless Chromium timed out before returning DOM output, so visual movement, portal framing, and live Babylon lifecycle need verification in the user's browser.

## Remaining limitations

1. The corridor is one logical chunk. Long corridors are not subdivided into independently streamed corridor segments yet.
2. The player can control the centreline coordinate and all three cross-section offsets. The three-dimensional portal proxy is necessarily a lossy view of that four-dimensional movement.
3. The current 3D render mapping is intentionally lossy. Traversal uses ambient R4 coordinates; the proxy does not pretend to be a lossless embedding.
4. A slice handoff occurs at a corridor mouth. Seamless multi-chart visual blending and destination-side chunk prefetch are future refinement work.
5. Non-player traversal is shared, but AI/physics systems are not yet globally wired to discover every actor automatically.
6. The free-camera toggle and independent four-axis camera controls are deferred until this traversal behavior is confirmed in the geometry demo.
