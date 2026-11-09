# Geometry Phase 16C — Cross-Slice Anomaly Optical Transport

**Status:** Implemented; 255/255 project tests pass.  
**Date:** November 8, 2026  
**Baseline:** Phase 16B slice-native optical geometry and CPU ray tracing.

## 1. Objective

Phase 16C extends the CPU optical reference from one-slice propagation to paths that traverse explicitly optically-enabled slice-transition anomalies. A ray remains an authoritative ambient R4 state while inside an anomaly and returns to the destination slice only through a registered optical aperture. The ray never teleports between arbitrary slice coordinates and player traversal permissions are not used to authorize optical transport.

This phase does not enable visible sunlight or shadow rendering. Those are now planned for Phase 16E; Phase 16D is dedicated to view-dependent anomaly aperture rendering. It supplies the CPU transport and interface foundation those systems will call.

## 2. Optical topology and permissions

`WorldTopology` now exposes optical-neighbor and optical-edge queries distinct from its player-traversal methods. An anomaly must declare `optics.enabled`; directionality is controlled by `optics.bidirectional`. A non-traversable anomaly can transmit light, and a traversable anomaly can remain optically opaque.

The validated anomaly optical contract includes:

- `enabled` and `bidirectional`;
- `maxWOpticalReach` and `wCouplingScale`;
- `apertureRadius` and `entryRadialBias`;
- `refractiveIndex`, `attenuationPerUnit`, and `transmission`;
- `interfaceRule` and `metricSampling`.

The default metric sampling mode is `endpoint`. It samples each endpoint's intrinsic 3D metric at its own valid aperture coordinate, rebases the destination metric into the source tangent basis, and smoothly blends the positive-definite tensors along the bridge's common slice normal. `pointwise` remains an explicit opt-in for designs whose endpoint charts are valid throughout the anomaly region.

## 3. Ambient 4D anomaly metric

`createAnomalyOpticalField()` builds a positive-definite 4D optical field in the source slice frame. The 3D tangent metric is the endpoint blend multiplied by the configured refractive index squared. The fourth normal direction is exposed according to the anomaly's optical smootherstep coupling, independent of character stats or player freedom modifiers.

The full bridge W span must fit within `maxWOpticalReach`. Local coupling at the aperture determines whether the incoming ray has a transmissible normal mode. Optical reachability also checks the explicit optical topology edge, endpoint aperture distance, and the optical chunk graph where both endpoint slices are registered.

## 4. Aperture interface law

The current interface is an idealized deterministic optical boundary, not yet a dielectric surface with Fresnel reflection or Snell branches.

At 3D-to-4D entry:

1. Decompose the incoming slice canonical covector into aperture-tangential and aperture-normal components using the slice cometric.
2. Lift the tangential covector into the shared ambient tangent basis.
3. Choose a preferred anomaly-normal covector in the two-dimensional normal plane spanned by the aperture radial normal and slice normal. The anomaly center and `entryRadialBias` orient this launch into the bridge interior.
4. Solve the normal coefficient from the incoming Hamiltonian so tangential canonical momentum and the Hamiltonian constraint are preserved.

At 4D-to-3D exit:

1. Project the ambient covector into the destination slice frame.
2. Preserve the aperture-tangential canonical covector.
3. Solve the destination aperture-normal coefficient from the anomaly-side Hamiltonian.
4. Verify the outgoing Hamiltonian before accepting the handoff.

The interface diagnostics report incoming/outgoing Hamiltonians, drift, normal momentum, the transfer rule, and whether aperture-tangential momentum was preserved.

## 5. Ray path orchestration

`createAnomalyOpticalTracer()` orchestrates alternating slice and anomaly segments:

- In a slice, the existing slice-native tracer integrates the ray and checks registered optical apertures and scene geometry.
- On aperture entry, the tracer checks optical topology, directionality, W reach, optical chunk reachability, and interface transfer.
- In an anomaly, the Hamiltonian integrator advances the ray in ambient R4, evaluating the anomaly metric and finding destination aperture, region-boundary, or horizon events.
- On a valid exit, the interface transfers the ray to the destination slice and tracing may continue.
- Multi-anomaly paths are bounded by `maxTransitions`, segment limits, integrator step limits, and each anomaly's finite region/horizon.

The tracer returns ordered `pathSegments`, interface `transitions`, a final slice/anomaly context, final ray state, and aggregate diagnostics. Attenuation is applied exponentially over optical distance inside each anomaly; configured transmission is applied at successful exit.

