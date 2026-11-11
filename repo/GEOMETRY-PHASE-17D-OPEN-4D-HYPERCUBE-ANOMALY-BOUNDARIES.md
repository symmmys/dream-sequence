# Geometry Phase 17D — Open 4D Hypercube Anomaly Boundaries

**Status:** Implemented; automated regression suite passes.  
**Build:** `somnium-20261109-phase17d-open-hypercube-boundaries-1`  
**Baseline:** Phase 17C Main World re-entry and spotlight editor.

## Objective

Make the interior of the demo's slice-transition anomalies perceptible as a constrained passage, while keeping the authoritative 4D anomaly region and traversal logic unchanged. Also make the Phase 17C spotlight editor and test-ray toggles directly discoverable and clickable from the geometry HUD.

## Geometry model

A 4D hypercube (tesseract) has eight cubic three-dimensional boundary cells. For an open-ended passage, omit the two opposite cells whose normals lie along the slice-normal/W direction. The remaining six cells are the side boundary.

A current three-dimensional W-aligned slice intersects each of those six cubic side cells in a two-dimensional panel. The renderer therefore displays six gridded translucent wall panels (the 3D slice of the six 3D side cells), not six solid 3D cubes. The entrance and exit remain open because the two W-facing end caps are omitted.

The first implementation uses the existing axis-aligned 4D anomaly `region` bounds. Where the four region extents differ, the cross-sections are rectangular rather than mathematically congruent squares; no authoritative region dimensions are changed to force a regular tesseract. This is a visual boundary representation of the existing corridor region, not a new physical volume or collision surface.

## Implementation

### Anomaly view contract

`createAnomalyViewConfig()` now validates `interiorBoundary`:

- `none` (default; preserves existing behavior for other anomalies)
- `open-4d-hypercube` (render six side-cell intersections, omit two W end caps)

All three demo slice-transition anomalies opt into `open-4d-hypercube`.

### Boundary renderer

New module: `src/world/fields/geometry/anomaly-boundary-renderer.js`.

Responsibilities:

- Construct six independently identified side panels from the authoritative four-dimensional AABB.
- Intersect those side cells with a requested W-aligned slice using `ambientToSlice()`.
- Convert slice-local panel vertices through the slice's own `SpatialTransform.worldToRender()`.
- Apply the same presentation-endpoint offset used by the portal rendering system, without modifying canonical anomaly endpoints.
- Render translucent surfaces plus brighter grid/edge lines.
- Update the active slice W coordinate, hide panels outside the anomaly W span, report unsupported non-W-aligned frames, and dispose Babylon resources cleanly.

The initial renderer deliberately supports W-aligned slice frames. A rotated or curved anomaly frame is reported as unsupported instead of silently drawing an incorrect boundary. Future anomaly types can provide their own boundary strategy through the `interiorBoundary` view contract.

### Runtime and portal integration

`GeometryDemoWorld` creates one boundary renderer per anomaly endpoint slice. The current view slice uses the live ambient player/camera W coordinate while inside the region; remote portal previews use the corresponding endpoint W. Boundary meshes are registered in the correct slice layer and added to the matching portal preview render lists.

The boundary meshes are presentation-only: they do not alter movement, W freedom, chunk reachability, optical permissions, ray transport, or collision.

### Spotlight HUD controls

The geometry HUD now contains two clickable buttons, with matching keyboard shortcuts:

- `EDIT LIGHT (L)` / `STOP EDITING LIGHT (L)` toggles spotlight editing.
- `TEST RAY: ON (P)` / `TEST RAY: OFF (P)` toggles the test source and its optical diagnostic ray.

Button labels and `aria-pressed` state remain synchronized when the user clicks the buttons or uses the keyboard shortcuts. The spotlight editing help panel appears while editing is enabled. The controls are wired to the existing `GeometryDemoWorld` state methods and do not duplicate light state in the UI.

## Workload estimate and actual scope

Planning used the repository's workload-estimation standard in `docs/IMPLEMENTATION-PLANNING.md`: work breakdown, optimistic/most-likely/pessimistic estimates, PERT expected duration, and cautious comparison with previous artifact timestamps.

| Work package | O | M | P | PERT |
|---|---:|---:|---:|---:|
| HUD controls | 4 min | 8 min | 14 min | 8 min |
| Boundary configuration and geometry | 12 min | 20 min | 36 min | 21 min |
| Babylon rendering and portal integration | 18 min | 30 min | 55 min | 32 min |
| Regression, documentation and packaging | 15 min | 24 min | 45 min | 26 min |
| **Total** | **49 min** | **82 min** | **150 min** | **88 min** |

The PERT estimate is approximately 88 minutes. Previous archive-to-archive intervals were used only as rough context, not interpreted as active coding time.

## Verification

- Six-side panel topology and omission of both W end caps.
- Geometry sampling at different W offsets and out-of-span clipping.
- Display endpoint rebasing with canonical endpoints unchanged.
- Safe diagnostic behavior for non-W-aligned frames.
- Babylon renderer visibility, buffer update, line update and disposal lifecycle.
- Configuration validation and all three demo anomaly opt-ins.
- HUD markup, clickable callback wiring, keyboard/button state synchronization, and help-panel visibility.
- Full regression suite: **299 passed, 0 failed**.
- Browser/WebGL appearance has not been independently verified in a live browser session; visual confirmation is still required.

## Next logical milestone

The next separate traversal-visualization step is the user's first requirement: show the destination side getting perceptibly closer while moving through an anomaly. The current Phase 17D walls provide spatial context for that work, but do not yet implement destination approach animation, perspective compression, or physically based 4D occlusion.
