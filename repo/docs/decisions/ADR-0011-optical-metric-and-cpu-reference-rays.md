# ADR-0011: Optical Metric and CPU Reference Ray Solver

- Status: Accepted
- Date: 2026-11-08

## Context

Somnium's geometry system now has authoritative 4D ambient positions, independent 3D world slices, multiple intrinsic slice geometries, and continuous anomaly influence fields. The next step is light propagation through those environments. Reusing the player's movement freedom or Babylon's rendering projection would couple unrelated systems and would make optical path lengths incorrect in curved charts.

## Decisions

1. Optical configuration is independent of player traversal. Anomaly optical permissions default to disabled and have independent directionality, W coupling, W reach, refractive index, transmission, and attenuation values.
2. Optical W coupling reuses the resolved anomaly center, inner radius, outer horizon, and shared smootherstep function. It does not use player freedom/reach multipliers or character statistics.
3. Optical ray positions and canonical momenta are represented in authoritative ambient R4. W is a spatial dimension; the ray's integration parameter and accumulated travel time are separate quantities.
4. A 3D slice optical metric is `n^2 * g_slice`. It is lifted into ambient R4 using the slice's orthonormal tangent frame and normal direction.
5. The ambient cometric is evaluated directly. At exactly zero W coupling, the normal direction is constrained and the cometric remains finite and positive-semidefinite; the implementation does not place infinity in a matrix.
6. The CPU reference solver integrates Hamilton's equations with adaptive RK4 step-doubling and records deterministic diagnostics. It is independent of Babylon.js.
7. Invalid geometry/chart samples are rejected by the metric provider and propagate through the solver. The solver does not silently clamp or swallow Poincare domain errors.
8. Phase 16A does not alter renderer, lighting, movement, camera, chunk streaming, or optical topology traversal. Those are later milestones.

## Consequences

- Euclidean and curved slice metrics can share one ray-state/integration API.
- The Poincare metric can be sampled through `SpatialTransform.metricAtWorld()` without involving render coordinates.
- Anomaly W optical coupling can be tuned independently of player W movement.
- A finite cometric can represent a zero-W constrained region without a singular stored tensor.
- The CPU solver provides a deterministic baseline for later scene intersections, cross-slice transport, debugging, and GPU implementations.
- The reference solver uses finite-difference derivatives and is not yet suitable as a high-ray-count real-time renderer.
