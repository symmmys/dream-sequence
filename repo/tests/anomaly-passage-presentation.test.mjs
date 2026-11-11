import assert from 'node:assert/strict';
import test from 'node:test';
import {
    AnomalyPassagePresentation,
    PASSAGE_RENDER_LAYER,
    calculateAnomalyPassageLayout
} from '../src/demo/anomaly-passage-presentation.js';

function vector3(x = 0, y = 0, z = 0) {
    return {
        x, y, z,
        set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; }
    };
}

class MockFreeCamera {
    constructor(name, position) {
        this.name = name;
        this.position = position;
        this.upVector = vector3(0, 1, 0);
        this.inputs = { clear() {} };
        this.fov = 0.8;
    }
    setTarget(target) { this.target = target; }
    dispose() { this.disposed = true; }
}

class MockRenderTargetTexture {
    constructor(name, size) { this.name = name; this.size = size; this.renderList = []; }
    getSize() { return this.size; }
    dispose() { this.disposed = true; }
}

class MockStandardMaterial {
    constructor(name) { this.name = name; }
    dispose() { this.disposed = true; }
}

function mockSphere(name) {
    const values = {
        position: vector3(), scaling: vector3(1, 1, 1), rotation: vector3(),
        metadata: {}, isVisible: true, isPickable: true,
        vertexData: {
            position: new Float32Array([0, 0, 1, 0, 0, -1, 1, 0, 0, -1, 0, 0]),
            uv: new Float32Array(8).fill(0.5), normal: new Float32Array(12)
        },
        indices: new Uint16Array([0, 2, 1, 0, 1, 3]),
        getVerticesData(kind) { return this.vertexData[kind] ?? null; },
        getIndices() { return this.indices; },
        updateVerticesData(kind, data) { this.vertexData[kind] = data; },
        refreshBoundingInfo() {},
        isDisposed() { return false; },
        dispose() { this.disposed = true; }
    };
    values.name = name;
    return values;
}

function installBabylon() {
    const previous = globalThis.BABYLON;
    globalThis.BABYLON = {
        FreeCamera: MockFreeCamera,
        RenderTargetTexture: MockRenderTargetTexture,
        StandardMaterial: MockStandardMaterial,
        MeshBuilder: { CreateSphere: mockSphere },
        Vector3: class {
            constructor(x, y, z) { Object.assign(this, { x, y, z }); }
            set(x, y, z) { Object.assign(this, { x, y, z }); }
        },
        Color3: { White() { return {}; }, Black() { return {}; } },
        Color4: class {
            constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); }
        },
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal', UVKind: 'uv' },
        VertexData: {
            ComputeNormals(positions, indices, normals) { normals.fill(0); }
        },
        Mesh: { DOUBLESIDE: 2 }
    };
    return () => {
        if (previous === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previous;
    };
}

function makePortal(ownedMeshes) {
    return { ownedMeshes, camera: { layerMask: 1 } };
}

function makeMesh(name) {
    return { name, isDisposed() { return false; } };
}

test('passage layout puts the mouths on opposite sides of a configurable depth axis', () => {
    const layout = calculateAnomalyPassageLayout({
        anchor: { x: 10, y: 4, z: -2 }, axis: { x: 0, y: 0, z: 2 },
        mouthSeparation: 20, progress: 0.5
    });
    assert.deepEqual(layout.entry.position, { x: 10, y: 4, z: -10 });
    assert.deepEqual(layout.exit.position, { x: 10, y: 4, z: 10 });
    assert.equal(layout.separation, 20);
});

test('passage layout uses a smooth optional separation curve', () => {
    const start = calculateAnomalyPassageLayout({
        anchor: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
        mouthSeparation: 20, cameraInset: 4, mouthSeparationCurve: [10, 30], progress: 0
    });
    const middle = calculateAnomalyPassageLayout({
        anchor: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
        mouthSeparation: 20, cameraInset: 4, mouthSeparationCurve: [10, 30], progress: 0.5
    });
    const end = calculateAnomalyPassageLayout({
        anchor: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
        mouthSeparation: 20, cameraInset: 4, mouthSeparationCurve: [10, 30], progress: 1
    });
    assert.equal(start.separation, 10);
    assert.equal(middle.separation, 20);
    assert.equal(end.separation, 30);
});

