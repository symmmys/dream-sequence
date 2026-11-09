# Somnium — Geometry Phase 16: Anomaly Optics Implementation Plan

**Status:** Phases 16A–16C implemented; Phase 16D anomaly aperture views implemented; Phases 16E–16F planned  
**Baseline inspected:** Geometry Phase 15 archive (`somnium_geometry_phase15_main_world_reentry_metric_grid.zip`)  
**Purpose:** Establish a mathematically coherent and incrementally testable foundation for light propagation through curved 3D slices and four-dimensional anomaly regions.

---

## 1. Executive recommendation

Implement **geometrical optics first**, using a CPU reference ray solver that is independent of Babylon.js. The first goal should be deterministic, inspectable ray paths and correct optical travel through the existing slice/anomaly network—not a full real-time path tracer immediately.

The architecture should distinguish four related but non-identical things:

1. **Spatial geometry:** the intrinsic geometry of a particular 3D `WorldSlice`.
2. **Ambient geometry:** the authoritative four-dimensional position and slice-frame relationships in R4.
3. **Anomaly optical coupling:** how light, independently of player movement, is allowed to propagate in the W direction through an anomaly.
4. **Rendering and material response:** how a ray's result becomes visible in Babylon.js without destroying existing material appearance.

The key recommendation is to give optics its own field and topology permissions. It may reuse the anomaly's center and radial horizon profile, but it must not reuse player W-movement modifiers or silently equate `traversable` with `light-transmissive`.

## 2. What the Phase 15 codebase already provides

### 2.1 Coordinate and topology foundation

- `src/world/fields/geometry/spatial-4d.js` provides engine-independent R4 vector operations, orthonormal slice frames, local-to-ambient conversion, and ambient-to-slice conversion.
- `WorldSlice` records identify a 3D slice independently of its W coordinate and geometry profile.
- `WorldTopology` provides explicit visible/traversable connections. Numeric W proximity does not invent connectivity.
- `SpatialChunkGraph` represents world chunks with `(sliceId, chunkX, chunkZ)` addresses and anomalies as first-class corridor chunks.
- `anomaly-influence-field.js` evaluates the radial smootherstep influence and currently exposes player W movement and chunk W reach. Those are gameplay/streaming quantities, not optical quantities.

These are strong foundations. Optics should query these services instead of creating a parallel, implicit slice graph.

### 2.2 Existing geometry metrics

- `PoincareMetric.metricAt()` returns a 3×3 positive-definite metric in Poincare-ball coordinates.
- `SpatialTransform.metricAtWorld()` pulls that metric back through the spatial projection Jacobian into the slice's authoritative world coordinates. It also provides a Euclidean path and a spherical metric path.
- Each slice records its geometry profile. The Main World and Poincare chamber currently use Poincare geometry; the Hypercube chamber uses Euclidean geometry.
- `SpatialTransform.worldToRender()` and `GeometryRenderer` provide presentation transforms. These are not physical optical distances and must not be used as the ray solver's metric.

The existing 3D metric API is useful, but there is no authoritative 4×4 optical metric yet.

### 2.3 Existing systems that are not ray tracers

- `src/world/fields/geometry/geodesic-solver.js` relaxes a sampled 3D polyline. It does not integrate optical momentum, handle four dimensions, or implement refraction/reflection. It should not be extended into the core ray tracer.
- `GeometryShaderManager` uses a simplified shader with a fixed light direction, ambient term, and base colour. It is not a physically based material pipeline and should not become the universal optics renderer.
- `CelestialSystem` currently controls a 3D `DirectionalLight` for the sun, a moon directional light, and a `HemisphericLight`. Those can remain the initial source/fallback-light adapters.
- `PortalPreviewRenderer` already renders a destination slice through an isolated camera and render target, but that is a visual preview, not propagation of light through the anomaly.
- CPU-projected mesh vertices are presentation geometry. Optical intersection data must be retained in authoritative slice-local coordinates, not recovered from those lossy rendered vertices.

### 2.4 Immediate architectural gaps to address

