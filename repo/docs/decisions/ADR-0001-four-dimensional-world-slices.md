# ADR-0001: Four-dimensional world slices and explicit corridor topology

**Status:** Accepted for Phase 1
**Date:** November 7, 2026

## Context

Somnium's existing terrain and gameplay systems operate in three dimensions. The next world model
must permit independently persisted 3D worlds to occupy different cross-sections of a fourth
*spatial* dimension. The fourth coordinate is not time, and ordinary movement must not traverse
it.

A numeric difference in the fourth coordinate is not a topological relationship. Treating nearby
`w` values as adjacent would accidentally activate distant worlds in chunk streaming, simulation,
navigation, and physics.

## Decision

### Ambient coordinates and slice frames

The authoritative ambient coordinate is `P4 = (x, y, z, w)`. A `WorldSlice` is a versioned,
serializable identity for one 3D affine cross-section. Its default frame has origin
`(0, 0, 0, w)`, tangent axes X/Y/Z, and W normal. The frame contract supports a future rotated
cross-section without changing local 3D coordinate APIs.

`spatial-4d.js` owns engine-independent vector operations, plane rotations, slice-frame
validation, local/ambient conversion, and construction/transport of three orthonormal directions
perpendicular to a 4D tangent. Babylon.js types are deliberately excluded.

### Slice identity and chunk address

A slice has a stable string ID independent of its `w` value, geometry profile, or seed. The future
persistent terrain address is represented by `(sliceId, chunkX, chunkZ)`. Existing X/Z heightmap
chunk semantics remain intact; Y remains sampled elevation rather than a chunk index.

No chunk manager is changed in this phase. The address helper establishes the key contract for
Phase 3.

### Corridor definition

A `SpatialCorridor` is a versioned, serializable cubic Bezier curve in Euclidean ambient R4. Its
four control points include the source and destination mouth positions. Each mouth also stores a
slice ID and local 3D endpoint. `WorldTopology` validates that each 4D curve endpoint maps to the
corresponding endpoint through its registered slice frame.

The corridor has an independently interpolated positive radius profile, a revision, and separate
`visible` and `traversable` flags. A deterministic sampler returns position, normalized tangent,
radius, and a transported 3D orthonormal cross-section frame. A stationary Bezier endpoint uses a
small deterministic one-sided sample to obtain its tangent; a centreline with no stable direction
is rejected.

The ambient corridor metric is Euclidean R4 for this initial implementation. The intrinsic 3D
geometry of either endpoint slice remains a separate profile (`euclidean`, `poincare`, `spherical`,
or `inverted-poincare`). No general 4D rasterizer or 4D intrinsic metric is implied.

### Topology and activation

`WorldTopology` is the sole authority for cross-slice relationships:

- Visibility queries return remote slice IDs for a visible corridor, regardless of whether it can
  be traversed. This is a render-preview capability only.
- Traversal queries return a remote slice only when `traversable` is true. A one-way corridor
  grants traversal only from source to destination; a bidirectional corridor grants both.
- Neither query infers a relationship from numeric `w` proximity.
- A slice cannot be unregistered while a corridor still references it.
- Endpoint consistency and monotonically increasing corridor revisions are checked at mutation
  boundaries.

A portal preview must not be interpreted as simulation activation or chunk adjacency. Phase 3
will consume the two separate queries when scheduling render-only previews and active traversal
work.

### Bounded Poincare visual scale

The intrinsic Poincare metric remains authoritative:

`lambda(r) = 2 R^2 / (R^2 - r^2)`

Rendered local geometry receives a separate, bounded exaggeration:

`S(r) = clamp((1 - (r / R)^2)^(-gamma), 1, S_max)`

The pure helper defaults to `gamma = 0.5`, `S_max = 4`, and a boundary safety margin of `1e-4`.
These are presentation defaults, not mathematical constants. The helper clamps samples to the open
ball safety margin and never changes authoritative coordinates, distances, movement, or collision.
Renderer integration is deferred to Phase 2.

## Consequences

- Slice identity and topological adjacency are now independent of fourth-coordinate distance.
- Corridor geometry can be sampled deterministically without a rendering engine.
- Cross-section frames can be used later to map a player's local 3D corridor offset into ambient
  4D space.
- Portal visibility does not silently enable simulation or navigation.
- Existing chunk managers, geometry selection, camera transforms, renderer paths, and worker
  scheduling remain unchanged in Phase 1.

## Explicit non-goals for Phase 1

No portal mesh, remote render target, player traversal state machine, 4D physics, slice-aware chunk
streaming, compute scheduler, shader changes, inverted-Poincare projection, or browser rendering
integration is added here. These belong to the later phases in the geometry implementation plan.

## Verification

`tests/geometry-foundation.test.mjs` checks 4D vector and frame invariants, frame transport,
Bezier endpoints and tangents, corridor radius interpolation, slice-address identity, explicit
visibility/traversal separation, endpoint validation, topology serialization, and bounded
Poincare scale behavior.