## 6. Numerical robustness

The Main World Poincare chart uses very small but well-conditioned world-space metric coefficients. Earlier absolute determinant/Cholesky thresholds incorrectly rejected these tensors. `optical-metric.js` now normalizes tensors before positive-definiteness and inversion checks, making those checks scale-relative.

`SpatialTransform.metricAtWorld()` computes a pullback tensor; off-diagonal terms are symmetrized to remove finite-difference accumulation asymmetry.

`SpatialTransform.containsMetricDomainPosition()` checks the point and the finite-difference samples needed by its metric Jacobian. The ray integrator reduces an RK step that crosses a declared metric-domain boundary. If no safe step remains, it returns a controlled `domain-boundary` status and `chart-domain-boundary` event at the last valid state. It does not catch and hide unrelated metric or geometry errors.

## 7. Demo anomaly configuration

All three demo links are optically enabled and bidirectional, independently of their player-traversal flags:

| Connection | Slice W values | Configured maximum optical W reach | Aperture radius |
|---|---:|---:|---:|
| Hypercube ↔ Poincare chamber | 75 ↔ 0 | 75 | 3.5 |
| Poincare chamber ↔ Main World | 0 ↔ 80 | 80 | 3.5 |
| Hypercube ↔ Main World | 75 ↔ 80 | 5 | 2.8 |

The optical tracer can use the direct Hypercube-to-Main-World edge or the two-anomaly route through the Poincare chamber. It follows only the selected, explicitly registered path; it never infers a shortcut from W proximity.

## 8. New and updated modules

- `src/world/fields/geometry/optical-anomaly-tracer.js` — anomaly field construction, topology-aware path orchestration, aperture events, interface momentum transfer, reachability, attenuation, and diagnostics.
- `src/world/fields/geometry/optical-contracts.js` — anomaly optical configuration validation and radial coupling evaluation.
- `src/world/fields/geometry/optical-metric.js` — scale-relative SPD metric validation/inversion, metric-domain guards, and 4D metric composition.
- `src/world/fields/geometry/optical-ray-integrator.js` — declared chart-domain boundary termination for adaptive RK integration.
- `src/world/fields/geometry/spatial-transform.js` — metric-domain test and symmetric pullback metric output.
- `src/world/fields/geometry/world-topology.js` — optical-neighbor queries independent of player traversal.
- `src/world/spatial-chunk-graph.js` — optical reachability and optically-reachable chunk candidates.
- `src/demo/geometry-demo-topology.js` — optical settings for the three demo anomaly links.
- `src/scene/create-scene.js` — scene metadata factory for topology-aware optical tracing.

## 9. Verification

Full suite:

```bash
node --test tests/*.test.mjs
```

**255 tests passed; zero failures.**

New Phase 16C regression coverage includes:

- optical topology independent of player traversal;
- one-way and bidirectional optical permissions;
- optical chunk reachability independent of traversal chunk reachability;
- anomaly metrics and a real fourth propagation direction;
- actual demo endpoint Poincare/Euclidean metric construction at production scales;
- entry/exit through all three demo anomalies in both directions using controlled identity-metric fixtures;
- a two-anomaly Hypercube → Poincare → Main World ray path;
- aperture-tangential canonical momentum and Hamiltonian preservation;
- W-range refusal and optical chunk permission checks;
- scale-relative invertibility for small Main World Poincare metrics;
- controlled chart-domain termination.

JavaScript syntax and relative import checks are recorded in `GEOMETRY-PHASE-16C-TEST-RESULTS.txt`.

## 10. Explicit limitations

- No visible lighting integration, sun-ray generation, shadow rays, or Babylon material updates yet (Phase 16E).
- No dielectric reflection/refraction, Fresnel energy split, or total internal reflection at surfaces yet.
- Arbitrary 4D mesh/volume intersections inside an anomaly are not yet implemented. The anomaly solver currently interacts with the metric, apertures, influence horizon, and bounded anomaly region.
- `OpticalDebugRenderer` currently renders slice-native portions of a topology trace; ambient R4 anomaly samples remain in the CPU result but are not yet drawn as a dedicated 4D debug visualization.
- The default endpoint metric blend is a stable bridge approximation. It is not a claim that the selected blend uniquely determines the physically correct geometry of an arbitrary anomaly.
- Automated CPU tests do not replace live browser/WebGL validation. The browser renderer and any visible light effect have not been verified in this headless environment.
