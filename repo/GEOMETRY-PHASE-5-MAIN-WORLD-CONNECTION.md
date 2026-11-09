# Geometry Phase 5 — Connect the anomaly to Somnium's main world

Date: 2026-11-07

## Summary

The geometry demonstration no longer generates or streams a separate destination world. Its far corridor mouth now terminates in the existing `somnium-main` slice and uses the application's live terrain, `SpatialTransform`, `WorldManager`, geometry adapter, and chunk graph.

The room remains an independent Poincaré slice. The main world retains its configured geometry profile. The corridor is a first-class graph node between the room's source chunk and the actual main-world chunk containing the configured exit point (world X/Z origin).

## Runtime connection

`src/demo/geometry-demo-topology.js` constructs the source and main-world slice records, samples the main world's terrain to establish the exit elevation, registers the bidirectional traversable corridor, and creates the shared `SpatialChunkGraph`.

`src/demo/geometry-demo-world.js` borrows the real main-world terrain and transform. The demo does not construct or own a second destination `WorldManager`. It exposes `setDestinationWorldManager()` to accept the scene's single main-world manager and validates that the manager uses the same slice ID, terrain object, chunk graph, and Babylon geometry adapter.

`src/scene/create-scene.js` constructs that one `WorldManager` with the main-world slice ID and the shared graph/adapter. It attaches the manager to the demo. While the geometry demo is active, its update loop keeps the main-world manager streaming around the anomaly exit; after traversal, it streams around the player's actual main-world position.

On handoff, the existing `CorridorTraversalController` changes the player's slice, spatial transform, layer mask, terrain sampler, camera context, and movement terrain. The arrival position is placed on the sampled main-world terrain just beyond the corridor mouth.

## Chunk topology invariant

The graph route is:

```text
geometry-demo-room chunk
        |
        v
geometry-demo-corridor chunk
        |
        v
somnium-main chunk at world (0, 0)
```

The destination main-world chunk is a *logical neighbour* as soon as the corridor is registered. It initially reports `loaded: false`; it becomes a resident neighbour when the application's `WorldManager` creates the real chunk. Registering or unloading that chunk refreshes the loaded-neighbour references on all resident graph chunks. No adjacency is inferred from fourth-coordinate distance.

The main-world manager remains the owner of main-world chunks. `GeometryDemoWorld` borrows it and does not dispose it. Scene cleanup disposes the manager first, allowing it to unregister its loaded chunks, then disposes the demo's shared graph and adapter.

## Display behavior

The source portal previews meshes from the shared main-world manager. Its render list is refreshed while the demo is active, so it shows the same streamed terrain that the player enters. The reverse portal remains a view back into the demonstration chamber. The existing layer masks keep the source and destination views isolated.

## Verification

- Node test suite: **87/87 passed**.
- JavaScript source and test syntax: **121/121 passed**.
- Relative module imports: **198 checked, 0 missing**.
- Regression coverage verifies the corridor endpoint, terrain elevation sampling, matching main-world chunk address, graph route through the corridor chunk, unloaded-to-loaded neighbour transition, neighbour cleanup on unload, and scene-level sharing of the live main-world manager.

These checks do not substitute for an interactive browser/WebGL session. Visual loading, portal composition, and walking around the exit should be checked in the user's browser.

## Remaining scope

The current geometry-demo update loop continues to own player/camera control while the player is inside the geometry demo, including after they enter the main-world slice. The main terrain and chunk streaming are real and shared, but the broader ecology, building, weather, and world-session simulation loop is not switched over to full ordinary gameplay mode on arrival. That should be handled as a separate player-session/mode handoff, rather than being hidden inside chunk topology.
