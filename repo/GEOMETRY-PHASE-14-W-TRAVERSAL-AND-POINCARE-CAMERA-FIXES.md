# Geometry Phase 14 — Main-World W Traversal and Poincare Camera Safety

## Changes

### Main-world movement profile

- Added validated per-world movement profiles to `PlayerController` with `setMovementProfile()` and `getMovementProfile()`.
- Slice-transition handoff now installs the destination world's movement profile after switching its terrain.
- The geometry demo keeps chamber-scale movement at 4.5 walk / 7.5 run and applies a Main World profile of 180 walk / 360 run, with a 2.2 turn rate.
- Returning to a chamber restores its own movement profile, rather than leaving the player at Main World speed.

### Bidirectional W freedom

- Removed the directional gate that only exposed anomaly W freedom when input pointed toward the paired slice.
- The scalar influence field now permits E/Q movement in either sign while the player is within its influence horizon, regardless of which endpoint slice is currently active.
- Corrected source-return detection during active anomaly transit. The player must first enter the interval between source and destination slice planes before reversing across the source plane completes a return handoff.
- Added symmetric W padding to the bounded transition regions (six ambient units by default), allowing a player to move slightly beyond either endpoint while remaining inside the anomaly.
- The geometry-demo slice HUD now reports active W freedom and its current percentage when an anomaly influence field is available on a non-hypercube slice.

### Poincare chart boundary safety

- Added `SpatialTransform.constrainWorldPosition()` for finite-world chart positions, with a small inset from the chart's axis-aligned bounds.
- Applied the world-space constraint to Poincare and inverted-Poincare charts before anomaly camera/player positions are projected.
- Player anomaly transit constrains ambient positions in the active source slice before updating the character.
- Free anomaly camera transit constrains positions before `worldToRender()`, and destination handoffs constrain arrival and camera-offset positions before projection.
- Destination-side chart constraints are also applied to ordinary slice-transition arrivals and the legacy Bezier free-camera completion path.
- Kept `PoincareProjection.worldToBall()` strict. Invalid points are prevented upstream; the projection no longer has to silently accept out-of-domain positions.
- Free-camera mode entry continues to constrain the inherited third-person render-space pose. A regression test now covers entry while the inherited pose is outside the open ball.

## Controls and expected behavior

- **E:** move in positive W.
- **Q:** move in negative W.
- Both directions are available while the relevant anomaly influence field has non-zero W movement freedom, including on the Main World side of an anomaly.
- Ordinary movement outside anomaly influence remains three-dimensional.
- Main World character movement is substantially faster than chamber-scale movement; chamber speeds are restored when returning to a chamber.
- Poincare chart positions remain strictly inside the finite world domain and the open render ball.

## Validation

Run from the project root:

```bash
node --test tests/*.test.mjs
```

Phase 14 adds regressions for destination movement-profile handoff, bidirectional W movement on both connected slices, positive and negative W exploration around an anomaly endpoint, Poincare source- and destination-side chart constraints, inverted-Poincare chart constraints, free-camera anomaly traversal, and switching from third-person into free mode with an out-of-domain inherited camera pose.

The projection's domain validation remains strict. The changes constrain camera/player positions at the spatial-transform and traversal boundaries rather than catching and suppressing projection errors.

A live desktop browser/WebGL visual session was not available in this environment. Browser interaction, terrain handoff feel, and Poincare camera behavior should receive a local manual check.
