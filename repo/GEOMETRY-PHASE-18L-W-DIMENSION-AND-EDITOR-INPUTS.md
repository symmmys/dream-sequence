# Somnium Geometry — Phase 18L
## W-Dimension Runtime, Plane Camera Context, Hypercube Visibility, and Editor Hotkeys

### Scope
Phase 18L builds on the browser-tested Phase 18K archive. It refines Plane W-thickness semantics, editor navigation, runtime registration, and gameplay visibility of authored hypercubes.

### W dimension
- A user-defined Plane's saved `container.dimensions.w` is interpreted as its full W thickness.
- The runtime Plane exposes a centered W interval `[-w/2, +w/2]`, relative to its frame's `origin.w` and normal.
- Editing an existing Plane updates that runtime interval without replacing its registered slice identity.
- In free inspection mode, E/Q move through the W cross-section of a user-defined Plane, clamped to its W interval. Existing ordinary demo-room W controls remain unchanged; anomaly-driven W movement remains supported.
- Plane selection promotes the saved definition to a runtime slice before resolving the editor camera transform. The editor camera retargets and adjusts its inspection radius using the Plane dimensions and local metric visual scale.

### Runtime transform registration
The Plane-frame adapter now implements `getInfo()` in addition to its projection, inverse, Jacobian, visual-scale, and domain methods. This satisfies the diagnostics contract expected by `GeometryRenderer`, fixing `TypeError: this.transform.getInfo is not a function` when a new saved Plane is registered.

### Hypercube gameplay visibility
The dedicated animated renderer continues to own the original migrated demo tesseract. The Plane-object renderer no longer suppresses every hypercube on built-in runtime Planes: only the original `demo-hypercube4d` record is treated as the duplicate. Additional authored hypercubes remain visible in their owning active Plane in gameplay.

### Hotkeys
While the Plane Editor is active and an object is selected:
- `G` — Translate
- `R` — Rotate
- `S` — Scale

Within the Planes top-level tab:
- `Alt+1` — Plane Editor subtab
- `Alt+2` — Anomalies subtab

Shortcuts are ignored while typing in input, textarea, select, or content-editable elements. Modifier shortcuts and repeats are not intercepted. Existing `B`, `V`, `Ctrl+S`, and `Ctrl+Enter` behavior is retained.

### Camera context
Selecting a saved Plane first ensures its runtime registration, then resolves the camera against that Plane's own runtime transform. Focus radius is derived from the Plane's XYZ container dimensions and local visual scale, reducing stale targets/zoom when moving between different geometries and metric scales.

### Persistence and compatibility
- No IndexedDB schema migration.
- No saved Plane or anomaly data is deleted or reset.
- Existing Plane W dimensions are read as full thickness; center remains `frame.origin.w`.
- Install over Phase 18K or use the complete project archive.

### Verification limits
Automated tests and static checks are recorded in the accompanying results file. A live browser/WebGL session is still required to visually verify camera retargeting, authored hypercubes, and E/Q W navigation in a real user-created Plane.
