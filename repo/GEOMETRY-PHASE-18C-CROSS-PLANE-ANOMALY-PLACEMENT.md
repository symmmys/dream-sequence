# Geometry Phase 18C — Cross-Plane Anomaly Placement

## Delivered

Phase 18C adds the first two-mouth placement workflow to the Level Builder's Anomalies tab and removes the retired drag-to-draw room tool.

### Anomaly placement

- Each anomaly has independently selectable Plane destinations for Mouth A and Mouth B.
- The initial Plane choices are Poincaré Room (`geometry-demo-room`), 4D Room (`geometry-demo-4d-chamber`), and Main World (`somnium-main`).
- Selecting a mouth's Plane switches the editor's visible geometry context and camera transform to that Plane while leaving the anomaly draft and the other endpoint intact.
- `PLACE MOUTH A` / `PLACE MOUTH B` arms a single-click placement. A click on a visible mesh in the selected Plane places that mouth. The 4D chamber also has a horizontal editor-plane fallback for its synthetic movement surface.
- Position fields (X/Y/Z) and independent yaw, pitch, and roll fields are available for both mouths. Orientation is stored as a normalized quaternion; the Euler controls use Babylon's yaw-about-Y, pitch-about-X, roll-about-Z convention.
- `ALIGN MOUTH B TO MOUTH A` performs a one-time copy of position and orientation while retaining Mouth B's selected Plane. There is no live linkage.
- Drafts remain disabled until both mouths have been explicitly placed. Changing an endpoint's Plane invalidates that endpoint's placement and disables the connection until it is placed again.
- Visibility, traversability, and bidirectionality are independently editable connection-level settings.
- Endpoint coordinates, orientation, Plane IDs, placement flags, and placement status persist through the separate `somnium-planes` IndexedDB database. The placement-status fields are now retained by anomaly-definition normalization instead of being dropped.

### Legacy room drawing removed

- Removed the `DRAW ROOM` control and the legacy `createRoomFromPoints` implementation.
- Pointer-down no longer starts a room footprint drag, and pointer-up no longer creates a room from a drag gesture.
- The Buildings tab remains intact, with floor-plan import and the existing floor-plan construction workflow available for building creation.

## Validation

- Full automated test suite: 337 passed, 0 failed.
- Added pure unit tests for quaternion/Euler conversion, endpoint placement, independent Plane/position/orientation persistence, one-time mouth alignment, connection settings, and placement-status normalization.
- Added a regression test ensuring the old drag-to-draw room entry point is absent.
- JavaScript syntax and relative-import sweeps are recorded in `GEOMETRY-PHASE-18C-TEST-RESULTS.txt`.

## Important scope boundary

The placement workflow persists editor-facing anomaly definitions. The running geometry demo still builds its active traversal/render topology from its existing demo topology; newly edited persistent anomaly records are not yet instantiated as live runtime anomalies. That runtime-definition bridge is the next milestone (Phase 18D). Likewise, the saved endpoint orientations are available to the editor and persistence layer but are not yet consumed by the runtime passage renderer/traversal system.

A live browser/WebGL session was not available in this build environment. Please validate IndexedDB save/reload, switching between all three Planes, actual click placement on each Plane, and the legacy room-drag regression in the browser.
