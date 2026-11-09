# ADR-0006: Independent 4D Inspection Camera and Continuous Corridor Preview

- Status: Accepted
- Date: 2026-11-08

## Context

The geometry demo's third-person camera follows the player and does not provide an independent way to inspect the anomaly. During corridor traversal, the destination preview was positioned very close to the exit and the corridor shell was highly opaque, making the connected world difficult to see from inside the tunnel.

## Decision

Keep player-follow mode as the default and add a separate free inspection mode controlled by `C` or the demo HUD. The free camera owns its own position, orientation, active slice, input state, and optional corridor transit state. It does not mutate the player's position or traversal state. Character input is suppressed while free inspection is active and restored when follow mode resumes.

Outside a corridor, free-camera movement uses three render-space controls: forward/back, strafe, and vertical movement. During corridor inspection, the controls map to the transported four-dimensional frame: the corridor tangent plus its three perpendicular directions. The 4D position is retained in ambient coordinates; the Babylon camera receives the current 3D display mapping.

Keep a destination aperture ahead of the active viewer in both directions. The third-person camera aims at the aperture, and free-camera transit takes precedence over a stationary player transit when selecting preview progress. Use a lower forward-looking destination preview camera, enlarge the aperture to fill more of the corridor, and keep the corridor shell translucent (default opacity 0.22) with depth writing disabled. Keep the aperture a bounded distance ahead of the current viewer, with look-ahead scaled from measured corridor arc length and clamped to 8–22% of the route, so it remains visible early in both forward and reverse transit.

## Consequences

- Camera inspection no longer requires moving the player.
- A user can enter free inspection while the player is already in transit; the camera is initialized from the current transit state but remains independently controlled.
- A free camera can independently enter and exit the same corridor topology and change render slice without moving the player.
- `C` always toggles modes while the geometry demo is active; the button provides the same action.
- The destination window remains a bounded distance in front of the active viewer as the viewer advances or retreats, including independent free-camera transit.
- The camera's 4D state remains authoritative for navigation; its 3D display is necessarily a projection.
- A translucent corridor shell improves visibility but may require additional GPU-specific transparency tuning once browser rendering is profiled.

## Alternatives considered

### Reuse the player traversal controller for camera movement

Rejected because moving the camera would then move the character, preventing independent inspection and coupling view control to gameplay state.

### Move the portal to a fixed point just before the destination

Rejected because the aperture becomes too small in perspective and can fall behind the camera near the exit. The preview now stays a bounded distance ahead of the current progress.

### Remove the corridor shell

Rejected for this step because the tunnel is useful for understanding the anomaly's shape. A translucent shell preserves the visual cue while reducing occlusion.
