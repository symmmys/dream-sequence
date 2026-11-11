# Somnium Geometry — Phase 18O
## Active Universe W-Slice Navigation

### Purpose

Phase 18O completes the behavior intended for the Phase 18N universe W-slice inspector. The slider now changes the active scene presentation and editor camera target, rather than only changing the W-coordinate readout and Plane-object cross-sections.

### What changed

- The selected absolute ambient W coordinate is resolved against the live runtime Plane registry.
- At the canonical built-in coordinates, W=0 selects the Poincaré chamber, W=75 selects the 4D hypercube chamber, and W=80 selects Somnium Main World.
- When multiple built-in slices overlap in their W extents, the nearest built-in Plane center is selected as the primary room. Custom runtime Planes whose 4D containers intersect the selected W coordinate are composed into that view as well.
- The editor camera layer mask is changed to the selected primary built-in room plus intersecting custom Plane and editor-overlay layers. Unrelated built-in room layers are not included.
- When the primary runtime room changes, the editor camera target moves to that room's natural inspection point. Its orbit angles and radius (zoom distance) are preserved. Moving the slider within the same room does not repeatedly reset the camera.
- Poincaré and 4D chamber focus points use their local chamber center. Main World uses the live terrain anchor. Custom runtime Planes use their local center.
- An unoccupied W coordinate is a genuine empty slice; it no longer leaves the previous built-in room visible. The camera keeps the selected authoring Plane transform when available, and the custom Plane render layer remains available for creating a Plane there.
- The W-view label is published while the geometry demo is inactive, which is the normal condition while the Level Builder is open.
- Leaving the Plane Editor clears inspection mode and restores the normal gameplay slice presentation.

### W-coordinate behavior

The slider continues to use integer increments across the universe-wide range. The numeric input retains decimal precision. Changing the W coordinate changes the inspection view only; it does not move the selected Plane's stored frame, modify its W center or thickness, or move the gameplay character.

The selected W value remains absolute ambient W. It is not a Plane-local normal offset. The Plane object's own cross-section rendering continues to calculate its normal offset using that Plane's frame.

### Runtime view mapping

The primary built-in selection uses the nearest center among built-in slices whose ambient-W container intersects the selected coordinate. This avoids the overlap at the 4D chamber/Main World boundary: W=75 selects the 4D chamber and W=80 selects Main World. All intersecting custom runtime Planes remain visible alongside the chosen built-in room.

### Compatibility

- No IndexedDB schema upgrade.
- Existing `somnium-planes` and Worlds data are preserved.
- Do not clear browser storage to install this phase.
- The Phase 18O incremental patch is based specifically on the Phase 18N full project archive.
- Existing editor tabs, subtabs, G/R/S transform shortcuts, Alt+1/Alt+2 subtab shortcuts, `Ctrl+S`, `B`, `V`, and anomaly workflows are retained.

### Verification status

Automated suite: **433 passed, 0 failed, 0 skipped**.

JavaScript syntax checks: 184 source/test files, zero failures.

Relative import audit: 400 imports checked, zero missing targets.

The patch was reconstructed over a clean Phase 18N extraction and compared with the full Phase 18O project. Both archives passed ZIP integrity checks and their SHA-256 sidecars were verified.

No live browser/WebGL session was available during this packaging pass. Please use the browser checklist to confirm the visible camera transition and room selection.
