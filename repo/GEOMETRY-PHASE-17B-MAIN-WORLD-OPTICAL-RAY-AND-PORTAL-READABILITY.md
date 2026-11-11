# Geometry Phase 17B — Main-World Optical Exit Ray and Anomaly Portal Readability

**Status:** Implemented; automated regression suite passed in batches.  
**Date:** November 9, 2026  
**Baseline:** Phase 17A anomaly-fed spotlight prototype and startup hotfix.

## 1. Objective

Address two user-observed issues in the Phase 17A prototype:

1. The spotlight aim ray was visible in the Hypercube chamber, but no receiving-side ray was visible after the optical anomaly handoff.
2. The Main World-side anomaly preview portals were too small and too close together to locate comfortably.

The changes are presentational and prototype-level. They do not move the authoritative 4D anomaly endpoints, change optical topology, or change player traversal permissions.

## 2. Receiving-side ray visibility

The optical tracer already returned a successful `anomaly-exit` transition and a destination-slice exit state. The Phase 17A visualization created the receiving Babylon spotlight but did not create a corresponding Main World diagnostic ray mesh. A created mesh also needs to be included in a portal render target's explicit render list; merely adding it to the Babylon scene is insufficient for the isolated portal preview camera.

Phase 17B adds:

- `projectOpticalSpotlightExitRay()` in `optical-light-source.js`, which projects the authoritative destination exit point and a short destination tangent segment through the destination `SpatialTransform`.
- A `destinationSpotlightRayLine` in `GeometryDemoWorld`, restricted to `MAIN_WORLD_LAYER` and tagged with source/destination/anomaly metadata.
- `getDestinationPreviewRenderList()`, which appends the visible optical ray to the destination mesh list supplied to both Main World portal previews. The ray is removed from those lists automatically when hidden or when transmission fails.
- A guarded diagnostic projection: if only the far end of the debug segment falls outside a finite destination chart, the debug line is hidden rather than aborting the demo update. Unexpected errors still propagate.

The diagnostic line is a straight local-tangent visualization of the outgoing ray, projected at both endpoints. It is not a full curved geodesic reconstruction or a volumetric beam. The receiving Babylon spotlight continues to be positioned and directed from the actual destination optical exit and transformed direction.

## 3. Launch geometry above Main World terrain

A test using the production-style Main World Poincare transform showed that the previous default launch direction emerged below the destination terrain surface. The default source was therefore moved to `mouth.y - 0.75` and aimed at the aperture centre, with a 0.5-unit virtual-emitter offset. This produces a shallow upward outgoing ray in the live demo fixture so the receiving-side line/light is not immediately hidden underground.

This is a demo-source default, not a change to the anomaly interface law. Users can still reposition and rotate the source with the existing editor controls.

## 4. Main World portal readability

`getMainWorldAnomalyPortalLayout()` now places the two Main World-side preview apertures symmetrically around the sampled Main World anchor:

- Main corridor preview: `anchor.x - 260`.
- Hypercube-to-Main-World preview: `anchor.x + 260`.
- Centre-to-centre spacing: 520 world units.
- Preview surface size: 72 × 72 world units.
- Rim diameter: 80 world units; rim thickness: 1.6.

These values affect the display portals only. The topology's source/destination positions, W values, aperture radii, anomaly region and optical permissions remain authoritative and unchanged.

## 5. Regression coverage

New/updated tests cover:

- Default spotlight crossing with a shallow upward destination exit above the terrain plane.
- Projection of a transmitted destination ray through a spatial transform.
- Creation/update of the receiving ray mesh on the Main World layer.
- Inclusion of that visible mesh in both destination portal preview render lists, without duplicates; hidden rays are excluded.
- Main World preview dimensions and spacing, with the input anchor unchanged.
- Finite-anchor validation for the portal layout.

Existing topology tests continue to validate the direct +5-W Hypercube-to-Main-World anomaly, and all prior movement/geometry/optics tests were retained.

## 6. Known limitations

- The diagnostic ray is a straight segment in the destination slice's local tangent approximation; a future milestone can use the slice tracer to draw a fully integrated curved path.
- The receiving spotlight remains a Babylon-side approximation. General multi-ray beam reconstruction, full 4D surface shadow transport and point-light cubemap shadows remain future work.
- Automated tests validate transport, transformations, render-list ownership and state. No live browser/WebGL visual inspection was available during this delivery; the final appearance still needs user browser verification.

## 7. Build

Build identifier: `somnium-20261109-phase17b-mainworld-exit-1`  
Application identifier: `2026-11-09-phase17b-mainworld-exit-1`
