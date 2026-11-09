# Somnium — Geometry Phase 2 Implementation

Date: November 7, 2026  
Status: integrated source; browser/GPU acceptance remains outstanding.

## Delivered

### Topographic world generation

`BrowserHeightmapLoader` decodes a URL, Blob/File, or ImageData into a plain RGBA raster. `heightmap-data.js` validates raster dimensions and samples channel-based or RGB-palette elevation with bilinear interpolation. `TopographicWorldFactory` creates a versioned `WorldSlice`, terrain sampler, and serializable map metadata without importing Babylon.js.

Example:

```js
const loader = new BrowserHeightmapLoader();
const raster = await loader.load('/maps/highlands.png');
const { slice, terrain } = new TopographicWorldFactory().create({
    id: 'highlands',
    w: 80,
    geometry: 'spherical',
    seed: 41027,
    raster,
    heightChannel: 'luminance',
    minHeight: -100,
    maxHeight: 2400,
    worldSizeX: 12000,
    worldSizeZ: 9000
});
```

Register the returned slice with `WorldTopology` and connect it with a `SpatialCorridor`. Registering a visible corridor creates a preview relationship; it does not automatically make the destination a simulation neighbour. Traversal remains controlled by the topology's explicit `traversable` flag.

### Reusable topographic mesh generation

`topographic-terrain-mesh.js` converts any `TopographicTerrain` sampler into indexed Babylon vertex buffers and a mesh. Resolution is bounded by source raster dimensions and a configurable segment budget; the buffer builder is engine-independent and unit-tested. The Geometry Demo now uses this shared module instead of owning a private terrain-mesh implementation. New worlds can therefore use the same map loader, world factory, and mesh builder without copying demo code.

### Babylon slice rendering

`BabylonGeometryAdapter` selects a `GeometryRenderer` by `mesh.metadata.sliceId`. It bakes a mesh's current world transform before projection, keeps its existing material and vertex attributes, and supports restoration of original position/normal buffers. Each slice can use its own `SpatialTransform`.

The adapter currently uses the CPU geometry path. This is intentional: the existing `GeometryShaderManager.apply()` replaces the source material with a simple `ShaderMaterial`, which discards arbitrary StandardMaterial textures/properties and does not preserve the existing terrain vertex-colour palette. Enabling that shader path globally would regress the project. GPU projection remains a known Phase 2 gap until a material-plugin or explicit compatible-material path is implemented and tested.

The CPU renderer applies the bounded Poincare conformal scale around each mesh's average vertex anchor. Original simulation positions, collision sampling, and slice topology are unchanged. The debug grid uses the same slice transform and is controllable with `G` or the Geometry Demo HUD.

`SpatialTransform` supports Euclidean, Poincare, spherical-chart, and inverted-Poincare-chart projection. Spherical and inverted charts have chart domains/singularities; the inverted chart is undefined at the Poincare centre and rejects that point.

### Four-dimensional corridor and portal preview

`CorridorRenderer` samples the Phase 1 four-dimensional centreline and transported 3D cross-section frames, then builds a deliberately lossy 3D tube proxy. This mesh is presentation-only; the R4 corridor record remains authoritative.

`PortalPreviewRenderer` owns an isolated camera, render target, portal plane, and explicit destination render list. Destination meshes are assigned a dedicated layer visible only to the preview camera. The render target is registered only while the Geometry Demo is active and refreshed every second frame. Remote visibility does not run destination simulation.

### Geometry Demo

The main menu now offers **GEOMETRY DEMO**. It creates:

- a compact Poincare room centred near the origin;
- a third-person player spawn inside the room;
- visually distinct test shapes and a toggleable metric grid;
- a four-dimensional corridor near the room's positive-Z exit;
- an independent, generated spherical topographic world visible through the portal.

Controls: `WASD` move, `Shift` run, drag the left mouse button to turn, `G` toggle the metric grid, `Esc` pause, and the HUD can return to the main menu. The corridor is visible and registered as traversable in topology, but actual player transfer through it is intentionally deferred to the later traversal phase.

### Asset resilience

A valid, deterministic 512×512 grayscale heightmap was added at `assets/geometry-demo-topography.png`. The existing `assets/0_somnium_map_topographic.png` was left untouched because it is truncated. If its image decoder rejects the original asset, or the decoded raster has a suspicious transparent trailing region consistent with the supplied truncated file, `HeightmapTerrain` now loads the generated fixture as a fallback and reports `source` and `usingFallback` in diagnostics. This fallback is a resilience measure, not a replacement for the original large map.