test('perspective makes the entrance apparent radius shrink while the exit grows', () => {
    const states = Array.from({ length: 11 }, (_, index) => calculateAnomalyPassageLayout({
        anchor: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 },
        entryRadius: 4, exitRadius: 7, mouthSeparation: 80, cameraInset: 8,
        progress: index / 10
    }));
    assert.ok(states[0].entry.apparentAngularRadius > states[0].exit.apparentAngularRadius);
    assert.ok(states.at(-1).entry.apparentAngularRadius < states.at(-1).exit.apparentAngularRadius);
    for (let index = 1; index < states.length; index++) {
        assert.ok(states[index].entry.apparentAngularRadius < states[index - 1].entry.apparentAngularRadius);
        assert.ok(states[index].exit.apparentAngularRadius > states[index - 1].exit.apparentAngularRadius);
    }
    assert.ok(Math.abs(states[0].entry.cameraDistance - 8) < 1e-12);
    assert.ok(Math.abs(states.at(-1).exit.cameraDistance - 8) < 1e-12);
});

test('passage presentation renders both endpoint worlds on a black-only camera layer', () => {
    const restoreBabylon = installBabylon();
    try {
        const scene = {
            customRenderTargets: [],
            clearColor: { r: 0.01, g: 0.02, b: 0.03, a: 1 }
        };
        const sourceMesh = makeMesh('source-world');
        const destinationMesh = makeMesh('destination-world');
        const pair = {
            corridor: {
                id: 'test-anomaly',
                view: { interiorBoundaryRadii: { source: 4, destination: 7 } }
            },
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: makePortal([destinationMesh]),
            destinationPortal: makePortal([sourceMesh])
        };
        const presentation = new AnomalyPassagePresentation(scene, pair);
        const camera = {
            position: vector3(1, 2, 3), upVector: vector3(0, 1, 0), fov: 0.8,
            layerMask: 1,
            getForwardRay() { return { direction: vector3(0, 0, 1) }; }
        };
        const exitPose = {
            position: { x: 20, y: 3, z: 4 },
            target: { x: 20, y: 3, z: 14 },
            up: { x: 0, y: 1, z: 0 },
            approachEase: 0.5
        };
        const state = presentation.update({
            camera,
            startWorld: { slice: { id: 'source' }, layerMask: 0x10000000 },
            targetWorld: { slice: { id: 'destination' }, layerMask: 0x0FFFFFFF },
            progress: 0.5,
            exitCameraPose: exitPose
        });
        assert.equal(camera.layerMask, PASSAGE_RENDER_LAYER);
        assert.deepEqual(
            { r: scene.clearColor.r, g: scene.clearColor.g, b: scene.clearColor.b, a: scene.clearColor.a },
            { r: 0, g: 0, b: 0, a: 1 }
        );
        assert.equal(presentation.entry.texture.renderList[0], sourceMesh);
        assert.equal(presentation.exit.texture.renderList[0], destinationMesh);
        assert.equal(presentation.entry.camera.layerMask, 0x10000000);
        assert.equal(presentation.exit.camera.layerMask, 0x0FFFFFFF);
        assert.equal(presentation.entry.surface.layerMask, PASSAGE_RENDER_LAYER);
        assert.ok(state.entry.scale < 1);
        assert.ok(state.exit.scale > 0.08);
        assert.ok(state.entry.position.z < 3 && state.exit.position.z > 3);

        presentation.deactivate(camera, 0x10000000);
        assert.equal(camera.layerMask, 0x10000000);
        assert.deepEqual(
            { r: scene.clearColor.r, g: scene.clearColor.g, b: scene.clearColor.b, a: scene.clearColor.a },
            { r: 0.01, g: 0.02, b: 0.03, a: 1 }
        );
        assert.equal(presentation.entry.visible, false);
        assert.equal(presentation.exit.visible, false);
        presentation.dispose();
    } finally {
        restoreBabylon();
    }
});


