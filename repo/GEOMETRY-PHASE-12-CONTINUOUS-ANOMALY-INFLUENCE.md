# Geometry Phase 12 — Continuous Anomaly Influence & W-Dependent Reachability

**Build:** `2026-11-08-anomaly-influence-1`  
**Status:** Implemented; automated regression suite passing.  
**Baseline:** Geometry Phase 11.

## Summary

Phase 12 replaces the binary anomaly W-freedom transition with a continuous ambient-4D influence field. The field begins outside the anomaly's bounded interior, increases smoothly toward the anomaly center, and drives both W-axis movement and cross-slice chunk reachability.

The implementation keeps ordinary world chunk identity unchanged:

`(sliceId, chunkX, chunkZ)`

The fourth coordinate is evaluated as part of spatial reachability, not added to the chunk address. Cross-slice reachability still requires an explicitly registered, traversable `WorldTopology` connection.

## Influence field

Every slice-transition anomaly has an `influence` configuration. The topology resolves its default center from the ambient positions of its two endpoints:

`C4 = (P_source + P_destination) / 2`

The default `centerMode` is `endpoints`, which means it is recomputed when endpoints are changed through `WorldTopology.updateCorridor()`. A deliberately fixed center can be supplied with `centerMode: 'fixed'` and a finite `center` vector.

At a point `P4`, the field uses Euclidean ambient 4D distance:

`r = ||P4 - C4||`

The normalized transition parameter is:

`u = clamp((Rh - r) / (Rh - Ra), 0, 1)`

The freedom profile uses smootherstep:

`F = u^3 * (10 - 15u + 6u^2)`

It is zero at and beyond `Rh`, one at and within `Ra`, and changes continuously between them. Its first and second derivatives vanish at both endpoints.

### Default field configuration

When values are omitted, topology registration derives:

- `innerRadius` (`Ra`): `clamp(0.06 * endpointSpan4D, 1.5, 4)`.
- `horizonRadius` (`Rh`): the anomaly region's ambient-4D bounding-sphere radius plus `max(12, min(24, 0.25 * endpointSpan4D))`, and at least `innerRadius + 1`.
- `maxWReach`: the absolute endpoint separation along the source slice normal. The 4D endpoint span is used only as a fallback when no slice normal is available.
- `maxWMovementScale`: `1`.
- `freedomMultiplier` and `reachMultiplier`: `1`.

This deliberately makes the influence horizon larger than the bounded anomaly region, so the field can be felt before formal anomaly entry.

## Configuration and future character statistics

A slice-transition anomaly can independently configure:

```js
influence: {
    centerMode: 'endpoints',
    // center: { x, y, z, w }, // use with centerMode: 'fixed'
    horizonRadius: 24,
    innerRadius: 3,
    maxWReach: 75,
    maxWMovementScale: 1,
    freedomMultiplier: 1,
    reachMultiplier: 1
}
```

`horizonRadius`, `innerRadius`, `maxWReach`, and `maxWMovementScale` belong to the individual anomaly. This permits short transitions, long planeswalks, and anomalies with restricted W motion to share the same algorithms.

`SliceTransitionTraversalController` accepts an optional `getInfluenceModifiers({ player, anomaly, position4D })` callback. It can return runtime `freedomMultiplier` and `reachMultiplier` values. The geometry demo wires this to an optional `PlayerController.getAnomalyInfluenceModifiers()` method or `PlayerController.anomalyInfluenceModifiers` property when present. The same runtime options are passed into graph reachability during destination-world streaming.

No player-stat system or anomaly-creation spell is introduced in this phase. The callback is the integration seam for those future systems. The anomaly's `region` bounds remain the authoritative bounded 4D interior; a future plane-walking creation service should derive those bounds and the influence radii from the character's creation/stat rules.

## Movement behavior

The field provides one shared evaluation for player movement, the inspection camera, transit movement, and chunk queries.

W movement is scaled as:

`vW = inputW * baseSpeed * maxWMovementScale * F`

