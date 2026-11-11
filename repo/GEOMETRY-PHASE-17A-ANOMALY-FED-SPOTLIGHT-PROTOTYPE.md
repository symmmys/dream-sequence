# Geometry Phase 17A — Movable Anomaly-Fed Spotlight Prototype

**Status:** Implemented; automated verification recorded in `GEOMETRY-PHASE-17A-TEST-RESULTS.txt`  
**Date:** November 9, 2026  
**Baseline:** Phase 16D view-dependent anomaly aperture rendering

## 1. Objective

Demonstrate a movable spotlight in the four-dimensional Hypercube chamber whose light is optically transported through the explicitly configured direct Hypercube-to-Main-World anomaly and represented as a receiving-side spotlight in the Main World. The receiving spotlight uses a bounded Babylon shadow map.

This is intentionally an end-to-end vertical slice, not a complete multi-source lighting engine.

## 2. Implementation

### Engine-independent source contract

`src/world/fields/geometry/optical-light-source.js` defines a validated spotlight source with:

- stable ID and source `sliceId`;
- slice-local XYZ position and normalized XYZ direction;
- RGB colour, non-negative intensity, positive range, cone angle, and exponent;
- enabled and shadow-casting flags.

The module also provides immutable movement, yaw/pitch rotation, aiming, and an adapter that traces the deterministic centre ray through an existing anomaly tracer. The source contract contains no Babylon classes.

### Optical transport

The demo's tracer facade permits only the direct Hypercube-to-Main-World anomaly. The source direction is lifted into ambient R4 using the source slice frame and the existing Phase 16C anomaly optical tracer handles slice propagation, aperture entry, 4D bridge propagation, optical permissions, and aperture exit.

For a receiving light, the adapter opts into `stopAfterAnomalyExit`. This returns the outgoing state at the destination aperture without tracing an unnecessary long path into the destination world. The option is disabled by default for existing tracer consumers, so existing full-path behavior remains unchanged.

The destination outgoing canonical covector is converted to a slice velocity with the destination tangent cometric. A virtual source position is extrapolated backward from the aperture exit along that velocity. This is a practical virtual-emitter approximation for a Babylon spotlight; it is not a claim that a point source physically exists at that extrapolated position.

### Babylon presentation

`GeometryDemoWorld` owns the demo integration:

- A source-side Babylon spotlight is limited to the Hypercube layer.
- An emissive sphere marks the source and a line indicates its aim direction.
- A receiver-side Babylon spotlight is limited to the Main World layer.
- Source and receiving positions/directions are transformed through their respective `SpatialTransform` objects. Direction is derived by transforming a nearby point, rather than copying physical XYZ components into render space.
- A 1024-pixel `ShadowGenerator` uses percentage-closer filtering when the runtime supports it.
- Up to 18 nearby eligible Main World scene meshes are selected as light receivers and shadow casters. The selection is refreshed periodically as streamed geometry changes. Portal, preview, sky, water, cloud, debug, and geometry-demo presentation meshes are excluded.
- Original `receiveShadows` flags are restored when a mesh leaves the bounded set or the demo is disposed.
- If a shadow generator cannot be created, the destination spotlight still receives its eligible mesh list and can illuminate without shadows.

## 3. Controls

While the Geometry Demo is active, press `L` to toggle spotlight editing. In edit mode:

| Key | Action |
|---|---|
| `W` / `S` or Up / Down | Move along local Z |
| `A` / `D` or Left / Right | Move along local X |
| `R` / `F` | Move along local Y |
| `U` / `O` | Rotate yaw |
| `I` / `K` | Rotate pitch |
| `Shift` | Increase translation/rotation step |
| `Escape` | Exit edit mode |

The editor captures these keys while active so they do not also move the player or camera. Movement is XYZ within the Hypercube source slice. Arbitrary W-axis movement is not part of this prototype.

## 4. Diagnostics

`GeometryDemoWorld.getDiagnostics()` now includes `opticalSpotlight`:

- source ID, position, direction, colour, and optical parameters;
- editor state and control summary;
- successful/failed transport reason;
- anomaly ID, remaining energy, outgoing direction, virtual source position, transition count, and path length;
- receiver state and shadow-generator/caster counts.

## 5. Scope boundaries and known limitations

- Only one spotlight and its deterministic central ray are implemented. This validates the optical route but does not reconstruct the complete finite-width beam.
- The source-side Babylon spotlight is a conventional local light for the Hypercube layer. The receiving-side light is activated only after the optical centre ray successfully exits the authorized anomaly.
- The destination spotlight is a virtual-source approximation. It is useful for visible direct lighting, but it does not yet reproduce all possible curved-ray wavefronts or multiple arrivals.
- Shadow maps are generated from the virtual receiving-side spotlight and a bounded mesh set. They are not yet true per-surface optical visibility rays propagated backward through the 4D anomaly.
- Dynamic objects not included in the bounded candidate set do not participate in this prototype's shadow map.
- Point lights, multiple spotlights, soft/area-light sampling, optical reflection/refraction branching, and arbitrary W-axis source movement are deferred.
- Existing celestial/ambient lighting and atmospheric behaviour are unchanged. Anomaly-driven sky glow remains a separate future artistic feature.
- Automated tests validate source state, movement/aiming, optical crossing, no-transmission behaviour, live Poincare transform compatibility, and the early-exit tracer contract. They do not replace manual browser/WebGL visual inspection of the light cone, receiver illumination, and shadow quality.

## 6. Validation

Run:

```bash
node --test tests/*.test.mjs
```

See `GEOMETRY-PHASE-17A-TEST-RESULTS.txt` for the exact result and static checks.

Start from the directory containing `index.html`:

```bash
python3 -m http.server 8081
```

Open `http://127.0.0.1:8081/`, enter the Geometry Demo, and test the spotlight controls from the Hypercube chamber. Press `L` to edit. Point the spotlight toward the direct Main World anomaly; then traverse or view the Main World and verify that the received light follows the outgoing ray and that nearby geometry casts shadows.

## 7. Future implementation planning convention

All future substantial implementation plans must follow `docs/IMPLEMENTATION-PLANNING.md`. Plans should use a lightweight work breakdown, optimistic/most-likely/pessimistic three-point estimates, weighted PERT calculations, historical analogues where timing evidence is meaningful, explicit assumptions/risks, a bounded timebox vertical slice, and observable acceptance criteria. Artifact-to-artifact elapsed time must not be described as active engineering time without supporting measurements.
