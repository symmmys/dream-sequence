# Somnium — Phase 18G3 corrective update: Gizmo fixes and box building

## User-reported defects addressed

### Scale gizmo appeared to snap back

The shared gizmo wrapper previously subscribed to position and rotation drag observables but never subscribed to scale-gizmo drag events. As a result, the transform node could change during pointer interaction, but the Building model and generated geometry were never updated. The wrapper now subscribes to each scale axis gizmo's drag and drag-end observables (including its drag behavior observable where available), so changes are emitted to the Building adapter and immediately rebuilt into the renderer.

### Rotation gizmo warning with non-uniform scale

Babylon.js was attempting to orient the gizmo to match an attached node that may have non-uniform scale. This combination is unsupported and produced the reported warning. The shared manager now sets `updateGizmoRotationToMatchAttachedMesh = false`, keeping the rotation rings in a stable world-aligned orientation while allowing the node to have independent X/Y/Z scale.

### Box building test object

Added **ADD BOX BUILDING** to the Buildings panel. It creates a provisional 2×2×2 box component, selects it, attaches the shared gizmo, and enables the existing placement/commit button. It requires no floor-plan image. The preview outline now applies the building's scale consistently with the final BuildingRenderer output.

## Files changed

- `src/editor/shared-transform-tools.js` — scale drag observers; disable rotation-to-attached-node matching.
- `src/editor/building-editor.js` — Add Box Building action, selection and placement workflow, scale numeric synchronization.
- `src/editor/building-preview-renderer.js` — preview outlines respect building scale.
- Active cache-busting identifiers in `index.html`, `src/`, and `tests/`.
- `tests/shared-transform-tools-regression.test.mjs` — focused regressions for the reported defects and box workflow.

## Verification

Run:

```bash
node --test tests/*.test.mjs
```

The added tests verify that scale drag observables are wired, the Babylon rotation warning condition is disabled, the box-building action creates a 2×2×2 component, and preview geometry uses the same scale as final geometry.

No live browser/WebGL session was available during this update. Please validate actual Babylon pointer dragging in a desktop browser, particularly all three scale axes and rotation after applying non-uniform scale.
