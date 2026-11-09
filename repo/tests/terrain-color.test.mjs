import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clamp,
    classifySoilType,
    getTerrainVertexColor
} from '../src/world/terrain-color.js';
import { WorldChunk } from '../src/world/world-chunk.js';

test('clamp defaults to the normalized range and rejects invalid values', function testClampDefaults() {
    assert.equal(clamp(0.5), 0.5);
    assert.equal(clamp(-0.25), 0);
    assert.equal(clamp(1.25), 1);
    assert.equal(clamp(Number.NaN), 0);
});

test('topographic elevation maps to the configured soil classes', function testSoilClassification() {
    assert.equal(classifySoilType(0.10), 'clay');
    assert.equal(classifySoilType(0.25), 'sand');
    assert.equal(classifySoilType(0.50), 'fertileSoil');
    assert.equal(classifySoilType(0.68), 'loam');
    assert.equal(classifySoilType(0.84), 'organic');
    assert.equal(classifySoilType(0.95), 'scree');
});

test('terrain vertex colors remain finite and visible across elevation and slope ranges', function testTerrainColorsAreFinite() {
    const elevations = [0.02, 0.2, 0.4, 0.6, 0.8, 0.96];
    const slopes = [0, 0.1, 0.5, 1.5];

    for (const elevation of elevations) {
        for (const slope of slopes) {
            const height = elevation * 3000 - 2000;
            const color = getTerrainVertexColor(
                height,
                slope,
                1250,
                -2750,
                -2000,
                1000
            );

            assert.equal(color.length, 3);
            assert.ok(color.every(Number.isFinite));
            assert.ok(color.every(function isInColorRange(value) {
                return value >= 0 && value <= 1;
            }));
            assert.ok(color.some(function hasVisibleChannel(value) {
                return value > 0.05;
            }));
        }
    }
});

test('invalid height and slope samples do not propagate NaN into vertex colors', function testInvalidSamplesAreSafe() {
    const color = getTerrainVertexColor(
        Number.NaN,
        Number.NaN,
        Number.NaN,
        Number.NaN,
        -2000,
        1000
    );

    assert.ok(color.every(Number.isFinite));
});

test('terrain worker emits finite RGB vertex colors for a generated chunk', async function testWorkerColorBuffers() {
    const previousSelf = globalThis.self;
    const messages = [];

    globalThis.self = {
        postMessage: function captureWorkerMessage(message) {
            messages.push(message);
        }
    };

    try {
        await import('../src/world/terrain-mesh-worker.js?terrain-color-test');

        const pixels = new Uint8Array(4 * 4 * 4);
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const offset = (y * 4 + x) * 4;
                const value = Math.round(40 + (x + y) * 25);
                pixels[offset] = value;
                pixels[offset + 1] = value;
                pixels[offset + 2] = value;
                pixels[offset + 3] = 255;
            }
        }

        globalThis.self.onmessage({
            data: {
                type: 'init',
                terrain: {
                    width: 4,
                    height: 4,
                    worldSize: 400,
                    minX: -200,
                    minZ: -200,
                    minHeight: -2000,
                    maxHeight: 1000,
                    heightChannel: 'average'
                },
                pixels: pixels.buffer
            }
        });

        globalThis.self.onmessage({
            data: {
                type: 'generate',
                id: 7,
                revision: 1,
                job: {
                    x: 0,
                    z: 0,
                    size: 100,
                    lod: 3,
                    neighborLODs: {
                        north: 3,
                        south: 3,
                        east: 3,
                        west: 3
                    }
                }
            }
        });

        const completion = messages.find(function isCompletion(message) {
            return message.type === 'complete';
        });

        assert.ok(completion, 'worker should complete mesh generation');
        assert.equal(completion.data.colors.length, 25 * 4);
        assert.ok(completion.data.colors.every(Number.isFinite));
        assert.ok(completion.data.colors.some(function hasColor(value) {
            return value > 0.05;
        }));
    } finally {
        if (previousSelf === undefined) {
            delete globalThis.self;
        } else {
            globalThis.self = previousSelf;
        }
    }
});

test('synchronous chunk rendering uses the same soil palette as worker generation', function testFallbackPaletteParity() {
    const chunk = Object.create(WorldChunk.prototype);
    chunk.terrain = { minHeight: -2000, maxHeight: 1000 };

    const height = 350;
    const slope = 0.42;
    const worldX = -850;
    const worldZ = 1175;
    const fallbackColor = chunk.getTerrainColor(
        height,
        slope,
        worldX,
        worldZ
    );
    const workerColor = getTerrainVertexColor(
        height,
        slope,
        worldX,
        worldZ,
        -2000,
        1000
    );

    assert.deepEqual(fallbackColor, workerColor);
});
