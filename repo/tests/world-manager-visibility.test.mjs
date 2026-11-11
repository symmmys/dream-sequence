import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setWorldManagerVisibility } from '../src/demo/world-manager-visibility.js';
import { WorldManager } from '../src/world/world-manager.js';

test('visibility delegates to the current WorldManager API', function currentManagerApi() {
    const calls = [];
    const manager = {
        visible: false,
        setVisible(visible) { calls.push(visible); }
    };

    setWorldManagerVisibility(manager, true);
    setWorldManagerVisibility(manager, false);

    assert.deepEqual(calls, [true, false]);
    assert.equal(manager.visible, false);
});

test('visibility supports a legacy manager without setVisible()', function legacyManagerApi() {
    const firstMesh = { isVisible: true };
    const secondMesh = { isVisible: true };
    const firstChunk = { mesh: firstMesh };
    const secondChunk = { mesh: secondMesh };
    const manager = { chunks: new Map([['a', firstChunk], ['b', secondChunk]]) };

    setWorldManagerVisibility(manager, false);
    assert.equal(manager.visible, false);
    assert.equal(firstChunk.visible, false);
    assert.equal(secondChunk.visible, false);
    assert.equal(firstMesh.isVisible, false);
    assert.equal(secondMesh.isVisible, false);

    setWorldManagerVisibility(manager, true);
    assert.equal(manager.visible, true);
    assert.equal(firstChunk.visible, true);
    assert.equal(secondChunk.visible, true);
    assert.equal(firstMesh.isVisible, true);
    assert.equal(secondMesh.isVisible, true);
});

test('visibility handles managers that expose meshes but no chunk map', function meshOnlyManager() {
    const mesh = { isVisible: true };
    const manager = { getMeshes() { return [mesh]; } };

    setWorldManagerVisibility(manager, false);
    assert.equal(mesh.isVisible, false);
    setWorldManagerVisibility(manager, true);
    assert.equal(mesh.isVisible, true);
});

test('visibility safely handles an uninitialized manager', function missingManager() {
    assert.doesNotThrow(function applyMissingManager() {
        setWorldManagerVisibility(null, false);
    });
});


test('visibility falls back when a manager method throws', function brokenManagerApi() {
    const mesh = { isVisible: true };
    const chunk = { visible: true, mesh };
    const manager = {
        chunks: new Map([['a', chunk]]),
        setVisible() { throw new TypeError('legacy method is incompatible'); }
    };

    setWorldManagerVisibility(manager, false);
    assert.equal(manager.visible, false);
    assert.equal(chunk.visible, false);
    assert.equal(mesh.isVisible, false);
});

test('WorldManager exposes the visibility API', function worldManagerContract() {
    assert.equal(typeof WorldManager.prototype.setVisible, 'function');
});


