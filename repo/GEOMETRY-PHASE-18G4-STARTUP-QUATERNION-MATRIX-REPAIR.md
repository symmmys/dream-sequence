# Somnium — Phase 18G4 Startup Repair

## Summary

This corrective update resolves an application-initialization exception reported after Phase 18G4:

```text
TypeError: BABYLON.Matrix.FromQuaternion is not a function
    at Hypercube4DRenderer.setObjectDefinition (.../src/demo/hypercube-4d-renderer.js)
```

The project loads Babylon.js 9.35.0. The renderers called `BABYLON.Matrix.FromQuaternion(...)`, a static API that is not available in the installed Babylon build. Babylon provides quaternion-to-matrix conversion on the quaternion instance instead: `quaternion.toRotationMatrix(resultMatrix)`.

## Code changes

Replaced every occurrence of the unsupported static conversion with the supported instance conversion, supplying a fresh identity matrix as the destination:

```js
const rotationMatrix = quaternion.toRotationMatrix(BABYLON.Matrix.Identity());
```

Affected runtime paths:

- `src/demo/hypercube-4d-renderer.js` — applies saved rotation to the procedural 4D hypercube during demo-world startup.
- `src/editor/plane-object-renderer.js` — rotates ordinary Plane primitives, procedural hypercube slices, and computes their render-space scale factors.

The fix is applied at all five call sites, not only the first reported stack frame.

## Regression coverage

- Hypercube renderer test double deliberately does not implement `Matrix.FromQuaternion`.
- Calls `setObjectDefinition()` with a non-zero XYZ Euler rotation and verifies the Quaternion instance writes the destination matrix.
- Plane object editor source-contract test asserts that no renderer references the unsupported static API and verifies all four Plane renderer conversions use the supported instance method.
- Existing Plane migration, persistence, frame transforms, rendering, gizmo, anomaly, and gameplay tests remain in the full regression suite.

## Data and compatibility

- No IndexedDB schema changes.
- No Plane, Anomaly, or user-authored object records are modified or removed by this repair.
- No storage clearing is required.
- Cache-busting identifier updated to `somnium-20261110-phase18g4-quaternion-matrix-api-fix-1`.

## Browser status

Automated verification passed. A live desktop browser/WebGL session was not run by the packager; please verify application startup and Plane object editing in the browser after installing the archive.