1. No optical material contract or optical coefficients exist.
2. No common 4D optical metric or W-direction optical coupling exists.
3. No ray state, momentum, travel-time accumulator, or ray integrator exists.
4. No slice-aware optical scene registry or acceleration structure (BVH) exists.
5. Meshes do not have one guaranteed, complete optical-material/authoritative-geometry registration path.
6. Light sources are 3D Babylon lights; the system has no policy for embedding a source direction into ambient R4 or transmitting it through an anomaly.
7. There is no policy stating whether light may use visible anomalies, only player-traversable anomalies, or a separate class of optical connections.

---

## 3. Mathematical model to adopt

### 3.1 Scope: geometrical optics, not wave optics

The first implementation should model rays, travel time/optical path length, occlusion, and later reflection/refraction. This is the high-frequency/geometrical-optics approximation. It does not model diffraction around wavelength-scale edges, interference, polarization, or full Maxwell wave propagation. Those are separate, much more expensive future directions.

For a static optical environment, Fermat's principle says that light paths are stationary paths of optical travel time; in the isotropic case they are geodesics of an optical metric. In a spatially varying refractive index, paths curve continuously. In anisotropic media, a Hamiltonian/eikonal formulation is the more general ray description. See the references at the end.

### 3.2 Keep the 4D position spatial

Use the existing ambient coordinate:

\[
X^A=(x,y,z,w), \quad A\in\{0,1,2,3\}.
\]

W remains a fourth **spatial** coordinate. Ray propagation uses a separate path parameter (and an accumulated travel time); W must never be reinterpreted as time.

### 3.3 Slice optical metric

For a slice with intrinsic world-coordinate metric \(g^{(s)}_{ij}(x)\), and an isotropic refractive index \(n_s(x)\), the initial 3D optical metric is:

\[
 g^{(s)}_{\mathrm{opt},ij}(x)=n_s(x)^2 g^{(s)}_{ij}(x).
\]

For the first baseline, set \(n_s=1\) everywhere unless a material or environment explicitly overrides it. This isolates curvature effects from invented refraction effects.

Use `SpatialTransform.metricAtWorld()` or an equivalent per-slice geometry provider as the source of \(g^{(s)}\). Do not use `worldToRender()`, visual exaggeration, or the shader's normal transform to calculate optical path length.

### 3.4 Lift a 3D slice metric into ambient R4

Let the slice frame's three orthonormal tangent axes be the columns of a 4×3 matrix \(E_s\), and let its unit normal be \(n_s\). For a positive W optical coupling \(q_W(X)\), a simple anisotropic ambient metric in that frame is:

\[
G_{4,\mathrm{opt}}(X)=E_s\,g^{(s)}_{\mathrm{opt}}(x)\,E_s^T
+\frac{1}{q_W(X)^2}\,n_s n_s^T.
\]

This is a *proposed effective optical metric*, not a claim that the game already has a physically derived 4D spacetime metric. The W term makes normal displacement optically more expensive as W coupling decreases. At exactly zero coupling, the solver must treat W motion as constrained/unavailable; it must not try to put infinity into a numeric matrix.

For an anomaly connecting different slice geometries, lift both endpoint metrics into the same ambient R4 basis, then blend their symmetric positive-definite matrices with smooth normalized weights along the anomaly. Validate symmetry and positive definiteness at every sampled point. Do not linearly interpolate Poincare chart coordinates themselves.

### 3.5 Optical W coupling must be separate from player W freedom

Add an optical configuration to the anomaly, conceptually:

```js
optics: {
  enabled: true,
  bidirectional: true,
  wCouplingScale: 1,
  maxWOpticalReach: 75,
  refractiveIndex: 1,
  attenuationPerUnit: 0
}
```

Names can be refined during implementation. Important invariants:

- Optical coupling may use the same anomaly center, `horizonRadius`, `innerRadius`, and smootherstep *spatial envelope*.
- Optical W coupling has its own multiplier and reach budget.
- `freedomMultiplier`, player stats, `maxWMovementScale`, and player `wReach` never silently change light propagation.
- Optical transmission is controlled by explicit topology/optics permission, not inferred from numeric W proximity.
- Overlapping optical fields must combine deterministically and keep the resulting metric positive definite.

