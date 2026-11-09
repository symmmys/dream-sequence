import test from 'node:test';
import assert from 'node:assert/strict';

import { OpticalSceneRegistry } from '../src/world/fields/geometry/optical-scene-registry.js';
import { BabylonGeometryAdapter } from '../src/world/fields/geometry/babylon-geometry-adapter.js';
import { createOpticalMetricField } from '../src/world/fields/geometry/optical-metric.js';
import { createOpticalRayState, normalizeOpticalMomentum, traceOpticalRay } from '../src/world/fields/geometry/optical-ray-integrator.js';
import { traceOpticalRayInSlice, createSliceOpticalField } from '../src/world/fields/geometry/optical-slice-tracer.js';
import { PoincareMetric } from '../src/world/fields/geometry/poincare-metric.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { ambientToSlice, createCanonicalSliceFrame, createSliceFrame, sliceToAmbient } from '../src/world/fields/geometry/spatial-4d.js';

function close(actual, expected, tolerance = 1e-6, label = '') {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${label} expected ${expected}, received ${actual}`);
}

function planeAtX(x, extent = 5) {
    return {
        positions: [x, -extent, -extent, x, extent, -extent, x, 0, extent],
        indices: [0, 1, 2]
    };
}

function createRegistry() {
    return new OpticalSceneRegistry({ leafSize: 2 });
}

function registerPlane(registry, options = {}) {
    const plane = planeAtX(options.x ?? 1, options.extent ?? 5);
    return registry.registerTriangleMesh({
        id: options.id ?? 'wall',
        sliceId: options.sliceId ?? 'slice-a',
        chunkAddress: options.chunkAddress,
        positions: plane.positions,
        indices: plane.indices,
        material: { id: options.materialId ?? 'wall-material' },
        revision: options.revision ?? 1
    });
}

function ambientRay(x = 0, y = 0, z = 0, w = 0, px = 1) {
    return createOpticalRayState({
        position: { x, y, z, w },
        momentum: { x: px, y: 0, z: 0, w: 0 }
    });
}

test('triangle BVH returns the nearest authoritative slice-local surface hit', () => {
    const registry = createRegistry();
    registerPlane(registry, { id: 'far-wall', x: 2 });
    registerPlane(registry, { id: 'near-wall', x: 1 });
    const hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
    assert.equal(hit.objectId, 'near-wall');
    assert.equal(hit.primitiveType, 'triangle');
    assert.equal(hit.primitiveIndex, 0);
    close(hit.parameter, 1 / 3);
    close(hit.point.x, 1);
    close(hit.point.y, 0);
    close(hit.point.z, 0);
    close(Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z), 1);
    assert.equal(hit.material.id, 'wall-material');
    registry.dispose();
});

test('triangle BVH rejects other slices and supports explicit chunk-address filtering', () => {
    const registry = createRegistry();
    const addressA = { sliceId: 'slice-a', chunkX: 0, chunkZ: 0 };
    const addressB = { sliceId: 'slice-a', chunkX: 1, chunkZ: 0 };
    registerPlane(registry, { sliceId: 'slice-c', id: 'other-slice' });
    registerPlane(registry, { id: 'chunk-zero', chunkAddress: addressA });
    assert.equal(registry.intersectSegment('slice-b', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }), null);
    assert.equal(registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, {
        allowedChunkAddresses: [addressB]
    }), null);
    const hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, {
        allowedChunkAddresses: [addressA]
    });
    assert.equal(hit.chunkAddress.chunkX, 0);
    registry.dispose();
});

test('triangle registrations copy source buffers and rebuild deterministically on revision updates', () => {
    const registry = createRegistry();
    const positions = planeAtX(1).positions;
    const indices = [0, 1, 2];
    registry.registerTriangleMesh({ id: 'mutable', sliceId: 'slice-a', positions, indices, revision: 1 });
    positions.fill(1000);
    let hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    close(hit.point.x, 1);
    registry.registerTriangleMesh({ id: 'mutable', sliceId: 'slice-a', positions: planeAtX(1.5).positions, indices, revision: 2 });
    hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    close(hit.point.x, 1.5);
    assert.equal(hit.geometryRevision, 2);
    registry.dispose();
});

test('Babylon geometry adapter registers pre-projection vertices with slice and chunk identity', () => {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = { VertexBuffer: { PositionKind: 'position' } };
    const registry = createRegistry();
    const adapter = new BabylonGeometryAdapter({}, { opticalScene: registry });
    const sourcePositions = new Float32Array(planeAtX(1).positions);
    const mesh = {
        uniqueId: 901,
        name: 'authoritative-wall',
        metadata: { sliceId: 'slice-a', chunkX: 2, chunkZ: -1 },
        material: { id: 'stone' },
        isPickable: true,
        getVerticesData(kind) { return kind === 'position' ? sourcePositions : null; },
        getIndices() { return [0, 1, 2]; },
        isEnabled() { return true; }
    };
    try {
        assert.equal(adapter.registerOpticalMesh(mesh, 'slice-a'), true);
        sourcePositions.fill(999);
        const hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, {
            allowedChunkAddresses: [{ sliceId: 'slice-a', chunkX: 2, chunkZ: -1 }]
        });
        assert.equal(hit.objectId, 'babylon-mesh:901');
        assert.equal(hit.chunkAddress.chunkX, 2);
        close(hit.point.x, 1);
        assert.equal(adapter.unregisterOpticalMesh(mesh), true);
        assert.equal(registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }), null);
    } finally {
        adapter.dispose();
        registry.dispose();
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('Babylon geometry adapter excludes debug and render-only surfaces from optical intersections', () => {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = { VertexBuffer: { PositionKind: 'position' } };
    const registry = createRegistry();
    const adapter = new BabylonGeometryAdapter({}, { opticalScene: registry });
    const mesh = {
        uniqueId: 902,
        name: 'debug-grid',
        metadata: { sliceId: 'slice-a', geometryDebugGrid: true },
        isPickable: false,
        getVerticesData() { return new Float32Array(planeAtX(1).positions); },
        getIndices() { return [0, 1, 2]; }
    };
    try {
        assert.equal(adapter.registerOpticalMesh(mesh, 'slice-a'), false);
        assert.equal(registry.getStats().registeredTriangleMeshes, 0);
    } finally {
        adapter.dispose();
        registry.dispose();
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('disabled optical materials do not occlude rays', () => {
    const registry = createRegistry();
    registry.registerTriangleMesh({
        id: 'invisible', sliceId: 'slice-a', ...planeAtX(1),
        material: { id: 'disabled-surface', enabled: false }
    });
    assert.equal(registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }), null);
    registry.dispose();
});

test('triangle registry validates topology, finite coordinates, and revisions', () => {
    const registry = createRegistry();
    assert.throws(() => registry.registerTriangleMesh({ id: 'bad', sliceId: 's', positions: [0, 0], indices: [0, 1, 2] }), /complete XYZ/);
    assert.throws(() => registry.registerTriangleMesh({ id: 'bad', sliceId: 's', positions: [0, 0, 0, NaN, 0, 0, 0, 1, 0], indices: [0, 1, 2] }), /finite/);
    assert.throws(() => registry.registerTriangleMesh({ id: 'bad', sliceId: 's', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3] }), /outside the vertex buffer/);
    assert.throws(() => registry.registerTriangleMesh({ id: 'bad', sliceId: 's', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], revision: 0 }), /positive safe integer/);
    registry.dispose();
});

test('analytic heightfield intersection finds a flat-terrain crossing and surface normal', () => {
    const registry = createRegistry();
    const terrain = {
        width: 11, height: 11,
        sampleHeight() { return 0; }
    };
    registry.registerHeightfield({
        id: 'flat-terrain', sliceId: 'main', terrain,
        bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
        chunkAddress: { sliceId: 'main', chunkX: 0, chunkZ: 0 }
    });
    const hit = registry.intersectSegment('main', { x: 0, y: 3, z: 0 }, { x: 0, y: -3, z: 0 });
    assert.equal(hit.primitiveType, 'heightfield');
    close(hit.parameter, 0.5, 1e-8);
    close(hit.point.y, 0);
    close(hit.normal.x, 0);
    close(hit.normal.y, 1);
    close(hit.normal.z, 0);
    registry.dispose();
});


test('heightfield intersection sampling follows the full source raster resolution, not chunk-local dimensions', () => {
    const registry = createRegistry();
    const terrain = {
        worldSize: 1000,
        width: 101,
        height: 101,
        min: { x: -500, z: -500 },
        max: { x: 500, z: 500 },
        sampleHeight(x) { return 0.1 * x; }
    };
    registry.registerHeightfield({
        id: 'coarse-global-raster',
        sliceId: 'main',
        terrain,
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        chunkAddress: { sliceId: 'main', chunkX: 0, chunkZ: 0 }
    });
    const hit = registry.intersectSegment('main', { x: 0, y: 2, z: 5 }, { x: 10, y: -1, z: 5 });
    assert.equal(hit.primitiveType, 'heightfield');
    close(hit.point.x, 5, 1e-7);
    close(hit.point.y, 0.5, 1e-7);
    assert.ok(hit.normal.x < 0);
    assert.ok(registry.getStats().heightfieldSamples < 50,
        'small chunk must not pretend the full heightmap has chunk-local pixel spacing');
    registry.dispose();
});

test('non-square heightmaps use independent X and Z raster spacing', () => {
    const registry = createRegistry();
    const terrain = {
        worldSize: 800,
        width: 101,
        height: 201,
        min: { x: -400, z: -200 },
        max: { x: 400, z: 200 },
        sampleHeight() { return 0; }
    };
    registry.registerHeightfield({
        id: 'rectangular-global-raster',
        sliceId: 'main',
        terrain,
        bounds: { minX: -1, maxX: 1, minZ: -20, maxZ: 20 }
    });
    const hit = registry.intersectSegment('main',
        { x: 0, y: 5, z: -20 }, { x: 0, y: -5, z: 20 });
    assert.equal(hit.primitiveType, 'heightfield');
    close(hit.point.z, 0, 1e-8);
    assert.ok(registry.getStats().heightfieldSamples >= 20,
        'the finer Z raster spacing must determine sampling density along a Z-directed ray');
    registry.dispose();
});

test('analytic heightfield intersection respects chunk bounds and does not leak across chunks', () => {
    const registry = createRegistry();
    const terrain = { width: 101, height: 101, sampleHeight() { return 0; } };
    registry.registerHeightfield({
        id: 'terrain-chunk', sliceId: 'main', terrain,
        bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
        chunkAddress: { sliceId: 'main', chunkX: 0, chunkZ: 0 }
    });
    assert.equal(registry.intersectSegment('main', { x: 12, y: 2, z: 5 }, { x: 12, y: -2, z: 5 }), null);
    const hit = registry.intersectSegment('main', { x: 5, y: 2, z: 5 }, { x: 5, y: -2, z: 5 }, {
        allowedChunkAddresses: [{ sliceId: 'main', chunkX: 1, chunkZ: 0 }]
    });
    assert.equal(hit, null);
    registry.dispose();
});

test('analytic heightfield normals follow a sloped surface', () => {
    const registry = createRegistry();
    const terrain = {
        width: 101, height: 101,
        sampleHeight(x) { return 0.5 * x; }
    };
    registry.registerHeightfield({
        id: 'slope', sliceId: 'main', terrain,
        bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }
    });
    const hit = registry.intersectSegment('main', { x: 0, y: 4, z: 0 }, { x: 0, y: -4, z: 0 });
    close(hit.point.y, 0, 1e-8);
    close(hit.normal.x, -Math.sqrt(0.2), 1e-4);
    close(hit.normal.y, Math.sqrt(0.8), 1e-4);
    registry.dispose();
});

test('unregistered geometry cannot create a hit and disposal clears the optical scene', () => {
    const registry = createRegistry();
    assert.equal(registry.intersectSegment('empty', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), null);
    registry.registerTriangleMesh({ id: 'wall', sliceId: 's', ...planeAtX(0.5) });
    assert.equal(registry.getStats().registeredTriangleMeshes, 1);
    registry.dispose();
    assert.throws(() => registry.getStats(), /disposed/);
});

test('slice-native Euclidean tracing stops at the first registered triangle', () => {
    const frame = createCanonicalSliceFrame(7);
    const field = createOpticalMetricField({ sliceFrame: frame, wCoupling: 0 });
    const registry = createRegistry();
    registerPlane(registry, { sliceId: 'euclidean-slice', x: 1 });
    const ray = ambientRay(0, 0, 0, 7);
    const result = traceOpticalRayInSlice(field, registry, 'euclidean-slice', ray, {
        maxPathLength: 2,
        maxStepSize: 0.1,
        initialStepSize: 0.05
    });
    assert.equal(result.status, 'surface-hit');
    assert.equal(result.event.objectId, 'wall');
    close(result.finalState.position.x, 1, 1e-7);
    close(result.finalState.position.w, 7, 1e-10);
    close(result.finalState.opticalPathLength, 1, 2e-3);
    close(result.event.ambientPosition.x, 1, 1e-7);
    registry.dispose();
});


test('slice-native Euclidean tracing supports arbitrarily oriented ambient 4D slice frames', () => {
    const angle = 0.37;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const frame = createSliceFrame({
        origin: { x: 10, y: 0, z: 0, w: 2 },
        axes: [
            { x: cosine, y: 0, z: 0, w: sine },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ],
        normal: { x: -sine, y: 0, z: 0, w: cosine }
    });
    const slice = { id: 'rotated-slice', frame };
    const transform = new SpatialTransform({ geometry: 'euclidean' });
    const field = createSliceOpticalField(slice, transform);
    const position = sliceToAmbient(frame, { x: 0, y: 0, z: 0 });
    const momentum = normalizeOpticalMomentum(field, position, frame.axes[0]);
    const registry = createRegistry();
    registerPlane(registry, { id: 'rotated-slice-wall', sliceId: slice.id, x: 1 });
    const result = traceOpticalRayInSlice(field, registry, slice.id,
        createOpticalRayState({ position, momentum }), { maxPathLength: 2, maxStepSize: 0.05 });
    assert.equal(result.status, 'surface-hit');
    const localHit = ambientToSlice(frame, result.finalState.position);
    close(localHit.position.x, 1, 1e-7);
    close(localHit.normalOffset, 0, 1e-8);
    close(result.finalState.position.w, 2 + sine, 1e-7);
    registry.dispose();
});

test('slice-native tracer rejects momentum with a component normal to the slice', () => {
    const frame = createCanonicalSliceFrame(4);
    const field = createOpticalMetricField({ sliceFrame: frame, wCoupling: 0 });
    const registry = createRegistry();
    assert.throws(() => traceOpticalRayInSlice(field, registry, 'slice', createOpticalRayState({
        position: { x: 0, y: 0, z: 0, w: 4 },
        momentum: { x: 1, y: 0, z: 0, w: 0.25 }
    }), { maxPathLength: 1 }), /momentum must be tangent/);
    registry.dispose();
});

test('slice-native tracing rejects a ray whose initial position is off the slice', () => {
    const frame = createCanonicalSliceFrame(0);
    const field = createOpticalMetricField({ sliceFrame: frame, wCoupling: 0 });
    const registry = createRegistry();
    assert.throws(() => traceOpticalRayInSlice(field, registry, 'slice-a', ambientRay(0, 0, 0, 1), {
        maxPathLength: 1
    }), /must begin on its registered 3D slice/);
    registry.dispose();
});

test('slice-native ray hits only geometry registered to its own slice', () => {
    const frame = createCanonicalSliceFrame(0);
    const field = createOpticalMetricField({ sliceFrame: frame, wCoupling: 0 });
    const registry = createRegistry();
    registerPlane(registry, { sliceId: 'unrelated-slice' });
    const result = traceOpticalRayInSlice(field, registry, 'active-slice', ambientRay(), {
        maxPathLength: 1.5, maxStepSize: 0.1
    });
    assert.equal(result.status, 'max-path-length');
    assert.equal(result.event, null);
    close(result.finalState.position.x, 1.5, 1e-6);
    registry.dispose();
});

test('Poincare slice tracer intersects authoritative ball-coordinate geometry along a geodesic', () => {
    const frame = createCanonicalSliceFrame(0);
    const poincare = new PoincareMetric(-1);
    const field = createOpticalMetricField({
        sliceFrame: frame,
        sliceMetricAt: (position) => poincare.metricAt(position),
        wCoupling: 0,
        gradientStep: 2e-5
    });
    const registry = createRegistry();
    const plane = planeAtX(0.3, 0.8);
    registry.registerTriangleMesh({ id: 'poincare-target', sliceId: 'poincare', ...plane });
    const result = traceOpticalRayInSlice(field, registry, 'poincare', ambientRay(0, 0, 0, 0, 2), {
        maxPathLength: 1,
        initialStepSize: 0.005,
        maxStepSize: 0.01,
        gradientStep: 2e-5,
        absoluteTolerance: 1e-10,
        relativeTolerance: 1e-9
    });
    assert.equal(result.status, 'surface-hit');
    close(result.finalState.position.x, 0.3, 2e-4);
    close(result.finalState.position.w, 0, 1e-10);
    assert.equal(result.event.objectId, 'poincare-target');
    registry.dispose();
});

test('Poincare non-radial ray samples agree with the intrinsic geodesic reference', () => {
    const poincare = new PoincareMetric(-1);
    const field = createOpticalMetricField({
        sliceMetricAt: (position) => poincare.metricAt(position),
        wCoupling: 0,
        gradientStep: 2e-5
    });
    const start = { x: 0, y: 0.2, z: 0, w: 0 };
    const momentum = normalizeOpticalMomentum(field, start, { x: 1, y: 0, z: 0, w: 0 });
    const result = traceOpticalRay(field, createOpticalRayState({ position: start, momentum }), {
        maxPathLength: 0.6,
        initialStepSize: 0.005,
        maxStepSize: 0.01,
        gradientStep: 2e-5,
        absoluteTolerance: 1e-10,
        relativeTolerance: 1e-9
    });
    const end = result.finalState.position;
    for (const sample of result.samples) {
        const t = sample.opticalPathLength / result.finalState.opticalPathLength;
        const expected = poincare.interpolateGeodesic(start, end, Math.max(0, Math.min(1, t)));
        close(sample.position.x, expected.x, 4e-4, 'geodesic x');
        close(sample.position.y, expected.y, 4e-4, 'geodesic y');
    }
    assert.ok(Math.abs(end.y - start.y) > 1e-3, 'non-radial Poincare geodesic should curve in ball coordinates');
});


test('slice-global static geometry remains hittable when streamed chunks are filtered', () => {
    const registry = createRegistry();
    registerPlane(registry, { id: 'global-wall', x: 1 });
    const hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, {
        allowedChunkAddresses: [{ sliceId: 'slice-a', chunkX: 4, chunkZ: -2 }]
    });
    assert.equal(hit.objectId, 'global-wall');
    assert.equal(hit.chunkAddress, null);
    registry.dispose();
});

test('equal-distance triangle hits resolve deterministically by object id', () => {
    const registry = createRegistry();
    registerPlane(registry, { id: 'zeta-wall', x: 1 });
    registerPlane(registry, { id: 'alpha-wall', x: 1 });
    const hit = registry.intersectSegment('slice-a', { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    assert.equal(hit.objectId, 'alpha-wall');
    registry.dispose();
});

test('Poincare SpatialTransform slice tracer integrates a curved ray and resolves a local-space surface hit', () => {
    const slice = { id: 'poincare-world', frame: createCanonicalSliceFrame(0) };
    const transform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        bounds: {
            minX: -46, maxX: 46,
            minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            characteristicLength: 0.7,
            boundaryEpsilon: 1e-5
        }
    });
    const field = createSliceOpticalField(slice, transform);
    const position = { x: 0, y: 0.2, z: 0, w: 0 };
    const momentum = normalizeOpticalMomentum(field, position, { x: 1, y: 0, z: 0, w: 0 });
    const registry = createRegistry();
    registerPlane(registry, { id: 'poincare-wall', sliceId: slice.id, x: 3, extent: 8 });
    const result = traceOpticalRayInSlice(field, registry, slice.id,
        createOpticalRayState({ position, momentum }), {
            maxPathLength: 5,
            initialStepSize: 0.01,
            maxStepSize: 0.02,
            absoluteTolerance: 1e-10,
            relativeTolerance: 1e-8
        });
    assert.equal(result.status, 'surface-hit');
    assert.equal(result.event.objectId, 'poincare-wall');
    close(result.finalState.position.x, 3, 1e-7);
    close(result.finalState.position.w, 0, 1e-10);
    assert.ok(Math.abs(result.finalState.position.y - position.y) > 1e-2,
        'Poincare world-coordinate ray should curve under the intrinsic metric');
    assert.ok(result.diagnostics.relativeHamiltonianDrift < 5e-6);
    registry.dispose();
});

test('slice-native Poincare tracing uses the supplied slice chart bounds rather than render-space positions', () => {
    const slice = { id: 'poincare-world', frame: createCanonicalSliceFrame(12) };
    const transform = new SpatialTransform({
        geometry: 'poincare', renderScale: 24,
        bounds: {
            minX: -46, maxX: 46, minY: -5, maxY: 18, minZ: -48, maxZ: 46,
            characteristicLength: 0.7, boundaryEpsilon: 1e-5
        }
    });
    const field = createSliceOpticalField(slice, transform);
    const sample = field.sample({ x: 0, y: 4, z: 0, w: 12 });
    assert.ok(sample.tangentMetric.every(Number.isFinite));
    assert.ok(sample.tangentMetric.some((value, index) => Math.abs(value - (index % 4 === 0 ? 1 : 0)) > 1e-5));
    assert.equal(sample.isConstrained, true);
    assert.equal(sample.cometric[15], 0);
});

test('createSliceOpticalField uses the slice SpatialTransform metric and constrains W', () => {
    const slice = { id: 'euclidean', frame: createCanonicalSliceFrame(0) };
    const transform = new SpatialTransform({ geometry: 'euclidean' });
    const field = createSliceOpticalField(slice, transform);
    const sample = field.sample({ x: 1, y: 2, z: 3, w: 0 });
    assert.equal(sample.isConstrained, true);
    assert.equal(sample.cometric[15], 0);
    assert.throws(() => createSliceOpticalField(slice, transform, { wCoupling: 0.5 }), /must constrain/);
});
