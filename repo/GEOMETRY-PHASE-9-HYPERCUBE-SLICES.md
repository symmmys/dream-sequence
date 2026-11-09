# Geometry Phase 9 — true 3D slices of the rotating tesseract

Build: `2026-11-08-hypercube-slice-cross-section-1`

## Summary

The Phase 8 tesseract did not render a 3D cross-section. It projected every nominal 4D corner into 3D using a W-dependent perspective scale. A source audit also found that `createHypercubeVertices()` treated the first `Array.from()` callback parameter (the element value) as the bit mask. Since the source array contains `undefined` elements, all 16 generated corners had identical negative coordinates. Existing tests checked only the array length, so this escaped detection.

Phase 9 corrects the vertex generator and replaces the projection-only renderer with a geometric hyperplane slicer.

## Mathematical model

The tesseract is defined by its 16 vertices in \(\mathbb R^4\), with each coordinate equal to \(\pm h\). The renderer applies a compound orthogonal rotation in three W-containing planes:

\[
R(t)=R_{ZW}(\theta_{zw})R_{YW}(\theta_{yw})R_{XW}(\theta_{xw})
\]

The three individual plane rotations are necessary because a single XW rotation through a central W=0 slice leaves a cuboid-like cross-section. The compound orientation produces a more general oblique section. These are plane rotations; 4D does not have a single unique analogue of a 3D axis of rotation.

The camera's fourth coordinate defines the actual 3D section:

\[
\Sigma_w = R(t)([-h,h]^4) \cap \{(x,y,z,w):w=w_{camera}\}
\]

The intersection vertices occur where the W hyperplane crosses tesseract edges. For an edge with endpoint coordinates \(w_0,w_1\), its interpolation parameter is:

\[
\tau=\frac{w_0-w_{camera}}{w_0-w_1}
\]

Each of the tesseract's eight cubical 3D facets is intersected with that hyperplane. The resulting planar polygons are sorted in their face planes, deduplicated, and assembled into the boundary of the 3D section. This produces actual section faces and edges, not a perspective image of the full 4D object.

## Rendering

`Hypercube4DRenderer` owns:

- One dynamically updated translucent surface mesh for the 3D section.
- One dynamically updated tube mesh for all section edges.
- A reusable pool of 32 small vertex markers; only the current section's vertices are visible.
- Separate surface and emissive edge materials.

Vertex and normal buffers are fixed-capacity and updated in place. Index buffers change when the section topology changes. The renderer reports current W, section vertex/face/edge counts, rotation angles, and visible mesh count through `getInfo()` and the Geometry Demo diagnostics.

The HUD adds a live readout such as `W 0.00 · 12 VERTICES · 8 FACES`, allowing E/Q movement to be correlated with actual geometric changes.

## Controls

- `C`: toggle free camera (the default follow camera remains unchanged).
- Free-camera `W/S`, `A/D`, `R/F`: move through the chamber's three ordinary spatial dimensions.
- Free-camera `E/Q`: move the W hyperplane through the tesseract and reveal different 3D sections.
- Mouse drag: inspect the current section from different directions.
- Mouse wheel: adjust free-camera speed.
- `G`: toggle the 3D slice debug grid.

The chamber's local W inspection bounds are narrowed to `[-8.5, 8.5]`, covering the rotated tesseract's full extent without encouraging long travel through empty fourth-dimensional space.

## Verification

- Full Node test suite: **125/125 passed**.
- JavaScript source syntax: **113/113 passed**.
- Test syntax: **16/16 passed**.
- Relative module imports: **165/165 resolved**.
- The central axis-aligned W=0 slice is a cube: 8 vertices, 6 quadrilateral faces, 12 edges.
- The default oblique central slice is a closed polyhedron: 12 vertices, 8 faces, 18 edges; each boundary edge belongs to exactly two faces.
- Moving the W plane to 5 changes the section to 6 vertices, 5 faces, and 9 edges for the initial oblique orientation. At W=9 the section is empty.
- Renderer tests verify buffer updates, topology changes, marker visibility, and disposal of all owned meshes/materials.

These are automated mathematical, structural, and Babylon-stub tests. They do not substitute for live browser/WebGL inspection; no successful browser visual capture was obtained in this pass.

## Changed files

- `src/world/fields/geometry/hypercube-4d.js` — distinct 16-corner generation, compound 4D rotation, exact facet/plane intersections, polygon ordering, deduplication, and indexed polyhedron topology.
- `src/demo/hypercube-4d-renderer.js` — 3D cross-section surfaces, edges, dynamic vertex markers, reusable GPU buffers, and slice diagnostics.
- `src/demo/geometry-demo-world.js` — compound rotation configuration, bounded W inspection range, live slice HUD reporting.
- `src/ui/main-menu.js` — W/vertex/face readout in the geometry HUD.
- `src/scene/create-scene.js`, `src/main.js`, `index.html`, `src/demo/geometry-demo-camera-controller.js` — updated label and shared cache/build identifier.
- `tests/hypercube-4d-renderer.test.mjs`, `tests/world-manager-visibility.test.mjs` — vertex uniqueness, exact 3D slices, manifold closure, renderer lifecycle, and cache chain regression coverage.

## Style and architecture notes

The math stays engine-independent. Babylon owns only buffers, materials, and marker lifecycle. Slice intersection is foundational computation and is deliberately explicit; scene orchestration remains short. Fixed-capacity buffers avoid replacing meshes as the section changes. The previous perspective-only helper was removed from the active geometry module so the demo cannot silently regress to W-dependent scaling in place of slicing.
