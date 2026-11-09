import assert from 'node:assert/strict';
import test from 'node:test';
import { GeometryDemoWorld } from '../src/demo/geometry-demo-world.js';

function createPortal() {
    return {
        rim: { isVisible: false },
        visible: false,
        pose: null,
        resetCount: 0,
        setPose(position, direction) { this.pose = { position, direction }; },
        setVisible(visible) { this.visible = visible; },
        resetPose() { this.resetCount++; this.pose = null; }
    };
}

function createWorld(transit) {
    const samples = [];
    const renderer = {
        getDisplaySample(t) {
            samples.push(t);
            return {
                position: { x: t * 10, y: 2, z: t * 30 },
                tangent: { x: 0, y: 0, z: 1 }
            };
        }
    };
    const portal = createPortal();
    const destinationPortal = createPortal();
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        sourceSlice: { id: 'geometry-demo-room' },
        destination: { slice: { id: 'somnium-main' } },
        traversalController: {
            state: transit.player ? 'transit' : 'idle',
            currentSliceId: 'geometry-demo-room',
            corridorLength: 80,
            ...transit.player,
            renderer
        },
        cameraController: {
            mode: transit.cameraMode ?? 'follow',
            getFreeTransitState() { return transit.camera ?? null; },
            getViewSliceId() { return transit.viewSliceId ?? 'geometry-demo-room'; }
        },
        portal, destinationPortal
    });
    return { world, portal, destinationPortal, samples };
}

test('destination preview stays in front of the player during corridor transit', function previewAheadOfPlayer() {
    const fixture = createWorld({ player: { direction: 1, progress: 0.4 } });
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.equal(fixture.samples.length, 1);
    assert.ok(fixture.samples[0] > 0.4);
    assert.equal(fixture.portal.visible, true);
    assert.equal(fixture.portal.rim.isVisible, true);
    assert.equal(fixture.destinationPortal.visible, false);
    assert.equal(fixture.destinationPortal.rim.isVisible, false);
    assert.deepEqual(fixture.portal.pose.position, { x: fixture.samples[0] * 10, y: 2, z: fixture.samples[0] * 30 });
});

test('reverse corridor transit previews the source world through its destination aperture', function reversePreview() {
    const fixture = createWorld({ player: { direction: -1, progress: 0.25 } });
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.ok(fixture.samples[0] < 0.75);
    assert.ok(fixture.samples[0] > 0.5);
    assert.equal(fixture.destinationPortal.visible, true);
    assert.equal(fixture.portal.visible, false);
});

test('free-camera corridor inspection also preserves the destination window', function freeCameraPreview() {
    const fixture = createWorld({
        camera: { direction: 1, progress: 0.8, renderer: null },
        player: { direction: 1, progress: 0.2 }
    });
    fixture.world.cameraController.mode = 'free';
    fixture.world.cameraController.getFreeTransitState = function getFreeTransitState() {
        return { direction: 1, progress: 0.8, renderer: fixture.world.traversalController.renderer };
    };
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.ok(fixture.samples[0] > 0.9);
    assert.equal(fixture.portal.visible, true);
});


test('free-camera transit takes precedence over a stationary player transit', function cameraTransitPriority() {
    const fixture = createWorld({
        player: { direction: 1, progress: 0.2 },
        camera: { direction: 1, progress: 0.8, renderer: null },
        cameraMode: 'free'
    });
    fixture.world.cameraController.getFreeTransitState = function getFreeTransitState() {
        return { direction: 1, progress: 0.8, renderer: fixture.world.traversalController.renderer };
    };
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.ok(fixture.samples[0] > 0.9);
});

test('portal visibility follows the free camera slice rather than the player slice', function cameraSliceVisibility() {
    const fixture = createWorld({ viewSliceId: 'somnium-main', cameraMode: 'free' });
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.equal(fixture.portal.visible, false);
    assert.equal(fixture.destinationPortal.visible, true);
});

test('portal look-ahead remains near the viewer instead of waiting until late transit', function nearPreviewAperture() {
    const fixture = createWorld({ player: { direction: 1, progress: 0.1 } });
    GeometryDemoWorld.prototype.updatePortalPreview.call(fixture.world);
    assert.ok(fixture.samples[0] > 0.1);
    assert.ok(fixture.samples[0] < 0.4);
});

test('camera presentation selects the free camera slice without changing player ownership', function cameraPresentationSlice() {
    const world = Object.create(GeometryDemoWorld.prototype);
    const gridStates = [];
    Object.assign(world, {
        active: true,
        sourceSlice: { id: 'geometry-demo-room' },
        destination: { slice: { id: 'somnium-main' } },
        sourceWorld: { slice: { id: 'geometry-demo-room' }, layerMask: 1 },
        destinationWorld: { slice: { id: 'somnium-main' }, layerMask: 2 },
        camera: { layerMask: 1 },
        cameraController: {
            mode: 'free',
            getViewSliceId() { return 'somnium-main'; },
            getFreeTransitState() { return null; }
        },
        traversalController: { state: 'idle' },
        corridorRenderer: { mesh: { isVisible: false } },
        destinationCorridorRenderer: { mesh: { isVisible: false } },
        debugGrid: { setActive(value) { gridStates.push(value); } }
    });
    GeometryDemoWorld.prototype.updateCameraPresentation.call(world);
    assert.equal(world.camera.layerMask, 2);
    assert.equal(world.corridorRenderer.mesh.isVisible, false);
    assert.equal(world.destinationCorridorRenderer.mesh.isVisible, true);
    assert.deepEqual(gridStates, [false]);
});

