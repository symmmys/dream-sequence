# ADR-0015: Anomaly-Fed Virtual Spotlight

- **Status:** Accepted
- **Date:** November 9, 2026
- **Phase:** Geometry Phase 17A

## Context

Phase 16A–16C established engine-independent CPU optical ray integration and explicit cross-slice anomaly transport. Phase 16D established view-dependent aperture rendering. The next demonstrable lighting step is to use a light source located in the Hypercube slice and show its light emerging into the Main World.

A normal Babylon light placed in the source scene cannot itself express the required 4D transport and must not bypass optical topology permissions.

## Decisions

1. The light source is authoritative engine-independent slice-local data with XYZ position/direction, colour, intensity, range, cone angle, exponent, enabled state, and shadow preference.
2. The first prototype uses one spotlight and a deterministic central ray. Point and area emitters are deferred.
3. The ray is lifted into ambient R4 using the source slice frame and traced by the existing anomaly optical tracer. The demo tracer facade restricts this prototype to the explicit direct Hypercube-to-Main-World anomaly.
4. The tracer gains an opt-in `stopAfterAnomalyExit` option. Default tracer behavior is unchanged; light consumers can request the outgoing aperture state without integrating an unused destination tail.
5. A virtual emitter is derived by converting outgoing canonical momentum to destination slice velocity and extrapolating backward from the aperture. Its render-space pose is computed through the destination `SpatialTransform`.
6. Babylon source and receiver spotlights are layer-restricted. A bounded receiving-side shadow map uses nearby eligible Main World meshes. This is a pragmatic direct-light approximation, not complete 4D surface-to-source visibility tracing.
7. Source-side edit controls are isolated from player/camera input while active. The first prototype supports movement and aiming within the source slice only; W movement is deferred.
8. If shadow-map construction is unavailable, receiving-side direct illumination remains enabled without shadows.

## Consequences

- The prototype proves a visible light-source-to-anomaly-to-destination path using the authoritative Phase 16C transport engine.
- Render coordinates are derived from physical slice coordinates; no physical XYZ values are copied directly into a nonlinear destination render space.
- A single ray represents the spotlight's centre direction. Full beam sampling, multiple paths, point-light cubemap shadows, and physically transported shadow rays remain future work.
- Browser/WebGL testing is still required to verify actual lighting and shadow appearance.
