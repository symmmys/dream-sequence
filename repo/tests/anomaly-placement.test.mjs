import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnomalyDefinition, createDefaultAnomalyDefinitions } from '../src/world/fields/geometry/anomaly-definition.js';
import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import {
    quaternionFromEulerDegrees,
    eulerDegreesFromQuaternion,
    markAnomalyEndpointPlaced,
    alignAnomalyEndpoints,
    updateAnomalyConnection
} from '../src/editor/anomaly-placement.js';

function makeRecord() {
    const demo = createGeometryDemoTopology({
        terrain: { sampleAt(x, z) { return { x, y: 0, z }; } },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
    const record = createDefaultAnomalyDefinitions(demo.topology)[0];
    demo.chunkGraph.dispose();
    return record;
}

function close(actual, expected, epsilon = 1e-8) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('anomaly Euler orientation converts to a normalized quaternion and back', () => {
    const quaternion = quaternionFromEulerDegrees(37, -18, 12);
    close(Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w), 1);
    const euler = eulerDegreesFromQuaternion(quaternion);
    close(euler.yaw, 37);
    close(euler.pitch, -18);
    close(euler.roll, 12);
    assert.throws(() => quaternionFromEulerDegrees(Number.NaN, 0, 0), /must be finite/);
});

test('placing both mouths persists independent Plane, position, and orientation settings', () => {
    let record = makeRecord();
    record.endpointConfiguration = { source: { placed: false }, destination: { placed: false }, placementStatus: 'unplaced' };
    record = markAnomalyEndpointPlaced(record, 'source', {
        planeId: 'geometry-demo-room',
        position: { x: 4, y: 2, z: -3 },
        orientation: quaternionFromEulerDegrees(20, 10, 0)
    });
    assert.equal(record.endpointConfiguration.placementStatus, 'unplaced');
    assert.equal(record.enabled, false);
    assert.equal(record.runtime.source.sliceId, 'geometry-demo-room');
    assert.deepEqual(record.runtime.source.position, { x: 4, y: 2, z: -3 });

    record = markAnomalyEndpointPlaced(record, 'destination', {
        planeId: 'somnium-main',
        position: { x: -8, y: 1, z: 12 },
        orientation: quaternionFromEulerDegrees(-45, 0, 90)
    });
    assert.equal(record.endpointConfiguration.placementStatus, 'placed');
    assert.equal(record.source.planeId, 'geometry-demo-room');
    assert.equal(record.destination.planeId, 'somnium-main');
    assert.equal(record.runtime.destination.sliceId, 'somnium-main');
    assert.deepEqual(record.destination.position, { x: -8, y: 1, z: 12 });
    assert.equal(record.endpointConfiguration.destination.orientation.w,
        record.destination.orientation.w);
});

test('aligning Mouth B is a one-time copy and retains its selected Plane', () => {
    const record = makeRecord();
    const aligned = alignAnomalyEndpoints(record);
    assert.equal(aligned.destination.planeId, record.destination.planeId);
    assert.deepEqual(aligned.destination.position, record.source.position);
    assert.deepEqual(aligned.destination.orientation, record.source.orientation);
    const originalDestination = { ...record.destination.position };
    aligned.destination.position.x += 5;
    assert.notEqual(aligned.destination.position.x, aligned.source.position.x);
    assert.deepEqual(record.destination.position, originalDestination);
});

test('connection-level visibility and traversal settings update independently', () => {
    const record = makeRecord();
    const updated = updateAnomalyConnection(record, {
        visible: false, traversable: true, bidirectional: false
    });
    assert.deepEqual(updated.connection, { visible: false, traversable: true, bidirectional: false });
    assert.equal(updated.runtime.visible, false);
    assert.equal(updated.runtime.traversable, true);
    assert.equal(updated.runtime.bidirectional, false);
    assert.throws(() => updateAnomalyConnection(record, { traversable: 'yes' }), /must be boolean/);
});

test('persistent anomaly normalization retains placement workflow flags', () => {
    const record = makeRecord();
    record.endpointConfiguration = {
        source: { placed: true, custom: { aperture: 2 } },
        destination: { placed: false },
        placementStatus: 'unplaced'
    };
    const normalized = createAnomalyDefinition(record);
    assert.equal(normalized.endpointConfiguration.placementStatus, 'unplaced');
    assert.equal(normalized.endpointConfiguration.source.placed, true);
    assert.deepEqual(normalized.endpointConfiguration.source.custom, { aperture: 2 });
    assert.throws(() => createAnomalyDefinition({
        ...record, endpointConfiguration: { source: {}, destination: {}, placementStatus: 'pending' }
    }), /placementStatus/);
});
