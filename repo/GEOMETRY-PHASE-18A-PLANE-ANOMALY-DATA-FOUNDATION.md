# Somnium Geometry — Phase 18A
## Plane and Anomaly Data Foundation

**Build:** `somnium-20261109-phase18b-tabbed-anomaly-editor-1`

### Scope delivered

Phase 18A establishes the persistent identity and storage foundation for Planes and anomalies. It deliberately does not yet add the Level Builder tabs, cross-Plane placement workflow, or dynamic runtime construction; those belong to later Phase 18 milestones.

### Plane identity

Added `src/world/fields/geometry/plane-registry.js`.

- Plane identity is a stable ID, independent of saved World/universe identity.
- The registry exposes lookup, enumeration, registration, upsert, serialization, and guarded removal.
- The initial demo registry is derived from the existing `WorldTopology`, not duplicated as a second hardcoded topology.
- Initial Plane records are:
  - `geometry-demo-room` — Poincaré Room
  - `geometry-demo-4d-chamber` — 4D Room
  - `somnium-main` — Main World

### Separate persistence database

Added `src/world/persistence/plane-anomaly-persistence.js`.

- IndexedDB database: `somnium-planes`.
- Object stores: `planes`, `anomalies`, and `bootstrap`.
- This database is intentionally separate from `somnium-worlds` and does not modify `WorldState` or its existing save format.
- Plane records and anomaly records are keyed by stable IDs.
- `bootstrapDemo(topology)` seeds the three initial Plane records and converts the three existing topology connections into persistent anomaly definitions.
- A bootstrap marker makes the seed operation one-time. Existing records are never overwritten, preserving user edits. The seed writes and marker are committed in one IndexedDB transaction.
- The existing anomaly IDs are retained:
  - `geometry-demo-corridor`
  - `geometry-demo-4d-corridor`
  - `geometry-demo-4d-main-world-corridor`

The bootstrap is invoked during geometry-demo initialization. Storage failure is logged but does not prevent the playable geometry demo from starting.

### Persistent anomaly definitions

The existing `anomaly-definition.js` is used as the editor-facing record boundary. It stores stable IDs, names, enabled state, endpoint Plane IDs and positions, normalized endpoint orientations, connection settings, endpoint-specific configuration buckets, and the runtime definition. Runtime resources are not persisted.

The Phase 17I passage presentation settings are now retained when spatial anomaly view configuration is normalized. Previously, `passagePresentation` was omitted by `createAnomalyViewConfig`; this could discard custom presentation settings during a create/normalize cycle. A regression test now protects this behavior.

### Application integration

`GeometryDemoWorld` exposes its `PlaneAnomalyPersistence` instance and bootstrap result. `create-scene.js` publishes these on `scene.metadata` for subsequent editor integration.

The existing BUILD/Building Editor and Worlds save database are unchanged in this milestone.

### Compatibility

- Existing `somnium-worlds` database remains untouched.
- Existing `WorldState` schema remains version 1.
- The three runtime demo connections continue to be constructed by the existing topology/runtime code in this milestone; the new database records are the persistent authoring foundation for the next runtime-builder milestone.
- Plane IDs are not derived from display names or list ordering.

### Next implementation milestone

Phase 18B will evolve the existing BUILD panel into a tabbed editor, retaining all current building tools under Buildings and adding the Anomalies authoring interface. Phase 18C will add Plane-aware placement sessions and independent endpoint editing.
