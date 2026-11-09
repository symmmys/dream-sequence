import assert from 'node:assert/strict';
import test from 'node:test';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';

test('Poincare render-space camera positions are clamped strictly inside the open ball', function clampPoincareRenderPosition() {
    const transform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        bounds: {
            minX: -10, maxX: 10,
            minY: -10, maxY: 10,
            minZ: -10, maxZ: 10,
            characteristicLength: 1,
            boundaryEpsilon: 1e-5
        }
    });
    const chartRadius = transform.projection.radius * transform.renderScale;
    const outside = { x: chartRadius * 1.2, y: chartRadius * 0.3, z: 0 };
    const constrained = transform.constrainRenderPosition(outside);
    const distance = Math.hypot(constrained.x, constrained.y, constrained.z);

    assert.ok(distance < chartRadius);
    assert.deepEqual(transform.constrainRenderPosition({ x: 1, y: 2, z: 3 }), {
        x: 1, y: 2, z: 3
    });
    assert.doesNotThrow(() => transform.renderToWorld(constrained));
});

test('Euclidean render coordinates are not altered by the chart constraint', function euclideanPassThrough() {
    const transform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1 });
    const position = { x: 1e6, y: -2e6, z: 3e6 };
    assert.deepEqual(transform.constrainRenderPosition(position), position);
});


test('Poincare world positions are constrained to the finite chart domain before rendering', function clampPoincareWorldPosition() {
    const transform = new SpatialTransform({
        geometry: 'poincare', renderScale: 24,
        bounds: {
            minX: -46, maxX: 46,
            minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            boundaryEpsilon: 1e-5
        }
    });
    const constrained = transform.constrainWorldPosition({ x: 0, y: -8, z: 60 });
    assert.ok(constrained.y > -5);
    assert.ok(constrained.z < 46);
    assert.ok(constrained.x >= -46 && constrained.x <= 46);
    assert.doesNotThrow(() => transform.worldToRender(constrained));
    assert.deepEqual(transform.constrainWorldPosition({ x: 1, y: 2, z: 3 }), {
        x: 1, y: 2, z: 3
    });
});

test('Euclidean world positions remain unchanged by chart-domain constraint', function euclideanWorldPassThrough() {
    const transform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1 });
    const position = { x: 1e6, y: -2e6, z: 3e6 };
    assert.deepEqual(transform.constrainWorldPosition(position), position);
});


test('inverted-Poincare world positions use the same finite chart-domain constraint', function clampInvertedPoincareWorldPosition() {
    const transform = new SpatialTransform({
        geometry: 'inverted-poincare', renderScale: 24,
        bounds: {
            minX: -10, maxX: 10,
            minY: -5, maxY: 5,
            minZ: -10, maxZ: 10,
            characteristicLength: 1,
            boundaryEpsilon: 1e-5
        }
    });
    const constrained = transform.constrainWorldPosition({ x: 0, y: -8, z: 12 });
    assert.ok(constrained.y > -5 && constrained.z < 10);
    assert.doesNotThrow(() => transform.worldToRender(constrained));
});
