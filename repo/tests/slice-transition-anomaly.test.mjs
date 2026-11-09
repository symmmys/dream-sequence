import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialAnomaly, createSliceTransitionAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import { createSpatialCorridor } from '../src/world/fields/geometry/spatial-corridor.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { SpatialChunkGraph } from '../src/world/spatial-chunk-graph.js';
import { SliceTransitionTraversalController } from '../src/world/fields/geometry/slice-transition-traversal-controller.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { sliceToAmbient } from '../src/world/fields/geometry/spatial-4d.js';

function createAnomaly(sourceSlice, destinationSlice, overrides = {}) {
    return createSliceTransitionAnomaly({
        id: 'slice-link',
        source: { sliceId: sourceSlice.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: destinationSlice.id, position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -5, y: -5, z: -5, w: Math.min(sourceSlice.w, destinationSlice.w) - 6 },
            max: { x: 5, y: 5, z: 5, w: Math.max(sourceSlice.w, destinationSlice.w) + 6 }
        },
        traversable: true,
        ...overrides
    });
}

function createFixture(options = {}) {
    const sourceSlice = createWorldSlice({ id: 'slice-a', w: 0 });
    const destinationSlice = createWorldSlice({ id: 'slice-b', w: 10 });
    const anomaly = createAnomaly(sourceSlice, destinationSlice, options.anomaly);
    const topology = new WorldTopology();
    topology.registerSlice(sourceSlice);
    topology.registerSlice(destinationSlice);
    topology.registerCorridor(anomaly);

    const chunkGraph = new SpatialChunkGraph(topology);
    chunkGraph.registerSlice(sourceSlice, { chunkSize: 16 });
    chunkGraph.registerSlice(destinationSlice, { chunkSize: 16 });
    const sourceAddress = chunkGraph.getAddress(sourceSlice.id, anomaly.source.position);
    const destinationAddress = chunkGraph.getAddress(destinationSlice.id, anomaly.destination.position);
    const corridorChunk = chunkGraph.registerCorridor(anomaly.id);

    const sourceTerrain = createTerrain(0);
    const destinationTerrain = createTerrain(1);
    const source = {
        slice: sourceSlice, transform: options.sourceTransform ?? createTransform(10), terrain: sourceTerrain, layerMask: 1,
        movementProfile: { walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.2 }
    };
    const destination = {
        slice: destinationSlice, transform: options.destinationTransform ?? createTransform(20), terrain: destinationTerrain, layerMask: 2,
        movementProfile: options.destinationMovementProfile ?? { walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 }
    };
    const player = createPlayer(options.playerPosition ?? { x: 0, y: 0, z: -2 }, options.yaw ?? 0, source.transform);
    const movement = createMovement(sourceTerrain, options.input);
    const camera = createCamera();
    const changes = [];
    const controller = new SliceTransitionTraversalController({
        player,
        movementController: movement,
        cameraController: camera,
        topology,
        anomaly,
        getInfluenceModifiers: options.getInfluenceModifiers,
        chunkGraph,
        corridorChunk,
        source,
        destination,
        initialSliceId: options.initialSliceId ?? sourceSlice.id,
        traversal: { speed: 4, sprintSpeed: 6, entitySpeed: 4 },
        onSliceChanged(sliceId, state) { changes.push({ sliceId, state }); }
    });
    controller.setActive(true);
    return {
        controller, player, movement, camera, source, destination,
        sourceAddress, destinationAddress, chunkGraph, corridorChunk, anomaly, changes
    };
}

function createTerrain(height) {
    return {
        min: { x: -20, y: -10, z: -20 },
        max: { x: 20, y: 20, z: 20 },
        sampleAt(x, z) { return { x, y: height, z }; }
    };
}

function createTransform(offset) {
    return {
        worldToRender(position) { return { x: position.x + offset, y: position.y, z: position.z + offset }; },
        renderToWorld(position) { return { x: position.x - offset, y: position.y, z: position.z - offset }; }
    };
}

