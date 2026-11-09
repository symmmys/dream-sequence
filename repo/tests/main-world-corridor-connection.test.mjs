import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    createGeometryDemoTopology, MAIN_WORLD_SLICE_ID, SOURCE_SLICE_ID,
    HYPERCUBE_SLICE_ID, HYPERCUBE_CORRIDOR_ID, CORRIDOR_ID
} from '../src/demo/geometry-demo-topology.js';
import { measureCorridor } from '../src/world/fields/geometry/corridor-traversal-controller.js';
import { sliceToAmbient } from '../src/world/fields/geometry/spatial-4d.js';

function createMainWorld() {
    return {
        terrain: {
            min: { x: -20000, y: -2000, z: -20000 },
            max: { x: 20000, y: 1000, z: 20000 },
            sampleAt(x, z) { return { x, y: 137, z }; }
        },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    };
}

function createChunk(address) {
    return {
        address,
        neighbors: [],
        adjacentWorldChunks: [],
        setSpatialNeighbors(neighbors, adjacentWorldChunks) {
            this.neighbors = neighbors;
            this.adjacentWorldChunks = adjacentWorldChunks;
        }
    };
}

test('geometry demo corridor terminates in the existing somnium-main world slice', function mainSliceEndpoint() {
    const topology = createGeometryDemoTopology(createMainWorld());

    assert.equal(topology.mainSlice.id, MAIN_WORLD_SLICE_ID);
    assert.equal(topology.mainSlice.w, 80);
    assert.equal(topology.mainSlice.geometry, 'poincare');
    assert.equal(topology.corridor.type, 'slice-transition');
    assert.deepEqual(topology.corridor.destination, {
        sliceId: MAIN_WORLD_SLICE_ID,
        position: { x: 0, y: 137, z: 0 }
    });
    assert.equal(topology.corridor.region.min.w, -6);
    assert.equal(topology.corridor.region.max.w, 86);
    assert.equal(topology.corridor.region.max.y - topology.corridor.region.min.y, 16);
    const sourceAmbient = sliceToAmbient(topology.sourceSlice.frame, topology.corridor.source.position);
    const destinationAmbient = sliceToAmbient(topology.mainSlice.frame, topology.corridor.destination.position);
    assert.ok(Math.abs(sourceAmbient.y - destinationAmbient.y) < 1e-9);
    assert.equal(topology.destinationChunkAddress.chunkX, 0);
    assert.equal(topology.destinationChunkAddress.chunkZ, 0);
    assert.equal(topology.mainChunkSize, 2000);
});

test('the main-world terrain chunk is reachable from the chamber through the corridor chunk', function mainChunkAdjacency() {
    const setup = createGeometryDemoTopology(createMainWorld());
    const sourceChunk = createChunk(setup.sourceChunkAddress);
    setup.chunkGraph.registerChunk(setup.sourceChunkAddress, sourceChunk);

    const route = setup.chunkGraph.getRoute(
        setup.sourceChunkAddress,
        setup.destinationChunkAddress
    );
    assert.deepEqual(route.map(function routeKind(node) { return node.kind; }), [
        'world', 'corridor', 'world'
    ]);

    let remote = sourceChunk.adjacentWorldChunks.find(function mainWorldNeighbor(node) {
        return node.address?.sliceId === MAIN_WORLD_SLICE_ID;
    });
    assert.ok(remote);
    assert.equal(remote.loaded, false);
    assert.equal(remote.viaCorridorId, setup.corridor.id);

    const mainWorldChunk = createChunk(setup.destinationChunkAddress);
    setup.chunkGraph.registerChunk(setup.destinationChunkAddress, mainWorldChunk);
    remote = sourceChunk.adjacentWorldChunks.find(function loadedMainNeighbor(node) {
        return node.address?.sliceId === MAIN_WORLD_SLICE_ID;
    });
    assert.equal(remote.loaded, true);
    assert.equal(remote.chunk, mainWorldChunk);

    setup.chunkGraph.setChunkLoaded(setup.destinationChunkAddress, null);
    remote = sourceChunk.adjacentWorldChunks.find(function unloadedMainNeighbor(node) {
        return node.address?.sliceId === MAIN_WORLD_SLICE_ID;
    });
    assert.equal(remote.loaded, false);
    setup.chunkGraph.dispose();
});

