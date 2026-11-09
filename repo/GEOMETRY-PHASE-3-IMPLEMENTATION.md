# Geometry Phase 3 — Traversable 4D corridors

## Scope

This milestone turns the geometry-demo anomaly into a traversable, chunk-graph connection. It also removes the unrelated main-world terrain from the demo camera so the room contains only its debug grid and geometry objects.

## Architecture

### Spatial chunk graph

`src/world/spatial-chunk-graph.js` composes the ordinary per-slice X/Z chunk lattice with explicit corridor nodes. Each address is `(sliceId, chunkX, chunkZ)`. Same-slice neighbours are the four adjacent grid addresses. A registered traversable corridor adds directed edges:

`source world chunk -> corridor chunk -> destination world chunk`

Bidirectional corridors add the reverse edges; one-way corridors do not. `getAdjacentWorldChunks()` resolves the far-side world chunk through the corridor node, while `getNeighbors()` exposes the corridor chunk itself as a direct neighbour. A chunk can therefore retain the corridor chunk as its direct neighbour and the remote world chunk as an adjacent world chunk tagged with `viaCorridorId`. Loaded-state and object references are refreshed on already-loaded chunks when a remote chunk loads/unloads or a corridor is registered/removed. Proximity in `w` never creates a graph edge.

### Corridor runtime chunk

`src/world/corridor-chunk.js` is the runtime occupancy owner for a corridor. It records entities inside the corridor and their direction, progress, and current ambient 4D position. The authoritative corridor definition remains the serializable Phase 1 record; the Babylon tube is only a display proxy.

### Entity transit

`CorridorTraversalController` detects the active player's entry by distance and facing. It also exposes `tryBeginEntityTransit(entity, fromSliceId)` for the same proximity/facing gate and `beginEntityTransit(entity, fromSliceId)` for an NPC or movable object when its collision/AI layer detects portal entry. The controller advances all registered entity transits alongside the player. A spatial entity implements `worldPosition`, `sliceId`, optional `yaw`, and either the methods `getRenderPosition`, `setRenderPosition`, `setSpatialContext`, `setWorldPosition`, or the supported Babylon root/mesh position fallback. During transit, the entity follows sampled corridor render positions and records the corresponding ambient R4 position. On exit, its slice, transform, layer mask, and destination terrain-relative position are updated.

### Existing world chunk integration

`WorldChunk` now carries a slice-aware address and exposes direct graph neighbours plus adjacent world chunks reached through a corridor. `WorldManager` accepts optional `sliceId`, `chunkGraph`, `spatialAdapter`, and `layerMask` options. Its keys now include slice identity, and mesh lifecycle registers/unregisters loaded chunks with the graph.

The demo's topographic destination now uses `WorldManager` for terrain mesh chunking, worker generation, LOD, and unloading. `TopographicTerrain` exposes its decoded raster buffer and readiness state to this existing pipeline. The source test room is represented as a loaded world-chunk runtime record at its corridor endpoint. That record exposes the same spatial-neighbour fields as a generated `WorldChunk`; its `adjacentWorldChunks` updates as the destination manager loads and unloads the far-side endpoint chunk.

## Geometry demo visibility fix

- Demo source meshes use layer bit `0x10000000`; destination meshes use `0x20000000`.
- Babylon's default scene layer mask (`0x0FFFFFFF`) does not intersect either demo bit, so the original terrain and other main-world meshes no longer appear as a plane in front of the demo objects.
- No room floor or ceiling meshes are created.
- The metric debug grid is enabled on initial entry and remains toggleable with `G`.

## Tests

Added graph tests cover corridor-as-chunk identity, cross-slice neighbourhoods, route resolution, no implicit adjacency, one-way links, non-traversable preview corridors, and loaded-chunk state. Traversal tests cover player transit in both directions, one-way rejection, the entry gate, and generic non-player entity transit. Topographic tests verify the raster buffer and readiness contract used by the chunk worker.

## Verification

- Node test suite: 61 passed, 0 failed.
- JavaScript source and test syntax: 115/115 passed.
- Relative imports: 189/189 resolved (query suffixes stripped for Vite-style worker imports).
- Browser/WebGL rendering was not verified in a real browser during this pass.

## Deliberate limits

This is the first unified connectivity milestone, not the final global simulation scheduler. The graph now supplies cross-slice chunk neighbourhoods and the destination terrain is streamed with the existing chunk manager. A general-purpose runtime still needs to instantiate the appropriate world manager/simulation services for every registered slice, schedule remote simulation budgets, and feed object collision/AI events into `beginEntityTransit()` or tick `tryBeginEntityTransit()`. The shared entity API and proximity/facing gate are implemented, but there is not yet a global physics-driven actor registry that invokes them automatically for every entity. The corridor is one logical chunk for this milestone; subdividing long corridors into multiple streamed corridor segments can follow later.
