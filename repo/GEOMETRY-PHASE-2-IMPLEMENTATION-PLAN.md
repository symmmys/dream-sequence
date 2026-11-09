# Somnium — Geometry Integration / Phase 2 Implementation Plan

**Status:** Implemented with documented GPU and browser-runtime verification limits  
**Prepared:** November 7, 2026  
**Baseline:** Phase 1 geometry project archive

## 1. Objective

Connect the Phase 1 four-dimensional world-slice and corridor model to Babylon.js, add a reusable topographic-world generator, and provide a small third-person geometry demonstration that makes the new system visible immediately.

The demonstration will contain:

- A compact room centred near the source slice's world origin.
- A third-person player spawn inside that room, facing the anomaly.
- Simple, deliberately distinct meshes (floor, walls, columns, sphere, box, torus, and cylinder) for visual scale and projection checks.
- A 4D corridor mouth near the origin, with an explicit destination slice.
- A destination world generated from a valid topographic raster and shown through a portal preview.
- A visible corridor transition proxy derived from the authoritative 4D centreline and transported frames.
- A toggleable metric-debug grid.

The same topographic generation path must accept additional user-supplied maps; the demo map is only a fixture.

## 2. Repository findings that constrain the design

The project uses native browser ES modules loaded by `src/main.js`; Babylon.js is loaded as a global script from matching pinned CDN package releases. There is no `package.json`, bundler, or repository browser-test harness.

The active scene factory is `src/scene/create-scene.js` (739 lines). It loads one `HeightmapTerrain`, constructs one `SpatialTransform`, creates a `GeometryRenderer` and `GeometryShaderManager`, initializes one `WorldManager`, then creates the gameplay systems and update loop. `MainMenu` can start third-person mode, and `PlayerCharacter` / `PlayerController` already consume a small terrain-sampling interface.

The Phase 1 modules already supply the core records and mathematical operations:

- `spatial-4d.js`: R4 vectors, six plane rotations, slice frames, local/ambient conversion, perpendicular-frame construction and transport.
- `world-slice.js`: versioned slice identity and `(sliceId, chunkX, chunkZ)` address contract.
- `spatial-corridor.js`: cubic Bezier R4 centreline, endpoint records, radius profiles, tangent and transported-frame sampling.
- `world-topology.js`: explicit visibility and traversal edges; visibility is not traversal.
- `poincare-visual-scale.js`: bounded visual exaggeration separate from authoritative metric calculations.

The existing geometry integration is incomplete:

1. `GeometryShaderManager` is constructed in `create-scene.js`, but no scene setup call applies it to terrain or other meshes.
2. Its current `ShaderMaterial` fragment path uses one `baseColor`; it does not preserve the terrain's per-vertex color attribute.
3. `GeometryRenderer` performs CPU projection and recalculates normals, and `WorldChunk.applySpatialTransform()` calls that path. This is the active renderer path today.
4. `SpatialTransform` now accepts `euclidean`, `poincare`, `spherical`, and `inverted-poincare` chart profiles. The inverted chart excludes the projection centre and remains subject to bounded-chart numerical limits.
5. A single global transform is attached through `scene.metadata.geometryRenderer`; this cannot correctly choose a different geometry profile and bounds for each slice.
6. `WorldManager` chunk keys are `(x,z)` within one manager. Independent manager instances have isolated maps, but chunk metadata currently does not identify a slice.
7. `heightmap-terrain.js` and `height-map-terrain.js` are near-duplicates. The active scene imports the former. The active class mixes browser image loading, pixel sampling, and Babylon vector creation.
8. The existing scene factory and several managers contain long methods and anonymous callbacks, contrary to the strict named-function and small-method rules in the style guide.

### Baseline verification

Run against the supplied Phase 1 archive before changes:

- `node --test tests/*.test.mjs`: **34 tests passed**.
- `node --check` over `src/` and `tests/`: **97 files passed**.

### Topographic asset warning

The archive's `assets/0_somnium_map_topographic.png` is not a complete PNG. It is 1,107,667 bytes and declares dimensions 3000×8000, but has no terminal `IEND` chunk; Pillow's image verification reports a truncated PNG. Do not silently replace it with fabricated terrain or use it as the only acceptance fixture. The implementation should add a separate valid, deterministic demo topographic raster and leave the existing world asset untouched. Browser verification of the original map remains contingent on restoring its complete source asset.

