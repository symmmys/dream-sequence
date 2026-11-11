# Geometry Phase 18F — Dynamic Anomaly Runtime Network

## Goals

Phase 18F removes the built-in-ID restriction from the live anomaly runtime for the currently registered demo Planes. A placed anomaly definition can now create its own portal pair, optional corridor renderers, spatial chunk-graph link, and traversal controller. Existing IDs and the Phase 17I spherical passage presentation remain intact.

## Runtime lifecycle

- Persistent anomaly definitions are loaded from the separate `somnium-planes` database.
- The three built-in records are applied to the bootstrap topology before initial renderers and controllers are built.
- Other saved, placed records are applied after the base `GeometryDemoWorld` and traversal network exist.
- `GeometryDemoWorld.applyAnomalyDefinition()` validates that both endpoints refer to different live Planes, resolves the persisted record into a runtime anomaly, registers/updates topology and chunk graph state, creates or updates a two-mouth portal pair, creates the appropriate traversal controller, rebuilds boundary renderers, and refreshes portal render lists.
- Both `slice-transition` and legacy Bezier anomalies are supported. Bezier anomalies receive endpoint corridor renderers; slice-transition anomalies use the four-axis traversal controller.
- Disabled but placed anomalies retain a runtime pair/controller while topology visibility/traversal flags keep them inactive. Unplaced drafts do not create runtime resources.
- Deleting an anomaly disposes its portal pair, passage presentation, corridor renderers, traversal controller, boundary renderers, topology link, and chunk-graph link.
- `CorridorTraversalNetwork` now supports safe controller attachment/removal and binds newly added controllers into the shared slice-change lifecycle.

## Editor navigation

- `B` enters the Building Editor from the main menu and exits it when already in the editor.
- The shortcut ignores text-entry targets and is scoped to menu/editor modes.
- The floating BUILD launcher now uses the same dark button palette, border, radius, typography, and hover treatment as the other Somnium buttons. It advertises `B`.
- `1` selects Buildings; `2` selects Anomalies. Numpad 1/2 are supported as well. These shortcuts are active only while the editor is open and do not intercept text entry.

## Scope and limitations

- Dynamic anomaly links are supported between the three currently live demo Planes: Poincaré Room, 4D Room, and Main World.
- A future Plane Editor/runtime Plane registration phase is still needed before user-created Plane definitions can be rendered and traversed. Persisted anomalies that refer to a Plane without a live runtime binding are reported to the console and skipped rather than partially registered.
- A runtime network edit is rejected while any anomaly traversal is in progress, avoiding mutation of the active traversal controller.
- Browser/WebGL interaction was not automated in this phase. The complete Node test suite and syntax checks were run; final in-browser confirmation remains with the project owner.

## Keyboard reference

| Key | Action |
|---|---|
| `B` | Enter/exit Building Editor from menu/editor |
| `1` | Buildings tab |
| `2` | Anomalies tab |
| `Ctrl+Enter` | Save/place selected anomaly |
