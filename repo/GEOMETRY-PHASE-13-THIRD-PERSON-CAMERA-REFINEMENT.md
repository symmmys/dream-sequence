# Geometry Phase 13 — Third-Person Camera Refinement

## Changes

### Main-world camera distance and zoom

- Standardized the shared follow camera on render-space distance. The character is projected first; the camera boom is then placed around the rendered character focus.
- This prevents the compactifying Poincare transform from collapsing the boom distance, both in the default third-person mode and after an anomaly handoff into Somnium Main World.
- The global third-person camera retains a 24-unit initial horizontal-distance preset, uses a 2.5-unit minimum, and now permits zooming out to 1,200 render units.
- The geometry-demo follow camera starts at an 18-unit horizontal-distance preset and can zoom out to 800 render units.
- Wheel zoom remains exponential and smooth. The Poincare render-chart boundary constraint is applied to the camera point so it cannot leave the open ball.

### Camera orbit and character framing

- Right mouse drag orbits the follow camera around the character.
- Pitch is continuous and unbounded; a transported up-vector maintains camera orientation as the orbit passes over the poles. There are no arbitrary pitch cutoffs.
- Left mouse drag still turns the character, preserving the existing movement convention.
- Follow focus is now derived from the character root and scaled model height. The geometry demo no longer overrides focus to aim at the tesseract.
- Corridor render anchors and their explicit destination targets still take precedence during legacy Bezier traversal.

### Browser reload shortcut

- Player and free-camera movement handlers ignore keydowns when Ctrl, Meta, or Alt is held.
- `R` remains available for vertical movement when pressed alone. Ctrl+R and Cmd+R now reach the browser normally.

## Controls

- **Scroll wheel:** zoom the third-person follow camera in/out.
- **Right mouse drag:** orbit the third-person camera, including through vertical orientations.
- **Left mouse drag:** turn the character, unchanged.
- **C:** toggle follow/free camera in the geometry demo.
- **Ctrl+R / Cmd+R:** browser reload, no longer captured by movement input.

## Validation

Run from the project root:

```bash
node --test tests/*.test.mjs
```

The Phase 13 regression suite verifies render-space boom distance, character-focused framing, full-pitch orbit, preserved render-anchor orientation, normal R movement, and unhandled Ctrl+R/Cmd+R shortcuts. Browser/WebGL interaction still requires a local manual check.
