SOMNIUM GEOMETRY PHASE 2 — REPLACEMENT FILES

This archive contains only files changed or added by the Phase 2 integration, with paths relative to the project root.

1. Back up your current Somnium project.
2. Extract this archive into the directory containing index.html, preserving the folder structure and allowing the files to overwrite their matching counterparts.
3. Confirm assets/geometry-demo-topography.png exists.
4. Start the HTTP server from the directory containing index.html:

   python3 -m http.server 8081 --bind 127.0.0.1

5. Open http://localhost:8081 and choose GEOMETRY DEMO.

Controls: WASD move, Shift run, left-mouse drag turn, G toggle the metric grid, Esc pause.

The 4D corridor is represented by a render-only 3D proxy in this phase. The portal renders a remote slice but does not yet transfer the player. GPU projection and live browser/GPU acceptance remain outstanding; see GEOMETRY-PHASE-2-IMPLEMENTATION.md.
