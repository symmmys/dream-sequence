# Somnium — Geometry Phase 16A: Optical Mathematics and CPU Reference Solver

**Status:** Implemented; CPU reference tests passing  
**Baseline:** Geometry Phase 15 / Main-World re-entry and metric-grid fixes  
**Scope:** Optical configuration contracts, slice-to-ambient 4D optical metric construction, and an engine-independent Hamiltonian ray integrator. No application lighting or rendering behavior is changed in this phase.

## 1. Accepted design decisions

The following decisions were confirmed before implementation:

1. Light has unrestricted four-dimensional propagation inside an optically enabled anomaly, subject to the anomaly's optical coupling field and explicit optical reach.
2. Optical connectivity and directionality are independent of player traversal. An anomaly may be optically enabled while non-traversable, or vice versa.
3. The optical field reuses the resolved anomaly influence center, inner radius, outer horizon, and smootherstep envelope, but has independent optical coefficients and reach. Player freedom multipliers and character statistics do not modify light propagation.
4. Four-dimensional-to-three-dimensional aperture transfer will use a separately specified interface law. Tangential canonical momentum conservation is the planned starting point; this phase does not implement interfaces.
5. The first visible target remains direct sunlight, cross-slice illumination, shadows, and an optional ray-path diagnostic. Reflective/refractive surfaces and full global illumination remain later work.

## 2. New modules

### `src/world/fields/geometry/optical-contracts.js`

Exports:

- `createOpticalMaterial(options)`
- `createAnomalyOptics(options)`
- `evaluateOpticalAnomalyCoupling(anomaly, position4)`
- `opticalSmootherstep`

Optical material fields currently include a stable ID, enabled flag, refractive index, attenuation per unit, transmission, and reflection. Transmission and reflection are constrained so their sum cannot exceed one.

Anomaly optics fields include:

```js
{
    enabled: false,
    bidirectional: true,
    wCouplingScale: 1,
    maxWOpticalReach: null,
    refractiveIndex: 1,
    attenuationPerUnit: 0,
    transmission: 1
}
```

An enabled anomaly must provide an explicit positive `maxWOpticalReach`. Optical connectivity defaults to disabled, preserving the behavior of existing anomalies. Both slice-transition anomalies and legacy Bezier corridors carry this independent optics contract.

`evaluateOpticalAnomalyCoupling()` expects the anomaly influence center and radii to have been resolved by `WorldTopology`. It evaluates the shared smootherstep envelope, multiplied only by optical configuration. It deliberately ignores player `freedomMultiplier`, `reachMultiplier`, movement speed, and player statistics.

### `src/world/fields/geometry/optical-metric.js`

Exports:

- `createOpticalMetricField(options)`
- `blendPositiveDefiniteMetrics3(metrics, weights)`
- `spatialTransformMetricProvider(spatialTransform)`

The field maps the ambient R4 point into the supplied slice frame, samples the intrinsic 3x3 slice metric, applies the refractive index, and lifts the result into the common ambient basis.

For slice tangent basis `E`, tangent metric `g`, refractive index `n`, slice normal `N`, and optical W coupling `qW`, the optical metric is:

\[
G_{AB}=n^2 E_A{}^i g_{ij} E_B{}^j+q_W^{-2}N_A N_B.
\]

The corresponding cometric is evaluated directly:

\[
G^{AB}=n^{-2}E_i{}^A g^{ij}E_j{}^B+q_W^2N^A N^B.
\]

The cometric is the primary solver input. At `qW === 0`, the normal direction is explicitly constrained: the sample returns `metric: null`, `isConstrained: true`, and a finite positive-semidefinite cometric. No infinity is inserted into a matrix and no fake large finite penalty is used. For positive coupling, the full 4x4 metric and cometric are constructed and validated for symmetry and positive definiteness.

The `sliceMetricAt(localPosition, context)` callback accepts either a row-major nine-value array or a metric object exposing `.values`. `SpatialTransform.metricAtWorld()` is supported through `spatialTransformMetricProvider()`.

Metric gradients are estimated with deterministic centered finite differences. Invalid chart samples (including invalid Poincare-ball positions) propagate their validation errors; the solver does not catch, clip, or ignore them.

`blendPositiveDefiniteMetrics3()` performs a normalized convex blend in one shared local slice basis and validates the result. It does not blend arbitrary render-space coordinates.

### `src/world/fields/geometry/optical-ray-integrator.js`

Exports:

