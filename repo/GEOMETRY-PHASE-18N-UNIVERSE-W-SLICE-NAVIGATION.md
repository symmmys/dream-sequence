# Somnium Geometry — Phase 18N
## Universe-W Slice Navigation

### Purpose

Phase 18N repairs and expands the Plane Editor's W-slice inspector. In Phase 18M, the slider was effectively constrained by the selected Plane's W thickness and changed Plane-local preview state without reliably publishing the inspected ambient-W coordinate to the rest of the application. This phase separates the universe inspection coordinate from any individual Plane's center and thickness.

### Universe-wide W range

The W slider now uses `getUniverseWSliceBounds()` rather than the selected Plane's physical W interval. The range is computed from:

- the built-in ambient-W locations (Poincaré room W=0, 4D chamber W=75, and main world W=80);
- all persisted Plane definitions;
- runtime slice frame origins and W bounds;
- the current unsaved Plane draft, when valid.

The range expands automatically to include the entire ambient-W extent of a custom Plane and adds a small margin beyond the extreme locations. With only the built-in rooms, the current default range is -10 to 90. A custom Plane centered at W=140 with W thickness 20 expands the upper end to 160.

The slider advances in integer increments. The synchronized numeric input accepts decimal coordinates at 0.01 increments. The selected Plane's own W interval remains visible in the inspector's range description but no longer clamps the universe slider.

### What changing W does

When the user changes the slider or numeric field, `PlaneEditor.setWSlice()` updates the editor's ambient-W inspection coordinate. `publishWView()` then:

1. sends the absolute ambient-W coordinate to `PlaneObjectRenderer`;
2. computes a Plane-normal offset independently for each Plane's procedural 4D hypercube cross-section;
3. updates object visibility so every saved Plane whose 4D container intersects the selected ambient-W slice can be inspected together;
4. refreshes the optional wireframe guides for other Planes intersecting that slice;
5. immediately publishes the W coordinate to the Geometry Demo W HUD, even while the demo's regular update loop is inactive in the editor.

A Plane is considered to intersect the selected W slice when the coordinate lies within its projected ambient-W bounds. The bounds include the W components of all three Plane frame axes and its normal, so the inclusion calculation also handles oblique 4D frames.

The HUD coordinate is an editor inspection coordinate while the Plane Editor is active. It does not teleport the gameplay character or alter a Plane's saved center/thickness. The editor camera continues to use the selected Plane's rendering transform, while Plane-owned meshes are projected through their own Plane transforms.

### Creating Planes at the inspected coordinate

A new Plane draft now inherits the current ambient-W inspection coordinate as its W center. For example, moving the slider to W=75 and then choosing Create New Plane starts the draft at W=75. The user can still change the decimal W center in the Plane form before saving.

Selecting an existing Plane initializes the inspector at that Plane's W center. After that, the slider is free to inspect the entire universe range, not just the selected Plane's thickness.

### Visibility and guides

During Plane Editor inspection, authored object meshes from all registered Plane definitions are visible only when:

- the object itself is authored as visible; and
- the owning Plane's 4D container intersects the current ambient-W coordinate.

The original dedicated demo tesseract remains rendered by its existing specialized renderer; separately authored hypercubes use the per-Plane W offset. The optional **Show other Planes intersecting this W slice** guides draw the wireframe container extents of intersecting Plane definitions. The guides are presentation aids; they do not change the saved Plane boundaries.

### Compatibility

- No IndexedDB schema changes.
- No saved Plane or anomaly records are rewritten by inspecting W.
- No browser storage clearing is required.
- Existing Phase 18L/18M transform, editor, traversal, color, background, and hotkey behavior is retained.
- The build/cache identifier is `somnium-20261110-phase18n-universe-w-slice-navigation-1`.

### Verification

Automated tests: **427 passed, 0 failed, 0 skipped**.

Static syntax checks: 137 source JavaScript files and 47 test MJS files passed `node --check`.

Relative import audit: 184 source/test files inspected; 399 relative imports checked; 0 missing targets.

No live browser/WebGL session was available during packaging. The user should verify the W slider against built-in slices W=0, W=75, and W=80, then test a custom Plane outside the initial range (for example W=140) and create a new Plane at the selected decimal W coordinate.
