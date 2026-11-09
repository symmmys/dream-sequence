# Somnium — Geometry Phase 15
## Main-World anomaly re-entry and per-slice metric grid

Date: 2026-11-08
Build: `somnium-20261108-phase15-main-world-reentry-metric-grid-1`

## Summary

Phase 15 repairs ambient-position resolution after cross-slice handoff and makes the
Geometry Demo metric grid independently toggleable and available in every demo slice.

## Main-World anomaly re-entry

### Root cause

`CorridorTraversalNetwork.syncSlice()` synchronizes the active slice id across every
route controller. A controller's `currentSliceId` therefore does not prove that the
controller owns a local `WorldSlice` binding for that slice.

After handoff to Somnium Main World, the network previously selected the first
controller whose `currentSliceId` matched the Main World. That controller represented
the Hypercube-to-Poincare route and had no Main World entry in its `worlds` map. Its
ambient-position lookup returned `null`. The HUD consequently reported `W SLICE
INACTIVE`, and the network could not evaluate ambient influence movement or reliably
select the correct route from the Main World side.

### Changes

- `SliceTransitionTraversalController.ownsSlice(sliceId)` explicitly reports whether
the controller has a binding for a slice.
- `CorridorTraversalNetwork.getAmbientPlayerPosition()` ignores synchronized
  controllers that do not own the active slice and selects the first owner that
  produces a finite ambient R4 position.
- `advanceAmbientInfluenceMovement()` resolves one authoritative ambient position,
  evaluates only anomaly controllers that own the active slice, and selects the
  strongest available influence field.
- The shared route network remains responsible for slice synchronization and route
  arbitration; topology remains explicit and W proximity alone does not invent links.
- The Main-World HUD can now report active W freedom using the correct ambient
  position and the connected anomaly field.

The existing short exit lock is retained to prevent immediate bounce-back at a portal
mouth. The player must move at least the configured 1.25-unit lock distance away from
the arrival point before re-entering; after clearing it, the entry radius and heading
requirements work as before.

## Metric grid

### Root cause

The grid's visibility preference and active-slice state were separate, but the old
activation path only changed the active flag. The HUD button did not enable the
visibility preference, and the grid's own G-key handler only listened while the grid
was already active. That made the toggle paths unable to reliably reveal the grid.
The demo also had no metric grid registered for Somnium Main World.

### Changes

- `GeometryDebugGrid` now exposes independent `setVisible()` and `setActive()`
  operations; the mesh is rendered only when both states are true.
- `GeometryDemoWorld` owns the G-key handler. G toggles the same shared preference as
  the HUD's METRIC GRID button; Ctrl/Meta/Alt-modified shortcuts are left untouched.
- The active camera slice determines which per-slice grid is enabled.
- Added a Main-World grid centered on the live anomaly arrival anchor. It samples the
  live terrain surface and offsets its lines slightly above terrain elevation.
- Terrain gaps split grid polylines, avoiding lines that bridge missing terrain
  samples.
- Diagnostics now report visibility and active state for the Main-World grid as well
  as the existing chamber grids.

## Preserved behavior

- World chunk identities remain `(sliceId, chunkX, chunkZ)`.
- Anomaly chunks and explicit topology connections remain unchanged.
- The Poincare projection and chart-boundary validation remain strict.
- The cubic Bezier corridor implementation remains in the codebase.
- Camera controls, per-world movement speeds, and Ctrl+R/Cmd+R behavior are unchanged.

## Verification

Automated test command:

```bash
node --test tests/*.test.mjs
```

Phase 15 results: **186/186 automated tests passed**, **116/116 source syntax checks passed**, **22/22 test syntax checks passed**, and **248 relative references resolved with zero missing**. Detailed results are recorded in `GEOMETRY-PHASE-15-TEST-RESULTS.txt`.

A live browser/WebGL visual session was not available in the build environment. Manual
verification should confirm: (1) W freedom appears on the Main-World side after
arrival, (2) the player can move away from the exit lock and re-enter the connected
anomaly, (3) the HUD switches from inactive to active when the influence field is
available, and (4) G and the HUD button reveal the grid in the Poincare room, Hypercube
chamber, and Main World, with the Main-World grid following local terrain elevation.