A useful initial profile is `q_W(X) = optics.wCouplingScale * smootherstep(u)`, where `u` is computed from the existing radial horizon. A configurable floor/transition policy may be needed for numerical stability, but exact zero should remain a true W constraint, not an arbitrary large finite speed penalty.

### 3.6 Hamiltonian ray integration

Represent a ray with ambient position \(X^A\), canonical covector momentum \(p_A\), optical path length, elapsed travel time, intensity/throughput, wavelength or RGB band, current slice/anomaly context, and bounce count.

For an optical metric \(G_{AB}(X)\), define the inverse metric \(G^{AB}\) and Hamiltonian:

\[
H(X,p)=\tfrac12 G^{AB}(X)p_Ap_B.
\]

Integrate Hamilton's equations:

\[
\frac{dX^A}{d\lambda}=\frac{\partial H}{\partial p_A},\qquad
\frac{dp_A}{d\lambda}=-\frac{\partial H}{\partial X^A}.
\]

Normalize initial momentum to a fixed Hamiltonian level. Track Hamiltonian/energy drift as a numerical diagnostic. Start with an adaptive Runge–Kutta reference integrator (and compare with a symplectic method if the chosen Hamiltonian admits a useful separable form). Use a path-parameter step limit and adaptive subdivision where the metric or anomaly field changes rapidly.

This formulation is selected because it generalizes to position-dependent and anisotropic optics; in anisotropic media, ray direction and canonical momentum need not be parallel.

---

## 4. Proposed runtime architecture

Create an engine-independent optics package under:

`src/world/fields/geometry/optics/`

Initial module responsibilities (names are suggestions):

| Module | Responsibility |
|---|---|
| `optical-material.js` | Validated diffuse/specular/transmission/IOR/absorption parameters; safe defaults for current materials |
| `optical-field.js` | Sample per-slice metric, anomaly W coupling, optical index, and composed 4×4 metric |
| `optical-ray.js` | Serializable/testable ray state in ambient coordinates and canonical momentum |
| `optical-ray-integrator.js` | Hamiltonian ODE integration, adaptive step control, path/travel-time accumulation |
| `optical-topology.js` | Resolve only explicitly optically connected slices/anomalies and direction permissions |
| `optical-scene-registry.js` | Register authoritative geometry/material/chunk data by slice and chunk address |
| `optical-bvh.js` | Broadphase/triangle acceleration per loaded chunk, with revision-based invalidation |
| `optical-intersections.js` | Ray/terrain/triangle and anomaly aperture event detection |
| `optical-transport.js` | Reflection, refraction, transmission, absorption, and ray branching |
| `optical-debug-renderer.js` | Project 4D/3D ray paths onto the active slice and render diagnostic overlays |

Keep these modules free of Babylon classes where practical. Add a thin Babylon adapter for sources, material bindings, render targets, and debug visualization.

### 4.1 Optical topology is an explicit capability

Do not overload the existing `visible` or `traversable` flags. Add an explicit optical permission/configuration (or a parallel optical edge record). This allows meaningful cases such as:

- visible but not player-traversable, yet light can pass;
- player-traversable but optically opaque;
- bidirectional player traversal but one-way optical transmission;
- optical-only connections used by later magical or observational anomalies.

The ray query must still obey the explicit graph. It must never discover a destination merely because its W coordinate is close.

### 4.2 Authoritative geometry registry

Optical intersection must not use vertices after `GeometryRenderer` has projected them into render space. Register original slice-local vertices/indices (or higher-level analytic primitives) before projection, along with:

- `sliceId`, chunk address, and geometry revision;
- optical material ID/parameters;
- transform/geometry provider;
- bounds and BVH node reference;
- visibility/optical-collision flags.

Prefer analytic intersections for terrain heightfields and simple primitives where they are more stable than triangle tests. Use triangle BVHs for static mesh surfaces. Rebuild/update acceleration structures only when a chunk or mesh revision changes.

### 4.3 Slice/anomaly ray state transitions

Use a small explicit state machine:

`SLICE_RAY -> ANOMALY_RAY -> DESTINATION_SLICE_RAY`

