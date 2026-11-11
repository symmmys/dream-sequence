# Somnium Geometry — Phase 18J
## Plane Background Persistence & Editor Navigation Finalization

Phase 18J is a focused finalization pass for the Plane-centered authoring workflow. It fixes Plane background persistence outside the editor, introduces a save hotkey, and gives the Level Builder the intended two-level navigation hierarchy.

## 1. Plane backgrounds follow the active runtime Plane

- The geometry demo now retains the saved Plane definitions loaded from `somnium-planes` and indexes them by Plane ID.
- Activating a runtime slice applies that Plane's saved `container.backgroundColor` and `container.backgroundOpacity` to the scene.
- The background override is written to `scene.metadata.somniumPlaneBackground`, which the CelestialSystem already respects during its per-frame sky refresh.
- Saving a Plane updates the geometry demo's in-memory saved-definition map. If that Plane is the active runtime slice, its background is refreshed immediately.
- Deactivating the Plane editor returns to the saved background of the runtime Plane that was active before editing. If the user edited a different Plane, the exact prior scene background/override is restored instead.
- Leaving the geometry demo for ordinary world/menu modes removes the Plane override and restores the scene's original background. Returning to the geometry demo reapplies the currently active Plane's saved appearance.

This is presentation-only; it does not alter the geometry metric, Plane frame, objects, or anomaly topology.

## 2. Plane save shortcut

- `Ctrl+S` saves the current Plane and all Plane-local objects.
- The shortcut works while a Plane name or numeric field has focus, and prevents the browser's Save Page action.
- The save button advertises `(Ctrl+S)`.
- The shortcut is active while the **Plane Editor** subtab is selected.

## 3. Level Builder navigation

The Level Builder has exactly two top-level tabs:

1. **Planes (1)** — the primary Plane authoring workflow.
2. **Object Editor (2)** — currently contains the existing create-building-from-floor-plan workflow.

The **Planes** tab has its own subtabs:

- **Plane Editor** — Plane registration, geometry/container settings, local objects, transforms, colors, background, and saving.
- **Anomalies** — the existing anomaly list, create/select/edit/duplicate/delete, endpoint Plane selectors and placement controls, connection settings, and aperture gizmo.

The former general Building Editor controls for standalone box placement, doors, windows, and furniture are not presented as additional Object Editor tools in this phase. The floor-plan workflow remains intact, including image import, dimensions/aspect ratio, altitude offset, floor construction, resulting Building selection, and transforms.

## 4. Hotkeys

| Shortcut | Action |
|---|---|
| `B` | Open/close Level Builder |
| `1` | Switch to Planes |
| `2` | Switch to Object Editor |
| `V` | Cycle Plane camera wheel zoom: 1× / 10× / 100× |
| `Ctrl+S` | Save Plane and Plane-local objects |
| `Ctrl+Enter` | Save and place the selected anomaly while on the Anomalies subtab |

Top-level navigation keys are ignored while typing in form controls. `Ctrl+S` intentionally works with form controls focused.

## 5. Storage compatibility

- The existing `somnium-planes` IndexedDB database and schema are unchanged.
- Saved Plane backgrounds already exist in each Plane definition; no data conversion is needed.
- Existing Plane object and anomaly records remain untouched.
- Do not clear IndexedDB or browser storage during installation.

## 6. Browser validation checklist

1. Enter the Poincaré Room, open the builder, change its background color and opacity, save with the button and with `Ctrl+S`, then close the editor. Confirm the new background remains visible in the room.
2. Repeat for the 4D Room. Confirm switching through an anomaly to the other room shows that room's own saved background rather than the previous room's color.
3. Change a non-active Plane's background and save it. Confirm the currently active room keeps its own background, then visit the edited Plane and confirm its appearance is applied there.
4. Leave the geometry demo for the ordinary world or menu and confirm the ordinary scene background is restored. Re-enter the geometry demo and confirm the active room's saved background returns.
5. Press `Ctrl+S` while a Plane name, numeric field, and color control are focused. Confirm the Plane saves and the browser's Save Page dialog does not open.
6. Confirm **Planes** and **Object Editor** are the only top-level tabs, and `1` / `2` switch between them.
7. In Planes, switch between **Plane Editor** and **Anomalies**. Confirm Plane objects remain editable and anomaly CRUD, endpoint selection/placement, aperture gizmo, and `Ctrl+Enter` continue to work.
8. In Object Editor, import a floor-plan image, adjust width/depth and altitude, construct the building, place it, and verify the resulting Building selection and transform controls.
9. Confirm existing Plane object gizmos, materials, and `V` zoom speeds (1× / 10× / 100×) are unchanged.

Automated regression tests and static checks are recorded in `GEOMETRY-PHASE-18J-TEST-RESULTS.txt`. Browser/WebGL pointer behavior and rendered background transitions still require validation in the user's browser.
