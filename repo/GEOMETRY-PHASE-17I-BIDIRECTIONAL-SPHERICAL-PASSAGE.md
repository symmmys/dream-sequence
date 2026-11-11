# Somnium — Geometry Phase 17I: Bidirectional Spherical Anomaly Passage

**Status:** Implemented; automated regression suite passes. Live browser/WebGL inspection remains outstanding.  
**Build:** `somnium-20261109-phase17i-bidirectional-spherical-passage-1`  
**Baseline:** Phase 17H — Complete Destination Sphere and Inner-Mouth Growth

## 1. Objective

Replace the single remote-aperture transit presentation with a spatially inspectable 3D representation of the passage between the two endpoints of a 4D slice-transition anomaly.

During transit, the player sees a source-world entrance mouth behind them and a destination-world exit mouth ahead. The environment outside the mouths is black. The mouths are separated along a configurable display-space depth axis, and their apparent angular sizes change in opposite directions through perspective as the display camera advances along that axis.

This is a rendering representation of W traversal. It does not claim that the display-space axis is the physical W axis.

## 2. Dual spherical mouth renderers

`src/demo/anomaly-passage-presentation.js` introduces `AnomalyPassagePresentation`.

Each eligible spherical `open-4d-cylinder` anomaly pair receives two independent `PortalPreviewRenderer` instances:

- **Entrance:** uses the render list owned by the endpoint portal that previews the starting world.
- **Exit:** uses the render list owned by the endpoint portal that previews the target world.

The renderer instances use distinct names, render targets, cameras, materials, and complete closed sphere meshes. They reuse the existing endpoint render lists rather than creating duplicate worlds or taking ownership of streamed chunks. Each render-target camera is restricted to its corresponding endpoint world layer.

Entrance and exit identities are derived from the active transit's start and target slices. Reverse traversal therefore swaps endpoint render lists and the physical endpoint radii without relying on ambient-W sign or fixed portal names.

## 3. Display-space passage frame and perspective progression

At the beginning of transit, the presentation captures a stable 3D anchor and a normalized display-space axis. By default, follow mode derives the axis from the player's travel heading; free-camera transit captures its travel-aligned forward direction at entry. An explicit `mouthSeparationAxis` can override either source. Camera orbit after activation does not rotate the passage frame, so the player can inspect the two mouths from different angles without rotating the passage itself.

Let:

- `A` be the display-space anchor captured at passage activation.
- `u` be the normalized display-space separation axis.
- `D` be `mouthSeparation`.
- `I` be `cameraInset`.
- `t` be normalized traversal progress in `[0, 1]`.

For a fixed separation, the initial presentation positions and camera offset are:

```text
entryPosition = A - I * u
exitPosition  = A + (D - I) * u
cameraOffset  = t * (D - 2I) * u
```

The entrance begins one inset behind the initial display camera; the exit begins ahead. The display camera advances toward the exit and ends one inset before it. The separation axis is independent of canonical 4D coordinates and collision geometry.

`mouthSeparationCurve: [start, end]` optionally interpolates the center-to-center display separation with quintic smootherstep. `mouthSeparation` must be greater than twice `cameraInset` so the passage has positive display-camera travel distance.

The physical sphere radii remain derived from the anomaly's source and destination cylinder-mouth radii. The renderer does not need to fake the opposite size progression with a second, competing scale animation: perspective causes the entrance's apparent angular radius to shrink as it recedes and the exit's to grow as it approaches. Optional entrance/exit angular scale endpoints remain available as artistic multipliers, defaulting to `1` at both ends.

The actual game camera receives only a presentation-space position/target offset while the passage is active. In follow mode, the axis source is the player's heading rather than the camera's orbit direction, so orbiting before entry does not redefine the direction of travel. In free mode, the free camera is travel-aligned when it enters the anomaly; that initial forward vector establishes the stable frame. The traversal controller, player W coordinate, anomaly endpoints, and anomaly topology are unchanged.

## 4. Transitional environment

The two mouth surfaces use a dedicated render layer (`PASSAGE_RENDER_LAYER`). During passage rendering:

- The main scene clear color is black.
- The main camera sees the passage layer only.
- Ordinary endpoint portal surfaces and other portal pairs are hidden.
- The two mouth surfaces remain genuine 3D meshes and are not camera-facing billboards.
- The player can rotate and translate the camera to inspect the passage from oblique angles, including looking backward toward the entrance.

