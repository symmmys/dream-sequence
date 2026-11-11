# Somnium — Source Style-Conformance Ledger

Last updated: November 9, 2026 — Phase 17I bidirectional spherical anomaly passage  
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



## Geometry foundation — Phase 1 review

The following files were read in full or created and reviewed during the November 7, 2026 Phase 1
implementation. Scores are qualitative conformance assessments, not correctness guarantees.

### `src/world/fields/geometry/spatial-4d.js`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: complete implementation review; added in Phase 1 and covered by regression tests.

**Strengths**

- Pure, engine-independent functions use plain serializable coordinate records.
- Validates finite components, zero-length normalization, interpolation parameters, and rotation
  planes at the API boundary.
- Keeps local slice coordinates distinct from ambient R4 coordinates and validates all four frame
  directions as an orthonormal basis.
- Isolates the numerically substantive perpendicular-frame construction and transport algorithm.
- Uses named callbacks and avoids renderer, browser, and persistence dependencies.

**Remaining gaps**

- Cross-section transport is deterministic discrete projection with Gram-Schmidt, not a closed-form
  continuous parallel-transport solution.
- No general 4x4 matrix type or 4D metric tensor is introduced; neither is required by Phase 1.

**Refactoring priority**

- **P2:** compare frame transport against a higher-accuracy reference when curved corridor rendering
  is introduced; add matrix support only when an actual consumer needs it.

### `src/world/fields/geometry/world-slice.js`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: complete implementation review; added in Phase 1 and covered by regression tests.

**Strengths**

- Represents a slice as a compact versioned serializable record with stable identity independent
  of its fourth-coordinate location.
- Defaults to the canonical XYZ frame at a fixed W coordinate while allowing a validated explicit
  frame for future rotated slices.
- Establishes a stable chunk address containing slice identity and the existing X/Z chunk axes.
- Validates IDs, geometry profiles, seed types, revisions, and integer chunk coordinates.

**Remaining gaps**

- Slice identity is not yet propagated into world persistence, chunk managers, or population seeds.
- Geometry options are not yet a versioned parameter schema; this phase records the profile name.

**Refactoring priority**

- **P1:** consume this address from the slice-aware chunk manager in Phase 3 and migrate legacy
  single-slice saves to an explicit default slice ID.

### `src/world/fields/geometry/spatial-corridor.js`

**Score: 4.0 / 5**  
Reviewed: November 7, 2026  
Review depth: complete implementation review; added in Phase 1 and covered by regression tests.

**Strengths**

- Keeps anomaly geometry in a versioned serializable descriptor rather than a Babylon mesh.
- Separates the cubic R4 centreline from source/destination slice-local endpoint records.
- Validates radius-profile ordering and range, corridor identity, revision, and visibility/traversal
  flags.
- Provides deterministic Bezier evaluation, normalized tangents, one-sided stationary-endpoint
  tangent handling, and transported cross-section frames.
- Bounds frame sample counts and uses named callbacks.

**Remaining gaps**

- Sampling revalidates the small centreline/profile records on each call; a prepared immutable
  sampler may be useful if later profiling shows this to be material.
- The descriptor is not yet integrated with traversal state, physics, or a renderer.
- Frame transport can require further refinement for sharply turning or nearly singular paths.

**Refactoring priority**

- **P1:** add corridor traversal and seam-continuity tests alongside the Phase 4 renderer.
- **P2:** optimize repeated sampling only after profiling realistic corridor workloads.

### `src/world/fields/geometry/world-topology.js`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: complete implementation review; added in Phase 1 and covered by regression tests.

**Strengths**

- Owns cross-slice connectivity in one domain service with private maps and explicit mutation APIs.
- Separates visible remote destinations from physically traversable neighbours.
- Never infers adjacency from W-coordinate proximity and enforces endpoint/frame consistency.
- Requires increasing corridor revisions and prevents removal of referenced slices.
- Supports versioned JSON round trips and returns copies rather than mutable internal records.

**Remaining gaps**

- Topology queries currently scan the corridor registry; indexed adjacency lists may be warranted
  once corridor counts grow.
- Traversal lifecycle and simulation activation intentionally remain outside this phase.

**Refactoring priority**

- **P1:** integrate explicit topology queries with render-preview and active-slice scheduling in
  Phases 3–4; add indexes only when measured registry size justifies them.

### `src/world/fields/geometry/poincare-visual-scale.js`

**Score: 5.0 / 5**  
Reviewed: November 7, 2026  
Review depth: complete implementation review; added in Phase 1 and covered by regression tests.

**Strengths**

- Small pure functions distinguish the intrinsic conformal metric factor from presentation scale.
- Exposes gamma, maximum scale, and boundary safety margin as validated configuration.
- Enforces monotonic bounded visual expansion without mutating world coordinates or metric state.
- Has no renderer or engine dependencies.

**Remaining gaps**

- The helper is not yet integrated into CPU/GPU mesh rendering; renderer parity belongs to Phase 2.

**Refactoring priority**

- **P1:** integrate the same formula into the GPU vertex path, CPU fallback, and debug grid, then
  test their numerical agreement.

### `tests/geometry-foundation.test.mjs`

**Score: 4.5 / 5**  
Reviewed: November 7, 2026  
Review depth: complete regression suite; authored and executed with Node's built-in test runner.

**Strengths**

- Covers vector operations, slice-frame round trips, orthogonality, rotations, Bezier endpoints,
  tangent fallback, frame transport, radius profiles, addresses, topology gates, serialization,
  and Poincare scale bounds.
- Uses strict assertions, descriptive test names, named test callbacks, and no added dependencies.
- Exercises domain behavior independently of Babylon.js and browser rendering.

**Remaining gaps**

- These are deterministic unit tests, not worker, browser, player-traversal, collision, or rendering
  integration tests.
- Additional randomized/property-based cases could strengthen numeric edge coverage.

**Refactoring priority**

- **P1:** add integration coverage when slice-aware chunk management and traversal are implemented.
- **P2:** introduce property-based tests only if a lightweight project-wide test dependency is
  accepted.

### Existing geometry files inspected for Phase 1

#### `src/world/fields/geometry/geometry-model.js`

**Score: 4.0 / 5** — complete review, not modified. The abstract metric/distance contract is small
and engine-independent. It does not yet declare dimensions or separate intrinsic geometry from
projection; Phase 2 should extend capabilities without coupling models to corridor topology.

#### `src/world/fields/geometry/euclidean-geometry.js`

**Score: 3.5 / 5** — complete review, not modified. The implementation is focused and reuses the
3x3 identity tensor, but `distance()` assumes valid 3D inputs and can propagate invalid values.
Add consistent boundary validation when the geometry contracts are consolidated in Phase 2.

#### `src/world/fields/geometry/poincare-metric.js`

**Score: 4.0 / 5** — complete review, not modified. It contains validated analytic 3D hyperbolic
distance, hyperboloid conversion, and geodesic interpolation. Its foundational numerical methods
justify their length, but the model duplicates responsibilities with `PoincareGeometry` and relies
on the existing 3x3 metric tensor. Consolidate those contracts in Phase 2 without breaking callers.

#### `src/world/fields/geometry/poincare-projection.js`

**Score: 3.0 / 5** — complete review, not modified. Bounds and inverse projection are explicit, but
one projected-radius block has inconsistent indentation and projection responsibilities remain
hard-coded to 3D. Add consistent formatting and keep projection separate from intrinsic metrics
when additional slice geometries are introduced.

#### `src/world/fields/metric-tensor.js`

**Score: 3.5 / 5** — complete review, not modified. Symmetry and positive-definiteness validation
are useful and the 3x3 scope is explicit. `quadraticForm()` does not validate its vector input and
interpolation allocates intermediate arrays. Preserve this 3D contract; add a distinct 4D metric
contract only when a real intrinsic 4D metric is required.

### Phase 1 review coverage

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `spatial-4d.js`, `world-slice.js`, `spatial-corridor.js`, `world-topology.js`, `poincare-visual-scale.js`, `geometry-foundation.test.mjs`, `geometry-model.js`, `euclidean-geometry.js`, `poincare-metric.js`, `poincare-projection.js`, `metric-tensor.js` | Added engine-independent R4 math and frames, versioned slice/corridor models, explicit visual/traversal topology, bounded Poincare visual scale, architecture decision, and regression coverage. Existing 3D renderer/chunk APIs remain unchanged. |

## Phase 2 geometry integration planning review

**Reviewed:** November 7, 2026  
**Review type:** architecture and integration planning; no source files modified.

The Phase 2 plan reuses the Phase 1 domain records while identifying the concrete connection points in the current Babylon scene. The scene factory remains the composition root, but it must be decomposed into named setup and lifecycle operations before it becomes responsible for multiple slice runtimes. The current single-transform renderer cannot safely render different slice profiles, and the current shader manager is not active in the scene path. Its base-colour-only fragment shader would also erase the existing terrain vertex palette if applied indiscriminately.

The plan therefore requires slice-ID-based transform resolution, explicit CPU/GPU capability selection, preservation of vertex colours and compatible material behavior, and a CPU fallback for unsupported materials. It also separates pure raster sampling from browser image decoding, removes the duplicate heightmap implementation only after confirming its import graph, and keeps render-target/portal resources out of persistent world records.

The bundled `assets/0_somnium_map_topographic.png` was independently checked during this review. It is 1,107,667 bytes, declares 3000×8000 RGBA dimensions, lacks a terminal PNG `IEND` chunk, and fails Pillow verification with a truncated-file error. A separate valid deterministic demo raster is required; the existing map must not be silently overwritten.

The supplied Phase 1 baseline was re-run: 34/34 Node tests passed, and 97/97 JavaScript source/test files passed `node --check`.

See `GEOMETRY-PHASE-2-IMPLEMENTATION-PLAN.md` for module boundaries, implementation work packages, acceptance criteria, exclusions, and the source-level style review table.


