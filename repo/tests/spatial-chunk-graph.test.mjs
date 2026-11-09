import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialCorridor } from '../src/world/fields/geometry/spatial-corridor.js';
import { createSliceTransitionAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { SpatialChunkGraph } from '../src/world/spatial-chunk-graph.js';

function createGraph(options = {}) {
    const topology = new WorldTopology();
    const source = createWorldSlice({ id: 'source', w: 0 });
    const destination = createWorldSlice({ id: 'destination', w: 80 });
    const remote = createWorldSlice({ id: 'remote', w: 500 });
    topology.registerSlice(source);
    topology.registerSlice(destination);
    topology.registerSlice(remote);
    const corridor = createSpatialCorridor({
        id: 'bridge',
        source: { sliceId: source.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: destination.id, position: { x: 0, y: 0, z: 0 } },
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 4, w: 24 },
            { x: 0, y: 0, z: -4, w: 56 },
            { x: 0, y: 0, z: 0, w: 80 }
        ],
        radiusProfile: [{ t: 0, radius: 2 }, { t: 1, radius: 2 }],
        traversable: options.traversable ?? true,
        bidirectional: options.bidirectional ?? true
    });
    topology.registerCorridor(corridor);
    const graph = new SpatialChunkGraph(topology);
    graph.registerSlice(source, { chunkSize: 32 });
    graph.registerSlice(destination, { chunkSize: 32 });
    graph.registerSlice(remote, { chunkSize: 32 });
    const corridorChunk = graph.registerCorridor(corridor.id);
    return { graph, source, destination, remote, corridor, corridorChunk };
}

test('corridor is a first-class chunk between source and destination world chunks', function corridorChunkAdjacency() {
    const { graph, source, destination, corridorChunk } = createGraph();
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const destinationAddress = graph.getAddress(destination.id, { x: 0, z: 0 });
    const sourceNeighbors = graph.getNeighbors(sourceAddress);
    const corridorNode = sourceNeighbors.find(function findCorridor(node) {
        return node.kind === 'corridor';
    });
    assert.equal(corridorNode.id, corridorChunk.id);
    assert.equal(corridorNode.chunk, corridorChunk);

    const corridorNeighbors = graph.getNeighborsOfCorridor(corridorChunk.id);
    assert.ok(corridorNeighbors.some(function destinationChunk(node) {
        return node.kind === 'world' && node.address.sliceId === destination.id;
    }));
    assert.ok(graph.getAdjacentWorldChunks(sourceAddress).some(function remoteNeighbor(node) {
        return node.address.sliceId === destination.id && node.viaCorridorId === corridorChunk.id;
    }));
    assert.deepEqual(graph.getRoute(sourceAddress, destinationAddress).map(function routeKind(node) {
        return node.kind;
    }), ['world', 'corridor', 'world']);
});

test('fourth-coordinate proximity never creates chunk adjacency', function noImplicitSliceAdjacency() {
    const { graph, source, remote } = createGraph();
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const remoteAddress = graph.getAddress(remote.id, { x: 0, z: 0 });
    assert.equal(graph.getRoute(sourceAddress, remoteAddress), null);
    assert.equal(graph.getAdjacentWorldChunks(sourceAddress).some(function isRemote(node) {
        return node.address.sliceId === remote.id;
    }), false);
});

test('one-way corridor exposes chunk adjacency only in its permitted direction', function oneWayChunkEdge() {
    const { graph, source, destination } = createGraph({ bidirectional: false });
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const destinationAddress = graph.getAddress(destination.id, { x: 0, z: 0 });
    assert.ok(graph.getRoute(sourceAddress, destinationAddress));
    assert.equal(graph.getRoute(destinationAddress, sourceAddress), null);
});

test('non-traversable corridor chunk exists but does not join simulation neighborhoods', function previewOnlyChunk() {
    const { graph, source, destination, corridorChunk } = createGraph({ traversable: false });
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const destinationAddress = graph.getAddress(destination.id, { x: 0, z: 0 });
    assert.equal(corridorChunk.getStats().traversable, false);
    assert.equal(graph.getRoute(sourceAddress, destinationAddress), null);
    assert.equal(graph.getNeighbors(sourceAddress).some(function isCorridor(node) {
        return node.kind === 'corridor';
    }), false);
});

