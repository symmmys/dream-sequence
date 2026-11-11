# Geometry Phase 18D — Runtime Anomaly Integration

## Objective

Connect the persistent Plane/anomaly records and the Anomalies editor to the running geometry demo, so edits to the three built-in anomaly connections are reflected in the rendered portals, anomaly topology, optical links, and traversal behavior.

## Delivered

### 1. Persistent definitions hydrate the runtime at startup

- The geometry demo opens the separate `somnium-planes` IndexedDB store and bootstraps the original Plane/anomaly records without overwriting existing user edits.
- Before portal renderers and traversal controllers are created, it loads saved definitions for the three built-in anomaly IDs and converts them into validated runtime anomalies.
- The stable IDs are retained:
  - `geometry-demo-corridor`
  - `geometry-demo-4d-corridor`
  - `geometry-demo-4d-main-world-corridor`
- Saved endpoint Plane IDs, local positions, orientations, enabled state, connection visibility/traversal/bidirectionality, and Phase 17I passage presentation settings are retained.
- The chunk graph is rebuilt for the saved endpoints so cross-Plane reachability follows the saved definitions.

### 2. Plane selectors are populated from both registries

- Selecting an anomaly asynchronously loads persistent Plane records and merges them with the live Plane definitions exposed by the geometry demo.
- Missing built-in Plane records are repaired from their live definitions.
- The selector only offers Plane IDs that also have a live runtime world binding in this demo.
- The initial selector options are Poincaré Room (`geometry-demo-room`), 4D Room (`geometry-demo-4d-chamber`), and Main World (`somnium-main`).

### 3. Saved edits update live portals and topology

- Saving an endpoint edit calls the runtime bridge immediately after IndexedDB persistence succeeds.
- Runtime endpoint positions and normalized quaternions are rebuilt from the saved definition.
- The anomaly's ambient 4D influence region is recalculated from both endpoint Plane frames and positions.
- The topology and chunk graph are updated; portal meshes are rebound to their endpoint Plane layers, repositioned, and rotated.
- Remote portal cameras receive the destination Plane layer mask, and portal render lists are refreshed.
- Passage presentation and anomaly boundary renderers are rebuilt from the updated runtime anomaly.
- The existing traversal controller receives the updated anomaly, chunk link, Plane-world bindings, and presentation endpoint positions.

### 4. Mouth orientation affects both display and traversal

- Portal meshes use the saved endpoint quaternion.
- On traversal handoff, player yaw is rotated by the difference between the entry and exit mouth yaw frames.
- Reverse traversal naturally applies the inverse mapping.
- The full endpoint quaternion remains stored; the current player-heading handoff uses its yaw component because the player controller is a 3D yaw-based controller.

### 5. Connection state and lifecycle

- Disabled or unplaced anomalies are neither visible nor traversable.
- Saving visibility, traversal, or bidirectionality updates runtime topology immediately.
- Deleting a built-in anomaly removes its portal pair, topology edge, chunk-graph link, traversal controller, and passage/boundary presentation resources from the live demo.
- The retired drag-to-draw room gesture remains disabled; the Buildings tab's floor-plan workflow is preserved.

## Scope boundary

This milestone runtime-integrates the three built-in anomaly IDs. New arbitrary anomaly records can still be persisted and edited, but they do not yet create a completely new runtime portal pair and traversal controller dynamically. Registering arbitrary new anomalies into the live network is a subsequent expansion milestone. Likewise, the selectors can only offer Planes for which the current demo provides a live scene/world binding; creating arbitrary new Planes is part of the future Plane Editor work.

## Verification

- Full Node test suite: **343 passed, 0 failed**.
- Source JavaScript syntax checks: **133 passed**.
- Test-module syntax checks: **38 passed**.
- Relative module references: **222 checked, 0 missing**.
- Stale Phase 18C cache identifiers in source, entry HTML, and tests: **0**.
- Phase 18D cache-busting identifier occurrences: **78**.
- ZIP integrity is verified in the delivered archive.

No live browser/WebGL session was available during this build. Local browser validation should confirm IndexedDB hydration, dropdown options, immediate portal movement/rotation, save-and-reload behavior, and forward/reverse traversal after changing endpoint yaw.
