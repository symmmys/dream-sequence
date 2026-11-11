import assert from 'node:assert/strict';
import test from 'node:test';
import { CorridorTraversalNetwork } from '../src/demo/corridor-traversal-network.js';

function createController(id, from, to, shouldEnter = false) {
    return {
        corridor: { id, source: { sliceId: from }, destination: { sliceId: to } },
        renderers: new Map([[from, { id: `${id}-source` }], [to, { id: `${id}-destination` }]]),
        renderer: null,
        corridorLength: 20,
        currentSliceId: from,
        state: 'idle',
        active: false,
        beginAttempts: 0,
        entityUpdates: 0,
        onSliceChanged() {},
        setActive(value) { this.active = value; },
        tryBeginTransit() {
            this.beginAttempts++;
            if (!shouldEnter || this.state !== 'idle' || this.currentSliceId !== from) return false;
            this.state = 'transit';
            this.startWorld = { slice: { id: from } };
            this.target = { slice: { id: to } };
            this.direction = 1;
            this.progress = 0.2;
            this.activeRenderer = this.renderers.get(from);
            this.onSliceChanged(from, { transitioning: true, corridorId: id });
            return true;
        },
        update() {
            this.state = 'idle';
            this.currentSliceId = to;
            this.onSliceChanged(to, { transitioning: false, corridorId: id });
        },
        advanceOtherEntities() { this.entityUpdates++; },
        beginEntityTransit() { return true; },
        tryBeginEntityTransit() { return true; },
        getEntityTransitState() { return null; },
        getState() { return { state: this.state, currentSliceId: this.currentSliceId }; },
        dispose() { this.disposed = true; }
    };
}

function createFixture() {
    const neighbors = {
        hyper: [{ corridorId: 'hyper-poincare', sliceId: 'poincare' }],
        poincare: [
            { corridorId: 'hyper-poincare', sliceId: 'hyper' },
            { corridorId: 'poincare-main', sliceId: 'main' }
        ],
        main: [{ corridorId: 'poincare-main', sliceId: 'poincare' }]
    };
    const topology = { getTraversableNeighbors(sliceId) { return neighbors[sliceId] ?? []; } };
    const first = createController('hyper-poincare', 'hyper', 'poincare', true);
    const second = createController('poincare-main', 'poincare', 'main', true);
    const changes = [];
    const network = new CorridorTraversalNetwork({
        topology,
        worlds: new Map(['hyper', 'poincare', 'main'].map(function world(id) {
            return [id, { slice: { id } }];
        })),
        controllers: [first, second], initialSliceId: 'hyper',
        onSliceChanged(sliceId, state) { changes.push({ sliceId, state }); }
    });
    return { network, first, second, changes };
}

test('network exposes both corridor routes from the intermediate chamber', function twoRoutes() {
    const fixture = createFixture();
    const routes = fixture.network.getRoutesForSlice('poincare');
    assert.deepEqual(routes.map(function corridorId(route) { return route.corridorId; }), [
        'hyper-poincare', 'poincare-main'
    ]);
    assert.equal(routes[0].renderer.id, 'hyper-poincare-destination');
    assert.equal(routes[1].renderer.id, 'poincare-main-source');
    fixture.network.dispose();
});

test('only the corridor connected to the current slice may begin player transit', function singleRouteEntry() {
    const fixture = createFixture();
    fixture.network.setActive(true);
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.state, 'transit');
    assert.equal(fixture.network.corridor.id, 'hyper-poincare');
    assert.equal(fixture.first.state, 'transit');
    assert.equal(fixture.second.beginAttempts, 0);
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.currentSliceId, 'poincare');
    assert.equal(fixture.network.state, 'idle');
    assert.equal(fixture.second.currentSliceId, 'poincare');
    assert.equal(fixture.changes.at(-1).sliceId, 'poincare');
    fixture.network.dispose();
});

test('network keeps unrelated corridor entity updates running during player transit', function concurrentEntityUpdates() {
    const fixture = createFixture();
    fixture.network.setActive(true);
    fixture.network.update(1 / 60);
    assert.equal(fixture.second.entityUpdates, 1);
    fixture.network.update(1 / 60);
    assert.equal(fixture.second.entityUpdates, 2);
    fixture.network.dispose();
});


