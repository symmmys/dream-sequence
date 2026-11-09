# Somnium — Geometry Phase 16B: Slice-Native Ray Paths and Intersections

**Status:** Implemented; automated regression suite passing  
**Baseline:** Geometry Phase 16A / optical metric and CPU reference ray integrator  
**Scope:** Authoritative slice geometry registration, triangle and terrain intersections, slice-native Euclidean/Poincare ray tracing, and render-space-only ray diagnostics. No production lighting or cross-slice anomaly transport is enabled.

## 1. Summary

Phase 16B connects the Phase 16A CPU optical solver to actual geometry in one registered `WorldSlice` at a time. Rays are integrated in authoritative ambient R4, constrained to the selected slice's tangent space, converted to slice-local coordinates only for geometry queries, and terminated at the nearest registered surface hit.

The implementation deliberately keeps the optical scene registry independent of Babylon.js. A narrow Babylon adapter copies pre-projection mesh geometry into that registry. Streamed world terrain is registered analytically from the authoritative terrain height sampler rather than from its LOD-dependent rendered triangles.

## 2. New modules

### `src/world/fields/geometry/optical-scene-registry.js`

Exports `OpticalSceneRegistry`.

Public operations:

- `registerTriangleMesh(options)` validates and copies source position/index buffers, creates deterministic triangle records, and builds a binary BVH for that mesh registration.
- `registerHeightfield(options)` registers a terrain sampler with explicit slice identity, X/Z bounds, optional chunk address, material, and revision.
- `unregister(id)` removes either type of geometry registration.
- `intersectSegment(sliceId, from, to, options)` returns the nearest surface hit along a slice-local segment.
- `getStats()` reports registration counts, intersection counts, BVH visits, triangle tests, heightfield samples, and slices represented.
- `dispose()` releases registry-owned acceleration data and prevents further use.

Every registration has a stable object ID, owning slice ID, optional three-dimensional chunk address, revision, and validated optical material. Queries reject geometry from other slices. When `allowedChunkAddresses` is supplied, chunked geometry outside that set is excluded, while explicitly slice-global geometry remains queryable. Unregistered geometry can never create a hit.

Triangle geometry uses a deterministic median-split BVH per mesh registration. This gives updates a narrow ownership boundary: replacing one mesh revision rebuilds that mesh's BVH without invalidating unrelated objects. Chunk identity is retained for query filtering. Combining many mesh BVHs into one chunk-wide hierarchy is intentionally deferred until 16E profiling demonstrates that it is needed.

Heightfields are intersected analytically against `terrain.sampleHeight(x, z)`. The segment is first clipped to the registration's X/Z chunk bounds, then sampled at a density derived from the source raster's independent X and Z world-space cell spacing. A sign-change bracket is refined by bisection. Surface normals use finite-difference height gradients, with one-sided differences at the registration boundary. This path is independent of terrain mesh LOD and does not leak hits into adjacent chunks.

### `src/world/fields/geometry/babylon-geometry-adapter.js`

Exports `BabylonGeometryAdapter`.

The adapter owns one `GeometryRenderer` per registered slice and optionally shares an `OpticalSceneRegistry`. For accepted meshes, it bakes the mesh's authored world transform, copies the resulting authoritative vertices/indices into the optical registry, and only then applies the slice's visual projection. Render-only objects, debug grids, portal labels, and hypercube presentation-only meshes are excluded unless explicitly marked as optical surfaces.

`registerOpticalMesh()` and `unregisterOpticalMesh()` make optical registration revision-aware and follow the mesh's lifecycle. The adapter does not make projected Babylon vertices authoritative.

### `src/world/fields/geometry/optical-slice-tracer.js`

Exports:

- `createSliceOpticalField(slice, spatialTransform, options)`
- `traceOpticalRayInSlice(field, sceneRegistry, sliceId, initialRay, options)`
- `createSliceOpticalTracer({ slice, spatialTransform, sceneRegistry, debugRenderer, metricOptions })`

A slice optical field samples the registered `SpatialTransform.metricAtWorld()` metric and enforces zero W coupling. The tracer validates that both the initial position and canonical momentum are on/tangent to the slice frame. Each accepted integration segment is converted to slice-local coordinates and queried against the scene registry. The nearest registered triangle or heightfield hit terminates the ray with status `surface-hit`.

The event parameter is mapped back to the integrator state, and the final position is replaced with the authoritative surface intersection. Poincare rays remain curved because integration uses the intrinsic Poincare metric; the short integration chords are only the local intersection approximation. Reducing maximum step size tightens that approximation.

Invalid chart samples propagate as errors. The tracer does not clamp ray positions to the Poincare ball or silently turn domain errors into misses.

### `src/world/fields/geometry/optical-debug-renderer.js`

Exports `OpticalDebugRenderer`.

The debug renderer consumes ray samples in ambient R4, maps samples back to the owning slice, and calls `SpatialTransform.worldToRender()` only when creating Babylon line meshes. Samples that leave the current 3D slice split the displayed path into separate groups rather than drawing misleading cross-slice straight lines. Debug meshes are explicitly tagged as render-only and have a clear/dispose lifecycle.

