import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CorridorTraversalController } from '../src/world/fields/geometry/corridor-traversal-controller.js';
import { createSpatialCorridor } from '../src/world/fields/geometry/spatial-corridor.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { SpatialChunkGraph } from '../src/world/spatial-chunk-graph.js';

function createFixture(options = {}) {
    const sourceSlice = createWorldSlice({ id: 'room', w: 0 });
    const destinationSlice = createWorldSlice({ id: 'mountains', w: 80 });
    const corridor = createSpatialCorridor({
        id: 'corridor',
        source: { sliceId: sourceSlice.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: destinationSlice.id, position: { x: 0, y: 0, z: 0 } },
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 5, w: 24 },
            { x: 0, y: 0, z: -5, w: 56 },
            { x: 0, y: 0, z: 0, w: 80 }
        ],
        radiusProfile: [
            { t: 0, radius: 2.5 },
            { t: 1, radius: 2.5 }
        ],
        traversable: true,
        bidirectional: options.bidirectional ?? true
    });
    const topology = new WorldTopology();
    topology.registerSlice(sourceSlice);
    topology.registerSlice(destinationSlice);
    topology.registerCorridor(corridor);
    const chunkGraph = new SpatialChunkGraph(topology);
    chunkGraph.registerSlice(sourceSlice, { chunkSize: 32 });
    chunkGraph.registerSlice(destinationSlice, { chunkSize: 32 });
    const sourceAddress = chunkGraph.getAddress(sourceSlice.id, corridor.source.position);
    const destinationAddress = chunkGraph.getAddress(destinationSlice.id, corridor.destination.position);
    chunkGraph.registerChunk(sourceAddress, { id: 'source-chunk' });
    chunkGraph.registerChunk(destinationAddress, { id: 'destination-chunk' });
    const corridorChunk = chunkGraph.registerCorridor(corridor.id);
    const sourceTerrain = createTerrain();
    const destinationTerrain = createTerrain(1);
    const source = {
        slice: sourceSlice, transform: createTransform(100),
        terrain: sourceTerrain, layerMask: 1
    };
    const destination = {
        slice: destinationSlice, transform: createTransform(200),
        terrain: destinationTerrain, layerMask: 2
    };
    const player = createPlayer(options.playerPosition ?? { x: 0, y: 0, z: -3 }, options.yaw ?? 0);
    const movementController = createMovementController(sourceTerrain, options.input);
    const cameraController = createCameraController();
    const changed = [];
    const renderer = createRenderer(0);
    const reverseRenderer = createRenderer(100);
    const controller = new CorridorTraversalController({
        player,
        movementController,
        cameraController,
        corridor,
        topology,
        corridorRenderer: renderer,
        chunkGraph,
        corridorChunk,
        corridorRenderers: new Map([
            [sourceSlice.id, renderer],
            [destinationSlice.id, reverseRenderer]
        ]),
        source,
        destination,
        initialSliceId: options.initialSliceId ?? sourceSlice.id,
        traversal: { speed: 100, sprintSpeed: 120, entitySpeed: 100 },
        onSliceChanged(sliceId, state) { changed.push({ sliceId, state }); }
    });
    controller.setActive(true);
    return {
        controller, player, movementController, cameraController,
        source, destination, changed, renderer, reverseRenderer, corridor,
        chunkGraph, corridorChunk, sourceAddress, destinationAddress
    };
}

function createRenderer(offset) {
    return {
        options: { displayScale: 1 },
        getDisplaySample(t) {
            return {
                position: { x: offset + t * 20, y: 2, z: t * 30 },
                tangent: { x: 0, y: 0, z: 1 },
                axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
                crossSectionAxes: [
                    { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }
                ],
                axes4D: [
                    { x: 1, y: 0, z: 0, w: 0 },
                    { x: 0, y: 1, z: 0, w: 0 },
                    { x: 0, y: 0, z: 0, w: 1 }
                ],
                spatialPosition4D: { x: 0, y: 0, z: 0, w: t * 80 },
                radius: 2.5
            };
        }
    };
}

