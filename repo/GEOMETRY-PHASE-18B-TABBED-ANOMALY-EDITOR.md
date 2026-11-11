# Somnium Geometry — Phase 18B: Tabbed Level Builder and Anomaly Management

## Scope delivered

Phase 18B evolves the existing BUILDING EDITOR into a tabbed Level Builder:

- **Buildings** retains the existing room, door, window, furniture, floor-plan, placement, and building-position workflows.
- **Anomalies** lists persistent anomaly connections from the separate `somnium-planes` IndexedDB database.
- Existing anomaly records can be selected, renamed, enabled/disabled, duplicated, and deleted.
- New anomaly records are created as disabled drafts with stable IDs and references to registered Planes. Draft mouths start at neutral placeholder coordinates and are explicitly marked unplaced.
- Unplaced drafts cannot be enabled. Mouth placement and editing are intentionally deferred to Phase 18C.
- The editor receives its persistence service after the geometry demo initializes, without coupling anomaly data to the saved-World database.

## Data and safety notes

The Anomalies tab edits persistent definitions, not live runtime objects. Saving a name or enabled state updates the anomaly record and increments its revision. Duplicate and create operations use fresh IDs. New and duplicated records are disabled and carry `endpointConfiguration.placementStatus = "unplaced"` until Phase 18C provides real endpoint placement.

The Buildings tab is retained as its own panel. Existing BUILD tools continue to use the same controls and callbacks. The Level Builder tab structure is designed to accommodate future editor sections.

## Deliberate limitations

- No cross-Plane mouth placement UI yet.
- No endpoint position/orientation editor yet.
- No runtime rebuild/reload from edited anomaly definitions yet; that is a later runtime integration milestone.
- IndexedDB initialization and persistence still require the user's browser validation. Node tests cannot substitute for a real browser IndexedDB session.

## Validation

Run the full test suite from the project root:

```bash
node --experimental-default-type=module --test tests/*.test.mjs
```

Phase 18B adds static integration tests for tab structure, preservation of building controls, anomaly CRUD controls, and persistence injection.
