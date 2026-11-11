# Somnium — Geometry Phase 17H: Complete Destination Sphere and Inner-Mouth Growth

**Status:** Implemented; automated regression suite passes.
**Build:** `somnium-20261109-phase17h-complete-sphere-inner-mouth-1`
**Baseline:** Phase 17G — Spherical Mouth and Stable Cylinder Aperture

## 1. Objective

Make the destination-world mouth read as a genuine three-dimensional sphere inside the tapered 4D anomaly tube. At the beginning of traversal the remote mouth should be a small sphere near the centre of the visible tube cross-section. As the observer advances, the sphere should subtend a progressively larger angle and grow faster than the tube's own cross-section.

The work is deliberately limited to the visual destination surface and its progression. It does not change canonical anomaly endpoints, W-slice traversal, optical topology, the physical cylinder field, or level-builder functionality.

## 2. Complete sphere geometry

`src/world/fields/geometry/portal-preview-renderer.js` now creates a Babylon `MeshBuilder.CreateSphere` mesh for `previewSurface: 'spherical'` instead of deforming a disc into a shallow spherical cap.

- The destination render-target image is projected using local XY / front-orthographic UVs. This retains a camera-like destination image rather than treating the render target as an equirectangular planet texture.
- The actual mesh is a closed sphere with front and rear hemispheres, so it has full three-dimensional depth and can be viewed from either side.
- Sphere depth scales together with its lateral dimensions.
- The flat circular/elliptical disc remains available with `previewSurface: 'flat'`.
- The legacy `applySphericalCapGeometry()` helper remains exported for compatibility but is not used by the new spherical preview path.

The renderer's aperture-scale limit now allows the destination sphere to grow beyond the entry mouth's authored size. The default maximum multiplier is 4, sufficient for the current demo's largest radius ratio (7.0 / 2.8 = 2.5).

## 3. Inner-sphere growth independent of the outer tube

The tapered cylinder remains the authoritative outer boundary. The destination sphere has its own view configuration:

```js
{
    destinationSphereStartScale: 0.08,
    destinationSphereGrowthExponent: 0.55
}
```

For a traversal direction, let `R0` be the tube radius at the viewer's entry mouth, `R1` the radius at the far mouth, `p` the normalized traversal progress, and `s(p)` the quintic smootherstep function.

The calculation is:

```text
outerRadius(p) = lerp(R0, R1, s(p))
innerStart     = R0 * destinationSphereStartScale
innerCandidate = lerp(innerStart, R1, s(p)^destinationSphereGrowthExponent)
innerRadius(p) = min(outerRadius(p), innerCandidate)
meshScale(p)    = innerRadius(p) / R0
```

An exponent below 1 makes the inner sphere's growth front-loaded relative to the outer tube's smootherstep expansion. The `min` keeps the destination sphere inside the currently available tube cross-section. At the far mouth, the inner sphere exactly meets the local tube radius.

The calculation swaps `R0` and `R1` when traversing in the opposite direction. It therefore describes the same physical relationship from either endpoint; it does not reverse because ambient W increased or decreased. Since the portal mesh scale is relative to the entry mouth, the final numeric scale is the physical radius ratio and need not equal 1. For the direct Hypercube → Main World anomaly:

| Traversal | Entry radius | Far radius | Start mesh scale | Far-mouth mesh scale |
|---|---:|---:|---:|---:|
| Hypercube → Main World | 2.8 | 7.0 | 0.08 | 2.5 |
| Main World → Hypercube | 7.0 | 2.8 | 0.08 | 0.4 |

Both cases finish with the sphere's physical radius matching the local tube radius. With no active transit, the renderer retains its authored baseline presentation scale; the growth curve is applied during an active traversal.

## 4. Integration changes

- `GeometryDemoWorld.updatePortalPreview()` explicitly passes whether the viewer is at the anomaly's source endpoint. This avoids inferring traversal orientation from incidental camera state.
- `createAnomalyViewConfig()` validates the two destination-sphere growth parameters.
- `PortalPreviewRenderer.setApertureScale()` supports multipliers greater than 1 and scales sphere depth as well as width and height.
- Flat cylinder previews do not receive the inner-sphere growth animation.

## 5. Compatibility and non-goals

- `previewSurface: 'flat'` is unchanged.
- Non-cylinder spherical-aperture behavior continues using the existing Euclidean 4D ball cross-section calculation.
- The outer tapered-cylinder boundary remains independent and authoritative.
- No changes are made to anomaly traversal, canonical coordinates, W-slice activation, or the Phase 17G Main World re-entry behavior.
- The level builder is not modified; user-authored anomaly creation remains a planned follow-up.

## 6. Verification

See `GEOMETRY-PHASE-17H-TEST-RESULTS.txt`.

Focused regressions cover:

- A complete sphere mesh is created for spherical previews, with both positive and negative local-Z hemispheres.
- The destination image's front-orthographic UV projection is retained.
- Sphere depth and lateral dimensions scale together.
- The inner sphere grows monotonically and faster than the outer tube from the 2.8-unit entrance toward the 7-unit exit.
- Reverse traversal uses swapped endpoint radii and reaches the 2.8-unit local mouth without changing the physical rule.
- Flat previews remain planar and do not receive this growth curve.

Automated tests and static checks do not replace live browser/WebGL inspection. The appearance of the full sphere, UV distortion from oblique viewing angles, portal depth ordering, and apparent angular growth still need user validation in the running browser.

## 7. Future work

The next planned feature is anomaly creation and configuration in the level builder, so multiple anomaly shapes, endpoints, radii, and preview settings can be authored and inspected without editing demo topology source. The separate Main World mouth / W-slice alignment issue reported after Phase 17G is not changed in this phase.
