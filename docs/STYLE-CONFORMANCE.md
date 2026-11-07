# Somnium — Source Style-Conformance Ledger

Last updated: November 7, 2026 — terrain rendering repair  
Maintained alongside source changes and reviews.

## Purpose

This document records how inspected source files conform to `docs/STYLE-GUIDE.txt`.
It is intended to prioritize future refactoring, not to block focused bug fixes.

**Maintenance rule:** whenever a source file is opened and meaningfully reviewed during
AI-assisted development, update its entry here in the same work session. Record the
review date, score, concrete strengths, remaining gaps, and next refactoring priority.
Do not assign a score to files that have not been inspected. Reassess a score when a
later review materially changes the evidence.

## Rating rubric

| Score | Interpretation |
|---:|---|
| 1.0 | Major architectural or style-guide violations; difficult to maintain safely. |
| 2.0 | Significant responsibilities or conventions are mixed; focused improvements exist. |
| 3.0 | Mixed conformance; sound boundaries exist, but notable inconsistencies remain. |
| 4.0 | Largely aligned; limited, contained improvements remain. |
| 5.0 | Strong conformance to the guide, supported by clear boundaries and testability. |

Half-point scores are permitted. Scores are qualitative review judgments, not automated
lint or test results. A high score does not imply runtime correctness.

## Current source review

### `src/game/dnd-mode.js`

**Score: 3.0 / 5**  
Reviewed: November 6, 2026  
Review depth: targeted complete review of movement, grid placement, character rendering,
altitude, persistence, camera integration, and lifecycle paths; modified and behavior-tested.

**Strengths**

- Keeps `DnDBattle` authoritative for initiative, movement accounting, action use, and bonus
  actions; `DnDMode` coordinates tactical operations and renderer updates.
- Uses `SpatialTransform` for world-to-render conversion and terrain samples for character
  ground elevation, with altitude stored as serializable character state.
- Places a single character at the geometric center of its cell. Multiple occupants are arranged
  on a centered ring, and their model scale is reduced to keep their horizontal footprints apart.
- Explicitly passes the selected movement-region type into movement processing. Selecting an
  amber Dash-region cell consumes the Dash action; ordinary movement does not consume an action.
- Decomposes movement validation, destination creation, Dash validation, movement completion,
  occupancy layout, preview-range calculation, grid-origin rollback, battle restoration, replay
  orchestration, constructor initialization, and character-mesh construction into named
  operations.
- The inspected D&D mode contains no anonymous function expressions or arrow callbacks.

**Remaining gaps**

- The module still combines application orchestration, Babylon.js rendering, camera and pointer
  input, browser persistence, and tactical lifecycle responsibilities.
- The disposal path, some grid/mesh generation routines, gamepad handling, and a few lower-level
  rendering methods remain longer than the style guide's three-line ideal.
- Babylon.js and browser storage remain direct dependencies, which makes full integration tests
  harder to run without the application host.
- Movement distance currently uses the established Manhattan-cell rule; alternative tabletop
  diagonal-distance rules are not modelled here.

**Refactoring priority**

- **P1:** extract the grid geometry renderer and persistence adapter from `DnDMode` while
  preserving the current public application methods.
- **P1:** run browser integration tests for non-linear terrain projection, pointer picking,
  crowded cells, flight altitude, and save/reload behavior.
- **P2:** isolate camera behavior and pointer picking behind narrow collaborators.
- **P2:** continue decomposing lifecycle and hardware-input methods when those areas are next
  modified; avoid broad rewrites during editor stabilization.

### `src/game/dnd-tactical-ui.js`

**Score: 3.0 / 5**  
Reviewed: November 6, 2026  
Review depth: targeted complete review of grid, movement, action economy, character, altitude,
focus controls, refresh paths, and event wiring; modified in the preceding editor repair and
reviewed for this refinement.

**Strengths**

- Keeps DOM construction and presentation in `DnDTacticalUI` rather than moving UI concerns
  into `DnDBattle`.
- Delegates grid changes, movement, camera behavior, character altitude, and removal through
  `DnDMode` application methods.
- Provides separate rows, columns, and cell-size inputs, an always-available character focus
  control, altitude inputs, and separate movement, action, and bonus-action panels.
- Action options include Dash; the movement help distinguishes normal movement from the amber
  region that spends the action.
