import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { createSpatialAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import { createAnomalyDefinitionFromRuntime } from '../src/world/fields/geometry/anomaly-definition.js';
import { createRuntimeAnomalyFromDefinition } from '../src/world/fields/geometry/runtime-anomaly-bridge.js';

function createFixture() {
    const topology = new WorldTopology();
    topology.registerSlice(createWorldSlice({ id: 'plane-a', w: 0 }));
    topology.registerSlice(createWorldSlice({ id: 'plane-b', w: 10 }));
    const anomaly = createSpatialAnomaly({
        id: 'bridge-test',
        source: { sliceId: 'plane-a', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'plane-b', position: { x: 0, y: 0, z: 0 } },
        region: { min: { x: -8, y: -8, z: -8, w: -8 }, max: { x: 8, y: 8, z: 8, w: 18 } },
        entryRadius: 4,
        visible: true,
        traversable: true,
        bidirectional: true
    });
    topology.registerCorridor(anomaly);
    return { topology, anomaly };
}

test('persistent endpoint edits become runtime endpoint positions and orientations', () => {
    const { topology, anomaly } = createFixture();
    const definition = createAnomalyDefinitionFromRuntime(anomaly, { name: 'Bridge test' });
    definition.source.position = { x: 2, y: 3, z: 4 };
    definition.source.orientation = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    definition.destination.position = { x: -5, y: 6, z: 7 };
    definition.destination.orientation = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
    definition.revision = 2;

    const runtime = createRuntimeAnomalyFromDefinition(definition, topology);
    assert.deepEqual(runtime.source.position, definition.source.position);
    assert.deepEqual(runtime.destination.position, definition.destination.position);
    for (const axis of ['x', 'y', 'z', 'w']) {
        assert.ok(Math.abs(runtime.source.orientation[axis] - definition.source.orientation[axis]) < 1e-12);
        assert.ok(Math.abs(runtime.destination.orientation[axis] - definition.destination.orientation[axis]) < 1e-12);
    }
    assert.ok(runtime.region.min.x <= 2 && runtime.region.max.x >= -5);
    assert.ok(runtime.region.min.w < runtime.region.max.w);
});

test('disabled and unplaced persistent anomalies cannot become visible or traversable', () => {
    const { topology, anomaly } = createFixture();
    const definition = createAnomalyDefinitionFromRuntime(anomaly);
    definition.enabled = false;
    let runtime = createRuntimeAnomalyFromDefinition(definition, topology);
    assert.equal(runtime.visible, false);
    assert.equal(runtime.traversable, false);

    definition.enabled = true;
    definition.endpointConfiguration = { source: { placed: true }, destination: { placed: false }, placementStatus: 'unplaced' };
    runtime = createRuntimeAnomalyFromDefinition(definition, topology);
    assert.equal(runtime.visible, false);
    assert.equal(runtime.traversable, false);
});

test('persistent connection flags are reflected in runtime topology settings', () => {
    const { topology, anomaly } = createFixture();
    const definition = createAnomalyDefinitionFromRuntime(anomaly);
    definition.connection = { visible: false, traversable: true, bidirectional: false };
    const runtime = createRuntimeAnomalyFromDefinition(definition, topology);
    assert.equal(runtime.visible, false);
    assert.equal(runtime.traversable, true);
    assert.equal(runtime.bidirectional, false);
    assert.equal(runtime.optics.bidirectional, false);
});


test('persistent aperture and W-freedom radii are carried into the runtime anomaly', () => {
    const { topology, anomaly } = createFixture();
    const definition = createAnomalyDefinitionFromRuntime(anomaly);
    definition.runtime.entryRadius = 2.75;
    definition.runtime.optics.apertureRadius = 2.75;
    definition.runtime.influence.maxWReach = 13.5;
    const runtime = createRuntimeAnomalyFromDefinition(definition, topology);
    assert.equal(runtime.entryRadius, 2.75);
    assert.equal(runtime.optics.apertureRadius, 2.75);
    assert.equal(runtime.influence.maxWReach, 13.5);
});
