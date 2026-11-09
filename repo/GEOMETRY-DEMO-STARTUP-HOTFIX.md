# Geometry Demo Startup Compatibility Fix

Date: 2026-11-07

## Reported failure

The application stopped during `GeometryDemoWorld` construction with:

`TypeError: this.destinationWorldManager.setVisible is not a function`

## Cause

The Phase 3 demo composition called `WorldManager.setVisible()`. That method exists in the Phase 3 `src/world/world-manager.js`, but it did not exist in the earlier Phase 2 manager API. A mixed-version install or stale browser-loaded module could therefore pair the new demo composition with an older manager implementation and abort application startup.

## Fix

Added `src/demo/world-manager-visibility.js` as a small compatibility boundary. It delegates to `setVisible()` when the current API provides it. For older managers, it updates the manager visibility state and resident chunk/mesh visibility directly. The demo composition no longer calls the optional manager method without checking the capability.

The helper does not change topology, chunk identity, traversal, or authoritative world state. The current Phase 3 `WorldManager` remains the preferred implementation and still owns visibility for newly-created chunks. The fallback supports mixed-version startup and toggles resident meshes in the older API.

## Installation

Preferred: install the complete repaired project archive.

For a patch-only installation, extract the replacement ZIP so the `somnium_open_the_door/` folder contents merge into the existing project root. In particular, preserve these paths:

- `src/demo/geometry-demo-world.js`
- `src/demo/world-manager-visibility.js`
- `tests/world-manager-visibility.test.mjs`
- `docs/STYLE-CONFORMANCE.md`

After applying, reload the page with the browser's cache disabled or perform a hard reload so the updated ES modules are fetched. Confirm that the project root served by Python is the directory containing `index.html`.

## Verification

- Full Node test suite: 65/65 passed.
- JavaScript source and test syntax checks: see `GEOMETRY-DEMO-STARTUP-HOTFIX-TESTS.txt`.
- Relative import target check: see `GEOMETRY-DEMO-STARTUP-HOTFIX-TESTS.txt`.
- Browser/WebGL runtime verification was not available in this pass.