- Uses named event-handler methods and contains no anonymous function expressions or arrow
  callbacks in the inspected source.
- Decomposes tab construction, character creation, grid controls, and refresh operations into
  smaller named methods.

**Remaining gaps**

- The class remains a large DOM builder containing tab construction, event wiring, rendering,
  refresh logic, and presentation styling.
- Several low-level DOM construction methods remain around 20–33 lines; the class still uses
  inline styles and broad refresh passes.
- Character-creation form application still assigns a group of editable character properties
  from the validated form model; a dedicated character-configuration operation would tighten
  the presentation/application boundary further.

**Refactoring priority**

- **P1:** browser-test controls and interaction states for movement, Dash, altitude, focus, and
  persistence before splitting the view into separate modules.
- **P2:** move Battle, Characters, Grid, and Settings presentation into focused view modules.
- **P2:** centralize presentation tokens/styles and route character creation through a single
  application-level configuration method.

### `src/game/camera-controller.js`

**Score: 3.5 / 5**  
Reviewed: November 6, 2026  
Review depth: complete source review; no changes in this repair.

**Strengths**

- Encapsulates third-person camera behavior in a dedicated controller.
- Receives the scene, camera, character, and spatial transform explicitly.
- Exposes configuration through an options object and has explicit enable/disable/dispose
  lifecycle methods.
- Removes its wheel listener during disposal.

**Remaining gaps**

- Depends directly on Babylon.js globals and a concrete camera implementation.
- Owns a DOM wheel listener, coupling camera behavior to browser input infrastructure.
- The controller could expose a more renderer-independent camera-follow contract.

**Refactoring priority**

- **P2:** separate wheel-input handling from camera-follow calculations if another camera
  controller or input mode needs to reuse them.
- **P3:** define a narrow camera adapter only when an additional implementation is required.

### `src/game/dnd-battle.js`

**Score: 4.0 / 5**  
Reviewed: November 6, 2026  
Review depth: focused source re-review of movement accounting, Dash action handling, initiative,
serialization, and resource ownership; behavior-tested.

**Strengths**

- Keeps initiative, turn progression, actions, bonus actions, movement accounting, and battle
  history in a focused domain model.
- Movement remains separate from action and bonus-action expenditure; Dash doubles the
  movement allowance only after the action resource has been consumed.
- Has no Babylon.js or DOM dependency.
- Provides explicit serialization and restoration through `toJSON()` and `fromJSON()`.
- Maintains a clear distinction between authoritative battle state and rendered character
  representations.

**Remaining gaps**

- Uses browser/runtime `crypto` global directly for IDs.
- JSON stringify/parse is used as a general deep-clone mechanism.
- `start()`, `move()`, and `toJSON()` remain longer than the guide's preferred granularity.
- Some domain operations could use more isolated validation helpers.
- The inspected source contains no anonymous function expressions or arrow callbacks.

**Refactoring priority**

- **P2:** inject an ID-generation capability or shared ID utility and define clone/validation
  behavior for supported persisted data.
- **P3:** add domain tests for turn order, resource accounting, migration, and replay history.

### `src/game/dnd-character.js`

**Score: 4.0 / 5**  
Reviewed: November 6, 2026  
Review depth: focused source re-review of character construction, position data, altitude
persistence, and serialization; behavior-tested.

**Strengths**

- Represents character information as serializable data rather than renderer objects.
- Persists altitude as part of the plain character position record and defaults legacy saves
  without an altitude field to ground level.
- Has explicit `toJSON()` and `fromJSON()` methods.
- Keeps character statistics and basic health operations independent of the UI and Babylon.js.
- Does not import unrelated application systems.

**Remaining gaps**

- Uses the runtime `crypto` global directly for identity generation.
- Uses JSON serialization for deep cloning nested values.
- Constructor defaults are permissive and there is limited validation of loaded numeric values,
  statistics, and nested data.
- `constructor()` and `toJSON()` remain longer than the guide's preferred granularity; the
  inspected source contains no anonymous function expressions or arrow callbacks.

**Refactoring priority**

- **P2:** introduce explicit validation at restoration boundaries and share a defined identity
  / cloning utility with battle persistence.
- **P3:** add focused tests for serialization round trips, modifiers, damage, and healing.

