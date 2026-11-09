import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createHeightmapData,
    getHeightmapStatistics,
    sampleHeightmapData,
    sampleNormalizedHeightmapData
} from '../src/environment/topography/heightmap-data.js';
import { TopographicWorldFactory } from '../src/world/topographic-world-factory.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { buildTopographicTerrainBuffers } from '../src/world/fields/geometry/topographic-terrain-mesh.js';

function makeRaster(width = 2, height = 2, values = [0, 64, 128, 255]) {
    const pixels = new Uint8Array(width * height * 4);
    for (let index = 0; index < values.length; index++) {
        const offset = index * 4;
        pixels[offset] = values[index];
        pixels[offset + 1] = values[index];
        pixels[offset + 2] = values[index];
        pixels[offset + 3] = 255;
    }
    return { width, height, pixels };
}

test('heightmap sampler bilinearly interpolates grayscale terrain and clamps edges', function sampleRaster() {
    const map = createHeightmapData({ ...makeRaster(), minHeight: -10, maxHeight: 30 });
    assert.equal(sampleHeightmapData(map, 0, 0), -10);
    assert.ok(Math.abs(sampleHeightmapData(map, 1, 1) - 30) < 1e-12);
    assert.ok(Math.abs(sampleNormalizedHeightmapData(map, 0.5, 0.5) - (447 / 1020)) < 1e-9);
    assert.equal(sampleHeightmapData(map, -2, 0), -10);
});

test('heightmap validates dimensions, channels, and elevation limits', function validateRaster() {
    assert.throws(() => createHeightmapData({ ...makeRaster(), width: 3 }), /buffer length/);
    assert.throws(() => createHeightmapData({ ...makeRaster(), channel: 'infrared' }), /Unsupported/);
    assert.throws(() => createHeightmapData({ ...makeRaster(), minHeight: 2, maxHeight: 2 }), /increasing/);
});

test('color-ramp decoding and sampled statistics are deterministic', function paletteAndStats() {
    const raster = makeRaster(2, 2, [0, 85, 170, 255]);
    const map = createHeightmapData({
        ...raster,
        colorStops: [
            { color: [0, 0, 0], value: 0 },
            { color: [255, 255, 255], value: 1 }
        ],
        minHeight: 0,
        maxHeight: 100
    });
    assert.equal(sampleNormalizedHeightmapData(map, 0, 0), 0);
    assert.equal(sampleNormalizedHeightmapData(map, 1, 1), 1);
    const stats = getHeightmapStatistics(map, 2);
    assert.equal(stats.count, 9);
    assert.ok(stats.minimum >= 0 && stats.maximum <= 100);
});

test('topographic factory creates an independent slice and terrain sampler', function createWorld() {
    const factory = new TopographicWorldFactory();
    const world = factory.create({
        id: 'test-highlands',
        w: 42,
        geometry: 'spherical',
        raster: makeRaster(),
        heightChannel: 'luminance',
        minHeight: -5,
        maxHeight: 15,
        worldSizeX: 200,
        worldSizeZ: 100,
        seed: 9
    });
    assert.equal(world.slice.id, 'test-highlands');
    assert.equal(world.slice.w, 42);
    assert.equal(world.slice.geometry, 'spherical');
    assert.deepEqual(world.terrain.sampleAt(0, 0), {
        x: 0,
        y: world.terrain.sampleHeight(0, 0),
        z: 0
    });
    assert.ok(world.terrain.sampleSlopeAt(-30, 0));
    assert.equal(world.metadata.width, 2);
    assert.equal(world.terrain.ready, true);
    assert.equal(world.terrain.pixels.length, 16);
    assert.throws(() => world.terrain.sampleSlopeAt(0, 0, 0), /positive/);
    world.terrain.dispose();
    assert.equal(world.terrain.pixels, null);
    assert.throws(() => world.terrain.sampleHeight(0, 0), /disposed/);
    assert.throws(() => world.terrain.sampleMapValue(0, 0), /disposed/);
    assert.throws(() => world.terrain.getDiagnostics(), /disposed/);
});

test('independent topographic inputs create isolated world slices', function independentWorlds() {
    const factory = new TopographicWorldFactory();
    const firstRaster = makeRaster(2, 2, [0, 0, 0, 0]);
    const secondRaster = makeRaster(2, 2, [255, 255, 255, 255]);
    const first = factory.create({
        id: 'topography-lowlands', w: -30, raster: firstRaster,
        minHeight: 0, maxHeight: 100, worldSize: 40
    });
    const second = factory.create({
        id: 'topography-highlands', w: 90, raster: secondRaster,
        minHeight: 0, maxHeight: 100, worldSize: 40
    });
    firstRaster.pixels.fill(255);
    assert.notEqual(first.slice.id, second.slice.id);
    assert.equal(first.slice.w, -30);
    assert.equal(second.slice.w, 90);
    assert.equal(first.terrain.sampleHeight(0, 0), 0);
    assert.ok(Math.abs(second.terrain.sampleHeight(0, 0) - 100) < 1e-9);
    first.terrain.dispose();
    second.terrain.dispose();
});


