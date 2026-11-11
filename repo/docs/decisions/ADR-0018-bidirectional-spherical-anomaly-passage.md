# ADR-0018: Bidirectional Spherical Anomaly Passage Presentation

- **Status:** Accepted
- **Phase:** Geometry Phase 17I
- **Date:** November 9, 2026

## Context

Phase 17H represented only the remote destination mouth. The desired 4D traversal metaphor has two endpoints visible from within a dark transitional region: the source entrance behind the player and the destination exit ahead. The two endpoints are physically separated along W, which cannot be directly displayed as a fourth spatial axis in the 3D camera.

## Decision

Represent the two endpoints as independent complete spherical renderers separated in a configurable 3D presentation frame. In follow mode, derive the default display axis from the player's travel heading; in free-camera mode, capture the travel-aligned camera forward direction at anomaly entry. Allow an explicit axis override. Keep the entrance one camera inset behind the initial display camera and the exit ahead. Advance the display camera along the axis as normalized W traversal progress changes. Perspective produces the opposing apparent angular-size progression without introducing a second competing sphere-growth animation. The captured axis remains stable when the player later orbits the camera.

Render the source world into the entrance sphere and the destination world into the exit sphere. Isolate both surfaces on a dedicated render layer and use a black scene clear color while the passage is active. Do not billboard the surfaces or change canonical 4D coordinates, collision, topology, or world/chunk ownership.

## Consequences

- Camera orbit remains available for inspecting both mouths from different directions.
- Actual perspective contributes to the apparent entrance shrinkage and exit growth.
- Reverse traversal swaps endpoint identities and radii based on active traversal orientation.
- Two additional render targets are created per eligible anomaly presentation.
- Live visual validation is still required for texture projection, composition, performance, and endpoint handoff.
