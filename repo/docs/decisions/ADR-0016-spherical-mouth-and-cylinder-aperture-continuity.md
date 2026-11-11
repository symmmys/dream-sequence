# ADR-0016: Spherical Anomaly Mouth and Tapered-Cylinder Aperture Continuity

- **Status:** Accepted
- **Date:** November 9, 2026
- **Phase:** Geometry Phase 17G

## Context

Phase 17E introduced a tapered 4D cylinder whose 3D W-slice is a sphere with an interpolated radius. Phase 17F then added an additional portal-preview aperture scale curve during destination approach. Those two effects both influenced the apparent mouth size and could produce an abrupt/reversing change when traversal progress was cleared or the active slice changed at the destination endpoint.

The demo also used a flat circular render-target surface and retained a decorative torus rim from an older portal-mouth representation. The user requested a three-dimensional spherical opening while retaining the flat preview as an option.

## Decisions

1. **One size authority for tapered cylinders.** When `view.interiorBoundary === 'open-4d-cylinder'`, `calculateAnomalyApertureScale()` returns 1 in both travel directions, during transit, and after handoff. The live `AnomalyBoundaryRenderer` cylinder cross-section is the sole changing diameter signal. The destination approach remains a camera-pose transport effect.
2. **Keep legacy 4D ball sizing for other anomalies.** The analytic `sqrt(R²-d²)` aperture section remains active when the anomaly does not use the tapered-cylinder boundary. This avoids changing unrelated anomaly types.
3. **Preview surface is a separate configurable choice.** `previewSurface: 'flat'` preserves the existing flat surface and remains the default. `previewSurface: 'spherical'` deforms a Disc into a concave spherical cap for circle/ellipse apertures. Rectangular spherical previews are rejected rather than approximated silently.
4. **Preserve image projection.** The spherical-cap deformation changes vertex positions and recomputes normals/bounds while retaining the render-target UV coordinates. The destination view remains an image from the transported remote camera; it is not a full per-pixel 4D ray-cast view.
5. **Legacy rim is opt-in.** `showRim` defaults to false. The old portal torus is created only for anomalies explicitly requesting `showRim: true`. Generic torus props elsewhere in the demo are unrelated.
6. **No physical geometry changes.** Canonical anomaly endpoints, region bounds, traversal, optical connectivity, and destination-world geometry remain unchanged.

## Consequences

- A tapered-cylinder mouth cannot acquire a second, transit-progress-dependent scale curve that snaps or reverses at the endpoint handoff.
- The 3D cylinder cross-section can expand continuously toward the destination while the transported remote camera separately approaches its endpoint.
- The direct Hypercube-to-Main-World demo uses a concave spherical preview mouth; other anomalies can retain the flat surface.
- The decorative torus ring is absent unless explicitly enabled.

## Known limitations

- The spherical preview is a concave cap, not a complete sphere, refractive lens, or physically modelled 3D portal volume.
- Spherical preview geometry supports circular and elliptical apertures only.
- The current tapered cylinder renderer requires a W-aligned axis.
- Nonlinear slice transforms can distort the displayed cap; this follows the slice renderer's existing presentation mapping and requires visual inspection.
- No live browser/WebGL validation was available for this change. Texture appearance, transparency ordering, depth composition, and perceived handoff continuity remain manual validation items.
