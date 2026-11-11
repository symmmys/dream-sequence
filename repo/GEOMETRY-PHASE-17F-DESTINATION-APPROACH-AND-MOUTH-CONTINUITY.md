# Geometry Phase 17F — Destination Approach and Exit-Mouth Continuity

**Status:** Implemented; automated regression suite passes.  
**Build:** `somnium-20261109-phase17f-destination-approach-1`  
**Baseline:** Phase 17E tapered 4D cylinder anomaly boundaries.

## Objective

Make the remote world appear to approach as a player traverses a tapered 4D cylinder anomaly, and remove the visible exit-mouth compression at the destination slice. The change is strictly presentational: canonical anomaly endpoints, 4D region bounds, traversal progress, collisions, optical topology, and destination-world geometry remain unchanged.

## 1. Exit-mouth continuity

The direct Hypercube → Main World anomaly has a tapered boundary radius from 2.8 at the Hypercube end to 7.0 at the Main World end. Phase 17E already computes that cylinder cross-section smoothly. However, the portal preview also applied the older `euclidean-4d-ball` aperture rule, which contracts again near the far endpoint because it measures distance from the anomaly's midpoint. That second aperture law conflicted with the tapered-cylinder mouth and caused the preview aperture to compress at handoff.

For `interiorBoundary: 'open-4d-cylinder'`, the portal now uses the cylinder's own endpoint radii. During transit, its visible destination aperture grows from the narrow-to-wide radius ratio to full scale:

```text
narrowRatio = min(sourceRadius, destinationRadius) / max(sourceRadius, destinationRadius)
eased = smootherstep(transitProgress)
apertureScale = narrowRatio + (1 - narrowRatio) * eased
```

For the direct demo anomaly this is 0.4 at transit start, 0.7 halfway through, and 1.0 at the destination mouth. The same approach curve works in reverse. Outside active transit, the local mouth is displayed at full size. This prevents the legacy 4D-ball shrink calculation from reducing a cylinder mouth at either endpoint.

The boundary renderer continues to use the Phase 17E cylinder cross-section radius. The direct route retains its 2.8 → 7.0 geometry profile; the physical radius and canonical endpoint coordinates are not edited by the view code.

## 2. Destination perspective approach

`mapAnomalyCameraPose()` accepts an optional normalized `approachProgress`:

- At progress 0, the existing endpoint-frame camera mapping is unchanged.
- As progress increases, the remote virtual camera's tangent/forward offset from the destination endpoint is progressively reduced using quintic smootherstep.
- The camera's screen-up offset is preserved. This maintains camera clearance above remote terrain rather than collapsing the virtual eye onto the terrain endpoint.
- At progress 1, the virtual eye is at the destination endpoint plus its preserved screen-up clearance.
- Camera direction and remote target distance remain continuous; the remote slice's own `SpatialTransform` still performs the final render projection.

This gives the destination a changing perspective/parallax as the player advances, while leaving the actual remote world stationary. It is a portal-view transport approximation, not a physical camera moving through W or a change to the optical ray solver.

## 3. Runtime integration and diagnostics

`GeometryDemoWorld.updatePortalPreview()` now resolves the active player/free-camera slice-transition transit before updating portal pairs. Approach progress is applied only to the matching anomaly and only when the portal's remote slice is the transit target. This prevents unrelated portal previews from inheriting another anomaly's progress.

`scene`/world diagnostics expose `destinationApproach` with anomaly ID, progress, camera convergence, remote local eye position, and aperture scale while a matching transit is active.

## 4. Verification

New focused regression coverage verifies:

- endpoint-frame mapping is unchanged at approach progress 0;
- remote virtual eye converges to the destination endpoint at progress 1;
- screen-up clearance is preserved throughout the approach;
- tapered-cylinder aperture scaling is monotonic, reaches 1 at the exit, and remains 1 after handoff;
- reverse traversal uses the same smooth approach curve;
- `GeometryDemoWorld` passes progress only to the active matching portal pair and records diagnostics;
- legacy 4D spherical apertures continue using their prior cross-section law.

Full automated suite: **308 passed, 0 failed**.  
Source/test syntax: **158 checks passed**.  
Static relative imports: **329 checked, 0 missing**.  
Old Phase 17E browser cache token: **0 occurrences** in `index.html`, `src`, and `tests`.

No live browser/WebGL session was available. The actual perceived approach, Poincare projection composition, exit handoff comfort, and transparency ordering still require in-browser validation.

## 5. Planning estimate

The implementation was planned using a small WBS and three-point PERT estimates, following `docs/IMPLEMENTATION-PLANNING.md`:

| Work package | O | M | P | PERT |
|---|---:|---:|---:|---:|
| Cylinder mouth continuity | 5 min | 8 min | 15 min | 9 min |
| Remote camera approach mapping | 8 min | 14 min | 25 min | 15 min |
| Transit integration and diagnostics | 6 min | 10 min | 20 min | 11 min |
| Tests, documentation and packaging | 10 min | 16 min | 28 min | 17 min |
| **Total** | **29 min** | **48 min** | **88 min** | **52 min** |

Historical phase artifact intervals are not treated as active coding-time measurements; they are only rough reference points. The estimate reflects uncertainty around camera mapping and slice-transform integration.

## Next visual refinement

The next browser-driven refinement should inspect whether the remote scene's parallax and aperture growth read as a destination physically approaching down the tube. If the image still feels like a flat texture expanding at the mouth, a dedicated in-tube destination-aperture surface may be needed as a separate render-only element. That should not be conflated with physical anomaly geometry.
