# Geometry Phase 17E — Tapered 4D Cylinder Anomaly Boundaries

**Status:** Implemented; automated regression suite passes.  
**Build:** `somnium-20261109-phase17e-tapered-4d-cylinder-1`  
**Baseline:** Phase 17D open 4D hypercube anomaly boundaries.

## Objective

Replace the demo's static six-panel open-hypercube boundary presentation with an open-ended, tapered 4D cylinder. Its 3D cross-section must change continuously as the observer moves along ambient W, making progress through an anomaly visually perceptible. The authoritative anomaly region, endpoint coordinates, traversal, collision, chunk reachability, optical topology, and ray transport remain unchanged.

## Geometry model

The new boundary is a 4D tube whose longitudinal axis is aligned with ambient W. Its transverse cross-section is a 3D ball. The side boundary of that ball, sampled at a constant-W 3D world slice, is a 2-sphere. Consequently, each active 3D slice renders a spherical wall surface surrounding the observer. The two W-facing 3D end caps are omitted, leaving the tube open at both anomaly endpoints.

Let the anomaly's ambient source and destination endpoint W coordinates be `w_s` and `w_d`, and let the observer's ambient coordinate be `w`. Define clamped progress:

```text
t = clamp((w - w_s) / (w_d - w_s), 0, 1)
```

A quintic smootherstep provides a gentle start and finish:

```text
s(t) = 6t^5 - 15t^4 + 10t^3
r(w) = r_source + (r_destination - r_source) * s(t)
```

The visible slice surface is sampled as:

```text
(x - c_x)^2 + (y - c_y)^2 + (z - c_z)^2 = r(w)^2
```

The source/destination radii are properties of the anomaly's **view presentation**, not its optical aperture or physical traversal radius. Reverse traversal naturally encounters the same taper in reverse because progress is resolved from the declared endpoint coordinates rather than assuming increasing W.

## Demo configurations

All three demo slice-transition anomalies now select `interiorBoundary: 'open-4d-cylinder'` and specify independent endpoint radii:

| Anomaly | Source radius | Destination radius |
|---|---:|---:|
| Poincare room → Main World | 4.0 | 7.0 |
| Hypercube chamber → Poincare room | 3.4 | 4.8 |
| Hypercube chamber → Main World | 2.8 | 7.0 |

For the direct Hypercube → Main World route, the Hypercube/4D-preview end is narrow (2.8) and the Main World end is wider (7.0). The radius changes smoothly across the five-unit W transition. Endpoint values are clamped through the region's padded approach span, so the wall is already present near either portal mouth.

## Implementation

### Anomaly view contract

`createAnomalyViewConfig()` now accepts:

- `none` — no interior boundary;
- `open-4d-hypercube` — legacy six-panel implementation, retained for compatibility;
- `open-4d-cylinder` — new tapered tube boundary.

The cylinder requires `interiorBoundaryRadii: { source, destination }`. Values must be positive, finite, and no greater than 1000. This avoids silently selecting visually arbitrary dimensions.

### Boundary renderer

`src/world/fields/geometry/anomaly-boundary-renderer.js` now provides `buildAnomalyCylinderGeometry()` and `resolveAnomalyCylinderRadius()` alongside the legacy hypercube builder.

- Samples a UV sphere at the current ambient W coordinate.
- Interpolates the ambient endpoint centreline and endpoint radius.
- Uses smootherstep interpolation for the taper.
- Converts each 4D sample through `ambientToSlice()` and the slice's own `SpatialTransform.worldToRender()`.
- Applies presentation endpoint offsets without modifying canonical anomaly endpoint coordinates.
- Builds an indexed translucent surface plus latitude/longitude edge lines.
- Reuses and updates the existing Babylon mesh and line system; resources are disposed through the existing renderer lifecycle.
- Reports boundary type, support/termination reason, current W, progress, and cross-section radius through `getInfo()`.

The current implementation intentionally requires a W-aligned 3D slice and a tube axis parallel to ambient W. Unsupported rotated slice frames, zero W span, or oblique endpoint axes return an explicit unsupported result rather than drawing a misleading sphere. A future generalized strategy can intersect the tube with arbitrary hyperplanes and handle oblique/curved anomaly axes.

### Runtime integration

`GeometryDemoWorld` resolves both anomaly endpoints through their registered slice frames and passes their ambient R4 coordinates into each renderer. The renderer updates from the live player/free-camera ambient W while the observer is inside the anomaly. Remote portal previews retain the cross-section at the corresponding endpoint W. The existing per-slice layer masks, portal render lists, and presentation endpoint offsets are retained.

All physical anomaly data remains unchanged: the new radii do not replace `entryRadius`, optical `apertureRadius`, anomaly `region`, endpoint positions, or traversal settings. Boundary surfaces remain presentation-only and do not participate in collisions or optical intersections.

## Verification

- Tapered radius equals the configured source and destination values at both endpoints.
- Midpoint radius follows the quintic interpolation and changes monotonically between endpoints.
- Reversed W direction produces the same endpoint mapping in reverse.
- Radius remains clamped outside the endpoint interval while the slice remains within the anomaly's padded W region.
- Sphere topology, line grid, vertex count, and triangle count are deterministic.
- Presentation offsets move the displayed boundary without modifying canonical endpoint data.
- Non-W-aligned slice frames and oblique tube axes are explicitly rejected.
- Babylon mesh/line update, visibility, diagnostics, and disposal lifecycle remain covered.
- All three demo anomalies opt into the tapered cylinder and the direct Hypercube → Main World link has the larger Main World radius.
- Full automated suite: **305 passed, 0 failed**.
- Source/test syntax: **158 modules passed**.
- Relative imports: **322 checked, 0 missing**.
- Runtime ESM smoke import of `anomaly-boundary-renderer` and `geometry-demo-world`: passed.
- Application cache-busting build identifier is consistent across the entry chain.

No live browser/WebGL session was available. Transparency sorting, the perceived spherical-wall appearance, portal composition, and comfort during actual traversal still require in-browser inspection.

## Next logical milestone

With the anomaly's surrounding surface changing continuously along W, the next traversal-visualization task can make the destination portal appear to approach and grow as the observer moves toward the far endpoint. This should remain a separate view-transport/perspective task; it must not be simulated by changing the physical endpoint coordinates or by moving the remote world itself.
