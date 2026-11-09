# ADR-0009: Render the tesseract as true 3D hyperplane sections

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The previous chamber renderer projected nominal 4D vertices into 3D with a W-dependent perspective scale. This did not show the 3D slice encountered by a camera at a particular W coordinate. A separate vertex-generation defect also caused all sixteen generated corners to coincide because the `Array.from()` callback's element parameter was mistakenly used as its index.

## Decision

Represent the chamber view as the intersection of a rotating tesseract with the camera's current 3D hyperplane `W = viewerW`.

Apply a compound rotation in the XW, YW, and ZW planes. Intersect each original cubical 3D facet with the W hyperplane, construct planar polygons from their edge intersections, deduplicate vertices and edges, and render the resulting closed polyhedral boundary.

Keep the mathematical slicing engine-independent. Babylon is responsible only for the translucent surface mesh, tube edges, vertex markers, and reusable dynamic buffers.

## Consequences

- Moving in ordinary X/Y/Z space changes the camera's viewpoint on the same 3D section.
- Moving along W changes the section geometry itself, including its number of vertices and faces.
- The central section can be an oblique polyhedron rather than a constant cuboid.
- A slice outside the rotated tesseract is empty by definition.
- The old perspective-only projection helper is removed from the active tesseract path.
- The renderer has bounded reusable capacities (32 section vertices and 64 section edges), far above the known section complexity of a tesseract.
- A live browser/WebGL visual pass is still required after automated tests.

## Verification invariants

- 16 unique four-dimensional tesseract vertices and 32 original edges.
- Axis-aligned central section: 8 vertices, 6 quadrilateral faces, 12 edges.
- Default oblique central section: 12 vertices, 8 faces, 18 edges.
- Every edge of a closed section is incident to exactly two faces.
- W movement and 4D rotation change the generated section geometry.