test('the player can traverse the connected anomaly chain one corridor chunk at a time', function connectedRouteChain() {
    const fixture = createFixture();
    fixture.network.setActive(true);
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.corridor.id, 'hyper-poincare');
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.currentSliceId, 'poincare');
    assert.equal(fixture.network.state, 'idle');
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.corridor.id, 'poincare-main');
    fixture.network.update(1 / 60);
    assert.equal(fixture.network.currentSliceId, 'main');
    assert.equal(fixture.network.state, 'idle');
    fixture.network.dispose();
});


test('ambient position lookup skips synchronized controllers that do not own the current slice', function currentSliceBindingLookup() {
    const ambientPosition = { x: 18, y: 2.5, z: 0, w: 80 };
    const unrelated = {
        corridor: { id: 'hypercube-poincare', source: { sliceId: 'hypercube' }, destination: { sliceId: 'poincare' } },
        worlds: new Map([['hypercube', {}], ['poincare', {}]]),
        currentSliceId: 'main',
        getAmbientPlayerPosition() { return null; },
        setActive() {},
        dispose() {}
    };
    const mainRoute = {
        corridor: { id: 'hypercube-main', source: { sliceId: 'hypercube' }, destination: { sliceId: 'main' } },
        worlds: new Map([['hypercube', {}], ['main', {}]]),
        currentSliceId: 'hypercube',
        getAmbientPlayerPosition() { return ambientPosition; },
        setActive() {},
        dispose() {}
    };
    const network = new CorridorTraversalNetwork({
        topology: { getTraversableNeighbors() { return []; } },
        controllers: [unrelated, mainRoute],
        initialSliceId: 'main'
    });

    assert.deepEqual(network.getAmbientPlayerPosition(), ambientPosition);
    network.dispose();
});

test('ambient W movement evaluates routes that own the active Main World slice', function mainSliceAmbientMovement() {
    const ambientPosition = { x: 18, y: 2.5, z: 0, w: 80 };
    const calls = [];
    const unrelated = {
        corridor: { id: 'hypercube-poincare', source: { sliceId: 'hypercube' }, destination: { sliceId: 'poincare' } },
        worlds: new Map([['hypercube', {}], ['poincare', {}]]),
        getMovementInput() { return { crossSectionW: -1 }; },
        getInfluenceMovementInfo() { throw new Error('Unrelated controller must not be evaluated.'); },
        setActive() {},
        dispose() {}
    };
    const mainRoute = {
        corridor: { id: 'hypercube-main', source: { sliceId: 'hypercube' }, destination: { sliceId: 'main' } },
        worlds: new Map([['hypercube', {}], ['main', {}]]),
        getAmbientPlayerPosition() { return ambientPosition; },
        getInfluenceMovementInfo(position, direction, sliceId) {
            calls.push({ position, direction, sliceId });
            return { movementScale: 0.8 };
        },
        advanceAmbientInfluenceMovement(delta, position) { calls.push({ delta, position }); return true; },
        setActive() {},
        dispose() {}
    };
    const network = new CorridorTraversalNetwork({
        topology: { getTraversableNeighbors() { return []; } },
        controllers: [unrelated, mainRoute],
        initialSliceId: 'main'
    });

    assert.equal(network.advanceAmbientInfluenceMovement(0.1), true);
    assert.deepEqual(calls[0], { position: ambientPosition, direction: -1, sliceId: 'main' });
    assert.deepEqual(calls[1], { delta: 0.1, position: ambientPosition });
    network.dispose();
});


