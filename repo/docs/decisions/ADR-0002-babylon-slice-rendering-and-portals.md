# ADR-0002: Babylon Slice Rendering and Portal Previews

- Status: Accepted for Phase 2 integration
- Date: 2026-11-07
- Related: ADR-0001 (Four-dimensional world slices)

## Context

Phase 1 introduced engine-independent `WorldSlice`, `SpatialCorridor`, and `WorldTopology` records. Babylon's existing scene path uses a single geometry transform, and its existing shader manager replaces source materials with a simplified shader. Applying it to arbitrary project materials would discard textures and vertex colours.

## Decisions

1. Babylon runtime objects are registered per `WorldSlice.id`; mesh metadata identifies the owning slice.
2. The CPU `GeometryRenderer` remains the correctness fallback. It preserves the source material and existing vertex colours, with a local bounded conformal expansion around a stable mesh anchor.
3. The GPU shader manager is not applied indiscriminately. A colour/texture-preserving compatible-material route is required before it becomes active.
4. A corridor's authoritative data remains four-dimensional. Its Babylon tube is a lossy visual proxy generated from sampled centreline and cross-section frames.
5. A portal uses a dedicated preview camera, layer mask, render target, and explicit render list. The destination does not enter the active scene simulation merely because it is visible.
6. Portal preview work is enabled only while the Geometry Demo is active; it refreshes every other frame at a 512×512 target resolution.
7. Topographic sampling and world creation remain engine-independent; browser image decoding is an infrastructure adapter.

## Consequences

- Different slices can use different geometry profiles in one Babylon scene.
- Material fidelity is preserved on the CPU path, at the expense of CPU vertex transformation at mesh creation/rebuild time.
- The current preview is render-only; it does not implement player traversal or destination chunk streaming.
- The source and destination worlds remain topologically independent until explicitly connected by a corridor.
- GPU integration, chunk scheduling, and traversal remain separate follow-on work packages.