### `tests/dnd-tactical-logic.test.mjs`

**Score: 4.5 / 5**  
Reviewed: November 6, 2026  
Review depth: authored and executed focused regression coverage.

**Strengths**

- Uses Node's built-in test runner and strict assertions without adding a dependency.
- Uses descriptive named test functions and named callbacks; no anonymous callback functions.
- Covers altitude serialization and legacy defaults, separate movement/action/bonus resources,
  Dash action consumption, blocking Dash after another action, movement preview ranges,
  cell-centered coordinates, co-occupancy spacing, rendered altitude, and altitude retention
  when moving.

**Remaining gaps**

- Uses prototype-based test doubles for Babylon.js and terrain/transform integration.
- Does not replace browser-level tests of real mesh projection, pointer picking, rendering,
  and localStorage persistence.

**Refactoring priority**

- **P2:** extend the suite when new tactical rules or character-positioning behavior is added.
- **P1:** add browser integration coverage once the editor's browser test harness is available.

## Review coverage

The game files listed above and the tactical regression test file have been reviewed in this
cycle. Other source files remain unreviewed; their absence from this table must not be
interpreted as conformance.

Project guidance consulted (not scored as source):

- `docs/STYLE-GUIDE.txt`
- `docs/AI-ENTRYPOINT.txt`
- `docs/PROJECT-STATE.txt`
- `docs/DEPENDENCY-GRAPH.md`
- `docs/summaries/src/game/SUMMARY.txt`

## Review history

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-06 | `dnd-mode.js`, `dnd-tactical-ui.js`, `camera-controller.js`, `dnd-battle.js`, `dnd-character.js` | Initial review ledger; D&D camera and rectangular-grid repair. |
| 2026-11-06 | `dnd-mode.js`, `dnd-tactical-ui.js`, `dnd-battle.js`, `dnd-character.js`, `tests/dnd-tactical-logic.test.mjs` | Re-reviewed movement/ Dash action economy, cell-centred formation, altitude persistence, and named-function conformance; added eight passing regression tests. |

### `write_summary.sh`

**Score: 3.5 / 5**  
Reviewed: November 6, 2026  
Review depth: complete script review; no changes in this repair.

**Strengths**

- Uses strict Bash error handling (`set -Eeuo pipefail`).
- Separates generation tasks into named shell and Python functions.
- Writes generated documentation through temporary files and atomic replacement.
- Has explicit exclusions for generated/dependency directories and documents generator limits.
- Treats generated summaries as derived documentation rather than application state.

**Remaining gaps**

- Combines Bash orchestration and a substantial embedded Python implementation in one file.
- The generator is a large, multi-purpose script handling source discovery, parsing, summaries,
  dependency analysis, tree generation, and source concatenation.
- Some implementation details, such as export/import discovery, are regex-based and necessarily
  incomplete for complex JavaScript syntax.

**Refactoring priority**

- **P2:** consider extracting the embedded Python generator into a dedicated script/module while
  preserving the existing `./write_summary.sh` entry point.
- **P3:** add fixture-based tests for import/export discovery, chunk boundaries, and atomic output.

## Terrain rendering review — November 7, 2026

### `src/world/terrain-color.js`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: new module; complete design and implementation review; unit-tested.

**Strengths**

- Provides a pure, deterministic terrain surface-color algorithm with no Babylon.js or browser
  dependency.
- Centralizes the provisional topographic-elevation-to-soil mapping, soil palette, bedrock blend,
  surface variation, and snow transition.
- Exposes the same function to both the worker and synchronous renderer, preventing palette drift.
- Uses named helper functions and protects color generation from non-finite input values.
- Keeps the soil palette and elevation thresholds together so they can later be replaced by a
  world-space soil-distribution texture without changing mesh-generation code.

**Remaining gaps**

- Soil classes and thresholds are still provisional and are inferred from normalized elevation;
  they are not a true independent soil-distribution model.
- The procedural noise seed and color constants are currently code-defined rather than supplied
  through a versioned terrain-material configuration.

**Refactoring priority**

- **P2:** move soil thresholds, palettes, and noise configuration into serializable material
  definitions when the terrain material system is formalized.
- **P2:** replace the elevation proxy with the intended 2D soil-distribution texture when that
  asset becomes available.

### `src/world/terrain-mesh-worker.js`

