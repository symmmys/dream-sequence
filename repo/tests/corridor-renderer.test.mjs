import assert from 'node:assert/strict';
import test from 'node:test';
import { CorridorRenderer } from '../src/world/fields/geometry/corridor-renderer.js';
import { createSpatialCorridor } from '../src/world/fields/geometry/spatial-corridor.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    add(other) { return new Vector3(this.x + other.x, this.y + other.y, this.z + other.z); }
    subtract(other) { return new Vector3(this.x - other.x, this.y - other.y, this.z - other.z); }
    scale(amount) { return new Vector3(this.x * amount, this.y * amount, this.z * amount); }
    normalize() {
        const length = Math.hypot(this.x, this.y, this.z) || 1;
        this.x /= length; this.y /= length; this.z /= length;
        return this;
    }
    lengthSquared() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
    static Dot(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
    static Cross(left, right) {
        return new Vector3(
            left.y * right.z - left.z * right.y,
            left.z * right.x - left.x * right.z,
            left.x * right.y - left.y * right.x
        );
    }
}

class Mesh {
    constructor(name) { this.name = name; this.metadata = {}; }
    dispose() { this.disposed = true; }
}

class Material {
    constructor(name) { this.name = name; }
    dispose() { this.disposed = true; }
}

class VertexData {
    applyToMesh(mesh) { mesh.vertexData = this; }
}

class Color3 {
    constructor(r, g, b) { Object.assign(this, { r, g, b }); }
    static White() { return new Color3(1, 1, 1); }
}

function installBabylonStub() {
    const previous = globalThis.BABYLON;
    globalThis.BABYLON = { Vector3, Mesh, StandardMaterial: Material, VertexData, Color3 };
    return function restore() {
        if (previous === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previous;
    };
}

function createCorridor() {
    const source = createWorldSlice({ id: 'source', w: 0 });
    const destination = createWorldSlice({ id: 'destination', w: 80 });
    return createSpatialCorridor({
        id: 'renderer-test',
        source: { sliceId: source.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: destination.id, position: { x: 0, y: 0, z: 0 } },
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 5, w: 24 },
            { x: 0, y: 0, z: -5, w: 56 },
            { x: 0, y: 0, z: 0, w: 80 }
        ],
        traversable: true,
        bidirectional: true
    });
}

test('corridor renderers anchor their respective mouths in each slice render frame', function directionalAnchors() {
    const restore = installBabylonStub();
    try {
        const corridor = createCorridor();
        const createTransform = function createTransform(offset) {
            return {
                worldToRender(position) {
                    return { x: position.x + offset, y: position.y + 10, z: position.z + offset * 2 };
                }
            };
        };
        const source = new CorridorRenderer({}, corridor, createTransform(100), { segments: 16, radialSegments: 6 });
        const destination = new CorridorRenderer({}, corridor, createTransform(300), { anchorT: 1, segments: 16, radialSegments: 6 });
        const sourceMouth = source.getDisplaySample(0);
        const destinationMouth = destination.getDisplaySample(1);
        assert.deepEqual({ ...sourceMouth.position }, { x: 100, y: 10, z: 200 });
        assert.deepEqual({ ...destinationMouth.position }, { x: 300, y: 10, z: 600 });
        assert.equal(sourceMouth.axes.length, 2);
        assert.equal(sourceMouth.axes4D.length, 3);
        const middle = destination.getDisplaySample(0.5);
        assert.ok(Number.isFinite(middle.position.z));
        const frame = [middle.tangent4D, ...middle.axes4D];
        for (let row = 0; row < frame.length; row++) {
            for (let column = row; column < frame.length; column++) {
                assert.ok(Math.abs(dot4(frame[row], frame[column]) - Number(row === column)) < 1e-6);
            }
        }
        assert.ok(source.mesh.vertexData.positions.every(Number.isFinite));
        source.dispose();
        destination.dispose();
    } finally {
        restore();
    }
});

function dot4(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
}


test('corridor shell uses bounded opacity so the destination remains visible through it', function translucentCorridorShell() {
    const restore = installBabylonStub();
    try {
        const renderer = new CorridorRenderer({}, createCorridor(), {
            worldToRender(position) { return { ...position }; }
        }, { segments: 8, radialSegments: 6, opacity: 0.32 });
        assert.equal(renderer.material.alpha, 0.32);
        assert.equal(renderer.material.disableDepthWrite, true);
        renderer.dispose();
    } finally {
        restore();
    }
});

test('corridor renderer rejects opaque-range opacity values', function validateOpacity() {
    const restore = installBabylonStub();
    try {
        assert.throws(function invalidOpacity() {
            return new CorridorRenderer({}, createCorridor(), {
                worldToRender(position) { return { ...position }; }
            }, { opacity: 1.1 });
        }, /Invalid corridor rendering configuration/);
    } finally {
        restore();
    }
});


test('corridor shell defaults to a more transparent inspection opacity', function defaultOpacity() {
    const restore = installBabylonStub();
    try {
        const renderer = new CorridorRenderer({}, createCorridor(), {
            worldToRender(position) { return { ...position }; }
        }, { segments: 8, radialSegments: 6 });
        assert.equal(renderer.material.alpha, 0.22);
        assert.equal(renderer.material.disableDepthWrite, true);
        renderer.dispose();
    } finally {
        restore();
    }
});
