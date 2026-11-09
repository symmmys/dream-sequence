import assert from 'node:assert/strict';
import test from 'node:test';
import { GameManager } from '../src/game/game-manager.js';

function createCamera() {
    return {
        attached: false,
        attachControl() { this.attached = true; },
        detachControl() { this.attached = false; }
    };
}

function createController() {
    return {
        enabled: true,
        setEnabled(value) { this.enabled = value; }
    };
}

test('registered spatial mode activates, pauses, resumes, and deactivates its own systems', function modeLifecycle() {
    const previousWindow = globalThis.window;
    globalThis.window = {
        addEventListener() {},
        removeEventListener() {}
    };
    const scene = { activeCamera: null };
    const flightCamera = createCamera();
    const demoCamera = createCamera();
    const playerController = createController();
    const cameraController = createController();
    const manager = new GameManager(scene, { canvas: {}, flightCamera });
    const changes = [];
    manager.registerMode('geometryDemo', { camera: demoCamera, playerController, cameraController });
    manager.onModeChanged(function recordMode(mode, previous) { changes.push([mode, previous]); });

    manager.startGeometryDemo();
    assert.equal(scene.activeCamera, demoCamera);
    assert.equal(playerController.enabled, true);
    assert.equal(cameraController.enabled, true);

    manager.pause();
    assert.equal(manager.mode, 'paused');
    assert.equal(manager.resumeMode, 'geometryDemo');
    assert.equal(playerController.enabled, false);
    assert.equal(cameraController.enabled, false);

    manager.resume();
    assert.equal(scene.activeCamera, demoCamera);
    assert.equal(playerController.enabled, true);
    assert.equal(cameraController.enabled, true);

    manager.returnToMenu();
    assert.equal(scene.activeCamera, flightCamera);
    assert.equal(playerController.enabled, false);
    assert.deepEqual(changes.map(function currentMode(entry) { return entry[0]; }), [
        'geometryDemo', 'paused', 'geometryDemo', 'menu'
    ]);

    manager.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
});

test('spatial modes reject missing controllers and duplicate registrations', function validateRegistration() {
    const previousWindow = globalThis.window;
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const manager = new GameManager({ activeCamera: null }, { flightCamera: createCamera() });
    assert.throws(() => manager.registerMode('geometryDemo', {}), /require a camera/);
    const systems = { camera: createCamera(), playerController: createController(), cameraController: createController() };
    manager.registerMode('geometryDemo', systems);
    assert.throws(() => manager.registerMode('geometryDemo', systems), /already registered/);
    manager.dispose();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
});
