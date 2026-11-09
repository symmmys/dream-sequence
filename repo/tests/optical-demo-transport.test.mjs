import test from 'node:test';
import assert from 'node:assert/strict';

import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import { SliceWorldRegistry } from '../src/world/slice-world-registry.js';
import { OpticalSceneRegistry } from '../src/world/fields/geometry/optical-scene-registry.js';
import { createAnomalyOpticalTracer } from '../src/world/fields/geometry/optical-anomaly-tracer.js';
import { ambientToSlice, sliceToAmbient } from '../src/world/fields/geometry/spatial-4d.js';
import { createOpticalRayState, normalizeOpticalMomentum } from '../src/world/fields/geometry/optical-ray-integrator.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { createSliceOpticalField } from '../src/world/fields/geometry/optical-slice-tracer.js';

const IDENTITY_METRIC = { values: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
const IDENTITY_TRANSFORM = Object.freeze({
    metricAtWorld() { return IDENTITY_METRIC; }
});

function createDemoOpticalFixture() {
    const mainWorld = {
        terrain: { sampleAt(x, z) { return { x, y: 1.25, z }; } },
        spatialTransform: { geometryName: 'euclidean', metricAtWorld: IDENTITY_TRANSFORM.metricAtWorld },
        chunkSize: 2000
    };
    const demo = createGeometryDemoTopology(mainWorld);
    const sliceRegistry = new SliceWorldRegistry();
    for (const slice of [demo.sourceSlice, demo.hypercubeSlice, demo.mainSlice]) {
        sliceRegistry.register(slice, { spatialTransform: IDENTITY_TRANSFORM });
    }
    const sceneRegistry = new OpticalSceneRegistry();
    const tracer = createAnomalyOpticalTracer({
        topology: demo.topology,
        sliceRegistry,
        sceneRegistry,
        chunkGraph: demo.chunkGraph
    });
    return {
        demo,
        sliceRegistry,
        sceneRegistry,
        tracer,
        dispose() {
            sceneRegistry.dispose();
            sliceRegistry.dispose();
            demo.chunkGraph.dispose();
        }
    };
}

function traceFromEndpoint(fixture, anomaly, side) {
    const endpoint = anomaly[side];
    const slice = fixture.demo.topology.getSlice(endpoint.sliceId);
    const apertureRadius = anomaly.optics.apertureRadius;
    const start = sliceToAmbient(slice.frame, {
        x: endpoint.position.x - apertureRadius - 1,
        y: endpoint.position.y,
        z: endpoint.position.z
    });
    return fixture.tracer.trace(createOpticalRayState({
        position: start,
        momentum: { x: 1, y: 0, z: 0, w: 0 }
    }), {
        sliceId: slice.id,
        maxTransitions: 1,
        sliceTraceOptions: {
            maxPathLength: 1.05,
            initialStepSize: 0.025,
            maxStepSize: 0.05
        },
        anomalyTraceOptions: {
            maxPathLength: 200,
            initialStepSize: 0.05,
            maxStepSize: 0.1,
            absoluteTolerance: 1e-7,
            relativeTolerance: 1e-6,
            maxSteps: 12000
        }
    });
}

test('all three demo anomalies transmit optical rays in both configured directions', () => {
    const fixture = createDemoOpticalFixture();
    try {
        const { corridor, hypercubeCorridor, hypercubeMainCorridor } = fixture.demo;
        assert.equal(corridor.optics.entryRadialBias, 0.5);
        assert.equal(hypercubeCorridor.optics.entryRadialBias, 4);
        assert.equal(hypercubeMainCorridor.optics.entryRadialBias, 1);

        for (const anomaly of [corridor, hypercubeCorridor, hypercubeMainCorridor]) {
            for (const side of ['source', 'destination']) {
                const result = traceFromEndpoint(fixture, anomaly, side);
                const targetSliceId = anomaly[side === 'source' ? 'destination' : 'source'].sliceId;
                const anomalySegment = result.pathSegments.find((segment) => segment.kind === 'anomaly');

                assert.ok(anomalySegment, `${anomaly.id} ${side}: anomaly segment exists`);
                assert.equal(anomalySegment.result.status, 'anomaly-exit',
                    `${anomaly.id} ${side}: optical ray exits the bounded 4D region`);
                assert.equal(anomalySegment.result.event.kind, 'anomaly-exit');
                assert.equal(anomalySegment.result.event.sliceId, targetSliceId);
                assert.deepEqual(result.transitions.map((entry) => entry.direction), [
                    'into-anomaly', 'out-of-anomaly'
                ]);
                assert.equal(result.context.kind, 'slice');
                assert.equal(result.context.sliceId, targetSliceId);
                assert.ok(anomalySegment.result.diagnostics.relativeHamiltonianDrift < 2e-5,
                    `${anomaly.id} ${side}: Hamiltonian remains conserved`);
                assert.ok(result.transitions.every((entry) =>
                    entry.interface.preservedApertureTangentMomentum &&
                    entry.interface.hamiltonianDrift < 1e-5
                ));

                const targetSlice = fixture.demo.topology.getSlice(targetSliceId);
                const destinationLocal = ambientToSlice(targetSlice.frame, result.finalState.position);
                assert.ok(Math.abs(destinationLocal.normalOffset) < 1e-6,
                    `${anomaly.id} ${side}: ray continues on the destination slice`);
            }
        }
    } finally {
        fixture.dispose();
    }
});

test('one optical ray can traverse two explicitly connected anomalies in sequence', () => {
    const fixture = createDemoOpticalFixture();
    try {
        const anomaly = fixture.demo.hypercubeCorridor;
        const endpoint = anomaly.source;
        const start = sliceToAmbient(fixture.demo.hypercubeSlice.frame, {
            x: endpoint.position.x - anomaly.optics.apertureRadius - 1,
            y: endpoint.position.y,
            z: endpoint.position.z
        });
        const result = fixture.tracer.trace(createOpticalRayState({
            position: start,
            momentum: { x: 1, y: 0, z: 0, w: 0 }
        }), {
            sliceId: fixture.demo.hypercubeSlice.id,
            maxTransitions: 2,
            sliceTraceOptions: {
                maxPathLength: 40,
                initialStepSize: 0.05,
                maxStepSize: 0.1
            },
            anomalyTraceOptions: {
                maxPathLength: 200,
                initialStepSize: 0.05,
                maxStepSize: 0.1,
                absoluteTolerance: 1e-7,
                relativeTolerance: 1e-6,
                maxSteps: 30000
            }
        });

        assert.equal(result.context.kind, 'slice');
        assert.equal(result.context.sliceId, fixture.demo.mainSlice.id);
        assert.deepEqual(result.transitions.map((entry) => entry.direction), [
            'into-anomaly', 'out-of-anomaly', 'into-anomaly', 'out-of-anomaly'
        ]);
        assert.deepEqual(result.transitions.filter((entry) => entry.direction === 'into-anomaly')
            .map((entry) => entry.anomalyId), [
            fixture.demo.hypercubeCorridor.id,
            fixture.demo.corridor.id
        ]);
        assert.deepEqual(result.pathSegments.map((segment) => segment.kind), [
            'slice', 'anomaly', 'slice', 'anomaly', 'slice'
        ]);
        assert.equal(result.pathSegments[1].result.status, 'anomaly-exit');
        assert.equal(result.pathSegments[3].result.status, 'anomaly-exit');
        assert.ok(result.transitions.every((entry) =>
            entry.interface.preservedApertureTangentMomentum &&
            entry.interface.hamiltonianDrift < 1e-5
        ));
        assert.equal(result.finalState.position.w, fixture.demo.mainSlice.frame.origin.w);
    } finally {
        fixture.dispose();
    }
});


test('live Main World Poincare ray crosses the anomaly into the chamber using aperture-local metric matching', () => {
    const mainTransform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 10000,
        bounds: {
            minX: -20000, maxX: 20000,
            minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000,
            characteristicLength: 0.25
        }
    });
    const chamberTransform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        visualScaleGamma: 0.72,
        maxVisualScale: 3.5,
        bounds: {
            minX: -46, maxX: 46, minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            characteristicLength: 0.7,
            boundaryEpsilon: 1e-5
        }
    });
    const hypercubeTransform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
    const terrain = { sampleAt(x, z) { return { x, y: 0, z }; } };
    const demo = createGeometryDemoTopology({
        terrain, spatialTransform: mainTransform, chunkSize: 2000
    });
    const sliceRegistry = new SliceWorldRegistry();
    sliceRegistry.register(demo.sourceSlice, { spatialTransform: chamberTransform });
    sliceRegistry.register(demo.hypercubeSlice, { spatialTransform: hypercubeTransform });
    sliceRegistry.register(demo.mainSlice, { spatialTransform: mainTransform });
    const sceneRegistry = new OpticalSceneRegistry();
    const tracer = createAnomalyOpticalTracer({
        topology: demo.topology, sliceRegistry, sceneRegistry, chunkGraph: demo.chunkGraph
    });

    try {
        const anomaly = demo.corridor;
        const endpoint = anomaly.destination;
        const start = sliceToAmbient(demo.mainSlice.frame, {
            x: endpoint.position.x - anomaly.optics.apertureRadius - 1,
            y: endpoint.position.y,
            z: endpoint.position.z
        });
        const field = createSliceOpticalField(demo.mainSlice, mainTransform, { gradientStep: 0.01 });
        const momentum = normalizeOpticalMomentum(field, start, { x: 1, y: 0, z: 0, w: 0 });
        const result = tracer.trace(createOpticalRayState({ position: start, momentum }), {
            sliceId: demo.mainSlice.id,
            maxTransitions: 1,
            sliceMetricOptions: { gradientStep: 0.01 },
            sliceTraceOptions: {
                maxPathLength: 0.00005,
                initialStepSize: 1e-7,
                minStepSize: 1e-14,
                maxStepSize: 1e-5,
                gradientStep: 0.01,
                absoluteTolerance: 1e-9,
                relativeTolerance: 1e-7,
                maxSteps: 20000
            },
            anomalyMetricOptions: { gradientStep: 0.01 },
            anomalyTraceOptions: {
                maxPathLength: 200,
                initialStepSize: 0.01,
                maxStepSize: 0.05,
                minStepSize: 1e-9,
                absoluteTolerance: 1e-7,
                relativeTolerance: 1e-6,
                maxSteps: 30000
            }
        });

        assert.deepEqual(result.transitions.map((entry) => entry.direction), [
            'into-anomaly', 'out-of-anomaly'
        ]);
        assert.equal(result.transitions[0].anomalyId, anomaly.id);
        assert.equal(result.context.kind, 'slice');
        assert.equal(result.context.sliceId, demo.sourceSlice.id);
        const anomalySegment = result.pathSegments.find((segment) => segment.kind === 'anomaly');
        assert.equal(anomalySegment.result.event.kind, 'anomaly-exit');
        assert.equal(anomalySegment.result.event.sliceId, demo.sourceSlice.id);
        assert.ok(anomalySegment.result.diagnostics.relativeHamiltonianDrift < 2e-5);
        assert.ok(result.transitions.every((entry) =>
            entry.interface.preservedApertureTangentMomentum && entry.interface.hamiltonianDrift < 1e-5
        ));
        const entryHamiltonian = result.transitions[0].interface.outgoingHamiltonian;
        assert.ok(Math.abs(anomalySegment.result.diagnostics.initialHamiltonian - entryHamiltonian) <=
            1e-8 * Math.max(1, entryHamiltonian),
        'the anomaly integrator starts with the same aperture-local metric used by interface transfer');
    } finally {
        sceneRegistry.dispose();
        sliceRegistry.dispose();
        demo.chunkGraph.dispose();
    }
});