function createPlayer(position, yaw, transform) {
    return {
        worldPosition: { ...position },
        yaw,
        transform,
        sliceId: 'slice-a',
        setSpatialContext(nextTransform, sliceId, layerMask) {
            this.transform = nextTransform;
            this.sliceId = sliceId;
            this.layerMask = layerMask;
        },
        setWorldPosition(next) { this.worldPosition = { ...next }; },
        setLayerMask(mask) { this.layerMask = mask; }
    };
}

function createMovement(terrain, input = {}) {
    return {
        terrain,
        input: { forward: 1, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false, ...input },
        movementSuspended: false,
        turnSpeed: 2.2,
        getMovementInput() { return { ...this.input }; },
        setMovementSuspended(value) { this.movementSuspended = value; },
        setTerrain(value) { this.terrain = value; },
        setMovementProfile(value) { this.movementProfile = { ...value }; }
    };
}

function createCamera() {
    return {
        setSpatialContext(transform, layerMask) { this.transform = transform; this.layerMask = layerMask; },
        clearRenderAnchor() { this.anchor = null; }
    };
}

function enter(fixture) {
    fixture.controller.update(0);
    assert.equal(fixture.controller.getState().state, 'transit');
    assert.equal(fixture.movement.movementSuspended, true);
    assert.equal(fixture.corridorChunk.occupants.has(fixture.player), true);
}

function cleanup(fixture) {
    fixture.controller.dispose();
    fixture.chunkGraph.dispose();
}

test('spatial anomaly factory defaults to slice transitions and preserves explicit Bezier corridors', function typedAnomalyDefaults() {
    const source = createWorldSlice({ id: 'a', w: 0 });
    const destination = createWorldSlice({ id: 'b', w: 5 });
    const options = {
        id: 'default-link',
        source: { sliceId: 'a', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'b', position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -1, y: -1, z: -1, w: 0 },
            max: { x: 1, y: 1, z: 1, w: 5 }
        }
    };
    assert.equal(createSpatialAnomaly(options).type, 'slice-transition');
    const bezier = createSpatialCorridor({
        id: 'legacy-link',
        source: { sliceId: 'a', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'b', position: { x: 0, y: 0, z: 0 } },
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 1, y: 0, z: 0, w: 1 },
            { x: 2, y: 0, z: 0, w: 4 },
            { x: 0, y: 0, z: 0, w: 5 }
        ]
    });
    assert.equal(createSpatialAnomaly({ ...bezier, type: 'bezier' }).type, 'bezier');
    assert.equal(source.w, 0);
    assert.equal(destination.w, 5);
});

test('slice-transition anomalies require finite four-dimensional bounds containing distinct slice planes', function anomalyBoundsValidation() {
    const source = createWorldSlice({ id: 'source', w: 0 });
    const destination = createWorldSlice({ id: 'destination', w: 10 });
    assert.throws(() => createAnomaly(source, destination, {
        region: { min: { x: 0, y: 0, z: 0, w: 0 }, max: { x: 0, y: 1, z: 1, w: 10 } }
    }), /region x maximum/);
    assert.throws(() => createSliceTransitionAnomaly({
        id: 'missing-w',
        source: { sliceId: 'source', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'destination', position: { x: 0, y: 0, z: 0 } },
        region: { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }
    }), /finite w bounds/);

    const samePlaneTopology = new WorldTopology();
    const frame = {
        origin: { x: 5, y: 0, z: 0, w: 0 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ],
        normal: { x: 0, y: 0, z: 0, w: 1 }
    };
    const offsetSlice = createWorldSlice({ id: 'offset-same-plane', frame });
    samePlaneTopology.registerSlice(source);
    samePlaneTopology.registerSlice(offsetSlice);
    const anomaly = createSliceTransitionAnomaly({
        id: 'same-plane',
        source: { sliceId: source.id, position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: offsetSlice.id, position: { x: 0, y: 0, z: 0 } },
        region: {
            min: { x: -1, y: -1, z: -1, w: -1 },
            max: { x: 6, y: 1, z: 1, w: 1 }
        }
    });
    assert.throws(() => samePlaneTopology.registerCorridor(anomaly), /distinct 3D slice planes/);
});


