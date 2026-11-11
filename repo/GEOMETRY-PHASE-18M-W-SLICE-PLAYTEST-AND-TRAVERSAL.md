# Somnium Geometry — Phase 18M
## W-Slice Inspection, Playtest Controls, and Anomaly Traversal Repair

### Purpose

Phase 18M builds on the browser-tested Phase 18L editor and W-dimension controls. It adds an explicit W-slice inspector for Plane authoring, exposes ambient W movement as a playtest option in both camera modes, fixes spherical-chart anomaly mouth placement, and makes the W-axis passage traversal independent of the ambient freedom falloff.

### Plane W-slice inspector

The Plane Editor now has a **W-Slice Inspector** with two synchronized controls:

- An integer-step slider for browsing W slices.
- A numeric W-coordinate input with decimal precision (0.01 step).

The numeric input is an absolute W coordinate. Its displayed offset is relative to the Plane's W center. The selectable interval is bounded by the Plane's saved W thickness: center ± half the full W dimension. Selecting a new Plane initializes the inspector at that Plane's W center. Changing the W center on a new, unsaved Plane draft recenters the inspected slice immediately.

The Plane viewport and Plane-owned 4D hypercube cross-sections follow the selected W slice. The current W-slice is an inspection coordinate; changing it does not relocate a saved runtime Plane or its anomaly endpoints. As in Phase 18L, the origin/geometry of an already registered runtime Plane remains frame-locked to protect its existing world registration and connected anomalies. Its W thickness remains inspectable through the slider and decimal input.

### E/Q W-axis playtest control and readout

The Geometry Demo HUD provides an **E/Q W MOVEMENT** button. It toggles the W-axis playtest override in both follow/third-person and free-camera modes.

- Override off: ambient E/Q movement obeys the active anomaly's W-freedom field.
- Override on: ambient E/Q movement ignores that freedom falloff while still respecting the active Plane's W bounds. A legacy zero-thickness demo slice receives a limited ±12 inspection interval for playtesting; saved Plane bounds are not changed.
- Inside a slice-transition anomaly, W remains an independent traversal axis and is no longer throttled by ambient W-freedom. XYZ movement remains independent.

The W readout displays the current W coordinate and current W-freedom percentage. Press **H** to show/hide the readout. While inside an anomaly passage, it also displays `IN PASSAGE: E/Q TO TRAVERSE`, clarifying that forward movement enters the mouth but E or Q advances along the fourth-dimensional passage axis. The two directions remain independent; use the key that moves toward the destination.

### Spherical anomaly mouth placement

The spherical chart is an exponential chart whose inverse becomes singular at its antipodal limit (chart radius πR). The editor previously attempted to invert raw mouse picks that could lie at or beyond that limit, raising `RangeError: Spherical chart reaches its antipodal limit.`

Mouse-derived anomaly mouth picks now pass through the Plane-frame transform's forwarded `constrainRenderPosition()` hook. Spherical picks are kept 5% inside the antipodal radius to avoid numerically unstable, enormous inverse distances; Poincaré picks retain the narrower established edge epsilon. The strict underlying geometry inverse still rejects invalid coordinates. This is an editor-pick safety margin, not a relaxation of world geometry bounds.

### Anomaly passage traversal

Once the player has entered a slice-transition anomaly, E/Q advances along the source Plane's slice-normal (W) axis at full traversal speed. The ambient W-freedom field controls approach/ambient movement outside the passage; its fade-out no longer stalls an already-entered player. X, Y, Z and W movement remain independent, preserving the project's four-axis movement semantics.

The E/Q playtest override also works when there is no active anomaly route, allowing the player to inspect a custom Plane's bounded W thickness in follow mode as well as free-camera mode. In free camera, the same control moves the camera's W coordinate. Disabling the override restores freedom-aware ambient movement.

### Compatibility and persistence

- No IndexedDB schema migration is introduced.
- Existing `somnium-planes` Plane and anomaly records are preserved.
- Do not clear browser storage when installing this phase.
- Existing Plane frame locks, anomaly endpoint topology, editor tabs, transform controls, and camera zoom settings are retained.
- The incremental patch is based specifically on the Phase 18L full project archive.

### Verification status

The automated Node test suite passes **421 tests, 0 failures, 0 skipped**. All 182 JavaScript source/test files pass `node --check`. A static relative-import audit checked 373 imports and found zero missing targets. The previous Phase 18L cache identifier is absent from `index.html`, `src`, and `tests`; the new Phase 18M identifier is used consistently.

Full and patch ZIP integrity checks and exact patch reconstruction are included in the packaging results. No live browser/WebGL session was available during this packaging pass. Browser interaction checks remain necessary, particularly W-slice rendering, E/Q controls in both camera modes, spherical anomaly placement, and passage completion.
