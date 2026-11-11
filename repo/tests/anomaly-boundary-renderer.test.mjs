import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalSliceFrame, createSliceFrame } from '../src/world/fields/geometry/spatial-4d.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import {
    AnomalyBoundaryRenderer,
    BOUNDARY_FACE_DEFINITIONS,
    buildAnomalyBoundaryGeometry,
    buildAnomalyCylinderGeometry,
    resolveAnomalyCylinderRadius,
    isWAlignedSlice
} from '../src/world/fields/geometry/anomaly-boundary-renderer.js';

function makeAnomaly(overrides = {}) {
    return {
        id: 'test-open-hypercube',
        source: { sliceId: 'slice-a', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'slice-b', position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -2, y: -3, z: -4, w: 0 },
            max: { x: 2, y: 3, z: 4, w: 10 }
        },
        ...overrides
    };
}

function identityTransform(overrides = {}) {
    return {
        worldToRender(position) { return { x: position.x, y: position.y, z: position.z }; },
        containsMetricDomainPosition() { return true; },
        ...overrides
    };
}

function makeBabylonStub() {
    class FakeMesh {
        constructor(name, scene) {
            this.name = name;
            this.scene = scene;
            this.metadata = {};
            this.isVisible = true;
            this.disposed = false;
            this.vertexData = null;
        }
        getVerticesData(kind) { return this.vertexData?.[kind] ?? null; }
        updateVerticesData(kind, data) {
            this.vertexData ??= {};
            this.vertexData[kind] = data;
        }
        dispose() { this.disposed = true; }
    }
    class FakeMaterial {
        constructor(name, scene) { this.name = name; this.scene = scene; this.disposed = false; }
        dispose() { this.disposed = true; }
    }
    class FakeVertexData {
        applyToMesh(mesh) {
            mesh.vertexData = {
                position: this.positions,
                normal: this.normals
            };
            mesh.indices = this.indices;
        }
    }
    class FakeVector3 {
        constructor(x, y, z) { Object.assign(this, { x, y, z }); }
    }
    class FakeColor3 {
        constructor(r, g, b) { Object.assign(this, { r, g, b }); }
    }
    return {
        Mesh: FakeMesh,
        StandardMaterial: FakeMaterial,
        VertexData: FakeVertexData,
        Vector3: FakeVector3,
        Color3: FakeColor3,
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal' },
        MeshBuilder: {
            CreateLineSystem(name, options, scene) {
                const mesh = options.instance ?? new FakeMesh(name, scene);
                mesh.lines = options.lines;
                mesh.disposed = false;
                return mesh;
            }
        }
    };
}

test('open 4D hypercube boundary produces six side panels and omits both W end caps', function sixSidePanels() {
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const geometry = buildAnomalyBoundaryGeometry({
        anomaly: makeAnomaly(), slice, spatialTransform: identityTransform(), viewerW: 5, gridSegments: 1
    });

    assert.equal(BOUNDARY_FACE_DEFINITIONS.length, 6);
    assert.equal(geometry.supported, true);
    assert.equal(geometry.visible, true);
    assert.equal(geometry.faces.length, 6);
    assert.equal(geometry.positions.length / 3, 24);
    assert.equal(geometry.indices.length, 36);
    assert.deepEqual(geometry.faces.map((face) => face.id), [
        'x-min', 'x-max', 'y-min', 'y-max', 'z-min', 'z-max'
    ]);
    for (const face of geometry.faces) {
        const axisIndex = { x: 0, y: 1, z: 2 }[face.axis];
        const expected = face.side < 0
            ? makeAnomaly().region.min[face.axis]
            : makeAnomaly().region.max[face.axis];
        for (let index = face.vertexStart; index < face.vertexStart + face.vertexCount; index++) {
            assert.equal(geometry.positions[index * 3 + axisIndex], expected);
        }
    }
    assert.equal(geometry.faces.some((face) => face.id.includes('w-')), false);
});

test('boundary cross-section follows the requested W coordinate and clips outside the 4D region', function wSliceChanges() {
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const options = { anomaly: makeAnomaly(), slice, spatialTransform: identityTransform(), gridSegments: 2 };
    const first = buildAnomalyBoundaryGeometry({ ...options, viewerW: 2 });
    const second = buildAnomalyBoundaryGeometry({ ...options, viewerW: 8 });
    const outside = buildAnomalyBoundaryGeometry({ ...options, viewerW: 11 });

    assert.equal(first.visible, true);
    assert.equal(second.visible, true);
    assert.equal(outside.visible, false);
    assert.equal(outside.reason, 'outside-w-span');
    assert.deepEqual(first.positions, second.positions);
});

