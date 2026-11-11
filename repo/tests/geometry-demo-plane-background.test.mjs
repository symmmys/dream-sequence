import test from 'node:test';
import assert from 'node:assert/strict';

class Color4Stub {
    constructor(r, g, b, a = 1) { Object.assign(this, { r, g, b, a }); }
    clone() { return new Color4Stub(this.r, this.g, this.b, this.a); }
}

function installColorStubs() {
    globalThis.BABYLON = {
        Color3: {
            FromHexString(hex) {
                const value = String(hex).replace('#', '');
                return {
                    r: parseInt(value.slice(0, 2), 16) / 255,
                    g: parseInt(value.slice(2, 4), 16) / 255,
                    b: parseInt(value.slice(4, 6), 16) / 255
                };
            }
        },
        Color4: Color4Stub
    };
}

test('runtime Plane background follows the active slice and honors saved opacity', async () => {
    installColorStubs();
    const { GeometryDemoWorld } = await import('../src/demo/geometry-demo-world.js');
    const defaultColor = new Color4Stub(0.003, 0.006, 0.022, 1);
    const world = Object.create(GeometryDemoWorld.prototype);
    world.scene = { clearColor: defaultColor.clone(), metadata: {} };
    world.defaultSceneClearColor = defaultColor.clone();
    world.currentSliceId = 'geometry-demo-4d-chamber';
    world.active = true;
    world.savedPlaneDefinitionsById = new Map([
        ['geometry-demo-4d-chamber', {
            id: 'geometry-demo-4d-chamber',
            container: { backgroundColor: '#123456', backgroundOpacity: 0.4 }
        }],
        ['geometry-demo-room', {
            id: 'geometry-demo-room',
            container: { backgroundColor: '#abcdef', backgroundOpacity: 0.8 }
        }]
    ]);

    assert.equal(world.applyCurrentPlaneBackground(), true);
    assert.ok(Math.abs(world.scene.clearColor.r - 0x12 / 255) < 1e-10);
    assert.ok(Math.abs(world.scene.clearColor.g - 0x34 / 255) < 1e-10);
    assert.ok(Math.abs(world.scene.clearColor.b - 0x56 / 255) < 1e-10);
    assert.equal(world.scene.clearColor.a, 0.4);

    world.applyPlaneDefinition({
        id: 'geometry-demo-4d-chamber',
        container: { backgroundColor: '#fedcba', backgroundOpacity: 0.25 }
    });
    assert.ok(Math.abs(world.scene.clearColor.r - 0xfe / 255) < 1e-10);
    assert.equal(world.scene.clearColor.a, 0.25);

    world.applyPlaneBackground('geometry-demo-room');
    assert.ok(Math.abs(world.scene.clearColor.r - 0xab / 255) < 1e-10);
    assert.equal(world.scene.clearColor.a, 0.8);

    world.applyPlaneBackground('unknown-plane');
    assert.equal(world.scene.metadata.somniumPlaneBackground, undefined);
    assert.ok(Math.abs(world.scene.clearColor.r - defaultColor.r) < 1e-10);
    assert.ok(Math.abs(world.scene.clearColor.g - defaultColor.g) < 1e-10);
});

test('leaving Plane editing reapplies the saved background of the runtime Plane', async () => {
    installColorStubs();
    const { PlaneEditor } = await import('../src/editor/plane-editor.js');
    const runtimeBackground = new Color4Stub(0.2, 0.3, 0.4, 0.7);
    let applied = 0;
    const editor = Object.create(PlaneEditor.prototype);
    editor.active = true;
    editor.placementArmed = true;
    editor.objectRenderer = { setEditorContext: () => {} };
    editor.transformTools = { detach: () => {}, setLayerMask: () => {} };
    editor.disposePreview = () => {};
    editor.scene = { clearColor: new Color4Stub(0, 0, 0, 1), metadata: { somniumPlaneBackground: 'editor-preview' } };
    editor.geometryDemo = {
        currentSliceId: 'geometry-demo-room',
        applyCurrentPlaneBackground() {
            applied += 1;
            this.scene.metadata.somniumPlaneBackground = runtimeBackground.clone();
            this.scene.clearColor = runtimeBackground.clone();
        },
        scene: editor.scene
    };
    editor.currentPlane = { id: 'geometry-demo-room' };
    editor.previousClearColor = new Color4Stub(0, 0, 0, 1);
    editor.previousBackgroundOverride = null;

    editor.deactivate();
    assert.equal(applied, 1);
    assert.equal(editor.scene.clearColor.r, runtimeBackground.r);
    assert.equal(editor.scene.clearColor.a, runtimeBackground.a);
    assert.equal(editor.scene.metadata.somniumPlaneBackground.r, runtimeBackground.r);
    assert.equal(editor.previousClearColor, null);
});
