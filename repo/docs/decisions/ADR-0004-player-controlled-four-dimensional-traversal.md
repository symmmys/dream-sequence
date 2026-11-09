# ADR-0004: Player-controlled traversal through ambient 4D corridors

- **Status:** Accepted
- **Date:** 2026-11-08

## Context

The first corridor prototype advanced occupants along a cubic path for a fixed duration. This produced an animation that resembled traversal but did not represent player-controlled motion through the fourth spatial dimension. It also made later four-axis camera controls depend on a timer rather than an authoritative spatial coordinate.

## Decision

The corridor's cubic R4 centreline is authoritative. Traversal progress is measured by sampled ambient four-dimensional arc length and advanced by signed movement input. The corridor remains a first-class chunk graph node, and each occupant's progress and R4 position are stored in its runtime occupancy record.

The player can pause, advance, retreat, and move in two transported cross-section directions. The renderer exposes the transported tangent and all three perpendicular 4D axes. The visible Babylon tube remains a lossy, slice-local display proxy.

Each endpoint receives a separately anchored corridor renderer. Source-side travel uses an anchor at `t=0`; destination-side travel uses an anchor at `t=1`. A successful exit changes the entity's slice, transform, layer mask, and terrain context. Retreat returns the entity to the slice it entered from.

Ordinary character movement uses two slice-plane axes plus vertical jumping. The existing third-person camera remains a follow camera. Four-axis free-camera controls are deferred until the new traversal loop is validated in runtime.

## Consequences

- Movement speed is independent of the curve's parameterization and is expressed in ambient world units per second.
- The controller must retain a movement-input snapshot while ordinary world movement is suspended.
- Chunk occupancy, rather than a transient visual effect, identifies entities currently traversing the anomaly.
- Reverse traversal has a distinct render frame; it cannot reuse the source-anchored proxy and assume the destination camera coordinates match.
- The 4D frame API can support future camera movement without treating a 3D projection as authoritative.
- The current corridor remains one logical chunk; segment-level streaming is deferred.

## Alternatives considered

1. **Fixed-duration interpolation:** rejected because it ignores player input and does not provide a real traversal coordinate.
2. **Direct teleport at the mouth:** rejected because it bypasses the corridor chunk and loses intermediate 4D positions.
3. **Use the 3D display tube as the authoritative path:** rejected because the R4-to-R3 projection is necessarily lossy and cannot preserve four-dimensional distances or independent axes.