The original scene clear color and camera layer mask are restored when the presentation deactivates. Existing source and destination worlds, chunk managers, and render-list ownership remain alive; this is a visibility/presentation state, not world unloading.

## 5. Configuration

The demo's spherical open-4D-cylinder anomaly configurations expose:

```js
passagePresentation: {
    mouthSeparation: 80,
    cameraInset: 8
}
```

Optional properties accepted by the presentation include:

| Property | Meaning |
|---|---|
| `mouthSeparation` | Fixed display-space center-to-center mouth distance |
| `cameraInset` | Display-camera clearance from each endpoint mouth at the two traversal ends |
| `mouthSeparationAxis` | Explicit three-component display-space direction; `null` derives follow mode from player heading and free mode from its travel-aligned activation view |
| `mouthSeparationCurve` | Optional `[start, end]` separation values, each greater than `2 * cameraInset` |
| `entryAngularScaleStart`, `entryAngularScaleEnd` | Optional entrance sphere scale multipliers |
| `exitAngularScaleStart`, `exitAngularScaleEnd` | Optional exit sphere scale multipliers |
| `resolution` | Independent mouth render-target resolution: 256, 512, 1024, or 2048 |

These options affect presentation only. They are not values in the 4D anomaly metric or geometry contract.

## 6. Integration and lifecycle

`GeometryDemoWorld.updatePortalPreview()` identifies an active slice-transition transit and delegates it to the matching `AnomalyPassagePresentation`. The endpoint camera pose for the exit is generated by the existing `mapAnomalyCameraPose()` endpoint-frame mapping. Follow mode supplies the player-heading travel direction; free mode uses the travel-aligned camera direction at activation. The entrance render camera looks back along the inverse viewer direction into the source world; the exit render camera uses the transported destination-world pose. The sphere projection axes are oriented toward the player inside the passage, and neither sphere is billboarded.

The presentation reads current endpoint portal render lists, allowing the existing chunk streaming and world-retention systems to remain authoritative. `GeometryDemoWorld.update()` removes the prior frame's temporary display offset before the camera controller computes its next authoritative pose; this prevents the follow-camera smoothing step from absorbing or accumulating the presentation translation. Repeated presentation updates are also idempotent when no controller tick occurs. The dual-mouth renderers dispose their own cameras, materials, surfaces, and render targets; they do not dispose endpoint world meshes.

When transit ends, the presentation hides its two surfaces and restores the prior clear color and camera layer mask. The legacy single-portal preview remains the fallback for non-spherical or non-cylinder anomalies.

## 7. Build and compatibility

Build/cache identifier:

`somnium-20261109-phase17i-bidirectional-spherical-passage-1`

Phase 17I preserves:

- Canonical 4D anomaly endpoints and W-axis traversal.
- Tapered-cylinder radii and cross-section geometry.
- Existing endpoint-frame camera transport.
- Source/destination world and chunk lifetime ownership.
- Flat preview surfaces for anomalies that use `previewSurface: 'flat'`.
- The complete-sphere Phase 17H renderer and its legacy compatibility helpers.

The portal preview renderer accepts an optional `namePrefix` so multiple independent renderers can create non-colliding Babylon resources. Its portal material disables scene fog so the live destination image is not unintentionally fogged by the local scene.

## 8. Verification and limitations

Automated tests cover the display-space layout, configurable separation, monotonic perspective-driven apparent angular-size progression, isolated black presentation layer, endpoint world assignment, reverse traversal, and `GeometryDemoWorld` transit delegation. The full test and static-check results are recorded in `GEOMETRY-PHASE-17I-TEST-RESULTS.txt`.

No live browser/WebGL session was available during this implementation. The final visual appearance still needs manual validation in the running application, especially:

- Whether the entrance is easy to find by looking back while the exit remains ahead.
- Whether the third-person camera's captured display axis produces the intended composition for each anomaly.
- Texture projection and sphere depth ordering during off-axis camera orbit.
- The endpoint handoff at both ends of the passage.
- Performance impact of the two additional render targets per eligible anomaly.

The current implementation is the first complete dual-mouth rendering pass; these visual checks may motivate later artistic refinements without changing canonical 4D geometry.
