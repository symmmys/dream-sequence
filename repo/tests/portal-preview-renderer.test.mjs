import assert from 'node:assert/strict';
import test from 'node:test';
import { PortalPreviewRenderer } from '../src/world/fields/geometry/portal-preview-renderer.js';

function vector3() {
    return {
        x: 1, y: 1, z: 1,
        set(x, y, z) { this.x = x; this.y = y; this.z = z; },
        setAll(value) { this.x = value; this.y = value; this.z = value; }
    };
}

class MockFreeCamera {
    constructor(name, position) {
        this.name = name;
        this.position = position;
        this.upVector = vector3();
        this.inputs = { clear() {} };
    }
    setTarget(target) { this.target = target; }
    dispose() { this.disposed = true; }
}

class MockRenderTargetTexture {
    constructor(name, size) { this.name = name; this.size = size; }
    getSize() { return this.size; }
    dispose() { this.disposed = true; }
}

class MockStandardMaterial {
    constructor(name) { this.name = name; }
    dispose() { this.disposed = true; }
}

function mockSurface(name) {
    return {
        name,
        scaling: vector3(),
        position: vector3(),
        rotation: vector3(),
        isDisposed() { return false; },
        dispose() { this.disposed = true; }
    };
}

test('portal preview target matches aperture aspect and updates every frame', function liveAspectMatchedPreview() {
    const previousBabylon = globalThis.BABYLON;
    const previousScene = { customRenderTargets: [] };
    let createdSize = null;
    globalThis.BABYLON = {
        FreeCamera: MockFreeCamera,
        RenderTargetTexture: class extends MockRenderTargetTexture {
            constructor(name, size) { super(name, size); createdSize = size; }
        },
        StandardMaterial: MockStandardMaterial,
        MeshBuilder: {
            CreatePlane(name) { return mockSurface(name); },
            CreateDisc(name) { return mockSurface(name); }
        },
        Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
        Color3: {
            White() { return { white: true }; },
            Black() { return { black: true }; }
        },
        Color4: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } },
        Mesh: { DOUBLESIDE: 2 }
    };
    try {
        const renderer = new PortalPreviewRenderer(previousScene, {
            width: 4, height: 2, resolution: 256, apertureShape: 'rectangle'
        });
        renderer.setHomePose();
        renderer.setApertureScale(0.5);
        assert.deepEqual(createdSize, { width: 256, height: 128 });
        assert.equal(renderer.texture.refreshRate, 1);
        assert.deepEqual(
            { x: renderer.surface.scaling.x, y: renderer.surface.scaling.y },
            { x: 0.5, y: 0.5 }
        );
        renderer.setVisible(true);
        assert.ok(previousScene.customRenderTargets.includes(renderer.texture));
        renderer.setVisible(false);
        assert.ok(!previousScene.customRenderTargets.includes(renderer.texture));
        renderer.dispose();
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});
