import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GeometryDemoWorld } from '../src/demo/geometry-demo-world.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import { SpatialChunkGraph } from '../src/world/spatial-chunk-graph.js';
import { SliceWorldRegistry } from '../src/world/slice-world-registry.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';
import { createWorldSlice } from '../src/world/fields/geometry/world-slice.js';

function createRuntimeRegistrationFixture() {
    const topology = new WorldTopology();
    const baseSlice = topology.registerSlice({ id: 'runtime-registration-base', geometry: 'euclidean', seed: 1 });
    const chunkGraph = new SpatialChunkGraph(topology);
    chunkGraph.registerSlice(baseSlice, { chunkSize: 32 });
    const registry = new SliceWorldRegistry();
    const transform = new SpatialTransform({ geometry: 'euclidean', renderScale: 1 });
    const adapterRegistrations = [];
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        topology,
        chunkGraph,
        registry,
        adapter: { registerSlice(slice, spatialTransform) { adapterRegistrations.push({ slice, spatialTransform }); } },
        sourceWorld: { transform },
        hypercubeWorld: null,
        sourceSlice: baseSlice,
        hypercubeSlice: { id: 'runtime-registration-hypercube', geometry: 'euclidean', seed: 2 },
        destination: { slice: { id: 'runtime-registration-main', geometry: 'euclidean', seed: 3 } },
        sliceWorlds: new Map(),
        anomalyLayerMasks: new Map(),
        savedPlaneDefinitionsById: new Map(),
        traversalController: { worlds: new Map() },
        active: false,
        currentSliceId: baseSlice.id
    });
    return { world, topology, chunkGraph, registry, adapterRegistrations };
}

test('saved user Planes are promoted into idempotent runtime slices for anomaly endpoints', () => {
    const fixture = createRuntimeRegistrationFixture();
    const definition = {
        id: 'user-created-plane-runtime-test',
        displayName: 'User Created Destination',
        geometry: 'euclidean',
        seed: 77,
        container: { dimensions: { w: 16, x: 120, y: 80, z: 140 }, backgroundColor: '#334455', backgroundOpacity: 0.8 }
    };
    try {
        const first = fixture.world.ensureRuntimePlane(definition);
        assert.equal(first.isUserDefinedPlane, true);
        assert.equal(first.slice.id, definition.id);
        assert.equal(fixture.world.getWorld(definition.id), first);
        assert.equal(fixture.topology.getSlice(definition.id).geometry, 'euclidean');
        assert.equal(fixture.registry.get(definition.id).spatialTransform, first.transform);
        assert.equal(fixture.chunkGraph.hasSlice(definition.id), true);
        assert.equal(fixture.world.anomalyLayerMasks.get(definition.id), first.layerMask);
        assert.equal(fixture.world.traversalController.worlds.get(definition.id), first);
        assert.equal(fixture.adapterRegistrations.length, 1);
        assert.deepEqual(first.terrain.sampleAt(0, 0), { x: 0, y: -40, z: 0 });
        assert.equal(first.terrain.sampleAt(100, 0), null);
        assert.deepEqual(first.wBounds, { min: -8, max: 8 }, 'W thickness defines the runtime cross-section range');

        const revised = {
            ...definition,
            displayName: 'Renamed Runtime Destination',
            container: { ...definition.container, dimensions: { w: 40, x: 200, y: 100, z: 220 } }
        };
        const second = fixture.world.ensureRuntimePlane(revised);
        assert.equal(second, first, 'subsequent edits retain the same runtime WorldSlice binding');
        assert.equal(second.planeDefinition.displayName, revised.displayName);
        assert.deepEqual(second.terrain.sampleAt(0, 0), { x: 0, y: -50, z: 0 });
        assert.deepEqual(second.wBounds, { min: -20, max: 20 }, 'saved W thickness updates the existing runtime Plane range');
        assert.equal(fixture.adapterRegistrations.length, 1, 'repeated registration does not duplicate adapters');
        assert.ok(fixture.world.getPlaneDefinitions().some(plane => plane.id === definition.id));
    } finally {
        fixture.registry.dispose();
        fixture.chunkGraph.dispose();
    }
});

test('Plane background definition can be saved before runtime registration infrastructure is available', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    world.active = false;
    world.savedPlaneDefinitionsById = new Map();
    assert.equal(world.applyPlaneDefinition({ id: 'background-only-fixture', container: { backgroundColor: '#123456' } }), true);
    assert.equal(world.savedPlaneDefinitionsById.get('background-only-fixture').container.backgroundColor, '#123456');
});

