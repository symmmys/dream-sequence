# ADR-0005: Geometry demo corridor connects to the live main world

- Status: Accepted
- Date: 2026-11-07

## Context

The original Phase 4 geometry demo created a self-contained destination world. The player could traverse the four-dimensional corridor correctly, but the exit landed in a separate slice with no connection to Somnium's existing populated main world. That made the exit appear empty and duplicated terrain ownership.

## Decision

The demo corridor will terminate in the existing `somnium-main` slice at a configured exit anchor sampled from the live main-world terrain. The anomaly is registered as an explicit graph node between the demonstration room chunk and the main-world chunk that contains that anchor.

The application's one main-world `WorldManager` owns and streams main-world chunks. It shares the demo's `SpatialChunkGraph` and `BabylonGeometryAdapter`, and is borrowed by the demo for preview rendering and destination chunk streaming. The demo does not create, duplicate, or dispose a second destination manager.

A cross-slice adjacency exists only because the traversable corridor is explicitly registered. The main-world destination chunk remains a logical neighbour before load, and becomes a resident neighbour when the real manager registers it. On unload, the resident reference is removed without deleting the corridor topology.

## Consequences

- Traversal arrives on actual main-world terrain rather than an isolated generated destination.
- The same main-world chunk manager owns the chunk before, during, and after anomaly traversal.
- Portal preview and player destination use the same streamed chunk meshes.
- Chunk graph adjacency can be inspected and tested independently of Babylon rendering.
- The geometry demo currently retains its own player/camera update loop after arriving in the main-world slice. Full gameplay-mode and simulation-system handoff is intentionally a later application-layer change.
