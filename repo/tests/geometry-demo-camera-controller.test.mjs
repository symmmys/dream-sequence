import assert from 'node:assert/strict';
import test from 'node:test';
import { GeometryDemoCameraController } from '../src/demo/geometry-demo-camera-controller.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';
import { createSliceTransitionAnomaly } from '../src/world/fields/geometry/spatial-anomaly.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    set(x, y, z) { Object.assign(this, { x, y, z }); }
}

class Camera {
    constructor() {
        this.position = new Vector3();
        this.layerMask = 1;
    }
    setTarget(target) { this.target = target; }
    getForwardRay() {
        const dx = this.target.x - this.position.x;
        const dy = this.target.y - this.position.y;
        const dz = this.target.z - this.position.z;
        const length = Math.hypot(dx, dy, dz) || 1;
        return { direction: new Vector3(dx / length, dy / length, dz / length) };
    }
}

function createFixture(options = {}) {
    const previousBabylon = globalThis.BABYLON;
    const previousWindow = globalThis.window;
    globalThis.BABYLON = {
        Vector3,
        Scalar: { Clamp: clamp }
    };
    const windowListeners = new Map();
    globalThis.window = {
        addEventListener(name, callback) { windowListeners.set(name, callback); },
        removeEventListener(name) { windowListeners.delete(name); }
    };
    const canvasListeners = new Map();
    const canvas = {
        addEventListener(name, callback) { canvasListeners.set(name, callback); },
        removeEventListener(name) { canvasListeners.delete(name); }
    };
    const scene = { getEngine() { return { getRenderingCanvas() { return canvas; } }; } };
    const camera = new Camera();
    camera.position.set(0, 0, -2);
    camera.setTarget(new Vector3(0, 0, 0));
    const character = { worldPosition: { x: 0, y: 0, z: -2 }, yaw: 0, sliceId: 'room' };
    const playerController = {
        inputEnabled: true,
        setInputEnabled(value) { this.inputEnabled = value; }
    };
    const source = createWorld('room', 1);
    const destination = createWorld('main', 2);
    const renderer = createRenderer(0);
    const reverseRenderer = createRenderer(100);
    const traversal = {
        state: options.playerInTransit ? 'transit' : 'idle',
        currentSliceId: 'room',
        corridorLength: 10,
        worlds: new Map([['room', source], ['main', destination]]),
        corridor: {
            id: 'test-corridor',
            source: { sliceId: 'room' },
            destination: { sliceId: 'main' }
        },
        topology: {
            getTraversableNeighbors(sliceId) {
                if (sliceId === 'room') return [{ corridorId: 'test-corridor', sliceId: 'main' }];
                return [{ corridorId: 'test-corridor', sliceId: 'room' }];
            }
        },
        renderers: new Map([['room', renderer], ['main', reverseRenderer]]),
        renderer,
        activeRenderer: renderer,
        direction: 1,
        progress: 0.4,
        offsetU: 0,
        offsetV: 0,
        offsetW: 0,
        startWorld: source,
        target: destination,
        createArrivalPosition(world, position) { return { x: position.x, y: 1, z: position.z }; }
    };
    const controller = new GeometryDemoCameraController(
        scene, camera, character, source.transform, playerController,
        {
            distance: 2, freeSpeed: 20, freeTransverseSpeed: 5, freeEntryDistance: 12,
            followFocus: options.followFocus ?? null
        }
    );
    controller.setTraversalController(traversal);
    return {
        controller, camera, playerController, traversal, canvasListeners, windowListeners,
        keyDown(code, modifiers = {}) {
            let prevented = false;
            controller.handleFreeKeyDown({ code, repeat: false, ...modifiers, preventDefault() { prevented = true; } });
            return { prevented };
        },
        keyUp(code) { controller.handleFreeKeyUp({ code }); },
        restore() {
            controller.dispose();
            if (previousBabylon === undefined) delete globalThis.BABYLON;
            else globalThis.BABYLON = previousBabylon;
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        }
    };
}

function createWorld(id, layerMask) {
    return {
        slice: createWorldSlice({ id, w: id === 'room' ? 0 : 10 }), layerMask,
        terrain: {
            min: { x: -20, y: -10, z: -20 },
            max: { x: 20, y: 20, z: 20 },
            sampleAt(x, z) { return { x, y: 0, z }; }
        },
        transform: {
            worldToRender(position) { return { ...position }; },
            renderToWorld(position) { return { ...position }; }
        }
    };
}