## Phase 2 implementation style review

Reviewed: November 7, 2026  
Review type: implementation review of the files listed below; all new domain and renderer paths received syntax checks and focused tests where the runtime permits.

### `src/environment/topography/heightmap-data.js`

**Score: 4.5 / 5**  

- Pure RGBA validation, channel/palette decoding, normalized sampling, bilinear interpolation, and statistics; no DOM, Babylon, or persistence dependencies.
- Validation is factored into named helpers and the sampling path uses bounded raster coordinates.
- Palette matching is deliberately nearest-stop rather than a full colour-ramp interpolation; document palette semantics for users.
- Future improvement: avoid one full pixel validation pass for very large rasters when a trusted decode boundary can guarantee `Uint8Array` input.

### `src/environment/topography/browser-heightmap-loader.js`

**Score: 4.0 / 5**  

- Browser image decoding is isolated from terrain sampling and returns plain RGBA data.
- Handles URL, Blob/File, and ImageData inputs and normalizes load failures with source context.
- Browser globals are encapsulated inside the loader; URL fetch and canvas operations remain testable only with a browser harness.
- Future improvement: expose cancellation/AbortSignal and optionally transfer the decoded buffer to a worker without copying.

### `src/world/topographic-world-factory.js`

**Score: 4.0 / 5**  

- Produces a versioned domain slice plus a sampler, with map metadata kept separate from Babylon resources.
- Terrain sampling, gradients, elevation, and diagnostics are reusable by additional worlds.
- Factory configuration is options-object based and input dimensions are validated.
- Future improvement: define a serialized topographic source descriptor/version and formalize raster memory ownership for larger maps.

### `src/world/slice-world-registry.js`

**Score: 4.0 / 5**  

- Provides explicit ownership, lookup, registration, unregister, and idempotent disposal for per-slice runtime bindings.
- Rejects duplicate identities and use after disposal.
- Runtime records deliberately remain outside serializable `WorldSlice` domain records.
- Future improvement: add lifecycle tests with disposable resources and define whether unregister must cascade into topology removal.

### `src/world/fields/geometry/babylon-geometry-adapter.js`

**Score: 3.5 / 5**  

- Resolves the transform from `sliceId` metadata and keeps Babylon-specific mesh mutation in one adapter.
- Preserves material assignment and delegates original-buffer retention/restoration to `GeometryRenderer`.
- The GPU option is intentionally not used; current statistics report the CPU fallback. Parented meshes are explicitly skipped instead of being projected in the wrong coordinate frame.
- Future improvement: support transform hierarchies and add a compatible material-plugin GPU path rather than replacing arbitrary materials.

### `src/world/fields/geometry/geometry-debug-grid.js`

**Score: 4.2 / 5 (focused review of per-slice visibility and terrain conformance)**  

- Owns grid mesh creation and keeps user visibility preference separate from active-slice visibility.
- Uses the same slice adapter as room meshes, so each grid reflects the active slice's visual projection.
- Supports terrain-conformed polylines and splits lines at invalid terrain samples rather than connecting across gaps.
- Keyboard input is owned by `GeometryDemoWorld`, keeping the mesh helper free of browser event lifecycle responsibilities.
- Remaining improvement: expose sampled-point/line counts and render-cost diagnostics if higher-resolution metric grids become necessary.

### `src/world/fields/geometry/corridor-renderer.js`

**Score: 3.5 / 5**  

- Keeps the 3D proxy clearly separate from authoritative corridor data and builds geometry from sampled R4 frames.
- Vertex buffers are generated once and use a small unlit vertex-colour material.
- The projection to 3D is intentionally lossy; basis collapse and visual orientation under sharply changing 4D tangents need screenshot/runtime review.
- Future improvement: extract proxy-frame construction into a tested helper and expose adaptive segment/radial resolution.

### `src/world/fields/geometry/portal-preview-renderer.js`

**Score: 4.0 / 5**  

- Owns one camera, render target, surface material, explicit render list, visibility registration, diagnostics, and disposal.
- Preview camera layer and render list prevent remote meshes from being included in the ordinary source view.
- Refresh is throttled to every other frame and preview work is removed when the demo is inactive.
- Future improvement: add resize policy, GPU-memory pressure response, and browser-tested resource disposal.

### `src/demo/geometry-demo-world.js`

**Score: 3.5 / 5**  

- Makes composition explicit: source slice, destination slice, corridor, topology, runtime registry, transforms, renderer adapters, player, and camera.
- Separates room, destination terrain, markers, portal, and materials into named creation operations.
- Topographic terrain mesh generation has since moved into `topographic-terrain-mesh.js`, so the demo no longer owns the reusable map-to-mesh pipeline.
- The 385-line demo composition still owns room primitives, markers, and palette composition; this is acceptable for a finite demo but should not become the reusable world factory.
- Future improvement: extract room primitives and destination landmark composition before expanding to procedural architecture.

### `src/game/game-manager.js` and `src/ui/main-menu.js`

**Scores: 4.0 / 5 and 4.0 / 5**  

- The manager supports named, registered spatial modes and consistently disables non-active controllers. The menu uses named methods, centralized DOM event registration, and teardown.
- Mode registration keeps each demo camera and its two controllers together without adding another hard-coded manager branch.
- Both remain coupled to browser/Babylon runtime interfaces; the menu retains inline markup/styles.

### `src/environment/heightmap-terrain.js`

**Score: 3.5 / 5**  

- Existing gameplay API remains compatible while raster decoding/sampling is delegated to the new topography modules.
- A failed primary map load can use a separately configured fallback and diagnostics report the source.
- Sampling/diagnostics, Babylon vector creation, browser adapter invocation, and gameplay compatibility remain in one facade.
- Future improvement: move random sampling and diagnostic aggregation into pure terrain helpers and keep Babylon vector creation at the adapter boundary.

### `src/scene/create-scene.js`

**Score: 2.5 / 5**  

- The new Geometry Demo is composed through a dedicated module, uses named update/disposal functions, and does not fold portal logic into the global update loop. Demo mode bypasses ordinary-world streaming/simulation work.
- The file remains a 773-line composition root with mixed tabs/spaces, many long setup blocks, several inline diagnostic closures, and direct knowledge of all environment systems. This is a significant style/architecture debt inherited from the original scene bootstrap and not solved by this feature.
- Future improvement: extract focused setup functions for terrain, geometry, player modes, environment systems, persistence, and diagnostics; do not refactor all 773 lines in one risky pass.

### Phase 2 review coverage

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `heightmap-data.js`, `browser-heightmap-loader.js`, `topographic-world-factory.js`, `slice-world-registry.js`, `babylon-geometry-adapter.js`, `geometry-debug-grid.js`, `corridor-renderer.js`, `portal-preview-renderer.js`, `geometry-demo-world.js`, `heightmap-terrain.js`, `height-map-terrain.js`, `spatial-transform.js`, `geometry-renderer.js`, `player-character.js`, `game-manager.js`, `main-menu.js`, `create-scene.js`, `topography-generation.test.mjs`, `spatial-game-mode.test.mjs`, `index.html` | Added raster/world generation, per-slice CPU geometry, extra charts, corridor proxy, isolated portal view, and third-person demo. GPU material preservation and live-browser verification remain outstanding. |


## Phase 2 implementation refinement review

Reviewed: November 7, 2026
Review type: follow-up after extracting the reusable Babylon topographic mesh builder and tightening terrain lifecycle and player input handlers.

### `src/world/fields/geometry/topographic-terrain-mesh.js`

**Score: 4.0 / 5**

- Separates topographic mesh buffers from Babylon object creation; the buffer builder can be tested without an engine global.
- Uses named operations, validates sampler dimensions/elevation bounds, and caps mesh resolution to keep generated geometry bounded.
- Produces indexed positions, elevation-derived vertex colours, and Babylon-computed normals while leaving spatial projection to `BabylonGeometryAdapter`.
- Future improvement: allow explicit map-specific material palettes and report mesh vertex/triangle cost to a render budget.

### `src/game/player-controller.js`

**Score: 4.0 / 5**

- Replaces inline arrow callbacks with named, bound input handlers and removes listeners symmetrically.
- Disabled controllers no longer consume WASD/Shift input or prevent the browser's default key behavior while the player is in another mode.
- Movement validates the terrain footprint before sampling, and controller state is cleared on mode changes and disposal.
- Future improvement: extract input decoding, turn integration, and terrain-following movement into separate operations and add controller behavior tests.

### `src/game/camera-controller.js`

**Score: 4.0 / 5**

- Uses a named wheel handler rather than an anonymous callback and retains the existing zoom bounds and smoothing behavior.
- Adds no new rendering dependencies and removes the listener during disposal.
- Future improvement: add tests for wheel normalization, clamping, and camera initialization on mode activation.

### `src/world/topographic-world-factory.js` refinement

The terrain sampler now rejects non-positive/non-finite slope spacing and consistently checks disposed state in map-value and diagnostics queries. The independent-world regression verifies raster memory isolation, stable slice IDs, and separate elevation fields.

### Updated phase 2 review coverage

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `topographic-terrain-mesh.js`, `topographic-world-factory.js`, `player-controller.js`, `camera-controller.js`, `geometry-demo-world.js`, `topography-generation.test.mjs` | Extracted a reusable indexed Babylon terrain mesh builder, tightened sampler validation and disposal, and replaced anonymous demo input handlers.

Current phase 2 verification: **46/46 Node tests**, **104/104 source syntax checks**, **5/5 test syntax checks**, **174 relative imports checked with no missing targets**. Browser/GPU visual verification remains outstanding.

## Geometry Demo runtime repair review

Review date: 2026-11-07

### `src/game/camera-controller.js`

**Score: 4.5 / 5**

