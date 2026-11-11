# Geometry Phase 17A — Startup Hotfix

**Build:** `somnium-20261109-phase17a-startup-fix-1`  
**Date:** November 9, 2026  
**Baseline:** Phase 17A anomaly-fed spotlight prototype

## Symptom

The application failed during `GeometryDemoWorld.initializeOpticalSpotlight()` with:

```text
TypeError: can't access property "push", e is null
_hookArrayForIncludedOnly light.ts:846
set includedOnlyMeshes light.ts:249
```

## Root cause

Babylon.js 9.35.0 declares `Light.includedOnlyMeshes` as an `AbstractMesh[]`. Its setter stores the array and immediately hooks its `push()` and `splice()` methods. The Phase 17A spotlight setup assigned `null` while trying to mean “no inclusion restriction”. The setter therefore attempted to access `push` on `null` and aborted application initialization. The cleanup method repeated the same invalid assignment.

## Fix

Both assignments now use an empty array (`[]`). In Babylon's light filtering logic, the inclusion restriction is only active when the array has at least one item. An empty array therefore means that the light is not restricted by an explicit mesh list, while satisfying the setter's array contract. The existing `includeOnlyWithLayerMask` continues to isolate the receiver spotlight to the Main World layer.

## Regression coverage

`tests/optical-light-source.test.mjs` includes strict Babylon-style light stubs whose setters reject non-arrays and hook `push`/`splice`. Both `initializeOpticalSpotlight()` and cleanup are verified to leave a valid empty array. The existing receiving-light tests continue to verify that eligible caster lists are assigned as arrays and that original `receiveShadows` states are restored.

## Cache invalidation

The application build query was advanced to `somnium-20261109-phase17a-startup-fix-1` across the entry chain and versioned imports, so browsers do not reuse the previous Phase 17A modules. Hard-refresh after installing the hotfix.

## Scope

This hotfix changes no optical transport equations, anomaly topology, light direction mapping, shadow selection policy, or player movement. It corrects the Babylon API contract violation that prevented startup.


## Final automated verification

All 276 tests across the 30 test modules passed when executed in smaller groups and isolated transport cases. The spotlight-focused module passes 9/9. All 125 source JavaScript files and all 30 test modules pass syntax checks. The all-files test command intermittently exceeded this runner environment's timeout, so the verification record distinguishes grouped completion from a single uninterrupted test invocation.