test('destination chunk focus follows a free camera after its independent handoff', function destinationFocus() {
    const focus = { x: 12, y: 4, z: -8 };
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        currentSliceId: 'geometry-demo-room',
        destination: { slice: { id: 'somnium-main' } },
        player: { worldPosition: { x: 0, y: 0, z: 0 } },
        mainAnchor: { x: 0, y: 0, z: 0 },
        cameraController: {
            mode: 'free', freeSliceId: 'somnium-main',
            getFreeWorldPosition() { return focus; }
        }
    });
    assert.deepEqual(GeometryDemoWorld.prototype.getDestinationFocus.call(world), focus);
});


test('metric grid activation selects the active slice and synchronizes its visibility', function metricGridActivation() {
    const calls = [];
    const makeGrid = (id) => ({
        setVisible(value) { calls.push({ id, kind: 'visible', value }); },
        setActive(value) { calls.push({ id, kind: 'active', value }); }
    });
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        disposed: false,
        gridEnabled: false,
        grids: new Map([
            ['geometry-demo-room', makeGrid('poincare')],
            ['geometry-demo-4d-chamber', makeGrid('hypercube')],
            ['somnium-main', makeGrid('main')]
        ]),
        cameraController: { getViewSliceId() { return 'somnium-main'; } },
        updateCameraPresentation() { calls.push({ kind: 'presentation' }); }
    });

    assert.equal(GeometryDemoWorld.prototype.toggleGrid.call(world), true);
    assert.equal(world.gridEnabled, true);
    assert.deepEqual(calls.filter((entry) => entry.kind === 'visible'), [
        { id: 'poincare', kind: 'visible', value: true },
        { id: 'hypercube', kind: 'visible', value: true },
        { id: 'main', kind: 'visible', value: true }
    ]);
    assert.equal(calls.at(-1).kind, 'presentation');
});

test('G toggles the metric grid in the demo while browser-modified shortcuts are untouched', function gridKeyboardShortcut() {
    const calls = [];
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true, disposed: false,
        toggleGrid() { calls.push('toggle'); }
    });
    let prevented = 0;
    GeometryDemoWorld.prototype.handleGridKeyDown.call(world, {
        code: 'KeyG', repeat: false, ctrlKey: false, metaKey: false, altKey: false,
        target: { tagName: 'CANVAS' }, preventDefault() { prevented++; }
    });
    GeometryDemoWorld.prototype.handleGridKeyDown.call(world, {
        code: 'KeyG', repeat: false, ctrlKey: true, metaKey: false, altKey: false,
        target: { tagName: 'CANVAS' }, preventDefault() { prevented++; }
    });
    assert.deepEqual(calls, ['toggle']);
    assert.equal(prevented, 1);
});

test('Main World metric grid is registered as a terrain-conformed slice grid', async function mainWorldGridRegistration() {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.match(source, /const mainWorldGrid = new GeometryDebugGrid\(scene, adapter, \{/);
    assert.match(source, /sliceId: mainSlice\.id,[\s\S]*?heightAt\(x, z\)/);
    assert.match(source, /\[this\.destination\.slice\.id, this\.mainWorldGrid\]/);
});


test('camera presentation activates only the grid belonging to the current slice', function activeSliceGrid() {
    const states = [];
    const makeGrid = (id) => ({
        setActive(value) { states.push({ id, value }); },
        setVisible() {}
    });
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        sourceSlice: { id: 'poincare' },
        hypercubeSlice: { id: 'hypercube' },
        destination: { slice: { id: 'somnium-main' } },
        sourceWorld: { slice: { id: 'poincare' }, layerMask: 1 },
        hypercubeWorld: { slice: { id: 'hypercube' }, layerMask: 2 },
        destinationWorld: { slice: { id: 'somnium-main' }, layerMask: 4 },
        camera: { layerMask: 0 },
        cameraController: { getViewSliceId() { return 'somnium-main'; } },
        corridorRenderers: [],
        grids: new Map([
            ['poincare', makeGrid('poincare')],
            ['hypercube', makeGrid('hypercube')],
            ['somnium-main', makeGrid('main')]
        ]),
        portalPairs: [],
        onViewChanged() {}
    });

    GeometryDemoWorld.prototype.updateCameraPresentation.call(world);
    assert.equal(world.camera.layerMask, 4);
    assert.deepEqual(states, [
        { id: 'poincare', value: false },
        { id: 'hypercube', value: false },
        { id: 'main', value: true }
    ]);
});
