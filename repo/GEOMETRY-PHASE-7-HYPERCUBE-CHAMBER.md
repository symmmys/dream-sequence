# Geometry Phase 7 — Hypercube Chamber and Anomaly Route

Implementation prepared: November 8, 2026  
Build: `2026-11-08-hypercube-chamber-1`

## Scope

Add a second geometry test chamber whose only chamber object is a rotating 4D hypercube, connect it to the existing Poincare chamber using the existing corridor-chunk and traversal architecture, and make it the default target of the Geometry Demo menu option.

The existing Poincare chamber and its anomaly to the live Somnium main world are preserved. The route is now:

```text
4D Hypercube Chamber
  (geometry-demo-4d-chamber, w = 140)
          |
          | geometry-demo-4d-corridor (corridor chunk)
          v
Poincare Chamber
  (geometry-demo-room, w = 0)
          |
          | geometry-demo-corridor (corridor chunk)
          v
Somnium Main World
  (somnium-main)
```

Both corridors are bidirectional and traversable. Each has its own authoritative `SpatialCorridor`, `CorridorChunk`, and `CorridorTraversalController`; `CorridorTraversalNetwork` selects the route connected to the current slice and keeps entity updates on other corridor controllers running.

## Hypercube representation

The chamber contains a single tesseract: 16 vertices and 32 edges. It is rotated in the XW plane using the existing four-dimensional rotation primitive, then perspective-projected from R4 to R3 for Babylon rendering. This is the appropriate mathematical interpretation of a rotation involving the fourth coordinate: in 4D, a simple rotation is defined in a plane (here XW), not around a lone axis.

The projection depends on the free camera's fourth-coordinate `viewerW`, so E/Q movement changes the observed 3D cross-section/projection even though Babylon's camera remains a 3D camera. The renderer updates one persistent Babylon line-system mesh and owns/disposes its material and mesh.

The mathematical implementation is intentionally engine-independent in `src/world/fields/geometry/hypercube-4d.js`. The Babylon adapter lives in `src/demo/hypercube-4d-renderer.js`.

## Chamber layout and controls

- The hypercube chamber is an open test volume without floor, ceiling, walls, or decorative objects.
- The tesseract is the only chamber object; corridor mouth/rim and corridor shell are traversal infrastructure.
- The metric grid is hidden on entry and remains available with `G`.
- The Geometry Demo menu option starts in the hypercube chamber with the player-follow camera, preserving the previously specified default. `C` or the HUD button enters free inspection mode.
- `W/S`: forward/back along the 3D camera heading.
- `A/D`: horizontal strafe.
- `R/F`: vertical movement.
- `E/Q`: positive/negative fourth spatial coordinate while inside the 4D chamber.
- Inside a corridor: `W/S` moves along the corridor tangent; `A/D`, `R/F`, and `E/Q` move along the three transported cross-section axes.
- Mouse drag: look; wheel: movement speed; Shift: faster; `C`: follow/free camera toggle; `G`: metric grid.

The camera's W coordinate is bounded by the chamber's configured W interval. The tesseract projection reads that value each frame.

## Topology and runtime integration

- The new slice is Euclidean and assigned `w = 140`, independently addressable from the Poincare chamber and main world.
- The existing Poincare-to-main-world corridor and its live `WorldManager` integration remain intact.
- The new 4D corridor is registered in both `WorldTopology` and `SpatialChunkGraph`.
- The Poincare chamber is now an intermediate slice with two traversable outgoing routes.
- All traversal controllers are initialized against the same current slice; network callbacks synchronize slice state after entry and exit.
- The player's active route is chosen from graph neighbours of the current slice; no w-coordinate proximity creates adjacency.
- The menu HUD label tracks whether the camera is in the hypercube chamber, Poincare chamber, or main world.

## Files added or materially changed

- Added `src/world/fields/geometry/hypercube-4d.js` — pure tesseract topology, XW rotation, and bounded 4D perspective projection.
- Added `src/demo/hypercube-4d-renderer.js` — Babylon line-mesh adapter with explicit resource ownership.
- Added `src/demo/corridor-traversal-network.js` — multi-corridor orchestration using existing traversal controllers.
- Changed `src/demo/geometry-demo-topology.js` — registers the hypercube slice and corridor while preserving the existing main-world route.
- Changed `src/demo/geometry-demo-world.js` — builds the second chamber, portals, corridor renderers, world bindings, shared traversal network, and default spawn/view.
- Changed `src/demo/geometry-demo-camera-controller.js` — adds bounded free-camera W movement in 4D regions and route selection among multiple outgoing corridors.
- Changed `src/ui/main-menu.js` and `src/scene/create-scene.js` — relabel the menu option/HUD and report the active chamber.
- Changed `index.html`, `src/main.js`, and versioned import chains — new build identifier `2026-11-08-hypercube-chamber-1`.
- Changed `tests/world-manager-visibility.test.mjs` — updates the cache-busting assertion to the current build identifier.
- Added/expanded tests for tesseract topology, projection, Babylon renderer lifecycle, multiple-route selection, sequential corridor-chain traversal, chamber default, and camera W-axis motion.

## Verification

- Node tests: **119/119 passed**.
- JavaScript syntax: **113/113 source files** and **16/16 test files** pass `node --check`.
- Relative static import targets: **202 checked, 0 missing**.
- Full project and replacement patch ZIP archives pass `unzip -t` integrity checks.
- Babylon renderer lifecycle is exercised with a focused API stub, including in-place line-system update and owned-resource disposal.

A headless Chromium smoke attempt stalled before DOM output (25-second timeout). Therefore this package does **not** claim live browser/WebGL verification. The target browser still needs to confirm the menu starts in the new chamber, the tesseract rotates visibly, E/Q changes its projection, the two anomalies are visible, and crossing each corridor reaches the next slice.

## Known scope boundaries

- The hypercube is a perspective-projected wireframe tesseract, not a volumetric 4D solid or a physically based 4D renderer.
- The camera's fourth-coordinate movement changes the viewing slice/projection; it does not move the player character's authoritative 3D body along W outside a corridor.
- Full NPC/physics actor dispatch remains the previously documented integration task.
- GPU-accelerated 4D projection is not introduced in this phase.
