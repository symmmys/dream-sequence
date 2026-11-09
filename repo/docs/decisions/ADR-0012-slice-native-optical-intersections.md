# ADR-0012: Slice-Native Optical Geometry and Intersections

- Status: Accepted
- Date: 2026-11-08

## Context

Phase 16A introduced an engine-independent ambient R4 optical metric and CPU Hamiltonian ray integrator. Rays now need to interact with the world's actual surfaces without confusing authoritative geometry with Babylon's projected render meshes.

## Decisions

1. A scene-scoped `OpticalSceneRegistry` owns copied, authoritative slice-local triangle geometry and analytic terrain registrations.
2. Every registered surface has a stable object ID, `sliceId`, optional 3D chunk address, material contract, enabled state, and revision. Queries are slice-isolated and can additionally filter to explicit resident chunk addresses.
3. Triangle registrations own deterministic median-split BVHs. Replacing a mesh revision rebuilds only that registration's acceleration structure. Chunk identity remains available for filtering; a merged chunk-wide BVH is deferred until profiling justifies it.
4. Streamed terrain is intersected through its authoritative `sampleHeight(x,z)` function, bounded by the owning chunk's X/Z extent. Sampling density comes from source raster dimensions and independent X/Z world spans, not from the dimensions of an individual chunk.
5. The Babylon adapter copies source geometry after authored transforms are baked and before `GeometryRenderer` applies a nonlinear visual projection. Render-only/debug surfaces are excluded unless explicitly marked as optical surfaces.
6. Slice-native rays must start on the target slice and have canonical momentum tangent to its frame. Segment intersections are queried in slice-local coordinates; ray state and hit positions remain ambient R4.
7. Poincare chart and metric validation remains strict. Invalid samples propagate; the tracer does not clip them into valid chart coordinates.
8. Debug ray visualization is a disposable presentation layer. It projects the authoritative trace only when drawing and does not modify the optical path or ray state.
9. Phase 16B does not traverse anomaly topology edges, apply material reflection/refraction/attenuation, or alter production lighting.

## Consequences

- Euclidean and Poincare slices share one geometry registration and tracing API.
- Terrain LOD changes do not change the authoritative terrain surface used for optical hits.
- Chunk streaming lifecycle controls which terrain heightfields are registered.
- The CPU ray solver can now terminate at actual scene geometry and return stable hit data.
- Debug rays can be inspected without making Babylon render coordinates authoritative.
- Cross-slice transfer and aperture momentum laws remain isolated for Phase 16C.
