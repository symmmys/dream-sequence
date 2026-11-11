import test from 'node:test';
import assert from 'node:assert/strict';

import { createGeometryDemoTopology } from '../src/demo/geometry-demo-topology.js';
import { GeometryDemoWorld } from '../src/demo/geometry-demo-world.js';
import { SliceWorldRegistry } from '../src/world/slice-world-registry.js';
import { OpticalSceneRegistry } from '../src/world/fields/geometry/optical-scene-registry.js';
import { createAnomalyOpticalTracer } from '../src/world/fields/geometry/optical-anomaly-tracer.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import {
    aimOpticalSpotlightSource,
    createOpticalSpotlightSource,
    moveOpticalSpotlightSource,
    projectOpticalSpotlightExitRay,
    rotateOpticalSpotlightSource,
    traceOpticalSpotlightSource
} from '../src/world/fields/geometry/optical-light-source.js';

const IDENTITY_METRIC = { values: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
const IDENTITY_TRANSFORM = Object.freeze({
    metricAtWorld() { return IDENTITY_METRIC; }
});

function fixture() {
    const mainWorld = {
        terrain: { sampleAt(x, z) { return { x, y: 0, z }; } },
        spatialTransform: IDENTITY_TRANSFORM,
        chunkSize: 2000
    };
    const demo = createGeometryDemoTopology(mainWorld);
    const sliceRegistry = new SliceWorldRegistry();
    for (const slice of [demo.sourceSlice, demo.hypercubeSlice, demo.mainSlice]) {
        sliceRegistry.register(slice, { spatialTransform: IDENTITY_TRANSFORM });
    }
    const sceneRegistry = new OpticalSceneRegistry();
    const anomalyId = demo.hypercubeMainCorridor.id;
    const topology = {
        getCorridor: (id) => demo.topology.getCorridor(id),
        getOpticallyConnectedNeighbors: (sliceId) =>
            demo.topology.getOpticallyConnectedNeighbors(sliceId)
                .filter((neighbor) => neighbor.corridorId === anomalyId),
        hasOpticalConnection: (fromSliceId, toSliceId) =>
            demo.topology.getOpticallyConnectedNeighbors(fromSliceId)
                .some((neighbor) => neighbor.corridorId === anomalyId && neighbor.sliceId === toSliceId)
    };
    const tracer = createAnomalyOpticalTracer({
        topology, sliceRegistry, sceneRegistry, chunkGraph: demo.chunkGraph
    });
    return {
        demo, sliceRegistry, sceneRegistry, tracer,
        dispose() {
            sceneRegistry.dispose();
            sliceRegistry.dispose();
            demo.chunkGraph.dispose();
        }
    };
}

function createDefaultSource(demo) {
    const mouth = demo.hypercubeMainCorridor.source.position;
    return aimOpticalSpotlightSource(createOpticalSpotlightSource({
        id: 'test-spot',
        sliceId: demo.hypercubeSlice.id,
        position: { x: mouth.x - 10, y: mouth.y - 0.75, z: mouth.z },
        direction: { x: 1, y: 0, z: 0 },
        range: 64
    }), mouth);
}

test('spotlight source contract normalizes directions and validates optical parameters', () => {
    const source = createOpticalSpotlightSource({
        id: 'valid-spot', sliceId: 'hypercube',
        position: { x: 1, y: 2, z: 3 },
        direction: { x: 0, y: -4, z: 0 }
    });
    assert.deepEqual(source.direction, { x: 0, y: -1, z: 0 });
    assert.equal(source.intensity, 1.8);
    assert.equal(source.castsShadows, true);
    assert.throws(() => createOpticalSpotlightSource({
        id: 'bad-spot', sliceId: 'hypercube', position: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 0 }
    }), /non-zero/);
    assert.throws(() => createOpticalSpotlightSource({
        id: 'bad-angle', sliceId: 'hypercube', position: { x: 0, y: 0, z: 0 },
        direction: { x: 1, y: 0, z: 0 }, coneAngle: Math.PI
    }), /coneAngle/);
});

