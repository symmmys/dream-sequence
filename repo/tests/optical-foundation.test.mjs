import test from 'node:test';
import assert from 'node:assert/strict';

import { PoincareMetric } from '../src/world/fields/geometry/poincare-metric.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { createSpatialAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import {
    createAnomalyOptics,
    createOpticalMaterial,
    evaluateOpticalAnomalyCoupling
} from '../src/world/fields/geometry/optical-contracts.js';
import {
    blendPositiveDefiniteMetrics3,
    blendScaledPositiveDefiniteMetrics3,
    geometricMeanMetricScale3,
    createOpticalMetricField,
    spatialTransformMetricProvider
} from '../src/world/fields/geometry/optical-metric.js';
import {
    createOpticalRayState,
    evaluateOpticalHamiltonian,
    normalizeOpticalMomentum,
    serializeOpticalRayResult,
    traceOpticalRay
} from '../src/world/fields/geometry/optical-ray-integrator.js';
import { createSliceFrame } from '../src/world/fields/geometry/spatial-4d.js';

const ORIGIN = { x: 0, y: 0, z: 0, w: 0 };
const IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function close(actual, expected, tolerance = 1e-6, message = '') {
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${message} expected ${expected}, received ${actual}`);
}

function assertVectorClose(actual, expected, tolerance = 1e-6) {
    for (const axis of ['x', 'y', 'z', 'w']) close(actual[axis], expected[axis], tolerance, axis);
}

function makeRay(position, momentum) {
    return createOpticalRayState({ position, momentum });
}

test('optical material and anomaly optics contracts validate independently of gameplay traversal', () => {
    const material = createOpticalMaterial({
        id: 'clear-glass', refractiveIndex: 1.5, transmission: 0.92, reflection: 0.08
    });
    assert.equal(material.refractiveIndex, 1.5);
    assert.equal(material.enabled, true);
    assert.throws(() => createOpticalMaterial({ id: 'invalid', transmission: 0.8, reflection: 0.4 }), /cannot sum above one/);

    const disabled = createAnomalyOptics();
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.bidirectional, true);
    assert.throws(() => createAnomalyOptics({ enabled: true }), /requires an explicit maxWOpticalReach/);

    const anomaly = createSpatialAnomaly({
        id: 'optical-independent',
        source: { sliceId: 'a', position: ORIGIN },
        destination: { sliceId: 'b', position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -2, y: -2, z: -2, w: -2 },
            max: { x: 2, y: 2, z: 2, w: 2 }
        },
        traversable: false,
        optics: { enabled: true, bidirectional: false, maxWOpticalReach: 12 }
    });
    assert.equal(anomaly.traversable, false);
    assert.equal(anomaly.optics.enabled, true);
    assert.equal(anomaly.optics.bidirectional, false);

    const legacy = createSpatialAnomaly({
        id: 'legacy-optics-disabled',
        type: 'bezier',
        source: { sliceId: 'a', position: ORIGIN },
        destination: { sliceId: 'b', position: { x: 1, y: 0, z: 0 } },
        centerline: [
            ORIGIN,
            { x: 0.3, y: 0, z: 0, w: 0.3 },
            { x: 0.7, y: 0, z: 0, w: 0.7 },
            { x: 1, y: 0, z: 0, w: 1 }
        ]
    });
    assert.equal(legacy.optics.enabled, false);
});

test('anomaly optics accepts endpoint, pointwise, and ambient metric sampling modes', () => {
    for (const metricSampling of ['endpoint', 'pointwise', 'ambient']) {
        assert.equal(createAnomalyOptics({ metricSampling }).metricSampling, metricSampling);
    }
    assert.throws(
        () => createAnomalyOptics({ metricSampling: 'camera-space' }),
        /Unsupported anomaly optical metric sampling mode/
    );
});

test('optical anomaly coupling reuses only the radial envelope and ignores player freedom modifiers', () => {
    const anomaly = {
        influence: {
            center: ORIGIN,
            innerRadius: 2,
            horizonRadius: 10,
            freedomMultiplier: 0,
            maxWReach: 100
        },
        optics: { enabled: true, bidirectional: true, maxWOpticalReach: 40, wCouplingScale: 0.75 }
    };
    const inner = evaluateOpticalAnomalyCoupling(anomaly, ORIGIN);
    const outside = evaluateOpticalAnomalyCoupling(anomaly, { x: 10, y: 0, z: 0, w: 0 });
    assert.equal(inner.coupling, 0.75);
    assert.equal(inner.opticalWReach, 30);
    assert.equal(outside.coupling, 0);
    assert.equal(outside.opticalWReach, 0);
});

test('optical profile bias changes the shell shape without changing horizon or core endpoints', () => {
    const base = {
        influence: { center: ORIGIN, innerRadius: 2, horizonRadius: 10 },
        optics: createAnomalyOptics({ enabled: true, maxWOpticalReach: 40, wCouplingProfileBias: 1 })
    };
    const early = {
        ...base,
        optics: createAnomalyOptics({ enabled: true, maxWOpticalReach: 40, wCouplingProfileBias: 0.006 })
    };
    const horizon = { x: 10, y: 0, z: 0, w: 0 };
    const shell = { x: 6, y: 0, z: 0, w: 0 };
    assert.equal(evaluateOpticalAnomalyCoupling(early, horizon).coupling, 0);
    assert.equal(evaluateOpticalAnomalyCoupling(early, ORIGIN).coupling, 1);
    assert.ok(evaluateOpticalAnomalyCoupling(early, shell).coupling >
        evaluateOpticalAnomalyCoupling(base, shell).coupling);
});

test('Euclidean constant optical metric produces a straight ray and constant canonical momentum', () => {
    const field = createOpticalMetricField({ wCoupling: 1 });
    const initial = makeRay(ORIGIN, { x: 1, y: 0.25, z: -0.1, w: 0.2 });
    const result = traceOpticalRay(field, initial, {
        maxPathLength: 1,
        initialStepSize: 0.025,
        maxStepSize: 0.05
    });
    assert.equal(result.status, 'max-path-length');
    assert.ok(result.samples.length > 2);
    assertVectorClose(result.finalState.momentum, initial.momentum, 1e-10);
    const delta = {
        x: result.finalState.position.x,
        y: result.finalState.position.y,
        z: result.finalState.position.z,
        w: result.finalState.position.w
    };
    const ratio = delta.y / delta.x;
    close(ratio, 0.25, 1e-8);
    close(delta.z / delta.x, -0.1, 1e-8);
    close(delta.w / delta.x, 0.2, 1e-8);
    assert.ok(result.diagnostics.relativeHamiltonianDrift < 1e-10);
});

test('uniform refractive index preserves the geometric ray while scaling optical travel time', () => {
    const vacuum = createOpticalMetricField({ refractiveIndex: 1, wCoupling: 0 });
    const glass = createOpticalMetricField({ refractiveIndex: 2, wCoupling: 0 });
    const vacuumRay = makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 0 });
    const glassMomentum = normalizeOpticalMomentum(glass, ORIGIN, { x: 1, y: 0, z: 0, w: 0 });
    const vacuumResult = traceOpticalRay(vacuum, vacuumRay, { maxPathLength: 0.5, maxStepSize: 0.05 });
    const glassResult = traceOpticalRay(glass, makeRay(ORIGIN, glassMomentum), {
        maxPathLength: 1,
        maxStepSize: 0.05
    });
    close(vacuumResult.finalState.position.x, 0.5, 1e-7);
    close(glassResult.finalState.position.x, 0.5, 1e-7);
    close(vacuumResult.finalState.position.y, 0);
    close(glassResult.finalState.position.y, 0);
    close(vacuumResult.finalState.travelTime, 0.5, 1e-7);
    close(glassResult.finalState.travelTime, 1, 1e-7);
});

test('a graded refractive-index field bends rays while conserving the Hamiltonian', () => {
    const field = createOpticalMetricField({
        refractiveIndexAt: (position) => 1 + 0.5 * position.y,
        wCoupling: 0
    });
    const result = traceOpticalRay(field, makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 0 }), {
        maxPathLength: 1,
        initialStepSize: 0.01,
        maxStepSize: 0.02,
        gradientStep: 1e-4
    });
    assert.ok(result.finalState.position.y > 0.1, 'ray should bend toward higher refractive index');
    assert.ok(result.finalState.momentum.y > 0.1, 'transverse canonical momentum should evolve');
    assert.ok(result.diagnostics.relativeHamiltonianDrift < 1e-7);
});

test('SpatialTransform metric provider supplies authoritative slice geometry to optics', () => {
    const transform = new SpatialTransform({ geometry: 'euclidean' });
    const field = createOpticalMetricField({
        sliceMetricAt: spatialTransformMetricProvider(transform),
        wCoupling: 0
    });
    const sample = field.sample({ x: 2, y: -1, z: 4, w: 0 });
    assert.deepEqual(sample.tangentMetric, IDENTITY3);
    assert.equal(sample.isConstrained, true);
});

test('scale-balanced optical metric blending remains SPD across very different chart units', () => {
    const tiny = [1e-10, 0, 0, 0, 2e-10, 0, 0, 0, 3e-10];
    const large = [2e6, 0, 0, 0, 4e6, 0, 0, 0, 6e6];
    const tinyScale = geometricMeanMetricScale3(tiny);
    const largeScale = geometricMeanMetricScale3(large);
    const blended = blendScaledPositiveDefiniteMetrics3([tiny, large], [0.5, 0.5]);
    const blendedScale = geometricMeanMetricScale3(blended);

    close(blendedScale, Math.sqrt(tinyScale * largeScale), 1e-10,
        'determinant scale should interpolate geometrically');
    assert.ok(blended.every(Number.isFinite));
    assert.ok(blended[0] > 0 && blended[4] > 0 && blended[8] > 0);
    assert.ok(blended[0] * blended[4] - blended[1] * blended[3] > 0);
});

test('small but well-conditioned Poincare world metrics remain invertible for optical transport', () => {
    const transform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 10000,
        bounds: {
            minX: -20000, maxX: 20000,
            minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000,
            characteristicLength: 0.25
        }
    });
    const point = { x: 18, y: 2.5, z: 0 };
    const metric = transform.metricAtWorld(point).values;
    assert.ok(Math.max(...metric.map(Math.abs)) < 1e-8,
        'fixture should exercise the small world-coordinate metric used by the live Main World');

    const field = createOpticalMetricField({
        sliceMetricAt: () => metric,
        wCoupling: 0
    });
    const sample = field.sample({ ...point, w: 80 });
    assert.ok(sample.cometric.every(Number.isFinite));
    assert.ok(sample.cometric.some((value) => value > 1e8));
});

test('the optical integrator terminates cleanly at an explicit metric-domain boundary', () => {
    const field = createOpticalMetricField({
        wCoupling: 0,
        containsPosition(position) { return position.x < 0.25; }
    });
    const result = traceOpticalRay(field, makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 0 }), {
        maxPathLength: 1,
        initialStepSize: 0.1,
        maxStepSize: 0.1,
        minStepSize: 1e-5
    });
    assert.equal(result.status, 'domain-boundary');
    assert.equal(result.event.kind, 'chart-domain-boundary');
    assert.ok(result.finalState.position.x < 0.25);
    assert.ok(result.diagnostics.relativeHamiltonianDrift < 1e-10);
});

test('zero W coupling constrains normal propagation without non-finite metric entries', () => {
    const field = createOpticalMetricField({ wCoupling: 0 });
    const sample = field.sample(ORIGIN);
    assert.equal(sample.isConstrained, true);
    assert.equal(sample.metric, null);
    assert.ok(sample.cometric.every(Number.isFinite));
    close(sample.cometric[15], 0);
    assert.throws(() => normalizeOpticalMomentum(field, ORIGIN, { x: 0, y: 0, z: 0, w: 1 }), /no component in an available propagation direction/);

    const result = traceOpticalRay(field, makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 5 }), {
        maxPathLength: 0.75,
        maxStepSize: 0.05
    });
    close(result.finalState.position.w, 0, 1e-10);
    close(result.finalState.position.x, 0.75, 1e-7);
});

test('constant partial W coupling permits controlled normal ray propagation', () => {
    const field = createOpticalMetricField({ wCoupling: 0.5 });
    const momentum = normalizeOpticalMomentum(field, ORIGIN, { x: 0, y: 0, z: 0, w: 1 });
    const result = traceOpticalRay(field, makeRay(ORIGIN, momentum), {
        maxPathLength: 1,
        maxStepSize: 0.05
    });
    close(result.finalState.position.x, 0, 1e-9);
    close(result.finalState.position.y, 0, 1e-9);
    close(result.finalState.position.z, 0, 1e-9);
    close(result.finalState.position.w, 0.5, 1e-7);
});

test('increasing W optical coupling smoothly lowers normal optical cost', () => {
    const constrained = createOpticalMetricField({ wCoupling: 0 });
    const weak = createOpticalMetricField({ wCoupling: 0.25 });
    const full = createOpticalMetricField({ wCoupling: 1 });
    close(constrained.sample(ORIGIN).cometric[15], 0);
    close(weak.sample(ORIGIN).cometric[15], 0.0625);
    close(full.sample(ORIGIN).cometric[15], 1);
    close(weak.sample(ORIGIN).metric[15], 16);
    close(full.sample(ORIGIN).metric[15], 1);
});

test('optical metric is symmetric positive definite for rotated frames and anisotropic slice metrics', () => {
    const s = Math.SQRT1_2;
    const frame = createSliceFrame({
        origin: ORIGIN,
        axes: [
            { x: s, y: 0, z: 0, w: s },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: -s, y: 0, z: 0, w: s }
        ],
        normal: { x: 0, y: 0, z: -1, w: 0 }
    });
    const baseMetric = [2, 0.2, 0, 0.2, 1.5, 0.1, 0, 0.1, 1.25];
    const field = createOpticalMetricField({
        sliceFrame: frame,
        sliceMetricAt: () => baseMetric,
        refractiveIndex: 1.3,
        wCoupling: 0.4
    });
    const sample = field.sample({ x: 0.1, y: 0.2, z: -0.1, w: 0.3 });
    assert.equal(sample.metric.length, 16);
    assert.equal(sample.cometric.length, 16);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            close(sample.metric[row * 4 + column], sample.metric[column * 4 + row], 1e-9);
            close(sample.cometric[row * 4 + column], sample.cometric[column * 4 + row], 1e-9);
            let product = 0;
            for (let k = 0; k < 4; k++) {
                product += sample.metric[row * 4 + k] * sample.cometric[k * 4 + column];
            }
            close(product, row === column ? 1 : 0, 1e-8);
        }
    }
});

test('positive-definite slice metrics blend by normalized convex weights', () => {
    const blended = blendPositiveDefiniteMetrics3([
        IDENTITY3,
        [4, 0, 0, 0, 4, 0, 0, 0, 4]
    ], [1, 3]);
    close(blended[0], 3.25);
    close(blended[4], 3.25);
    close(blended[8], 3.25);
    assert.throws(() => blendPositiveDefiniteMetrics3([IDENTITY3], [0]), /positive sum/);
});

test('Poincare radial ray recovers the known geodesic through the ball origin', () => {
    const poincare = new PoincareMetric(-1);
    const field = createOpticalMetricField({
        sliceMetricAt: (position) => poincare.metricAt(position),
        wCoupling: 0,
        gradientStep: 2e-5
    });
    const result = traceOpticalRay(field, makeRay(ORIGIN, { x: 2, y: 0, z: 0, w: 0 }), {
        maxPathLength: 0.8,
        initialStepSize: 0.005,
        maxStepSize: 0.01,
        gradientStep: 2e-5,
        absoluteTolerance: 1e-10,
        relativeTolerance: 1e-9
    });
    const expectedRadius = Math.tanh(0.4);
    close(result.finalState.position.x, expectedRadius, 2e-4);
    close(result.finalState.position.y, 0, 1e-8);
    close(result.finalState.position.z, 0, 1e-8);
    close(result.finalState.position.w, 0, 1e-8);
    assert.ok(result.diagnostics.relativeHamiltonianDrift < 2e-4);
});

test('invalid Poincare chart samples are rejected rather than silently clipped', () => {
    const poincare = new PoincareMetric(-1);
    const field = createOpticalMetricField({ sliceMetricAt: (position) => poincare.metricAt(position) });
    assert.throws(() => field.sample({ x: 1, y: 0, z: 0, w: 0 }), /outside the open Poincare ball/);
});

test('ray debug serialization is deterministic and contains no runtime objects', () => {
    const field = createOpticalMetricField({ wCoupling: 1 });
    const initial = makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 0 });
    const first = traceOpticalRay(field, initial, { maxPathLength: 0.2, maxStepSize: 0.05 });
    const second = traceOpticalRay(field, initial, { maxPathLength: 0.2, maxStepSize: 0.05 });
    const serialized = serializeOpticalRayResult(first);
    assert.equal(serialized, serializeOpticalRayResult(second));
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.samples.length, first.samples.length);
    assert.deepEqual(parsed.finalState.position, [0.2, 0, 0, 0]);
});

test('ray state, metric callback, and integration options reject invalid numeric input', () => {
    assert.throws(() => createOpticalRayState({ position: ORIGIN, momentum: { x: NaN, y: 0, z: 0, w: 0 } }), /finite four-dimensional vector/);
    assert.throws(() => createOpticalMetricField({ wCoupling: 1.1 }).sample(ORIGIN), /between zero and one/);
    const field = createOpticalMetricField();
    assert.throws(() => traceOpticalRay(field, makeRay(ORIGIN, { x: 1, y: 0, z: 0, w: 0 }), { minStepSize: 1, initialStepSize: 0.1 }), /min <= initial <= max/);
    assert.throws(() => evaluateOpticalHamiltonian({}, ORIGIN, { x: 1, y: 0, z: 0, w: 0 }), /compatible OpticalMetricField/);
});