test('passage camera mapping is idempotent and preserves independent camera movement', () => {
    const restoreBabylon = installBabylon();
    try {
        const scene = { customRenderTargets: [], clearColor: { r: 0, g: 0, b: 0, a: 1 } };
        const pair = {
            corridor: { id: 'camera-anomaly', view: { interiorBoundaryRadii: { source: 4, destination: 7 } } },
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: makePortal([makeMesh('destination-world')]),
            destinationPortal: makePortal([makeMesh('source-world')])
        };
        const presentation = new AnomalyPassagePresentation(scene, pair);
        const camera = {
            position: vector3(1, 2, 3),
            upVector: vector3(0, 1, 0),
            fov: 0.8,
            layerMask: 1,
            getForwardRay() { return { direction: vector3(0, 0, 1) }; },
            setTarget(target) { this.target = target; }
        };
        const worlds = {
            startWorld: { slice: { id: 'source' }, layerMask: 0x10000000 },
            targetWorld: { slice: { id: 'destination' }, layerMask: 0x0FFFFFFF }
        };

        const first = presentation.update({ camera, ...worlds, progress: 0.25 });
        const firstPosition = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
        const repeated = presentation.update({ camera, ...worlds, progress: 0.25 });
        assert.deepEqual(
            { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            firstPosition,
            'repeated presentation updates must not accumulate the display-space traversal offset'
        );
        assert.deepEqual(repeated.entry.position, first.entry.position);
        assert.deepEqual(repeated.exit.position, first.exit.position);

        // An external camera-controller tick is allowed to move the camera
        // laterally. The passage mapping must preserve that new base position.
        camera.position.set(4, 5, 6);
        presentation.update({ camera, ...worlds, progress: 0.25 });
        assert.deepEqual(
            { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            { x: 4, y: 5, z: 22 }
        );
        assert.deepEqual(presentation.getInfo().axis, { x: 0, y: 0, z: 1 },
            'camera translation must not rotate the stable passage presentation frame');

        assert.equal(presentation.restoreCameraPoseForControllerUpdate(camera), true);
        assert.deepEqual(
            { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            { x: 4, y: 5, z: 6 },
            'restore hook must remove the temporary presentation offset before camera-controller smoothing'
        );
        camera.position.set(5, 6, 7); // simulated follow/free camera-controller update
        presentation.update({ camera, ...worlds, progress: 0.25 });
        assert.deepEqual(
            { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            { x: 5, y: 6, z: 23 },
            'the next presentation update must be based on the controller pose, not the previous offset'
        );
        presentation.dispose();
    } finally {
        restoreBabylon();
    }
});

test('spherical mouth projection axes face into the passage and entrance imagery looks back to source', () => {
    const restoreBabylon = installBabylon();
    try {
        const scene = { customRenderTargets: [], clearColor: { r: 0, g: 0, b: 0, a: 1 } };
        const pair = {
            corridor: {
                id: 'oriented-mouth-anomaly',
                view: {
                    interiorBoundaryRadii: { source: 4, destination: 7 },
                    passagePresentation: { mouthSeparationAxis: [1, 0, 0] }
                }
            },
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: makePortal([makeMesh('destination-world')]),
            destinationPortal: makePortal([makeMesh('source-world')])
        };
        const presentation = new AnomalyPassagePresentation(scene, pair);
        const camera = {
            position: vector3(0, 0, 0),
            upVector: vector3(0, 1, 0),
            fov: 0.8,
            layerMask: 1,
            getForwardRay() { return { direction: vector3(0, 0, 1) }; },
            setTarget(target) { this.target = target; }
        };
        presentation.update({
            camera,
            startWorld: { slice: { id: 'source' }, layerMask: 0x10000000 },
            targetWorld: { slice: { id: 'destination' }, layerMask: 0x0FFFFFFF },
            progress: 0.5,
            exitCameraPose: {
                position: { x: 20, y: 3, z: 4 },
                target: { x: 20, y: 3, z: 14 },
                up: { x: 0, y: 1, z: 0 }
            }
        });

        assert.ok(Math.abs(presentation.entry.surface.rotation.y - Math.PI / 2) < 1e-12,
            'entry sphere local projection axis should face along the configured +X passage direction');
        assert.ok(Math.abs(presentation.exit.surface.rotation.y + Math.PI / 2) < 1e-12,
            'exit sphere local projection axis should face back toward the passage along -X');
        assert.deepEqual(
            { x: presentation.entry.camera.target.x, y: presentation.entry.camera.target.y, z: presentation.entry.camera.target.z },
            { x: 0, y: 0, z: -100 },
            'entrance render camera should look back into the source world'
        );
        assert.deepEqual(
            { x: presentation.exit.camera.target.x, y: presentation.exit.camera.target.y, z: presentation.exit.camera.target.z },
            { x: 20, y: 3, z: 14 },
            'exit render camera should retain the transported destination-world pose'
        );
        presentation.dispose();
    } finally {
        restoreBabylon();
    }
});

test('reverse traversal assigns the destination world to the entrance and source world to the exit', () => {
    const restoreBabylon = installBabylon();
    try {
        const scene = { customRenderTargets: [], clearColor: { r: 0, g: 0, b: 0, a: 1 } };
        const sourceMesh = makeMesh('source-world');
        const destinationMesh = makeMesh('destination-world');
        const pair = {
            corridor: { id: 'reverse-anomaly', view: { interiorBoundaryRadii: { source: 4, destination: 7 } } },
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: makePortal([destinationMesh]),
            destinationPortal: makePortal([sourceMesh])
        };
        const presentation = new AnomalyPassagePresentation(scene, pair);
        const camera = {
            position: vector3(), upVector: vector3(0, 1, 0), fov: 0.8,
            getForwardRay() { return { direction: vector3(0, 0, -1) }; }
        };
        const state = presentation.update({
            camera,
            startWorld: { slice: { id: 'destination' }, layerMask: 0x0FFFFFFF },
            targetWorld: { slice: { id: 'source' }, layerMask: 0x10000000 },
            progress: 0.25
        });
        assert.equal(presentation.entry.texture.renderList[0], destinationMesh);
        assert.equal(presentation.exit.texture.renderList[0], sourceMesh);
        assert.equal(state.direction, -1);
        assert.equal(state.entry.physicalRadius, 7);
        assert.equal(state.exit.physicalRadius, 4);
        presentation.dispose();
    } finally {
        restoreBabylon();
    }
});


test('presentation frame follows explicit travel direction while camera view remains independently oriented', () => {
    const restoreBabylon = installBabylon();
    try {
        const scene = { customRenderTargets: [], clearColor: { r: 0, g: 0, b: 0, a: 1 } };
        const pair = {
            corridor: { id: 'travel-heading-anomaly', view: { interiorBoundaryRadii: { source: 4, destination: 7 } } },
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: makePortal([makeMesh('destination-world')]),
            destinationPortal: makePortal([makeMesh('source-world')])
        };
        const presentation = new AnomalyPassagePresentation(scene, pair);
        const camera = {
            position: vector3(0, 0, 0), upVector: vector3(0, 1, 0), fov: 0.8, layerMask: 1,
            getForwardRay() { return { direction: vector3(0, 0, 1) }; },
            setTarget(target) { this.target = target; }
        };
        presentation.update({
            camera,
            startWorld: { slice: { id: 'source' }, layerMask: 0x10000000 },
            targetWorld: { slice: { id: 'destination' }, layerMask: 0x0FFFFFFF },
            progress: 0.25,
            presentationDirection: { x: 3, y: 0, z: 0 }
        });
        assert.deepEqual(presentation.getInfo().axis, { x: 1, y: 0, z: 0 },
            'the passage axis should use normalized travel direction');
        assert.ok(Math.abs(presentation.entry.surface.rotation.x) < 1e-12);
        assert.ok(Math.abs(presentation.entry.surface.rotation.y - Math.PI / 2) < 1e-12);
        assert.ok(Math.abs(presentation.entry.surface.rotation.z) < 1e-12);
        assert.deepEqual(
            { x: presentation.entry.camera.target.x, y: presentation.entry.camera.target.y, z: presentation.entry.camera.target.z },
            { x: 0, y: 0, z: -100 },
            'the source render camera should still follow the viewer perspective independently of the display axis'
        );
        presentation.dispose();
    } finally {
        restoreBabylon();
    }
});
