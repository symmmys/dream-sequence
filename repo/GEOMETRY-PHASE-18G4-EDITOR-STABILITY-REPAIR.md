# Somnium Geometry — Phase 18G4 Editor Stability Repair

**Build:** `2026-11-10-phase18g4-editor-stability-repair-1`  
**Base:** Phase 18G4 Quaternion Matrix API Startup Repair  
**Scope:** Built-in Plane editing, hypercube selection, Plane background preview, editor camera zoom controls, and finite Poincaré chart preview safety.

## Summary

This corrective package addresses the editor issues reported after the repaired Phase 18G4 build successfully started in the user's browser. It does not introduce a new Plane/anomaly database schema and does not reset or migrate saved IndexedDB content.

## Changes

### 1. Gizmos on built-in demo objects

The built-in Poincaré and 4D demo Planes render on isolated camera layer masks. Babylon gizmo meshes live in a utility layer and retain the default utility-layer mask unless explicitly updated. The selected object can therefore receive its yellow outline while its transform gizmos remain invisible.

`SharedTransformTools.setLayerMask()` now applies the active Plane camera mask to the gizmo utility-layer meshes. Plane context changes update that mask, and leaving the Planes editor restores the standard utility-layer mask.

### 2. Direct picking of the existing 4D hypercube

The procedural hypercube cross-section surface is now pickable and carries the same Plane/object metadata used by the object-selection workflow. The invisible hit proxy remains enabled as a fallback. Surface and proxy bounds are refreshed when the procedural section changes.

### 3. Live Plane background color and persistence

Changing the Plane background color or opacity now immediately updates the active editor scene's clear color. The previous scene clear color is saved when entering the Planes editor and restored when leaving it, so editor-only background changes do not leak into gameplay.

The existing Plane definition already stores `container.backgroundColor` and `container.backgroundOpacity`; the editor continues to collect and save both fields. No storage schema change was necessary.

### 4. Mouse-wheel zoom speed presets

The Planes editor now offers three wheel-zoom speeds:

- **1×** — normal/default speed
- **10×** — ten times faster
- **100×** — one hundred times faster

Press **V** while the Planes editor is active to cycle forward through `1× → 10× → 100× → 1×`. The dropdown can also set the speed directly. The shortcut is ignored while typing in an input, select, textarea, or content-editable element, and it is not active in the Buildings or Anomalies tabs.

This intentionally does not attempt generalized automatic camera framing across different metrics.

### 5. Safe preview projection at finite Poincaré bounds

Plane boundary previews can extend beyond the finite domain of the Poincaré chart. The editor's previous behavior allowed these preview-only points to reach the strict world-to-render transform, which raised `RangeError: Position lies outside world bounds` during editor construction and updates.

The Plane object renderer now catches only `RangeError` at its presentation projection boundary. If the transform exposes `constrainWorldPosition`, it moves the preview sample to a small interior margin and retries. The same fallback is used for preview visual-scale evaluation. Other errors are still rethrown.

The general `SpatialTransform` and Poincaré projection remain strict. This is an editor-preview containment rule, not a relaxation of world-bound validation for simulation or gameplay.

## Compatibility and data safety

- Based on the Phase 18G4 Quaternion Matrix API Startup Repair archive.
- No IndexedDB version or object-store changes.
- No need to clear browser storage or delete the `somnium-planes` database.
- Existing Plane and anomaly records remain intact.
- The browser module cache-busting identifier has been advanced to the new build ID.

## Browser verification still required

Automated tests cover the code paths and data contracts, but this package has not been run in a live browser/WebGL session by the build process. After installing, please verify:

1. Select a built-in Poincaré room object and confirm the gizmo is visible as well as its yellow outline. Try translate, rotate, and scale modes.
2. In the built-in 4D room, click directly on the existing tesseract cross-section to select it; confirm its object dropdown entry follows the selection.
3. Change Plane background color and opacity while the Planes tab is active. Confirm the scene updates immediately, save the Plane, reload it, and confirm the selected background remains.
4. Use the speed dropdown and the **V** shortcut; verify wheel zoom at 1×, 10×, and 100×.
5. Switch between Euclidean and Poincaré contexts and resize Plane boundaries. Confirm no repeated out-of-bounds RangeErrors are emitted by the editor preview.

See `GEOMETRY-PHASE-18G4-EDITOR-STABILITY-REPAIR-TEST-RESULTS.txt` and `INSTALLATION-GEOMETRY-PHASE-18G4-EDITOR-STABILITY-REPAIR.txt` for verification and installation details.