function createRenderer(offset) {
    return {
        options: { displayScale: 1 },
        getDisplaySample(t) {
            return {
                position: { x: offset, y: 0, z: t * 10 },
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
                spatialPosition4D: { x: 0, y: 0, z: t * 10, w: t * 80 },
                radius: 3
            };
        }
    };
}

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

test('geometry demo camera starts in follow mode and free mode suppresses player input', function followFreeToggle() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        assert.equal(fixture.controller.mode, 'follow');
        assert.equal(fixture.playerController.inputEnabled, true);
        fixture.keyDown('KeyC');
        assert.equal(fixture.controller.mode, 'free');
        assert.equal(fixture.playerController.inputEnabled, false);
        fixture.keyDown('KeyW');
        fixture.controller.update(0.1);
        assert.ok(fixture.camera.position.z > -4);
        fixture.keyDown('KeyC');
        assert.equal(fixture.controller.mode, 'follow');
        assert.equal(fixture.playerController.inputEnabled, true);
    } finally {
        fixture.restore();
    }
});

test('free camera can enter a corridor and independently move along its four frame axes', function freeCorridorAxes() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        assert.ok(fixture.controller.freeTransit);
        fixture.keyUp('KeyW');
        for (const key of ['KeyW', 'KeyD', 'KeyR', 'KeyE']) fixture.keyDown(key);
        fixture.controller.update(0.1);
        const transit = fixture.controller.freeTransit;
        assert.ok(transit.progress > 0);
        assert.ok(transit.offsetU > 0);
        assert.ok(transit.offsetV > 0);
        assert.ok(transit.offsetW > 0);
        assert.ok(transit.spatialPosition4D.w > 0);
    } finally {
        fixture.restore();
    }
});

test('free camera crossing the corridor exit switches to the destination slice', function freeCameraExit() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        fixture.keyUp('KeyW');
        fixture.controller.freeTransit.progress = 0.95;
        fixture.keyDown('KeyW');
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.freeTransit, null);
        assert.equal(fixture.controller.freeSliceId, 'main');
        assert.equal(fixture.camera.layerMask, 2);
        assert.ok(fixture.camera.position.y > 1);
    } finally {
        fixture.restore();
    }
});

test('free camera can be seeded from an active player corridor transit', function inspectActiveTransit() {
    const fixture = createFixture({ playerInTransit: true });
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        assert.ok(fixture.controller.freeTransit);
        assert.equal(fixture.controller.freeTransit.direction, 1);
        assert.ok(fixture.controller.freeTransit.progress < fixture.traversal.progress);
        assert.equal(fixture.playerController.inputEnabled, false);
    } finally {
        fixture.restore();
    }
});


test('free camera mouse-look remains effective while traversing a corridor', function freeCameraCorridorLook() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        fixture.keyUp('KeyW');
        fixture.controller.handleFreePointerDown({
            button: 0, clientX: 100, clientY: 100, preventDefault() {}
        });
        fixture.controller.handleFreePointerMove({ clientX: 180, clientY: 70 });
        const yawBeforeUpdate = fixture.controller.lookYawOffset;
        fixture.controller.update(0.05);
        assert.ok(yawBeforeUpdate > 0);
        assert.equal(fixture.controller.lookYawOffset, yawBeforeUpdate);
        assert.ok(fixture.controller.freePitch > 0);
    } finally {
        fixture.restore();
    }
});


test('free-camera mouse yaw applies each drag delta exactly once', function singleYawDelta() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.controller.handleFreePointerDown({
            button: 0, clientX: 100, clientY: 100, preventDefault() {}
        });
        fixture.controller.handleFreePointerMove({ clientX: 180, clientY: 100 });
        assert.ok(Math.abs(fixture.controller.freeYaw - 0.28) < 1e-9);
    } finally {
        fixture.restore();
    }
});

test('free camera view slice follows its independent corridor handoff', function cameraViewSlice() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        assert.equal(fixture.controller.getViewSliceId(), 'room');
        fixture.controller.setMode('free');
        fixture.controller.freeSliceId = 'main';
        fixture.controller.freePosition = { x: 4, y: 5, z: 6 };
        fixture.controller.freeTransit = null;
        assert.equal(fixture.controller.getViewSliceId(), 'main');
        assert.deepEqual(fixture.controller.getFreeWorldPosition(), { x: 4, y: 5, z: 6 });
        fixture.traversal.state = 'transit';
        fixture.traversal.startWorld = fixture.traversal.worlds.get('room');
        assert.equal(fixture.controller.getViewSliceId(), 'main');
        fixture.controller.freeTransit = {
            startWorld: fixture.traversal.worlds.get('room'),
            targetWorld: fixture.traversal.worlds.get('main')
        };
        assert.equal(fixture.controller.getViewSliceId(), 'room');
    } finally {
        fixture.restore();
    }
});