## 3. Architectural decisions for Phase 2

### 3.1 Keep 4D world state authoritative

`WorldSlice`, `SpatialCorridor`, and `WorldTopology` remain engine-independent domain records. Babylon meshes, cameras, materials, render targets, and textures are derived resources owned by adapter modules and are never serialized into the domain records.

A source and destination slice must be registered before their corridor is registered. The corridor's four-dimensional endpoints must continue to agree with the corresponding slice-frame locations. Numeric `w` proximity must never create adjacency.

### 3.2 Add a slice runtime registry

Introduce one application-level registry that associates a slice ID with its runtime resources:

`sliceId -> { slice, terrain, spatialTransform, worldManager, render layer, lifecycle }`

For this phase, each independently loaded slice may have its own `WorldManager` instance. This reuses the existing chunk framework without conflating coordinate-identical chunks from different slices. A manager's north/south/east/west neighbours remain local to that manager. Phase 3 will replace this interim isolation with the shared computational scheduler and globally keyed slice-aware chunk addresses.

Every generated chunk and Babylon mesh must carry `sliceId` metadata. A mesh must never be projected using another slice's transform.

### 3.3 Separate topographic data from browser and Babylon adapters

Create a pure topographic data representation that can be tested in Node without `BABYLON`, `Image`, or `document`. Keep image decoding in a browser adapter. The world factory consumes decoded pixel data and options, then returns:

- A serializable `WorldSlice` record with a stable ID, W coordinate/frame, seed, and geometry profile.
- A runtime heightmap sampler with explicit extents and height range.
- A source-map reference and optional color/elevation legend metadata.

The factory must support URL, `Blob`/`File`, and already-decoded `ImageData`/pixel-buffer inputs. Decoding errors must identify the map and fail clearly.

A map's pixel colors are not automatically reliable elevation values. Support explicit channel/grayscale modes and a configurable color-band-to-elevation palette for hypsometric maps. If a colored map has no elevation encoding or legend, require the caller to provide one rather than inventing elevations.

Consolidate the duplicate heightmap implementations during this work. Preserve the public sampling behavior consumed by current gameplay systems; any compatibility adapter that returns Babylon vectors must be a small rendering/gameplay adapter around plain sample data.

### 3.4 Add slice-specific geometry bindings

Refactor the active geometry integration into a Babylon adapter that resolves the transform from `mesh.metadata.sliceId` (with a documented legacy default for the existing Somnium world). It must provide a CPU fallback and an opt-in GPU path.

The GPU path must not replace arbitrary existing materials with a simplified shader. Prefer a Babylon material-plugin/custom-material integration when the pinned runtime supports the required injection points; otherwise, use the dedicated shader path only for explicitly compatible materials and keep existing materials on the CPU fallback. Verify the exact API against the pinned Babylon.js runtime before committing to it.

The projection shader contract must preserve:

- Position and world-matrix semantics.
- Per-vertex RGBA colors (the existing terrain palette is authoritative).
- Material alpha and existing diffuse texture behavior on paths that claim to preserve them.
- Correctly transformed normals using the projection Jacobian (not merely `mat3(world) * normal`).
- Thin-instance transforms only when instance attributes and per-instance world matrices are explicitly supported; unsupported meshes must use the fallback.

The existing `ShaderMaterial` path is not sufficient as-is: its base-color-only fragment shader would erase terrain vertex coloration. Babylon's render-target and material customization features provide candidate integration points, but the selected path must be tested against the version actually used by the project. See the references at the end of this plan.

### 3.5 Define projection profiles explicitly

- **Euclidean:** identity transform and unit visual scale.
- **Poincare:** retain the current map-to-ball projection and intrinsic metric. Apply the bounded conformal visual expansion around each rendered mesh's projected anchor, not to authoritative coordinates or player/collision positions.
- **Spherical:** add a documented positive-curvature 3D spherical model with a stereographic coordinate chart and explicit chart limits. The renderer must not imply a globally distortion-free embedding of S3 in ordinary R3.
- **Inverted Poincare:** define this as Somnium's explicit exterior-ball inversion profile, not as a universally standardized geometry name. Use a guarded radial inversion around the configured sphere boundary, then the Poincare chart; reject or clamp the singular shell by an explicit epsilon. Keep the profile marked experimental until metric, inverse, and boundary tests pass.