## 3. Application integration

`create-scene.js` creates one `OpticalSceneRegistry` and one `OpticalDebugRenderer` for the scene. The registry is shared with:

- The geometry-demo `BabylonGeometryAdapter`, which registers the Poincare room, hypercube chamber fixtures, and other eligible slice meshes.
- The live Main World `WorldManager` and its `WorldChunk` objects, which register analytic terrain heightfields as chunks become resident and unregister them when chunk meshes are disposed.
- `Hypercube4DRenderer`, which refreshes the current 3D tesseract cross-section as a versioned triangle surface and unregisters it when disposed.

Scene metadata exposes:

```js
scene.metadata.opticalScene
scene.metadata.opticalDebugRenderer
scene.metadata.createSliceOpticalTracer(sliceId, metricOptions)
scene.metadata.getOpticalSceneStats()
scene.metadata.getOpticalDebugStats()
```

The tracer factory resolves the slice and its transform from `SliceWorldRegistry`, and injects the shared registry/debug renderer. Call `tracer.trace(rayState, { drawDebug: true })` to draw the returned trace. The caller remains responsible for creating an initial optical ray and choosing its momentum/step/path settings.

## 4. Example usage

```js
import {
    createOpticalRayState,
    normalizeOpticalMomentum
} from './src/world/fields/geometry/optical-ray-integrator.js';
import { sliceToAmbient } from './src/world/fields/geometry/spatial-4d.js';

const sliceId = 'somnium-main';
const binding = scene.metadata.worldSliceRegistry.require(sliceId);
const tracer = scene.metadata.createSliceOpticalTracer(sliceId);
const position = sliceToAmbient(binding.slice.frame, { x: 0, y: 8, z: 0 });
const momentum = normalizeOpticalMomentum(
    tracer.field,
    position,
    { x: 1, y: 0, z: 0, w: 0 }
);
const ray = createOpticalRayState({ position, momentum });
const result = tracer.trace(ray, {
    maxPathLength: 30,
    maxStepSize: 0.05,
    drawDebug: true
});
```

This is a development API example. Phase 16B does not yet create rays automatically from `CelestialSystem`, alter any Babylon light, or add a user-facing ray tracing control.

## 5. Tests and verification

`tests/optical-intersections.test.mjs` covers:

- Nearest triangle hit, deterministic equal-distance resolution, barycentric data, and normals.
- Slice isolation and explicit chunk filtering.
- Defensive copying and deterministic BVH rebuild after mesh revision updates.
- Babylon adapter registration before visual projection and exclusion of debug/render-only geometry.
- Disabled optical materials and invalid geometry/revision rejection.
- Flat and sloped heightfield intersections, normals, per-chunk bounds, and no cross-chunk leakage.
- Sampling density derived from the source raster rather than the current chunk's smaller bounds.
- Independent X/Z sample spacing for non-square terrain rasters.
- Slice-global static geometry while streamed chunks are filtered.
- Euclidean slice tracing, arbitrarily oriented 4D slice frames, and enforcement of tangent position/momentum.
- Poincare geodesic intersections and agreement with an intrinsic geodesic reference.
- Rejection of off-slice rays and geometry registered only to unrelated slices.

`tests/optical-debug-renderer.test.mjs` verifies render-space conversion occurs only at draw time, off-slice samples split debug paths, visibility toggles work, and mesh resources dispose cleanly.

The full project regression command is:

```bash
node --test tests/*.test.mjs
```

## 6. Deliberately deferred

Phase 16B does **not** implement:

- Anomaly optical edge traversal or cross-slice ray transport (16C).
- 4D aperture intersection or tangential canonical momentum transfer.
- Material reflection/refraction, attenuation application, or energy branching.
- Celestial/sun ray generation or Babylon direct-light integration (16E).
- Shadows, soft shadows, global illumination, or multiple bounces.
- GPU ray tracing, batching, temporal accumulation, or production budgets (16E).

The implementation is a low-ray-count CPU correctness and geometry-intersection layer. It is not yet a real-time lighting system.

## 7. Known limitations

- Meshes use a BVH per registration, not a merged BVH for an entire chunk. Chunk tags are available for filtering. A higher-level chunk acceleration layer should be justified by profiling in 16E.
- A curved ray is intersected using the short chord between adjacent accepted integration samples. The adaptive integrator and configurable maximum step size bound the approximation; a curved-surface root solver can be added if Phase 16E accuracy tests require it.
- Heightfields use bounded adaptive-density sampling plus bisection; highly oscillatory height functions beyond the source raster's resolution are not represented.
- Poincare chart-boundary behavior remains strict. A later phase must add an explicit optical boundary event policy rather than clamping invalid chart coordinates.
- Browser/WebGL visual validation remains a manual acceptance step; automated tests use deterministic CPU geometry and Babylon test doubles.
