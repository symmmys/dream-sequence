# ADR-0013: Cross-Slice Optical Transport Through 4D Anomaly Bridges

- **Status:** Accepted
- **Date:** November 8, 2026
- **Phase:** Geometry Phase 16C

## Context

Somnium models 3D worlds as distinct `WorldSlice` objects embedded in ambient R4. Player traversal and continuous W movement already use explicit anomaly topology. Optical propagation now needs to cross between slices without using player traversal permissions or treating an anomaly as a visual portal teleport.

## Decisions

1. **Optical permissions are independent.** An anomaly opts into ray transport with `optics.enabled`, and its optical directionality is controlled by `optics.bidirectional`. Player `traversable` and player `bidirectional` fields do not authorize light.
2. **Rays retain ambient R4 state inside a bridge.** A successful aperture entry changes the metric/context, not the meaning of the ray's four coordinates. Exit occurs only at an explicitly registered destination aperture reachable through the optical graph.
3. **Optical reach is anomaly-specific.** `maxWOpticalReach`, `wCouplingScale`, aperture radius, refractive index, attenuation, transmission, and entry bias are configured independently per anomaly. The radial smootherstep envelope reuses the anomaly center and radii but does not read player modifiers.
4. **Endpoint metrics form the default bridge tangent metric.** The source and destination intrinsic slice metrics are sampled at their respective aperture coordinates, rebased into a common tangent basis, and blended with smootherstep along the bridge normal. Pointwise chart sampling is opt-in because distant points may be outside one endpoint chart's domain.
5. **The initial aperture rule preserves tangential canonical momentum and Hamiltonian.** The normal coefficient is solved from the Hamiltonian constraint. 3D-to-4D entry uses a deterministic aperture-normal/slice-normal launch direction biased toward the anomaly center. This is an idealized transfer law; it does not yet create reflected/refracted branches.
6. **Finite chart boundaries are explicit.** A declared metric-domain guard causes adaptive step reduction and a controlled `chart-domain-boundary` terminal event. Unexpected errors are not swallowed.
7. **The CPU tracer remains authoritative.** Babylon is only used to display slice segments and registered scene geometry. Lighting integration and the eventual optimized backend remain later phases.

## Consequences

- A light ray may traverse a non-player-traversable anomaly, or be blocked by an optically disabled anomaly that players can use.
- One ray can follow an explicitly linked anomaly chain, with transition limits preventing runaway cycles.
- Every slice handoff includes diagnostics for Hamiltonian drift and aperture-tangent momentum preservation.
- The implementation can serve as the reference path for later sunlight, cross-slice shadows, and rendering work.
- Arbitrary 4D obstacles, material reflection/refraction, visible 4D ray-path display, and production lighting are not part of this ADR's implementation scope.