The R4 corridor's ambient centreline remains Euclidean R4 in Phase 2. The geometry profile of either endpoint 3D slice is independent of the corridor's ambient 4D path.

### 3.6 Make the Poincare visual expansion local to rendered meshes

For a mesh with authoritative centre `c`, project its centre and vertices independently, then apply the bounded scale to the projected vertex offset around the projected centre:

`p_render = P(c) + S(r(c)) * (P(p) - P(c))`

This is a local visual exaggeration only. Camera/player positions, movement, collision, topology, and `SpatialTransform.worldToRender()` point conversion remain unscaled. Terrain can use a local patch anchor per chunk or a bounded per-vertex Jacobian approximation; do not expand a whole planet-sized mesh around one global origin.

The debug grid must use the same mesh-local transform and expose the profile, scale cap, and boundary margin in diagnostics. Toggle it from the demo HUD and with a documented keyboard shortcut.

### 3.7 Render the 4D corridor without misrepresenting it

A 4D tube with a three-dimensional normal cross-section cannot be represented losslessly by a single ordinary 3D mesh. The first Babylon view will therefore have two cooperating render representations:

1. A **3D corridor presentation proxy** generated from deterministic R4 corridor samples and their transported frames. Its mapping from R4 to display R3 is explicit and configurable. The proxy is a visualization, not authoritative corridor geometry.
2. A **portal preview surface** at the source mouth, displaying the destination slice through a Babylon render target and dedicated preview camera. Its render list includes only destination-slice meshes, and its texture/material resources are owned by the portal renderer.

Do not claim this is a complete 4D ray tracer or a lossless projection. The Phase 1 R4 centreline, radius and frame remain authoritative for future 4D traversal and the later transitional-coordinate mapping.

The portal preview is render-only: it must not make destination chunks active simulation neighbours. The destination's `WorldManager` may update at a low rate and low LOD only while a visible portal needs a preview. Disable recursive portal rendering and avoid updating the remote preview every frame when nothing relevant has changed.

### 3.8 Third-person demo mode

Add a dedicated **GEOMETRY DEMO** entry to the existing main menu. Selecting it must:

- Register a compact source room slice near `w = 0` and a separate topographic destination slice at a distinct `w`.
- Create the room's floor, walls, columns, and colored primitives as ordinary Babylon meshes tagged with the source `sliceId`.
- Create a deterministic flat room-floor sampler compatible with `PlayerCharacter` and `PlayerController`.
- Place the corridor entrance in a doorway near the room origin and register it in `WorldTopology` as visible and traversable (the traversable flag tests the topology contract; the player transfer state machine remains later work).
- Place the player near `(0, 0, -4)` facing the portal at approximately `(0, 1.5, +7)`; tune the third-person camera for a room-scale scene.
- Show the destination topographic world on the portal surface through a bounded-resolution render target.
- Provide a G-key / HUD grid toggle and a small geometry diagnostics readout.

The room and source-side geometry will use a deliberately small per-slice coordinate bound so the Poincare distortion and local object expansion are visually apparent. A menu option or debug toggle may compare Euclidean and Poincare presentation without mutating authoritative world state.

The demo corridor will be visible and registered but will not yet implement player movement through the 4D transition. Actual entry, cross-section offset transport, exit placement, and active-slice handoff remain Phase 4.

## 4. Planned modules and bounded responsibilities