test('boundary panels honor the displayed portal endpoint offset without moving canonical anomaly geometry', function presentationOffset() {
    const anomaly = makeAnomaly();
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const geometry = buildAnomalyBoundaryGeometry({
        anomaly,
        slice,
        spatialTransform: identityTransform(),
        viewerW: 5,
        gridSegments: 1,
        presentationEndpoint: { x: 100, y: 20, z: -30 }
    });
    assert.equal(geometry.visible, true);
    assert.equal(geometry.positions[0], 98);
    assert.equal(geometry.positions[1], 17);
    assert.equal(geometry.positions[2], -34);
    assert.deepEqual(anomaly.source.position, { x: 0, y: 0, z: 0 });
});

test('boundary renderer reports unsupported rotated W frames without crashing', function unsupportedFrame() {
    const frame = createSliceFrame({
        origin: { x: 0, y: 0, z: 0, w: 5 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 0, w: 1 }
        ],
        normal: { x: 0, y: 0, z: 1, w: 0 }
    });
    assert.equal(isWAlignedSlice(frame), false);
    const geometry = buildAnomalyBoundaryGeometry({
        anomaly: makeAnomaly(),
        slice: { id: 'slice-a', frame },
        spatialTransform: identityTransform(),
        viewerW: 5
    });
    assert.equal(geometry.supported, false);
    assert.equal(geometry.reason, 'slice-not-w-aligned');
});

test('boundary renderer updates geometry and visibility and disposes Babylon resources', function rendererLifecycle() {
    const originalBabylon = globalThis.BABYLON;
    globalThis.BABYLON = makeBabylonStub();
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const renderer = new AnomalyBoundaryRenderer(
        {}, makeAnomaly(), slice, identityTransform(), { gridSegments: 2 }
    );
    try {
        assert.equal(renderer.getInfo().boundaryCellCount, 6);
        assert.equal(renderer.getInfo().omittedEndCaps, 2);
        assert.equal(renderer.mesh.isVisible, false);
        renderer.setVisible(true);
        assert.equal(renderer.mesh.isVisible, true);
        assert.equal(renderer.edgeMesh.isVisible, true);
        renderer.update(6);
        assert.equal(renderer.getInfo().viewerW, 6);
        assert.equal(renderer.mesh.vertexData.position.length, 6 * 9 * 3);
        renderer.update(11);
        assert.equal(renderer.getInfo().reason, 'outside-w-span');
        assert.equal(renderer.mesh.isVisible, false);
        renderer.update(5);
        assert.equal(renderer.mesh.isVisible, true);
    } finally {
        const mesh = renderer.mesh;
        const edgeMesh = renderer.edgeMesh;
        const material = renderer.material;
        renderer.dispose();
        assert.equal(mesh.disposed, true);
        assert.equal(edgeMesh.disposed, true);
        assert.equal(material.disposed, true);
        globalThis.BABYLON = originalBabylon;
    }
});


test('tapered 4D cylinder grows smoothly from its source radius to its destination radius', function taperedCylinderRadius() {
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2, destination: 6 }
        }
    });
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const endpoints = {
        sourceAmbient: { x: 0, y: 0, z: 0, w: 0 },
        destinationAmbient: { x: 0, y: 0, z: 0, w: 10 }
    };
    const options = { anomaly, slice, spatialTransform: identityTransform(), ...endpoints,
        latitudeSegments: 8, longitudeSegments: 16 };
    const start = buildAnomalyCylinderGeometry({ ...options, viewerW: 0 });
    const middle = buildAnomalyCylinderGeometry({ ...options, viewerW: 5 });
    const end = buildAnomalyCylinderGeometry({ ...options, viewerW: 10 });

    assert.equal(start.visible, true);
    assert.equal(middle.visible, true);
    assert.equal(end.visible, true);
    assert.equal(start.boundaryType, 'open-4d-cylinder');
    assert.equal(start.sectionRadius, 2);
    assert.equal(middle.sectionRadius, 4);
    assert.equal(end.sectionRadius, 6);
    assert.equal(middle.positions.length / 3, 9 * 17);
    assert.equal(middle.indices.length, 8 * 16 * 6);
    assert.equal(middle.faces.length, 1);
    assert.ok(middle.lines.length > 0);
    assert.notDeepEqual(start.positions, end.positions);
    assert.deepEqual(resolveAnomalyCylinderRadius(anomaly, endpoints.sourceAmbient,
        endpoints.destinationAmbient, 5), { progress: 0.5, radius: 4 });
});