**Score: 4.0 / 5**  
Reviewed: November 7, 2026  
Review depth: complete source review; repaired and covered by a worker-message regression test.

**Strengths**

- Keeps CPU-intensive terrain mesh generation in a dedicated worker module.
- Delegates surface color decisions to the shared pure `terrain-color.js` module.
- Splits buffer creation, edge stitching, vertex sampling, buffer writes, index generation,
  initialization validation, transfer, and error reporting into named operations.
- Contains no anonymous function expressions or arrow callbacks.
- Validates heightmap dimensions and transferred pixel-buffer length before accepting work.
- Rejects non-finite generated color components before transferring a chunk to the main thread.

**Remaining gaps**

- The worker still owns module-level terrain state and communicates through stringly typed
  messages rather than a separately documented protocol.
- The LOD edge-stitching algorithm is a substantial low-level routine and needs coverage across
  mixed-neighbor LOD combinations.
- Actual browser Worker scheduling, transfer behavior, and Babylon.js mesh application have not
  been exercised in this repair session.

**Refactoring priority**

- **P1:** add browser integration tests for worker initialization, failure fallback, chunk
  generation, and LOD stitching.
- **P2:** define and validate a narrow worker message contract if more terrain worker operations
  are introduced.

### `src/world/world-chunk.js`

**Score: 3.5 / 5**  
Reviewed: November 7, 2026  
Review depth: complete source review; fallback coloring, buffer validation, mesh lifecycle, and
worker result application were refactored.

**Strengths**

- Gives each chunk explicit ownership of its mesh, revision, loaded state, and disposal lifecycle.
- Validates vertex-buffer lengths and rejects non-finite color data before creating a Babylon.js
  mesh.
- Uses the same terrain-color model as the worker for synchronous fallback generation.
- Separates mesh creation, material configuration, picking metadata, spatial projection, vertex
  sampling, buffer writing, and index generation into named methods.
- Contains no anonymous function expressions or arrow callbacks.

**Remaining gaps**

- The class still combines chunk state, Babylon.js resource management, terrain sampling, and
  fallback geometry generation.
- Fallback generation duplicates the worker's geometry algorithm, although both paths now share
  the color algorithm.
- `applyMeshData()` converts typed buffers to ordinary arrays, which may create avoidable copies.

**Refactoring priority**

- **P1:** verify worker and fallback produce visually equivalent chunks under real browser
  rendering and non-Euclidean projection.
- **P2:** extract a reusable mesh-data adapter or generator only if it reduces duplication without
  adding unnecessary abstraction.

### `src/world/world-manager.js`

**Score: 3.0 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of terrain material ownership, worker initialization and message
handling, task queues, fallback generation, chunk lifecycle, and disposal; not modified.

**Strengths**

- Owns the shared terrain material and the lifecycle of streamed chunks.
- Separates worker scheduling from chunk mesh application and retains a synchronous fallback.
- Uses task revisions to prevent stale worker results from replacing newer chunk geometry.
- Exposes useful operational statistics for worker activity and mesh queues.

**Remaining gaps**

- Worker lifecycle, task scheduling, chunk streaming, material ownership, and fallback processing
  remain combined in one large manager.
- Several long methods and anonymous callbacks remain, including worker setup, queue processing,
  and streaming updates.
- Worker initialization and task-queue behavior are not covered by focused automated tests.

**Refactoring priority**

- **P1:** add tests for worker startup failure, initialization timeout, stale task results, and
  fallback queue completion.
- **P2:** separate worker scheduling from spatial chunk streaming while retaining `WorldManager`
  as the application-facing coordinator.

### `src/environment/heightmap-terrain.js`

**Score: 3.5 / 5**  
Reviewed: November 7, 2026  
Review depth: source review of image loading, pixel extraction, coordinate mapping, height sampling,
map-value sampling, diagnostics, and disposal; active scene import.

**Strengths**

- Represents the heightmap as a terrain sampling service rather than a rendering mesh.
- Keeps map pixels and world dimensions as data and offers explicit coordinate and height sampling.
- Provides diagnostics for sampled height range and image dimensions.
- Supplies `sampleMapValue()` for a separate topographic map-value query.

**Remaining gaps**

