# Somnium Geometry — Phase 18K
## Anomaly Plane Runtime Registration and Preview Repair

### Purpose

Phase 18K completes the Plane-centric editor integration before the project moves on to peer-to-peer multiplayer work. It builds on Phase 18J and addresses two runtime integration defects reported during browser testing: newly created saved Planes could not be used reliably as anomaly mouth destinations, and Plane-owned geometry was omitted from the anomaly's remote Plane preview.

### Editor organization retained

The top-level build menu has two tabs:

- **Planes** — owns Plane editing and anomaly editing.
  - **Plane Editor** — Plane definitions, container settings, backgrounds, object creation/editing, transforms, and save.
  - **Anomalies** — anomaly list, endpoints, connection settings, mouth placement, and aperture controls.
- **Object Editor** — retains the existing create-building-from-floor-plan workflow and its building controls.

The existing `B` build-menu shortcut and `V` zoom-speed cycle are preserved. `Ctrl+S` saves the selected Plane. The anomaly commit shortcut remains `Ctrl+Enter`.

### Saved Plane to runtime Plane registration

Saved Plane definitions and live runtime slices are distinct concepts. Earlier in the workflow, a Plane created after demo startup could exist in IndexedDB and appear in the editor, without yet having a corresponding runtime slice. Anomaly endpoints require an actual runtime Plane, so menu population alone was insufficient.

Phase 18K adds `GeometryDemoWorld.ensureRuntimePlane(definition)` and uses it when saved Plane definitions are loaded, when anomaly endpoint menus are populated, and when an endpoint is selected. The helper creates the runtime slice, Plane frame transform, topology and slice-registry entries, geometry-adapter and chunk-graph entries, movement surface/bounds, world binding, and anomaly layer/traversal bookkeeping. It is idempotent for an already registered Plane. Built-in demo Planes continue to use their existing runtime worlds.

A saved Plane is promoted into the runtime graph before it is used as an anomaly destination. This preserves the separation between saved Plane definitions and runtime Plane instances without requiring a destructive storage migration.

### Plane-authored geometry in anomaly previews

Plane object meshes identify their owner through `planeId`; the portal preview list previously expected `sliceId`, so many Plane-owned meshes were not included. Phase 18K now assigns both identities consistently and uses either identity when building a Plane's preview render list.

The preview list distinguishes objects hidden because another Plane is currently active from objects the user intentionally marked hidden. During the isolated anomaly render-target pass, eligible Plane objects belonging to the remote Plane are temporarily made visible, then their previous visibility state is restored immediately after the pass. Authored-hidden objects remain hidden. Portal surfaces, passage mouth meshes, disabled meshes, and unrelated Plane meshes are excluded.

Newly authored objects are materialized during Plane refresh. The editor therefore rebuilds the anomaly preview lists after refresh, ensuring saved/new meshes are included rather than relying on an earlier, incomplete mesh list.

The standalone rotating 4D hypercube renderer is separate from the Plane-object renderer. Its surface, edge, and vertex meshes now also carry their owning `sliceId`, so the tesseract can participate in Plane-specific portal previews.

### Background persistence

The Phase 18J behavior is retained: saved Plane background settings apply to the active runtime Plane outside the editor, and the celestial background updater respects the active Plane override rather than overwriting it with black. Leaving the editor restores the active Plane's saved background (or the normal scene background when no matching Plane override exists).

`applyPlaneDefinition` updates the saved definition cache and promotes the Plane to runtime only when the runtime registry graph is initialized. This allows partial/test contexts to apply background metadata safely without attempting to construct runtime slices from an incomplete fixture.

### Persistence and compatibility

- No IndexedDB schema upgrade is introduced in Phase 18K.
- Existing `somnium-planes` records are preserved.
- Do not clear browser storage to install this phase.
- The incremental patch is based specifically on the Phase 18J full project archive.
- New saved Planes remain in the existing separate Plane/anomaly database; Worlds remain distinct from Planes.

### Verification status

The automated Node test suite passes **407 tests, 0 failures, 0 skipped**. All 182 JavaScript source/test files pass `node --check`. A static relative-import audit checked 372 imports and found zero missing targets. Archive integrity and exact patch reconstruction are checked as part of packaging.

No live browser/WebGL session was available during this packaging pass. The user should perform the browser checks in the accompanying checklist, particularly anomaly previews for Poincaré objects, the rotating tesseract, and custom Plane objects.
