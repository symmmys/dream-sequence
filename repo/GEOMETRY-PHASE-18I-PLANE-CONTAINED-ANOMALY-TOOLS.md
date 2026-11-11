# Somnium Geometry — Phase 18I
## Plane-Contained Build & Anomaly Tools

Phase 18I resolves three editor regressions reported after Phase 18H and reorganizes the Level Builder so anomaly authoring lives inside the Planes workflow.

### 1. Build-menu hotkey

- `B` now opens the Level Builder from any registered navigable gameplay mode, including `geometryDemo`, as well as the main menu.
- Pressing `B` while the editor is open exits it and resumes the spatial mode that was active before entering the editor.
- The global shortcut is registered in the window capture phase so mode-specific viewport listeners cannot consume it first.
- Text-entry controls remain protected: `B` does not open or close the editor while the user is typing in an input, textarea, select, or content-editable element.

### 2. Object material colors

- Plane object material edits immediately refresh the renderer's diffuse and emissive color channels.
- Procedural 4D hypercube color edits also refresh the dedicated runtime tesseract's surface and edge materials. This matters because that renderer disables lighting and relies on emissive color for visible edges/surface contribution.
- Hypercube line-system edges are rebuilt with the saved material color when a Plane object record changes.
- Color changes remain Plane object data and persist through the existing **SAVE PLANE & OBJECTS** action.

### 3. Plane background colors

- Plane background color and opacity inputs update the active scene immediately while the Planes editor is open.
- The selected Plane background is stored in a scene metadata override that the CelestialSystem now respects during its per-frame sky update. The sky update was the reason a direct `scene.clearColor` assignment appeared to have no effect.
- Background color and opacity continue to be saved in the Plane definition through the existing Plane save operation.
- Switching/reopening the Plane editor reapplies the selected Plane's saved background. Closing the Plane editor restores the scene background that was active before editing, rather than leaving a Plane-specific override on the general game scene.

### 4. Level Builder menu organization

The Level Builder now has two top-level tabs:

- **Buildings (1)** — retains the existing floor-plan/building workflow and its building-level box action.
- **Planes (2)** — contains Plane registration, container dimensions, Plane-local objects, transforms, material appearance, and saved Plane background.

The existing **Anomalies · Place Connections** editor is now a collapsible child section inside the Planes tab. Its list, create/select, rename, duplicate, delete, enable/disable, connection properties, independent Plane selectors, endpoint position/orientation fields, and save/place action are retained.

Boxes are already available as Plane-local objects through the Plane object's **ADD BOX** action; they are saved as `box` object definitions within that Plane rather than as Buildings in the general floor-plan workflow.

### 5. Anomaly aperture gizmo and placement

- Selecting a placed anomaly in the nested Anomalies section attaches the shared scale gizmo at Mouth A when its source Plane is active.
- Scaling the gizmo updates the aperture-radius field during the drag. Releasing the gizmo commits the value through the existing anomaly persistence path and refreshes the live anomaly definition.
- The aperture radius is a shared connection property, so it controls the aperture size at both ends. W-freedom radius remains independently editable in its numeric field.
- Mouth A and Mouth B retain independent Plane selectors and independent scene placement. Choose **PLACE MOUTH A** or **PLACE MOUTH B**, then click the corresponding Plane in the viewport. The other endpoint and its settings are preserved.
- The existing **SAVE & PLACE ANOMALY** button and `Ctrl+Enter` shortcut remain available while the nested Anomalies section is open.

### 6. Preserved behavior and storage

- Plane object transform gizmos and the Plane camera wheel zoom speeds remain in place. The `V` key continues to cycle 1×, 10×, and 100×.
- Existing numeric position, rotation, dimension, radius, and orientation fields remain available.
- Existing Buildings, Planes, and Anomalies records remain in the separate `somnium-planes` IndexedDB database.
- **No IndexedDB schema change or data migration is introduced by Phase 18I. Do not clear browser storage.**

### Browser validation checklist

1. Enter the Poincaré geometry demo, press `B`, and confirm the Level Builder opens. Press `B` again and confirm the demo resumes.
2. Repeat the `B` test while in another navigable mode and while a text field is focused.
3. In Planes, change a primitive object's material color; confirm it changes immediately, save the Plane, switch away/back, and confirm the color persists.
4. Repeat color testing on the procedural tesseract in the 4D Room, checking both its surface and edge lines.
5. Change Plane background color and opacity. Confirm the viewport changes immediately and that the selected Plane's appearance returns after saving/reselecting or reopening the editor. Confirm closing the editor restores the ordinary scene background.
6. Open Planes → **ANOMALIES · PLACE CONNECTIONS**. Confirm the original anomaly list and controls are present.
7. Select a placed anomaly, select its source Plane, and scale the Mouth A gizmo. Confirm the aperture radius changes, persists after release, and the runtime anomaly updates.
8. Place Mouth A and Mouth B independently in different Planes, save/enable the connection, and confirm the connection behaves as before.
9. Confirm `V` still cycles 1× → 10× → 100× and the wheel zoom behavior is unchanged.

Automated tests and static checks are recorded in `GEOMETRY-PHASE-18I-TEST-RESULTS.txt`. Browser/WebGL interaction is not claimed as automated verification.