- Derived third-person camera and look-target positions are constrained to a small interior margin of the bound projection domain.
- The camera guard is local to the presentation controller; authoritative player state and the Poincare projection's strict validation are unchanged.
- Named operations isolate boundary clamping, and listener registration/removal remain symmetric.
- Future improvement: add browser-level tests for zoom, camera smoothing, and near-boundary movement under all supported spatial charts.

### `src/demo/geometry-demo-world.js`

**Score: 4.0 / 5**

- The demo chamber is composed from named floor, pillar, object, and label factories instead of one long construction block.
- The floor footprint is 48 x 60 units; obstructive perimeter walls and ceiling geometry have been removed.
- Each sample primitive, the chamber title, and the 4D corridor have independent billboard labels rendered using Babylon dynamic textures.
- Labels are registered with the source slice and their textures are explicitly disposed with demo meshes.
- Future improvement: expose chamber dimensions and object placements as a compact demo configuration and add a Babylon-enabled visual regression harness.

### `tests/geometry-demo-regression.test.mjs`

**Score: 4.5 / 5**

- Tests the camera's derived world-space clamp using a real `SpatialTransform` and verifies that the projection still rejects out-of-bounds authoritative coordinates.
- Includes a geometry-agnostic transform case where no finite bounds are supplied.
- Uses named callbacks and lightweight browser/Babylon-independent stubs.

### Primary topographic asset

`assets/0_somnium_map_topographic.png` was present but physically truncated. The recovered 3000 x 6203 raster was re-encoded as a valid PNG; the 1797 undecodable transparent tail rows were removed. The source asset is now loadable without invoking the fallback validator.

### Updated verification

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `camera-controller.js`, `geometry-demo-world.js`, `geometry-demo-regression.test.mjs`, `assets/0_somnium_map_topographic.png` | Fixed projection-bound camera exception, repaired truncated primary raster, expanded/opened demo room, added camera-facing labels, and added boundary regression tests. |

Current verification: **48/48 Node tests**, **104/104 source syntax checks**, **6/6 test syntax checks**, all relative imports resolved. PNG decode verified. Browser/WebGL visual inspection remains outstanding.

## Traversable 4D corridor and spatial chunk graph review

Review date: 2026-11-07

### `src/world/spatial-chunk-graph.js`

**Score: 4.5 / 5**

- Owns one explicit graph contract for per-slice X/Z chunks and corridor runtime chunks.
- Keeps topology, render visibility, traversability, one-way direction, and loaded state distinct.
- Returns explicit remote-neighbour metadata (`viaCorridorId`) instead of pretending two different slices share ordinary grid coordinates.
- Refreshes already-loaded chunk neighbour references when remote chunks or corridors change lifecycle state.
- Uses bounded breadth-first route search and rejects implicit adjacency based on `w` proximity.
- Future improvement: replace repeated corridor-node lookup with a direct node index if corridor counts grow substantially; add graph-level work budgets when the global scheduler arrives.

### `src/world/corridor-chunk.js`

**Score: 4.5 / 5**

- Gives each corridor an isolated runtime occupancy map with direction, progress, and ambient 4D position.
- Validates traversal state and returns defensive copies of occupant records.
- Keeps the serializable corridor definition separate from runtime occupancy and Babylon render meshes.
- Future improvement: expose a compact serialization/debug snapshot and add segment occupancy if corridors are subdivided.

### `src/world/fields/geometry/corridor-traversal-controller.js`

**Score: 4.0 / 5**

- Reuses one entry gate and transit progression for the player and non-player spatial entities.
- Separates proximity/facing detection (`tryBeginEntityTransit`) from explicit collision/AI initiation (`beginEntityTransit`).
- Tracks transit occupancy in `CorridorChunk` and transfers slice transform, layer, and world position on arrival.
- Uses named helper operations for render-position and spatial-context adaptation.
- Future improvement: split active-player camera orchestration from a renderer-independent multi-entity transit service; introduce a global actor registry and collision event routing.

### `src/world/world-chunk.js`

**Score: 3.5 / 5**

- Adds slice-aware chunk identity, spatial adapter ownership, layer/visibility configuration, and direct/remote neighbour records.
- Restores transformed mesh buffers before disposing a chunk mesh.
- Retains the existing terrain mesh and Babylon lifecycle responsibilities; older formatting and long methods remain.
- Future improvement: extract terrain buffer generation, mesh upload, and graph-neighbour registration behind narrower collaborators.

### `src/world/world-manager.js`

**Score: 3.0 / 5**

- Supports per-slice keys and optional graph, spatial adapter, layer mask, visibility, and chunk mesh queries.
- Registers and unregisters resident chunks with the shared graph so remote-neighbour state follows streaming lifecycle.
- The existing manager still contains long setup/worker/fallback paths, inconsistent indentation, and anonymous worker/timer callbacks from its pre-existing implementation.
- Future improvement: split worker scheduling, mesh queue policy, LOD selection, and chunk lifecycle into focused modules; replace callback literals with named methods during that refactor.

### `src/world/topographic-world-factory.js`

**Score: 4.0 / 5**

- Provides the decoded raster buffer and readiness contract needed by the existing worker-backed chunk manager.
- Retains per-slice sampling and explicit disposal behavior.
- Future improvement: expose map provenance and memory estimates through a stable diagnostic record.

### `src/demo/geometry-demo-world.js`

**Score: 3.5 / 5**

- Composes source and destination slices, graph, corridor chunk, streamed destination manager, renderer, and player traversal.
- The source room record now participates in neighbour refresh, and the demo camera uses isolated layer bits to avoid drawing the main-world terrain plane over the room.
- Keeps the room free of floor/ceiling meshes and enables the spatial debug grid by default.
- The module remains a demo composition root with many Babylon resources and lifecycle responsibilities.
- Future improvement: move demo setup values into a compact configuration and extract scene-resource factories and cleanup into separate modules.

### `src/world/fields/geometry/portal-preview-renderer.js`

**Score: 4.0 / 5**

- Avoids resetting a render list when the same mesh sequence is supplied again.
- Keeps render-only remote geometry separate from world simulation adjacency.
- Future improvement: track render-list revision numbers rather than comparing arrays when destination meshes scale up.

### `tests/spatial-chunk-graph.test.mjs` and `tests/corridor-traversal.test.mjs`

**Score: 4.5 / 5**

- Exercise explicit graph routes, corridor chunk identity, one-way edges, preview-only corridors, remote loaded-state refresh, and player/non-player traversal.
- Use small deterministic fixtures and named test functions.
- Future improvement: add Babylon browser integration and a live physics-collider test when a browser automation harness is available.

### Review summary

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `spatial-chunk-graph.js`, `corridor-chunk.js`, `corridor-traversal-controller.js`, `world-chunk.js`, `world-manager.js`, `topographic-world-factory.js`, `geometry-demo-world.js`, `portal-preview-renderer.js`, spatial/corridor tests | Introduced first-class corridor chunks and cross-slice world-chunk adjacency, refresh of loaded-neighbour records, player and generic entity transit, destination terrain streaming, and isolated demo camera layers. |

Phase 3 verification: **61/61 Node tests**, **115/115 JavaScript source/test syntax checks**, **189/189 relative imports resolved**. Browser/WebGL and full physics/actor-runtime verification remain outstanding.

## Geometry demo startup compatibility hotfix review

Review date: 2026-11-07

### `src/demo/world-manager-visibility.js`

**Score: 4.8 / 5**

- Encapsulates a version-compatibility concern at the demo/application boundary instead of spreading optional-method checks across scene orchestration.
- Prefers the current `WorldManager.setVisible()` contract and uses a narrow fallback for earlier managers.
- Handles chunk maps, mesh-only managers, null chunks, and uninitialized managers without engine dependencies.
- Keeps the helper small, deterministic, and independently testable.
- The fallback toggles resident resources; future-created chunk visibility in a legacy manager remains dependent on that manager's own update lifecycle. The current Phase 3 manager handles future chunks directly.

### `src/demo/geometry-demo-world.js`

**Revised score: 3.6 / 5**

- Replaces an unchecked call to an optional manager method with the explicit compatibility helper.
- The demo remains a composition root with several renderer, world, and controller responsibilities; decomposition remains a future cleanup task.

### `tests/world-manager-visibility.test.mjs`

**Score: 4.8 / 5**

- Tests the current manager capability, the legacy manager fallback, mesh-only fallback, and absent-manager safety.
- Uses deterministic fixtures and named test callbacks.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `geometry-demo-world.js`, `world-manager-visibility.js`, `world-manager-visibility.test.mjs` | Fixed startup failure caused by the Phase 3 demo assuming `WorldManager.setVisible()` while an older manager module may be loaded; added a tested capability adapter. |

Hotfix verification: **65/65 Node tests passed**. Browser/WebGL verification remains outstanding.


## Startup Hotfix 2 review (2026-11-07)

- `src/demo/world-manager-visibility.js`: responsibility remains narrow; named helpers; compatibility fallback covers absent and throwing APIs; no anonymous callbacks. Conformance: high.
- `src/demo/geometry-demo-world.js`: startup build marker is explicit; existing orchestration remains unchanged. Conformance: good, though the module is still a composition root with substantial responsibility.
- `src/main.js` and `src/scene/create-scene.js`: cache-versioned import specifiers make the runtime build deterministic; no new callback complexity. Conformance: good.
- `tests/world-manager-visibility.test.mjs`: named test callbacks and explicit contract assertions. Conformance: high.

Remaining note: browser/WebGL startup must still be verified in the user's local browser. Syntax and Node tests do not prove the served browser module graph was updated.

- `src/world/world-manager.js`: `setVisible()` now guards pre-initialization state and null chunk entries; method remains a short lifecycle operation. Conformance: good.

## Geometry Phase 4 review (2026-11-08)

### `src/world/fields/geometry/corridor-traversal-controller.js`

**Score: 4.3 / 5**

