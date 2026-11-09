import assert from 'node:assert/strict';
import test from 'node:test';
import { DnDCharacter } from '../src/game/dnd-character.js';
import { DnDBattle } from '../src/game/dnd-battle.js';
import { DnDMode } from '../src/game/dnd-mode.js';

function createCharacter(name, position = {}, movement = 30) {
    return new DnDCharacter({ name, movement, position });
}

function createActiveBattle(character) {
    const battle = new DnDBattle({ characterIds: [character.id] });
    battle.start([character]);
    return battle;
}

function createModeStub(battle) {
    const mode = Object.create(DnDMode.prototype);
    mode.activeBattle = battle;
    return mode;
}

function createOccupancyMode(characters, cellSize) {
    const mode = Object.create(DnDMode.prototype);
    mode.cellSize = cellSize;
    mode.characters = new Map();
    for (const character of characters) mode.characters.set(character.id, character);
    return mode;
}

test('altitude survives character save and legacy saves default to ground level', function testAltitudePersistence() {
    const flying = createCharacter('Flying', { row: 2, col: 3, altitude: 7.5 });
    const restored = DnDCharacter.fromJSON(flying.toJSON());
    const legacy = DnDCharacter.fromJSON({ id: 'legacy', position: { row: 1, col: 1 } });
    assert.equal(restored.position.altitude, 7.5);
    assert.equal(legacy.position.altitude, 0);
});

test('movement remains independent and extended movement spends Dash as an action', function testDashMovement() {
    const character = createCharacter('Runner');
    const battle = createActiveBattle(character);
    battle.move(character, { row: 0, col: 2, x: 25, y: 0, z: 5, altitude: 0 }, 20);
    assert.equal(battle.currentResources.actionUsed, false);
    assert.equal(battle.currentResources.movementUsed, 20);

    DnDMode.prototype.consumeDashWhenRequired.call(
        createModeStub(battle),
        character,
        20
    );
    assert.equal(battle.currentResources.actionUsed, true);
    assert.equal(battle.currentResources.dashUsed, true);
    battle.move(character, { row: 0, col: 4, x: 45, y: 0, z: 5, altitude: 0 }, 20);
    assert.equal(battle.currentResources.movementUsed, 40);
    assert.equal(battle.currentResources.bonusActionUsed, false);
    assert.equal(character.position.col, 4);
});

test('an already-spent non-Dash action prevents extended movement', function testSpentActionBlocksDash() {
    const character = createCharacter('Guard');
    const battle = createActiveBattle(character);
    battle.move(character, { row: 0, col: 2, x: 25, y: 0, z: 5, altitude: 0 }, 20);
    battle.useAction(character, { description: 'Attack' });
    assert.throws(
        function attemptDash() {
            DnDMode.prototype.consumeDashWhenRequired.call(
                createModeStub(battle),
                character,
                20
            );
        },
        /Dash requires an unused action/
    );
    assert.equal(battle.currentResources.dashUsed, false);
});

test('movement preview separates normal range from Dash range', function testMovementPreviewRanges() {
    const mode = Object.create(DnDMode.prototype);
    mode.cellSize = 10;
    const character = { movement: 30 };
    const normalAndDash = DnDMode.prototype.getMovementPreviewRange.call(
        mode,
        character,
        { movementUsed: 20, actionUsed: false, dashUsed: false }
    );
    assert.deepEqual(normalAndDash, {
        normalCells: 1,
        extendedCells: 4,
        mayUseDash: true
    });

    const afterAttack = DnDMode.prototype.getMovementPreviewRange.call(
        mode,
        character,
        { movementUsed: 20, actionUsed: true, dashUsed: false }
    );
    assert.deepEqual(afterAttack, {
        normalCells: 1,
        extendedCells: 1,
        mayUseDash: false
    });
});

test('characters sharing a cell receive distinct, non-overlapping model slots', function testCellOccupancyFormation() {
    const characters = [
        createCharacter('One', { row: 3, col: 4 }),
        createCharacter('Two', { row: 3, col: 4 }),
        createCharacter('Three', { row: 3, col: 4 })
    ];
    const mode = createOccupancyMode(characters, 0.5);
    const layouts = [];
    for (const character of characters) {
        layouts.push(DnDMode.prototype.getCharacterCellLayout.call(mode, character));
    }

    const coordinates = new Set();
    for (const layout of layouts) {
        coordinates.add(`${layout.offsetX}:${layout.offsetZ}`);
    }
    assert.equal(coordinates.size, characters.length);

    const modelDiameter = 0.7 * layouts[0].scale;
    for (let first = 0; first < layouts.length; first++) {
        for (let second = first + 1; second < layouts.length; second++) {
            const deltaX = layouts[first].offsetX - layouts[second].offsetX;
            const deltaZ = layouts[first].offsetZ - layouts[second].offsetZ;
            assert.ok(Math.hypot(deltaX, deltaZ) > modelDiameter);
        }
    }
});

