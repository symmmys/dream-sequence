# Geometry Phase 10 — Slice-Transition Anomalies

**Build:** `2026-11-08-slice-transition-anomaly-hotfix-1`  
**Status:** Implemented; automated tests and static checks pass.

## Overview

The default anomaly is now a bounded, navigable region of ambient four-dimensional space. A player has ordinary three-dimensional movement in a normal world slice and gains independent movement along all four ambient axes only after entering a slice-transition anomaly.

The two existing demo connections have been migrated:

1. 4D Hypercube Chamber (`W = 140`) ↔ Poincare Chamber (`W = 0`).
2. Poincare Chamber (`W = 0`) ↔ Somnium Main World (`W = 80`).

Both remain explicitly represented in `WorldTopology`, and both continue to use their own first-class `CorridorChunk` nodes in `SpatialChunkGraph`.

## Movement model

A normal world remains a three-dimensional slice. The ordinary `PlayerController` does not apply E/Q to the player's world position, and the geometry free camera forces its W offset to zero outside an anomaly.

Inside a slice-transition anomaly, the player can move independently along the three local slice axes and the slice normal:

| Input | Movement |
|---|---|
| W / S | Forward / backward in the slice plane |
| A / D | Left / right in the slice plane |
| R / F | Positive / negative local Y axis |
| E / Q | Positive / negative fourth-axis (slice-normal) movement |
| Left / Right arrows | Turn while traversing |
| Shift | Sprint |

The anomaly controller maps those inputs through the source slice's orthonormal 4D frame. X/Y/Z movement uses the three tangent axes; E/Q moves along the frame normal. This remains valid for rotated slice frames, not just canonical XYZ/W-aligned slices.

The 4D movement controller suspends ordinary terrain movement while the player is in transit. On reaching the destination slice plane, it converts the ambient position into destination-local coordinates, samples the destination terrain, updates the player's slice/transform/layer, restores ordinary movement, and leaves the anomaly chunk. Reverse travel uses the same process.

The free inspection camera supports the same four independent axes while it is inside a slice-transition anomaly. It does not enable W movement in an ordinary slice.

## Bounded anomaly regions

Each slice-transition anomaly stores an explicit finite ambient AABB:

```js
region: {
    min: { x, y, z, w },
    max: { x, y, z, w }
}
```

The player is clamped to these limits while traversing. Entry is also checked against the complete 4D region before transit begins, so being close to an aperture in X/Z is not sufficient when the player is outside its Y or W bounds.

The two demo regions use 7 units of X/Z padding and 8 units of Y padding around their aligned mouths. Their W ranges span only the two connected slice planes: 0–140 for the hypercube connection and 0–80 for the main-world connection. This keeps the spatial cross-section compact for testing while still allowing free movement inside the bounded 4D volume.

### Main-world ambient alignment

The live terrain's local Y elevation can differ significantly from the chamber floor. To avoid turning that difference into a very tall anomaly, the main-world `WorldSlice` frame has a vertical ambient-origin offset. Its terrain exit maps to the same ambient XYZ point as the Poincare-chamber mouth; the main world's local terrain coordinates and `SpatialTransform` remain unchanged. The destination handoff still samples the real terrain elevation.

## Anomaly types and compatibility

`src/world/fields/geometry/spatial-anomaly.js` introduces the typed anomaly factory:

- `slice-transition` is the default type for new anomaly definitions.
- Explicit `bezier` definitions remain supported.
- Legacy records with a cubic `centerline` and no type are interpreted as `bezier` for compatibility.

`createAnomalyTraversalController()` selects `SliceTransitionTraversalController` for slice transitions and the existing `CorridorTraversalController` for Bezier corridors. The cubic Bezier model, metric, traversal controller, renderer, and test coverage remain in the codebase for future special-case anomalies.

## Chunking and topology invariants

World chunk addressing is unchanged. A world chunk remains identified by:

```js
{ schemaVersion, sliceId, chunkX, chunkZ }
```

There is no W coordinate in a world chunk address. While a player is inside an anomaly, the player is recorded as an occupant of that anomaly's `CorridorChunk`; the source and destination remain separate world-chunk domains. Explicit topology edges continue to determine which slices and chunks are connected.

`WorldTopology` validates that a slice-transition anomaly:

- references registered source and destination slices;
- contains both endpoint positions in its finite 4D region;
- connects distinct, parallel (or anti-parallel) 3D slice planes.

## Main implementation files

- `src/world/fields/geometry/spatial-anomaly.js` — typed anomaly model and default factory.
- `src/world/fields/geometry/slice-transition-traversal-controller.js` — bounded, four-axis player/entity traversal and slice handoff.
- `src/world/fields/geometry/world-topology.js` — anomaly normalization and slice-transition validation.
- `src/demo/geometry-demo-topology.js` — compact, ambient-aligned demo anomaly definitions.
- `src/demo/geometry-demo-world.js` — per-type controller dispatch, demo migration, camera/HUD and chunk integration.
- `src/demo/geometry-demo-camera-controller.js` — free-camera 4D movement only while inside a slice-transition anomaly.
- `src/game/player-controller.js` — exposes independent R/F, E/Q, and turning input to anomaly traversal.
- `src/ui/main-menu.js` — updated control help.

## Validation

The Phase 10 test suite contains 133 passing tests. See `GEOMETRY-PHASE-10-TEST-RESULTS.txt` for the exact checks and results.

A headless Chromium visual smoke test was attempted, but Chromium in the build container could not initialize its available GL backend. Therefore, this delivery has automated behavioral coverage and static module checks, but has **not** been visually verified in a functioning WebGL browser in this environment. The installation note below describes how to run the demo locally for that final visual check.