test('live Euclidean-to-Poincare and Poincare-to-Euclidean rays cross the 75-W ambient anomaly', () => {
    const mainTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 10000,
        bounds: {
            minX: -20000, maxX: 20000,
            minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000,
            characteristicLength: 0.25
        }
    });
    const chamberTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 24, visualScaleGamma: 0.72,
        maxVisualScale: 3.5,
        bounds: {
            minX: -46, maxX: 46, minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            characteristicLength: 0.7, boundaryEpsilon: 1e-5
        }
    });
    const hypercubeTransform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
    const terrain = { sampleAt(x, z) { return { x, y: 1.25, z }; } };
    const demo = createGeometryDemoTopology({ terrain, spatialTransform: mainTransform, chunkSize: 2000 });
    const sliceRegistry = new SliceWorldRegistry();
    sliceRegistry.register(demo.sourceSlice, { spatialTransform: chamberTransform });
    sliceRegistry.register(demo.hypercubeSlice, { spatialTransform: hypercubeTransform });
    sliceRegistry.register(demo.mainSlice, { spatialTransform: mainTransform });
    const sceneRegistry = new OpticalSceneRegistry();
    const tracer = createAnomalyOpticalTracer({
        topology: demo.topology, sliceRegistry, sceneRegistry, chunkGraph: demo.chunkGraph
    });

    try {
        const anomaly = demo.hypercubeCorridor;
        assert.equal(anomaly.optics.metricSampling, 'ambient');
        for (const side of ['source', 'destination']) {
            const endpoint = anomaly[side];
            const slice = demo.topology.getSlice(endpoint.sliceId);
            const transform = sliceRegistry.require(slice.id).spatialTransform;
            const start = sliceToAmbient(slice.frame, {
                x: endpoint.position.x - anomaly.optics.apertureRadius - 0.02,
                y: endpoint.position.y,
                z: endpoint.position.z
            });
            const sliceField = createSliceOpticalField(slice, transform, { gradientStep: 1e-5 });
            const momentum = normalizeOpticalMomentum(sliceField, start, { x: 1, y: 0, z: 0, w: 0 });
            const result = tracer.trace(createOpticalRayState({ position: start, momentum }), {
                sliceId: slice.id,
                maxTransitions: 1,
                sliceMetricOptions: { gradientStep: 1e-5 },
                sliceTraceOptions: {
                    maxPathLength: 0.05,
                    initialStepSize: 0.001,
                    minStepSize: 1e-10,
                    maxStepSize: 0.002,
                    gradientStep: 1e-5,
                    absoluteTolerance: 1e-9,
                    relativeTolerance: 1e-7,
                    maxSteps: 10000
                },
                anomalyMetricOptions: { gradientStep: 1e-5 },
                anomalyTraceOptions: {
                    maxPathLength: 200,
                    initialStepSize: 0.05,
                    minStepSize: 1e-8,
                    maxStepSize: 0.1,
                    gradientStep: 1e-5,
                    absoluteTolerance: 1e-7,
                    relativeTolerance: 1e-5,
                    maxSteps: 20000
                }
            });

            const targetSliceId = side === 'source' ? demo.sourceSlice.id : demo.hypercubeSlice.id;
            const anomalySegment = result.pathSegments.find((segment) => segment.kind === 'anomaly');
            assert.deepEqual(result.transitions.map((entry) => entry.direction), [
                'into-anomaly', 'out-of-anomaly'
            ], `${side}: ray crosses both apertures`);
            assert.equal(result.context.kind, 'slice');
            assert.equal(result.context.sliceId, targetSliceId);
            assert.equal(anomalySegment.result.event.kind, 'anomaly-exit');
            assert.equal(anomalySegment.result.event.sliceId, targetSliceId);
            assert.ok(anomalySegment.result.diagnostics.relativeHamiltonianDrift < 1e-4);
            const entryHamiltonian = result.transitions[0].interface.outgoingHamiltonian;
            assert.ok(Math.abs(anomalySegment.result.diagnostics.initialHamiltonian - entryHamiltonian) <=
                1e-8 * Math.max(1, entryHamiltonian));
            assert.ok(result.transitions.every((entry) =>
                entry.interface.preservedApertureTangentMomentum && entry.interface.hamiltonianDrift < 1e-5
            ));
        }
    } finally {
        sceneRegistry.dispose();
        sliceRegistry.dispose();
        demo.chunkGraph.dispose();
    }
});