test('free-camera arrival uses the current endpoint sample rather than the prior frame', function endpointSample() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        fixture.keyUp('KeyW');
        fixture.controller.freeTransit.progress = 0.95;
        fixture.keyDown('KeyW');
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.freeTransit, null);
        assert.ok(fixture.camera.position.z >= 9.9);
    } finally {
        fixture.restore();
    }
});




test('free camera uses E/Q for independent W movement only after entering a slice-transition anomaly', function freeAnomalyWMovement() {
    const fixture = createFixture();
    try {
        const source = fixture.traversal.worlds.get('room');
        const destination = fixture.traversal.worlds.get('main');
        const anomaly = createSliceTransitionAnomaly({
            id: 'free-slice-transition',
            source: { sliceId: 'room', position: { x: 0, y: 0, z: 0 } },
            destination: { sliceId: 'main', position: { x: 0, y: 0, z: 0 } },
            region: {
                min: { x: -5, y: -5, z: -5, w: 0 },
                max: { x: 5, y: 5, z: 5, w: 10 }
            },
            entryRadius: 3.8,
            traversable: true
        });
        fixture.traversal.getRoutesForSlice = (sliceId) => sliceId === 'room'
            ? [{ corridorId: anomaly.id, corridor: anomaly, fromSource: true, sliceId: 'main' }]
            : [{ corridorId: anomaly.id, corridor: anomaly, fromSource: false, sliceId: 'room' }];
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        // The default follow camera sits above the character. Place the inspection
        // camera within the bounded anomaly volume before testing its W control.
        fixture.controller.setFreeView(new Vector3(0, 0, -2), new Vector3(0, 0, 0), 'room');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        assert.equal(fixture.controller.getFreeTransitState().type, 'slice-transition');
        fixture.keyUp('KeyW');
        fixture.keyDown('KeyE');
        fixture.controller.update(0.1);
        assert.ok(fixture.controller.getFreeW() > 0);
        assert.ok(fixture.controller.getFreeTransitState().position4D.w > 0);
        fixture.keyUp('KeyE');
        for (let index = 0; index < 5; index++) {
            fixture.keyDown('KeyE');
            fixture.controller.update(0.1);
        }
        assert.equal(fixture.controller.getFreeTransitState(), null);
        assert.equal(fixture.controller.getViewSliceId(), 'main');
        assert.equal(fixture.camera.layerMask, 2);
        assert.equal(fixture.controller.getFreeW(), 0);
    } finally {
        fixture.restore();
    }
});


test('free camera W movement remains disabled in an ordinary 3D slice', function ordinarySliceLocksWMovement() {
    const fixture = createFixture();
    try {
        const world = fixture.traversal.worlds.get('room');
        world.fourDimensionalRegion = true;
        world.wBounds = { min: -2, max: 2 };
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.keyDown('KeyE');
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.getFreeW(), 0);
        fixture.keyUp('KeyE');
        fixture.keyDown('KeyQ');
        fixture.controller.update(0.1);
        assert.equal(fixture.controller.getFreeW(), 0);
        fixture.keyUp('KeyQ');
        for (let index = 0; index < 20; index++) {
            fixture.keyDown('KeyE');
            fixture.controller.update(0.1);
        }
        assert.equal(fixture.controller.getFreeW(), 0);
    } finally {
        fixture.restore();
    }
});

test('free camera remains inside the open Poincare ball during ordinary movement and corridor checks', function poincareFreeCameraChartBounds() {
    const fixture = createFixture();
    try {
        const world = fixture.traversal.worlds.get('room');
        const transform = new SpatialTransform({
            geometry: 'poincare',
            renderScale: 24,
            bounds: {
                minX: -10, maxX: 10,
                minY: -10, maxY: 10,
                minZ: -10, maxZ: 10,
                characteristicLength: 1
            }
        });
        world.transform = transform;
        fixture.traversal.getRoutesForSlice = () => [];
        fixture.controller.setSpatialContext(transform, world.layerMask);
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');

        const chartRadius = transform.projection.radius * transform.renderScale;
        fixture.controller.setFreeView(
            new Vector3(0, 0, chartRadius * 0.9),
            new Vector3(0, 0, chartRadius * 1.1),
            'room'
        );
        fixture.controller.freeEntryLock = {
            sliceId: 'room', position: { x: 0, y: 0, z: 0 }
        };
        // Simulate a stale/out-of-chart camera position from the prior behavior.
        fixture.controller.freePosition = { x: 0, y: 0, z: chartRadius * 1.2 };
        fixture.keyDown('KeyW');
        for (let index = 0; index < 8; index++) fixture.controller.update(0.1);

        const radius = Math.hypot(
            fixture.controller.freePosition.x,
            fixture.controller.freePosition.y,
            fixture.controller.freePosition.z
        );
        assert.ok(radius < chartRadius);
        assert.doesNotThrow(() => transform.renderToWorld(fixture.controller.freePosition));
        assert.ok(fixture.controller.getFreeWorldPosition());
    } finally {
        fixture.restore();
    }
});