- In a slice, ray motion is integrated using that slice's 3D optical metric.
- At an optically enabled anomaly aperture/horizon, promote the ray into ambient R4 with a well-defined position and momentum lift.
- Within the anomaly, integrate against the 4D anisotropic optical metric and evaluate chunk/surface intersections only through authorized topology.
- At an exit aperture, apply the configured optical interface rule and map the ambient ray state into the destination slice frame.
- If the ray cannot exit, is absorbed, or exhausts its reach/energy/step budget, terminate it with a diagnostic reason.

The aperture/interface rule is an important design choice: it must specify how the ray's normal momentum is handled when it re-enters a 3D slice. Do not silently discard energy or simply teleport the ray direction.

### 4.4 Light sources and environment

Initial source adapter:

- Embed the existing `CelestialSystem` sun direction into the active slice tangent frame with zero W component by default.
- Retain hemispheric ambient illumination as an inexpensive fill/sky approximation; it is not a point-by-point ray-traced source.
- Keep source intensity/time-of-day from `CelestialSystem`; optics transforms propagation, not celestial clock logic.
- Add point/area lights only after the directional source path is validated.

A later 4D source can carry a full ambient direction/position, but should be an explicit type rather than assuming today's 3D directional light has a W component.

---

## 5. Implementation phases

### Phase 16A — Optical contracts and mathematical reference tests

**Deliverable:** Pure JavaScript optical metric and ray state APIs; no visible lighting changes yet.

- Define optical material and anomaly optics schemas with strict validation.
- Introduce optical coupling separate from player movement influence.
- Lift a 3D slice metric into a 4D ambient basis.
- Implement optical metric composition/blending and positive-definite validation.
- Implement a CPU Hamiltonian ray integrator with bounded/adaptive steps.
- Add deterministic ray debug data serialization.

**Acceptance tests:**

- Euclidean constant metric gives straight rays and constant momentum.
- Uniform refractive index changes optical travel time but not ray shape.
- A known Poincare geodesic is recovered in a 3D Poincare slice within tolerance.
- Metric is symmetric positive definite across sampled valid points.
- `q_W=0` prevents normal propagation without NaN/Infinity matrices.
- Increasing optical W coupling smoothly reduces normal optical cost.
- Player `freedomMultiplier` and player stats do not affect optical results.
- Invalid Poincare samples are rejected or bounded through a declared boundary policy; no catch-and-ignore projection failures.

### Phase 16B — Slice-native ray paths and intersections

**Status:** Implemented; 228 total project tests pass, including 27 focused scene-intersection/debug-renderer tests.

**Deliverable:** Rays can be traced within one slice and can hit Somnium geometry.

- Add optical scene registration for Main-World chunks and demo chamber meshes.
- Preserve/obtain authoritative pre-projection geometry.
- Build deterministic per-mesh BVHs tagged with slice/chunk identity; use analytic heightfield intersection for streamed terrain. BVH aggregation across multiple meshes in one chunk is reserved for profiling-led optimization in 16E.
- Trace CPU reference rays through Euclidean and Poincare slices.
- Display ray segments in a debug overlay, converted to render space only at draw time.
- Expose the optical scene registry, slice tracer factory, and debug renderer through `scene.metadata` for development tools and later light-source orchestration.

**Acceptance tests:**

- Euclidean ray/triangle and ray/terrain intersections are correct.
- Terrain sampling uses independent X/Z raster spacing and respects chunk bounds.
- Poincare curved path agrees with metric/geodesic reference cases.
- Render-space projection does not change authoritative hit coordinates or optical path length.
- Unloaded/unregistered chunk data cannot produce a hit.
- Mesh revision replacement rebuilds its BVH deterministically; terrain registrations are removed on chunk disposal.
- Debug paths are projected only for display and dispose cleanly.

See `GEOMETRY-PHASE-16B-SLICE-NATIVE-RAY-TRACING.md` for the delivered API and verification details.

### Phase 16C — Anomaly optical bridge and cross-slice paths

**Status:** Implemented; 255 total project tests pass. See `GEOMETRY-PHASE-16C-ANOMALY-OPTICAL-BRIDGES.md`.

**Deliverable:** A ray can enter the Hypercube/Poincare/Main-World anomaly network and emerge in an explicitly optical destination slice.