- Replaces elapsed-time animation with signed arc-length movement in ambient R4 coordinates.
- Separates entry detection, player advancement, entity advancement, sampling, and slice handoff into named methods.
- Keeps the corridor runtime chunk as the authoritative owner of occupant progress and 4D position.
- Uses bounded per-frame delta and validated movement/sampling options.
- Remaining improvement: split multi-entity transit into a small system if this controller grows beyond one demo corridor; global actor registration and simulation-budget integration remain deferred.

### `src/world/fields/geometry/corridor-renderer.js`

**Score: 4.4 / 5**

- Separates source- and destination-anchored display proxies from the authoritative 4D centreline.
- Samples and transports orthonormal frames; interpolated frames are re-orthogonalized before display.
- Exposes the ambient tangent and all three perpendicular 4D axes for future camera and movement controls.
- Keeps buffer generation in small, named helpers and gives both directional materials unique identities.
- Remaining improvement: profile buffer generation and consider cached frame interpolation if additional corridors are rendered simultaneously.

### `src/game/player-controller.js`

**Score: 4.2 / 5**

- Input handling uses named bound methods and exposes a small immutable input snapshot for other movement systems, including all three transported corridor cross-section axes (A/D, R/F, Q/E).
- Ordinary movement now separates forward and strafe axes; jumping uses a compact velocity/gravity integration.
- World movement can be suspended without discarding keys needed by the corridor controller.
- Remaining improvement: extract reusable kinematics from the input adapter when additional player modes or camera control profiles are introduced.

### `src/demo/geometry-demo-world.js`

**Score: 3.7 / 5**

- Adds a destination-anchored corridor proxy and selects the appropriate render frame during directional traversal.
- Preserves explicit per-slice layers, portal previews, and resource cleanup.
- Remains a composition root with many Babylon lifecycle responsibilities; further factory extraction is warranted after the traversal behavior stabilizes.

### Phase 4 tests

**Score: 4.7 / 5**

- Deterministic tests cover controlled progress, pause, retreat, one-way rejection, cross-section offsets, chunk-boundary entry, occupancy cleanup, entity transit, input/jump behavior, reverse renderer anchoring, and orthonormal 4D frames.
- Babylon-specific renderer behavior is exercised with a focused API stub; a real WebGL browser pass remains outstanding.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `corridor-traversal-controller.js`, `corridor-renderer.js`, `player-controller.js`, `geometry-demo-world.js`, `tests/corridor-traversal.test.mjs`, `tests/corridor-renderer.test.mjs`, `tests/player-controller.test.mjs`, `tests/world-manager-visibility.test.mjs` | Replaced fixed-duration interpolation with player-controlled R4 arc-length traversal; added the tangent plus all three bounded transported cross-section controls, directional renderer anchors, two-axis world locomotion and jumping, chunk-boundary entry checks, and cache-versioned module imports. |

Phase 4 verification: **84/84 Node tests**, **119/119 JavaScript syntax checks**, and **0 missing relative import targets**. The headless Chromium smoke test timed out without producing DOM output; browser/WebGL traversal is not claimed as verified.


## Geometry Phase 5 review — main-world corridor connection (2026-11-07)

### `src/demo/geometry-demo-topology.js`

**Score: 4.5 / 5**

- Separates slice creation, corridor definition, topology registration, chunk-graph registration, and result construction into named operations.
- Samples the actual main-world terrain for the exit elevation and validates the terrain and chunk-size contracts at the boundary.
- Uses the application's stable `somnium-main` slice identity and derives the main geometry profile from the live `SpatialTransform`.
- Registers the corridor as an explicit traversable graph node; no adjacency is inferred from fourth-coordinate proximity.
- Remaining improvement: promote the demo's source/destination chunk-size and exit-anchor choices into a serializable demo configuration if additional anomaly fixtures are introduced.

### `src/demo/geometry-demo-world.js`

**Score: 3.9 / 5**

- Removes the duplicate destination-world generator and manager; borrows the real terrain, transform, adapter, chunk graph, and single main-world manager.
- Checks object identity for terrain, graph, adapter, and slice ID before accepting the manager, preventing accidental parallel world ownership.
- Streams the real destination chunk while the demo is active and refreshes portal preview meshes from that same manager.
- Disposes only resources it owns; the main manager is disposed by the scene composition root before the shared graph and adapter are disposed.
- Remaining gap: this is still a substantial Babylon/application composition root. Renderer creation, demo-world bindings, portals, and player setup should be extracted into focused factories after runtime behavior stabilizes.
- Remaining gap: the demo player and camera remain active after reaching the main-world slice; full transition to ordinary gameplay simulation is intentionally not implemented in this patch.

### `src/scene/create-scene.js`

**Score: 3.2 / 5 (focused review of modified integration and cleanup paths)**

- Provides the live main-world terrain, spatial transform, and chunk size to the demo factory.
- Constructs one main-world `WorldManager` with the demo's graph and adapter, then explicitly injects that manager into the demo.
- Disposes the manager before the demo-owned graph/adapter so loaded chunk registrations are removed while the shared topology remains valid.
- Existing scene initialization remains a large orchestration function with unrelated systems and long lifecycle sections; extracting application composition is a future refactor rather than part of this topology fix.

### `src/world/fields/geometry/portal-preview-renderer.js`

**Score: 4.4 / 5 (focused review of camera far-plane option)**

- Camera far-plane range is configurable per preview camera, allowing the main-world portal to frame a much larger scene without changing the source-room preview.
- The fallback remains conservative for existing call sites.
- Remaining improvement: use camera-frustum and projected bounds to tune render distance, resolution, and update cadence together when portal performance is profiled.

### `tests/main-world-corridor-connection.test.mjs`

**Score: 4.8 / 5**

- Deterministically tests the main-world endpoint, sampled terrain height, chunk-address mapping, graph route, logical-neighbour state, loaded-neighbour refresh, and unload cleanup.
- Includes scene-composition assertions that guard against accidentally creating a separate destination manager again.
- Uses named test callbacks and lightweight, engine-independent fixtures.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-07 | `geometry-demo-topology.js`, `geometry-demo-world.js`, `create-scene.js`, `portal-preview-renderer.js`, `main-world-corridor-connection.test.mjs`, `world-manager-visibility.test.mjs`, `index.html`, `main.js` | Replaced the isolated destination world with Somnium's live main-world slice; registered the actual main-world exit chunk as the destination neighbour through the corridor chunk; shared one manager, terrain, adapter, and graph; added build cache versioning and graph lifecycle tests. |

Phase 5 verification: **87/87 Node tests**, **121/121 source/test syntax checks**, and **198/198 relative imports resolved**. Interactive browser/WebGL traversal has not been verified in this environment. Full gameplay simulation mode handoff after arrival remains a documented follow-up.

## Geometry Phase 6 review — free camera and corridor visibility (2026-11-08)

### `src/demo/geometry-demo-camera-controller.js`

**Score: 4.5 / 5**

- Extends the established camera-controller contract and preserves the default player-follow view.
- Keeps free-camera state separate from player movement and maintains a distinct active view-slice identity.
- Maps independent tangent and three transported cross-section inputs into the corridor's authoritative R4 frame.
- Applies pointer yaw once per input delta and updates the ambient endpoint sample before independent slice handoff.
- Uses named bound event handlers, clears held input on blur, and removes subscriptions during disposal.
- Remaining improvement: consider extracting the reusable four-axis navigation frame if additional camera/anomaly viewers need the same movement contract; add a live browser input test.

### `src/demo/geometry-demo-world.js`

**Score: 4.4 / 5 (focused review of camera and portal orchestration)**

- Derives render-layer selection and corridor proxy visibility from the active camera's view slice, not solely from the player's slice.
- Gives an independent free camera control over portal direction and view state after its own corridor handoff.
- Moves the destination aperture forward by a bounded look-ahead derived from measured corridor arc length, making the remote scene visible earlier in transit.
- Follows the free camera's inverse-transformed world position when updating destination chunk streaming.
- Keeps player topology and traversal state authoritative and does not move the player during free inspection.
- Remaining improvement: extract portal-view choreography from the demo composition root once the rendering behavior has been visually validated.

### `src/game/camera-controller.js` and `src/game/player-controller.js`

**Score: 4.2 / 5 (focused review of geometry-demo integration)**

- The follow-camera render anchor supports an explicit look target ahead along the curved corridor.
- Player input can be suppressed independently of controller lifecycle and is restored when follow mode resumes.
- Camera and player ownership remain distinct; the inspection camera does not overwrite player world position.
- Remaining improvement: formalize camera input ownership if the application adds more simultaneous inspection and gameplay controllers.

### `src/world/fields/geometry/corridor-renderer.js` and `portal-preview-renderer.js`

**Score: 4.5 / 5 (focused rendering review)**

- Corridor opacity is validated and defaults to 0.22; depth writes are disabled to reduce tunnel occlusion of the destination aperture.
- Portal surfaces support a saved home pose and temporary position/orientation updates along the active corridor.
- Remote views remain isolated render-target cameras with explicit render lists and slice layer masks.
- Remaining improvement: profile transparent sorting, overdraw, render-target refresh cost, and portal framing in a real WebGL browser session.

### `src/ui/main-menu.js`

**Score: 3.8 / 5 (focused review of camera HUD update)**

- Provides both a visible HUD toggle and keyboard shortcut for camera mode.
- The controls legend distinguishes ordinary 3D flight from the tangent and all three perpendicular corridor directions.
- Keeps UI callbacks routed through the scene composition root.
- Remaining improvement: split the large HTML template and inline style block into small UI template/style assets if the HUD grows further.

### Phase 6 tests

**Score: 4.9 / 5**

