# Geometry Demo Repair

## Summary

This repair addresses the two runtime errors reported while entering and moving around the Geometry Demo. It also improves the test chamber's visibility and object identification.

## 1. Primary topographic PNG

`assets/0_somnium_map_topographic.png` existed at the expected path, but its PNG image stream was physically truncated. It declared dimensions of 3000 x 8000 while only the first 6203 rows contained recoverable raster data; the final 1797 rows decoded as transparent. This was the reason `HeightmapTerrain.assertCompleteRaster()` rejected it and selected the fallback.

The recoverable rows have been decoded and re-encoded as a valid 3000 x 6203 RGBA PNG. The original usable map data is retained, the invalid transparent tail is removed, and the ordinary primary-map path remains unchanged. The fallback remains available for future genuine load failures.

## 2. Third-person camera bounds

The demo camera boom was calculated as an offset from the player. The player could move close enough to the room's terrain limits that this offset placed the camera outside the Poincare projection bounds. `worldToBall()` correctly rejected that invalid position, but the camera controller did not constrain its derived camera positions.

The repair:

- Expands the demo slice's projection envelope to contain the open chamber and third-person camera range.
- Clamps only the derived camera position and look target to a tiny interior margin of the slice projection bounds.
- Leaves player coordinates and `PoincareProjection.worldToBall()` strict; it does not silently project invalid world state.
- Adds regression tests for the camera clamp and for continued rejection of out-of-bounds authoritative positions.

## 3. Open geometry chamber

The room footprint is now 48 x 60 world units. Solid side/back walls and the ceiling beam have been removed. Thin luminous floor-edge guides and four peripheral columns preserve a readable chamber boundary without obstructing the view.

The four sample forms are separated across the floor:

- Amber sphere
- Violet cube
- Green cylinder
- Blue torus

Each receives a camera-facing Babylon `DynamicTexture` label. A chamber title and a separate `4D CORRIDOR | DESTINATION W = 80` label identify the scene and anomaly. The corridor mouth remains close to the world origin at z = 20.

The third-person spawn and camera framing were adjusted for the larger footprint. `G` continues to toggle the metric debug grid.

## 4. Files changed

- `assets/0_somnium_map_topographic.png` — repaired PNG stream and cropped to the recoverable raster height.
- `src/game/camera-controller.js` — camera-derived position bounds guard.
- `src/demo/geometry-demo-world.js` — open chamber, larger bounds, separated forms, billboard labels, and camera framing.
- `tests/geometry-demo-regression.test.mjs` — new camera-boundary regression coverage.
- `docs/STYLE-CONFORMANCE.md` — updated review notes.

## 5. Verification

- Node test suite: 48/48 passing.
- Source syntax checks: 104/104 passing.
- Test syntax checks: 6/6 passing.
- Relative import targets: all resolved.
- Primary PNG: decodes fully with a standard PNG reader; dimensions 3000 x 6203; no transparent trailing rows.
- Complete project ZIP and replacement-files ZIP: integrity checks passed.

No browser/WebGL runtime test was completed during this repair. The browser console should be checked for the original heightmap warning and camera exception after installing this archive. The in-scene label layout, portal composition, and camera framing still require visual confirmation on the user's GPU/browser.

## 6. Out of scope

This is a presentation and crash repair only. It does not implement actual player traversal through the four-dimensional corridor, destination-world simulation activation, or the shared computational scheduler.
