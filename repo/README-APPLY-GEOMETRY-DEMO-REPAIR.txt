SOMNIUM - GEOMETRY DEMO REPAIR

This project contains the geometry demo runtime repair.

See GEOMETRY-DEMO-REPAIR.md for the cause of both reported errors and the
changes made. See INSTALLATION-GEOMETRY-DEMO-REPAIR.txt for local installation.

The primary topographic PNG has been recovered and re-encoded as a valid
3000 x 6203 RGBA image. The third-person camera now clamps its derived camera
boom and target positions inside the active projection bounds. The demo room
is an open 48 x 60 unit chamber with spaced shapes and visible labels.

Verification: 48/48 Node tests, 104/104 source syntax checks, 6/6 test syntax
checks, and 154 relative-import checks passed. PNG decoding was verified.
A headless Chromium smoke test timed out before returning page output, so
interactive browser/WebGL rendering is not claimed as verified.