test('spotlight editing moves its source and rotates its direction without mutating prior state', () => {
    const source = createOpticalSpotlightSource({
        id: 'editable-spot', sliceId: 'hypercube',
        position: { x: 1, y: 2, z: 3 }, direction: { x: 0, y: 0, z: 1 }
    });
    const moved = moveOpticalSpotlightSource(source, { x: 2, y: -1, z: 0.5 });
    assert.deepEqual(moved.position, { x: 3, y: 1, z: 3.5 });
    assert.deepEqual(source.position, { x: 1, y: 2, z: 3 });
    const rotated = rotateOpticalSpotlightSource(moved, Math.PI / 2, Math.PI / 6);
    assert.ok(Math.abs(Math.hypot(
        rotated.direction.x, rotated.direction.y, rotated.direction.z
    ) - 1) < 1e-12);
    assert.ok(rotated.direction.x > 0.8);
    assert.ok(rotated.direction.y > 0.4);
});

test('a spotlight centre ray crosses the authorized 4D anomaly and yields a destination virtual emitter', () => {
    const f = fixture();
    try {
        const source = createDefaultSource(f.demo);
        const result = traceOpticalSpotlightSource({
            source,
            sourceBinding: f.sliceRegistry.require(f.demo.hypercubeSlice.id),
            destinationBinding: f.sliceRegistry.require(f.demo.mainSlice.id),
            tracer: f.tracer,
            anomalyId: f.demo.hypercubeMainCorridor.id
        });
        assert.equal(result.transmitted, true, result.reason);
        assert.equal(result.destinationSliceId, f.demo.mainSlice.id);
        assert.ok(result.energy > 0 && result.energy <= 1);
        assert.deepEqual(result.trace.transitions.map((entry) => entry.direction), [
            'into-anomaly', 'out-of-anomaly'
        ]);
        assert.equal(result.trace.status, 'anomaly-exit');
        assert.equal(result.trace.pathSegments.at(-1)?.kind, 'anomaly');
        assert.ok(Number.isFinite(result.virtualPosition.x));
        assert.ok(Number.isFinite(result.virtualPosition.y));
        assert.ok(Math.abs(Math.hypot(
            result.direction.x, result.direction.y, result.direction.z
        ) - 1) < 1e-9);
        // The default launch is shallow and upward, so both the exit point
        // and its short-offset virtual emitter remain above Main World terrain.
        assert.ok(result.direction.y > 0);
        assert.ok(result.exitPosition.y > 0);
        assert.ok(result.virtualPosition.y > 0);
        assert.ok(result.virtualPosition.y < result.exitPosition.y);
        assert.ok(result.diagnostics.outgoingTransitions === 1);
    } finally {
        f.dispose();
    }
});

test('spotlight transport remains finite with the live Main World Poincare transform', () => {
    const mainTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 10000,
        bounds: { minX: -20000, maxX: 20000, minY: -20000, maxY: 20000,
            minZ: -20000, maxZ: 20000, characteristicLength: 0.25 }
    });
    const sourceTransform = new SpatialTransform({
        geometry: 'poincare', renderScale: 24, visualScaleGamma: 0.72, maxVisualScale: 3.5,
        bounds: { minX: -46, maxX: 46, minY: -5, maxY: 18, minZ: -48, maxZ: 46,
            characteristicLength: 0.7, boundaryEpsilon: 1e-5 }
    });
    const hypercubeTransform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
    const demo = createGeometryDemoTopology({
        terrain: { sampleAt(x, z) { return { x, y: 0, z }; } },
        spatialTransform: mainTransform, chunkSize: 2000
    });
    const sliceRegistry = new SliceWorldRegistry();
    sliceRegistry.register(demo.sourceSlice, { spatialTransform: sourceTransform });
    sliceRegistry.register(demo.hypercubeSlice, { spatialTransform: hypercubeTransform });
    sliceRegistry.register(demo.mainSlice, { spatialTransform: mainTransform });
    const sceneRegistry = new OpticalSceneRegistry();
    const anomalyId = demo.hypercubeMainCorridor.id;
    const topology = {
        getCorridor: (id) => demo.topology.getCorridor(id),
        getOpticallyConnectedNeighbors: (sliceId) => demo.topology.getOpticallyConnectedNeighbors(sliceId)
            .filter((neighbor) => neighbor.corridorId === anomalyId),
        hasOpticalConnection: (fromSliceId, toSliceId) =>
            demo.topology.getOpticallyConnectedNeighbors(fromSliceId)
                .some((neighbor) => neighbor.corridorId === anomalyId && neighbor.sliceId === toSliceId)
    };
    const tracer = createAnomalyOpticalTracer({ topology, sliceRegistry, sceneRegistry, chunkGraph: demo.chunkGraph });
    try {
        const source = createDefaultSource(demo);
        const result = traceOpticalSpotlightSource({
            source, sourceBinding: sliceRegistry.require(demo.hypercubeSlice.id),
            destinationBinding: sliceRegistry.require(demo.mainSlice.id),
            tracer, anomalyId
        });
        assert.equal(result.transmitted, true, result.reason);
        assert.ok(Number.isFinite(result.virtualPosition.x));
        assert.ok(Number.isFinite(result.direction.x));
        assert.ok(result.direction.y > 0, 'default ray should leave the aperture upward');
        assert.ok(result.exitPosition.y > 0, 'default exit should clear the Main World terrain');
        assert.ok(result.virtualPosition.y > 0, 'virtual spotlight should remain above terrain');
        const projected = projectOpticalSpotlightExitRay(result, mainTransform, 400);
        assert.ok(Number.isFinite(projected.endRender.x));
        assert.ok(Number.isFinite(projected.endRender.y));
    } finally {
        sceneRegistry.dispose(); sliceRegistry.dispose(); demo.chunkGraph.dispose();
    }
});

