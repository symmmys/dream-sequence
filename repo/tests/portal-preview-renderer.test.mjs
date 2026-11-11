import assert from 'node:assert/strict';
import test from 'node:test';
import { PortalPreviewRenderer, applySphericalCapGeometry } from '../src/world/fields/geometry/portal-preview-renderer.js';

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

class MockObservable {
    constructor() { this.observers = new Set(); }
    add(callback) { const observer = { callback }; this.observers.add(observer); return observer; }
    remove(observer) { return this.observers.delete(observer); }
    notifyObservers() { for (const observer of this.observers) observer.callback(); }
}

class MockRenderTargetTexture {
    constructor(name, size) {
        this.name = name;
        this.size = size;
        this.onBeforeRenderObservable = new MockObservable();
        this.onAfterRenderObservable = new MockObservable();
    }
    getSize() { return this.size; }
    dispose() { this.disposed = true; }
}

class MockStandardMaterial {
    constructor(name) { this.name = name; }
    dispose() { this.disposed = true; }
}

function mockSurface(name, positions = null, indices = null) {
    const vertexData = {
        position: positions,
        normal: null,
        uv: new Float32Array(positions ? positions.length / 3 * 2 : 6).fill(0.5)
    };
    return {
        name,
        scaling: vector3(),
        position: vector3(),
        rotation: vector3(),
        metadata: {},
        getVerticesData(kind) { return vertexData[kind] ?? null; },
        getIndices() { return indices; },
        updateVerticesData(kind, data) { vertexData[kind] = data; },
        refreshBoundingInfo() { this.boundingInfoRefreshed = true; },
        isDisposed() { return false; },
        dispose() { this.disposed = true; },
        vertexData
    };
}