- Camera tests cover default-follow behavior, mode switching, player-input suppression, each corridor movement axis, independent destination handoff, mouse-look, exact yaw delta application, and endpoint-sample accuracy.
- Portal-preview tests verify forward and reverse look-ahead, camera-transit priority, free-camera slice-based visibility, early aperture placement, and camera-driven destination focus.
- Renderer tests verify opacity validation, depth-write behavior, and the more transparent default.
- No live browser/WebGL rendering pass is claimed; visual portal readability, transparency sorting, pointer behavior, and remote chunk streaming remain manual checks.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `geometry-demo-camera-controller.js`, `geometry-demo-world.js`, `camera-controller.js`, `player-controller.js`, `portal-preview-renderer.js`, `corridor-renderer.js`, `main-menu.js`, `create-scene.js`, `main.js`, `index.html`, camera/portal/renderer tests, `PROJECT-STATE.txt` | Added follow/free camera toggle, 4D tangent plus three cross-section controls, independent camera slice/layer management, camera-relative destination streaming, near-field destination aperture placement, reduced corridor opacity, corrected mouse yaw and endpoint handoff, and updated cache-busted module graph. |

Phase 6 verification: **107/107 Node tests**, all JavaScript source and test syntax checks passed, all relative static imports resolved. Complete project and replacement patch archives passed ZIP integrity checks. No live browser/WebGL rendering pass is claimed.

## Geometry Phase 7 review — 4D hypercube chamber and connected anomaly network (2026-11-08)

### `src/world/fields/geometry/hypercube-4d.js`

**Score: 4.8 / 5**

- Keeps tesseract topology, XW-plane rotation, finite-input validation, and bounded 4D perspective projection independent of Babylon.js.
- Uses simple plain-object coordinates and deterministic topology (16 vertices, 32 edges), suitable for reuse by another renderer or GPU implementation.
- Separates the mathematical projection from scene placement and render-resource ownership.
- Remaining improvement: make the projection model configurable as a named projection profile if Somnium later needs multiple 4D-to-3D camera models.

### `src/demo/hypercube-4d-renderer.js`

**Score: 4.5 / 5**

- Isolates Babylon-specific mesh/material creation from the engine-independent tesseract mathematics.
- Updates one persistent line-system mesh rather than creating new meshes each frame.
- Owns and disposes its mesh and material symmetrically; the renderer does not mutate the authoritative 4D vertex data.
- Uses named methods for projected edge generation and point conversion.
- Remaining improvement: profile the line-system update cost and consider a vertex-buffer or shader-backed implementation if animated 4D shapes become numerous.

### `src/demo/corridor-traversal-network.js`

**Score: 4.5 / 5 (focused review of multi-route slice ownership and ambient position resolution)**

- Composes existing single-corridor traversal controllers instead of duplicating their entry, transit, and endpoint rules.
- Resolves candidate routes only from explicit topology neighbours of the current slice; W-coordinate proximity does not create connections.
- Distinguishes synchronized `currentSliceId` from actual slice ownership and resolves ambient player positions only through controllers bound to the active slice.
- Evaluates ambient movement only on route controllers that own the active slice, then selects the strongest valid connected influence field.
- Preserves concurrent updates for non-player entities and provides stable route lookup by corridor id.
- Remaining improvement: actor-wide dispatch should eventually be owned by the application entity/physics layer rather than having callers manually register movement with the demo network.

### `src/demo/geometry-demo-topology.js`

**Score: 4.6 / 5**

- Defines stable ids and explicit R4 centreline/radius data for the new hypercube-to-Poincare anomaly.
- Keeps the Poincare-to-main-world corridor and live main-world anchor unchanged.
- Registers each world slice and corridor in the same authoritative topology and spatial chunk graph.
- Returns explicit chunk addresses for both mouths and corridor chunk identities.
- Remaining improvement: move demo-specific numeric layout values into a serializable versioned demo definition if more test chambers are added.

### `src/demo/geometry-demo-world.js`

**Score: 4.1 / 5 (focused review of multi-chamber composition and lifecycle)**

- Creates separate source, hypercube, and main-world bindings with per-slice transforms and camera layers.
- The new chamber contains only the tesseract render object and traversal infrastructure; there is no floor, ceiling, or wall geometry.
- Uses two existing corridor controllers through the network coordinator, preserving independent corridor chunks and route direction.
- Starts Geometry Demo in the hypercube slice with player-follow mode, preserving the established camera default; free inspection remains available through `C`/HUD. Updates the HUD label when the active camera changes slices.
- Portal render lists and layer masks distinguish the three views.
- Remaining improvement: this composition module is still large and should be decomposed into focused factories for portal pairs, chamber content, and route/controller construction after manual browser validation.

### `src/demo/geometry-demo-camera-controller.js`

**Score: 4.5 / 5 (focused review of W-axis chamber inspection)**

- Retains independent free-camera/player state and extends the same input model with bounded W movement in declared 4D regions.
- Camera W is a viewer coordinate consumed by the tesseract projection, not an accidental mutation of the player's 3D body position.
- Route selection considers all traversable neighbours of the current slice and starts only a controller whose mouth is near and facing the camera.
- Remaining improvement: extract the reusable four-axis navigation mapping if future anomaly viewers need it; test input capture in a live browser.

### `src/ui/main-menu.js`, `src/scene/create-scene.js`, `index.html`, and `src/main.js`

**Score: 3.9 / 5 (focused review of default chamber launch and build versioning)**

- The Geometry Demo menu option describes the rotating hypercube and linked anomaly chambers and launches into the new chamber with the player-follow camera.
- HUD label follows the active camera view slice (hypercube, Poincare, or main world).
- The application entry chain and modified module imports share one new cache-busting build identifier.
- UI actions remain delegated to the scene composition root.
- Remaining improvement: split the large menu markup/style template and large scene composition method in later focused refactors.

### Phase 7 tests

**Score: 4.9 / 5**

- Pure mathematics tests cover the 16-vertex/32-edge tesseract, XW rotation, W-dependent perspective, and bounded projection.
- A Babylon API stub verifies that the renderer updates a persistent line mesh and disposes owned resources.
- Network tests exercise two routes from the Poincare chamber, one-route-at-a-time player entry, and sequential traversal across the connected corridor chain.
- Topology and camera tests verify the new slice, corridor chunk, default launch chamber, and bounded camera W movement.
- Remaining verification: no live browser/WebGL visual pass was obtained; manual testing is required for actual portal framing, transparency, input, and mesh animation.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `hypercube-4d.js`, `hypercube-4d-renderer.js`, `corridor-traversal-network.js`, `geometry-demo-topology.js`, `geometry-demo-world.js`, `geometry-demo-camera-controller.js`, `main-menu.js`, `create-scene.js`, `index.html`, `main.js`, tesseract/network/topology/camera tests | Added an empty Euclidean 4D chamber, XW-rotating tesseract, W-coordinate free-camera inspection with follow mode kept as default, second explicit corridor chunk, multi-controller route coordinator, and new default Geometry Demo launch. Separated engine-independent 4D math from Babylon rendering. |

Phase 7 verification: **119/119 Node tests**, **113/113 JavaScript source syntax checks**, **16/16 test syntax checks**, and **202/202 relative import targets resolved**. Project and patch archives passed ZIP integrity checks. Headless Chromium timed out before DOM output; live browser/WebGL behavior remains unverified.

## Geometry Phase 8 review — corridor proper length and tesseract visibility (2026-11-08)

### `src/world/fields/geometry/spatial-corridor.js` and `corridor-traversal-controller.js`

**Score: 4.7 / 5**

- Added a backwards-compatible `intrinsicLengthScale` property that expresses distance compression as part of the corridor's geometry definition, not as arbitrary per-frame movement acceleration.
- The controller continues to sample and traverse the same authoritative R4 centreline; only proper distance used to advance progress is scaled.
- Existing corridor definitions retain prior behavior through the default scale of 1.
- Remaining improvement: expose the metric profile as a future configurable function if anomalies need non-uniform length compression along their centreline.

### `src/demo/hypercube-4d-renderer.js`

**Historical Phase 8 score: superseded by the Phase 9 audit**

- Replaced the fragile one-pixel LineSystem with one persistent tube-edge mesh, updated position/normal buffers, and refreshed bounds.
- The intended 16 vertex markers did not represent distinct corners because the upstream vertex generator contained an `Array.from()` callback-index bug; the markers coincided and the tube geometry was degenerate.
- Phase 8 tests checked only the vertex array length, not geometric uniqueness. Phase 9 corrects the generator and adds exact cross-section and manifold tests.

### `src/demo/geometry-demo-camera-controller.js` and `geometry-demo-world.js`

**Score: 4.4 / 5**

- Follow mode now targets the tesseract while in the hypercube slice; corridor render-anchor targets take precedence during transit.
- The demo passes every tesseract render mesh through the same layer/visibility and portal-render-list lifecycle.
- Corridor speeds are configured at the demo composition boundary, not by changing global player movement defaults.
- Remaining improvement: add a browser/WebGL visual regression capture for the chamber framing and portal preview.

### Phase 8 tests

**Score: 4.9 / 5**

- Validates the default and bounded intrinsic metric scales, compressed demo proper lengths, preserved slice W coordinates, buffer updates, vertex visibility, shared renderer lifecycle, and camera focus behavior.
- Full suite passes 122/122.
- Remaining verification: no live browser/WebGL rendering test is claimed.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `spatial-corridor.js`, `corridor-traversal-controller.js`, `geometry-demo-topology.js`, `geometry-demo-world.js`, `geometry-demo-camera-controller.js`, `hypercube-4d-renderer.js`, build entry chain, corridor/tesseract/camera tests | Added intrinsic proper-length compression for demo anomalies; simplified R4 centre-lines without changing slice coordinates; upgraded tesseract to a thick tube mesh with vertex markers; aimed follow camera at tesseract; updated cache-busting build id. |

Phase 8 verification: **122/122 Node tests**, **113/113 source syntax checks**, **16/16 test syntax checks**, and **209/209 relative import targets resolved**. Browser/WebGL visual verification remains outstanding.


## Geometry Phase 9 review — true tesseract cross-sections (2026-11-08)

### `src/world/fields/geometry/hypercube-4d.js`