test('follow camera targets the character model instead of the tesseract', function followCharacterFocus() {
    const fixture = createFixture({ followFocus: { sliceId: 'room', position: { x: 1, y: 4, z: 8 } } });
    try {
        fixture.controller.setEnabled(true);
        assert.deepEqual(fixture.controller.getTargetPosition(), { x: 0, y: 1.3, z: -2 });
        fixture.controller.setRenderAnchor({ x: 3, y: 2, z: 1 }, Math.PI / 2, { x: 4, y: 5, z: 6 });
        assert.deepEqual(fixture.controller.getTargetPosition(), { x: 4, y: 5, z: 6 });
        const anchoredCameraPosition = fixture.controller.getDesiredPosition();
        assert.ok(anchoredCameraPosition.x < 3);
        assert.ok(Math.abs(anchoredCameraPosition.z - 1) < 1e-8);
    } finally {
        fixture.restore();
    }
});

test('follow camera orbit has no arbitrary pitch clamp and zoom stays available', function orbitWithoutArtificialPitchLimits() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.handleOrbitPointerDown({
            button: 2, clientX: 10, clientY: 10, preventDefault() {}
        });
        fixture.controller.handleOrbitPointerMove({ clientX: 10, clientY: -500 });
        assert.ok(fixture.controller.orbitPitch > Math.PI / 2);
        assert.ok(Number.isFinite(fixture.controller.getDesiredPosition().y));
        fixture.controller.setDistance(1000);
        assert.equal(fixture.controller.distance, 1000);
    } finally {
        fixture.restore();
    }
});

test('modified R key remains available to browser shortcuts in the free camera', function browserReloadShortcut() {
    const fixture = createFixture();
    try {
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        const result = fixture.keyDown('KeyR', { ctrlKey: true });
        assert.equal(result.prevented, false);
        assert.equal(fixture.controller.freeKeys.has('KeyR'), false);
        const ordinary = fixture.keyDown('KeyR');
        assert.equal(ordinary.prevented, true);
        assert.equal(fixture.controller.freeKeys.has('KeyR'), true);
    } finally {
        fixture.restore();
    }
});


test('free camera anomaly movement is constrained to the Poincare world chart', function poincareFreeAnomalyChartBounds() {
    const fixture = createFixture();
    try {
        const world = fixture.traversal.worlds.get('room');
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
        world.transform = transform;
        const destination = fixture.traversal.worlds.get('main');
        const anomaly = createSliceTransitionAnomaly({
            id: 'poincare-chart-limited-anomaly',
            source: { sliceId: 'room', position: { x: 0, y: 0, z: 0 } },
            destination: { sliceId: 'main', position: { x: 0, y: 0, z: 0 } },
            region: {
                min: { x: -5, y: -12, z: -5, w: -6 },
                max: { x: 5, y: 12, z: 5, w: 16 }
            },
            entryRadius: 3.8,
            traversable: true
        });
        fixture.traversal.getRoutesForSlice = () => [{
            corridorId: anomaly.id, corridor: anomaly, fromSource: true,
            sliceId: destination.slice.id, controller: {
                corridor: anomaly,
                getInfluenceMovementInfo() { return null; }
            }
        }];
        fixture.controller.setSpatialContext(transform, world.layerMask);
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.controller.setFreeView(
            transform.worldToRender({ x: 0, y: 0, z: -2 }),
            transform.worldToRender({ x: 0, y: 0, z: 0 }),
            'room'
        );
        fixture.keyDown('KeyW');
        fixture.controller.update(0.01);
        assert.equal(fixture.controller.getFreeTransitState()?.type, 'slice-transition');
        fixture.keyUp('KeyW');

        fixture.keyDown('KeyF');
        assert.doesNotThrow(() => {
            for (let index = 0; index < 30; index++) fixture.controller.update(0.05);
        });
        fixture.keyUp('KeyF');
        const local = fixture.controller.getFreeTransitState().startWorld.slice.frame;
        const position = fixture.controller.getFreeTransitState().position4D;
        const y = position.y - local.origin.y;
        assert.ok(y > -5, `expected the camera to remain inside the Poincare chart, got y=${y}`);
        assert.doesNotThrow(() => transform.worldToRender({
            x: position.x - local.origin.x,
            y,
            z: position.z - local.origin.z
        }));
    } finally {
        fixture.restore();
    }
});