function createTransform(offset) {
    return { worldToRender(position) { return { x: position.x + offset, y: position.y, z: position.z + offset }; } };
}

function createTerrain(height = 0) {
    return {
        min: { x: -20, y: -5, z: -20 },
        max: { x: 20, y: 20, z: 20 },
        sampleAt(x, z) { return { x, y: height, z }; }
    };
}

function createPlayer(position, yaw) {
    return {
        worldPosition: { ...position },
        yaw,
        layerMask: 1,
        root: { position: { x: position.x, y: position.y, z: position.z } },
        getRenderPosition() { return { ...this.root.position }; },
        setRenderPosition(next, nextYaw) {
            this.root.position = { x: next.x, y: next.y, z: next.z };
            this.yaw = nextYaw;
        },
        setLayerMask(mask) { this.layerMask = mask; },
        setSpatialContext(transform, sliceId, layerMask) {
            this.transform = transform;
            this.sliceId = sliceId;
            this.setLayerMask(layerMask);
        },
        setWorldPosition(next) {
            this.worldPosition = { ...next };
            this.root.position = this.transform.worldToRender(next);
        }
    };
}

function createMovementController(terrain, input = {}) {
    return {
        terrain,
        input: { forward: 1, strafe: 0, vertical: 0, sprint: false, ...input },
        movementSuspended: false,
        getMovementInput() { return { ...this.input }; },
        setMovementSuspended(value) { this.movementSuspended = value; },
        setTerrain(value) { this.terrain = value; }
    };
}

function createCameraController() {
    return {
        anchor: null,
        setRenderAnchor(position, yaw, target = null) {
            this.anchor = { position: { ...position }, yaw, target: target ? { ...target } : null };
        },
        clearRenderAnchor() { this.anchor = null; },
        setSpatialContext(transform, layerMask) { this.transform = transform; this.layerMask = layerMask; }
    };
}

function advanceUntilIdle(controller, limit = 40) {
    for (let index = 0; index < limit && controller.state === 'transit'; index++) {
        controller.update(0.1);
    }
}

function createEntity(sliceId = 'room') {
    return {
        sliceId,
        worldPosition: { x: 0, y: 0, z: 0 },
        yaw: 0,
        root: {
            position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
            rotation: {}
        },
        getRenderPosition() { return { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z }; },
        setRenderPosition(position, yaw) {
            this.root.position.set(position.x, position.y, position.z);
            this.yaw = yaw;
        },
        setSpatialContext(transform, id, layerMask) {
            this.transform = transform;
            this.sliceId = id;
            this.layerMask = layerMask;
        },
        setWorldPosition(position) {
            this.worldPosition = { ...position };
            const render = this.transform.worldToRender(position);
            this.root.position.set(render.x, render.y, render.z);
        }
    };
}

test('player-controlled corridor movement transfers source slice to destination', function forwardTraversal() {
    const fixture = createFixture();
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'transit');
    assert.equal(fixture.movementController.movementSuspended, true);
    advanceUntilIdle(fixture.controller);
    assert.equal(fixture.controller.getState().currentSliceId, 'mountains');
    assert.deepEqual(fixture.player.worldPosition, { x: 0, y: 1, z: 5 });
    assert.equal(fixture.player.sliceId, 'mountains');
    assert.equal(fixture.player.layerMask, 2);
    assert.equal(fixture.corridorChunk.occupants.has(fixture.player), false);
    assert.equal(fixture.movementController.terrain, fixture.destination.terrain);
    assert.equal(fixture.movementController.movementSuspended, false);
    assert.equal(fixture.cameraController.anchor, null);
    assert.equal(fixture.changed.at(-1).state.transitioning, false);
});

