# Somnium Geometry — Phase 18G1: Plane Data Foundation

## Scope

Phase 18G1 establishes the versioned, serializable Plane authoring model and upgrades existing Plane records without changing stable Plane IDs, anomaly IDs, or the separate `somnium-planes` database architecture. It does not yet add Plane Editor UI or change runtime scene construction; those are later 18G phases.

## Decisions locked for the Plane Editor

- Plane boundary: optional, initially a box.
- Container: a true four-dimensional hyperrectangle with independently editable W/X/Y/Z dimensions.
- W: the Plane's ambient W center is stored explicitly as `plane.w`; the existing `frame` continues to carry the complete ambient 4D origin and orientation. For records with a frame, `frame.origin.w` is authoritative during normalization.
- Initial migration target: Poincaré Room primitives and labels, plus a procedural 4D hypercube object definition. Main World procedural terrain/ecology remains under its existing systems for now.
- Editing: reusable translation, rotation, and scaling gizmos plus numeric controls.
- Moving a Plane: preserve local object positions and move connected anomaly endpoints with the Plane's frame.

## Plane schema v2

`createPlaneDefinition()` upgrades legacy v1 records and emits:

- Stable `id`, `displayName`, `geometry`, `seed`, and existing `frame`.
- Explicit `w` placement coordinate.
- `container.type` (initially `box`).
- `container.dimensions` with positive finite `w`, `x`, `y`, and `z` values.
- Optional `container.boundary` visibility, color, and opacity.
- `container.backgroundColor` and `backgroundOpacity`.
- Serializable `objects` array.
- Existing `source` and `metadata` fields.

Container W thickness is centered on the Plane's ambient W placement. XYZ container dimensions and object transforms are expressed in Plane-local coordinates. This deliberately separates the Plane's mathematical coordinate frame from Babylon rendering transforms.

## Plane object schema

`createPlaneObjectDefinition()` currently accepts `box`, `sphere`, `cylinder`, `torus`, `label`, and `hypercube4d` definitions. Each record has a stable object ID, type, name, local XYZ position, XYZ rotation, XYZ dimensions, visibility, material data, and type-specific parameters. The `hypercube4d` type remains procedural and serializable; it is not flattened into a static 3D mesh.

## Persistence migration

The `somnium-planes` IndexedDB database is now version 2. Existing object stores and keys are retained. During the v1→v2 upgrade, existing Plane records are cursor-migrated in place through the schema normalizer. Anomaly records and bootstrap markers are not rewritten. `savePlane`, `listPlanes`, and `getPlane` normalize through the v2 schema, providing compatibility if a legacy record is encountered.

The migration is additive: default container dimensions are W=10, X=100, Y=60, Z=100; the boundary defaults to hidden; background defaults to `#101827`; and the initial object collection is empty. No existing Plane or anomaly identity is changed.

## Deferred to subsequent phases

- 18G2: Plane list/editor UI, create/edit Plane workflow, box dimensions, W placement, boundary and background controls.
- 18G3: reusable selection, numeric transform inspector, and translate/rotate/scale gizmos.
- 18G4: migrate Poincaré room primitives/labels and procedural tesseract into Plane object data and render from records.
- 18G5: anomaly endpoint frame propagation, integration, regression tests, and final packaging/hardening.

## Validation

The Phase 18G1 suite validates v1→v2 normalization, explicit W placement, 4D box dimensions, optional boundaries, colors, object transform records, procedural hypercube parameters, and invalid object/dimension rejection. The full repository test suite is run separately before packaging.