test('free-camera W freedom permits movement both toward and away from a connected slice', function freeCameraBidirectionalAmbientW() {
    const fixture = createFixture();
    try {
        const source = fixture.traversal.worlds.get('room');
        const destination = fixture.traversal.worlds.get('main');
        const anomaly = createSliceTransitionAnomaly({
            id: 'free-bidirectional-w',
            source: { sliceId: 'room', position: { x: 0, y: 0, z: 0 } },
            destination: { sliceId: 'main', position: { x: 0, y: 0, z: 0 } },
            region: {
                min: { x: -5, y: -5, z: -5, w: -6 },
                max: { x: 5, y: 5, z: 5, w: 16 }
            },
            influence: {
                center: { x: 0, y: 0, z: 0, w: 5 },
                horizonRadius: 20, innerRadius: 1, maxWReach: 10
            },
            entryRadius: 3.8,
            traversable: true
        });
        fixture.traversal.getRoutesForSlice = () => [{
            corridorId: anomaly.id, corridor: anomaly, fromSource: true,
            sliceId: destination.slice.id,
            controller: {
                corridor: anomaly,
                getInfluenceMovementInfo(position, direction) {
                    return {
                        anomalyId: anomaly.id,
                        targetWorld: destination,
                        targetSliceId: destination.slice.id,
                        direction: 1,
                        movementScale: 1,
                        movingTowardTarget: direction > 0
                    };
                },
                chunkGraph: null
            }
        }];
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.controller.setFreeView(new Vector3(0, 0, -2), new Vector3(0, 0, 0), 'room');
        fixture.keyDown('KeyW');
        fixture.controller.update(0.01);
        assert.equal(fixture.controller.getFreeTransitState()?.type, 'slice-transition');
        fixture.keyUp('KeyW');

        fixture.keyDown('KeyE');
        fixture.controller.update(0.1);
        const positiveW = fixture.controller.getFreeTransitState().position4D.w;
        assert.ok(positiveW > 0);
        fixture.keyUp('KeyE');
        fixture.keyDown('KeyQ');
        fixture.controller.update(0.1);
        const returnedW = fixture.controller.getFreeTransitState()?.position4D.w ?? fixture.controller.getFreeW();
        assert.ok(returnedW < positiveW);
    } finally {
        fixture.restore();
    }
});


test('free camera ambient handoff clamps positions to the destination Poincare chart', function freeCameraDestinationChartHandoff() {
    const fixture = createFixture();
    try {
        const world = fixture.traversal.worlds.get('main');
        const transform = new SpatialTransform({
            geometry: 'poincare', renderScale: 24,
            bounds: {
                minX: -2, maxX: 2,
                minY: -2, maxY: 2,
                minZ: -2, maxZ: 2,
                characteristicLength: 1,
                boundaryEpsilon: 1e-5
            }
        });
        world.transform = transform;
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        fixture.controller.freeSliceId = 'room';
        fixture.controller.freePosition = new Vector3(0, 0, 0);
        fixture.controller.completeFreeInfluenceHandoff(world, { x: 8, y: 0, z: -9, w: 10 });
        assert.equal(fixture.controller.getViewSliceId(), 'main');
        assert.doesNotThrow(() => transform.renderToWorld(fixture.controller.freePosition));
        const arrival = transform.renderToWorld(fixture.controller.freePosition);
        assert.ok(arrival.x > -2 && arrival.x < 2);
        assert.ok(arrival.z > -2 && arrival.z < 2);
    } finally {
        fixture.restore();
    }
});


test('switching from third-person to free camera constrains the inherited Poincare camera pose', function freeModeEntryPoincareChart() {
    const fixture = createFixture();
    try {
        const world = fixture.traversal.worlds.get('room');
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
        world.transform = transform;
        fixture.camera.position.set(100, 0, 0);
        fixture.controller.setEnabled(true);
        fixture.controller.setMode('free');
        assert.doesNotThrow(() => transform.renderToWorld(fixture.controller.freePosition));
        assert.ok(Math.hypot(
            fixture.controller.freePosition.x,
            fixture.controller.freePosition.y,
            fixture.controller.freePosition.z
        ) < transform.projection.radius * transform.renderScale);
    } finally {
        fixture.restore();
    }
});