test('transmitted spotlight exposes a projected receiving-side ray segment', () => {
    const f = fixture();
    try {
        const source = createDefaultSource(f.demo);
        const result = traceOpticalSpotlightSource({
            source,
            sourceBinding: f.sliceRegistry.require(f.demo.hypercubeSlice.id),
            destinationBinding: f.sliceRegistry.require(f.demo.mainSlice.id),
            tracer: f.tracer,
            anomalyId: f.demo.hypercubeMainCorridor.id
        });
        assert.equal(result.transmitted, true, result.reason);
        const projected = projectOpticalSpotlightExitRay(result, {
            worldToRender(position) {
                return { x: position.x * 2, y: position.y * 3, z: position.z * 4 };
            }
        }, 25);
        assert.deepEqual(projected.startWorld, result.exitPosition);
        assert.deepEqual(projected.startRender, {
            x: result.exitPosition.x * 2,
            y: result.exitPosition.y * 3,
            z: result.exitPosition.z * 4
        });
        assert.ok(projected.endWorld.x > projected.startWorld.x);
        assert.ok(projected.endWorld.y > projected.startWorld.y);
        assert.equal(projected.length, 25);
    } finally {
        f.dispose();
    }
});

test('a spotlight pointed away from the anomaly produces no receiving-side light', () => {
    const f = fixture();
    try {
        const source = createOpticalSpotlightSource({
            id: 'misaligned-spot',
            sliceId: f.demo.hypercubeSlice.id,
            position: { x: 8, y: 5, z: 0 },
            direction: { x: 0, y: 0, z: 1 },
            range: 24
        });
        const result = traceOpticalSpotlightSource({
            source,
            sourceBinding: f.sliceRegistry.require(f.demo.hypercubeSlice.id),
            destinationBinding: f.sliceRegistry.require(f.demo.mainSlice.id),
            tracer: f.tracer,
            anomalyId: f.demo.hypercubeMainCorridor.id
        });
        assert.equal(result.transmitted, false);
        assert.equal(result.reason, 'max-path-length');
    } finally {
        f.dispose();
    }
});


function shadowMesh(name, x, layerMask = 0x0FFFFFFF, receiveShadows = false) {
    return {
        name, layerMask, position: { x, y: 0, z: 0 }, receiveShadows, isVisible: true,
        isDisposed() { return false; },
        isEnabled() { return true; },
        computeWorldMatrix() {},
        getBoundingInfo() { return { boundingSphere: { centerWorld: this.position } }; }
    };
}