| Module | Responsibility | Layer |
|---|---|---|
| `src/environment/topography/heightmap-data.js` | Pure pixel validation, elevation decoding, bilinear sampling, statistics | Domain/data |
| `src/environment/topography/browser-heightmap-loader.js` | URL / Blob / File decode to pixel data | Browser infrastructure |
| `src/world/topographic-world-factory.js` | Create a slice record and runtime terrain from map data/configuration | Application/domain orchestration |
| `src/world/slice-world-registry.js` | Register and dispose slice runtime bindings | Application |
| `src/world/fields/geometry/babylon-geometry-adapter.js` | Resolve per-slice transforms and select GPU/CPU mesh paths | Babylon infrastructure |
| `src/world/fields/geometry/geometry-renderer.js` | Refactored CPU projection fallback and mesh-local expansion | Babylon infrastructure |
| `src/world/fields/geometry/geometry-shader-manager.js` | Colour-preserving GPU projection for compatible materials | Babylon infrastructure |
| `src/world/fields/geometry/geometry-debug-grid.js` | Build/toggle a grid that follows the active visual transform | Presentation/rendering |
| `src/world/fields/geometry/corridor-renderer.js` | Convert 4D corridor samples into the configured 3D presentation proxy | Babylon infrastructure |
| `src/world/fields/geometry/portal-preview-renderer.js` | Own portal mesh, remote camera, render target, refresh policy | Babylon infrastructure |
| `src/demo/geometry-demo-world.js` | Compose room, topographic destination, topology edge, player spawn and menu action | Demo/application |
| `assets/geometry-demo-topography.png` | Small valid deterministic heightmap fixture for tests/demo | Asset |

Keep `create-scene.js` as a high-level composition root, but extract named setup/disposal operations for geometry services, slice runtimes, demo mode, and observers. Do not turn the scene factory into a new generic framework.

## 5. Implementation sequence

The implementation should be delivered as small independently verifiable work packages to avoid client timeouts.

### 2A — Runtime and terrain-data foundation

1. Record and pin the Babylon.js runtime version currently intended for the project; remove the unversioned CDN dependency only after confirming the matching loader build.
2. Extract pure topographic sampling from browser image decoding and consolidate the duplicate terrain classes.
3. Implement `TopographicWorldFactory` with grayscale/channel and explicit color-band elevation decoding.
4. Generate a small valid topographic demo fixture; do not alter the incomplete original map.
5. Add unit tests for pixel validation, sampling, elevations, deterministic slice creation, and disposal/error paths.

**Exit condition:** additional `WorldSlice` + terrain sampler records can be generated from multiple independent topographic inputs in Node tests, without Babylon.js or DOM globals.

### 2B — Slice-aware Babylon geometry integration

1. Add per-slice transform/runtime registration and put `sliceId` on chunk and mesh metadata.
2. Refactor the CPU geometry renderer to project mesh positions around stable anchors and transform normals correctly.
3. Integrate the GPU path only for compatible materials; preserve vertex colors and do not silently replace unsupported materials.
4. Add Poincare mesh-local expansion and a geometry-debug grid.
5. Implement and test spherical and guarded inverted-Poincare render profiles.
6. Add regression tests for apply/restore, chunk rebuilds, per-slice transform selection, vertex colors, and profile boundaries.

**Exit condition:** source and destination slice meshes can coexist in one Babylon scene and always resolve the correct transform; CPU fallback remains visually and numerically consistent with the GPU path for supported inputs.

### 2C — Corridor and destination portal preview

1. Build the corridor presentation proxy from `sampleSpatialCorridorFrames()`.
2. Add a portal surface whose material samples a destination-slice render target.
3. Isolate destination meshes with a dedicated render layer/list and preview camera.
4. Give the destination preview its own low-detail manager/preview budget; no simulation activation from visibility.
5. Add lifecycle-safe resize, refresh throttling, render-target disposal, and portal visibility tests.

**Exit condition:** a registered visible corridor displays the remote topographic slice, and hiding the portal stops preview work without unregistering or activating topology.

### 2D — Third-person geometry demo and scene integration

1. Create a small room and deterministic floor sampler.
2. Compose the room source slice, generated topographic destination, corridor, preview renderer, and geometry debug grid.
3. Add the menu entry and initialize the player/camera at the stated room coordinates.
4. Refactor only the portions of `create-scene.js` and `MainMenu` touched by this feature into named, short orchestration functions and callbacks.
5. Ensure all listeners, workers, render targets, materials, meshes and preview managers are disposed by their owner.

**Exit condition:** selecting GEOMETRY DEMO enters third-person mode with the room, nearby corridor and visible remote world. Returning to the main menu or disposing the scene leaves no demo resources or event listeners behind.

### 2E — Regression and runtime verification

