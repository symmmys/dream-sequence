# Geometry Phase 16D — View-Dependent Anomaly Apertures

**Status:** Implemented; 267/267 automated project tests pass after the view-mapping and renderer hardening pass.  
**Date:** November 8, 2026  
**Baseline:** Phase 16C cross-slice anomaly optical transport.

## 1. Objective

Replace the fixed, postcard-like remote-slice preview with a view-dependent aperture. Looking through an anomaly should behave like looking through an opening into the connected 3D slice: the apparent view changes as the observer moves or rotates the camera, and the visible opening follows the anomaly's declared cross-section model.

This milestone is about **view transport and portal presentation**, not about light emitted by an anomaly changing the destination atmosphere. Existing celestial, sky, and material systems are intentionally left unchanged. Atmospheric glow remains a possible later artistic feature.

## 2. Root cause of the fixed preview

`PortalPreviewRenderer` owned an isolated Babylon render-target camera that was initialized with a fixed position and target. The slice-transition branch of `GeometryDemoWorld.updatePortalPreview()` deliberately avoided the legacy corridor look-ahead update, so it never replaced that camera pose with one derived from the active viewer. The render target therefore showed a stable view from its original camera, even while the player and tesseract moved.

The preview texture itself was not evidence of optical propagation; it was a remote-slice render target without a live camera correspondence.

## 3. Endpoint-frame camera mapping

`src/world/fields/geometry/anomaly-view-transform.js` provides the engine-independent mapping:

1. Read the active Babylon camera eye, forward direction, and current screen-up axis in render space. The screen-up axis is taken from the camera basis when available, rather than assuming the configured world-up reference is also the camera's current up direction.
2. Convert the eye and forward/up samples into authoritative world coordinates using the viewer slice's `SpatialTransform.renderToWorld()`.
3. Resolve the anomaly endpoint belonging to the viewer slice and the opposite endpoint belonging to the remote slice.
4. Preserve the viewer eye's local offset from its endpoint and transfer the eye/look/up basis components to the matching remote endpoint frame.
5. Project the mapped virtual camera pose through the remote slice's own `SpatialTransform.worldToRender()`.

The result is a remote camera pose whose position, target, and up vector change with viewer translation and camera orientation. The remote camera inherits the active camera's field of view. This mapping is bidirectional and independent of player traversal or optical ray permissions.

The initial `endpoint-frame` mapping deliberately identifies the three local tangent components at one mouth with the corresponding three components at the other mouth. It is a declared 3D endpoint isometry, not a claim that every arbitrary 4D anomaly has a unique natural camera transport law. `view.mapping: 'static'` remains available for anomalies that intentionally retain a fixed preview.

When destination chart projection raises a declared `RangeError`, the helper returns `null` for that frame; unrelated errors propagate normally.

## 4. Aperture geometry and 4D sections

`PortalPreviewRenderer` can render its preview on a circular/elliptical disc or a rectangular plane. Circular and elliptical surfaces are created as a tessellated double-sided disc. Their aperture scale updates together with the torus rim; this also applies to rectangular/plane apertures. Render-target pixel dimensions preserve the aperture's width-to-height ratio, and the target refreshes every frame so viewer motion is not reduced to a periodic still. When the cross-section vanishes, the portal surface and rim are hidden and the render target is removed from the scene's active custom-render-target list.

Each slice-transition anomaly now carries a validated `view` contract:

```js
view: {
  enabled: true,
  mapping: 'endpoint-frame', // or 'static'
  apertureShape: 'circle',   // 'ellipse' or 'rectangle' also supported
  crossSection: 'constant',  // or 'euclidean-4d-ball'
  centerNormalOffset: null // derive from the resolved ambient anomaly centre; a number overrides it
}
```

For the Euclidean 4D spherical profile, the visible 3D slice section radius is computed analytically:

\[
r(d)=\sqrt{R^2-d^2}, \qquad |d|<R
\]

and is zero at or beyond the sphere radius. `d` is the active viewer's offset along the current slice normal relative to the anomaly centre projected onto that slice. A numeric `centerNormalOffset` explicitly overrides that derived value; `null` (the default) derives it from the resolved ambient `anomaly.influence.center`. `R` is the anomaly's configured optical aperture radius (falling back to its entry radius). The portal surface and rim are scaled by `r/R`.

