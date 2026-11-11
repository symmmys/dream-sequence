import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BuildingModel } from '../src/buildings/building-model.js';
import { BuildingGenerator } from '../src/buildings/building-generator.js';

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

class ObservableStub {
    constructor() { this.handlers = new Set(); }
    add(handler) { this.handlers.add(handler); return handler; }
    remove(handler) { this.handlers.delete(handler); }
    notify() { for (const handler of [...this.handlers]) handler(); }
}

class Vector3Stub {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copyFrom(value) { this.x = value.x; this.y = value.y; this.z = value.z; return this; }
    clone() { return new Vector3Stub(this.x, this.y, this.z); }
    static One() { return new Vector3Stub(1, 1, 1); }
}

class QuaternionStub {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    clone() { return new QuaternionStub(this.x, this.y, this.z, this.w); }
    static Identity() { return new QuaternionStub(); }
    static FromEulerVector() { return new QuaternionStub(); }
}

class TransformNodeStub {
    constructor(name) {
        this.name = name;
        this.position = new Vector3Stub();
        this.scaling = Vector3Stub.One();
        this.rotationQuaternion = QuaternionStub.Identity();
        this.enabled = true;
    }
    setEnabled(value) { this.enabled = value; }
    dispose() { this.disposed = true; }
}

function makeAxisGizmo(layer = null) {
    const mesh = { layerMask: 0x0FFFFFFF };
    layer?.utilityLayerScene?.meshes.push(mesh);
    return { gizmoLayer: layer, testMesh: mesh, dragBehavior: { onDragObservable: new ObservableStub(), onDragEndObservable: new ObservableStub() } };
}
function makeGizmoGroup(layer, withUniform = false) {
    const group = { xGizmo: makeAxisGizmo(layer), yGizmo: makeAxisGizmo(layer), zGizmo: makeAxisGizmo(layer) };
    if (withUniform) group.uniformScaleGizmo = makeAxisGizmo(layer);
    return group;
}

class GizmoManagerStub {
    constructor() {
        this.utilityLayer = { utilityLayerScene: { meshes: [] } };
        this.gizmos = { positionGizmo: null, rotationGizmo: null, scaleGizmo: null, boundingBoxGizmo: null };
    }
    set positionGizmoEnabled(value) { if (value && !this.gizmos.positionGizmo) this.gizmos.positionGizmo = makeGizmoGroup(this.utilityLayer); }
    set rotationGizmoEnabled(value) {
        if (value && !this.gizmos.rotationGizmo) {
            this.gizmos.rotationGizmo = { ...makeGizmoGroup(this.utilityLayer), setEnabledRotationAxis: axis => { this.rotationAxes = axis; } };
        }
    }
    set scaleGizmoEnabled(value) { if (value && !this.gizmos.scaleGizmo) this.gizmos.scaleGizmo = makeGizmoGroup(this.utilityLayer, true); }
    set boundingBoxGizmoEnabled(value) { this.boundingBoxEnabled = value; }
    attachToNode(node) { this.attachedNode = node; }
    dispose() { this.disposed = true; }
}

function installBabylonStubs() {
    globalThis.BABYLON = {
        TransformNode: TransformNodeStub,
        GizmoManager: GizmoManagerStub,
        Vector3: Vector3Stub,
        Quaternion: QuaternionStub
    };
}

test('gizmo controls eagerly create and subscribe to all lazily-created Babylon gizmos', async () => {
    installBabylonStubs();
    const { SharedTransformTools } = await import('../src/editor/shared-transform-tools.js');
    const tools = new SharedTransformTools({}, { onChange: () => {} });
    assert.ok(tools.gizmos.gizmos.positionGizmo);
    assert.ok(tools.gizmos.gizmos.rotationGizmo);
    assert.ok(tools.gizmos.gizmos.scaleGizmo);
    assert.equal(tools.gizmos.rotationAxes, 'y');
    for (const group of [tools.gizmos.gizmos.positionGizmo, tools.gizmos.gizmos.rotationGizmo, tools.gizmos.gizmos.scaleGizmo]) {
        for (const axis of ['xGizmo', 'yGizmo', 'zGizmo']) {
            assert.ok(group[axis].dragBehavior.onDragObservable.handlers.size > 0);
            assert.ok(group[axis].dragBehavior.onDragEndObservable.handlers.size > 0);
        }
    }
    tools.dispose();
});

test('Plane gizmo utility meshes inherit the active demo Plane layer mask', async () => {
    installBabylonStubs();
    const { SharedTransformTools } = await import('../src/editor/shared-transform-tools.js');
    const tools = new SharedTransformTools({}, { rotationAxes: 'all' });
    const utilityMeshes = tools.gizmos.utilityLayer.utilityLayerScene.meshes;
    assert.ok(utilityMeshes.length > 0);
    tools.setLayerMask(0x10000000);
    assert.ok(utilityMeshes.every(mesh => mesh.layerMask === 0x10000000));
    tools.setLayerMask(0x0FFFFFFF);
    assert.ok(utilityMeshes.every(mesh => mesh.layerMask === 0x0FFFFFFF));
    tools.dispose();
});