test('GeometryDemoWorld renders the transmitted ray on the Main World layer', () => {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    }
    const line = { metadata: {}, isVisible: false };
    let captured = null;
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = {
        Vector3,
        MeshBuilder: {
            CreateLines(name, options) {
                captured = { name, options };
                return options.instance;
            }
        }
    };
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        destinationSpotlightRayLine: line,
        spotlightDebugRayLength: 40,
        hypercubeSlice: { id: 'hypercube' },
        scene: {}
    });
    try {
        const rendered = GeometryDemoWorld.prototype.updateDestinationSpotlightRay.call(
            world,
            {
                transmitted: true, anomalyId: 'direct-anomaly', destinationSliceId: 'main',
                exitPosition: { x: 1, y: 2, z: 3 },
                direction: { x: 1, y: 0, z: 0 }
            },
            { worldToRender(position) { return { ...position }; } }
        );
        assert.equal(rendered, true);
        assert.equal(captured.name, 'geometryDemoTransmittedSpotlightRay');
        assert.equal(captured.options.points.length, 2);
        assert.deepEqual(captured.options.points[0], new Vector3(1, 2, 3));
        assert.deepEqual(captured.options.points[1], new Vector3(41, 2, 3));
        assert.equal(captured.options.instance, line);
        assert.equal(line.layerMask, 0x0FFFFFFF);
        assert.equal(line.isVisible, true);
        assert.equal(line.metadata.anomalyId, 'direct-anomaly');
        assert.deepEqual(line.metadata.worldEnd, { x: 41, y: 2, z: 3 });
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('receiving spotlight uses bounded Main World shadow casters and restores mesh state', () => {
    const terrain = shadowMesh('main-terrain-chunk', 1);
    const tree = shadowMesh('main-tree-instances', 3, 0x0FFFFFFF, true);
    const portal = shadowMesh('geometryDemoMainPortalPreview', 0);
    const hypercube = shadowMesh('hypercube-tesseract', 0, 0x20000000);
    const distant = shadowMesh('main-rock-distant', 100);
    const added = new Set();
    const removed = new Set();
    const world = Object.create(GeometryDemoWorld.prototype);
    world.scene = { meshes: [tree, portal, hypercube, distant] };
    world.destinationWorldManager = { getMeshes: () => [terrain] };
    world.destinationSpotlight = {
        position: { x: 0, y: 0, z: 0 }, range: 20, includedOnlyMeshes: []
    };
    world.spotlightShadowGenerator = {
        addShadowCaster(mesh) { added.add(mesh); },
        removeShadowCaster(mesh) { removed.add(mesh); }
    };
    world.spotlightShadowCasters = new Set();
    world.spotlightOriginalReceiveShadows = new Map();
    world.spotlightShadowCasterLimit = 2;

    world.updateSpotlightShadowCasters(true);
    assert.deepEqual(new Set(world.destinationSpotlight.includedOnlyMeshes), new Set([terrain, tree]));
    assert.deepEqual(added, new Set([terrain, tree]));
    assert.equal(terrain.receiveShadows, true);
    assert.equal(tree.receiveShadows, true);
    assert.equal(portal.receiveShadows, false);
    assert.equal(hypercube.receiveShadows, false);
    assert.equal(distant.receiveShadows, false);

    world.clearOpticalSpotlightShadowCasters();
    assert.deepEqual(removed, new Set([terrain, tree]));
    assert.equal(terrain.receiveShadows, false);
    assert.equal(tree.receiveShadows, true);
    assert.deepEqual(world.destinationSpotlight.includedOnlyMeshes, []);
});

test('receiving spotlight remains useful without a shadow generator', () => {
    const terrain = shadowMesh('main-terrain-chunk', 1);
    const world = Object.create(GeometryDemoWorld.prototype);
    world.scene = { meshes: [] };
    world.destinationWorldManager = { getMeshes: () => [terrain] };
    world.destinationSpotlight = {
        position: { x: 0, y: 0, z: 0 }, range: 20, includedOnlyMeshes: []
    };
    world.spotlightShadowGenerator = null;
    world.spotlightShadowCasters = new Set();
    world.spotlightOriginalReceiveShadows = new Map();
    world.spotlightShadowCasterLimit = 2;

    world.updateSpotlightShadowCasters(true);
    assert.deepEqual(world.destinationSpotlight.includedOnlyMeshes, [terrain]);
    assert.equal(terrain.receiveShadows, false);
});


test('spotlight cleanup resets Babylon includedOnlyMeshes with an array, never null', () => {
    let includedOnlyMeshes = [];
    const light = {
        position: { x: 0, y: 0, z: 0 },
        range: 20
    };
    Object.defineProperty(light, 'includedOnlyMeshes', {
        configurable: true,
        get() { return includedOnlyMeshes; },
        set(value) {
            // Babylon 9.35 Light setter immediately hooks array.push/splice.
            if (!Array.isArray(value)) throw new TypeError('includedOnlyMeshes must be an array');
            includedOnlyMeshes = value;
            const oldPush = value.push;
            value.push = (...items) => oldPush.apply(value, items);
            const oldSplice = value.splice;
            value.splice = (...args) => oldSplice.apply(value, args);
        }
    });

    const world = Object.create(GeometryDemoWorld.prototype);
    world.destinationSpotlight = light;
    world.spotlightShadowGenerator = null;
    world.spotlightShadowCasters = new Set();
    world.spotlightOriginalReceiveShadows = new Map();

    assert.doesNotThrow(() => world.clearOpticalSpotlightShadowCasters());
    assert.ok(Array.isArray(light.includedOnlyMeshes));
    assert.equal(light.includedOnlyMeshes.length, 0);
});

test('spotlight initialization satisfies Babylon Light includedOnlyMeshes array setter', () => {
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        copyFrom(value) { this.x = value.x; this.y = value.y; this.z = value.z; }
        static Zero() { return new Vector3(); }
    }
    class StrictSpotLight {
        constructor(name, position, direction, angle, exponent) {
            this.name = name;
            this.position = position;
            this.direction = direction;
            this.angle = angle;
            this.exponent = exponent;
            this._includedOnlyMeshes = [];
            this.includedOnlyMeshes = [];
        }
        get includedOnlyMeshes() { return this._includedOnlyMeshes; }
        set includedOnlyMeshes(value) {
            if (!Array.isArray(value)) throw new TypeError('includedOnlyMeshes must be an array');
            this._includedOnlyMeshes = value;
            const push = value.push;
            value.push = (...items) => push.apply(value, items);
            const splice = value.splice;
            value.splice = (...args) => splice.apply(value, args);
        }
        setEnabled(value) { this.enabled = Boolean(value); }
        isEnabled() { return Boolean(this.enabled); }
        dispose() { this.disposed = true; }
    }
    class Color3 {
        static FromArray(values) { return new Color3(values[0], values[1], values[2]); }
        static Black() { return new Color3(0, 0, 0); }
        constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
        scale(amount) { return new Color3(this.r * amount, this.g * amount, this.b * amount); }
    }
    class StandardMaterial {
        constructor(name) { this.name = name; }
        dispose() { this.disposed = true; }
    }
    const fakeMesh = (name) => ({
        name, position: new Vector3(), dispose() { this.disposed = true; }
    });
    const fakeBabylon = {
        Vector3,
        Color3,
        SpotLight: StrictSpotLight,
        StandardMaterial,
        MeshBuilder: {
            CreateSphere(name) { return fakeMesh(name); },
            CreateLines(name, options) { return options.instance ?? fakeMesh(name); }
        }
    };

    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = fakeBabylon;
    const world = Object.create(GeometryDemoWorld.prototype);
    world.hypercubeMainCorridor = {
        id: 'hypercube-main-world',
        source: { position: { x: 0, y: 0, z: 0 } },
        optics: { enabled: true }
    };
    world.hypercubeSlice = { id: 'hypercube' };
    world.hypercubeWorld = { transform: { worldToRender: (position) => ({ ...position }) } };
    world.destination = { slice: { id: 'main-world' } };
    world.topology = {};
    world.registry = {};
    world.opticalScene = null;
    world.scene = { meshes: [] };

    try {
        assert.doesNotThrow(() => world.initializeOpticalSpotlight());
        assert.ok(Array.isArray(world.destinationSpotlight.includedOnlyMeshes));
        assert.equal(world.destinationSpotlight.includedOnlyMeshes.length, 0);
        world.disposeOpticalSpotlight();
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});


test('receiving spotlight and debug ray are rebased to the separated Main World portal mouth', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    world.portalPairs = [{
        corridor: {
            id: 'direct-anomaly',
            source: { sliceId: 'hypercube', position: { x: 18, y: 2.5, z: 0 } },
            destination: { sliceId: 'main', position: { x: 18, y: 0, z: 0 } }
        },
        presentationEndpointsBySlice: {
            main: { x: 260, y: 35, z: -2 }
        }
    }];
    const result = {
        transmitted: true,
        anomalyId: 'direct-anomaly',
        destinationSliceId: 'main',
        exitPosition: { x: 18, y: 1.5, z: 0 },
        virtualPosition: { x: 17.5, y: 1.5, z: 0 },
        direction: { x: 1, y: 0, z: 0 },
        energy: 1
    };
    const mapped = GeometryDemoWorld.prototype.mapOpticalSpotlightResultToPresentation.call(world, result);
    assert.deepEqual(mapped.presentationOffset, { x: 242, z: -2 });
    assert.deepEqual(mapped.exitPosition, { x: 260, y: 1.5, z: -2 });
    assert.deepEqual(mapped.virtualPosition, { x: 259.5, y: 1.5, z: -2 });
    assert.deepEqual(result.exitPosition, { x: 18, y: 1.5, z: 0 }, 'canonical trace must remain immutable');
});

