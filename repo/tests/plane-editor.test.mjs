import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaneDefinition } from '../src/world/fields/geometry/plane-registry.js';
import { createPlaneEditorDefinition } from '../src/editor/plane-editor.js';

const values = overrides => ({
    id: 'plane-authored', displayName: 'Authored Plane', geometry: 'euclidean',
    origin: { x: 12, y: 3, z: -8, w: 24 },
    dimensions: { w: 18, x: 120, y: 70, z: 90 },
    boundary: { visible: true, color: '#abcdef', opacity: 0.4 },
    backgroundColor: '#102030', backgroundOpacity: 0.8,
    ...overrides
});

test('Plane Editor creates a new 4D box definition with independent W thickness and center', () => {
    const plane = createPlaneEditorDefinition(null, values());
    assert.equal(plane.schemaVersion, 2);
    assert.equal(plane.w, 24);
    assert.equal(plane.frame.origin.w, 24);
    assert.deepEqual(plane.container.dimensions, { w: 18, x: 120, y: 70, z: 90 });
    assert.deepEqual(plane.frame.origin, { x: 12, y: 3, z: -8, w: 24 });
    assert.equal(plane.container.boundary.visible, true);
    assert.equal(plane.container.backgroundColor, '#102030');
    assert.deepEqual(plane.objects, []);
});

test('Plane Editor modifies existing Plane without changing its frame orientation or object records', () => {
    const original = createPlaneDefinition({
        id: 'plane-authored', displayName: 'Before', geometry: 'poincare',
        frame: {
            origin: { x: 1, y: 2, z: 3, w: 4 },
            axes: [
                { x: 0, y: 1, z: 0, w: 0 },
                { x: -1, y: 0, z: 0, w: 0 },
                { x: 0, y: 0, z: 1, w: 0 }
            ], normal: { x: 0, y: 0, z: 0, w: 1 }
        },
        objects: [{ id: 'kept-object', type: 'box', position: { x: 1, y: 2, z: 3 } }],
        metadata: { retained: true }
    });
    const updated = createPlaneEditorDefinition(original, values({
        id: original.id, displayName: 'After', geometry: 'poincare'
    }));
    assert.deepEqual(updated.frame.axes, original.frame.axes);
    assert.deepEqual(updated.frame.normal, original.frame.normal);
    assert.deepEqual(updated.objects, original.objects);
    assert.deepEqual(updated.metadata, original.metadata);
    assert.deepEqual(updated.frame.origin, { x: 12, y: 3, z: -8, w: 24 });
    assert.equal(updated.displayName, 'After');
});

test('Plane Editor rejects non-positive dimensions and invalid appearance values', () => {
    assert.throws(() => createPlaneEditorDefinition(null, values({
        dimensions: { w: 0, x: 1, y: 1, z: 1 }
    })), /positive finite/);
    assert.throws(() => createPlaneEditorDefinition(null, values({
        boundary: { visible: true, color: '#abcdef', opacity: 2 }
    })), /between 0 and 1/);
});