test('scale gizmo uses a separate proxy, leaves the rotation target at unit scale, and reports drag phases', async () => {
    installBabylonStubs();
    const { SharedTransformTools } = await import('../src/editor/shared-transform-tools.js');
    const states = [];
    const tools = new SharedTransformTools({}, { onChange: state => states.push(state) });
    const position = new Vector3Stub(3, 4, 5);
    const scale = new Vector3Stub(2, 1, 3);
    tools.attach(position, QuaternionStub.Identity(), scale);

    tools.setMode('rotate');
    assert.equal(tools.gizmos.attachedNode, tools.poseNode);
    assert.deepEqual(tools.poseNode.scaling, Vector3Stub.One());
    tools.poseNode.rotationQuaternion = new QuaternionStub(0, 0.5, 0, 0.866);
    tools.gizmos.gizmos.rotationGizmo.yGizmo.dragBehavior.onDragObservable.notify();
    assert.equal(states.at(-1).mode, 'rotate');
    assert.equal(states.at(-1).phase, 'drag');
    tools.gizmos.gizmos.rotationGizmo.yGizmo.dragBehavior.onDragEndObservable.notify();
    assert.equal(states.at(-1).phase, 'end');

    tools.setMode('scale');
    assert.equal(tools.gizmos.attachedNode, tools.scaleNode);
    tools.scaleNode.scaling.copyFrom(new Vector3Stub(2.5, 1.5, 3.5));
    tools.gizmos.gizmos.scaleGizmo.xGizmo.dragBehavior.onDragObservable.notify();
    assert.deepEqual(states.at(-1).scale, new Vector3Stub(2.5, 1.5, 3.5));
    assert.deepEqual(tools.poseNode.scaling, Vector3Stub.One());
    assert.deepEqual(states.at(-1).position, position);
    tools.dispose();
});

test('detached gizmos remain hidden when the user changes transform mode without a selection', async () => {
    installBabylonStubs();
    const { SharedTransformTools } = await import('../src/editor/shared-transform-tools.js');
    const tools = new SharedTransformTools({}, { onChange: () => {} });
    assert.equal(tools.gizmos.attachedNode, null);
    tools.setMode('scale');
    assert.equal(tools.gizmos.attachedNode, null);
    tools.detach();
    tools.dispose();
});

test('box building generator produces one visible furniture-bucket component', () => {
    const building = new BuildingModel({
        id: 'test-box-building',
        components: [{
            kind: 'furniture',
            type: 'box',
            position: { x: 0, y: 1, z: 0 },
            dimensions: { x: 2, y: 2, z: 2 },
            rotation: 0,
            material: 'furniture'
        }]
    });
    const generated = new BuildingGenerator().generate(building);
    assert.equal(generated.length, 1);
    assert.equal(generated[0].kind, 'furniture');
    assert.deepEqual(generated[0].dimensions, { x: 2, y: 2, z: 2 });
});

test('box preview creates filled Babylon meshes as well as its outline', async () => {
    const code = await source('../src/editor/building-preview-renderer.js');
    assert.match(code, /MeshBuilder\.CreateBox\(/);
    assert.match(code, /this\.solids\.push\(solid\)/);
    assert.match(code, /MATERIAL_ALPHABLEND/);
    assert.match(code, /for \(const mesh of this\.solids\) mesh\.dispose\(\)/);
});

test('Object Editor is focused on the floor-plan-to-building workflow, not standalone box placement', async () => {
    const code = await source('../src/editor/building-editor.js');
    assert.match(code, /data-editor-panel="object-editor"/);
    assert.match(code, /CREATE BUILDING FROM FLOOR PLAN/);
    assert.match(code, /id="floor-image"/);
    assert.match(code, /id="build-floor"/);
    assert.doesNotMatch(code, /id="add-box-building"/);
    assert.match(code, /this\.previewRenderer\.show\(building\)/);
    assert.match(code, /this\.placeButton\.disabled = false/);
});

test('building preview outline and solid preview share the projected component transform', async () => {
    const code = await source('../src/editor/building-preview-renderer.js');
    assert.match(code, /createComponentMatrix\(component, building\)/);
    assert.match(code, /createComponentLinesFromMatrix\(this\.createComponentMatrix/);
    assert.match(code, /const projected = this\.createComponentMatrix\(component, building\)/);
    assert.match(code, /projected\.decompose\(scaling, rotation, position\)/);
});


test('Plane object transform controls leave all three rotation axes enabled', async () => {
    installBabylonStubs();
    const { SharedTransformTools } = await import('../src/editor/shared-transform-tools.js');
    const tools = new SharedTransformTools({}, { rotationAxes: 'all', onChange: () => {} });
    assert.equal(tools.rotationAxes, 'all');
    assert.equal(tools.gizmos.rotationAxes, undefined); // no restriction call: Babylon keeps X, Y, and Z rings active
    tools.dispose();
});