test('tapered cylinder destination mouth remains at full radius beyond the destination W handoff', function destinationMouthRemainsOpen() {
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2.8, destination: 7.0 }
        }
    });
    const source = { x: 0, y: 0, z: 0, w: 75 };
    const destination = { x: 0, y: 0, z: 0, w: 80 };
    const samples = [80, 80.01, 81, 83, 86].map((viewerW) =>
        resolveAnomalyCylinderRadius(anomaly, source, destination, viewerW).radius
    );

    assert.deepEqual(samples, [7, 7, 7, 7, 7]);
});

test('tapered cylinder radius clamps outside its endpoint interval and respects reversed W direction', function cylinderDirectionality() {
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 3, destination: 9 }
        }
    });
    const source = { x: 0, y: 0, z: 0, w: 10 };
    const destination = { x: 0, y: 0, z: 0, w: 0 };
    assert.equal(resolveAnomalyCylinderRadius(anomaly, source, destination, 10).radius, 3);
    assert.equal(resolveAnomalyCylinderRadius(anomaly, source, destination, 0).radius, 9);
    assert.equal(resolveAnomalyCylinderRadius(anomaly, source, destination, 12).radius, 3);
});

test('tapered cylinder applies portal presentation offsets without changing canonical endpoints', function cylinderPresentationOffset() {
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2, destination: 4 }
        }
    });
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const geometry = buildAnomalyCylinderGeometry({
        anomaly, slice, spatialTransform: identityTransform(), viewerW: 5,
        sourceAmbient: { x: 0, y: 0, z: 0, w: 0 },
        destinationAmbient: { x: 0, y: 0, z: 0, w: 10 },
        presentationEndpoint: { x: 100, y: 20, z: -30 },
        latitudeSegments: 4, longitudeSegments: 8
    });
    assert.equal(geometry.visible, true);
    // The south/north pole at latitude=0 lies at centerY + radius, then offset.
    assert.ok(Math.abs(geometry.positions[0] - 100) < 1e-6);
    assert.ok(Math.abs(geometry.positions[1] - 23) < 1e-6);
    assert.ok(Math.abs(geometry.positions[2] + 30) < 1e-6);
    assert.deepEqual(anomaly.source.position, { x: 0, y: 0, z: 0 });
});

test('tapered cylinder declines non-W-aligned anomaly axes explicitly', function cylinderAxisGuard() {
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2, destination: 4 }
        }
    });
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const geometry = buildAnomalyCylinderGeometry({
        anomaly, slice, spatialTransform: identityTransform(), viewerW: 5,
        sourceAmbient: { x: 0, y: 0, z: 0, w: 0 },
        destinationAmbient: { x: 1, y: 0, z: 0, w: 10 }
    });
    assert.equal(geometry.supported, false);
    assert.equal(geometry.reason, 'cylinder-axis-not-w-aligned');
});

test('cylinder boundary renderer updates the section radius with W and disposes resources', function cylinderRendererLifecycle() {
    const originalBabylon = globalThis.BABYLON;
    globalThis.BABYLON = makeBabylonStub();
    const slice = createWorldSlice({ id: 'slice-a', w: 5, geometry: 'euclidean' });
    const anomaly = makeAnomaly({
        view: {
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2, destination: 6 }
        }
    });
    const renderer = new AnomalyBoundaryRenderer({}, anomaly, slice, identityTransform(), {
        sourceAmbient: { x: 0, y: 0, z: 0, w: 0 },
        destinationAmbient: { x: 0, y: 0, z: 0, w: 10 },
        gridSegments: 4
    });
    try {
        assert.equal(renderer.getInfo().boundaryType, 'open-4d-cylinder');
        assert.equal(renderer.getInfo().sectionRadius, 4);
        renderer.setVisible(true);
        renderer.update(8);
        assert.ok(renderer.getInfo().sectionRadius > 4);
        assert.equal(renderer.getInfo().boundaryCellCount, 0);
        assert.equal(renderer.getInfo().boundarySurfaceCount, 1);
        assert.equal(renderer.mesh.vertexData.position.length, (10 + 1) * (24 + 1) * 3);
    } finally {
        const mesh = renderer.mesh;
        const edgeMesh = renderer.edgeMesh;
        const material = renderer.material;
        renderer.dispose();
        assert.equal(mesh.disposed, true);
        assert.equal(edgeMesh.disposed, true);
        assert.equal(material.disposed, true);
        globalThis.BABYLON = originalBabylon;
    }
});