test('topographic mesh buffers generate indexed geometry at bounded resolution', function terrainMeshBuffers() {
    const world = new TopographicWorldFactory().create({
        id: 'mesh-world', raster: makeRaster(3, 2, [0, 64, 128, 192, 224, 255]),
        minHeight: -5, maxHeight: 15, worldSizeX: 60, worldSizeZ: 30
    });
    const buffers = buildTopographicTerrainBuffers(world.terrain, { maxSegments: 100 });
    assert.equal(buffers.resolutionX, 2);
    assert.equal(buffers.resolutionZ, 1);
    assert.equal(buffers.positions.length, 18);
    assert.equal(buffers.colors.length, 24);
    assert.equal(buffers.indices.length, 12);
    assert.ok(buffers.positions.every(Number.isFinite));
    assert.ok(buffers.colors.every(Number.isFinite));
    world.terrain.dispose();
});

test('spherical and inverted-Poincare charts round-trip away from singularities', function testCharts() {
    const spherical = new SpatialTransform({
        geometry: 'spherical',
        renderScale: 1,
        bounds: { minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -20, maxZ: 20 }
    });
    const position = { x: 0.12, y: -0.08, z: 0.2 };
    const restored = spherical.geometryToWorld(spherical.worldToGeometry(position));
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(restored[axis] - position[axis]) < 1e-9);

    const inverted = new SpatialTransform({
        geometry: 'inverted-poincare',
        renderScale: 1,
        bounds: {
            minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -20, maxZ: 20,
            characteristicLength: 1
        }
    });
    const outside = { x: 2, y: 0.5, z: -0.25 };
    const inverse = inverted.geometryToWorld(inverted.worldToGeometry(outside));
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(inverse[axis] - outside[axis]) < 1e-8);
    assert.throws(() => inverted.worldToGeometry({ x: 0, y: 0, z: 0 }), /singular/);
});

test('gameplay terrain falls back cleanly when its primary topographic asset is unreadable', async function fallbackTerrain() {
    const raster = makeRaster(2, 2);
    const requests = [];
    const loader = {
        async load(source) {
            requests.push(source);
            if (source === 'broken-map.png') throw new Error('truncated image');
            return raster;
        }
    };
    const { HeightmapTerrain } = await import('../src/environment/heightmap-terrain.js');
    const terrain = new HeightmapTerrain({
        url: 'broken-map.png',
        fallbackUrl: 'fallback-map.png',
        worldSize: 100,
        minHeight: -2,
        maxHeight: 2,
        loader
    });
    await terrain.load();
    assert.deepEqual(requests, ['broken-map.png', 'fallback-map.png']);
    assert.equal(terrain.getDiagnostics().usingFallback, true);
    assert.equal(terrain.getDiagnostics().source, 'fallback-map.png');
    terrain.dispose();
});

test('Babylon adapter projects by slice and restores original mesh buffers without replacing materials', async function sliceRenderer() {
    const { BabylonGeometryAdapter } = await import('../src/world/fields/geometry/babylon-geometry-adapter.js');
    const { createWorldSlice } = await import('../src/world/fields/geometry/world-slice.js');
    globalThis.BABYLON = {
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal' },
        VertexData: { ComputeNormals: function computeNormals() {} }
    };
    const scene = {};
    const transform = new SpatialTransform({
        geometry: 'spherical',
        renderScale: 10,
        bounds: {
            minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -20, maxZ: 20
        }
    });
    const adapter = new BabylonGeometryAdapter(scene);
    const slice = createWorldSlice({ id: 'slice-adapter-test', w: 10, geometry: 'spherical' });
    adapter.registerSlice(slice, transform);
    const original = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const material = { id: 'material-kept' };
    const mesh = {
        name: 'adapterTriangle',
        metadata: { sliceId: slice.id },
        material,
        positions: new Float32Array(original),
        getVerticesData: function getVerticesData(kind) { return kind === 'position' ? this.positions : null; },
        getIndices: function getIndices() { return null; },
        setVerticesData: function setVerticesData(kind, values) { if (kind === 'position') this.positions = new Float32Array(values); },
        refreshBoundingInfo: function refreshBoundingInfo() {},
        computeWorldMatrix: function computeWorldMatrix() {}
    };
    assert.equal(adapter.applyMesh(mesh), true);
    assert.equal(mesh.metadata.spatiallyTransformed, true);
    assert.notDeepEqual(Array.from(mesh.positions), Array.from(original));
    assert.equal(mesh.material, material);
    assert.equal(adapter.restoreMesh(mesh), true);
    assert.deepEqual(Array.from(mesh.positions), Array.from(original));
    assert.equal(mesh.material, material);
    adapter.dispose();
    delete globalThis.BABYLON;
});


test('terrain fallback detects a silently truncated image with a transparent tail', async function transparentTailFallback() {
    const { HeightmapTerrain } = await import('../src/environment/heightmap-terrain.js');
    const complete = makeRaster(2, 16);
    const truncated = makeRaster(2, 16);
    truncated.pixels.fill(0, 2 * 4 * 2 * 4);
    const requests = [];
    const terrain = new HeightmapTerrain({
        url: 'partial-image.png',
        fallbackUrl: 'complete-demo.png',
        worldSize: 20,
        minHeight: -1,
        maxHeight: 1,
        loader: { async load(source) { requests.push(source); return source === 'partial-image.png' ? truncated : complete; } }
    });
    await terrain.load();
    assert.deepEqual(requests, ['partial-image.png', 'complete-demo.png']);
    assert.equal(terrain.getDiagnostics().usingFallback, true);
    terrain.dispose();
});
