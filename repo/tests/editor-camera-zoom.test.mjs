import assert from 'node:assert/strict';
import test from 'node:test';

class Vector3Stub { static Zero() { return { x: 0, y: 0, z: 0 }; } }
class ArcRotateCameraStub {
    constructor() { this.inputs = { attached: { mousewheel: { wheelPrecision: 3 } } }; }
    detachControl() { this.detached = true; }
    attachControl() { this.attached = true; }
    setTarget(target) { this.target = target; }
    dispose() { this.disposed = true; }
}

test('editor mouse-wheel zoom exposes 1x, 10x, and 100x presets with matching Babylon precision', async () => {
    globalThis.BABYLON = { ArcRotateCamera: ArcRotateCameraStub, Vector3: Vector3Stub };
    const { EditorCamera } = await import('../src/editor/editor-camera.js');
    const editor = new EditorCamera({}, { worldToRender: point => point });
    assert.equal(editor.getWheelZoomMultiplier(), 1);
    assert.equal(editor.camera.wheelPrecision, 5);
    assert.equal(editor.setWheelZoomMultiplier(10), 10);
    assert.equal(editor.camera.wheelPrecision, 0.5);
    assert.equal(editor.camera.inputs.attached.mousewheel.wheelPrecision, 0.5);
    assert.equal(editor.setWheelZoomMultiplier(100), 100);
    assert.equal(editor.camera.wheelPrecision, 0.05);
    assert.equal(editor.cycleWheelZoomMultiplier(), 1);
    assert.equal(editor.cycleWheelZoomMultiplier(-1), 100);
    assert.throws(() => editor.setWheelZoomMultiplier(5), /Unsupported wheel zoom multiplier/);
    editor.dispose();
});
