# Somnium Geometry — Phase 18G4: Plane Object Editing

Build identifier: `somnium-20261110-phase18g4-plane-object-editor-3`
Geometry demo build: `2026-11-10-phase18g4-plane-object-editor-3`

## Purpose

Phase 18G4 adds an object authoring layer to the Planes tab. Plane objects are stored in the existing `somnium-planes` IndexedDB database as records in each Plane definition's `objects` array. Their position, rotation, and dimensions are Plane-local XYZ values; they are not Building records and are not stored in the saved-World database.

## Editor capabilities

The Planes tab now includes a Plane Objects editor with:

- Add Box, Sphere, Cylinder, Torus, Label, and procedural 4D Hypercube objects.
- Select an object from the list or by clicking its pickable viewport mesh.
- Duplicate and delete the selected object.
- Edit object name, visibility, local XYZ position, local XYZ rotation (degrees), dimensions/scale, and material color.
- Edit label text and display width for Label objects; labels face the camera by default; disable billboarding to enable their local XYZ rotation controls.
- Use the shared MOVE, ROTATE, and SCALE gizmos. Plane-object rotation exposes all three axes; the yaw-only Building editor remains unchanged.
- Save the Plane and its object records together with **SAVE PLANE & OBJECTS**.

Object edits update the live editor preview immediately. Persistence is explicit: use the Save button to write the Plane and object collection to IndexedDB.

## Runtime object rendering

A new `PlaneObjectRenderer` owns scene meshes for Plane-local records independently of the Building system. It:

- Resolves built-in demo Plane transforms from `GeometryDemoWorld` and maps object-local positions into Babylon render coordinates.
- Converts gizmo positions back into Plane-local coordinates before updating records.
- Rebuilds primitive vertex geometry from dimensions and Euler rotation, so geometry follows the Plane's spatial projection rather than assuming a single global mesh transform.
- Builds a projected tangent basis from the spatial transform's local Jacobian so gizmo orientation and scale remain aligned with the rendered chart; after a position drag, the gizmo frame is recalculated at the new point.
- Adds pick metadata to selectable object meshes and maintains selected-object outlines.
- Draws a procedural 3D section/edge visualization for `hypercube4d` records.
- Hides the Plane-editor tesseract overlay while the live animated tesseract renderer is active, avoiding duplicate rendering. The editor uses a selectable 3D section proxy; the live runtime renderer continues to compute the animated 4D slice.

The Plane-object renderer is initialized from the saved Plane definitions before the scene is returned to the application, preventing a first-frame gap between source-of-truth loading and room rendering.

## Additive demo-object migration

`PlaneAnomalyPersistence.bootstrapDemoPlaneObjects()` performs a one-time, additive migration under bootstrap marker `geometry-demo-plane-objects-v1`. It adds missing records by stable object ID without overwriting existing object records or user edits.

The Poincaré Room receives four primitives and five labels:

- `demo-sphere`, `demo-cube`, `demo-cylinder`, `demo-torus`
- `demo-title-label`, `demo-sphere-label`, `demo-cube-label`, `demo-cylinder-label`, `demo-torus-label`

The 4D Room receives the procedural `demo-hypercube4d` object record, including its initial 4D rotation angles, angular speeds, viewer W position, and half-extent. The live `Hypercube4DRenderer` now accepts the saved object's center, dimensions, 3D orientation, visibility, color, and 4D animation parameters.

The migration does not replace the user's existing records. If a user removes a migrated object and saves, it stays removed on subsequent launches: presence of the Plane definition is used to distinguish a valid empty object collection from unavailable storage. Original hard-coded Poincaré meshes remain only as a graceful fallback when Plane bootstrap/storage cannot be used.

## Files changed

- `src/editor/plane-object-renderer.js` — new renderer for Plane-local primitive and hypercube objects.
- `src/editor/plane-editor.js` — object creation, selection, duplication, deletion, numeric editing, gizmos, saving, and viewport picking.
- `src/editor/shared-transform-tools.js` — optional all-axis rotation mode for Plane objects while preserving Building defaults.
- `src/editor/building-editor.js` — connects Plane Editor to the active GeometryDemoWorld and Plane/Anomaly persistence.
- `src/world/persistence/plane-anomaly-persistence.js` — additive one-time demo object migration.
- `src/demo/geometry-demo-world.js` — saved object bootstrap, Poincaré room source-of-truth handling, runtime tesseract application, and demo visibility integration.
- `src/demo/hypercube-4d-renderer.js` — saved object dimensions and 3D orientation applied consistently to the rendered and optical tesseract.
- `src/scene/create-scene.js` — await Plane renderer initialization before completing scene setup.
- `tests/plane-object-editor.test.mjs` — Plane object schema/editor/renderer/migration/startup and coordinate-frame regression coverage.
- `tests/shared-transform-tools-regression.test.mjs` — shared gizmo all-axis and drag-phase regression coverage.
- `tests/hypercube-4d-renderer.test.mjs` — Babylon test-double support and tesseract object transform coverage.
- Cache-busting build identifier references across `index.html`, `src/`, and tests.

## Data compatibility and migration safety

- The existing `somnium-planes` database remains at schema version 2; no destructive database upgrade is required because Plane schema v2 already includes the `objects` array.
- The migration is idempotent and additive by object ID.
- Do not delete browser IndexedDB data when installing this phase. Existing Plane definitions, Anomalies, and user-authored object records should be preserved.
- Buildings and Anomalies remain separate editor/data workflows; this phase does not change their record formats or anomaly endpoints.

## Coordinate-frame behavior and scope boundaries

- Built-in demo Planes resolve through their registered runtime-world transforms. Their geometry and ambient-center controls are read-only in this phase because moving a registered Plane must also update its objects and connected anomaly endpoints atomically. A non-runtime/custom Plane uses its selected geometry's `SpatialTransform` and the Plane's saved frame: local XYZ positions are mapped through the frame origin and its three tangent axes before chart projection; gizmo positions are inverted back into Plane-local coordinates. This is a 3D chart projection of the saved 4D frame, not yet a separately registered runtime World.
- The current editor viewport cannot display a local axis that points purely into W. If the frame's XYZ projection is singular, the editor reports a warning and displays a deterministic XYZ fallback preview while preserving the full saved 4D frame. This fallback is a preview limitation, not a rewrite of the user's Plane data.
- W remains the ambient fourth dimension. Its frame components and the Plane's true W thickness are persisted, but this phase does not render full 4D volume clipping or true W-dependent object slices. The optional box guide remains an editor aid at the central W slice.
- Plane boundary/background fields remain saved Plane properties. Persistent world-level background application is not included here.
- Moving an existing Plane together with all its contents and anomaly endpoints is not implemented here. Object transforms are Plane-local, but moving the Plane's ambient frame as one entity is separate work.
- The Main World procedural environment has not been migrated into Plane object records. This migration covers the Poincaré Room primitives/labels and the 4D Room hypercube.
- The editor exposes the hypercube's spatial object transform and color. Its 4D initial angles and angular speeds are preserved from the migrated record and applied by the runtime renderer, but are not yet exposed as individual UI fields.

## Verification boundary

Automated Node tests and source checks pass (see `GEOMETRY-PHASE-18G4-TEST-RESULTS.txt`). The custom geometry construction path and local-frame conversion math have executable regression coverage. This build was not run in a live desktop browser/WebGL session by the packager. Actual UI layout, mesh rendering, viewport picking, Babylon gizmo interaction, IndexedDB save/reload behavior, and visual tesseract parity still require desktop-browser validation.