- Add an optical topology permission independent of player traversal.
- Add optical W-coupling and optical W-distance/reach budgets per anomaly.
- Integrate ray paths through the anomaly's bounded ambient 4D region.
- Add aperture entry/exit event detection and a declared 4D-to-3D momentum transfer rule.
- Query remote chunk reachability only along optically authorized graph paths; continue slice-local geometry intersection only after a successful aperture handoff.
- Support more than one anomaly in a single ray path, with transition/segment limits.
- Use a stable endpoint-sampled tangent metric blend by default; retain pointwise endpoint-chart sampling as an explicit opt-in for future compatible anomaly designs.
- Treat finite Poincare chart boundaries as explicit ray termination events. Scale-relative SPD validation keeps small but well-conditioned physical metric tensors valid.

**Acceptance tests:**

- No cross-slice ray travel without an optical topology edge.
- One-way and bidirectional optical permissions behave independently of player traversal direction.
- A ray crosses each existing demo connection in the permitted direction(s).
- W coupling is continuous and symmetric with respect to W direction unless an anomaly explicitly configures optical directionality.
- A two-anomaly chain reaches the expected destination without inventing a shortcut.
- The ray retains bounded intensity and stable Hamiltonian/path diagnostics.
- The actual demo endpoint metric tensors (including the Main World's small Poincare metric scale) produce finite, positive optical metric/cometric samples.
- A declared finite chart boundary returns a controlled `chart-domain-boundary` event while undeclared metric errors still propagate.

**Phase 16C scope boundary:** This milestone delivers the CPU cross-slice transport engine and interface transfer law. It does not yet intersect arbitrary 4D meshes inside anomaly volumes, render visible 4D ray paths, cast production sunlight/shadow rays, or implement reflection/refraction at surfaces; those remain later rendering/surface-interaction work.

### Phase 16D — View-dependent anomaly apertures and remote-slice presentation

**Status:** Implemented as the first visible anomaly-view milestone. See `GEOMETRY-PHASE-16D-ANOMALY-APERTURE-VIEW-RENDERING.md`.

**Deliverable:** Looking through an anomaly behaves like looking through a view-dependent opening into the connected 3D slice, rather than viewing a fixed screenshot or postcard.

- Transport the active viewer camera pose through the source/destination endpoint-frame correspondence. Camera translation, orbit, and orientation must continuously update the remote slice camera.
- Render the remote slice on an aperture-shaped surface; the demo's direct Hypercube-to-Main-World anomaly uses a circular disc rather than a rectangular preview plane.
- Add an explicit per-anomaly `view` contract separate from traversal and light-transport permissions. The initial strategies are `endpoint-frame` or `static` camera mapping, circle/ellipse/rectangle aperture shape, and constant or Euclidean-4D-ball cross-section.
- For a Euclidean 4D ball, use the 3D slice section radius `sqrt(R² - d²)` and suppress the preview when the section vanishes. The normal offset is measured relative to the active slice frame; non-Euclidean and custom anomaly types can use another declared view profile.
- Keep destination mesh registration and chunk streaming aligned with the mapped remote camera focus/direction.
- Expose per-portal camera, aperture, and render-list diagnostics.
- Preserve existing world materials and sky systems. No anomaly-driven atmospheric lighting is part of this milestone.

**Acceptance tests:**

- Remote camera position, target, and up vector respond to viewer translation and orientation changes.
- Endpoint-frame mapping works in both anomaly directions and remains stable with different source/destination render scales.
- Finite chart failures disable the affected preview frame without swallowing unrelated errors.
- Euclidean 4D spherical sections shrink according to the analytic cross-section relation and vanish outside the ball.
- Aperture surfaces and rims scale together; hidden/vanished portals do not waste render-target updates.
- Portal render lists remain restricted to the remote slice.
- All pre-existing traversal, topology, optical transport, and portal-preview regressions remain green.

**Scope boundary:** The endpoint-frame mapping is an explicit view isometry, not a general 4D path tracer or arbitrary anomaly renderer. Custom anomaly geometries may provide other view profiles later. Live browser/WebGL inspection is still required to validate final visual composition.

### Phase 16E — Surface interaction and cross-slice direct lighting

**Deliverable:** Visible light transport driven by the CPU ray solver, independently of portal-view rendering.

- Add diffuse reflection/absorption and specular reflection first.
- Add dielectric refraction and total internal reflection using a defined interface normal and refractive indices.
- Add shadow/visibility rays from surface hits toward the sun.
- Preserve existing materials by using a material plugin or a narrowly scoped compatible shader path. Do not replace all project materials with `GeometryShaderManager`'s simplified shader.
- Keep hemispheric ambient fill as a fallback while direct light is ray-evaluated.
- Treat destination atmospheric glow or sky colour shifts as a later optional artistic layer, not a requirement for the first direct-light transport implementation.

**Acceptance tests:**

- Lambert diffuse result is correct in the Euclidean reference scene.
- Specular reflection conserves ray angle and bounded energy.
- Refraction obeys Snell's law in a simple planar interface.
- Total internal reflection is handled without producing an invalid transmitted ray.
- A shadow ray can traverse an optically connected anomaly and test occlusion in the destination slice.
- No missing textures/vertex colours/material channels after integration.

### Phase 16F — Performance and production path

**Deliverable:** Stable frame-budgeted optics suitable for the running browser game.

- Profile CPU reference solver at realistic rays-per-frame and BVH sizes.
- Add ray budgets, temporal accumulation, cache invalidation, and quality scaling.
- Choose the production backend only after profiling: WebGL-compatible shader/compute approximation first if needed; evaluate WebGPU compute as a later optional backend, not a hard runtime dependency.
- Add ray diagnostics: active rays, steps, BVH nodes visited, anomaly transitions, truncated rays, energy loss, and per-frame cost.
- Defer multiple-bounce path tracing/global illumination until direct lighting and cross-slice transport are stable.

**Acceptance tests:**

- Deterministic CPU reference results remain available for regression tests.
- GPU/optimized output matches CPU reference within a declared tolerance.
- Frame budget and memory limits are respected at selected quality levels.
- Ray queues and BVHs dispose/rebuild cleanly on slice/chunk changes.

---

## 6. Risks and safeguards

| Risk | Safeguard |
|---|---|
| Treating render projection as physical space | All ray state, metrics, hits, and path lengths stay in authoritative slice/ambient coordinates; projection happens only for debug display/render integration |
| Confusing player freedom with light propagation | Separate optics fields and player influence modifiers |
| Accidental cross-slice shortcuts | Optical edges must be explicit topology records; W proximity alone is never sufficient |
| Discontinuous metric across anomaly boundary | Smooth field profiles, convex blending of SPD tensors in a common ambient basis, and boundary continuity tests |
| Singular W metric at zero coupling | Represent zero coupling as a constrained direction; never store infinite coefficients in the tensor |
| Poincare chart boundary | Validate metric sampling and keep optical integration within valid chart domain; handle chart transitions explicitly |
| Lost authoritative geometry after CPU projection | Register original geometry before `GeometryRenderer` transforms it; tie BVH lifecycle to mesh/chunk revisions |
| Material regression | Preserve existing materials and introduce optics through a compatible plugin/adapter |
| CPU cost explosion | Start with low-count reference rays, BVHs, step budgets, and debug overlays; optimize only after correctness |
| Ambiguous light entry/exit across 3D/4D | Define an explicit aperture and momentum-transfer rule before cross-slice lighting is enabled |
| Caustics/multiple paths | Allow multiple ray branches later; first phase reports/tracks multiple path arrivals without promising full caustic rendering |

## 7. Recommended first playable milestone (revised)

The first visible milestone is a live, view-dependent anomaly aperture:

1. The remote preview camera is mapped from the active viewer camera through the anomaly's endpoint-frame correspondence.
2. Viewer translation, camera orbit, and camera up/orientation update the remote view continuously.
3. The preview is displayed on an aperture-shaped surface, not a rectangular image card. The demo direct Hypercube-to-Main-World mouth uses a circle.
4. An explicitly Euclidean 4D spherical aperture uses its analytic 3D slice cross-section; other anomalies can declare a constant or future/custom profile.
5. Remote chunk loading follows the mapped destination focus and horizontal view direction.
6. Preserve the existing world renderer, materials, and day/night system. Anomaly-driven atmospheric glow is deferred as an optional art feature.

This is a portal-view transport, not yet a general 4D camera ray tracer. Subsequent work can add more anomaly-specific view mappings and exact projected 4D aperture surfaces. Surface optics and cross-slice direct sunlight are a separate Phase 16E milestone; production performance remains Phase 16F.

## 8. User-approved decisions

The user approved the following decisions:

1. **Full 4D anomaly propagation:** light has unrestricted four-dimensional freedom inside an optically enabled anomaly, subject to its optical W-coupling field and anomaly-specific optical reach.
2. **Independent optical permissions:** optical connectivity and directionality are separate from player visibility/traversability. The implementation exposes `optics.enabled` and `optics.bidirectional`.
3. **Shared envelope, independent optical coefficients:** optical W coupling reuses the anomaly's resolved center, inner radius, outer horizon, and shared smootherstep envelope, but uses its own scale/reach/refractive/attenuation values. It does not inherit player movement freedom or stats.
4. **4D-to-3D interface:** tangential canonical momentum conservation is the starting design for the later aperture rule. Reflection, refraction, transmission, and absorption will be made explicit. Phase 16A does not yet implement this boundary.
5. **First visible objective (revised):** a live, view-dependent aperture into the remote slice. The view must respond to the active observer's camera pose and obey the anomaly's declared aperture/cross-section model.
6. **Later lighting objective:** direct sunlight, cross-slice illumination, shadows, and optional artistic atmospheric response. These are now Phase 16E work, not a prerequisite for viewing through an anomaly.

Phase 16A implements optical contracts, ambient 4D metric construction, and the CPU reference ray solver. Phase 16B adds slice-local triangle/heightfield registration and Euclidean/Poincare hit testing. Phase 16C adds optically authorized 4D anomaly bridges, interface momentum transfer, and multi-anomaly paths. Phase 16D adds view-dependent remote-slice aperture rendering. Surface optics and cross-slice direct lighting remain planned for Phase 16E; performance productionization remains Phase 16F.

## 9. Acceptance gates for the whole optics foundation

Do not call the optics system complete until all of the following hold:

- Existing movement and W-freedom behavior is unchanged by enabling optics.
- Every ray stores an authoritative R4 position, with the correct slice/anomaly context.
- No ray crosses an unregistered or optically disabled anomaly.
- 3D Euclidean and Poincare ray paths match known reference cases.
- 4D anomaly paths are bounded, deterministic, and reversible where configured.
- Cross-slice intersection uses authoritative geometry and correct chunk identity.
- Optical path length/travel time is finite and convergent under step refinement.
- Optical energy/throughput is tracked and does not grow accidentally at transitions or bounces.
- Existing Babylon materials remain intact when optics is disabled or unavailable.
- Debug visualization can show the ray's slice ID, anomaly ID, ambient W, optical coupling, path length, and termination reason.
- Automated tests pass, followed by a live browser/WebGL validation of the actual lighting result.

## 10. References

- Casey, Dunajski, Gibbons & Warnick, *Optical metrics and projective equivalence*, Physical Review D 83, 084047 (2011). Static-spacetime light paths as geodesics of an optical metric. https://doi.org/10.1103/PhysRevD.83.084047
- MIT OpenCourseWare, *Topics in Applied Mathematics: Waves and Imaging*, Chapter 2: Geometrical Optics. Eikonal equation, travel time, and Hamiltonian/geometrical-optics foundations. https://ocw.mit.edu/courses/18-325-topics-in-applied-mathematics-waves-and-imaging-fall-2015/
- Akbarzadeh & Danner, *Generalization of ray tracing in a linear inhomogeneous anisotropic medium: a coordinate-free approach*, JOSA A 27 (2010). Hamiltonian ray tracing for anisotropic media in curved coordinate systems. https://doi.org/10.1364/JOSAA.27.002558
- COMSOL, *Ray Tracing Fundamentals*. Practical limitations of geometrical optics, graded-index ray bending, reflection/refraction, and the omission of diffraction. https://doc.comsol.com/6.3/doc/com.comsol.help.roptics/roptics_introduction.2.03.html