**Score: 4.7 / 5**

- Corrects the `Array.from()` callback-index defect; all 16 R4 corners are now distinct and every one of the 32 edges changes exactly one coordinate.
- Applies compound orthogonal rotations in the XW, YW, and ZW planes.
- Intersects all eight cubical facets with the requested W hyperplane, orders the resulting planar polygons, deduplicates section vertices, and builds a closed indexed polyhedral boundary.
- The math is Babylon-independent and validates inputs and finite tolerances.
- Remaining improvement: generalize the polytope-facet description if future geometry primitives need slicing beyond the tesseract.

### `src/demo/hypercube-4d-renderer.js`

**Score: 4.5 / 5**

- Replaces perspective scaling with a true 3D section surface, section edges, and a bounded pool of visible intersection markers.
- Keeps persistent Babylon meshes and fixed-capacity vertex/normal buffers; only index topology and active marker count change as W moves.
- Uses separate transparent surface and emissive edge materials and disposes all owned resources.
- Exposes W, slice vertices/faces/edges, rotation angles, and visible mesh counts for diagnostics.
- Remaining improvement: profile transparent surface overdraw and consider a shader/compute implementation only if more complex polytopes make CPU slicing expensive.

### `src/demo/geometry-demo-world.js`, `src/ui/main-menu.js`, and `src/scene/create-scene.js`

**Score: 4.4 / 5 (focused review of W-slice inspection)**

- Passes the free camera's W coordinate into the tesseract slicer; ordinary X/Y/Z camera movement remains independent.
- Narrows the chamber's W inspection bounds to the rotated tesseract's useful extent.
- Adds a live HUD readout of the W coordinate and current section vertex/face counts.
- Updates the chamber label and shared build identifier so browser caches cannot silently retain the previous renderer.
- Remaining improvement: a browser capture can later confirm visual framing and label spacing at slice topology transitions.

### Phase 9 tests

**Score: 5.0 / 5**

- Explicitly tests uniqueness of all 16 corners and single-coordinate adjacency of all 32 edges.
- Tests the axis-aligned central cube section, an oblique central polyhedron, changing W sections, rotation-dependent topology, and an empty slice outside the tesseract.
- Verifies every boundary edge of the default section is shared by exactly two faces.
- Babylon stub tests cover persistent buffers, surface/edge indices, marker visibility, W changes, and disposal of 34 meshes and two materials.
- Remaining verification: live browser/WebGL visual inspection is still required.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `hypercube-4d.js`, `hypercube-4d-renderer.js`, `geometry-demo-world.js`, `geometry-demo-camera-controller.js`, `main-menu.js`, `create-scene.js`, `main.js`, `index.html`, tesseract and cache-chain tests | Fixed the repeated-corner `Array.from()` defect; replaced W-dependent perspective scaling with exact intersection of rotated tesseract facets against the camera's W hyperplane; rendered the resulting translucent polyhedron, edges, and active intersection markers; added live HUD slice metrics and bumped the module cache chain. |

Phase 9 verification: **125/125 Node tests**, **113/113 JavaScript source syntax checks**, **16/16 test syntax checks**, and **165/165 relative import references resolved**. Live browser/WebGL visual verification remains outstanding.


## Geometry Phase 12 review — continuous anomaly influence and W-dependent reachability (2026-11-08)

### `src/world/fields/geometry/anomaly-influence-field.js`

**Score: 4.8 / 5**

- Keeps the influence math engine-independent and exposes focused pure functions for endpoint resolution, field evaluation, smootherstep, and generic chunk reachability.
- Derives its default center from the midpoint of endpoint positions in ambient R4; supports an explicitly fixed center for authored anomalies.
- Computes W span along the source slice normal, avoiding contamination from incidental tangential XYZ displacement between endpoint mouths.
- Separates movement freedom from W reach through independent configuration and runtime modifiers, leaving a clear seam for future character stats.
- Validates finite coordinates, radii, movement scales, and reach budgets before values enter runtime systems.
- Remaining improvement: if anomaly counts grow substantially, profile whether repeated field evaluation warrants precomputed immutable field coefficients; avoid caching before measurements justify it.

### `src/world/fields/geometry/spatial-anomaly.js` and `world-topology.js`

**Score: 4.4 / 5 (focused review of anomaly configuration and topology registration)**

- Keeps anomaly parameters serializable and backward-compatible; legacy Bezier anomalies remain a distinct type.
- Resolves the ambient influence center and anomaly-specific W budget at topology registration, where both endpoint slice frames are authoritative.
- Recomputes endpoint-derived centers when endpoints change, while fixed authored centers remain stable.
- Validates the transition's endpoint containment, distinct parallel slice planes, and supported anomaly type before registration.
- Remaining improvement: consider a dedicated versioned influence-profile migration only when persisted profiles become user-authored or long-lived; current defaults are safely derived on registration.

### `src/world/spatial-chunk-graph.js`

**Score: 4.3 / 5**

- Preserves stable three-dimensional chunk addresses and explicit topology edges; W proximity by itself cannot create a world connection.
- Keeps spatial and W reach as independent inputs to a shared reachability predicate and reports diagnostic measurements with each result.
- Projects ambient positions into destination slice-local coordinates before computing candidate chunk locations.
- Retains the dedicated `CorridorChunk` as the anomaly occupancy node and preserves legacy graph traversal APIs.
- Remaining improvement: index direct anomaly edges by source/destination slice pair if topology size makes repeated neighbor scans expensive; benchmark before changing the simple current lookup.

### `src/world/fields/geometry/slice-transition-traversal-controller.js` and `src/demo/corridor-traversal-network.js`

**Score: 4.2 / 5 (focused review of field-driven W movement)**

- Uses the shared influence evaluator for player W movement in the approach shell and in anomaly transit.
- Applies runtime freedom/reach modifiers through an explicit callback rather than coupling the spatial field to a character implementation.
- Keeps X/Y/Z movement independent from the W movement scale and retains the bounded R4 interior after entry.
- Leaves the cubic Bezier traversal implementation available through its existing controller path.
- Remaining improvement: centralize future multi-anomaly overlap arbitration in a dedicated field-composition policy if overlapping influence regions become common; current network selects the strongest matching field.

### `src/world/world-manager.js`

**Score: 3.4 / 5 (focused review of remote-slice streaming changes)**

- Adds reachable remote-slice chunks to the existing generation queue rather than introducing a second terrain mesh-generation pipeline.
- Computes LOD in destination-slice coordinates and retains recently reachable remote chunks briefly to prevent boundary flicker.
- Exposes remote reachability and retention counts through existing statistics.
- Remaining gaps: this legacy module still combines Babylon material ownership, worker management, terrain meshing, and streaming policy; its formatting and responsibilities are inconsistent with the newer geometry modules.
- Refactoring priority: extract a technology-independent chunk-streaming policy and keep the current worker/mesh implementation behind the existing manager boundary.

### `src/demo/geometry-demo-camera-controller.js`, `geometry-demo-world.js`, and `geometry-demo-topology.js`

**Score: 4.1 / 5 (focused review of influence-field wiring and portal entry refinement)**

- Shares the same ambient influence field between free-camera W movement and player/controller movement.
- Passes runtime influence modifiers through the demo composition boundary to movement and chunk streaming.
- Enlarges the Poincare-side anomaly aperture and aligns the interaction radius with the visible portal opening.
- Maintains the Phase 11 direct +5-W Main World anomaly and the existing three-slice demo topology.
- Remaining improvement: surface field distance, freedom, W reach, and failed portal-entry reason in a dedicated debug HUD so future multi-anomaly tuning is observable without console instrumentation.

### Phase 12 tests and documentation tooling

**Score: 4.8 / 5**

- Adds focused tests for ambient midpoint resolution, radial smootherstep behavior, independent movement/reach modifiers, W-normal endpoint span, cross-slice candidate projection, remote-chunk streaming hysteresis, and Poincare-side portal entry.
- Regression tests verify that ordinary chunk identity remains three-dimensional and that explicit topology remains required for cross-slice reachability.
- The documentation generator now strips browser cache-busting query/hash suffixes before resolving relative import paths, so dependency summaries include versioned browser imports.
- Remaining verification: no live browser/WebGL visual pass is claimed; manual testing is required for portal visuals, approach feel, streaming timing, and terrain rendering.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `anomaly-influence-field.js`, `spatial-anomaly.js`, `world-topology.js`, `spatial-chunk-graph.js`, `slice-transition-traversal-controller.js`, `corridor-traversal-network.js`, `world-manager.js`, `geometry-demo-camera-controller.js`, `geometry-demo-world.js`, `geometry-demo-topology.js`, influence/graph/movement/streaming/topology tests, `write_summary.sh` | Added a shared ambient R4 smootherstep freedom field, anomaly-specific W movement/reach budgets, endpoint-derived centers, explicit cross-slice chunk reachability and remote chunk streaming with hysteresis; widened the Poincare-side portal; repaired cache-query handling in the generated dependency graph. |

Phase 12 verification: **156/156 Node tests**, **116/116 source syntax checks**, **20/20 test syntax checks**, and **181/181 relative module references resolved**. Browser/WebGL visual verification remains outstanding.


## Geometry Phase 14 review — world-specific movement, bidirectional W freedom, and chart safety (2026-11-08)

### `src/game/player-controller.js`

**Score: 4.3 / 5 (focused review of movement-profile lifecycle and keyboard input)**

- Keeps the controller as the owner of character movement speeds and exposes validated `setMovementProfile()` / `getMovementProfile()` operations rather than having traversal code mutate fields directly.
- Validates the profile as a coherent walk/run pair and preserves omitted turn-speed values.
- Preserves browser/system shortcuts by ignoring modified keyboard events while retaining unmodified movement keys.
- Remaining improvement: consider moving movement-profile definitions into named world/gameplay configuration objects if more than the Main World and geometry chambers need distinct profiles.