Other anomaly geometries should declare another cross-section profile rather than silently inheriting Euclidean hypersphere mathematics. The current supported non-Euclidean/general fallback is `constant`; custom profiles can be added when their geometry supplies a well-defined slice-intersection function.

## 5. Demo integration

- The direct Hypercube-to-Main-World anomaly declares an endpoint-frame circular view with the Euclidean 4D-ball cross-section.
- Other demo slice-transition mouths use their configured aperture shape and endpoint-frame mapping; their default cross-section remains constant.
- The remote preview camera is updated for whichever endpoint belongs to the currently viewed slice.
- Destination chunk focus follows the mapped remote camera position, and the chunk-streaming direction follows its horizontal look direction (with a stable fallback for a vertical look vector).
- `view.enabled: false` disables the portal surface; `view.mapping: 'static'` leaves the initial remote camera pose unchanged.
- Portal details are included in `GeometryDemoWorld.getDiagnostics()` as `portalViews`, including view config, visibility, aperture scale, camera pose, render-list size, and resolution.

## 6. New and updated modules

- `src/world/fields/geometry/anomaly-view-transform.js` — live endpoint-frame camera pose mapping, camera-basis transport, anomaly-centred Euclidean 4D ball section math, and aperture-scale calculation.
- `src/world/fields/geometry/portal-preview-renderer.js` — aperture surface shapes, live camera-pose updates, aspect-matched render targets, coupled surface/rim scale, and render-target activation.
- `src/world/fields/geometry/spatial-anomaly.js` — validated anomaly `view` configuration.
- `src/demo/geometry-demo-topology.js` — declares the Euclidean 4D view profile for the direct Hypercube/Main-World anomaly.
- `src/demo/geometry-demo-world.js` — binds active camera state to remote previews, aperture scaling, chunk focus, and diagnostics.
- `index.html`, `src/main.js`, and versioned imports — updated to the Phase 16D build identifier.
- `tests/anomaly-view-transform.test.mjs` — camera translation/orientation, reversibility, chart handling, derived/overridden cross-section centre, continuous runtime integration, and view-contract tests.
- `tests/portal-preview-renderer.test.mjs` — render-target aspect ratio, per-frame refresh, aperture scaling, and render-target activation.

## 7. Verification

Command:

```bash
node --test tests/*.test.mjs
```

The Phase 16C baseline recorded 255 passing tests. The Phase 16D continuation workspace had 262 passing tests before this hardening pass. This pass adds camera screen-up orientation, anomaly-centred section derivation/override, and render-target aspect/refresh regression coverage. The current full suite is **267 passed, 0 failed**.

Additional static verification: source JavaScript syntax 124/124; test module syntax 29/29; 311 relative imports checked with zero missing references. Focused tests cover translation/orbit response, camera screen-up orientation, reverse endpoint mapping, differing render scales, finite-chart handling, anomaly-centred cross-section radius, and `GeometryDemoWorld` wiring.

## 8. Explicit limitations

- A live browser/WebGL visual session was not available in the automated environment. Automated coverage verifies the live camera wiring and renderer configuration, but the actual in-game composition, portal clipping, and visual quality still require browser validation.
- The current renderer uses a remote 3D camera rendered into a target and displayed on the aperture surface. It is not a full per-pixel 4D ray-cast camera and does not yet implement a general projective model for arbitrary 4D anomaly geometries.
- The current endpoint-frame strategy pairs local tangent coordinates by component. Anomalies whose mouths require a custom rotation, reflection, lensing law, or other view transform should introduce an explicit mapping strategy rather than altering the default silently.
- The initial Euclidean 4D-ball section uses a slice-normal offset measured from the resolved anomaly influence centre, with an explicit numeric centre offset available for authored profiles. More complex anomaly geometry should define a dedicated section evaluator.
- Arbitrary 4D occluders inside anomaly interiors and physically correct 4D visibility clipping remain future work.
- No anomaly-driven atmospheric glow, destination sky recolouring, sun-ray injection, surface reflection/refraction, or shadow rendering is implemented by this phase.

## 9. Next milestones

- **Phase 16E:** surface interaction and cross-slice direct lighting, including diffuse/specular response, refraction, total internal reflection, and shadow visibility. Optional anomaly-driven atmosphere response may be added as a separate art layer.
- **Phase 16F:** performance profiling, budgets, caching, acceleration, and production backend decisions.