test('P toggles the optical test source and transmitted ray without changing edit mode', () => {
    const calls = [];
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true, disposed: false,
        spotlightTestRayEnabled: true,
        spotlightEditorActive: false,
        spotlightSource: { enabled: true },
        spotlightSourceLight: { setEnabled(value) { calls.push(['source-light', value]); } },
        destinationSpotlight: { intensity: 1, setEnabled(value) { calls.push(['destination-light', value]); } },
        destinationSpotlightRayLine: { isVisible: true },
        clearOpticalSpotlightShadowCasters() { calls.push(['clear-shadows']); }
    });
    let prevented = 0;
    let stopped = 0;
    const event = {
        code: 'KeyP', repeat: false, ctrlKey: false, metaKey: false, altKey: false,
        target: { tagName: 'CANVAS' },
        preventDefault() { prevented++; },
        stopImmediatePropagation() { stopped++; }
    };
    GeometryDemoWorld.prototype.handleSpotlightEditorKeyDown.call(world, event);
    assert.equal(world.spotlightTestRayEnabled, false);
    assert.equal(world.spotlightSource.enabled, false);
    assert.equal(world.destinationSpotlightRayLine.isVisible, false);
    assert.equal(world.destinationSpotlight.intensity, 0);
    assert.equal(world.spotlightEditorActive, false);
    assert.deepEqual(calls, [['source-light', false], ['destination-light', false], ['clear-shadows']]);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);

    GeometryDemoWorld.prototype.handleSpotlightEditorKeyDown.call(world, event);
    assert.equal(world.spotlightTestRayEnabled, true);
    assert.equal(world.spotlightSource.enabled, true);
    assert.equal(world.spotlightNeedsTrace, true);
});

