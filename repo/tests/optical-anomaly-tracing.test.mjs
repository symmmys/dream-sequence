import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { createSliceTransitionAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { SpatialChunkGraph } from '../src/world/spatial-chunk-graph.js';
import { SliceWorldRegistry } from '../src/world/slice-world-registry.js';
import { OpticalSceneRegistry } from '../src/world/fields/geometry/optical-scene-registry.js';
import {
    createAnomalyOpticalField,
    createAnomalyOpticalTracer
} from '../src/world/fields/geometry/optical-anomaly-tracer.js';
import { createOpticalRayState, evaluateOpticalHamiltonian } from '../src/world/fields/geometry/optical-ray-integrator.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';

const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ORIGIN3 = { x: 0, y: 0, z: 0 };

function close(actual, expected, tolerance = 1e-6, message = '') {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${message} expected ${expected}, received ${actual}`);
}

function makeFixture(options = {}) {
    const source = createWorldSlice({ id: 'optical-source', w: 0, geometry: 'euclidean' });
    const destination = createWorldSlice({ id: 'optical-destination', w: 10, geometry: 'euclidean' });
    const topology = new WorldTopology();
    topology.registerSlice(source);
    topology.registerSlice(destination);
    const anomaly = createSliceTransitionAnomaly({
        id: 'optical-link',
        source: { sliceId: source.id, position: ORIGIN3 },
        destination: { sliceId: destination.id, position: ORIGIN3 },
        region: options.region ?? {
            min: { x: -2, y: -2, z: -2, w: -1 },
            max: { x: 2, y: 2, z: 2, w: 11 }
        },
        influence: options.influence ?? {
            center: { x: 0, y: 0, z: 0, w: 5 },
            centerMode: 'fixed', innerRadius: 6, horizonRadius: 9,
            maxWReach: 10
        },
        entryRadius: 0.5,
        traversable: options.traversable ?? false,
        bidirectional: options.traversableBidirectional ?? false,
        optics: {
            enabled: options.opticsEnabled ?? true,
            bidirectional: options.opticsBidirectional ?? true,
            maxWOpticalReach: options.maxWOpticalReach ?? 10,
            apertureRadius: options.apertureRadius ?? 0.5,
            wCouplingScale: options.wCouplingScale ?? 1,
            refractiveIndex: options.refractiveIndex ?? 1,
            attenuationPerUnit: options.attenuationPerUnit ?? 0,
            transmission: options.transmission ?? 1
        }
    });
    const resolved = topology.registerCorridor(anomaly);
    const sliceRegistry = new SliceWorldRegistry();
    const identityTransform = { metricAtWorld() { return { values: IDENTITY3 }; } };
    sliceRegistry.register(source, { spatialTransform: identityTransform });
    sliceRegistry.register(destination, { spatialTransform: identityTransform });
    const sceneRegistry = new OpticalSceneRegistry();
    const chunkGraph = new SpatialChunkGraph(topology);
    chunkGraph.registerSlice(source, { chunkSize: 4 });
    chunkGraph.registerSlice(destination, { chunkSize: 4 });
    chunkGraph.registerCorridor(resolved.id);
    return {
        source, destination, anomaly: resolved, topology, sliceRegistry,
        sceneRegistry, chunkGraph, identityTransform,
        tracer: createAnomalyOpticalTracer({ topology, sliceRegistry, sceneRegistry, chunkGraph }),
        dispose() {
            sceneRegistry.dispose();
            chunkGraph.dispose();
            sliceRegistry.dispose();
        }
    };
}

test('optical topology is independent of player traversal permissions', () => {
    const fixture = makeFixture({ traversable: false, opticsEnabled: true });
    try {
        assert.equal(fixture.topology.getTraversableNeighbors(fixture.source.id).length, 0);
        assert.equal(fixture.topology.getOpticallyConnectedNeighbors(fixture.source.id).length, 1);
        assert.equal(fixture.topology.getOpticallyConnectedNeighbors(fixture.destination.id).length, 1);
        assert.equal(fixture.topology.hasOpticalConnection(fixture.source.id, fixture.destination.id), true);
        assert.equal(fixture.topology.hasOpticalConnection(fixture.destination.id, fixture.source.id), true);
    } finally {
        fixture.dispose();
    }
});

test('one-way optical permission does not create a reverse optical edge', () => {
    const fixture = makeFixture({ opticsBidirectional: false });
    try {
        assert.equal(fixture.topology.getOpticallyConnectedNeighbors(fixture.source.id).length, 1);
        assert.equal(fixture.topology.getOpticallyConnectedNeighbors(fixture.destination.id).length, 0);
        assert.equal(fixture.topology.hasOpticalConnection(fixture.destination.id, fixture.source.id), false);
    } finally {
        fixture.dispose();
    }
});

test('disabled anomaly optics never create optical topology edges', () => {
    const fixture = makeFixture({ opticsEnabled: false });
    try {
        assert.equal(fixture.topology.getOpticallyConnectedNeighbors(fixture.source.id).length, 0);
        assert.equal(fixture.tracer.getOpticallyConnectedNeighbors(fixture.source.id).length, 0);
    } finally {
        fixture.dispose();
    }
});

test('optical chunk reachability is separate from traversable chunk reachability', () => {
    const fixture = makeFixture({ traversable: false });
    try {
        const sourceAddress = fixture.chunkGraph.getAddress(fixture.source.id, ORIGIN3);
        const destinationAddress = fixture.chunkGraph.getAddress(fixture.destination.id, ORIGIN3);
        const centerReach = fixture.chunkGraph.getOpticalReachability(sourceAddress, destinationAddress, {
            position4D: fixture.anomaly.influence.center,
            corridorId: fixture.anomaly.id,
            maxChunkDistance: 1
        });
        assert.equal(centerReach.kind, 'optical-cross-slice');
        assert.equal(centerReach.reachable, true);
        close(centerReach.opticalWReach, 10);

        const ordinaryReach = fixture.chunkGraph.getReachability(sourceAddress, destinationAddress, {
            position4D: fixture.anomaly.influence.center,
            corridorId: fixture.anomaly.id,
            maxChunkDistance: 1
        });
        assert.equal(ordinaryReach.reachable, false);
        assert.equal(ordinaryReach.reason, 'no-explicit-topology-edge');
    } finally {
        fixture.dispose();
    }
});

test('anomaly optical field blends endpoint slice metrics and opens a genuine fourth direction', () => {
    const fixture = makeFixture();
    try {
        const sourceBinding = fixture.sliceRegistry.require(fixture.source.id);
        const destinationBinding = fixture.sliceRegistry.require(fixture.destination.id);
        const field = createAnomalyOpticalField(fixture.anomaly, sourceBinding, destinationBinding);
        const sample = field.sample({ x: 0, y: 0, z: 0, w: 5 });
        assert.equal(sample.wCoupling, 1);
        assert.ok(sample.metric.every(Number.isFinite));
        assert.ok(sample.cometric.every(Number.isFinite));
        close(sample.cometric[15], 1);
        close(field.signedSpan, 10);
    } finally {
        fixture.dispose();
    }
});

test('all three demo anomaly bridges accept the live-scale Poincare and Euclidean metrics', () => {
    const terrain = { sampleAt(x, z) { return { x, y: 1.25, z }; } };
    const sourceTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 24, visualScaleGamma: 0.72,
        maxVisualScale: 3.5,
        bounds: {
            minX: -46, maxX: 46, minY: -5, maxY: 18,
            minZ: -48, maxZ: 46, characteristicLength: 0.7, boundaryEpsilon: 1e-5
        }
    });
    const hypercubeTransform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
    const mainTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 10000,
        bounds: {
            minX: -20000, maxX: 20000, minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000, characteristicLength: 0.25
        }
    });
    const demo = createGeometryDemoTopology({ terrain, spatialTransform: mainTransform, chunkSize: 2000 });
    const registry = new SliceWorldRegistry();
    const transforms = new Map([
        [demo.sourceSlice.id, sourceTransform],
        [demo.hypercubeSlice.id, hypercubeTransform],
        [demo.mainSlice.id, mainTransform]
    ]);
    try {
        for (const slice of [demo.sourceSlice, demo.hypercubeSlice, demo.mainSlice]) {
            registry.register(slice, { spatialTransform: transforms.get(slice.id) });
        }
        for (const anomaly of [demo.corridor, demo.hypercubeCorridor, demo.hypercubeMainCorridor]) {
            const field = createAnomalyOpticalField(
                anomaly,
                registry.require(anomaly.source.sliceId),
                registry.require(anomaly.destination.sliceId)
            );
            const sample = field.sample(anomaly.influence.center);
            assert.equal(field.metricSampling, anomaly.optics.metricSampling);
            assert.ok(sample.metric.every(Number.isFinite), `${anomaly.id} metric finite`);
            assert.ok(sample.cometric.every(Number.isFinite), `${anomaly.id} cometric finite`);
        }
    } finally {
        registry.dispose();
        demo.chunkGraph.dispose();
    }
});

test('ray enters a non-player-traversable anomaly, propagates in R4, and exits into the destination slice', () => {
    const fixture = makeFixture({ traversable: false, transmission: 0.9, attenuationPerUnit: 0.001 });
    try {
        const initial = createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 0 },
            momentum: { x: 1, y: 0, z: 0, w: 0 },
            intensity: 1
        });
        const result = fixture.tracer.trace(initial, {
            sliceId: fixture.source.id,
            maxTransitions: 1,
            sliceTraceOptions: {
                maxPathLength: 2,
                initialStepSize: 0.025,
                maxStepSize: 0.05
            },
            anomalyTraceOptions: {
                maxPathLength: 20,
                initialStepSize: 0.025,
                maxStepSize: 0.05,
                absoluteTolerance: 1e-8,
                relativeTolerance: 1e-7
            }
        });

        assert.equal(result.transitions.length, 2);
        assert.deepEqual(result.transitions.map((entry) => entry.direction), ['into-anomaly', 'out-of-anomaly']);
        assert.equal(result.context.kind, 'slice');
        assert.equal(result.context.sliceId, fixture.destination.id);
        assert.equal(result.pathSegments.length, 3);
        assert.equal(result.pathSegments[0].result.status, 'anomaly-entry');
        assert.equal(result.pathSegments[1].result.status, 'anomaly-exit');
        assert.equal(result.pathSegments[1].result.event.sliceId, fixture.destination.id);
        assert.equal(result.pathSegments[2].kind, 'slice');
        close(result.finalState.position.w, 10, 1e-5);
        close(result.finalState.position.x, 2.5, 2e-2);
        close(result.finalState.momentum.w, 0, 1e-8);
        close(result.finalState.intensity, 0.9 * Math.exp(-0.001 * 10), 3e-3);
        assert.ok(result.pathSegments[1].result.diagnostics.relativeHamiltonianDrift < 1e-6);
        for (const transition of result.transitions) {
            assert.equal(transition.interface.preservedApertureTangentMomentum, true);
            assert.ok(transition.interface.hamiltonianDrift < 1e-6);
        }
    } finally {
        fixture.dispose();
    }
});

test('ray cannot enter an anomaly whose optical W budget is smaller than its slice separation', () => {
    const fixture = makeFixture({ maxWOpticalReach: 4 });
    try {
        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 0 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.source.id,
            sliceTraceOptions: { maxPathLength: 2, maxStepSize: 0.05 }
        });
        assert.equal(result.status, 'optical-range-limit');
        assert.equal(result.event.requiredWReach, 10);
        assert.equal(result.event.maximumWReach, 4);
    } finally {
        fixture.dispose();
    }
});


test('optical chunk candidates are exposed through the anomaly tracer', () => {
    const fixture = makeFixture({ traversable: false });
    try {
        const candidates = fixture.tracer.getOpticallyReachableChunkCandidates(
            fixture.source.id,
            fixture.anomaly.influence.center,
            { targetSliceId: fixture.destination.id, maxChunkDistance: 1 }
        );
        assert.ok(candidates.length > 0);
        assert.ok(candidates.every((entry) => entry.address.sliceId === fixture.destination.id));
        const destinationAddress = fixture.chunkGraph.getAddress(fixture.destination.id, ORIGIN3);
        assert.ok(candidates.some((entry) =>
            entry.address.chunkX === destinationAddress.chunkX &&
            entry.address.chunkZ === destinationAddress.chunkZ
        ));
    } finally {
        fixture.dispose();
    }
});

test('bidirectional optical transport also works from the destination slice', () => {
    const fixture = makeFixture({ traversable: false });
    try {
        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 10 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.destination.id,
            maxTransitions: 1,
            sliceTraceOptions: { maxPathLength: 2, maxStepSize: 0.05 },
            anomalyTraceOptions: { maxPathLength: 20, maxStepSize: 0.05 }
        });
        assert.deepEqual(result.transitions.map((entry) => entry.direction), [
            'into-anomaly', 'out-of-anomaly'
        ]);
        assert.equal(result.context.sliceId, fixture.source.id);
        assert.equal(result.pathSegments[1].result.event.sliceId, fixture.source.id);
        close(result.finalState.position.w, 0, 1e-5);
    } finally {
        fixture.dispose();
    }
});

test('one-way optical anomaly cannot be entered from its destination slice', () => {
    const fixture = makeFixture({ opticsBidirectional: false });
    try {
        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 10 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.destination.id,
            sliceTraceOptions: { maxPathLength: 2, maxStepSize: 0.05 }
        });
        assert.equal(result.transitions.length, 0);
        assert.equal(result.context.sliceId, fixture.destination.id);
        assert.equal(result.status, 'max-path-length');
    } finally {
        fixture.dispose();
    }
});

test('anomaly traversal terminates at a bounded region instead of escaping into arbitrary R4', () => {
    const fixture = makeFixture({
        region: {
            min: { x: -0.6, y: -2, z: -2, w: -1 },
            max: { x: 0.2, y: 2, z: 2, w: 11 }
        }
    });
    try {
        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 0 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.source.id,
            sliceTraceOptions: { maxPathLength: 2, maxStepSize: 0.05 },
            anomalyTraceOptions: { maxPathLength: 20, maxStepSize: 0.05 }
        });
        assert.equal(result.pathSegments[0].result.status, 'anomaly-entry');
        assert.equal(result.status, 'anomaly-boundary');
        assert.ok(result.finalState.position.x >= 0.2 - 1e-6);
        assert.ok(result.finalState.position.w < 10);
    } finally {
        fixture.dispose();
    }
});

test('reachability query reports disabled optical links without throwing', () => {
    const fixture = makeFixture({ opticsEnabled: false });
    try {
        const result = fixture.tracer.evaluateReachability(
            fixture.anomaly.id,
            { x: 0, y: 0, z: 0, w: 5 },
            fixture.destination.id
        );
        assert.equal(result.reachable, false);
        assert.equal(result.reason, 'optics-disabled');
    } finally {
        fixture.dispose();
    }
});

test('reachability query enforces one-way optical direction independently of player traversal', () => {
    const fixture = makeFixture({ traversable: true, opticsBidirectional: false });
    try {
        const forward = fixture.tracer.evaluateReachability(
            fixture.anomaly.id,
            { x: 0, y: 0, z: 0, w: 5 },
            fixture.destination.id
        );
        const reverse = fixture.tracer.evaluateReachability(
            fixture.anomaly.id,
            { x: 0, y: 0, z: 0, w: 5 },
            fixture.source.id
        );
        assert.equal(forward.reachable, true);
        assert.equal(reverse.reachable, false);
        assert.equal(reverse.reason, 'no-optical-topology-edge');
    } finally {
        fixture.dispose();
    }
});

test('reachability query consults optical chunk graph before declaring a cross-slice chunk reachable', () => {
    const fixture = makeFixture({ apertureRadius: 5 });
    try {
        const reachableAtEndpointChunk = fixture.tracer.evaluateReachability(
            fixture.anomaly.id,
            { x: 0, y: 0, z: 0, w: 5 },
            fixture.destination.id,
            { maxChunkDistance: 0 }
        );
        assert.equal(reachableAtEndpointChunk.reachable, true);
        assert.equal(reachableAtEndpointChunk.chunkReachability.kind, 'optical-cross-slice');

        const outsideEndpointChunk = fixture.tracer.evaluateReachability(
            fixture.anomaly.id,
            { x: -4.5, y: 0, z: 0, w: 5 },
            fixture.destination.id,
            { maxChunkDistance: 0 }
        );
        assert.equal(outsideEndpointChunk.reachable, false);
        assert.equal(outsideEndpointChunk.reason, 'spatial-distance-exceeded');
    } finally {
        fixture.dispose();
    }
});

test('slice entry is blocked when the optical destination chunk is not reachable', () => {
    const fixture = makeFixture({
        apertureRadius: 5,
        region: {
            min: { x: -8, y: -2, z: -2, w: -1 },
            max: { x: 8, y: 2, z: 2, w: 11 }
        },
        influence: {
            center: { x: 0, y: 0, z: 0, w: 5 },
            centerMode: 'fixed', innerRadius: 8, horizonRadius: 15, maxWReach: 10
        }
    });
    try {
        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -6, y: 0, z: 0, w: 0 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.source.id,
            chunkReachabilityOptions: { maxChunkDistance: 0 },
            sliceTraceOptions: { maxPathLength: 2, maxStepSize: 0.05 }
        });
        assert.equal(result.status, 'optical-entry-blocked');
        assert.equal(result.event.reachability.reason, 'spatial-distance-exceeded');
        assert.equal(result.transitions.length, 0);
    } finally {
        fixture.dispose();
    }
});

test('anomaly exit is held when the destination chunk is no longer optically reachable', () => {
    const fixture = makeFixture({ traversable: false });
    try {
        const originalReachability = fixture.chunkGraph.getOpticalReachability.bind(fixture.chunkGraph);
        let reachabilityCalls = 0;
        fixture.chunkGraph.getOpticalReachability = (...args) => {
            reachabilityCalls++;
            const result = originalReachability(...args);
            if (reachabilityCalls === 1) return result;
            return {
                ...result,
                reachable: false,
                spatialReachable: false,
                reason: 'test-destination-chunk-unavailable'
            };
        };

        const result = fixture.tracer.trace(createOpticalRayState({
            position: { x: -1, y: 0, z: 0, w: 0 },
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.source.id,
            maxTransitions: 1,
            sliceTraceOptions: { maxPathLength: 2, initialStepSize: 0.025, maxStepSize: 0.05 },
            anomalyTraceOptions: { maxPathLength: 20, initialStepSize: 0.025, maxStepSize: 0.05 }
        });

        assert.equal(reachabilityCalls, 2);
        assert.equal(result.status, 'optical-exit-blocked');
        assert.equal(result.event.reachability.reason, 'test-destination-chunk-unavailable');
        assert.equal(result.transitions.length, 1);
        assert.equal(result.context.kind, 'anomaly');
    } finally {
        fixture.dispose();
    }
});