test('live Euclidean-to-Poincare and Poincare-to-Euclidean rays cross the direct +5-W anomaly', () => {
    const mainTransform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 10000,
        bounds: {
            minX: -20000, maxX: 20000,
            minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000,
            characteristicLength: 0.25
        }
    });
    const chamberTransform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        visualScaleGamma: 0.72,
        maxVisualScale: 3.5,
        bounds: {
            minX: -46, maxX: 46, minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            characteristicLength: 0.7,
            boundaryEpsilon: 1e-5
        }
    });
    const hypercubeTransform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
    const terrain = { sampleAt(x, z) { return { x, y: 0, z }; } };
    const demo = createGeometryDemoTopology({ terrain, spatialTransform: mainTransform, chunkSize: 2000 });
    const sliceRegistry = new SliceWorldRegistry();
    sliceRegistry.register(demo.sourceSlice, { spatialTransform: chamberTransform });
    sliceRegistry.register(demo.hypercubeSlice, { spatialTransform: hypercubeTransform });
    sliceRegistry.register(demo.mainSlice, { spatialTransform: mainTransform });
    const sceneRegistry = new OpticalSceneRegistry();
    const tracer = createAnomalyOpticalTracer({
        topology: demo.topology, sliceRegistry, sceneRegistry, chunkGraph: demo.chunkGraph
    });

    try {
        const anomaly = demo.hypercubeMainCorridor;
        for (const side of ['source', 'destination']) {
            const endpoint = anomaly[side];
            const slice = demo.topology.getSlice(endpoint.sliceId);
            const transform = sliceRegistry.require(slice.id).spatialTransform;
            const start = sliceToAmbient(slice.frame, {
                x: endpoint.position.x - anomaly.optics.apertureRadius - 0.02,
                y: endpoint.position.y,
                z: endpoint.position.z
            });
            const field = createSliceOpticalField(slice, transform, { gradientStep: 1e-5 });
            const momentum = normalizeOpticalMomentum(field, start, { x: 1, y: 0, z: 0, w: 0 });
            const isMainWorld = slice.id === demo.mainSlice.id;
            const result = tracer.trace(createOpticalRayState({ position: start, momentum }), {
                sliceId: slice.id,
                maxTransitions: 1,
                sliceMetricOptions: { gradientStep: 1e-5 },
                sliceTraceOptions: isMainWorld ? {
                    maxPathLength: 1e-6,
                    initialStepSize: 1e-8,
                    minStepSize: 1e-14,
                    maxStepSize: 1e-8,
                    gradientStep: 1e-5,
                    absoluteTolerance: 1e-9,
                    relativeTolerance: 1e-7,
                    maxSteps: 10000
                } : {
                    maxPathLength: 0.05,
                    initialStepSize: 0.001,
                    minStepSize: 1e-10,
                    maxStepSize: 0.002,
                    gradientStep: 1e-5,
                    absoluteTolerance: 1e-9,
                    relativeTolerance: 1e-7,
                    maxSteps: 10000
                },
                anomalyMetricOptions: { gradientStep: 1e-5 },
                anomalyTraceOptions: {
                    maxPathLength: 200,
                    initialStepSize: 0.005,
                    minStepSize: 1e-9,
                    maxStepSize: 0.02,
                    gradientStep: 1e-5,
                    absoluteTolerance: 1e-8,
                    relativeTolerance: 1e-6,
                    maxSteps: 40000
                }
            });

            const destinationSliceId = side === 'source' ? demo.mainSlice.id : demo.hypercubeSlice.id;
            assert.equal(result.transitions.length, 2, `${side}: both optical interfaces are crossed`);
            assert.deepEqual(result.transitions.map((entry) => entry.direction), [
                'into-anomaly', 'out-of-anomaly'
            ]);
            assert.equal(result.context.kind, 'slice');
            assert.equal(result.context.sliceId, destinationSliceId);
            const anomalySegment = result.pathSegments.find((segment) => segment.kind === 'anomaly');
            assert.equal(anomalySegment.result.event.kind, 'anomaly-exit');
            assert.equal(anomalySegment.result.event.sliceId, destinationSliceId);
            assert.ok(anomalySegment.result.diagnostics.relativeHamiltonianDrift < 1e-4);
            assert.ok(result.transitions.every((entry) =>
                entry.interface.preservedApertureTangentMomentum &&
                entry.interface.hamiltonianDrift < 1e-5
            ));
        }
    } finally {
        sceneRegistry.dispose();
        sliceRegistry.dispose();
        demo.chunkGraph.dispose();
    }
});

