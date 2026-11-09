# ADR-0014: View-Dependent Rendering Through Anomaly Apertures

- **Status:** Accepted
- **Date:** November 8, 2026
- **Phase:** Geometry Phase 16D

## Context

The previous anomaly preview used a render-target camera with a fixed pose. The camera could render a connected slice, but its view did not follow the observer's changing position and orientation. The result looked like a static image placed inside an anomaly rim, not a window through which the observer was looking.

The anomaly model also supports more than one geometry type. The view renderer must therefore avoid assuming that every anomaly is a Euclidean 4D sphere.

## Decisions

1. **View permission is independent.** Anomaly viewing has its own `view` configuration. It is not inferred from player `traversable`, visibility, or optical-ray permissions.
2. **Endpoint-frame is the initial dynamic mapping.** The viewer eye offset and tangent camera basis are converted to the local coordinates of the active slice, transferred to the matching endpoint basis, and projected with the remote slice's own transform. This mapping is bidirectional.
3. **Static view remains a valid option.** `view.mapping: 'static'` intentionally retains the authored remote camera pose; it is not used for the live demo aperture.
4. **Aperture shape is declared.** Circle, ellipse, and rectangle render surfaces are supported. The render-target texture is presented on that surface rather than displayed as a standalone rectangular preview card.
5. **Cross-section mathematics is opt-in.** `constant` remains the general fallback. `euclidean-4d-ball` uses the analytic 3D slice radius `sqrt(R²-d²)`, where the slice-normal offset is measured from the resolved ambient anomaly centre by default; a numeric `centerNormalOffset` explicitly overrides that derived value. Other anomaly geometries must supply their own section model before claiming a different geometric profile.
6. **Remote chunk streaming follows the mapped view.** Destination focus and horizontal look direction are derived from the virtual remote camera so the preview does not remain centred on a fixed anchor while the observer looks elsewhere.
7. **Rendering remains non-authoritative.** The remote camera and render target are a presentation mechanism. They do not change authoritative player coordinates, anomaly topology, or the Phase 16C CPU optical ray state.
8. **No atmospheric lighting change in this phase.** Anomaly-driven sky glow or destination recolouring is deferred as an optional art feature. Direct-light transport and surface interaction are a separate later milestone.

## Consequences

- The preview changes when the viewer translates, orbits, or changes camera orientation.
- The same endpoint correspondence works when viewing from either side of the connection.
- Different slice transforms and render scales are respected during mapping.
- The first demo Euclidean-4D mouth can change its visible section size as the observer moves along the slice normal, measured relative to the resolved anomaly centre.
- The design can later accommodate anomaly-specific camera mappings and cross-section evaluators without changing player traversal or optical transport.

## Known limitations

- The current endpoint-frame rule pairs local tangent coordinates by component; anomalies that need custom frame rotation, reflection, lensing, or another projection require an explicit future strategy.
- The current remote-camera portal is not a full per-pixel 4D ray-cast camera and does not provide arbitrary 4D occlusion clipping.
- A live browser/WebGL visual inspection is still required to validate aperture clipping and final composition.