test('portal preview lists include Plane-authored objects by planeId and retain context-hidden eligible objects', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    const remotePortal = { renderList: null, setRenderList(value) { this.renderList = value; } };
    const localPortal = { renderList: null, setRenderList(value) { this.renderList = value; } };
    const hiddenRemoteObject = {
        name: 'hidden-remote-plane-box', isVisible: false, layerMask: 0x40000000,
        metadata: { planeObject: true, planeId: 'remote-plane', planeObjectPreviewEligible: true },
        isDisposed() { return false; }, isEnabled() { return true; }
    };
    const visibleRemoteObject = {
        name: 'visible-remote-plane-terrain', isVisible: true, layerMask: 0x40000000,
        metadata: { sliceId: 'remote-plane' }, isDisposed() { return false; }, isEnabled() { return true; }
    };
    const authoredHiddenObject = {
        name: 'authored-hidden-remote-object', isVisible: false, layerMask: 0x40000000,
        metadata: { planeObject: true, planeId: 'remote-plane', planeObjectPreviewEligible: false },
        isDisposed() { return false; }, isEnabled() { return true; }
    };
    const wrongPlaneObject = {
        name: 'wrong-plane-object', isVisible: true, layerMask: 0x40000000,
        metadata: { planeId: 'other-plane' }, isDisposed() { return false; }, isEnabled() { return true; }
    };
    const disabledObject = {
        name: 'disabled-plane-object', isVisible: true, layerMask: 0x40000000,
        metadata: { sliceId: 'remote-plane' }, isDisposed() { return false; }, isEnabled() { return false; }
    };
    const portalSurface = {
        name: 'portal-surface', isVisible: true, layerMask: 0x40000000,
        metadata: { sliceId: 'remote-plane', geometryPortal: true }, isDisposed() { return false; }
    };
    Object.assign(world, {
        scene: { meshes: [hiddenRemoteObject, visibleRemoteObject, authoredHiddenObject, wrongPlaneObject, disabledObject, portalSurface] },
        anomalyLayerMasks: new Map([['local-plane', 0x10000000], ['remote-plane', 0x40000000]]),
        portalPairs: [{
            sourceSliceId: 'local-plane', destinationSliceId: 'remote-plane',
            sourcePortal: remotePortal, destinationPortal: localPortal
        }]
    });

    world.updatePortalLists();
    assert.deepEqual(remotePortal.renderList.map(mesh => mesh.name), [
        'hidden-remote-plane-box', 'visible-remote-plane-terrain'
    ]);
});

test('Plane object metadata exposes slice identity and separates authored visibility from context visibility', async () => {
    const source = await readFile(new URL('../src/editor/plane-object-renderer.js', import.meta.url), 'utf8');
    assert.match(source, /sliceId:\s*record\.planeId/);
    assert.match(source, /planeObjectPreviewEligible:\s*objectVisible\s*&&\s*!duplicateTesseract/);
    assert.match(source, /record\.context\.world\?\.isUserDefinedPlane\s*===\s*true/);
    assert.match(source, /this\.geometryDemo\?\.currentSliceId\s*===\s*record\.planeId/);
});

test('anomaly endpoint selectors and mouth changes register saved Planes before requiring runtime worlds', async () => {
    const source = await readFile(new URL('../src/editor/building-editor.js', import.meta.url), 'utf8');
    assert.match(source, /this\.geometryDemo\.ensureRuntimePlane\?\.\(plane\)/);
    assert.match(source, /this\.geometryDemo\.ensureRuntimePlane\?\.\(plane\);[\s\S]*?this\.geometryDemo\.getWorld\(planeId\)/);
});

