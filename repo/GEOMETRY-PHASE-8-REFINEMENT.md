# Geometry Phase 8 — corridor metric compression and visible tesseract

Build: `2026-11-08-hypercube-visibility-short-corridors-1`

## Goals

Shorten the time required to traverse the two demo anomalies and make the rotating tesseract conspicuous in the default hypercube-chamber view.

## Corridor changes

`SpatialCorridor` now has a validated `intrinsicLengthScale` in `(0, 1]`. It scales the proper distance measured along an anomaly without changing its authoritative R4 centreline, world-slice coordinates, chunk identity, or topology edges. This models an anomaly whose interior metric compresses distance. The default remains `1`, preserving compatibility for all existing corridor definitions.

Both demo corridors use `intrinsicLengthScale: 0.32`. Their slice W coordinates remain 140 (hypercube), 0 (Poincare), and 80 (main world). Demo traversal uses 12 units/s walking, 18 units/s sprinting, and 10 units/s for entities.

At the fixture terrain height of 137, measured coordinate/proper lengths are:

| Corridor | Ambient coordinate arc | Proper corridor length | Normal traversal estimate |
|---|---:|---:|---:|
| Hypercube ↔ Poincare | 142.30 | 45.53 | 3.79 s |
| Poincare ↔ main world | 157.77 | 50.49 | 4.21 s |

The estimates are proper length divided by the configured 12 units/s speed, before entry/exit handling. The destination slice coordinates remain distant; only proper travel distance through the anomalous region is compressed.

The centerlines were simplified to remove unnecessary bends while maintaining the same endpoints. Corridor chunks, directionality, adjacency, and portal endpoints are unchanged.

## Tesseract visibility changes

The previous renderer used a 1-pixel Babylon `LineSystem`. The 4D projection and per-frame update were already wired, but the wireframe could be visually lost at normal camera distance. The default follow camera also targeted the player and looked downward rather than framing the object ahead of the spawn point.

The renderer now:

- Builds all 32 edges into one persistent, updatable tube mesh.
- Adds 16 small emissive vertex markers, sharing one owned material.
- Updates edge positions, normals, bounds, and vertex markers in place each frame.
- Keeps the existing engine-independent R4 vertex generation, XW rotation, and bounded perspective projection.
- Applies the hypercube view layer to every owned mesh so the tesseract appears in both the chamber view and destination portal preview.
- Disposes all 17 meshes and the shared material symmetrically.

The tesseract is larger (half-extent 4.2), uses a higher XW angular speed (0.68 rad/s), and the follow camera focuses the hypercube centre while the player remains in the hypercube slice. Corridor render-anchor targets still take precedence during transit, and free-camera mode retains independent look control.

## Changed modules

- `src/world/fields/geometry/spatial-corridor.js` — intrinsic proper-length scale and validation.
- `src/world/fields/geometry/corridor-traversal-controller.js` — traversal distance respects the corridor metric.
- `src/demo/geometry-demo-topology.js` — straighter demo corridor centre-lines and compressed proper lengths.
- `src/demo/hypercube-4d-renderer.js` — single tube mesh plus 16 visible vertex markers.
- `src/demo/geometry-demo-world.js` — larger tesseract render configuration, full owned mesh list, faster demo speeds, and focus target.
- `src/demo/geometry-demo-camera-controller.js` — follow-focus target while in the hypercube slice.
- `src/main.js`, `src/scene/create-scene.js`, `index.html`, and the relevant versioned import chain — build/cache identifier updated.
- Tests and this documentation were updated accordingly.

## Verification

- Node tests: **122/122 passed**.
- JavaScript source syntax: **113/113 passed**.
- Test syntax: **16/16 passed**.
- Relative imports: **209/209 resolved**.
- Complete project and replacement patch ZIP integrity checks passed.

These are automated source/module tests. No live browser/WebGL visual pass was obtained for this package. In particular, the user's browser should confirm the tube thickness, camera framing, XW rotation, marker visibility, and portal preview.

## Style conformance

The tesseract projection remains in the domain/math layer; Babylon buffers/materials remain in the demo renderer. The renderer owns and disposes its meshes and material. The corridor metric is a small declarative property with a backwards-compatible default rather than special-case traversal logic in the demo. The foundational tube-buffer algorithm is intentionally explicit; orchestration methods remain short.
