# ADR-0003: Traversable 4D corridors are first-class chunks

- Status: Accepted for the geometry-demo traversal milestone
- Date: 2026-11-07

## Context

A visual portal or teleport does not satisfy Somnium's spatial-world model. A traversable anomaly must connect otherwise separate 3D world slices inside the same spatial chunk topology. The corridor itself must have runtime identity and occupancy, and chunks beyond its mouth must be discoverable as neighbours without deriving adjacency from the fourth coordinate.

## Decision

1. Every world chunk is addressed by `(sliceId, chunkX, chunkZ)`.
2. Every registered anomaly corridor has a first-class `CorridorChunk` runtime node.
3. A traversable corridor contributes directed graph edges:

   `source world chunk -> corridor chunk -> destination world chunk`

   A bidirectional corridor adds the reverse edges. A visible but non-traversable corridor remains renderable but contributes no simulation-neighbour edges.
4. `getNeighbors()` reports the corridor chunk as a direct neighbour. `getAdjacentWorldChunks()` additionally resolves the remote world chunk across that corridor and tags it with `viaCorridorId`.
5. Fourth-coordinate proximity never creates graph edges.
6. Loaded state is independent of connectivity. Neighbour records are refreshed when a world chunk loads/unloads or a corridor is registered/removed.
7. The corridor chunk tracks entities currently in transit, including direction, normalized progress, and ambient four-dimensional position.
8. Player traversal uses the active third-person controller. Other spatial entities use the same transit service through `beginEntityTransit()` or `tryBeginEntityTransit()`.

## Consequences

- World managers can retain their existing per-slice chunk meshes and LOD pipeline while sharing a common graph of cross-slice adjacency.
- A portal preview can reveal a remote slice without making that slice adjacent unless a traversable corridor is registered.
- A remote world chunk can be a logical neighbour while unloaded; `loaded` and `chunk` indicate whether its runtime data is currently resident.
- One-way corridors are represented by directed edges, not special-case teleport rules.
- The current implementation uses one logical chunk per corridor. Long corridors can later be subdivided without changing the world-address contract.
- A global actor registry, physics event routing, remote simulation budgets, and full scheduler integration remain future work. Non-player transit is available through the shared API, but an application-level actor system must call it.

## Validation

Automated tests cover route shape, corridor chunk identity, bidirectional and one-way directionality, no implicit adjacency from `w`, non-traversable preview links, loaded-neighbour refresh, and player/NPC/object transit. Browser/WebGL and physics-engine integration require manual runtime verification.