test('entry checks the complete 4D region before starting traversal', function boundedEntryGate() {
    const fixture = createFixture({ playerPosition: { x: 0, y: 6, z: -2 } });
    try {
        assert.equal(fixture.controller.tryBeginTransit(), false);
        assert.equal(fixture.controller.state, 'idle');
        assert.equal(fixture.movement.movementSuspended, false);
        assert.equal(fixture.corridorChunk.occupants.has(fixture.player), false);
    } finally {
        cleanup(fixture);
    }
});

test('anomaly entry enables independent X, Y, Z, and W movement without changing chunk addressing', function independentFourAxisMovement() {
    const fixture = createFixture();
    try {
        enter(fixture);
        const initial = { ...fixture.controller.getState().position4D };

        fixture.movement.input = { forward: 0, strafe: 1, vertical: 0, crossSectionW: 0, turn: 0, sprint: false };
        fixture.controller.update(0.1);
        const afterX = fixture.controller.getState().position4D;
        assert.ok(afterX.x > initial.x);
        assert.equal(afterX.y, initial.y);
        assert.equal(afterX.z, initial.z);
        assert.equal(afterX.w, initial.w);

        fixture.movement.input = { forward: 0, strafe: 0, vertical: 1, crossSectionW: 0, turn: 0, sprint: false };
        fixture.controller.update(0.1);
        const afterY = fixture.controller.getState().position4D;
        assert.equal(afterY.x, afterX.x);
        assert.ok(afterY.y > afterX.y);
        assert.equal(afterY.z, afterX.z);
        assert.equal(afterY.w, afterX.w);

        fixture.movement.input = { forward: 1, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false };
        fixture.controller.update(0.1);
        const afterZ = fixture.controller.getState().position4D;
        assert.equal(afterZ.x, afterY.x);
        assert.equal(afterZ.y, afterY.y);
        assert.ok(afterZ.z > afterY.z);
        assert.equal(afterZ.w, afterY.w);

        fixture.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: 1, turn: 0, sprint: false };
        fixture.controller.update(0.1);
        const afterW = fixture.controller.getState().position4D;
        assert.equal(afterW.x, afterZ.x);
        assert.equal(afterW.y, afterZ.y);
        assert.equal(afterW.z, afterZ.z);
        assert.ok(afterW.w > afterZ.w);

        assert.equal(fixture.corridorChunk.getOccupant(fixture.player).position4D.w, afterW.w);
        assert.deepEqual(Object.keys(fixture.sourceAddress).sort(), ['chunkX', 'chunkZ', 'schemaVersion', 'sliceId']);
        assert.deepEqual(Object.keys(fixture.destinationAddress).sort(), ['chunkX', 'chunkZ', 'schemaVersion', 'sliceId']);
        assert.notEqual(fixture.sourceAddress.sliceId, fixture.destinationAddress.sliceId);
    } finally {
        cleanup(fixture);
    }
});

test('bounded anomaly movement clamps XYZ and W within its registered 4D region', function regionBounds() {
    const fixture = createFixture();
    try {
        enter(fixture);
        fixture.movement.input = { forward: 0, strafe: 1, vertical: 1, crossSectionW: 0, turn: 0, sprint: false };
        for (let index = 0; index < 100; index++) fixture.controller.update(0.1);
        const position = fixture.controller.getState().position4D;
        assert.equal(position.x, fixture.anomaly.region.max.x);
        assert.equal(position.y, fixture.anomaly.region.max.y);
        assert.ok(position.w >= fixture.anomaly.region.min.w && position.w <= fixture.anomaly.region.max.w);
        assert.ok(position.z >= fixture.anomaly.region.min.z && position.z <= fixture.anomaly.region.max.z);
    } finally {
        cleanup(fixture);
    }
});