test('loaded chunk registration is independent from graph connectivity', function loadedChunkState() {
    const { graph, source } = createGraph();
    const address = graph.getAddress(source.id, { x: 2, z: -3 });
    const chunk = { id: 'loaded-source-chunk' };
    graph.registerChunk(address, chunk);
    assert.equal(graph.getChunk(address).loaded, true);
    graph.setChunkLoaded(address, null);
    assert.equal(graph.getChunk(address).loaded, false);
});


test('loaded chunk references refresh when a remote corridor neighbour loads or unloads', function refreshRemoteChunkReferences() {
    const { graph, source, destination } = createGraph();
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const destinationAddress = graph.getAddress(destination.id, { x: 0, z: 0 });
    const sourceChunk = { address: sourceAddress, neighbors: [], adjacent: [], setSpatialNeighbors: function setSpatialNeighbors(neighbors, adjacent) {
        this.neighbors = neighbors;
        this.adjacent = adjacent;
    } };
    const destinationChunk = { address: destinationAddress, setSpatialNeighbors: function setSpatialNeighbors() {} };

    graph.registerChunk(sourceAddress, sourceChunk);
    let remote = sourceChunk.adjacent.find(function findRemote(node) { return node.address?.sliceId === destination.id; });
    assert.equal(remote.loaded, false);

    graph.registerChunk(destinationAddress, destinationChunk);
    remote = sourceChunk.adjacent.find(function findRemote(node) { return node.address?.sliceId === destination.id; });
    assert.equal(remote.loaded, true);
    assert.equal(remote.chunk, destinationChunk);

    graph.setChunkLoaded(destinationAddress, null);
    remote = sourceChunk.adjacent.find(function findRemote(node) { return node.address?.sliceId === destination.id; });
    assert.equal(remote.loaded, false);
});

test('cross-slice chunk reachability scales with the ambient anomaly field and configured W range', function continuousCrossSliceReachability() {
    const topology = new WorldTopology();
    const source = createWorldSlice({ id: 'field-source', w: 0 });
    const destination = createWorldSlice({ id: 'field-destination', w: 10 });
    topology.registerSlice(source);
    topology.registerSlice(destination);
    const anomaly = createSliceTransitionAnomaly({
        id: 'field-bridge',
        source: { sliceId: source.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: destination.id, position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -10, y: -10, z: -10, w: 0 },
            max: { x: 10, y: 10, z: 10, w: 10 }
        },
        influence: {
            center: { x: 0, y: 0, z: 0, w: 5 },
            horizonRadius: 12,
            innerRadius: 1,
            maxWReach: 10
        },
        traversable: true,
        bidirectional: true
    });
    topology.registerCorridor(anomaly);
    const graph = new SpatialChunkGraph(topology);
    graph.registerSlice(source, { chunkSize: 16 });
    graph.registerSlice(destination, { chunkSize: 16 });
    graph.registerCorridor(anomaly.id);
    const sourceAddress = graph.getAddress(source.id, { x: 0, z: 0 });
    const destinationAddress = graph.getAddress(destination.id, { x: 0, z: 0 });

    try {
        const atHorizon = graph.getReachability(sourceAddress, destinationAddress, {
            position4D: { x: 0, y: 0, z: 0, w: -7 }
        });
        const inTransition = graph.getReachability(sourceAddress, destinationAddress, {
            position4D: { x: 0, y: 0, z: 0, w: 0 }
        });
        const atInnerCore = graph.getReachability(sourceAddress, destinationAddress, {
            position4D: { x: 0, y: 0, z: 0, w: 5 }
        });
        assert.equal(atHorizon.freedom, 0);
        assert.equal(atHorizon.reachable, false);
        assert.ok(inTransition.freedom > 0 && inTransition.freedom < 1);
        assert.equal(inTransition.reachable, false);
        assert.equal(atInnerCore.freedom, 1);
        assert.equal(atInnerCore.reachable, true);
        assert.equal(atInnerCore.wDistance, 5);
        assert.equal(atInnerCore.wReach, 10);

        const candidates = graph.getReachableChunkCandidates(source.id, {
            x: 0, y: 0, z: 0, w: 5
        }, { targetSliceId: destination.id });
        assert.ok(candidates.length > 0);
        assert.ok(candidates.every((candidate) => candidate.address.sliceId === destination.id));
        assert.equal(Object.keys(candidates[0].address).sort().join(','), 'chunkX,chunkZ,schemaVersion,sliceId');
        assert.equal(candidates[0].reachability.kind, 'cross-slice');
        assert.ok(candidates[0].reachability.projectedPosition);
    } finally {
        graph.dispose();
    }
});