- `createOpticalRayState(options)`
- `normalizeOpticalMomentum(field, position, momentum, targetH)`
- `evaluateOpticalHamiltonian(field, position, momentum)`
- `traceOpticalRay(field, initialRay, options)`
- `serializeOpticalRayResult(result, precision)`

A ray stores authoritative ambient R4 position, canonical covector momentum, optical path length, travel time, and intensity. Its Hamiltonian is:

\[
H(X,p)=\frac12 G^{AB}(X)p_Ap_B.
\]

The solver integrates Hamilton's equations:

\[
\dot X^A=G^{AB}p_B,
\qquad
\dot p_A=-\frac12\partial_A G^{BC}p_Bp_C.
\]

It uses adaptive RK4 step-doubling with Richardson correction, bounded step sizes, absolute/relative error tolerances, and a maximum step budget. It records accepted/rejected steps, path parameter, initial/final Hamiltonian, Hamiltonian drift, and sampled phase-space points. Optical path length is integrated from `sqrt(2H)`; travel time is optical path length divided by the configured speed of light (default 1 simulation unit).

Chart/domain errors intentionally propagate. The first phase does not introduce a catch-and-ignore boundary policy.

`serializeOpticalRayResult()` produces stable, timestamp-free JSON for test snapshots and later diagnostics.

## 3. Example usage

```js
import { evaluateOpticalAnomalyCoupling } from './optical-contracts.js';
import { createOpticalMetricField } from './optical-metric.js';
import { traceOpticalRay } from './optical-ray-integrator.js';

const field = createOpticalMetricField({
    sliceFrame: worldSlice.frame,
    sliceMetricAt: (localPosition) => spatialTransform.metricAtWorld(localPosition),
    refractiveIndex: 1,
    wCouplingAt: (ambientPosition) =>
        evaluateOpticalAnomalyCoupling(resolvedAnomaly, ambientPosition).coupling
});

const result = traceOpticalRay(field, {
    position: { x: 0, y: 0, z: 0, w: worldSlice.w },
    momentum: { x: 1, y: 0, z: 0, w: 0 }
}, {
    maxPathLength: 12,
    maxSteps: 4096
});
```

This is a reference API example, not a current application hookup. The application does not yet construct or display rays.

## 4. Validation

The Phase 16A test module covers:

- Independent optical material/anomaly contracts, including legacy Bezier anomalies.
- Radial smootherstep coupling and independence from player influence multipliers.
- Straight Euclidean rays and constant canonical momentum.
- Uniform refractive-index travel-time scaling without changing the geometric ray line.
- Bending in a graded refractive-index field with low Hamiltonian drift.
- Adapter use of the existing `SpatialTransform.metricAtWorld()` API.
- Exact zero-W constraint without non-finite matrix entries.
- Controlled W propagation for partial coupling.
- Normal optical cost varying smoothly with W coupling.
- Symmetric positive-definite 4x4 metric/cometric for a rotated slice frame and anisotropic tangent metric.
- Convex blending of positive-definite slice metrics.
- Recovery of the known radial Poincare geodesic through the ball origin.
- Strict rejection of invalid Poincare chart samples.
- Deterministic ray-result serialization.
- Rejection of invalid numeric inputs and solver options.

Run the complete regression suite from the project root:

```bash
node --test tests/*.test.mjs
```

## 5. What is deliberately not implemented yet

Phase 16A is a mathematical/reference foundation only. It does **not**:

- Register scene meshes or terrain in an optical scene database.
- Intersect rays with triangles, terrain, or a BVH.
- Traverse `WorldTopology` optical edges or transfer rays through apertures.
- Apply attenuation to ray intensity or perform material interactions.
- Create sun rays from `CelestialSystem`.
- Modify Babylon lights, materials, shaders, or the render loop.
- Draw ray overlays or shadows.
- Implement reflections, refraction, diffraction, interference, or global illumination.

Those belong to 16B–16E. The existing movement, camera, chunking, and rendering systems remain behaviorally unchanged in this phase.

## 6. Known numerical considerations

- The CPU solver is intended as a deterministic correctness reference, not a real-time lighting backend.
- Finite-difference cometric gradients are computationally expensive and sensitive to the chosen step size near sharply varying fields.
- The Poincare reference case tests an interior radial geodesic. Near-chart-boundary integration will require a separately declared event/boundary policy in a later slice-ray phase.
- Exact zero W coupling is a constrained, rank-three cometric. Callers must inspect `isConstrained`/`metric` rather than assuming every sample has an invertible 4x4 metric.
- The aperture momentum-transfer rule remains intentionally deferred until cross-slice ray transport (16C).
