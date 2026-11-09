import assert from 'node:assert/strict';
import test from 'node:test';
import {
    evaluateAnomalyInfluence,
    evaluateChunkReachability,
    resolveAnomalyInfluence,
    smootherstep
} from '../src/world/fields/geometry/anomaly-influence-field.js';

function anomaly(overrides = {}) {
    return {
        id: 'field-test',
        type: 'slice-transition',
        region: {
            min: { x: -2, y: -2, z: -2, w: 0 },
            max: { x: 2, y: 2, z: 2, w: 10 }
        },
        influence: {
            center: { x: 0, y: 0, z: 0, w: 5 },
            horizonRadius: 10,
            innerRadius: 2,
            maxWReach: 75,
            maxWMovementScale: 1,
            ...overrides
        }
    };
}

test('smootherstep has zero and full freedom at the spherical radii', function radialEndpoints() {
    assert.equal(smootherstep(0), 0);
    assert.equal(smootherstep(1), 1);
    assert.equal(evaluateAnomalyInfluence(anomaly(), { x: 0, y: 0, z: 0, w: 15 }).freedom, 0);
    assert.equal(evaluateAnomalyInfluence(anomaly(), { x: 0, y: 0, z: 0, w: 7 }).freedom, 1);
});

test('freedom changes smoothly and monotonically through the transition shell', function smoothRadialProfile() {
    const field = anomaly();
    const samples = [15, 14, 13, 12, 11, 10, 9, 8, 7];
    const freedom = samples.map((w) => evaluateAnomalyInfluence(field, { x: 0, y: 0, z: 0, w }).freedom);
    for (let index = 1; index < freedom.length; index++) {
        assert.ok(freedom[index] >= freedom[index - 1]);
    }
    assert.ok(freedom[1] > 0);
    assert.ok(freedom[1] < 1);
    assert.equal(freedom.at(-1), 1);
    assert.equal(evaluateAnomalyInfluence(field, { x: 0, y: 0, z: 0, w: 11 }).freedom, 0.5);
});

test('ambient 4D distance includes XYZ as well as W displacement', function ambientRadialDistance() {
    const field = anomaly();
    const alongW = evaluateAnomalyInfluence(field, { x: 0, y: 0, z: 0, w: 10 });
    const diagonal = evaluateAnomalyInfluence(field, { x: 6, y: 0, z: 0, w: 10 });
    assert.ok(diagonal.distance > alongW.distance);
    assert.ok(diagonal.freedom < alongW.freedom);
});

test('resolved anomaly center is the ambient midpoint and default W reach is slice-normal span', function resolveAmbientCenter() {
    const input = {
        id: 'resolved',
        type: 'slice-transition',
        region: {
            min: { x: -1, y: -1, z: -1, w: 4 },
            max: { x: 1, y: 1, z: 1, w: 12 }
        }
    };
    const resolved = resolveAnomalyInfluence(
        input,
        { x: 2, y: 3, z: 4, w: 4 },
        { x: 12, y: 3, z: 4, w: 12 },
        { x: 0, y: 0, z: 0, w: 1 }
    );
    assert.deepEqual(resolved.influence.center, { x: 7, y: 3, z: 4, w: 8 });
    assert.equal(resolved.influence.maxWReach, 8);
    assert.ok(resolved.influence.horizonRadius > resolved.influence.innerRadius);
});

test('configured anomaly radii, W range, and player-stat multipliers remain independently tunable', function configurableInfluence() {
    const field = anomaly({
        horizonRadius: 12, innerRadius: 3, maxWReach: 48, maxWMovementScale: 0.8,
        freedomMultiplier: 0.5, reachMultiplier: 0.5
    });
    const point = { x: 0, y: 0, z: 0, w: 5 };
    const normal = evaluateAnomalyInfluence(field, point);
    const reduced = evaluateAnomalyInfluence(field, point, { freedomMultiplier: 0.5, reachMultiplier: 0.25 });
    assert.equal(normal.freedom, 0.5);
    assert.equal(normal.wReach, 12);
    assert.equal(normal.wMovementScale, 0.4);
    assert.equal(reduced.freedom, 0.25);
    assert.equal(reduced.wReach, 1.5);
    assert.equal(reduced.wMovementScale, 0.2);
});

test('chunk reachability requires both spatial proximity and sufficient W reach', function generalizedReachability() {
    const spatialBlocked = evaluateChunkReachability({
        spatialDistance: 2, spatialReach: 1, wDistance: 0, wReach: 100
    });
    const wBlocked = evaluateChunkReachability({
        spatialDistance: 0, spatialReach: 1, wDistance: 8, wReach: 7.99
    });
    const reached = evaluateChunkReachability({
        spatialDistance: 1, spatialReach: 1, wDistance: 8, wReach: 8
    });
    assert.equal(spatialBlocked.reachable, false);
    assert.equal(spatialBlocked.spatialReachable, false);
    assert.equal(wBlocked.reachable, false);
    assert.equal(wBlocked.wReachable, false);
    assert.equal(reached.reachable, true);
});

test('invalid field configuration is rejected instead of silently producing NaN reachability', function validateInfluence() {
    assert.throws(() => resolveAnomalyInfluence({
        id: 'invalid', type: 'slice-transition',
        region: { min: { x: -1, y: -1, z: -1, w: 0 }, max: { x: 1, y: 1, z: 1, w: 5 } },
        influence: { horizonRadius: 2, innerRadius: 3 }
    }, { x: 0, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 0, w: 5 }, { x: 0, y: 0, z: 0, w: 1 }), /horizon radius must exceed/);
});

test('endpoint-derived anomaly centers follow endpoint updates while fixed centers remain explicit', function centerUpdatePolicy() {
    const base = {
        id: 'moving-endpoints',
        type: 'slice-transition',
        region: {
            min: { x: -2, y: -2, z: -2, w: 0 },
            max: { x: 2, y: 2, z: 2, w: 10 }
        }
    };
    const first = resolveAnomalyInfluence(
        base,
        { x: 0, y: 0, z: 0, w: 0 },
        { x: 0, y: 0, z: 0, w: 10 },
        { x: 0, y: 0, z: 0, w: 1 }
    );
    const moved = resolveAnomalyInfluence(
        first,
        { x: 2, y: 0, z: 0, w: 0 },
        { x: 2, y: 0, z: 0, w: 10 },
        { x: 0, y: 0, z: 0, w: 1 }
    );
    assert.deepEqual(first.influence.center, { x: 0, y: 0, z: 0, w: 5 });
    assert.deepEqual(moved.influence.center, { x: 2, y: 0, z: 0, w: 5 });
    assert.equal(moved.influence.centerMode, 'endpoints');

    const fixed = resolveAnomalyInfluence({
        ...base,
        influence: {
            center: { x: 99, y: 0, z: 0, w: 5 }, centerMode: 'fixed'
        }
    }, { x: 2, y: 0, z: 0, w: 0 }, { x: 2, y: 0, z: 0, w: 10 },
    { x: 0, y: 0, z: 0, w: 1 });
    assert.deepEqual(fixed.influence.center, { x: 99, y: 0, z: 0, w: 5 });
    assert.equal(fixed.influence.centerMode, 'fixed');
});
