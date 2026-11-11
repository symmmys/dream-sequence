import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import { SliceTransitionTraversalController } from '../src/world/fields/geometry/slice-transition-traversal-controller.js';

const BUILD_QUERY = 'somnium-20261110-phase18o-active-w-slice-navigation-1';

test('demo topology registers all three default slice-transition anomalies', function demoTopologyStartup() {
    const mainWorld = {
        terrain: { sampleAt(x, z) { return { x, y: 1.25, z }; } },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    };

    const demo = createGeometryDemoTopology(mainWorld);

    assert.equal(demo.corridor.type, 'slice-transition');
    assert.equal(demo.hypercubeCorridor.type, 'slice-transition');
    assert.equal(demo.hypercubeMainCorridor.type, 'slice-transition');
    assert.equal(demo.corridor.view.interiorBoundary, 'open-4d-cylinder');
    assert.equal(demo.hypercubeCorridor.view.interiorBoundary, 'open-4d-cylinder');
    assert.equal(demo.hypercubeMainCorridor.view.interiorBoundary, 'open-4d-cylinder');
    for (const anomaly of [demo.corridor, demo.hypercubeCorridor, demo.hypercubeMainCorridor]) {
        assert.equal(anomaly.view.previewSurface, 'spherical');
        assert.equal(anomaly.view.showRim, false);
    }
    assert.deepEqual(demo.hypercubeMainCorridor.view.interiorBoundaryRadii, { source: 2.8, destination: 7.0 });
    assert.equal(demo.topology.getCorridor(demo.corridor.id).type, 'slice-transition');
    assert.equal(demo.topology.getCorridor(demo.hypercubeCorridor.id).type, 'slice-transition');
    assert.equal(demo.topology.getCorridor(demo.hypercubeMainCorridor.id).type, 'slice-transition');
    assert.equal(demo.chunkGraph.getCorridorChunk(demo.corridor.id).id, demo.corridor.id);
    assert.equal(demo.chunkGraph.getCorridorChunk(demo.hypercubeCorridor.id).id, demo.hypercubeCorridor.id);
    assert.equal(demo.chunkGraph.getCorridorChunk(demo.hypercubeMainCorridor.id).id, demo.hypercubeMainCorridor.id);
});

test('browser demo topology loads a versioned type-aware WorldTopology module', function cacheBustTopologyDependency() {
    const source = readFileSync(new URL('../src/demo/geometry-demo-topology.js', import.meta.url), 'utf8');
    assert.match(source, new RegExp('world-topology\\.js\\?v=' + BUILD_QUERY));
});