test('hypercube surface, edges, and section vertices carry their owning Plane ID for portal previews', async () => {
    const source = await readFile(new URL('../src/demo/hypercube-4d-renderer.js', import.meta.url), 'utf8');
    assert.match(source, /metadata = \{ geometryDemo: true, hypercube4D: true, sliceId: this\.opticalSliceId/);
    assert.match(source, /metadata = \{ geometryDemo: true, hypercube4DSectionVertex: index, sliceId: this\.opticalSliceId \}/);
});

test('newly saved Planes are registered before they are offered as anomaly mouth destinations', async () => {
    const previousDocument = globalThis.document;
    const { BuildingEditor } = await import('../src/editor/building-editor.js');
    const optionLists = { source: [], destination: [] };
    const selects = {
        source: { replaceChildren() { optionLists.source = []; }, append(option) { optionLists.source.push(option); }, value: '' },
        destination: { replaceChildren() { optionLists.destination = []; }, append(option) { optionLists.destination.push(option); }, value: '' }
    };
    const values = new Map();
    globalThis.document = {
        createElement(tag) { assert.equal(tag, 'option'); return { value: '', textContent: '' }; }
    };
    const registered = new Map();
    const ensureCalls = [];
    const editor = Object.create(BuildingEditor.prototype);
    editor.anomalyPersistence = {
        async listPlanes() {
            return [{ id: 'new-user-plane', displayName: 'New User Plane' }, { id: 'second-user-plane', displayName: 'Second User Plane' }];
        }
    };
    editor.geometryDemo = {
        getPlaneDefinitions() { return []; },
        ensureRuntimePlane(plane) { ensureCalls.push(plane.id); registered.set(plane.id, { slice: { id: plane.id } }); },
        getWorld(id) { if (!registered.has(id)) throw new Error(`not registered: ${id}`); return registered.get(id); }
    };
    editor.container = {
        querySelector(selector) {
            const sourceMatch = selector.match(/^\[data-plane-select="(source|destination)"\]$/);
            if (sourceMatch) return selects[sourceMatch[1]];
            if (!values.has(selector)) values.set(selector, { value: '' });
            return values.get(selector);
        }
    };
    editor.currentAnomalyPlaneId = null;
    editor.setAnomalyPlane = async id => { editor.activatedPlaneId = id; };
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    try {
        await editor.populateEndpointControls({
            source: { planeId: 'new-user-plane', position: { x: 1, y: 2, z: 3 }, orientation: identity },
            destination: { planeId: 'second-user-plane', position: { x: 4, y: 5, z: 6 }, orientation: identity }
        });
        assert.deepEqual(ensureCalls.sort(), ['new-user-plane', 'second-user-plane']);
        assert.deepEqual(optionLists.source.map(option => option.value), ['new-user-plane', 'second-user-plane']);
        assert.deepEqual(optionLists.destination.map(option => option.value), ['new-user-plane', 'second-user-plane']);
        assert.equal(selects.source.value, 'new-user-plane');
        assert.equal(selects.destination.value, 'second-user-plane');
        assert.equal(editor.activatedPlaneId, 'new-user-plane');
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('selecting a saved custom Plane promotes it to runtime before activating the anomaly editor camera', async () => {
    const { BuildingEditor } = await import('../src/editor/building-editor.js');
    const order = [];
    const selectedPlane = { id: 'custom-anomaly-plane', displayName: 'Custom Anomaly Plane' };
    const runtimeWorld = { transform: { name: 'custom-transform' }, layerMask: 0x40000000 };
    const editor = Object.create(BuildingEditor.prototype);
    editor.anomalyPersistence = { async getPlane(id) { assert.equal(id, selectedPlane.id); return selectedPlane; } };
    editor.geometryDemo = {
        ensureRuntimePlane(plane) { order.push(`ensure:${plane.id}`); },
        getWorld(id) { order.push(`get:${id}`); return runtimeWorld; },
        setActive(value) { order.push(`active:${value}`); },
        traversalController: { syncSlice(id) { order.push(`sync:${id}`); } },
        activateSlice(id) { order.push(`activate:${id}`); }
    };
    editor.editorCamera = {
        camera: {},
        focus(point, distance) { order.push(`focus:${distance}`); }
    };
    editor.anomalyTransformTools = { setLayerMask(mask) { order.push(`mask:${mask}`); } };
    editor.container = { querySelector() { return { textContent: '' }; } };
    editor.attachAnomalyApertureGizmo = () => order.push('gizmo');

    await editor.setAnomalyPlane(selectedPlane.id);
    assert.deepEqual(order.slice(0, 2), [`ensure:${selectedPlane.id}`, `get:${selectedPlane.id}`]);
    assert.equal(editor.currentAnomalyPlaneId, selectedPlane.id);
    assert.equal(editor.currentPlaneTransform, runtimeWorld.transform);
    assert.equal(editor.editorCamera.camera.layerMask, runtimeWorld.layerMask);
    assert.ok(order.includes(`activate:${selectedPlane.id}`));
    assert.ok(order.includes('gizmo'));
});

test('Plane save refreshes newly authored meshes before rebuilding connected anomaly preview lists', async () => {
    const { PlaneEditor } = await import('../src/editor/plane-editor.js');
    const calls = [];
    const saved = { id: 'saved-plane-with-new-object', displayName: 'Saved Plane', objects: [{ id: 'new-box' }] };
    const editor = Object.create(PlaneEditor.prototype);
    editor.persistence = { async savePlane(definition) { calls.push('persist'); return saved; } };
    editor.collectDefinition = () => ({ id: saved.id });
    editor.geometryDemo = {
        applyPlaneDefinition(plane) { assert.equal(plane, saved); calls.push('register-runtime'); },
        updatePortalLists() { calls.push('refresh-portal-lists'); }
    };
    editor.applyPlaneBackgroundFromInputs = () => calls.push('apply-editor-background');
    editor.refresh = async () => calls.push('refresh-authored-meshes');
    editor.setStatus = message => { editor.lastStatus = message; };
    editor.selectedId = null;
    editor.currentPlane = null;

    await editor.save();
    assert.deepEqual(calls, [
        'persist', 'register-runtime', 'apply-editor-background',
        'refresh-authored-meshes', 'refresh-portal-lists'
    ]);
    assert.equal(editor.selectedId, saved.id);
    assert.match(editor.lastStatus, /Saved Plane/);
});