test('crossing the W slice plane performs a clean destination handoff and reverse traversal', function bidirectionalSliceHandoff() {
    const fixture = createFixture();
    try {
        enter(fixture);
        fixture.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: 1, turn: 0, sprint: false };
        for (let index = 0; index < 30 && fixture.controller.state === 'transit'; index++) {
            fixture.controller.update(0.1);
        }
        assert.equal(fixture.controller.state, 'idle');
        assert.equal(fixture.controller.currentSliceId, 'slice-b');
        assert.equal(fixture.player.sliceId, 'slice-b');
        assert.equal(fixture.player.worldPosition.y, 1);
        assert.equal(fixture.movement.terrain, fixture.destination.terrain);
        assert.deepEqual(fixture.movement.movementProfile, fixture.destination.movementProfile);
        assert.equal(fixture.movement.movementSuspended, false);
        assert.equal(fixture.corridorChunk.occupants.has(fixture.player), false);
        assert.equal(fixture.changes.at(-1).state.transitioning, false);
        assert.ok(fixture.controller.entryLock);

        // Step away from the arrival mouth, then face it to enter from the other slice.
        fixture.player.worldPosition.z = -3.3;
        fixture.player.yaw = 0;
        fixture.movement.input = { forward: 1, strafe: 0, vertical: 0, crossSectionW: -1, turn: 0, sprint: false };
        fixture.controller.update(0);
        assert.equal(fixture.controller.state, 'transit');
        assert.equal(fixture.controller.direction, -1);
        for (let index = 0; index < 30 && fixture.controller.state === 'transit'; index++) {
            fixture.controller.update(0.1);
        }
        assert.equal(fixture.controller.state, 'idle');
        assert.equal(fixture.controller.currentSliceId, 'slice-a');
        assert.equal(fixture.player.sliceId, 'slice-a');
        assert.equal(fixture.player.worldPosition.y, 0);
        assert.deepEqual(fixture.movement.movementProfile, fixture.source.movementProfile);
        assert.equal(fixture.corridorChunk.occupants.has(fixture.player), false);
    } finally {
        cleanup(fixture);
    }
});

test('the smooth W-freedom field begins outside the bounded anomaly and scales approach movement', function approachInfluenceMovement() {
    const fixture = createFixture({
        playerPosition: { x: 0, y: 0, z: -5.5 },
        input: { forward: 0, crossSectionW: 1 },
        anomaly: {
            influence: {
                center: { x: 0, y: 0, z: 0, w: 5 },
                horizonRadius: 12,
                innerRadius: 1,
                maxWReach: 10,
                maxWMovementScale: 1
            }
        }
    });
    try {
        // z=-5.5 is beyond the formal z=-5 anomaly boundary, but still within
        // the 4D spherical horizon. The player should feel a small W response.
        assert.equal(fixture.controller.isInsideRegion(
            fixture.controller.getAmbientPlayerPosition()
        ), false);
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.state, 'idle');
        assert.ok(fixture.player.spatialPosition4D.w > 0);
        assert.ok(fixture.player.spatialPosition4D.w < 0.4);
    } finally {
        cleanup(fixture);
    }
});

test('W movement reaches full speed in the anomaly inner sphere', function fullInnerFreedom() {
    const fixture = createFixture({
        playerPosition: { x: 0, y: 0, z: 0 },
        input: { forward: 0, crossSectionW: 1 },
        anomaly: {
            influence: {
                center: { x: 0, y: 0, z: 0, w: 5 },
                horizonRadius: 12,
                innerRadius: 2,
                maxWReach: 10,
                maxWMovementScale: 1
            }
        }
    });
    try {
        fixture.player.spatialPosition4D = { x: 0, y: 0, z: 0, w: 5 };
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.state, 'idle');
        assert.ok(Math.abs(fixture.player.spatialPosition4D.w - 5.4) < 1e-9);
    } finally {
        cleanup(fixture);
    }
});