test('cell world coordinates resolve to the geometric center', function testCellCenterPosition() {
    const center = DnDMode.prototype.worldPosition.call(
        { gridOrigin: { x: 100, z: -50 }, cellSize: 10 },
        2,
        3
    );
    assert.deepEqual(center, { x: 135, z: -25 });
});

console.log('D&D tactical logic regression tests loaded.');


test('rendered characters use cell centers, non-overlapping co-occupancy slots, and terrain-relative altitude', function testRenderedOccupancyAndAltitude() {
    const characters = [
        createCharacter('Flyer One', { row: 2, col: 3, altitude: 8 }),
        createCharacter('Flyer Two', { row: 2, col: 3, altitude: 8 }),
        createCharacter('Flyer Three', { row: 2, col: 3, altitude: 8 })
    ];
    const mode = Object.create(DnDMode.prototype);
    mode.cellSize = 10;
    mode.gridOrigin = { x: 100, z: -50 };
    mode.characters = new Map(characters.map(function mapCharacter(character) {
        return [character.id, character];
    }));
    mode.terrain = { sampleAt: function sampleTerrain() { return { y: 4 }; } };
    mode.transform = { worldToRender: function preserveWorldPosition(position) { return position; } };
    mode.characterMeshes = new Map();

    for (const character of characters) {
        const root = {
            position: { set: function setPosition(x, y, z) { Object.assign(this, { x, y, z }); } },
            scaling: { set: function setScale(x, y, z) { Object.assign(this, { x, y, z }); } }
        };
        mode.characterMeshes.set(character.id, { root });
        DnDMode.prototype.syncCharacter.call(mode, character);
    }

    const roots = characters.map(function getRoot(character) {
        return mode.characterMeshes.get(character.id).root;
    });
    const expectedCenter = { x: 135, y: 12, z: -25 };
    const centerX = roots.reduce(function sumX(total, root) { return total + root.position.x; }, 0) / roots.length;
    const centerZ = roots.reduce(function sumZ(total, root) { return total + root.position.z; }, 0) / roots.length;

    assert.ok(Math.abs(centerX - expectedCenter.x) < 1e-9);
    assert.ok(Math.abs(centerZ - expectedCenter.z) < 1e-9);
    for (const root of roots) {
        assert.equal(root.position.y, expectedCenter.y);
        assert.ok(Math.hypot(
            root.position.x - expectedCenter.x,
            root.position.z - expectedCenter.z
        ) < 1);
    }

    for (let first = 0; first < roots.length; first++) {
        for (let second = first + 1; second < roots.length; second++) {
            const dx = roots[first].position.x - roots[second].position.x;
            const dz = roots[first].position.z - roots[second].position.z;
            const diameter = 0.7 * roots[first].scaling.x;
            assert.ok(Math.hypot(dx, dz) > diameter);
        }
    }
});

test('movement preserves altitude while spending Dash only for a Dash-region destination', function testMovementPreservesFlightAltitude() {
    const character = createCharacter('Flying Runner', { row: 0, col: 0, altitude: 6 });
    const battle = createActiveBattle(character);
    const mode = Object.create(DnDMode.prototype);
    mode.activeBattle = battle;
    mode.characters = new Map([[character.id, character]]);
    mode.gridRows = 10;
    mode.gridColumns = 10;
    mode.gridOrigin = { x: 0, z: 0 };
    mode.cellSize = 10;
    mode.terrain = { sampleAt: function sampleTerrain() { return { y: 3 }; } };
    mode.transform = { worldToRender: function preserveWorldPosition(position) { return position; } };
    mode.characterMeshes = new Map();
    mode.syncAllCharacters = function syncCharacters() {
        DnDMode.prototype.syncCharacter.call(this, character);
    };
    mode.centerCameraOnActiveCharacter = function centerCamera() {};
    mode.saveBattle = function saveBattle() {};
    mode.refreshMovementPreview = function refreshPreview() {};
    mode.refreshUI = function refreshUI() {};
    const root = {
        position: { set: function setPosition(x, y, z) { Object.assign(this, { x, y, z }); } },
        scaling: { set: function setScale(x, y, z) { Object.assign(this, { x, y, z }); } }
    };
    mode.characterMeshes.set(character.id, { root });

    DnDMode.prototype.moveCharacter.call(mode, character, 0, 2, 'dash');

    assert.equal(battle.currentResources.actionUsed, true);
    assert.equal(battle.currentResources.dashUsed, true);
    assert.equal(character.position.altitude, 6);
    assert.equal(root.position.y, 9);
    assert.equal(character.position.col, 2);
});