### `src/world/fields/geometry/spatial-transform.js`

**Score: 4.5 / 5 (focused review of finite chart-domain constraints)**

- Separates authoritative world-coordinate constraints from render-space open-ball constraints.
- Applies the finite domain guard only to Poincare-based charts; Euclidean and spherical chart positions remain unchanged.
- Uses a small configurable inset to ensure the constrained coordinate remains strictly inside the finite world bounds before projection.
- Keeps `PoincareProjection.worldToBall()` strict, so invalid positions are rejected if a caller bypasses the transform boundary.
- Remaining improvement: if more bounded chart families are introduced, express the finite-domain constraint as a chart capability rather than extending geometry-name checks.

### `src/world/fields/geometry/slice-transition-traversal-controller.js`

**Score: 4.4 / 5 (focused review of handoff, W influence, and chart-safe arrival)**

- Uses the active world binding for movement-profile handoff and restores the prior world's profile on reverse traversal.
- Treats W freedom as a symmetric scalar influence rather than requiring input to point toward the paired endpoint.
- Requires the player to enter the source/destination slice interval before a reverse movement can trigger a source handoff, avoiding premature completion when exploring beyond the source plane.
- Constrains ambient transit positions to the active Poincare chart and also constrains final arrival in a bounded destination chart.
- Remaining improvement: keep source and destination world-chart constraints represented as explicit traversal boundary policies if future anomalies connect non-parallel or differently charted slices.

### `src/demo/geometry-demo-camera-controller.js`, `geometry-demo-world.js`, and `geometry-demo-topology.js`

**Score: 4.3 / 5 (focused review of free-camera anomaly movement, movement profiles, and W overhang)**

- Shares the symmetric W-influence logic with player traversal and constrains free anomaly camera positions before each Poincare projection.
- Covers both ambient-influence handoffs and bounded anomaly completion, including destination-side chart-safe arrival and the legacy Bezier camera completion path.
- Applies chamber- and Main-World-specific movement profiles through the world binding instead of relying on a single movement speed across different coordinate scales.
- Gives slice-transition regions a symmetric W overhang and makes non-hypercube HUD feedback reflect available anomaly W freedom.
- Remaining improvement: consolidate chart-safe ambient conversion helpers if additional camera and entity traversal paths need the same behavior; keep the camera controller from becoming a general-purpose transform service.

### Phase 14 tests and documentation

**Score: 4.8 / 5**

- Adds regressions for faster Main World movement after handoff, restored chamber movement, symmetric W freedom on either connected slice, and positive/negative W exploration around the source plane.
- Tests source- and destination-side Poincare chart constraints, inverted-Poincare constraints, Poincare free-camera anomaly movement, destination-side free-camera handoff, and follow-to-free camera entry with an out-of-domain inherited pose.
- Verifies the main application remains strict about invalid Poincare projection input; valid camera/player movement is constrained upstream.
- Remaining verification: no live browser/WebGL visual pass is claimed; manually test Main World movement feel, W movement on both sides of the Hypercube/Poincare anomaly, and camera switching/traversal near chart bounds.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `player-controller.js`, `spatial-transform.js`, `slice-transition-traversal-controller.js`, `geometry-demo-camera-controller.js`, `geometry-demo-world.js`, `geometry-demo-topology.js`, movement/traversal/camera/chart-boundary tests, Phase 14 documentation | Added per-world movement profiles, symmetric W freedom and endpoint overhang, corrected return-to-source detection, and chart-safe player/free-camera movement and handoffs. |

Phase 14 verification: **173/173 Node tests**, **116/116 source syntax checks**, **20/20 test syntax checks**, and **242/242 relative import references resolved** (zero missing). Browser/WebGL visual verification remains outstanding.

## Geometry Phase 15 review — Main-World re-entry and metric-grid presentation (2026-11-08)

### `src/demo/corridor-traversal-network.js` and `src/world/fields/geometry/slice-transition-traversal-controller.js`

**Score: 4.5 / 5 (focused review of post-handoff slice ownership)**

- Adds an explicit `ownsSlice()` capability so synchronized route state is not mistaken for an actual world binding.
- Resolves ambient R4 coordinates from a controller that owns the active Main-World slice, avoiding a false null result from an unrelated route controller.
- Evaluates only connected anomaly controllers with an active source-slice binding and arbitrates overlapping fields by movement scale.
- Retains explicit topology, anomaly chunk occupancy, and the anti-bounce exit lock.
- Remaining improvement: promote route ownership and active-field arbitration into shared topology/runtime capabilities if non-demo systems begin creating traversal networks.

### `src/world/fields/geometry/geometry-debug-grid.js` and `src/demo/geometry-demo-world.js`

**Score: 4.3 / 5 (focused review of metric-grid visibility and slice integration)**

- Separates the grid's user visibility preference from active-slice gating and gives keyboard handling a single owner in the demo world.
- Registers a terrain-conformed Main-World grid alongside the Poincare and Hypercube chamber grids.
- Selects the grid matching the active camera/player view slice and preserves the user preference across slice changes.
- Splits terrain-conformed lines at invalid samples and maintains consistent activation through demo lifecycle changes.
- Remaining improvement: validate actual draw ordering and line visibility in a live WebGL browser, then consider a material/line-width adjustment only if screenshots show inadequate contrast.

### Phase 15 tests and documentation

**Score: 4.8 / 5**

- Adds a full demo-topology integration fixture with all three anomaly controllers in their production order.
- Verifies Main-World ambient resolution, W movement in both directions, re-entry after clearing the exit lock, and the W-freedom HUD state.
- Verifies metric-grid toggle behavior, active-slice selection, Main-World terrain conformance, and handling of missing terrain samples.
- Remaining verification: no live browser/WebGL visual pass is claimed; confirm grid visibility and re-entry interaction in the user's browser.

| Date | Files reviewed or updated | Notes |
|---|---|---|
| 2026-11-08 | `corridor-traversal-network.js`, `slice-transition-traversal-controller.js`, `geometry-demo-world.js`, `geometry-debug-grid.js`, Main-World anomaly/grid tests, Phase 15 documentation | Fixed post-handoff ambient-position lookup by checking actual slice ownership; restored W field evaluation and direct anomaly re-entry on Main World; unified grid toggling and added a terrain-conformed grid for each demo slice. |

Phase 15 verification: **186/186 Node tests**, **116/116 source syntax checks**, **22/22 test-module syntax checks**, and static relative-module verification is recorded in `GEOMETRY-PHASE-15-TEST-RESULTS.txt`. Browser/WebGL visual verification remains outstanding.


### Phase 16B — Slice-native optical geometry and ray tracing

**Review date:** November 8, 2026  
**Files reviewed/added:**

- `src/world/fields/geometry/optical-scene-registry.js`
- `src/world/fields/geometry/optical-slice-tracer.js`
- `src/world/fields/geometry/optical-debug-renderer.js`
- `src/world/fields/geometry/babylon-geometry-adapter.js`
- `src/world/world-chunk.js`
- `src/world/world-manager.js`
- `src/scene/create-scene.js`
- `src/demo/geometry-demo-world.js`
- `src/demo/hypercube-4d-renderer.js`
- `src/world/fields/geometry/optical-contracts.js`
- `src/world/fields/geometry/optical-metric.js`
- `src/world/fields/geometry/optical-ray-integrator.js`
- `tests/optical-foundation.test.mjs`
- `tests/optical-intersections.test.mjs`
- `tests/optical-debug-renderer.test.mjs`

**Strengths**

- Separates the CPU optical domain/geometry registry from Babylon presentation and rendering projection.
- Preserves stable slice and chunk identity on every registered surface.
- Copies source mesh buffers and builds deterministic per-registration BVHs, so mutable Babylon buffers cannot retroactively alter an existing query structure.
- Uses the authoritative terrain sampler for streamed terrain, independent of LOD triangle meshes.
- Handles non-square raster spacing independently along X and Z.
- Keeps Poincare metric validation strict and compares curved slice rays with intrinsic geodesic references.
- Projects diagnostic samples only at draw time and explicitly disposes generated line meshes.
- Adds focused regression coverage for intersections, filtering, revision replacement, debug path grouping, and lifecycle.

**Remaining gaps**

- BVHs are per mesh registration rather than merged per chunk; the current design favors revision isolation, but top-level chunk acceleration may be useful at larger scene sizes.
- Curved ray/triangle intersections use adaptive integration chords rather than a continuous geodesic/triangle root solve.
- Heightfield intersection is a CPU sampling/bisection reference and cannot represent terrain oscillations beyond source raster resolution.
- The new scene metadata factory and diagnostic line overlay still require manual browser/WebGL exercise.
- Optical topology traversal, aperture transfer, material energy interactions, and renderer lighting integration remain future milestones.

**Refactoring/performance priority**

- **P1:** validate the optical tracer and line overlay in a live browser session in both Euclidean Main World and Poincare chamber.
- **P1:** implement cross-slice optical path events and interface momentum transfer in Phase 16C without changing slice-native intersection contracts.
- **P2:** profile registrations and BVH query counts before deciding whether to combine mesh BVHs into chunk-level acceleration structures.
- **P2:** consider adaptive curved-path/surface root refinement if Phase 16E shadow-edge accuracy requires it.

**Verification:** `node --test tests/*.test.mjs` — 228 passed, 0 failed; source syntax and relative import checks also passed.

### Phase 16C — Cross-slice anomaly optical transport

**Review date:** November 8, 2026  
**Status:** Implemented; 255/255 project tests pass.

**Files reviewed or updated:**