test('controller exposes the player-stat modifier hook to movement and chunk reachability', function playerStatInfluenceHook() {
    const fixture = createFixture({
        playerPosition: { x: 0, y: 0, z: 0 },
        getInfluenceModifiers: () => ({ freedomMultiplier: 0.25, reachMultiplier: 0.5 })
    });
    try {
        const influence = fixture.controller.getAnomalyInfluence({ x: 0, y: 0, z: 0, w: 5 });
        assert.equal(influence.freedom, 0.25);
        assert.equal(influence.wMovementScale, 0.25);
        assert.equal(influence.wReach, 1.25);
    } finally {
        cleanup(fixture);
    }
});


test('continuous W freedom permits movement in both directions from either connected slice', function bidirectionalAmbientWFreedom() {
    const sourceSide = createFixture({
        playerPosition: { x: 0, y: 0, z: 0 },
        input: { forward: 0, crossSectionW: -1 },
        anomaly: { influence: {
            center: { x: 0, y: 0, z: 5, w: 5 },
            horizonRadius: 20, innerRadius: 1, maxWReach: 10, maxWMovementScale: 1
        } }
    });
    const destinationSide = createFixture({
        playerPosition: { x: 0, y: 1, z: 0 },
        initialSliceId: 'slice-b',
        input: { forward: 0, crossSectionW: 1 },
        anomaly: { influence: {
            center: { x: 0, y: 0, z: 0, w: 5 },
            horizonRadius: 20, innerRadius: 1, maxWReach: 10, maxWMovementScale: 1
        } }
    });
    try {
        const sourcePosition = sourceSide.controller.getAmbientPlayerPosition();
        assert.ok(sourceSide.controller.getInfluenceMovementInfo(sourcePosition, -1));
        assert.ok(sourceSide.controller.getInfluenceMovementInfo(sourcePosition, 1));
        sourceSide.controller.update(0.1);
        const belowSourceSlice = sourceSide.player.spatialPosition4D.w;
        assert.ok(belowSourceSlice < 0, `expected negative W displacement, got ${belowSourceSlice}`);
        sourceSide.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: 1, turn: 0, sprint: false };
        sourceSide.controller.update(0.1);
        assert.ok(sourceSide.player.spatialPosition4D.w > belowSourceSlice);

        const destinationPosition = destinationSide.controller.getAmbientPlayerPosition();
        assert.ok(destinationSide.controller.getInfluenceMovementInfo(destinationPosition, -1));
        assert.ok(destinationSide.controller.getInfluenceMovementInfo(destinationPosition, 1));
        destinationSide.controller.update(0.1);
        const aboveDestinationSlice = destinationSide.player.spatialPosition4D.w;
        assert.ok(aboveDestinationSlice > destinationSide.destination.slice.w);
        destinationSide.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: -1, turn: 0, sprint: false };
        destinationSide.controller.update(0.1);
        assert.ok(destinationSide.player.spatialPosition4D.w < aboveDestinationSlice);
    } finally {
        cleanup(sourceSide);
        cleanup(destinationSide);
    }
});


test('bounded anomaly permits independent negative and positive W exploration around its source plane', function anomalyWOverhang() {
    const fixture = createFixture({
        playerPosition: { x: 0, y: 0, z: -2 },
        input: { forward: 1, crossSectionW: 0 },
        anomaly: {
            influence: {
                center: { x: 0, y: 0, z: 0, w: 5 },
                horizonRadius: 30,
                innerRadius: 1,
                maxWReach: 10,
                maxWMovementScale: 1
            }
        }
    });
    try {
        enter(fixture);
        fixture.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: -1, turn: 0, sprint: false };
        for (let index = 0; index < 100; index++) fixture.controller.update(0.1);
        const belowSource = fixture.controller.getState().position4D.w;
        assert.equal(belowSource, fixture.anomaly.region.min.w);
        assert.equal(fixture.controller.state, 'transit');

        fixture.movement.input.crossSectionW = 1;
        for (let index = 0; index < 30; index++) fixture.controller.update(0.1);
        const aboveSource = fixture.controller.getState().position4D.w;
        assert.ok(aboveSource > fixture.source.slice.w, `expected positive W after reversing, got ${aboveSource}`);
        assert.equal(fixture.controller.state, 'transit');
    } finally {
        cleanup(fixture);
    }
});