test('spotlight edit mode captures mouse drag and rotates the source aim', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    const canvas = {};
    const start = createOpticalSpotlightSource({
        id: 'drag-test', sliceId: 'hypercube', position: { x: 0, y: 1, z: 0 },
        direction: { x: 0, y: 0, z: 1 }
    });
    Object.assign(world, {
        active: true, disposed: false, spotlightEditorActive: true,
        spotlightSource: start, spotlightNeedsTrace: false,
        spotlightPointerSensitivity: 0.0035,
        scene: { getEngine() { return { getRenderingCanvas() { return canvas; } }; } },
        syncSpotlightSourcePresentation() {}
    });
    GeometryDemoWorld.prototype.handleSpotlightPointerDown.call(world, {
        button: 0, target: canvas, clientX: 10, clientY: 10,
        preventDefault() {}, stopImmediatePropagation() {}
    });
    GeometryDemoWorld.prototype.handleSpotlightPointerMove.call(world, {
        clientX: 80, clientY: 30, preventDefault() {}, stopImmediatePropagation() {}
    });
    assert.notDeepEqual(world.spotlightSource.direction, start.direction);
    assert.equal(world.spotlightNeedsTrace, true);
    assert.equal(world.spotlightPointerDragging, true);
    GeometryDemoWorld.prototype.handleSpotlightPointerUp.call(world);
    assert.equal(world.spotlightPointerDragging, false);
});