test('corridor progress is controlled by forward and backward movement input', function controlledProgress() {
    const fixture = createFixture({ input: { forward: 0 } });
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'idle');
    fixture.movementController.input.forward = 1;
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'transit');
    fixture.movementController.input.forward = 0;
    fixture.controller.update(0.5);
    assert.equal(fixture.controller.getState().progress, 0);
    fixture.movementController.input.forward = 1;
    fixture.controller.update(0.1);
    assert.ok(fixture.controller.getState().progress > 0);
    assert.equal(fixture.corridorChunk.getOccupant(fixture.player).progress, fixture.controller.getState().progress);
    assert.equal(fixture.chunkGraph.getStats().corridorOccupants, 1);
    const remoteNeighbor = fixture.chunkGraph.getAdjacentWorldChunks(fixture.sourceAddress)
        .find(function isRemote(node) { return node.address?.sliceId === 'mountains'; });
    assert.ok(remoteNeighbor);
    fixture.movementController.input.forward = -1;
    fixture.controller.update(0.1);
    assert.ok(fixture.controller.getState().progress < 0.2);
});

test('destination handoff preserves the in-slice component of corridor cross-section position', function preserveExitOffset() {
    const fixture = createFixture();
    fixture.controller.update(0);
    fixture.movementController.input.strafe = 1;
    advanceUntilIdle(fixture.controller);
    assert.equal(fixture.controller.getState().currentSliceId, 'mountains');
    assert.ok(fixture.player.worldPosition.x > 0);
    assert.equal(fixture.player.worldPosition.z, 5);
});

test('corridor entry works across a world-chunk boundary and records occupancy', function chunkBoundaryEntry() {
    const fixture = createFixture();
    assert.equal(fixture.chunkGraph.getAddress('room', fixture.player.worldPosition).chunkZ, -1);
    assert.equal(fixture.sourceAddress.chunkZ, 0);
    fixture.controller.update(0);
    assert.equal(fixture.controller.state, 'transit');
    assert.equal(fixture.corridorChunk.occupants.has(fixture.player), true);
    fixture.controller.update(0.1);
    assert.ok(fixture.player.spatialPosition4D.w > 0);
    fixture.movementController.input.forward = 0;
    assert.equal(fixture.corridorChunk.getOccupant(fixture.player).progress, fixture.controller.progress);
});

test('bidirectional corridor supports return traversal into the source slice', function reverseTraversal() {
    const fixture = createFixture({
        initialSliceId: 'mountains',
        playerPosition: { x: 0, y: 1, z: 3 },
        yaw: Math.PI
    });
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().direction, -1);
    assert.equal(fixture.changed[0].state.renderSliceId, 'mountains');
    advanceUntilIdle(fixture.controller);
    assert.equal(fixture.controller.getState().currentSliceId, 'room');
    assert.deepEqual(fixture.player.worldPosition, { x: 0, y: 0, z: -5 });
    assert.equal(fixture.player.layerMask, 1);
    assert.equal(fixture.movementController.terrain, fixture.source.terrain);
});

test('one-way corridor does not permit reverse entry', function oneWayTraversal() {
    const fixture = createFixture({
        bidirectional: false,
        initialSliceId: 'mountains',
        playerPosition: { x: 0, y: 1, z: 3 },
        yaw: Math.PI
    });
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'idle');
    assert.equal(fixture.movementController.movementSuspended, false);
});

test('corridor entry requires proximity, facing, and forward input', function entryGate() {
    const fixture = createFixture({ playerPosition: { x: 0, y: 0, z: -3 }, yaw: Math.PI });
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'idle');
});

test('transverse input changes the player position in the corridor cross-section', function transverseMovement() {
    const fixture = createFixture();
    fixture.controller.update(0);
    fixture.movementController.input = { forward: 1, strafe: 1, vertical: 1, sprint: false };
    fixture.controller.update(0.1);
    assert.notEqual(fixture.player.spatialPosition4D.x, 0);
    assert.notEqual(fixture.player.spatialPosition4D.y, 0);
});