test('player anomaly traversal clamps its local position before Poincare projection', function constrainPlayerToPoincareChart() {
    const fixture = createFixture({ playerPosition: { x: 0, y: 0, z: -2 } });
    try {
        const transform = new SpatialTransform({
            geometry: 'poincare', renderScale: 24,
            bounds: {
                minX: -10, maxX: 10,
                minY: -5, maxY: 5,
                minZ: -10, maxZ: 10,
                characteristicLength: 1,
                boundaryEpsilon: 1e-5
            }
        });
        fixture.source.transform = transform;
        fixture.player.transform = transform;
        fixture.player.setWorldPosition = function setProjectedPosition(position) {
            this.worldPosition = { ...position };
            transform.worldToRender(this.worldPosition);
        };
        fixture.anomaly.region.min.y = -12;
        fixture.movement.input = { forward: 1, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false };
        enter(fixture);
        fixture.movement.input = { forward: 0, strafe: 0, vertical: -1, crossSectionW: 0, turn: 0, sprint: false };
        assert.doesNotThrow(() => {
            for (let index = 0; index < 30; index++) fixture.controller.update(0.1);
        });
        assert.ok(fixture.player.worldPosition.y > -5);
        assert.ok(fixture.controller.getState().position4D.y > -5);
        assert.doesNotThrow(() => transform.worldToRender(fixture.player.worldPosition));
    } finally {
        cleanup(fixture);
    }
});


test('main-world handoff applies its faster movement profile and preserves bidirectional W freedom', function mainWorldWFreedomAndSpeed() {
    const fixture = createFixture({
        playerPosition: { x: 0, y: 0, z: -2 },
        input: { forward: 1, crossSectionW: 0 },
        destinationMovementProfile: { walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 }
    });
    try {
        enter(fixture);
        fixture.movement.input = { forward: 0, strafe: 0, vertical: 0, crossSectionW: 1, turn: 0, sprint: false };
        for (let index = 0; index < 40 && fixture.controller.state === 'transit'; index++) {
            fixture.controller.update(0.1);
        }
        assert.equal(fixture.controller.currentSliceId, fixture.destination.slice.id);
        assert.deepEqual(fixture.movement.movementProfile, {
            walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2
        });

        const onMainWorld = fixture.controller.getAmbientPlayerPosition();
        assert.ok(fixture.controller.getInfluenceMovementInfo(onMainWorld, -1));
        assert.ok(fixture.controller.getInfluenceMovementInfo(onMainWorld, 1));

        fixture.movement.input.crossSectionW = 1;
        fixture.controller.update(0.1);
        const aboveMainSlice = fixture.player.spatialPosition4D.w;
        assert.ok(aboveMainSlice > fixture.destination.slice.w);

        fixture.movement.input.crossSectionW = -1;
        fixture.controller.update(0.1);
        assert.ok(fixture.player.spatialPosition4D.w < aboveMainSlice);
    } finally {
        cleanup(fixture);
    }
});

test('destination handoff clamps arrival coordinates before entering a bounded Poincare chart', function destinationPoincareChartHandoff() {
    const destinationTransform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        bounds: {
            minX: -2, maxX: 2,
            minY: -2, maxY: 2,
            minZ: -2, maxZ: 2,
            characteristicLength: 1,
            boundaryEpsilon: 1e-5
        }
    });
    const fixture = createFixture({ destinationTransform });
    try {
        const ambient = sliceToAmbient(fixture.destination.slice.frame, { x: 8, y: 0, z: -9 });
        const arrival = fixture.controller.createArrivalPosition(fixture.destination, ambient);
        assert.ok(arrival.x > -2 && arrival.x < 2);
        assert.ok(arrival.y > -2 && arrival.y < 2);
        assert.ok(arrival.z > -2 && arrival.z < 2);
        assert.doesNotThrow(() => destinationTransform.worldToRender(arrival));
    } finally {
        cleanup(fixture);
    }
});