1. Run the existing D&D, terrain-colour, and Phase 1 geometry tests unchanged.
2. Run all source/test syntax checks.
3. Add a browser smoke-test checklist for Chrome/Firefox WebGL, shader compilation, target texture refresh, third-person controls, and resize/disposal.
4. Record actual browser/GPU runtime results separately from Node unit tests.
5. Update `docs/STYLE-CONFORMANCE.md`, `docs/PROJECT-STATE.txt`, ADRs and an installation note to match what is implemented.

## 6. Acceptance tests

### Topographic world factory

- Accepts decoded pixel data and supported browser sources through separate interfaces.
- Rejects empty, malformed, non-finite, and unsupported raster data with actionable errors.
- Bilinear samples agree with exact pixel values at map texel centres and expected interpolants between them.
- Grayscale/channel decoding is deterministic; palette decoding requires explicit, validated elevation stops.
- Two factory outputs have independent IDs, seeds, dimensions and runtime terrain samplers.
- A factory output serializes only plain slice/map metadata, never DOM or Babylon objects.

### Slice-aware renderer

- A mesh tagged with `sliceId = A` uses only transform A, even if slice B has the same X/Z chunk coordinates.
- Euclidean projection is identity.
- Poincare projection stays inside the open ball and mesh-local expansion stays within `[1, maxScale]`.
- Camera/player positions and collision samples are not multiplied by the visual exaggeration factor.
- CPU projection preserves vertex colours, alpha, indices, and restorable original geometry.
- GPU projection preserves vertex colours and supported material behavior; incompatible materials select the documented fallback.
- Normals remain finite and correctly oriented after non-linear projection.
- Spherical and inverted-Poincare profiles reject invalid/singular-domain inputs and round-trip where their chart defines an inverse.

### Corridor / portal

- Rendered samples match the domain corridor's R4 samples and transported-frame order.
- The 3D display proxy is explicitly marked derived/render-only.
- Source portal texture displays only the target slice's registered meshes.
- A visible but non-traversable corridor can render a preview without enabling navigation or simulation.
- A hidden corridor stops target render refreshes; remote world state remains registered but inactive.
- Disposing the portal disposes its render target, camera, proxy meshes and material without disposing domain records.

### Geometry demo

- Menu selection enters third-person mode and puts the player inside the test room near origin.
- Room primitives and corridor mouth are visible from the initial camera framing.
- The portal contains a recognizable topographic destination generated from the fixture map.
- The grid toggle visibly enables/disables geometry diagnostics without altering terrain or topology.
- Switching perspective and returning to the menu do not duplicate the room, player, camera observer or render target.

## 7. Explicit exclusions from Phase 2

- Player traversal through the corridor and cross-section offset transport; Phase 4.
- Shared computational scheduler, global slice-aware chunk map, priority aging, job cancellation and unified CPU/GPU budgets; Phase 3.
- General 4D ray tracing, 4D rasterization, full 4D physics, and lossless projection of a 4D tube into 3D.
- Recursive portal rendering, multiple portal recursion, portal shadows, and full 4D lighting.
- Anomaly magic and dynamic topology editing.
- Replacing the incomplete original Somnium topographic asset without access to its original complete source.

## 8. Style-conformance requirements

The style guide's strictest rules apply to all newly written or substantially modified files:

- Every callback and function has an explicit descriptive name; no anonymous arrow callbacks.
- Keep methods at three lines where practical by extracting named operations. Longer code is allowed for isolated geometric algorithms, mesh generation, pixel decoding, and shader source where decomposition would impair clarity.
- Keep R4 math and topographic pixel decoding independent of Babylon.js and DOM APIs.
- Keep Babylon objects out of serializable world-slice/corridor records.
- Separate scene orchestration, resource creation, render updates, and resource disposal.
- Make resource ownership explicit; each preview renderer owns exactly the render target, portal material, preview camera resources and proxy meshes that it creates.
- Do not add one-line wrappers solely to satisfy a line-count metric; decomposition must clarify responsibilities.

### Files reviewed and current style status

Scores are carried forward from `docs/STYLE-CONFORMANCE.md`; planning did not edit these source files.