test('geometry demo shares the live main world manager, terrain, transform, and chunk graph', async function sharedMainWorldRuntime() {
    const demoSource = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    const sceneSource = await readFile(new URL('../src/scene/create-scene.js', import.meta.url), 'utf8');

    assert.match(demoSource, /mainWorld\.terrain/);
    assert.match(demoSource, /mainWorld\.spatialTransform/);
    assert.match(demoSource, /setDestinationWorldManager\(manager\)/);
    assert.match(sceneSource, /chunkGraph:\s*geometryDemo\.chunkGraph/);
    assert.match(sceneSource, /spatialAdapter:\s*geometryDemo\.adapter/);
    assert.match(sceneSource, /geometryDemo\.setDestinationWorldManager\(world\)/);
    assert.doesNotMatch(demoSource, /geometry-demo-topography/);
});


test('the new 4D chamber connects to the Poincare chamber through its own corridor chunk', function hypercubeChamberConnection() {
    const setup = createGeometryDemoTopology(createMainWorld());
    assert.equal(setup.hypercubeSlice.id, HYPERCUBE_SLICE_ID);
    assert.equal(setup.hypercubeSlice.geometry, 'euclidean');
    assert.equal(setup.hypercubeSlice.w, 75);
    assert.equal(setup.hypercubeCorridor.id, HYPERCUBE_CORRIDOR_ID);
    assert.equal(setup.hypercubeCorridor.traversable, true);
    assert.equal(setup.hypercubeCorridor.bidirectional, true);
    assert.deepEqual(setup.hypercubeCorridor.destination, {
        sliceId: SOURCE_SLICE_ID,
        position: { x: -18, y: 2.5, z: 0 }
    });
    assert.equal(setup.chunkGraph.getCorridorChunk(HYPERCUBE_CORRIDOR_ID), setup.hypercubeCorridorChunk);
    assert.equal(setup.chunkGraph.getNeighbors(setup.hypercubeChunkAddress)
        .some(function containsCorridor(node) { return node.id === HYPERCUBE_CORRIDOR_ID; }), true);
    assert.equal(setup.topology.getTraversableNeighbors(SOURCE_SLICE_ID).length, 2);
    assert.equal(setup.topology.getTraversableNeighbors(HYPERCUBE_SLICE_ID)[0].sliceId, SOURCE_SLICE_ID);
    assert.equal(setup.topology.getTraversableNeighbors(SOURCE_SLICE_ID)
        .some(function retainsMainRoute(link) { return link.corridorId === CORRIDOR_ID; }), true);
    setup.chunkGraph.dispose();
});

test('the geometry demo starts in the 4D chamber with the player-follow camera', async function defaultFourDimensionalDemo() {
    const worldSource = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    const menuSource = await readFile(new URL('../src/ui/main-menu.js', import.meta.url), 'utf8');
    assert.match(worldSource, /this\.currentSliceId = this\.hypercubeSlice\.id/);
    assert.match(worldSource, /this\.cameraController\.setMode\('follow'\)/);
    assert.doesNotMatch(worldSource, /this\.cameraController\.setMode\('free'\)/);
    assert.match(worldSource, /toggleCameraMode\(\)/);
    assert.match(worldSource, /new Hypercube4DRenderer/);
    assert.match(menuSource, /4D GEOMETRY DEMO/);
});


test('demo anomalies are bounded slice transitions while the legacy Bezier metric remains available', function sliceTransitionDefaults() {
    const setup = createGeometryDemoTopology(createMainWorld());
    for (const anomaly of [setup.corridor, setup.hypercubeCorridor, setup.hypercubeMainCorridor]) {
        assert.equal(anomaly.type, 'slice-transition');
        assert.ok(anomaly.region.max.x - anomaly.region.min.x <= 32);
        assert.ok(anomaly.region.max.z - anomaly.region.min.z <= 32);
        assert.ok(anomaly.region.max.y - anomaly.region.min.y <= 32);
        assert.ok(anomaly.region.max.w > anomaly.region.min.w);
    }
    const legacy = {
        id: 'legacy-measurement',
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 1, y: 0, z: 0, w: 2 },
            { x: 2, y: 0, z: 0, w: 4 },
            { x: 3, y: 0, z: 0, w: 6 }
        ], intrinsicLengthScale: 0.32
    };
    assert.ok(measureCorridor(legacy, 32) > 0);
    assert.equal(setup.hypercubeSlice.w, 75);
    assert.equal(setup.mainSlice.w, 80);
    assert.equal(setup.hypercubeCorridor.region.min.w, -6);
    assert.equal(setup.hypercubeCorridor.region.max.w, 81);
    assert.equal(setup.corridor.region.min.w, -6);
    assert.equal(setup.corridor.region.max.w, 86);
    assert.equal(setup.hypercubeMainCorridor.region.min.w, 69);
    assert.equal(setup.hypercubeMainCorridor.region.max.w, 86);
    assert.equal(setup.hypercubeMainCorridor.source.position.x, 18);
    assert.equal(setup.hypercubeMainCorridor.destination.position.x, 18);
    setup.chunkGraph.dispose();
});
