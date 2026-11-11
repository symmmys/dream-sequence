import assert from 'node:assert/strict';
import test from 'node:test';
import { CorridorTraversalNetwork } from '../src/demo/corridor-traversal-network.js';
import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import { GeometryDemoWorld } from '../src/demo/geometry-demo-world.js';
import { SliceTransitionTraversalController } from '../src/world/fields/geometry/slice-transition-traversal-controller.js';

function createRuntimeFixture() {
    const terrain = {
        min: { x: -20000, y: -2000, z: -20000 },
        max: { x: 20000, y: 1000, z: 20000 },
        sampleAt(x, z) { return { x, y: 137, z }; }
    };
    const roomTerrain = {
        min: { x: -40, y: -100, z: -40 },
        max: { x: 40, y: 100, z: 40 },
        sampleAt(x, z) { return { x, y: 0, z }; }
    };
    const transform = {
        worldToRender(position) { return { ...position }; },
        renderToWorld(position) { return { ...position }; },
        constrainWorldPosition(position) { return { ...position }; }
    };
    const topologyData = createGeometryDemoTopology({
        terrain,
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
    const makeWorld = (slice, worldTerrain, layerMask, movementProfile) => ({
        slice, transform, terrain: worldTerrain, layerMask,
        movementProfile: { ...movementProfile }
    });
    const roomProfile = { walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.4 };
    const mainProfile = { walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 };
    const hypercubeWorld = makeWorld(topologyData.hypercubeSlice, roomTerrain, 1, roomProfile);
    const poincareWorld = makeWorld(topologyData.sourceSlice, roomTerrain, 2, roomProfile);
    const poincareExitWorld = makeWorld(topologyData.sourceSlice, roomTerrain, 2, roomProfile);
    const mainWorld = makeWorld(topologyData.mainSlice, terrain, 4, mainProfile);

    const player = {
        worldPosition: { x: 18, y: 137, z: -2 },
        yaw: 0,
        sliceId: topologyData.mainSlice.id,
        spatialPosition4D: null,
        setSpatialContext(nextTransform, sliceId, layerMask) {
            this.transform = nextTransform;
            this.sliceId = sliceId;
            this.layerMask = layerMask;
        },
        setWorldPosition(position) { this.worldPosition = { ...position }; },
        setLayerMask(layerMask) { this.layerMask = layerMask; }
    };
    const movement = {
        input: { forward: 0, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false },
        turnSpeed: 2.2,
        getMovementInput() { return { ...this.input }; },
        setMovementSuspended(value) { this.movementSuspended = value; },
        setTerrain(value) { this.terrain = value; },
        setMovementProfile(value) { this.movementProfile = { ...value }; }
    };
    const camera = {
        setSpatialContext(nextTransform, layerMask) {
            this.transform = nextTransform;
            this.layerMask = layerMask;
        },
        clearRenderAnchor() {}
    };
    const makeController = (anomaly, source, destination) =>
        new SliceTransitionTraversalController({
            player,
            movementController: movement,
            cameraController: camera,
            topology: topologyData.topology,
            anomaly,
            chunkGraph: topologyData.chunkGraph,
            corridorChunk: topologyData.chunkGraph.getCorridorChunk(anomaly.id),
            source,
            destination,
            initialSliceId: topologyData.hypercubeSlice.id,
            traversal: { speed: 12, sprintSpeed: 18, entitySpeed: 10 }
        });

    const controllers = [
        makeController(topologyData.hypercubeCorridor, hypercubeWorld, poincareExitWorld),
        makeController(topologyData.hypercubeMainCorridor, hypercubeWorld, mainWorld),
        makeController(topologyData.corridor, poincareWorld, mainWorld)
    ];
    const network = new CorridorTraversalNetwork({
        topology: topologyData.topology,
        worlds: new Map([
            [topologyData.hypercubeSlice.id, hypercubeWorld],
            [topologyData.sourceSlice.id, poincareWorld],
            [topologyData.mainSlice.id, mainWorld]
        ]),
        controllers,
        initialSliceId: topologyData.mainSlice.id
    });
    network.setActive(true);

    // Model the state immediately after the player has exited the direct
    // Hypercube -> Main World anomaly. The exit lock prevents instant bounce.
    network.syncSlice(topologyData.mainSlice.id);
    network.currentSliceId = topologyData.mainSlice.id;
    controllers[1].entryLock = {
        sliceId: topologyData.mainSlice.id,
        position: { x: 18, y: 137, z: 0 }
    };

    return {
        topologyData, player, movement, camera, controllers, network,
        hypercubeWorld, poincareWorld, mainWorld, mainProfile
    };
}

function disposeRuntime(fixture) {
    fixture.network.dispose();
    fixture.topologyData.chunkGraph.dispose();
}

test('Main World ambient position resolves through a controller that owns that slice', function mainWorldAmbientPosition() {
    const fixture = createRuntimeFixture();
    try {
        const position = fixture.network.getAmbientPlayerPosition();
        assert.ok(position, 'Main World ambient position should not be null');
        assert.deepEqual(position, { x: 18, y: 2.5, z: -2, w: 80 });
        const directRoute = fixture.network.getRouteForSlice(
            fixture.topologyData.mainSlice.id,
            fixture.topologyData.hypercubeMainCorridor.id
        );
        assert.ok(directRoute);
        assert.ok(directRoute.controller.getAnomalyInfluence(position).wMovementScale > 0);
    } finally {
        disposeRuntime(fixture);
    }
});

test('W freedom remains usable on the Main World side and supports movement back toward the connected slice', function mainWorldWFreedom() {
    const fixture = createRuntimeFixture();
    try {
        const initial = fixture.network.getAmbientPlayerPosition();
        fixture.movement.input.crossSectionW = -1;
        assert.equal(fixture.network.advanceAmbientInfluenceMovement(0.1), true);
        const below = fixture.network.getAmbientPlayerPosition();
        assert.ok(below.w < initial.w);
        assert.ok(below.w > fixture.topologyData.hypercubeSlice.w);

        fixture.movement.input.crossSectionW = 1;
        assert.equal(fixture.network.advanceAmbientInfluenceMovement(0.1), true);
        const returned = fixture.network.getAmbientPlayerPosition();
        assert.ok(returned.w > below.w);
    } finally {
        disposeRuntime(fixture);
    }
});

test('player can re-enter the direct anomaly from the Main World after clearing the exit lock', function mainWorldAnomalyReentry() {
    const fixture = createRuntimeFixture();
    try {
        fixture.movement.input.forward = 1;
        fixture.player.yaw = 0;
        fixture.network.update(1 / 60);
        assert.equal(fixture.network.state, 'transit');
        assert.equal(fixture.network.corridor.id, fixture.topologyData.hypercubeMainCorridor.id);
        assert.equal(fixture.controllers[1].direction, -1);
        assert.equal(fixture.movement.movementSuspended, true);
    } finally {
        disposeRuntime(fixture);
    }
});

test('Main World HUD reports active W freedom when its connected ambient field is available', function mainWorldHudFreedom() {
    const fixture = createRuntimeFixture();
    const updates = [];
    try {
        const world = {
            hypercubeSlice: fixture.topologyData.hypercubeSlice,
            lastHypercubeSliceLabel: null,
            cameraController: {
                mode: 'follow',
                getViewSliceId() { return fixture.topologyData.mainSlice.id; }
            },
            traversalController: fixture.network,
            onSliceInfoChanged(label, info) { updates.push({ label, info }); }
        };
        const mainPosition = fixture.network.getAmbientPlayerPosition();
        GeometryDemoWorld.prototype.updateHypercubeSliceHud.call(world);
        assert.equal(updates.length, 1);
        assert.match(updates[0].label, /^W FREEDOM ACTIVE · \d+%$/);
        assert.equal(updates[0].info.position4D.w, mainPosition.w);
    } finally {
        disposeRuntime(fixture);
    }
});


test('mouth orientations rotate the player heading into the destination mouth frame', function mouthOrientationHandoff() {
    const fixture = createRuntimeFixture();
    try {
        const controller = fixture.controllers[1];
        controller.corridor.source.orientation = { x: 0, y: 0, z: 0, w: 1 };
        controller.corridor.destination.orientation = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
        fixture.player.yaw = 0.25;
        controller.applyEndpointOrientation(fixture.hypercubeWorld, fixture.mainWorld);
        assert.ok(Math.abs(fixture.player.yaw - (0.25 + Math.PI / 2)) < 1e-10);
        controller.applyEndpointOrientation(fixture.mainWorld, fixture.hypercubeWorld);
        assert.ok(Math.abs(fixture.player.yaw - 0.25) < 1e-10);
    } finally {
        disposeRuntime(fixture);
    }
});

test('a saved custom anomaly can be registered as a new live portal traversal route', function dynamicRuntimeRoute() {
    const fixture = createRuntimeFixture();
    try {
        const custom = {
            ...fixture.topologyData.corridor,
            id: 'user-authored-anomaly-link',
            revision: 1,
            region: { min: { x: -100, y: -100, z: -100, w: -100 }, max: { x: 100, y: 200, z: 100, w: 200 } },
            source: { ...fixture.topologyData.corridor.source, position: { x: 12, y: 2.5, z: 12 } },
            destination: { ...fixture.topologyData.corridor.destination, position: { x: 28, y: 137, z: 18 } },
            visible: true,
            traversable: true,
            bidirectional: true
        };
        fixture.topologyData.topology.registerCorridor(custom);
        const chunk = fixture.topologyData.chunkGraph.registerCorridor(custom.id);
        const controller = new SliceTransitionTraversalController({
            player: fixture.player,
            movementController: fixture.movement,
            cameraController: fixture.camera,
            topology: fixture.topologyData.topology,
            anomaly: fixture.topologyData.topology.getCorridor(custom.id),
            chunkGraph: fixture.topologyData.chunkGraph,
            corridorChunk: chunk,
            source: fixture.poincareWorld,
            destination: fixture.mainWorld,
            initialSliceId: fixture.network.currentSliceId
        });
        fixture.network.addController(controller);
        const route = fixture.network.getRouteForSlice(
            fixture.topologyData.sourceSlice.id,
            custom.id
        );
        assert.ok(route);
        assert.equal(route.controller, controller);
        assert.equal(route.corridor.destination.sliceId, fixture.topologyData.mainSlice.id);
        assert.equal(fixture.topologyData.chunkGraph.getCorridorChunk(custom.id).id, custom.id);
        assert.equal(fixture.network.removeController(custom.id), true);
        fixture.topologyData.chunkGraph.removeCorridor(custom.id);
        fixture.topologyData.topology.removeCorridor(custom.id);
    } finally {
        disposeRuntime(fixture);
    }
});