| File | Existing score | Phase 2 treatment |
|---|---:|---|
| `src/scene/create-scene.js` | 2.5/5 | Extract named setup/update/disposal operations; no full rewrite |
| `src/world/world-manager.js` | 3.0/5 | Add slice identity via a narrow option; defer scheduler extraction to Phase 3 |
| `src/world/world-chunk.js` | 3.5/5 | Add slice metadata and renderer binding without changing authoritative terrain data |
| `src/environment/heightmap-terrain.js` | 3.5/5 | Split pure sampling from browser decode and preserve compatibility |
| `src/environment/height-map-terrain.js` | 2.5/5 | Confirm unreferenced, then remove or turn into a documented re-export |
| `src/world/fields/geometry/geometry-renderer.js` | 3.5/5 | Refactor around pure transform helpers and local anchors |
| `src/world/fields/geometry/geometry-shader-manager.js` | 3.0/5 | Correct vertex-colour/material path and split shader source from resource lifecycle |
| `src/world/fields/geometry/spatial-transform.js` | Reviewed in Phase 1 ledger | Add profiles through composed projectors, avoid more conditionals |
| `src/world/fields/geometry/world-slice.js` | Phase 1 foundation | Preserve plain versioned records |
| `src/world/fields/geometry/spatial-corridor.js` | Phase 1 foundation | Reuse sampling; do not duplicate Bezier/frame math |
| `src/world/fields/geometry/world-topology.js` | Phase 1 foundation | Keep rendering preview separate from traversal activation |
| `src/ui/main-menu.js` | Not separately scored in prior targeted ledger | Add a named action and listener; do not put scene setup inside click callback |

## 9. Delivery format for the implementation step

The next step should deliver:

- A complete project ZIP.
- A replacement-files ZIP.
- A Phase 2 implementation report with exact changed-file list.
- The updated style-conformance ledger and architecture decision records.
- Test output, syntax-check count, asset-validation results, and an explicit browser-runtime verification statement.

Implementation should proceed in the 2A → 2B → 2C → 2D → 2E order. If the client budget requires a narrower delivery, stop at a work-package exit condition rather than returning a partly wired renderer that appears complete but is not integrated.

## 10. Babylon.js references consulted

These references inform the rendering integration options. Their APIs must still be verified against the exact pinned runtime used by this browser project:

- [Babylon.js custom render target example](https://www.babylonjs.com/Demos/CustomRenderTarget/source/) — demonstrates `RenderTargetTexture`, explicit render lists, scene render targets, and use as a material texture.
- [Babylon.js camera `customRenderTargets` API](https://doc.babylonjs.com/typedoc/classes/BABYLON.UniversalCamera) — describes camera-associated render targets.
- [Babylon.js material customization example](https://doc.babylonjs.com/features/featuresDeepDive/mesh/gaussianSplatting) — documents the `MaterialPluginBase` pattern for injecting custom shader code.
- [Babylon.js shadow documentation](https://doc.babylonjs.com/features/featuresDeepDive/lights/shadows) — explains why custom vertex deformation needs corresponding shadow handling; Phase 2 may disable shadows on the corridor proxy rather than imply unsupported correctness.


## 10. Implementation outcome (November 7, 2026)

Phase 2 was implemented in the source tree. See `GEOMETRY-PHASE-2-IMPLEMENTATION.md`, `docs/decisions/ADR-0002-babylon-slice-rendering-and-portals.md`, and `INSTALLATION-GEOMETRY-PHASE-2.txt` for the delivered modules, user controls, test results, and known limits.

Delivered: 2A topographic raster sampling/world factory and valid demo map; per-slice Babylon CPU mesh adapter and spherical/inverted-Poincare chart support; bounded Poincare mesh expansion and metric grid; 4D corridor display proxy; isolated portal render-target preview; and the third-person Geometry Demo/menu integration.

Implementation outcome: 46/46 Node tests and 104/104 source syntax checks plus 5/5 test-file syntax checks pass. Not fully delivered: the existing GPU shader manager is not activated because it replaces source materials and does not preserve arbitrary textures or vertex colours. A compatible GPU material-plugin path remains outstanding. Destination-world chunk streaming/simulation scheduling is still Phase 3, and player movement through the corridor is still Phase 4. A headless Chromium smoke attempt did not return DOM or screenshot output before the execution timeout; browser/GPU visual verification remains outstanding. Do not interpret passing Node tests or syntax checks as proof of a visual runtime pass.
