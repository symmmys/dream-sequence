# ADR-0007: Hypercube Chamber and Multi-Corridor Demo Network

- Status: Accepted
- Date: 2026-11-08

## Context

The Geometry Demo previously started in the Poincare test chamber and represented one active corridor at a time. A 4D geometry test chamber needs its own world slice, its own test geometry, and a connection to the existing Poincare chamber. The Poincare chamber must remain connected to the live main world.

## Decision

Create a Euclidean slice `geometry-demo-4d-chamber` at `w = 140`. Render a tesseract consisting of 16 vertices and 32 edges. Rotate its 4D vertices in the XW plane and project them to the chamber's 3D view. Keep the tesseract's mathematical topology and projection independent of Babylon.js; the demo renderer owns only its derived line mesh and material.

Register a second traversable, bidirectional `SpatialCorridor` with its own `CorridorChunk`. The demo graph now contains the route:

`4D Hypercube Chamber -> 4D Corridor Chunk -> Poincare Chamber -> Main-World Corridor Chunk -> Somnium Main World`.

Compose the existing single-corridor traversal controllers using `CorridorTraversalNetwork`. The network selects traversal routes from explicit topology neighbours and synchronizes the active slice across controllers. It does not infer adjacency from fourth-coordinate distance.

The Geometry Demo menu option starts in the 4D chamber with the independent free camera. `E/Q` changes the viewer's W coordinate within the chamber's explicit bounds; `W/S`, `A/D`, and `R/F` control the three ordinary spatial view directions. In a corridor, the same input groups resolve to tangent progress and the three transported cross-section axes.

## Consequences

- The original Poincare chamber remains intact and now acts as an intermediate node with two anomaly routes.
- The original route into the actual main world is retained.
- Each anomaly remains an explicit, independently addressable corridor chunk.
- Multiple corridor controllers can coexist while only a route adjacent to the current slice can begin player traversal.
- The tesseract math is reusable outside Babylon.js and can later feed a GPU renderer.
- Browser-specific visualization is confined to the renderer adapter.

## Limitations

- This is a projected wireframe tesseract, not volumetric 4D rasterization.
- Free-camera W movement changes the viewer coordinate used for the 4D projection; it does not add free W motion to ordinary 3D player physics.
- Live browser/WebGL verification remains pending.
