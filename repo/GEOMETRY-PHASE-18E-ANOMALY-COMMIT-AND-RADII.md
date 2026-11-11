# Geometry Phase 18E — Anomaly Commit and Radius Controls

Phase 18E adds an explicit finalization action to the Phase 18D Anomalies editor and exposes two important geometric parameters.

## Save & Place

The editor now offers **SAVE & PLACE ANOMALY** and the **Ctrl+Enter** shortcut. The shortcut is active only while the Level Builder is open on the Anomalies tab and does not trigger while a form control, button, textarea, or editable region has focus. Finalization refuses an explicitly unplaced draft, validates both radii, persists the record, and sets `enabled` to true.

Legacy built-in definitions that predate per-mouth `placed` flags remain eligible for finalization unless explicitly marked unplaced.

## Geometry controls

- **Aperture radius** is persisted to `runtime.optics.apertureRadius` and `runtime.entryRadius`. The former controls the optical aperture boundary; the latter is the spatial anomaly's entry/trigger radius.
- **W-freedom radius** is persisted to `runtime.influence.maxWReach`, the maximum W reach used by the continuous anomaly influence field.

Both values are positive finite numbers capped in the editor at 1000 world units. They are included in runtime anomaly conversion and therefore survive reloads and apply to the three existing built-in live anomaly pairs.

## Runtime registration boundary

The Phase 18D runtime currently creates portal renderers and traversal controllers for the three built-in anomaly IDs. Phase 18E does not silently pretend arbitrary new persistent IDs have those live resources: a new record can be saved/enabled, but the editor reports that it is not attached to a live runtime portal pair. Generalized dynamic registration is intentionally left for the next phase.

## Validation

See `GEOMETRY-PHASE-18E-TEST-RESULTS.txt`.
