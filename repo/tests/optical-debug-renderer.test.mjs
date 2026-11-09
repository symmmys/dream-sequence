import test from 'node:test';
import assert from 'node:assert/strict';

import { OpticalDebugRenderer } from '../src/world/fields/geometry/optical-debug-renderer.js';
import { createCanonicalSliceFrame } from '../src/world/fields/geometry/spatial-4d.js';

function createBabylonStub() {
    const lines = [];
    class Vector3 {
        constructor(x, y, z) { Object.assign(this, { x, y, z }); }
    }
    class Color3 {
        constructor(r, g, b) { Object.assign(this, { r, g, b }); }
    }
    return {
        lines,
        BABYLON: {
            Vector3,
            Color3,
            MeshBuilder: {
                CreateLines(name, options) {
                    const mesh = {
                        name,
                        points: options.points,
                        metadata: {},
                        isVisible: true,
                        disposed: false,
                        dispose() { this.disposed = true; }
                    };
                    lines.push(mesh);
                    return mesh;
                }
            }
        }
    };
}

test('optical debug renderer projects authoritative slice samples only at draw time', () => {
    const previousBabylon = globalThis.BABYLON;
    const stub = createBabylonStub();
    globalThis.BABYLON = stub.BABYLON;
    const slice = { id: 'slice-a', frame: createCanonicalSliceFrame(5) };
    const spatialTransform = {
        worldToRender(position) {
            return { x: position.x * 2, y: position.y + 10, z: position.z - 4 };
        }
    };
    const renderer = new OpticalDebugRenderer({}, { visible: true });
    try {
        const meshes = renderer.renderTrace({
            status: 'surface-hit',
            event: { primitiveType: 'triangle' },
            samples: [
                { position: { x: 0, y: 0, z: 0, w: 5 } },
                { position: { x: 1, y: 2, z: 3, w: 5 } },
                { position: { x: 1.5, y: 2, z: 3, w: 5.1 } },
                { position: { x: 2, y: 3, z: 4, w: 5 } },
                { position: { x: 3, y: 4, z: 5, w: 5 } }
            ]
        }, { slice, spatialTransform });

        assert.equal(meshes.length, 2, 'off-slice samples split the visible path into separate groups');
        assert.equal(meshes[0].points.length, 2);
        assert.deepEqual(meshes[0].points[0], new stub.BABYLON.Vector3(0, 10, -4));
        assert.deepEqual(meshes[0].points[1], new stub.BABYLON.Vector3(2, 12, -1));
        assert.equal(meshes[1].points.length, 2);
        assert.equal(meshes[0].metadata.sliceId, 'slice-a');
        assert.equal(meshes[0].metadata.opticalStatus, 'surface-hit');
        assert.equal(meshes[0].metadata.opticalEvent, 'triangle');
        assert.equal(renderer.getStats().meshCount, 2);

        renderer.setVisible(false);
        assert.ok(meshes.every((mesh) => mesh.isVisible === false));
        renderer.clear();
        assert.ok(meshes.every((mesh) => mesh.disposed));
        assert.equal(renderer.getStats().meshCount, 0);
    } finally {
        renderer.dispose();
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('optical debug renderer validates slice transform and disposes idempotently', () => {
    const previousBabylon = globalThis.BABYLON;
    const stub = createBabylonStub();
    globalThis.BABYLON = stub.BABYLON;
    const renderer = new OpticalDebugRenderer({});
    try {
        assert.throws(() => renderer.renderTrace({ samples: [] }, {}), /requires a slice and its SpatialTransform/);
        renderer.dispose();
        renderer.dispose();
        assert.throws(() => renderer.setVisible(false), /disposed/);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});