test('legacy spherical-cap helper remains available and preserves projection UVs', function sphericalCapGeometry() {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = {
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal', UVKind: 'uv' },
        VertexData: {
            ComputeNormals(positions, indices, normals) {
                for (let index = 0; index < normals.length; index += 3) {
                    normals[index] = 0; normals[index + 1] = 0; normals[index + 2] = 1;
                }
            }
        }
    };
    try {
        const surface = mockSurface('cap', new Float32Array([0, 0, 0, 0.5, 0, 0, 1, 0, 0]),
            new Uint16Array([0, 1, 2]));
        const originalUvs = new Float32Array(surface.vertexData.uv);
        const result = applySphericalCapGeometry(surface, 0.4);
        assert.ok(Math.abs(result.positions[2] + 0.4) < 1e-6);
        assert.ok(result.positions[5] < 0 && result.positions[5] > result.positions[2]);
        assert.ok(Math.abs(result.positions[8]) < 1e-6);
        const sphereRadius = (1 + 0.4 * 0.4) / (2 * 0.4);
        const sphereCenterZ = sphereRadius - 0.4;
        for (let index = 0; index < result.positions.length; index += 3) {
            const x = result.positions[index];
            const y = result.positions[index + 1];
            const z = result.positions[index + 2];
            const sphereEquation = x * x + y * y + (z - sphereCenterZ) ** 2;
            assert.ok(Math.abs(sphereEquation - sphereRadius ** 2) < 1e-5);
        }
        assert.deepEqual(surface.vertexData.uv, originalUvs);
        assert.equal(surface.boundingInfoRefreshed, true);
        assert.equal(surface.vertexData.normal.length, 9);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('portal renderer supports a 3D spherical preview surface with depth-aware scaling', function sphericalPortalSurface() {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = {
        FreeCamera: MockFreeCamera,
        RenderTargetTexture: MockRenderTargetTexture,
        StandardMaterial: MockStandardMaterial,
        MeshBuilder: {
            CreateSphere(name, options) {
                assert.equal(options.diameter, 2);
                assert.equal(options.segments, 64);
                assert.equal(options.updatable, true);
                return mockSurface(name,
                    new Float32Array([0, 0, 1, 0, 0, -1, 1, 0, 0, -1, 0, 0]),
                    new Uint16Array([0, 2, 1, 0, 1, 3]));
            },
            CreateDisc(name) {
                return mockSurface(name, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                    new Uint16Array([0, 1, 2]));
            },
            CreatePlane(name) { return mockSurface(name); }
        },
        Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
        Color3: { White() { return {}; }, Black() { return {}; } },
        Color4: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } },
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal', UVKind: 'uv' },
        VertexData: {
            ComputeNormals(positions, indices, normals) {
                for (let index = 0; index < normals.length; index += 3) {
                    normals[index] = 0; normals[index + 1] = 0; normals[index + 2] = 1;
                }
            }
        },
        Mesh: { DOUBLESIDE: 2 }
    };
    try {
        const scene = { customRenderTargets: [] };
        const renderer = new PortalPreviewRenderer(scene, {
            width: 8, height: 8, apertureShape: 'circle', previewSurface: 'spherical'
        });
        renderer.setHomePose();
        assert.equal(renderer.previewSurface, 'spherical');
        assert.equal(renderer.surface.metadata.portalSphere, true);
        assert.equal(renderer.surface.metadata.portalSphereProjection, 'front-orthographic');
        const sphereZ = [renderer.surface.vertexData.position[2], renderer.surface.vertexData.position[5]];
        assert.ok(sphereZ.includes(1) && sphereZ.includes(-1), 'sphere includes both front and back hemispheres');
        assert.deepEqual(Array.from(renderer.surface.vertexData.uv), [0.5, 0.5, 0.5, 0.5, 1, 0.5, 0, 0.5]);
        renderer.setApertureScale(0.5);
        assert.equal(renderer.surface.scaling.x, 2);
        assert.equal(renderer.surface.scaling.y, 2);
        assert.equal(renderer.surface.scaling.z, 2);
        renderer.setApertureScale(2.5);
        assert.equal(renderer.apertureScale, 2.5);
        assert.equal(renderer.surface.scaling.x, 10);
        assert.equal(renderer.surface.scaling.z, 10);
        renderer.dispose();
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('flat circular preview remains available and is not curved', function flatCircularPreviewRemainsAvailable() {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = {
        FreeCamera: MockFreeCamera,
        RenderTargetTexture: MockRenderTargetTexture,
        StandardMaterial: MockStandardMaterial,
        MeshBuilder: {
            CreateDisc(name) {
                return mockSurface(name, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                    new Uint16Array([0, 1, 2]));
            },
            CreatePlane(name) { return mockSurface(name); }
        },
        Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
        Color3: { White() { return {}; }, Black() { return {}; } },
        Color4: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } },
        Mesh: { DOUBLESIDE: 2 }
    };
    try {
        const renderer = new PortalPreviewRenderer({ customRenderTargets: [] }, {
            width: 8, height: 8, apertureShape: 'circle', previewSurface: 'flat'
        });
        assert.equal(renderer.previewSurface, 'flat');
        assert.notEqual(renderer.surface.metadata.portalSphere, true);
        assert.equal(renderer.surface.vertexData.position[2], 0);
        assert.equal(renderer.surface.vertexData.position[5], 0);
        assert.equal(renderer.surface.vertexData.position[8], 0);
        renderer.dispose();
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

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
            CreateDisc(name) {
                return mockSurface(name, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                    new Uint16Array([0, 1, 2]));
            },
            CreateSphere(name) {
                return mockSurface(name,
                    new Float32Array([0, 0, 1, 0, 0, -1, 1, 0, 0, -1, 0, 0]),
                    new Uint16Array([0, 2, 1, 0, 1, 3]));
            }
        },
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal', UVKind: 'uv' },
        VertexData: {
            ComputeNormals(positions, indices, normals) {
                for (let index = 0; index < normals.length; index += 3) {
                    normals[index] = 0; normals[index + 1] = 0; normals[index + 2] = 1;
                }
            }
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


test('portal preview temporarily reveals Plane objects hidden by the active-slice context', function previewRemotePlaneObjects() {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = {
        FreeCamera: MockFreeCamera,
        RenderTargetTexture: MockRenderTargetTexture,
        StandardMaterial: MockStandardMaterial,
        MeshBuilder: { CreatePlane(name) { return mockSurface(name); } },
        Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
        Color3: { White() { return {}; }, Black() { return {}; } },
        Color4: class { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } },
        Mesh: { DOUBLESIDE: 2 }
    };
    try {
        const renderer = new PortalPreviewRenderer({ customRenderTargets: [] }, { width: 8, height: 8 });
        const remotePlaneObject = {
            isVisible: false,
            isDisposed() { return false; },
            isEnabled() { return true; },
            metadata: { planeObject: true, planeObjectPreviewEligible: true, planeId: 'remote-plane' }
        };
        const intentionallyHiddenObject = {
            isVisible: false,
            isDisposed() { return false; },
            isEnabled() { return true; },
            metadata: { planeObject: true, planeObjectPreviewEligible: false, planeId: 'remote-plane' }
        };
        renderer.setRenderList([remotePlaneObject, intentionallyHiddenObject]);
        assert.equal(renderer.texture.renderList.length, 2);
        renderer.texture.onBeforeRenderObservable.notifyObservers();
        assert.equal(remotePlaneObject.isVisible, true, 'remote Plane mesh is revealed for portal rendering');
        assert.equal(intentionallyHiddenObject.isVisible, false, 'authored visibility remains respected');
        renderer.texture.onAfterRenderObservable.notifyObservers();
        assert.equal(remotePlaneObject.isVisible, false, 'main-scene visibility is restored after portal rendering');
        renderer.dispose();
        assert.equal(renderer.texture.onBeforeRenderObservable.observers.size, 0);
        assert.equal(renderer.texture.onAfterRenderObservable.observers.size, 0);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});
