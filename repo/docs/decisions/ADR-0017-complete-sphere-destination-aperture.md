# ADR-0017: Complete-Sphere Destination Aperture and Inner-Mouth Growth

- **Status:** Accepted
- **Date:** November 9, 2026
- **Phase:** Geometry Phase 17H

## Context

Phase 17G's spherical-cap preview looked like a shallow curved disc rather than a complete spherical opening. The destination mouth also needed its own apparent-size progression: it should begin small at the far end of the anomaly tube and grow faster than the tube's outer cross-section as the observer traverses the corridor.

## Decisions

1. Spherical destination previews use a complete Babylon sphere mesh, not a deformed disc or spherical cap.
2. The live destination render-target remains front-orthographically projected onto the visible sphere surface. This preserves a camera-like image instead of interpreting the render target as an equirectangular environment map.
3. Flat circular/elliptical previews remain available as an explicit compatibility option.
4. The tapered 4D cylinder remains the authoritative outer boundary. The destination sphere has an independent growth curve with default start scale 0.08 and growth exponent 0.55.
5. Growth is calculated from traversal progress normalized from the viewer's entry mouth. Source and destination radii are swapped in reverse traversal; no W-sign heuristic controls apparent scale.
6. The sphere's physical radius is clamped to the current outer tube radius and meets that radius at the far endpoint. The returned Babylon mesh scale is relative to the entry mouth's authored radius and can be greater or less than one.
7. The legacy spherical-cap geometry helper remains exported for compatibility but is not used by the new spherical preview path.
8. This decision does not change physical anomaly geometry, endpoint coordinates, traversal permissions, or W-slice movement.

## Consequences

- The destination mouth has full three-dimensional depth and can be seen from either side.
- Its apparent/angular size can grow faster than the outer tube as the observer approaches the far mouth.
- The sphere's front-orthographic texture projection may distort at extreme off-axis viewpoints; live browser inspection will determine whether a later perspective-aware projection is warranted.
- The separate Main World endpoint / W-slice alignment issue remains outside this phase.