### Runtime dependency

`index.html` pins Babylon core and loaders to matching `9.35.0` package releases. The unused Havok script was removed; no Havok APIs or physics integration were found in the inspected application source.

## Verification

- Node regression tests: **46/46 passed**.
- JavaScript syntax checks: **104/104 source files** and **5/5 test files** passed `node --check`.
- New PNG fixture: Pillow verification passed (512×512 RGB PNG).
- The complete `create-scene.js` dependency graph imported successfully in Node with a minimal Babylon global stub; browser-only rendering was not simulated.
- Relative source-module import audit: no missing imports; one worker URL includes a query string and was correctly excluded from filesystem-path checks.
- A headless Chromium smoke attempt did not return DOM or screenshot output before the execution timeout. Therefore actual GPU shader compilation, render-target appearance, third-person framing, and browser lifecycle are **not claimed as verified**; the normal-browser checklist below remains outstanding.

## Known limits and next steps

1. Implement a colour/texture-preserving GPU geometry path for explicitly compatible materials. Keep CPU fallback for all other materials.
2. Run the browser smoke checklist below in a normal local browser and tune portal framing, corridor thickness, room scale, and grid visibility from screenshots.
3. Phase 3 must make the chunk manager consume `(sliceId, chunkX, chunkZ)` and add render-only preview budgets. This implementation does not create active chunk adjacency across slices.
4. Phase 4 must add player movement through the corridor, transition cross-section offsets, destination spawn selection, and active-world handoff.
5. Additional topographic worlds can be created from independent rasters and rendered with the reusable mesh builder, but automatic chunk streaming/LOD per additional slice is not yet implemented.


## Browser smoke checklist (not yet executed)

1. Start the project using the supplied local HTTP-server instructions and confirm the main menu loads without console errors.
2. Select **GEOMETRY DEMO**; confirm the room and third-person player appear near the origin.
3. Walk forward toward the positive-Z doorway; confirm the portal displays the generated spherical topographic destination.
4. Press `G` repeatedly; confirm only the metric grid toggles and it follows the room geometry.
5. Drag with the left mouse button, move with `WASD`, and run with `Shift`; confirm camera/player controls remain active.
6. Press `Esc`, resume, return to the main menu, and enter the demo again; confirm no duplicate portal targets, listeners, or meshes accumulate.
7. Resize the browser and inspect portal aspect/framing and render-target refresh.
8. Inspect console and GPU diagnostics for shader compilation, WebGL errors, or resource warnings.


## Changed-file inventory

Relative to the supplied Phase 2 planning archive, this implementation changes or adds:

- `index.html` — pins matching Babylon core and loaders versions.
- `assets/geometry-demo-topography.png` — valid generated 512×512 destination heightmap.
- `src/environment/height-map-terrain.js`, `src/environment/heightmap-terrain.js`, and `src/environment/topography/{browser-heightmap-loader.js,heightmap-data.js}` — compatibility re-export, terrain fallback, raster decode and sampling.
- `src/world/topographic-world-factory.js` and `src/world/slice-world-registry.js` — independent topographic slice creation and runtime ownership.
- `src/world/fields/geometry/{babylon-geometry-adapter.js,corridor-renderer.js,geometry-debug-grid.js,portal-preview-renderer.js,topographic-terrain-mesh.js}` — per-slice mesh routing, reusable topographic mesh generation, 3D corridor proxy, metric grid, and isolated portal target.
- `src/world/fields/geometry/{geometry-renderer.js,spatial-transform.js}` — local bounded mesh expansion and spherical/inverted-Poincare charts.
- `src/demo/geometry-demo-world.js` — room, player, destination terrain, topology, corridor, and portal composition.
- `src/game/{game-manager.js,player-character.js,player-controller.js,camera-controller.js}`, `src/ui/main-menu.js`, and `src/scene/create-scene.js` — registered spatial mode, slice identity/scale, named input handlers, menu controls, update and disposal integration.
- `tests/{topography-generation.test.mjs,spatial-game-mode.test.mjs}` — focused data, transform, adapter, fallback, and mode lifecycle tests.
- `docs/decisions/ADR-0002-babylon-slice-rendering-and-portals.md`, `docs/STYLE-CONFORMANCE.md`, `GEOMETRY-PHASE-2-IMPLEMENTATION-PLAN.md`, this report, and `INSTALLATION-GEOMETRY-PHASE-2.txt` — architecture, conformance, plan status, validation, and installation notes.
