# Somnium Geometry — Phase 18G3 Gizmo Attachment and Box Preview Repair

Build identifier: `somnium-20261110-phase18g3-gizmo-attachment-box-preview-2`

## Purpose

This corrective build addresses the follow-up browser report that Building editor gizmos were not attached/responding, Babylon continued to warn about rotation with non-uniform scaling, and the standalone box-building action showed no clearly identifiable solid box.

## Root causes addressed

1. **Lazy gizmo creation and missing listeners.** Babylon's `GizmoManager` creates position, rotation, and scale gizmos when each mode is first enabled. The previous implementation subscribed to rotation and scale drag events during construction while those gizmo objects were still `null`. The new implementation eagerly instantiates each gizmo once, then subscribes to the actual axis `dragBehavior.onDragObservable` and `onDragEndObservable` events.
2. **Rotation/non-uniform-scale conflict.** The previous code assigned `updateGizmoRotationToMatchAttachedMesh` to the manager instead of the actual gizmo. More importantly, one transform node should not be both non-uniformly scaled and the rotation-gizmo target. `SharedTransformTools` now uses two proxies: a unit-scaled pose node for translation/rotation, and a separate scale node for scaling. The scale node is attached only while Scale mode is active. Rotation remains local to the selected object's orientation and is restricted to Y for the current yaw-only Building model.
3. **No-selection state.** Gizmos are detached and both proxy nodes disabled until a real object is selected. Changing transform modes with no selection does not display an orphan gizmo at the origin.
4. **Wireframe-only construction preview.** `BuildingPreviewRenderer` now creates filled, translucent Babylon box meshes from the same projected component matrix used by the green outline. The solid preview follows the spatial projection, building position, yaw, and per-axis building scale. It is temporary and cleared when the building is committed; the committed building continues through the normal BuildingSystem/BuildingRenderer persistence path.

## User workflow

1. Open **BUILD (B)** and stay on the **Buildings** tab.
2. Click **ADD BOX BUILDING**. A filled translucent 2 × 2 × 2 box with a bright outline should appear at the current numeric position.
3. Select **MOVE**, **ROTATE**, or **SCALE**. The corresponding gizmo should be visibly attached to the box's center. Rotation currently exposes the Y ring because BuildingModel stores yaw only.
4. Use numeric fields or the gizmo to adjust the provisional building.
5. Click **PLACE BUILDING & START NEXT** to commit it. The temporary preview is removed and the ordinary building renderer is refreshed from the persisted component definition.

## Files changed

- `src/editor/shared-transform-tools.js`
- `src/editor/building-preview-renderer.js`
- `tests/shared-transform-tools-regression.test.mjs`
- Cache-busting build identifier references across `index.html`, `src/`, and tests
- This documentation and the accompanying test/install reports

## Verification boundary

Automated tests validate proxy selection, gizmo event registration and forwarding using a small Babylon-compatible test double, generated box component routing, and the filled preview construction path. This environment does not provide a live browser/WebGL session, so actual pointer hit-testing, the appearance of utility-layer gizmos, and the committed box's on-screen rendering still require the user's desktop-browser test. The package does not claim that a live Babylon session was run here.
