# Geometry Phase 17C — Main-World Anomaly Re-entry and Spotlight Controls

**Status:** Implemented; full automated regression suite and static checks passed.  
**Date:** November 9, 2026  
**Baseline:** Phase 17B Main-World optical-ray and portal-readability update.

## 1. Objective

Resolve the Main World anomaly-mouth mismatch introduced when Phase 17B moved the *display portals* farther apart without moving the authoritative 4D anomaly endpoints. Restore reliable anomaly entry and W-influence activation from the enlarged Main World mouths, apply the same coordinate policy to the free camera, and add explicit editing and enable/disable controls for the optical test spotlight/ray.

## 2. Root cause and coordinate policy

Phase 17B correctly increased Main World portal readability by placing the presentation mouths at approximately `anchor.x - 260` and `anchor.x + 260`, with a visual centre around `anchor.y + 35` and `anchor.z - 2`. The change was deliberately presentation-only: the source/destination positions, 4D anomaly region, aperture radius, W coordinates, optical topology, and chunk-graph corridor anchors remained in their compact canonical positions.

The traversal path still evaluated the player directly in canonical local coordinates. A player standing at a visible mouth therefore appeared hundreds of units away from the anomaly centre to the influence field and chunk graph. The visible preview could be found, but its physical endpoint did not line up with the player; entry and W-slice activation were consequently blocked.

**Phase 17C keeps the canonical geometry unchanged.** It introduces an explicit `presentationEndpointsBySlice` mapping in the traversal controller:

- A player/camera position inside the configured portal approach radius is rebased from the visible mouth to the corresponding canonical endpoint before conversion to ambient R4.
- X/Z offsets from the visible mouth are preserved relative to the canonical endpoint, so the approach has a locally consistent coordinate mapping.
- The player's height above sampled terrain is preserved as an offset above the canonical endpoint's Y coordinate.
- Positions outside the approach radius are left untouched; the presentation mapping cannot globally warp the rest of the Main World.
- Arrival positions are mapped in the opposite direction, placing the player at the visible destination mouth after the physical 4D handoff.

This same rule is used for player entry checks, ambient influence/W movement, chunk-graph reachability, destination arrival, free-camera corridor entry, free-camera W movement and free-camera exit. The traversal network now chooses the route whose visible portal approach contains the player when multiple anomaly controllers own the same slice.

The main corridor and direct Hypercube-to-Main-World corridor both declare their own Main World presentation endpoint. The existing display separation and portal sizes are retained. The physical anomaly endpoints and their bounded regions are not moved or enlarged.

## 3. Spotlight edit and test-ray controls

The spotlight editor remains a separate mode from player/free-camera movement.

- `L`: toggle spotlight editing on/off.
- `P`: toggle the optical test source and its diagnostic ray on/off. This does not disable anomaly traversal or alter optical topology.
- `WASD` / arrow keys: move the light in X/Z while editing.
- `R` / `F`: move vertically.
- `U` / `O`: rotate spotlight yaw.
- `I` / `K`: rotate spotlight pitch.
- `Shift`: use larger movement increments.
- Mouse drag on the canvas: rotate the spotlight aim while editing.
- `Escape`: exit spotlight editing.

The editor captures movement inputs only while active. Pointer listeners are removed on release/blur and during world disposal. The P toggle disables the source and hides the receiving emitter/ray; re-enabling it requests a fresh optical trace.

Optical diagnostics now distinguish the canonical/physical virtual position from the presentation-adjusted Main World virtual position and include the presentation offset. This helps diagnose physical transport separately from the deliberate display-mouth rebase.

## 4. Implementation areas

- `src/world/fields/geometry/slice-transition-traversal-controller.js`
  - Per-slice presentation endpoints and trigger distances.
  - Local presentation-to-canonical and canonical-to-presentation coordinate conversion.
  - Entry, influence, chunk graph, entity transit and arrival integration.
- `src/demo/corridor-traversal-network.js`
  - Selects the nearby visible portal's controller when resolving the shared player ambient position.
- `src/demo/geometry-demo-camera-controller.js`
  - Uses the same presentation endpoint mapping for free-camera entry, ambient position, W influence and handoff.
- `src/world/fields/geometry/anomaly-view-transform.js`
  - Allows the active-side camera pose to be based on the visible mouth while preserving the remote physical endpoint mapping.
- `src/demo/geometry-demo-world.js`
  - Supplies presentation endpoint maps, retains the Phase 17B portal layout, maps the destination spotlight/ray for display, adds `P` toggle and mouse-aim controls, and exposes clearer diagnostics.

## 5. Regression coverage

New/updated coverage verifies:

- A distant visible Main World mouth maps to its compact canonical anomaly endpoint in ambient R4.
- The public `tryBeginTransit()` path can begin a reverse-direction traversal from the displayed mouth.
- Arrival from the canonical endpoint maps back to the displayed portal mouth.
- Presentation rebasing is local to the portal approach radius and does not warp ordinary Main World coordinates.
- The traversal network prefers the controller whose portal mouth contains the player.
- Free-camera ambient position maps from the enlarged Main World mouth to the canonical endpoint.
- The active-side anomaly preview uses the presentation endpoint mapping.
- The destination spotlight/ray uses the presentation offset while the underlying optical trace remains canonical.
- `P` toggles the test source/ray without changing edit-mode state.
- Mouse dragging changes spotlight aim and requests a new trace.
- Existing 4D anomaly geometry, optical topology, portal size/spacing and prior traversal behavior remain covered by regression tests.

## 6. Verification

Run from the extracted project root:

```bash
node --test tests/*.test.mjs
```

Static verification:

- Source JavaScript syntax: 125/125.
- Test JavaScript syntax: 30/30.
- Static relative imports checked: 323; missing: 0.

See `GEOMETRY-PHASE-17C-TEST-RESULTS.txt` for the final automated regression result.

## 7. Known limitations

- The diagnostic receiving ray remains a straight destination-slice tangent segment rather than a full curved slice-native reconstruction.
- The receiving spotlight remains a Babylon rendering approximation; fully surface-resolved 4D shadow transport is still future work.
- No live browser/WebGL session was available during this implementation, so the visual quality and actual in-browser feel of Main World re-entry, W-slice activation, spotlight editing and shadows still require user validation.

## 8. Build

Build identifier: `somnium-20261109-phase17c-mainworld-endpoint-rebase-2`  
Application identifier: `2026-11-09-phase17c-mainworld-endpoint-rebase-2`
