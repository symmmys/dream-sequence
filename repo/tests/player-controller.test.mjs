import assert from 'node:assert/strict';
import test from 'node:test';
import { PlayerController } from '../src/game/player-controller.js';

function createPlayer() {
    return {
        yaw: 0,
        worldPosition: { x: 0, y: 0, z: 0 },
        setWorldPosition(position) { this.worldPosition = { ...position }; }
    };
}

function createController(options = {}) {
    const listeners = new Map();
    const priorWindow = globalThis.window;
    globalThis.window = {
        addEventListener(name, callback) { listeners.set(name, callback); },
        removeEventListener(name) { listeners.delete(name); }
    };
    const canvasListeners = new Map();
    const canvas = {
        addEventListener(name, callback) { canvasListeners.set(name, callback); },
        removeEventListener(name) { canvasListeners.delete(name); }
    };
    const terrain = {
        min: { x: -10, y: -5, z: -10 },
        max: { x: 10, y: 10, z: 10 },
        sampleAt(x, z) { return { x, y: 0, z }; }
    };
    const player = createPlayer();
    const controller = new PlayerController(player, terrain, canvas, options);
    return {
        controller, player,
        keyDown(code, modifiers = {}) {
            let prevented = false;
            controller.handleKeyDown({ code, ...modifiers, preventDefault() { prevented = true; } });
            return { prevented };
        },
        keyUp(code) { controller.handleKeyUp({ code }); },
        restore() {
            controller.dispose();
            if (priorWindow === undefined) delete globalThis.window;
            else globalThis.window = priorWindow;
        }
    };
}

test('WASD moves the character across both horizontal world axes', function horizontalMovement() {
    const fixture = createController();
    try {
        fixture.keyDown('KeyW');
        fixture.keyDown('KeyD');
        fixture.controller.update(0.05);
        assert.ok(fixture.player.worldPosition.x > 0);
        assert.ok(fixture.player.worldPosition.z > 0);
    } finally {
        fixture.restore();
    }
});

test('space initiates a jump with gravity returning the player to terrain', function jumping() {
    const fixture = createController({ jumpSpeed: 8, gravity: 16 });
    try {
        fixture.keyDown('Space');
        fixture.controller.update(0.05);
        assert.ok(fixture.player.worldPosition.y > 0);
        fixture.keyUp('Space');
        for (let index = 0; index < 80; index++) fixture.controller.update(0.05);
        assert.equal(fixture.player.worldPosition.y, 0);
    } finally {
        fixture.restore();
    }
});

test('suspended world movement still exposes input to the corridor controller', function transitInput() {
    const fixture = createController();
    try {
        fixture.controller.setMovementSuspended(true);
        fixture.keyDown('KeyW');
        fixture.keyDown('KeyA');
        const input = fixture.controller.getMovementInput();
        assert.equal(input.forward, 1);
        assert.equal(input.strafe, -1);
        fixture.controller.update(0.05);
        assert.deepEqual(fixture.player.worldPosition, { x: 0, y: 0, z: 0 });
    } finally {
        fixture.restore();
    }
});

test('R/F expose the second corridor axis while Space remains a jump request', function localAxisInput() {
    const fixture = createController();
    try {
        fixture.keyDown('KeyR');
        assert.equal(fixture.controller.getMovementInput().vertical, 1);
        fixture.keyUp('KeyR');
        fixture.keyDown('Space');
        assert.equal(fixture.controller.getMovementInput().vertical, 0);
        assert.equal(fixture.controller.getMovementInput().jump, true);
        fixture.keyUp('Space');
        fixture.keyDown('KeyF');
        assert.equal(fixture.controller.getMovementInput().vertical, -1);
    } finally {
        fixture.restore();
    }
});

test('Q and E expose the third independent corridor cross-section axis', function fourthDimensionInput() {
    const fixture = createController();
    try {
        fixture.keyDown('KeyE');
        assert.equal(fixture.controller.getMovementInput().crossSectionW, 1);
        fixture.keyUp('KeyE');
        fixture.keyDown('KeyQ');
        assert.equal(fixture.controller.getMovementInput().crossSectionW, -1);
    } finally {
        fixture.restore();
    }
});


test('E/Q do not move the ordinary 3D player along the fourth axis', function ordinaryWorldLocksWMovement() {
    const fixture = createController();
    try {
        fixture.keyDown('KeyE');
        fixture.controller.update(0.05);
        assert.deepEqual(fixture.player.worldPosition, { x: 0, y: 0, z: 0 });
        assert.equal(fixture.controller.getMovementInput().crossSectionW, 1);
        fixture.keyUp('KeyE');
        fixture.keyDown('KeyQ');
        fixture.controller.update(0.05);
        assert.deepEqual(fixture.player.worldPosition, { x: 0, y: 0, z: 0 });
    } finally {
        fixture.restore();
    }
});


test('Ctrl+R and Cmd+R are not captured by the movement controller', function browserReloadShortcuts() {
    const fixture = createController();
    try {
        const ctrl = fixture.keyDown('KeyR', { ctrlKey: true });
        assert.equal(ctrl.prevented, false);
        assert.equal(fixture.controller.keys.has('KeyR'), false);
        const meta = fixture.keyDown('KeyR', { metaKey: true });
        assert.equal(meta.prevented, false);
        assert.equal(fixture.controller.keys.has('KeyR'), false);
        const normal = fixture.keyDown('KeyR');
        assert.equal(normal.prevented, true);
        assert.equal(fixture.controller.keys.has('KeyR'), true);
    } finally {
        fixture.restore();
    }
});


test('movement profiles can change per world and restore chamber-scale movement', function worldMovementProfiles() {
    const fixture = createController({ walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.4 });
    try {
        fixture.controller.setMovementProfile({ walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 });
        assert.deepEqual(fixture.controller.getMovementProfile(), {
            walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2
        });
        fixture.keyDown('KeyW');
        fixture.controller.update(0.05);
        assert.ok(fixture.player.worldPosition.z > 8);
        fixture.keyUp('KeyW');
        fixture.controller.setMovementProfile({ walkSpeed: 4.5, runSpeed: 7.5 });
        assert.deepEqual(fixture.controller.getMovementProfile(), {
            walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.2
        });
        assert.throws(() => fixture.controller.setMovementProfile({ walkSpeed: 10, runSpeed: 5 }), /Movement profile/);
    } finally {
        fixture.restore();
    }
});
