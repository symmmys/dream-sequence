# Somnium — Geometry Phase 18G3: Shared Transform Tools

## Goal

Introduce a reusable transform-gizmo layer and a practical object-selection/transform workflow without disturbing the existing Buildings, Anomalies, or Planes tabs.

## Delivered vertical slice

- Added `src/editor/shared-transform-tools.js`, a reusable Babylon.js gizmo manager wrapper with translate, rotate, and scale modes, a dedicated transform node, drag callbacks, explicit attach/detach, and disposal.
- Added a Building Selection dropdown populated from the existing BuildingSystem registry. Selecting a building focuses the editor camera, synchronizes numeric fields, and attaches the gizmo.
- Added Blender-style Move, Rotate, and Scale controls to the Buildings panel.
- Existing numeric position and rotation inputs remain active; added independent X/Y/Z scale inputs.
- Added persistent identity-default XYZ scale to BuildingModel serialization. Old saved building records without scale deserialize at `(1, 1, 1)`.
- BuildingRenderer applies building scale to component-local offsets and component dimensions before projection, so scaling is about the building origin and respects building yaw.
- Existing floor-plan placement and preview workflows remain in place. Gizmo changes rebuild the building and refresh floor-plan position.
- The existing Planes and Anomalies panels are retained unchanged; shared transform infrastructure is intentionally reusable by future Plane-object and anomaly-endpoint editing work.

## Controls

- Select a building in **Building Selection**.
- **MOVE**: translate on X/Y/Z using viewport arrows.
- **ROTATE**: rotate around X/Y/Z using viewport rings. Building renderer currently represents building yaw; the editor applies the gizmo's Y Euler component to that existing building rotation model.
- **SCALE**: scale on X/Y/Z using viewport handles.
- Numeric position, rotation, and scale fields remain available.

## Scope boundaries

- This phase wires the shared gizmo into building transforms. Plane-container transforms and per-object selection inside a Plane are not yet connected; Plane object records are preserved but the editor does not yet expose object authoring.
- The building domain model currently has a single yaw rotation, not a fully arbitrary 3-axis building orientation. Although the shared gizmo exposes three rotation rings, the building adapter maps the result back to its supported yaw representation. Full quaternion building orientation is deferred.
- No scene-wide mesh picking/highlighting or multi-selection is included. Selection is explicit through the Building dropdown.
- No live browser/WebGL session was available. Babylon GizmoManager behavior and visual ergonomics require manual browser validation.

## Changed files

- `src/editor/shared-transform-tools.js` (new)
- `src/editor/building-editor.js`
- `src/buildings/building-model.js`
- `src/buildings/building-renderer.js`
- Active cache-busting build identifiers in `index.html`, `src/`, and `tests/`
- `tests/building-model-scale.test.mjs` (new)

## Verification

- Full regression suite: 365 tests passed, 0 failed (41 test modules, executed individually in bounded batches).
- Source JavaScript syntax checks: passed.
- Test module syntax checks: passed.
- Focused editor/model regression rerun after integration: 18 passed, 0 failed.
- No live browser/WebGL verification is claimed.

## Next logical increment

Phase 18G4 should add Plane object selection and object-level transform editing, using this same gizmo abstraction and preserving each Plane's local coordinate frame. Phase 18G5 can then connect Plane runtime construction, appearance, and anomaly movement semantics.

## Planning and estimate calibration

The requested vertical slice was decomposed as follows. Estimates are expert-judgment planning estimates, not measured active-work durations.

| Work package | O (h) | M (h) | P (h) | PERT (h) |
|---|---:|---:|---:|---:|
| Shared gizmo lifecycle and mode abstraction | 0.5 | 1.0 | 2.0 | 1.08 |
| Building selection and gizmo adapter | 0.5 | 1.5 | 3.0 | 1.58 |
| Persisted scale model and renderer integration | 0.5 | 1.0 | 2.5 | 1.17 |
| Regression coverage, compatibility checks, docs, packaging | 0.5 | 1.0 | 2.0 | 1.08 |
| **Sequential total** | **2.0** | **4.5** | **9.5** | **4.91** |

Dependencies: the gizmo abstraction precedes the Building adapter; model/renderer scale support can proceed alongside selection wiring; regression and packaging follow integration. The sequential PERT sum is approximately 4.9 active engineering hours. Confidence is medium-low because Babylon gizmo runtime behavior was not visually testable here.

Historical analogues: Phase 18G2 added the Plane data editor and recorded 362 passing tests; this phase retained that suite and added two scale-compatibility tests, for 364 total. The archives do not record reliable active engineering durations, so artifact timestamps are not used as speed measurements. The sample is too small and heterogeneous to infer a productivity trend.

Assumptions/risks: the project uses Babylon.js GizmoManager from its existing runtime; building orientation remains yaw-only; scale is applied at render submission to generated component geometry. Browser pointer capture, gizmo drag behavior, and visual scale feel remain the highest uncertainty.
