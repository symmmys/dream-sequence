# Geometry Phase 10 — Startup Hotfix 1

## Root cause

The Phase 10 demo-topology module imported `world-topology.js` without a cache-busting query string. That file changed between Phase 9 and Phase 10: Phase 9 directly called `createSpatialCorridor()` while Phase 10 dispatches through `createSpatialAnomaly()` so it can accept both bounded slice-transition anomalies and legacy Bezier corridors.

The browser therefore combined the new Phase 10 demo topology with a cached Phase 9 `WorldTopology` module. The Phase 9 module sent a slice-transition definition to the Bezier-only constructor, producing:

`TypeError: A cubic 4D corridor requires four centreline control points.`

## Fix

- Bumped the application build/cache identifier to `somnium-20261108-slice-transition-anomaly-hotfix-1`.
- Added the build query to the `world-topology.js` import in the demo topology module.
- Propagated the same cache key across the changed Phase 10 geometry modules and their import edges.
- Added an integration test that constructs the real demo topology and verifies that both registered anomalies remain `slice-transition` records.
- Added a regression assertion that the browser-facing WorldTopology import is versioned.

No anomaly geometry, player movement, slice coordinates, or chunk-address semantics were changed by this hotfix.