- `src/world/fields/geometry/optical-anomaly-tracer.js`
- `src/world/fields/geometry/optical-contracts.js`
- `src/world/fields/geometry/optical-metric.js`
- `src/world/fields/geometry/optical-ray-integrator.js`
- `src/world/fields/geometry/optical-slice-tracer.js`
- `src/world/fields/geometry/optical-scene-registry.js`
- `src/world/fields/geometry/spatial-transform.js`
- `src/world/fields/geometry/world-topology.js`
- `src/world/spatial-chunk-graph.js`
- `src/demo/geometry-demo-topology.js`
- `src/scene/create-scene.js`
- `src/main.js`
- `tests/optical-foundation.test.mjs`
- `tests/optical-anomaly-tracing.test.mjs`
- `tests/optical-demo-transport.test.mjs`
- `index.html`

**Strengths**

- Keeps optical connectivity independent from player traversal and preserves explicit topology as the sole cross-slice authorization mechanism.
- Carries ray position and canonical momentum in authoritative R4; render-space projection is used only for presentation.
- Uses endpoint metric sampling and basis rebasing to avoid extrapolating either endpoint's Poincare metric chart through the full bridge by default.
- Preserves aperture-tangential canonical momentum and the Hamiltonian at each idealized 3D/4D interface, with diagnostics for the transfer.
- Supports one- and multi-anomaly paths with configured topology direction, optical W reach, aperture, chunk-reachability, segment, and transition limits.
- Normalizes positive-definiteness/inversion checks by metric scale, allowing small but well-conditioned Main-World Poincare tensors.
- Turns declared chart-domain crossings into controlled terminal ray events while allowing unrelated errors to propagate.
- Adds a regression for the complete Hypercube → Poincare → Main World two-anomaly path.

**Known scope boundaries**

- Anomaly-interior geometry is currently the metric/aperture/bounded-region field; arbitrary 4D mesh intersection is not implemented.
- Current topology debug rendering presents slice segments; anomaly R4 samples are available in results but do not yet have a dedicated four-dimensional visualization.
- The aperture transfer law is idealized and deterministic. It is not yet a Fresnel/Snell model with reflection, refraction, or branched energy.
- No visible sunlight, cross-slice shadow, or Babylon direct-light integration has been added; these remain Phase 16E.
- No live browser/WebGL verification was available in this development environment.

**Refactoring/performance priorities**

- **P1:** validate the topology-aware tracer from the browser console in both Poincare and Main-World views; confirm optical metric scales and expected ray routes.
- **P1:** add a dedicated projected view for anomaly R4 samples if ray visualization is required before the lighting integration milestone.
- **P2:** profile bridge metric sampling and adaptive integration on realistic rays before choosing a GPU backend.
- **P2:** implement 4D object acceleration/intersection only when anomaly interiors begin containing authoritative 4D scene geometry.

**Verification:** `node --test tests/*.test.mjs` — **255 passed, 0 failed**. Static syntax/import checks and extracted-package verification are recorded in `GEOMETRY-PHASE-16C-TEST-RESULTS.txt`.


### Phase 17A — Anomaly-fed movable spotlight prototype

**Review date:** November 9, 2026  
**Status:** Implemented; 274/274 project tests pass.

**Qualitative source scores**

| File | Score | Review note |
|---|---:|---|
| `src/world/fields/geometry/optical-light-source.js` | 4.5 / 5 | Pure validated source contract and transport adapter; no Babylon dependency. |
| `src/world/fields/geometry/optical-anomaly-tracer.js` | 4.0 / 5 | Focused opt-in early-exit behavior; existing orchestration function remains substantial. |
| `src/demo/geometry-demo-world.js` | 3.0 / 5 | Integration is localized, but the class still owns several rendering, camera, input, and lifecycle responsibilities. |

**Files reviewed or updated:**

- `src/world/fields/geometry/optical-light-source.js` (new)
- `src/world/fields/geometry/optical-anomaly-tracer.js`
- `src/demo/geometry-demo-world.js`
- `tests/optical-light-source.test.mjs` (new)
- `index.html` and the application module import chain

**Strengths**

- Keeps the spotlight definition, validation, movement, aiming, and ray-to-receiver derivation independent of Babylon.js.
- Reuses the established optical anomaly tracer and explicit topology permissions rather than inventing a second cross-slice transport path.
- Makes stopping at the first aperture exit an opt-in tracer feature, preserving default behavior for other callers.
- Uses the destination tangent cometric to recover the outgoing slice velocity from canonical momentum, then applies the destination `SpatialTransform` for rendering.
- Limits the receiver-side light to the Main World layer and bounds shadow casters to nearby eligible scene meshes. It also restores original mesh shadow-reception flags during set changes and disposal.
- Adds focused deterministic tests for source validation, immutable movement/rotation, successful direct anomaly crossing, live Main World Poincare compatibility, and rejected aiming.

**Remaining gaps**

- `GeometryDemoWorld` continues to own input, orchestration, and Babylon presentation. If the feature grows to multiple light sources, move the editing controls and Babylon light adapter into focused collaborators.
- The virtual receiver is derived from one central ray and is an approximation of a finite-width spotlight through curved optical geometry.
- The bounded receiver-side shadow map is not a substitute for backward optical visibility rays from each receiving surface through the anomaly.
- The actual browser/WebGL illumination and shadow appearance must be visually checked by the user; automated CPU tests cannot verify rendering quality.

**Refactoring/performance priority**

- **P1:** validate the spotlight source marker, received illumination, and shadow map in the browser, including both the Main World and portal preview.
- **P1:** verify that the shadow caster selection includes the expected terrain/scene meshes and does not cause visible layer leakage.
- **P2:** generalize the source contract to point lights and multiple sources only after the one-spotlight path is visually confirmed.
- **P2:** investigate full per-surface optical shadow rays and multi-ray beam reconstruction as separate, testable increments.

**Verification:** `node --test tests/*.test.mjs` — **274 passed, 0 failed**. Focused spotlight tests: 7 passed.


### Phase 17I — Bidirectional spherical anomaly passage

**Review date:** November 9, 2026  
**Status:** Implemented; 322/322 project tests pass. Browser/WebGL visual validation remains outstanding.

**Qualitative source scores**

| File | Score | Review note |
|---|---:|---|
| `src/demo/anomaly-passage-presentation.js` | 4.0 / 5 | Focused presentation owner with pure layout math, two explicit renderer lifecycles, stable display frame, and camera-offset restoration. It remains intentionally Babylon-specific. |
| `src/demo/geometry-demo-world.js` | 3.0 / 5 | Integration is localized to the demo composition root; the class remains large and owns many existing application/rendering responsibilities. |
| `src/demo/geometry-demo-camera-controller.js` | 3.5 / 5 | Existing follow/free modes supply the two supported travel-heading sources; the controller's independent free-camera state is preserved. |
| `src/world/fields/geometry/portal-preview-renderer.js` | 4.0 / 5 | Reused as the explicit owner of each mouth camera, render target, sphere, material, visibility registration, render list, and disposal. |

**Files reviewed or updated:**

- `src/demo/anomaly-passage-presentation.js` (new)
- `src/demo/geometry-demo-world.js`
- `src/demo/geometry-demo-camera-controller.js` (reviewed for free-camera transit behavior)
- `src/demo/geometry-demo-topology.js`
- `src/world/fields/geometry/portal-preview-renderer.js`
- `tests/anomaly-passage-presentation.test.mjs` (new)
- `tests/anomaly-view-transform.test.mjs`
- `index.html` and the application module import chain

**Strengths**

- Keeps all mouth positions, rotations, scale multipliers, and display-camera progression in a dedicated 3D presentation layer. The canonical anomaly endpoints, W coordinate, topology, traversal metric, and collision geometry are not modified.
- Reuses the existing `PortalPreviewRenderer` resource owner twice rather than duplicating sphere/texture/camera/material lifecycle code. Each renderer gets an independent render list and endpoint world layer.
- Preserves endpoint-world ownership: render lists are borrowed from existing endpoint portals; mouth renderer disposal does not dispose streamed world meshes or chunk resources.
- Follows player travel heading in follow mode and captures the travel-aligned free-camera forward direction at entry. The passage frame remains stable when the camera later orbits.
- Removes the temporary display offset before the follow/free camera controller computes its next authoritative pose, preventing feedback drift. Repeated updates are idempotent when no controller tick occurs.
- Explicitly restores the scene clear color and camera layer mask on deactivation and disposes both additional render targets, cameras, surfaces, and materials.
- Adds deterministic layout, perspective, reverse-direction, render-list ownership, sphere orientation, camera-mapping, and controller-integration tests.

**Remaining gaps**

- Actual sphere UV projection, back-side visual appearance, transparency/depth sorting, render-target cost, and endpoint handoff have not been verified in a live WebGL session. A headless Chromium attempt could not initialize its graphics backend in this environment and is not counted as a visual test.
- The entrance image still uses the live viewer camera orientation while looking back into the source world; visual inspection should confirm that off-axis orbit remains intuitive.
- Two live render targets are created per eligible anomaly pair. Resolution scaling, render-target sharing, and GPU-memory pressure policies remain future performance work.
- `GeometryDemoWorld` remains a large composition root; further separation should be considered only when another presentation mode needs to reuse the orchestration.
- The new presentation module depends on Babylon globals through the existing renderer abstraction. A renderer-independent camera/presentation contract is a possible later extraction, not required for this bounded phase.

**Refactoring/performance priority**

- **P1:** inspect forward and reverse traversal in a real browser, including camera orbit/translation, both mouth images, black background, and endpoint handoff.
- **P1:** measure frame time and GPU memory with all eligible anomaly passages initialized; assess render-target resolution and update cadence before optimizing.
- **P2:** add a browser-driven regression for render-target cameras, off-axis sphere projection, and cleanup once the application has a repeatable browser harness.
- **P3:** consider a reusable presentation-frame provider if future anomaly types need non-camera-derived display axes.

**Verification:** `node --test tests/*.test.mjs` — **322 passed, 0 failed**. Static syntax checks: 128/128 source modules and 33/33 test modules passed. Relative module references: 333 checked, 0 missing. Extracted-archive verification is recorded in `GEOMETRY-PHASE-17I-TEST-RESULTS.txt`.
