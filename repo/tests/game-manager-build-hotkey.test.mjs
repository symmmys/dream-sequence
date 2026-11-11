import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GameManager } from '../src/game/game-manager.js';

function managerFixture(mode) {
    const manager = Object.create(GameManager.prototype);
    manager.mode = mode;
    manager.resumeMode = 'flight';
    manager.entered = 0;
    manager.exited = 0;
    manager.startEditor = function startEditor() { this.entered += 1; this.mode = 'editor'; };
    manager.exitEditor = function exitEditor() { this.exited += 1; this.mode = 'menu'; };
    return manager;
}

test('B enters the building editor from the main menu', () => {
    const manager = managerFixture('menu');
    let prevented = false;
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() { prevented = true; } });
    assert.equal(manager.entered, 1);
    assert.equal(manager.exited, 0);
    assert.equal(prevented, true);
});

test('B exits the building editor without affecting text entry', () => {
    const manager = managerFixture('editor');
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'INPUT' }, preventDefault() {} });
    assert.equal(manager.exited, 0);
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} });
    assert.equal(manager.exited, 1);
});

test('B opens the building editor from navigable gameplay modes', () => {
    const manager = managerFixture('flight');
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} });
    assert.equal(manager.entered, 1);
    assert.equal(manager.exited, 0);
});

test('B opens the building editor from geometryDemo and preserves the spatial mode on exit', () => {
    const manager = managerFixture('geometryDemo');
    manager.isNavigableMode = mode => mode === 'geometryDemo';
    manager.startEditor = function startEditor() { this.resumeMode = this.mode; this.entered += 1; this.mode = 'editor'; };
    manager.exitEditor = function exitEditor() { this.exited += 1; this.mode = this.resumeMode; };
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} });
    assert.equal(manager.entered, 1);
    assert.equal(manager.resumeMode, 'geometryDemo');
    manager.handleKeyDown({ code: 'KeyB', repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {} });
    assert.equal(manager.exited, 1);
    assert.equal(manager.mode, 'geometryDemo');
});

test('GameManager captures B before mode-specific viewport keyboard handlers', async () => {
    const source = await readFile(new URL('../src/game/game-manager.js', import.meta.url), 'utf8');
    assert.match(source, /addEventListener\('keydown', this\.onKeyDown, true\)/);
    assert.match(source, /removeEventListener\('keydown', this\.onKeyDown, true\)/);
});