test('the 4D chamber has a direct, bidirectional +5-W anomaly to the live main-world slice', function directHypercubeMainWorldConnection() {
    const mainWorld = {
        terrain: { sampleAt(x, z) { return { x, y: 1.25, z }; } },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    };
    const demo = createGeometryDemoTopology(mainWorld);
    const anomaly = demo.hypercubeMainCorridor;
    const sourceAmbientW = demo.hypercubeSlice.frame.origin.w;
    const destinationAmbientW = demo.mainSlice.frame.origin.w;

    assert.equal(demo.hypercubeSlice.w, 75);
    assert.equal(demo.mainSlice.w, 80);
    assert.equal(destinationAmbientW - sourceAmbientW, 5);
    assert.equal(anomaly.source.sliceId, demo.hypercubeSlice.id);
    assert.equal(anomaly.destination.sliceId, demo.mainSlice.id);
    assert.equal(anomaly.traversable, true);
    assert.equal(anomaly.bidirectional, true);
    assert.equal(anomaly.region.min.w, 69);
    assert.equal(anomaly.region.max.w, 86);
    assert.equal(anomaly.region.max.x - anomaly.region.min.x, 14);

    const route = demo.topology.getTraversableNeighbors(demo.hypercubeSlice.id)
        .find((neighbor) => neighbor.corridorId === anomaly.id);
    assert.equal(route.sliceId, demo.mainSlice.id);
    assert.equal(demo.chunkGraph.getCorridorChunk(anomaly.id), demo.hypercubeMainCorridorChunk);
    assert.equal(demo.hypercubeMainDestinationChunkAddress.sliceId, demo.mainSlice.id);
    assert.deepEqual(demo.hypercubeMainDestinationChunkAddress, demo.destinationChunkAddress);
    assert.ok(demo.chunkGraph.getNeighbors(demo.hypercubeMainChunkAddress)
        .some((node) => node.kind === 'corridor' && node.id === anomaly.id));
    assert.ok(demo.chunkGraph.getNeighbors(demo.hypercubeMainDestinationChunkAddress)
        .some((node) => node.kind === 'corridor' && node.id === anomaly.id));
    demo.chunkGraph.dispose();
});

 test('the labeled 4D-room exit traverses exactly +5 W and hands off to the live main-world terrain', function traverseDirectMainWorldExit() {
    const terrain = {
        min: { x: -2000, y: -100, z: -2000 },
        max: { x: 2000, y: 500, z: 2000 },
        sampleAt(x, z) { return { x, y: 1.25, z }; }
    };
    const demo = createGeometryDemoTopology({
        terrain,
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
    const anomaly = demo.hypercubeMainCorridor;
    const sourceTerrain = {
        min: { x: -100, y: -100, z: -100 },
        max: { x: 100, y: 100, z: 100 },
        sampleAt(x, z) { return { x, y: 2.5, z }; }
    };
    const source = {
        slice: demo.hypercubeSlice, transform: {}, terrain: sourceTerrain, layerMask: 1
    };
    const destination = {
        slice: demo.mainSlice, transform: {}, terrain, layerMask: 2
    };
    const player = {
        worldPosition: { ...anomaly.source.position },
        yaw: 0,
        setSpatialContext(transform, sliceId, layerMask) {
            this.transform = transform; this.sliceId = sliceId; this.layerMask = layerMask;
        },
        setWorldPosition(position) { this.worldPosition = { ...position }; }
    };
    const movement = {
        input: { forward: 1, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false },
        getMovementInput() { return { ...this.input }; },
        setMovementSuspended(value) { this.movementSuspended = value; },
        setTerrain(value) { this.terrain = value; }
    };
    const camera = {
        setSpatialContext(transform, layerMask) { this.transform = transform; this.layerMask = layerMask; },
        clearRenderAnchor() {}
    };
    const controller = new SliceTransitionTraversalController({
        player, movementController: movement, cameraController: camera,
        topology: demo.topology, anomaly, chunkGraph: demo.chunkGraph,
        corridorChunk: demo.hypercubeMainCorridorChunk,
        source, destination, initialSliceId: demo.hypercubeSlice.id,
        traversal: { speed: 12, sprintSpeed: 12, entitySpeed: 10 }
    });

    try {
        controller.setActive(true);
        controller.update(0.016);
        assert.equal(controller.getState().state, 'transit');
        assert.equal(movement.movementSuspended, true);
        assert.equal(demo.hypercubeMainCorridorChunk.occupants.has(player), true);

        movement.input = {
            forward: 0, strafe: 0, vertical: 0, crossSectionW: 1, turn: 0, sprint: false
        };
        for (let step = 0; step < 8 && controller.getState().state === 'transit'; step++) {
            controller.update(0.1);
        }

        assert.equal(controller.getState().state, 'idle');
        assert.equal(controller.getState().currentSliceId, demo.mainSlice.id);
        assert.equal(player.sliceId, demo.mainSlice.id);
        assert.deepEqual(player.worldPosition, { x: 18, y: 1.25, z: 0 });
        assert.equal(movement.terrain, terrain);
        assert.equal(movement.movementSuspended, false);
        assert.equal(demo.hypercubeMainCorridorChunk.occupants.has(player), false);
        assert.equal(player.spatialPosition4D, null);
    } finally {
        controller.dispose();
        demo.chunkGraph.dispose();
    }
});

test('the 4D chamber exit has a visible main-world label', function labeledMainWorldExit() {
    const source = readFileSync(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.match(source, /ANOMALY 03\s+\|\s+SOMNIUM MAIN WORLD\s+·\s+W \+5/);
    assert.match(source, /hypercubeMainPortal/);
    assert.match(source, /hypercubeMainCorridorLabel/);
});

test('the Poincare-to-hypercube anomaly exposes a wider entry aperture', function accessiblePoincareExit() {
    const demo = createGeometryDemoTopology({
        terrain: { sampleAt(x, z) { return { x, y: 1.25, z }; } },
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
    assert.equal(demo.hypercubeCorridor.entryRadius, 7.5);
    assert.equal(demo.topology.hasTraversableConnection(demo.sourceSlice.id, demo.hypercubeSlice.id), true);
    demo.chunkGraph.dispose();
});

test('the Poincare-side anomaly can be entered from the widened portal aperture', function enterPoincarePortal() {
    const terrain = {
        min: { x: -100, y: -100, z: -100 },
        max: { x: 100, y: 100, z: 100 },
        sampleAt(x, z) { return { x, y: 1.25, z }; }
    };
    const demo = createGeometryDemoTopology({
        terrain,
        spatialTransform: { geometryName: 'poincare' },
        chunkSize: 2000
    });
    const transform = {
        worldToRender(position) { return { ...position }; },
        renderToWorld(position) { return { ...position }; }
    };
    const hypercubeWorld = {
        slice: demo.hypercubeSlice, transform, terrain, layerMask: 2
    };
    const poincareWorld = {
        slice: demo.sourceSlice, transform, terrain, layerMask: 1
    };
    const player = {
        worldPosition: { x: -18, y: 2.5, z: -6 },
        yaw: 0,
        sliceId: demo.sourceSlice.id,
        setSpatialContext(nextTransform, sliceId, layerMask) {
            this.transform = nextTransform; this.sliceId = sliceId; this.layerMask = layerMask;
        },
        setWorldPosition(position) { this.worldPosition = { ...position }; },
        setLayerMask(mask) { this.layerMask = mask; }
    };
    const movement = {
        input: { forward: 1, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false },
        getMovementInput() { return { ...this.input }; },
        setMovementSuspended(value) { this.movementSuspended = value; },
        setTerrain(value) { this.terrain = value; }
    };
    const camera = {
        setSpatialContext(nextTransform, layerMask) { this.transform = nextTransform; this.layerMask = layerMask; },
        clearRenderAnchor() {}
    };
    const controller = new SliceTransitionTraversalController({
        player, movementController: movement, cameraController: camera,
        topology: demo.topology, anomaly: demo.hypercubeCorridor,
        chunkGraph: demo.chunkGraph, corridorChunk: demo.hypercubeCorridorChunk,
        source: hypercubeWorld, destination: poincareWorld,
        initialSliceId: demo.sourceSlice.id,
        traversal: { speed: 12, sprintSpeed: 18, entitySpeed: 10 }
    });
    try {
        controller.setActive(true);
        controller.update(0);
        assert.equal(controller.getState().state, 'transit');
        assert.equal(controller.getState().currentSliceId, demo.sourceSlice.id);
        assert.equal(movement.movementSuspended, true);
        assert.equal(demo.hypercubeCorridorChunk.occupants.has(player), true);
    } finally {
        controller.dispose();
        demo.chunkGraph.dispose();
    }
});