test('geometry demo borrows the live main-world manager instead of owning a separate destination', function demoUsesSharedManager() {
    const source = readFileSync(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.match(source, /setDestinationWorldManager\(manager\)/);
    assert.match(source, /manager\.terrain !== this\.destination\.terrain/);
    assert.match(source, /this\.destinationWorldManager\?\.update\(focus/);
    assert.doesNotMatch(source, /new WorldManager\s*\(/);
    assert.doesNotMatch(source, /this\.destinationWorldManager\.setVisible\s*\(/);
});

test('application entry chain uses one cache-busting build identifier', function versionedModuleChain() {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const scene = readFileSync(new URL('../src/scene/create-scene.js', import.meta.url), 'utf8');
    const version = 'somnium-20261110-phase18o-active-w-slice-navigation-1';

    assert.ok(index.includes(`main.js?v=${version}`));
    assert.ok(main.includes(`create-scene.js?v=${version}`));
    assert.ok(scene.includes(`geometry-demo-world.js?v=${version}`));
    assert.ok(scene.includes(`spatial-transform.js?v=${version}`));
    const topology = readFileSync(new URL('../src/demo/geometry-demo-topology.js', import.meta.url), 'utf8');
    assert.ok(topology.includes(`world-topology.js?v=${version}`));
    const demo = readFileSync(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.ok(demo.includes(`spatial-transform.js?v=${version}`));
});


test('WorldManager visibility tolerates calls before chunk initialization', function earlyVisibilityCall() {
    const manager = Object.create(WorldManager.prototype);
    assert.doesNotThrow(function setVisibilityBeforeChunks() {
        manager.setVisible(false);
    });
    assert.equal(manager.visible, false);
});

test('WorldManager visibility updates resident chunk meshes', function managerVisibilityImplementation() {
    const mesh = { isVisible: true };
    const chunk = { visible: true, mesh };
    const manager = Object.create(WorldManager.prototype);
    manager.chunks = new Map([['a', chunk]]);

    manager.setVisible(false);
    assert.equal(manager.visible, false);
    assert.equal(chunk.visible, false);
    assert.equal(mesh.isVisible, false);
});

test('WorldManager schedules reachable cross-slice chunks and retains them through the hysteresis window', function reachableRemoteChunkStreaming() {
    const created = [];
    let candidatesAvailable = true;
    let graphCalls = 0;
    const candidate = {
        address: { sliceId: 'destination-slice', chunkX: 1, chunkZ: 2 },
        reachability: {
            anomalyId: 'anomaly-test',
            wDistance: 4,
            spatialDistance: 0,
            projectedPosition: { x: 24, y: 0, z: 40 }
        }
    };
    const chunkGraph = {
        getReachableChunkCandidates(sourceSliceId, position4D, options) {
            graphCalls++;
            assert.equal(sourceSliceId, 'source-slice');
            assert.deepEqual(position4D, { x: 0, y: 0, z: 0, w: 5 });
            assert.equal(options.targetSliceId, 'destination-slice');
            return candidatesAvailable ? [candidate] : [];
        },
        setChunkLoaded() {}
    };
    const manager = Object.create(WorldManager.prototype);
    Object.assign(manager, {
        terrain: { ready: true, worldSize: 1000 },
        sliceId: 'destination-slice',
        chunkGraph,
        chunkSize: 16,
        renderRadius: 0,
        highDetailRadius: 0,
        minChunkX: -10,
        maxChunkX: 10,
        minChunkZ: -10,
        maxChunkZ: 10,
        enabled: true,
        chunks: new Map(),
        remoteChunkRetention: new Map(),
        remoteRetentionFrames: 3,
        lastReachableRemoteChunks: 0,
        maxChunksPerUpdate: 4,
        meshQueue: [],
        worker: null,
        stats: { generated: 0, unloaded: 0, loaded: 0, workerCompleted: 0, workerErrors: 0, pendingMeshes: 0 },
        getChunk(x, z) { return this.chunks.get(`${x}:${z}`) ?? null; },
        getKey(x, z) { return `${x}:${z}`; },
        createChunk(x, z, lod) {
            const chunk = {
                x, z, lod,
                address: { sliceId: this.sliceId, chunkX: x, chunkZ: z },
                disposed: false,
                dispose() { this.disposed = true; }
            };
            this.chunks.set(this.getKey(x, z), chunk);
            created.push({ x, z, lod });
            this.stats.loaded++;
            return chunk;
        },
        processFallbackQueue() {}
    });

    manager.update(
        { x: 0, z: 0 },
        { x: 0, z: 1 },
        { sourceSliceId: 'source-slice', position4D: { x: 0, y: 0, z: 0, w: 5 } }
    );
    assert.equal(graphCalls, 1);
    assert.equal(manager.getStats().reachableRemoteChunks, 1);
    assert.ok(created.some(({ x, z }) => x === 1 && z === 2));
    assert.ok(manager.remoteChunkRetention.get('1:2') > 0);

    candidatesAvailable = false;
    manager.update(
        { x: 0, z: 0 },
        { x: 0, z: 1 },
        { sourceSliceId: 'source-slice', position4D: { x: 0, y: 0, z: 0, w: 5 } }
    );
    assert.equal(manager.getChunk(1, 2).disposed, false);
    assert.ok(manager.remoteChunkRetention.get('1:2') > 0);
});