test('network prefers the portal mapping whose visible mouth contains the player', function nearestPresentationRoute() {
    const fallbackPosition = { x: 260, y: 2, z: -2, w: 80 };
    const mappedPosition = { x: 18, y: 2.5, z: 0, w: 80 };
    const makeRoute = (id, isNear, position) => ({
        corridor: { id, source: { sliceId: 'hyper' }, destination: { sliceId: 'main' } },
        worlds: new Map([['hyper', {}], ['main', {}]]),
        currentSliceId: 'main',
        isNearPresentationPortal() { return isNear; },
        getAmbientPlayerPosition() { return position; },
        setActive() {}, dispose() {}
    });
    const farRoute = makeRoute('far-mouth', false, fallbackPosition);
    const nearRoute = makeRoute('near-mouth', true, mappedPosition);
    const network = new CorridorTraversalNetwork({
        topology: { getTraversableNeighbors() { return []; } },
        controllers: [farRoute, nearRoute],
        initialSliceId: 'main'
    });
    assert.deepEqual(network.getAmbientPlayerPosition(), mappedPosition);
    network.dispose();
});

test('network can attach and detach a newly constructed runtime controller', function dynamicControllerLifecycle() {
    const fixture = createFixture();
    const dynamic = createController('dynamic-link', 'main', 'hyper');
    fixture.network.addController(dynamic);
    assert.equal(fixture.network.controllers.includes(dynamic), true);
    assert.equal(dynamic.currentSliceId, 'hyper');
    fixture.network.setActive(true);
    assert.equal(dynamic.active, true);
    assert.equal(fixture.network.removeController('dynamic-link'), true);
    assert.equal(dynamic.disposed, true);
    assert.equal(fixture.network.controllers.includes(dynamic), false);
    assert.equal(fixture.network.removeController('dynamic-link'), false);
    fixture.network.dispose();
});

test('network rejects duplicate runtime controller IDs without disturbing existing routes', function duplicateDynamicController() {
    const fixture = createFixture();
    assert.throws(() => fixture.network.addController(createController('hyper-poincare', 'hyper', 'poincare')),
        /already exists/);
    assert.equal(fixture.network.controllers.length, 2);
    fixture.network.dispose();
});

test('new controllers are bound to the network slice-change callback', function dynamicControllerBinding() {
    const fixture = createFixture();
    const dynamic = createController('dynamic-bound', 'main', 'hyper');
    fixture.network.addController(dynamic);
    dynamic.onSliceChanged('main', { transitioning: false, corridorId: 'dynamic-bound' });
    assert.equal(fixture.network.currentSliceId, 'main');
    assert.equal(dynamic.currentSliceId, 'main');
    assert.equal(fixture.changes.at(-1).sliceId, 'main');
    fixture.network.dispose();
});

test('W playtest override moves a follow-mode player through a user Plane without an anomaly route', function forcedPlaneWMovement() {
    const frame = {
        origin: { x: 0, y: 0, z: 0, w: 0 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ],
        normal: { x: 0, y: 0, z: 0, w: 1 }
    };
    const world = { slice: { id: 'user-plane', frame }, wBounds: { min: -1, max: 1 } };
    const player = {
        sliceId: 'user-plane',
        spatialPosition4D: { x: 0, y: 0, z: 0, w: 0 },
        worldPosition: { x: 0, y: 0, z: 0 },
        setWorldPosition(position) { this.worldPosition = { ...position }; }
    };
    const controller = {
        corridor: { id: 'unrelated-link', source: { sliceId: 'other' }, destination: { sliceId: 'remote' } },
        worlds: new Map([['user-plane', world]]),
        currentSliceId: 'user-plane',
        player,
        camera: { wMovementEnabled: true },
        options: { speed: 8 },
        getMovementInput() { return { crossSectionW: 1, sprint: false }; },
        getAmbientPlayerPosition() { return { ...player.spatialPosition4D }; },
        getInfluenceMovementInfo() { return null; },
        setActive() {},
        dispose() {}
    };
    const network = new CorridorTraversalNetwork({
        topology: { getTraversableNeighbors() { return []; } },
        controllers: [controller],
        initialSliceId: 'user-plane'
    });
    assert.equal(network.advanceAmbientInfluenceMovement(0.1), true);
    assert.equal(player.spatialPosition4D.w, 0.8);
    assert.equal(player.worldPosition.x, 0);
    assert.equal(player.worldPosition.y, 0);
    assert.equal(player.worldPosition.z, 0);
    network.dispose();
});