test('third cross-section axis changes the fourth ambient coordinate', function thirdCrossSectionAxis() {
    const fixture = createFixture();
    fixture.controller.update(0);
    fixture.movementController.input.crossSectionW = 1;
    fixture.controller.update(0.05);
    assert.ok(fixture.controller.spatialPosition4D.w > 0);
    assert.ok(fixture.controller.offsetW > 0);
    fixture.controller.dispose();
});

test('combined cross-section movement stays inside the corridor radius', function boundedCrossSection() {
    const fixture = createFixture();
    fixture.controller.update(0);
    Object.assign(fixture.movementController.input, { strafe: 1, vertical: 1, crossSectionW: 1 });
    for (let index = 0; index < 10; index++) fixture.controller.update(0.05);
    const offsetLength = Math.hypot(
        fixture.controller.offsetU, fixture.controller.offsetV, fixture.controller.offsetW
    );
    assert.ok(offsetLength <= fixture.controller.getCurrentRadius() * 0.62 + 1e-9);
    fixture.controller.dispose();
});

test('reverse input returns the player through the mouth they entered', function retreat() {
    const fixture = createFixture();
    fixture.controller.update(0);
    fixture.controller.update(0.1);
    assert.ok(fixture.controller.getState().progress > 0);
    assert.equal(fixture.corridorChunk.getOccupant(fixture.player).progress, fixture.controller.getState().progress);
    assert.equal(fixture.chunkGraph.getStats().corridorOccupants, 1);
    const remoteNeighbor = fixture.chunkGraph.getAdjacentWorldChunks(fixture.sourceAddress)
        .find(function isRemote(node) { return node.address?.sliceId === 'mountains'; });
    assert.ok(remoteNeighbor);
    fixture.movementController.input.forward = -1;
    advanceUntilIdle(fixture.controller);
    assert.equal(fixture.controller.getState().currentSliceId, 'room');
    assert.equal(fixture.player.sliceId, 'room');
});

test('geometry demo contains no floor or ceiling plane meshes', async function openDemoRoom() {
    const source = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /demoRoomFloor|createRoomFloor|demoFloorEdge|CreatePlane\([^\n]*(?:floor|ceiling)/i);
    assert.match(source, /size: 60/);
    assert.match(source, /const SOURCE_LAYER = 0x10000000/);
    assert.match(source, /destinationCorridorRenderer/);
});

test('non-player spatial entities traverse the same corridor chunk', function entityTraversal() {
    const fixture = createFixture({ playerPosition: { x: -10, y: 0, z: -10 } });
    const entity = createEntity();
    assert.equal(fixture.controller.beginEntityTransit(entity, 'room'), true);
    assert.equal(fixture.controller.getEntityTransitState(entity).toSliceId, 'mountains');
    for (let index = 0; index < 40 && fixture.controller.getEntityTransitState(entity); index++) {
        fixture.controller.update(0.1);
    }
    assert.equal(entity.sliceId, 'mountains');
    assert.deepEqual(entity.worldPosition, { x: 0, y: 1, z: 5 });
    assert.equal(fixture.controller.getEntityTransitState(entity), null);
});

test('non-player entities can use the same proximity and facing entry gate', function npcEntryGate() {
    const fixture = createFixture({ playerPosition: { x: -10, y: 0, z: -10 } });
    const entity = createEntity();
    entity.worldPosition = { x: 0, y: 0, z: -2 };
    entity.root.position.z = -2;
    assert.equal(fixture.controller.tryBeginEntityTransit(entity), true);
    assert.equal(fixture.controller.getEntityTransitState(entity).toSliceId, 'mountains');
});


test('follow camera aims toward the destination window while traversing', function cameraLooksThroughCorridor() {
    const fixture = createFixture();
    fixture.controller.update(0.016);
    assert.equal(fixture.controller.state, 'transit');
    assert.ok(fixture.cameraController.anchor.target.z > 20);
    assert.ok(fixture.cameraController.anchor.target.z > fixture.cameraController.anchor.position.z);
});
