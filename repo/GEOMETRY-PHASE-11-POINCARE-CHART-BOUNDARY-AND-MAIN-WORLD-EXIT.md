# Somnium — Geometry Phase 11
## Poincaré camera chart-boundary repair and direct 4D-room exit

Build: `somnium-20261108-poincare-chart-main-exit-1`

## Summary

Phase 11 addresses a runtime exception that could occur after entering the
Poincaré chamber and adds a short, labeled anomaly from the 4D Hypercube
Chamber directly to the existing Somnium Main World slice.

## Poincaré free-camera boundary repair

The reported stack trace occurred when `GeometryDemoCameraController`
attempted to convert the free camera's rendered position back into world
coordinates while checking an anomaly entrance. The camera could move beyond
the Poincaré chart's open unit-ball boundary. `PoincareProjection.ballToWorld`
correctly rejects positions on or outside that boundary, so the unchecked
camera position caused a `RangeError` during the frame update.

The fix is deliberately applied before inverse projection:

- `SpatialTransform.constrainRenderPosition()` validates finite render-space
  coordinates and clamps Poincaré positions to a small, configurable margin
  strictly inside the open ball.
- Euclidean and other non-Poincaré transforms remain unchanged.
- The free camera constrains its position when entering free mode, when a view
  is set, after ordinary free-camera movement, and before converting the
  camera position back to world coordinates.
- A `RangeError` during a corridor-entry position conversion causes that
  entry check to be skipped for the current frame; unrelated errors are not
  swallowed.
- The strict open-ball validation in `PoincareProjection.ballToWorld()` is
  unchanged. This preserves the geometry invariant rather than hiding invalid
  projections.

## New direct 4D-room → Main World anomaly

The live Main World slice remains at ambient `W = 80`. The 4D Hypercube
Chamber is now at `W = 75`, giving the new direct connection an exact `+5 W`
separation.

The new anomaly is:

- ID: `geometry-demo-4d-main-world-corridor`
- Type: `slice-transition`
- Source: 4D Hypercube Chamber, local position `(18, 2.5, 0)`
- Destination: the existing `somnium-main` slice, at the aligned local
  destination position
- Ambient W interval: `75` to `80`
- Direction: bidirectional
- Interior: bounded 4D region with compact XYZ extents and a five-unit W span
- Label: `ANOMALY 03 | SOMNIUM MAIN WORLD · W +5`

The route has dedicated source/destination portal visuals and its own
`CorridorChunk`. It reuses the existing Main World slice, terrain, spatial
transform, and world manager; it does not create a duplicate main world.

The original Hypercube Chamber ↔ Poincaré Chamber anomaly remains available,
as does the Poincaré Chamber ↔ Main World anomaly. The existing cubic Bezier
corridor implementation remains in the codebase for future explicitly typed
anomalies.

## Chunking and topology invariants

World chunk addresses remain `(sliceId, chunkX, chunkZ)`; W is not added to a
world-chunk address. The new route is represented by an explicit topology
edge and a dedicated anomaly `CorridorChunk`. The destination chunk is resolved
in the existing Main World slice through the graph, preserving the established
separation between world chunks and anomaly occupancy.

## Verification

The Phase 11 automated suite covers:

- Poincaré free-camera chart clamping and Euclidean pass-through.
- Recovery from a stale free-camera position outside the Poincaré chart.
- Registration of all three demo anomalies.
- The direct route's exact `+5 W` relationship and bidirectional topology.
- Source and destination chunk adjacency to the new anomaly chunk.
- End-to-end traversal into the live Main World terrain and cleanup of
  anomaly occupancy.
- Presence of the labeled portal in the 4D chamber.

See `GEOMETRY-PHASE-11-TEST-RESULTS.txt` for the final automated test and
syntax-check results.