- Image loading and canvas extraction are directly coupled to browser APIs.
- `sampleHeight()` and `sampleMapValue()` repeat the same bilinear pixel-sampling algorithm.
- Pixel access and image dimensions could use stricter validation and explicit sampling contracts.
- The bundled topographic PNG appears truncated: its PNG stream ends without an IEND chunk and
  the compressed image data ends before the full declared image dimensions are decoded. The
  current repair does not synthesize or replace missing source map data.

**Refactoring priority**

- **P1:** replace the incomplete topographic PNG with the original complete asset and verify
  browser decoding before trusting the full world's terrain distribution.
- **P2:** consolidate bilinear sampling and separate browser image loading from the terrain data
  sampler.

### `src/environment/height-map-terrain.js`

**Score: 2.5 / 5**  
Reviewed: November 7, 2026  
Review depth: compared against the active `heightmap-terrain.js` implementation; not modified.

**Strengths**

- Exposes the same general heightmap-terrain concept and closely matching public methods.

**Remaining gaps**

- It is a near-duplicate of `heightmap-terrain.js` with small formatting and implementation
  differences.
- Duplicate implementations can diverge and make it unclear which source is authoritative.
- The active scene imports `heightmap-terrain.js`; this hyphenated variant was not found on the
  active scene path during this targeted review.

**Refactoring priority**

- **P1:** inventory imports and consolidate the two implementations into one authoritative module
  before either receives further feature work.

### `src/geology/geological-field.js`

**Score: 3.0 / 5**  
Reviewed: November 7, 2026  
Review depth: complete source review of soil selection, geological classification, surface
properties, horizons, and sampling outputs; not modified.

**Strengths**

- Encapsulates geological sampling and returns plain data describing soil, bedrock, and horizons.
- Separates surface-soil properties from bedrock properties.
- Uses a terrain sampling interface rather than creating render meshes directly.

**Remaining gaps**

- `sample()` combines topographic classification, noise sampling, geology, exposure, soil
  horizons, and material-property assembly in one long method.
- Soil classification thresholds are duplicated between this domain model and the terrain
  renderer's provisional color model.
- The module uses inline formatting and long conditional sections that are difficult to review.

**Refactoring priority**

- **P2:** extract named soil-classification and soil-horizon operations while preserving
  `GeologicalField` as the domain-facing sampler.
- **P2:** establish one shared soil-classification definition when domain and rendering semantics
  are ready to be unified.

### `src/world/fields/geometry/geometry-renderer.js`

**Score: 3.5 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of mesh transformation, normal recalculation, original-geometry
caching, restoration, and world reprojection; not modified.

**Strengths**

- Centralizes world-to-render coordinate conversion rather than embedding projection math in
  terrain chunks.
- Uses a `WeakMap` to preserve original mesh positions and normals for restoration.
- Separates apply, restore, restore-world, and reproject-world operations.
- Preserves vertex colors and materials while changing geometry positions and normals.

**Remaining gaps**

- Depends directly on Babylon.js mesh and vertex-buffer APIs.
- `applyMesh()` and related operations still perform substantial geometry work inline.
- The transform cache is tied to mesh instances, so integration tests need to exercise rebuilds
  and resource disposal as well as ordinary projection.

**Refactoring priority**

- **P2:** isolate vertex transformation and normal recalculation behind testable geometry
  operations if another renderer needs to reuse them.
- **P1:** browser-test terrain color preservation after CPU projection and chunk rebuilds.

### `src/world/fields/geometry/geometry-shader-manager.js`

**Score: 3.0 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of shader creation, uniforms, mesh application, and material restore;
not modified.

**Strengths**

- Keeps the GPU projection shader and shader-material lifecycle in a dedicated module.
- Exposes explicit `apply()`, `restore()`, `setEnabled()`, and `dispose()` operations.
- Stores original materials separately from temporary projection materials.

**Remaining gaps**

- The current fragment shader uses a uniform base color and does not pass terrain vertex colors
  through a vertex-color attribute/varying path.
- Babylon.js shader compilation and binding remain difficult to test without a browser/GPU context.
- Several shader and material setup methods are longer than the style guide's preferred granularity.

**Refactoring priority**

- **P1:** preserve per-vertex terrain color if this GPU material path is ever enabled for terrain.
- **P2:** move reusable shader source and uniform contracts into a narrowly defined shader module.

