# Geometry Phase 18G2 — Plane Container Editor

## Scope

Phase 18G2 adds the first interactive Plane authoring surface to the existing Level Builder. The editor now has three tabs: Buildings, Anomalies, and Planes. The existing Buildings and Anomalies workflows remain intact.

## Plane authoring

The Planes tab supports:

- Creating a new Plane definition with a stable generated ID.
- Selecting and editing any Plane already stored in the separate `somnium-planes` database.
- Editing display name and geometry family.
- Editing the ambient 4D center (`W`, `X`, `Y`, `Z`).
- Editing independent 4D box dimensions (`W`, `X`, `Y`, `Z`). W is the full fourth-dimensional thickness; the Plane frame origin's W component is its center.
- Arming mouse placement to set center XYZ from a terrain hit, with a horizontal ground-plane ray fallback when no terrain mesh is hit. W remains unchanged.
- Editing optional boundary visibility, color, and opacity.
- Editing background color and opacity.
- Showing an editor-only 3D wireframe guide at the central W slice. The guide is independent of whether the saved Plane boundary is enabled.
- Saving through the existing Plane persistence service.

Existing Plane frame axes, frame normal, object records, metadata, and source classification are preserved when editing a record. The Plane's local object collection is not yet surfaced for editing in this phase; that is planned for the shared primitive/object authoring work.

## Architecture

- `src/editor/plane-editor.js` owns the Plane container UI, selection, form normalization, mouse placement arming, and disposable boundary guide.
- `BuildingEditor` hosts the third tab and routes viewport clicks to the Plane editor only when Plane placement is armed.
- Plane records continue to be normalized by `createPlaneDefinition()` and persisted in the separate IndexedDB `planes` object store.
- The editor stores plain serializable definitions; the wireframe is a disposable Babylon preview mesh and is never persisted.
- The Plane editor does not create or persist Babylon meshes as Plane data.

## Deliberate boundaries

This phase establishes the editing and persistence workflow, not full runtime world creation. A newly saved Plane is available as a Plane definition in storage, but it is not yet a fully constructed playable world or a dynamically registered anomaly destination. Runtime Plane creation, application of background colors to each live Plane, and moving live anomaly endpoint frames together with a Plane are part of later runtime integration.

The W thickness is represented in data but cannot be shown as a literal 3D wireframe dimension in the current central-W-slice preview. The guide displays the XYZ cross-section; the full W extent remains a 4D container property.

## Keyboard navigation

- `1` / Numpad `1`: Buildings
- `2` / Numpad `2`: Anomalies
- `3` / Numpad `3`: Planes

Shortcuts are ignored while typing in inputs, textareas, selects, or content-editable elements.

## Validation

Run from the project root:

```bash
find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check
find tests -type f -name '*.mjs' -print0 | xargs -0 -n1 node --check
node --experimental-default-type=module --test tests/*.test.mjs
```

The Phase 18G2 verification run completed with **362 tests passed, 0 failed**. Source and test syntax checks passed.

## Installation

Extract the archive and serve the directory containing `index.html`:

```bash
python3 -m http.server 8081
```

Open `http://127.0.0.1:8081/`. If an older version is cached, perform a hard refresh. The application build query was advanced to `somnium-20261110-phase18g2-plane-container-editor-1`.
