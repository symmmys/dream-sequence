# Geometry Demo Camera and Corridor Preview

## Overview

This update adds an independent inspection camera to the geometry demo and makes the destination world more legible while traversing the 4D corridor. The default remains the player-following third-person camera.

Build identifier: `2026-11-08-free-camera-3`

## Camera modes

Press `C` or use the Geometry Demo HUD button to switch between modes.

### Follow mode (default)

The camera follows the player using the existing third-person camera controller. Player movement, mouse turning, jumping, and traversal continue to use the normal character controls.

### Free inspection mode

The free camera is independent of the player. Player input is suppressed while it is active, so inspection does not accidentally move the character. The camera owns a separate view-slice identity: its layer mask, corridor proxy, portal direction, and destination chunk focus follow the camera even if the player remains in another slice. Press `C` again or select **FOLLOW PLAYER** to restore the player-follow camera and input.

Outside an anomaly:

- `W` / `S`: forward / backward
- `A` / `D`: strafe left / right
- `R` / `F`: move up / down
- Mouse drag: look around (one yaw/pitch update per pointer delta)
- Mouse wheel: change movement speed
- `Shift`: move faster

Inside the corridor, movement is expressed in the transported corridor frame:

- `W` / `S`: along the corridor tangent (advance / retreat)
- `A` / `D`: first perpendicular cross-section axis
- `R` / `F`: second perpendicular cross-section axis
- `E` / `Q`: third perpendicular cross-section axis

The corridor's four independent movement coordinates are the tangent plus all three mutually perpendicular directions in its 4D normal space. The 4D ambient coordinate remains authoritative; the Babylon camera position is its current three-dimensional display mapping.

The free camera can enter the corridor independently by approaching its mouth and facing it, or can be switched on while the player is already traversing. Crossing the far mouth changes the free camera's slice and render layer. The player remains where they were; switching back to follow mode returns to the player.

## Destination visibility

The active portal preview is positioned a bounded distance ahead of current corridor progress, computed from the measured corridor arc length and clamped to 8–22% of the route. It advances as the viewer moves, keeping the destination aperture in front of the viewer in both traversal directions, including when the free camera moves independently of the player.

The source portal's preview camera uses a lower, forward-looking view from the destination world so the portal shows more of the terrain beyond the exit rather than an extremely distant overhead view. The third-person follow camera aims at the same preview aperture while traversing. If the player is mid-transit and free inspection is enabled, the aperture follows the free camera's progress rather than the stationary player progress.

The corridor shell defaults to translucent (`opacity: 0.22`) and does not write depth. This reduces the visual obstruction between the viewer and the destination aperture. The mesh remains a display proxy; the 4D centreline and transported frame remain authoritative.

## Implementation notes

- `src/demo/geometry-demo-camera-controller.js` owns mode switching, independent free-camera movement, corridor-axis controls, and camera-only slice handoff.
- `src/game/player-controller.js` exposes `setInputEnabled()` so free-camera inspection does not compete with character controls.
- `src/demo/geometry-demo-world.js` maintains the destination preview aperture ahead of active traversal progress.
- `src/world/fields/geometry/corridor-renderer.js` provides a validated opacity option for translucent corridor shells.
- The entry module graph uses the build identifier above to avoid stale browser module caches.

## Verification boundary

Node regression tests cover camera mode switching, input suppression, movement on all four corridor-frame axes, camera slice handoff, and destination-window placement in forward, reverse, and free-camera transit. Renderer tests validate corridor opacity and depth-write configuration.

A live browser/WebGL rendering pass has not been completed as part of this update. In particular, final visual readability, GPU transparency ordering, and the portal's perceived size should be checked in the user's browser.