### `src/scene/create-scene.js`

**Score: 2.5 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of scene setup, lights, heightmap construction, spatial renderer setup,
world initialization, update loop, and diagnostics; not modified.

**Strengths**

- Makes initialization dependencies visible in one place.
- Constructs the heightmap before the world manager and establishes the geometry renderer before
  streamed chunks need it.
- Publishes selected systems through scene metadata for diagnostics and integration.

**Remaining gaps**

- Scene creation remains a large orchestration module spanning rendering, environment, world
  simulation, UI, persistence, and editor setup.
- Browser and Babylon.js dependencies are pervasive.
- Several anonymous callbacks and long initialization/update sections remain.
- Resource creation and disposal responsibilities are spread across the scene factory and the
  instantiated systems.

**Refactoring priority**

- **P1:** preserve and document initialization order while extracting focused setup functions for
  lighting, terrain, rendering, world systems, and UI.
- **P2:** centralize scene-system lifecycle and disposal ownership.

### `src/environment/celestial-system.js`

**Score: 3.0 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of light construction, day/night intensity, sky shader, time controls,
and diagnostics; not modified.

**Strengths**

- Gives day/night progression and celestial lighting a dedicated owner.
- Updates sun, moon, ambient intensity, and sky-shader uniforms through a common time model.
- Exposes time controls and diagnostic state.

**Remaining gaps**

- Combines astronomical timing, lighting control, sky geometry, shader source, and material
  management in one class.
- Shader source and GPU lifecycle are tightly coupled to Babylon.js.
- Initialization includes duplicate logging and several long shader/setup methods.

**Refactoring priority**

- **P2:** separate time/lighting state from sky rendering and shader-resource management.
- **P3:** add deterministic tests for daylight, twilight, and night intensity transitions.

### `src/world/chunk-geology-system.js`

**Score: 3.0 / 5**  
Reviewed: November 7, 2026  
Review depth: targeted review of geological sampling, chunk formation generation, and renderer
creation; no changes in this repair.

**Strengths**

- Generates formations per chunk using stable, seeded randomness.
- Stores formation records separately from active render batches.
- Uses existing geological samples and reusable thin-instance renderers.

**Remaining gaps**

- The system combines procedural formation rules, active chunk selection, and Babylon.js renderer
  construction.
- `createRenderers()` and `generateChunk()` contain several responsibilities and formatting
  inconsistencies.
- Surface-soil exclusions and bedrock selection are encoded directly in generation logic.

**Refactoring priority**

- **P2:** extract the formation-selection rules and keep renderer creation as a separate adapter.
- **P2:** add deterministic chunk-generation tests and lifecycle tests for active renderer batches.

### `tests/terrain-color.test.mjs`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: authored and executed regression tests for the shared terrain-color module and
worker message path.

**Strengths**

- Uses Node's built-in test runner and strict assertions without new dependencies.
- Uses explicitly named test functions and callback functions.
- Covers default clamp bounds, soil thresholds, finite color output across elevation/slope ranges,
  invalid sample handling, and worker-generated vertex-color buffers.

**Remaining gaps**

- The worker is exercised through a mocked `self` message channel rather than a browser Worker.
- It does not test the actual Babylon.js StandardMaterial shader, scene lighting, projection, or
  visual appearance.
- LOD edge-stitching and fallback mesh equivalence remain outside this suite.

**Refactoring priority**

- **P1:** add a browser-level terrain rendering test when the application test harness is available.
- **P2:** extend worker tests to cover mixed LOD neighbors and invalid initialization data.

### Updated review coverage

The November 7, 2026 terrain-rendering review covers the files listed in this section. Some entries
are targeted reviews rather than complete source audits; that distinction is recorded per file.
Files not listed remain unreviewed and must not be assumed to conform.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `terrain-color.js`, `terrain-mesh-worker.js`, `world-chunk.js`, `world-manager.js`, `heightmap-terrain.js`, `height-map-terrain.js`, `geological-field.js`, `geometry-renderer.js`, `geometry-shader-manager.js`, `create-scene.js`, `celestial-system.js`, `chunk-geology-system.js`, `terrain-color.test.mjs` | Traced NaN terrain vertex colors to missing default clamp bounds; centralized soil coloring, aligned worker/fallback palettes, added finite-color validation and worker regression tests. |

