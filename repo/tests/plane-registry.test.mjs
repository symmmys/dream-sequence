import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaneRegistry, createDemoPlaneDefinitions, createPlaneDefinition, createPlaneObjectDefinition, PLANE_DEFINITION_SCHEMA_VERSION } from '../src/world/fields/geometry/plane-registry.js';
import { createAnomalyDefinition, createDefaultAnomalyDefinitions } from '../src/world/fields/geometry/anomaly-definition.js';
import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import {
    PLANE_ANOMALY_DATABASE_NAME,
    PLANE_ANOMALY_DATABASE_VERSION,
    PLANE_OBJECT_STORE,
    ANOMALY_OBJECT_STORE,
    PlaneAnomalyPersistence
} from '../src/world/persistence/plane-anomaly-persistence.js';

function makeDemo() {
    return createGeometryDemoTopology({
        terrain: { sampleAt(x, z) { return { x, y: 1.25, z }; } },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
}

test('Plane registry exposes the three stable demo Plane identities', () => {
    const demo = makeDemo();
    const planes = createDemoPlaneDefinitions(demo.topology);
    const registry = new PlaneRegistry(planes);
    assert.deepEqual(registry.list().map(plane => plane.id).sort(), [
        'geometry-demo-4d-chamber', 'geometry-demo-room', 'somnium-main'
    ]);
    assert.equal(registry.require('geometry-demo-room').displayName, 'Poincaré Room');
    assert.equal(registry.require('geometry-demo-4d-chamber').displayName, '4D Room');
    assert.equal(registry.require('somnium-main').displayName, 'Main World');
    demo.chunkGraph.dispose();
});

test('Plane registry clones records and rejects duplicate or unknown identities', () => {
    const registry = new PlaneRegistry([{ id: 'plane-a', displayName: 'Plane A', geometry: 'euclidean' }]);
    const plane = registry.require('plane-a');
    plane.displayName = 'mutated outside';
    assert.equal(registry.require('plane-a').displayName, 'Plane A');
    assert.throws(() => registry.register({ id: 'plane-a', displayName: 'Duplicate' }), /already registered/);
    assert.throws(() => registry.require('missing'), /Unknown Plane/);
    assert.throws(() => registry.unregister('plane-a', { isReferenced: () => true }), /still reference it/);
});

test('Plane registry JSON round trip preserves stable identities', () => {
    const registry = new PlaneRegistry([{ id: 'p', displayName: 'P', geometry: 'poincare', seed: 42 }]);
    const restored = PlaneRegistry.fromJSON(registry.toJSON());
    assert.deepEqual(restored.require('p'), registry.require('p'));
    assert.throws(() => PlaneRegistry.fromJSON({ schemaVersion: 2, planes: [] }), /Invalid Plane registry/);
});

test('three existing demo anomalies become persistent definitions with original IDs and endpoint Plane IDs', () => {
    const demo = makeDemo();
    const definitions = createDefaultAnomalyDefinitions(demo.topology);
    assert.deepEqual(definitions.map(item => item.id).sort(), [
        'geometry-demo-4d-corridor',
        'geometry-demo-4d-main-world-corridor',
        'geometry-demo-corridor'
    ]);
    assert.equal(definitions.length, 3);
    assert.equal(definitions.find(item => item.id === 'geometry-demo-corridor').source.planeId, 'geometry-demo-room');
    assert.equal(definitions.find(item => item.id === 'geometry-demo-corridor').destination.planeId, 'somnium-main');
    assert.equal(definitions.find(item => item.id === 'geometry-demo-4d-corridor').source.planeId, 'geometry-demo-4d-chamber');
    assert.equal(definitions.find(item => item.id === 'geometry-demo-4d-main-world-corridor').destination.planeId, 'somnium-main');
    const normalized = createAnomalyDefinition(definitions[0]);
    assert.equal(normalized.runtime.id, normalized.id);
    assert.equal(normalized.source.orientation.w, 1);
    assert.deepEqual(normalized.runtime.view.passagePresentation, { mouthSeparation: 80, cameraInset: 8 });
    demo.chunkGraph.dispose();
});

test('Plane/anomaly persistence uses a separate database and separate stores from saved Worlds', () => {
    assert.equal(PLANE_ANOMALY_DATABASE_NAME, 'somnium-planes');
    assert.equal(PLANE_ANOMALY_DATABASE_VERSION, 2);
    assert.equal(PLANE_OBJECT_STORE, 'planes');
    assert.equal(ANOMALY_OBJECT_STORE, 'anomalies');
    const persistence = new PlaneAnomalyPersistence({ indexedDB: null });
    assert.equal(typeof persistence.bootstrapDemo, 'function');
    assert.equal(typeof persistence.saveAnomaly, 'function');
    assert.equal(typeof persistence.listPlanes, 'function');
});


test('Plane v1 records migrate to v2 with a 4D box container and editable object collection', () => {
    const migrated = createPlaneDefinition({
        schemaVersion: 1, id: 'legacy', displayName: 'Legacy Plane', geometry: 'euclidean',
        frame: { origin: { x: 0, y: 0, z: 0, w: 12 } }, source: 'built-in-demo'
    });
    assert.equal(migrated.schemaVersion, PLANE_DEFINITION_SCHEMA_VERSION);
    assert.deepEqual(migrated.container.dimensions, { w: 10, x: 100, y: 60, z: 100 });
    assert.equal(migrated.container.boundary.visible, false);
    assert.equal(migrated.frame.origin.w, 12);
    assert.equal(migrated.w, 12);
    assert.deepEqual(migrated.objects, []);
});

test('Plane definitions preserve editable container settings and serializable object records', () => {
    const plane = createPlaneDefinition({
        id: 'authored', displayName: 'Authored', geometry: 'euclidean',
        frame: { origin: { x: 0, y: 0, z: 0, w: 5 } },
        container: {
            type: 'box', dimensions: { w: 24, x: 80, y: 40, z: 60 },
            boundary: { visible: true, color: '#ABCDEF', opacity: 0.5 },
            backgroundColor: '#123456'
        },
        objects: [{
            id: 'cube-1', type: 'box', position: { x: 2, y: 3, z: 4 },
            dimensions: { x: 5, y: 6, z: 7 }, rotation: { x: 0, y: 0.5, z: 0 },
            material: { color: '#FF00AA' }
        }]
    });
    assert.deepEqual(plane.container.dimensions, { w: 24, x: 80, y: 40, z: 60 });
    assert.equal(plane.container.boundary.color, '#abcdef');
    assert.equal(plane.container.backgroundColor, '#123456');
    assert.deepEqual(plane.objects[0].position, { x: 2, y: 3, z: 4 });
    assert.deepEqual(plane.objects[0].dimensions, { x: 5, y: 6, z: 7 });
    assert.equal(plane.objects[0].material.color, '#ff00aa');
});

test('Plane object definitions support procedural hypercubes and validate transform data', () => {
    const hypercube = createPlaneObjectDefinition({
        id: 'tesseract', type: 'hypercube4d', parameters: { halfExtent: 4.2, angularSpeeds: { xw: 0.68 } }
    });
    assert.equal(hypercube.parameters.halfExtent, 4.2);
    assert.deepEqual(hypercube.parameters.angularSpeeds, { xw: 0.68 });
    assert.throws(() => createPlaneObjectDefinition({ id: 'bad', type: 'box', dimensions: { x: -1, y: 1, z: 1 } }), /positive finite/);
    assert.throws(() => createPlaneObjectDefinition({ id: 'bad', type: 'unknown' }), /Unsupported Plane object type/);
    assert.throws(() => createPlaneDefinition({ schemaVersion: 99, id: 'future', displayName: 'Future' }), /Unsupported Plane definition schema version/);
});