Runtime character modifiers apply to `F`. X/Y/Z controls are unchanged. W freedom begins in the influence shell, including outside the formal region, and reaches its configured maximum in the inner sphere.

The existing bounded anomaly region continues to constrain the player's full four-axis exploration after formal entry. Bezier corridor traversal remains separate and preserved.

## Generalized chunk reachability

`SpatialChunkGraph.getReachability(sourceAddress, targetAddress, options)` returns a structured result with spatial and W components.

For same-slice chunks, the existing chunk-neighborhood rule is retained. For cross-slice chunks:

1. An explicit traversable topology edge must connect the two slices.
2. The ambient player/camera position is projected into the target slice to find the candidate target chunk.
3. Spatial chunk distance is measured in the target slice's chunk grid.
4. W distance is the absolute ambient displacement from the current point to the target slice plane along the source slice normal.
5. Available W reach is `maxWReach * F * reachMultiplier`.
6. Both the spatial threshold and W threshold must pass.

`getReachableChunkCandidates()` evaluates the projected target chunk and its cardinal neighbors. `getReachableAdjacentWorldChunks()` combines these candidates with the existing local neighbors. A W-nearby but topologically unrelated slice never becomes connected merely because its W coordinate is close.

## Streaming

`WorldManager.update()` accepts an optional reachability context containing:

- `sourceSliceId`
- `position4D`
- optional `influenceOptions`

When the source and managed slice differ, reachable cross-slice chunks are inserted into the normal generation queue. Their LOD calculation uses projected coordinates in the target slice rather than the source camera's unrelated local coordinates.

Remote chunks receive a configurable retention window (`remoteRetentionFrames`, default 30 frames) to avoid flicker when the player is close to a reachability threshold. Existing local render-radius loading and unloading remain unchanged.

## Poincare-side anomaly entry refinement

The Hypercube ↔ Poincare anomaly entry radius is widened to `7.5` world units in both directions. The Poincare-side portal aperture is enlarged to `7.4 × 7.4` with an `8.3`-unit rim. A dedicated integration test constructs a controller on the Poincare side and confirms that it enters the existing anomaly chunk.

This is a focused accessibility refinement; the explicit topology edge, destination slice, and anomaly identity are unchanged.

## Future authentic light propagation

Phase 12 does **not** implement ray tracing. It establishes a reusable spatial field and reachability service that a later renderer can query.

A future light-transport system should trace rays through the ambient 4D geometry and use slice-specific geometry only as intersection surfaces. A candidate approach is an optical metric tensor whose W component depends on an optical influence function, for example a spatial metric of the form:

`g_opt = g_slice + lambda_W(F_opt) * (n ⊗ n)`

where `n` is the slice-normal direction and `lambda_W` controls the optical cost of motion in W. Ray paths would then be integrated as geodesics (or solved through Fermat's principle), and candidate chunk/slice intersections pruned by the same explicit topology and reachability graph.

Important design constraint: player W-freedom is not automatically the speed of light or an index of refraction. Future optical behavior should have its own optical coefficient/metric, possibly influenced by the anomaly field, while remaining independent of player stats. This avoids making light propagation change merely because a character has a different movement ability.

A later ray tracer will also need to decide how to model emission, absorption, scattering, and interface conditions between slice geometries. Those are intentionally deferred.

## Compatibility and verification

- Existing `WorldSlice` identities and 3D chunk addresses are unchanged.
- Explicit topology remains authoritative for cross-slice connectivity.
- `CorridorChunk` remains the anomaly occupancy node.
- The legacy cubic Bezier anomaly implementation is retained.
- Missing influence values in older Phase 10/11 records are defaulted at topology registration.
- Browser module query identifiers are bumped to `somnium-20261108-anomaly-influence-1`.

See `GEOMETRY-PHASE-12-TEST-RESULTS.txt` for the full automated test summary. Browser/WebGL visual verification remains a local manual test; the headless graphics backend is not available in this environment.
