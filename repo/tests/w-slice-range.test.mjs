import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaneObjectRenderer } from '../src/editor/plane-object-renderer.js';
import { GeometryDemoWorld } from '../src/demo/geometry-demo-world.js';
import {
    getPlaneAmbientWBounds,
    getPlaneNormalOffsetAtW,
    getUniverseWSliceBounds,
    planeIntersectsWSlice
} from '../src/world/fields/geometry/w-slice-range.js';

function makePlane(id, center, dimensions = { w: 10, x: 100, y: 60, z: 100 }, frame = null) {
    return {
        id,
        w: center,
        frame: frame ?? {
            origin: { x: 0, y: 0, z: 0, w: center },
            axes: [
                { x: 1, y: 0, z: 0, w: 0 },
                { x: 0, y: 1, z: 0, w: 0 },
                { x: 0, y: 0, z: 1, w: 0 }
            ],
            normal: { x: 0, y: 0, z: 0, w: 1 }
        },
        container: { dimensions }
    };
}

test('Plane ambient-W extents include normal thickness and W components of frame axes', () => {
    const aligned = getPlaneAmbientWBounds(makePlane('aligned', 12, { w: 8, x: 20, y: 10, z: 10 }));
    assert.deepEqual(aligned, { min: 8, max: 16, center: 12, extent: 4 });

    const oblique = makePlane('oblique', 20, { w: 6, x: 8, y: 10, z: 12 }, {
        origin: { x: 0, y: 0, z: 0, w: 20 },
        axes: [
            { x: 0, y: 0, z: 1, w: 0.5 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 1, y: 0, z: 0, w: 0 }
        ],
        normal: { x: 0, y: 0, z: 0.866, w: 0.5 }
    });
    const bounds = getPlaneAmbientWBounds(oblique);
    assert.equal(bounds.center, 20);
    assert.ok(Math.abs(bounds.extent - (8 * 0.5 / 2 + 6 * 0.5 / 2)) < 1e-10);
    assert.equal(planeIntersectsWSlice(oblique, 22), true);
    assert.equal(planeIntersectsWSlice(oblique, 24), false);
});

test('universe W range covers built-in slices and expands for custom Planes and runtime slices', () => {
    const custom = makePlane('far-plane', 140, { w: 20, x: 10, y: 10, z: 10 });
    const worlds = new Map([
        ['room', { slice: { frame: { origin: { w: 0 }, normal: { w: 1 } } }, wBounds: { min: 0, max: 0 } }],
        ['chamber', { slice: { frame: { origin: { w: 75 }, normal: { w: 1 } } }, wBounds: { min: -5, max: 5 } }]
    ]);
    const bounds = getUniverseWSliceBounds([custom], worlds);
    assert.equal(bounds.min, -10);
    assert.equal(bounds.max, 160);
    assert.ok(bounds.min <= 0 && bounds.max >= 150);
});

test('Plane-local W offset is computed against the Plane normal rather than clamped to its thickness', () => {
    const plane = makePlane('half-normal', 75, { w: 10, x: 10, y: 10, z: 10 }, {
        origin: { x: 0, y: 0, z: 0, w: 75 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ],
        normal: { x: 0, y: 0, z: Math.sqrt(0.75), w: 0.5 }
    });
    assert.equal(getPlaneNormalOffsetAtW(plane, 80), 10);
});


test('Plane object renderer shows every Plane that intersects the active editor W slice', () => {
    const renderer = Object.create(PlaneObjectRenderer.prototype);
    renderer.planeDefinitions = new Map([
        ['near', makePlane('near', 0, { w: 10, x: 10, y: 10, z: 10 })],
        ['far', makePlane('far', 60, { w: 10, x: 10, y: 10, z: 10 })]
    ]);
    renderer.viewerW = null;
    renderer.viewerWByPlane = new Map();
    renderer.editorWCoordinate = null;
    renderer.editorActive = true;
    renderer.editorPlaneId = 'near';
    renderer.demoActive = false;
    renderer.geometryDemo = null;
    const makeRecord = planeId => ({
        planeId,
        object: { id: `${planeId}-box`, type: 'box', visible: true },
        context: { world: null, runtimeWorld: false },
        meshes: [{ isVisible: false, isPickable: false, metadata: {} }]
    });
    const nearRecord = makeRecord('near');
    const farRecord = makeRecord('far');
    renderer.records = new Map([['near-box', nearRecord], ['far-box', farRecord]]);

    renderer.setEditorWCoordinate(0);
    assert.equal(nearRecord.meshes[0].isVisible, true);
    assert.equal(farRecord.meshes[0].isVisible, false);

    renderer.setEditorWCoordinate(60);
    assert.equal(nearRecord.meshes[0].isVisible, false);
    assert.equal(farRecord.meshes[0].isVisible, true);
});

test('GeometryDemoWorld exposes the universe W span and reports the editor inspection coordinate', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    world.savedPlaneDefinitionsById = new Map([['far', makePlane('far', 140, { w: 20, x: 10, y: 10, z: 10 })]]);
    world.sliceWorlds = new Map([
        ['room', { slice: { frame: { origin: { w: 0 }, normal: { w: 1 } } }, wBounds: { min: 0, max: 0 } }],
        ['4d', { slice: { frame: { origin: { w: 75 }, normal: { w: 1 } } }, wBounds: { min: -5, max: 5 } }]
    ]);
    const bounds = world.getUniverseWSliceBounds();
    assert.equal(bounds.min, -10);
    assert.equal(bounds.max, 160);

    world.traversalController = { getRoutesForSlice: () => [], state: 'idle' };
    world.cameraController = {
        wMovementEnabled: false,
        mode: 'free',
        freeTransit: null,
        getViewSliceId: () => 'room',
        getFreeAmbientPosition: () => ({ x: 0, y: 0, z: 0, w: 3.5 })
    };
    world.currentSliceId = 'room';
    world.getWorld = () => ({ slice: { frame: { origin: { w: 0 } } } });
    let state = null;
    world.onWDimensionStateChanged = value => { state = value; };
    const selected = world.setEditorWCoordinate(42.25);
    assert.equal(selected, 42.25);
    assert.equal(state.coordinate, 42.25, 'slider changes immediately publish the selected ambient W coordinate');
    assert.equal(state.editorInspection, true);
    assert.equal(state.sliceId, 'room');
});


test('editor W navigation resolves the three built-in runtime views and includes intersecting custom Planes', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    const plane = (id, center, thickness = 10) => makePlane(id, center, {
        w: thickness, x: 100, y: 60, z: 100
    });
    const source = { id: 'geometry-demo-room', plane: plane('geometry-demo-room', 0), mask: 0x10000000 };
    const chamber = { id: 'geometry-demo-4d-chamber', plane: plane('geometry-demo-4d-chamber', 75), mask: 0x20000000 };
    const main = { id: 'somnium-main', plane: plane('somnium-main', 80), mask: 0x0FFFFFFF };
    const custom = { id: 'custom-at-75', plane: plane('custom-at-75', 75, 20), mask: 0x40000000 };
    const runtime = entry => ({
        slice: { id: entry.id, frame: entry.plane.frame, w: entry.plane.w },
        planeDefinition: entry.plane,
        transform: { id: `${entry.id}-transform` },
        layerMask: entry.mask,
        isUserDefinedPlane: entry.id.startsWith('custom-')
    });
    const worlds = [source, chamber, main, custom].map(entry => runtime(entry));
    world.sourceSlice = { id: source.id };
    world.hypercubeSlice = { id: chamber.id };
    world.destination = { slice: { id: main.id } };
    world.sliceWorlds = new Map(worlds.map(entry => [entry.slice.id, entry]));
    world.savedPlaneDefinitionsById = new Map([source, chamber, main, custom].map(entry => [entry.id, entry.plane]));

    const atZero = world.resolveEditorInspectionContext(0);
    assert.equal(atZero.sliceId, source.id);
    assert.deepEqual(atZero.includedPlaneIds, [source.id]);
    assert.equal(atZero.transform.id, `${source.id}-transform`);

    const at75 = world.resolveEditorInspectionContext(75);
    assert.equal(at75.sliceId, chamber.id, 'W=75 selects the 4D chamber, not the overlapping Main World boundary');
    assert.deepEqual(new Set(at75.includedPlaneIds), new Set([chamber.id, custom.id]));
    assert.ok((at75.layerMask & chamber.mask) !== 0);
    assert.ok((at75.layerMask & custom.mask) !== 0);
    assert.equal((at75.layerMask & main.mask), 0, 'the Main World layer is not leaked into the 4D chamber view');

    const at80 = world.resolveEditorInspectionContext(80);
    assert.equal(at80.sliceId, main.id, 'W=80 selects the Main World');
    assert.ok(at80.visibleSliceIds.has(custom.id), 'custom Planes whose W thickness intersects W=80 remain visible');
    assert.ok((at80.layerMask & main.mask) !== 0);
    assert.equal((at80.layerMask & chamber.mask), 0, 'the 4D chamber layer is hidden at W=80');

    const empty = world.resolveEditorInspectionContext(40);
    assert.equal(empty.sliceId, null, 'an unoccupied W coordinate is represented as an empty slice');
    assert.equal(empty.hasIntersectingPlane, false);
    assert.equal(empty.layerMask & 0x40000000, 0x40000000, 'the editor can still author a custom Plane in an empty slice');
});

test('setting the editor W coordinate immediately reapplies the selected runtime slice presentation', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    world.editorWCoordinate = null;
    world.editorInspectionContext = null;
    world.active = true;
    world.sourceSlice = { id: 'geometry-demo-room' };
    world.hypercubeSlice = { id: 'geometry-demo-4d-chamber' };
    world.destination = { slice: { id: 'somnium-main' } };
    const definitions = [
        makePlane('geometry-demo-room', 0),
        makePlane('geometry-demo-4d-chamber', 75),
        makePlane('somnium-main', 80)
    ];
    world.savedPlaneDefinitionsById = new Map(definitions.map(plane => [plane.id, plane]));
    world.sliceWorlds = new Map(definitions.map((plane, index) => [plane.id, {
        slice: { id: plane.id, frame: plane.frame }, planeDefinition: plane,
        transform: { id: plane.id }, layerMask: [0x10000000, 0x20000000, 0x0FFFFFFF][index]
    }]));
    world.cameraController = { getViewSliceId: () => 'geometry-demo-room', mode: 'free', getFreeAmbientPosition: () => ({ x: 0, y: 0, z: 0, w: 0 }) };
    world.traversalController = { getRoutesForSlice: () => [], getAmbientPlayerPosition: () => ({ x: 0, y: 0, z: 0, w: 0 }) };
    const presentations = [];
    world.updateCameraPresentation = () => presentations.push(world.getEditorInspectionContext()?.sliceId ?? null);
    world.updateWDimensionState = (sliceId, position) => { world.lastWState = { sliceId, position }; };

    world.setEditorWCoordinate(75);
    assert.equal(world.getPresentationSliceId(), 'geometry-demo-4d-chamber');
    assert.deepEqual(presentations, ['geometry-demo-4d-chamber']);
    assert.equal(world.lastWState.sliceId, 'geometry-demo-4d-chamber');
    assert.equal(world.lastWState.position.w, 75);

    world.setEditorWCoordinate(80);
    assert.equal(world.getPresentationSliceId(), 'somnium-main');
    assert.deepEqual(presentations, ['geometry-demo-4d-chamber', 'somnium-main']);

    world.clearEditorWCoordinate();
    assert.equal(world.getPresentationSliceId(), 'geometry-demo-room', 'clearing editor inspection restores the gameplay slice');
});


test('editor W presentation switches built-in scene layers while retaining intersecting custom Plane layers', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    const entries = [
        { id: 'geometry-demo-room', center: 0, layerMask: 0x10000000 },
        { id: 'geometry-demo-4d-chamber', center: 75, layerMask: 0x20000000 },
        { id: 'somnium-main', center: 80, layerMask: 0x0FFFFFFF },
        { id: 'custom-plane', center: 75, layerMask: 0x40000000 }
    ];
    const runtime = entries.map(entry => {
        const definition = makePlane(entry.id, entry.center, { w: entry.id === 'custom-plane' ? 20 : 10, x: 100, y: 60, z: 100 });
        return {
            slice: { id: entry.id, frame: definition.frame }, planeDefinition: definition,
            transform: { id: entry.id }, layerMask: entry.layerMask
        };
    });
    world.sourceSlice = { id: entries[0].id };
    world.hypercubeSlice = { id: entries[1].id };
    world.destination = { slice: { id: entries[2].id } };
    world.savedPlaneDefinitionsById = new Map(runtime.map(item => [item.slice.id, item.planeDefinition]));
    world.sliceWorlds = new Map(runtime.map(item => [item.slice.id, item]));
    world.cameraController = { getViewSliceId: () => entries[0].id };
    world.camera = { layerMask: 0 };
    world.active = true;
    world.getWorld = id => world.sliceWorlds.get(id);
    world.corridorRenderers = entries.slice(0, 3).map(entry => ({
        sliceId: entry.id, renderer: { mesh: { isVisible: false } }
    }));
    world.grids = new Map(entries.slice(0, 3).map(entry => [entry.id, { active: false, setActive(value) { this.active = value; } }]));
    const makePortal = () => ({ visible: false, setVisible(value) { this.visible = value; } });
    world.portalPairs = [{
        sourceSliceId: entries[0].id, destinationSliceId: entries[1].id,
        corridor: { visible: true, view: { enabled: true } },
        sourcePortal: makePortal(), destinationPortal: makePortal()
    }];
    world.onViewChanged = (sliceId, state) => { world.lastView = { sliceId, state }; };
    world.editorWCoordinate = 75;

    world.updateCameraPresentation();
    assert.ok((world.camera.layerMask & entries[1].layerMask) !== 0, '4D chamber layer is active at W=75');
    assert.ok((world.camera.layerMask & entries[3].layerMask) !== 0, 'intersecting custom Plane layer is active at W=75');
    assert.equal(world.camera.layerMask & entries[0].layerMask, 0, 'Poincare room layer is hidden at W=75');
    assert.equal(world.camera.layerMask & entries[2].layerMask, 0, 'Main World layer is hidden at W=75');
    assert.equal(world.corridorRenderers[1].renderer.mesh.isVisible, true);
    assert.equal(world.corridorRenderers[0].renderer.mesh.isVisible, false);
    assert.equal(world.lastView.sliceId, entries[1].id);
    assert.equal(world.lastView.state.editorInspection, true);

    world.editorWCoordinate = 80;
    world.updateCameraPresentation();
    assert.ok((world.camera.layerMask & entries[2].layerMask) !== 0, 'Main World layer is active at W=80');
    assert.equal(world.camera.layerMask & entries[1].layerMask, 0, '4D chamber layer is hidden at W=80');
    assert.equal(world.corridorRenderers[2].renderer.mesh.isVisible, true);
    assert.equal(world.corridorRenderers[1].renderer.mesh.isVisible, false);
});

test('editor inspection focus follows the selected built-in room or custom Plane frame', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    world.sourceSlice = { id: 'geometry-demo-room' };
    world.hypercubeSlice = { id: 'geometry-demo-4d-chamber' };
    world.destination = { slice: { id: 'somnium-main' } };
    world.mainAnchor = { x: 123, y: 4.5, z: -456 };
    assert.deepEqual(world.getEditorInspectionFocus({ sliceId: 'geometry-demo-room' }), { x: 0, y: 2.5, z: 0 });
    assert.deepEqual(world.getEditorInspectionFocus({ sliceId: 'geometry-demo-4d-chamber' }), { x: 0, y: 2.5, z: 0 });
    assert.deepEqual(world.getEditorInspectionFocus({ sliceId: 'somnium-main' }), world.mainAnchor);
    assert.deepEqual(world.getEditorInspectionFocus({ sliceId: 'custom-plane' }), { x: 0, y: 2, z: 0 });
    assert.equal(world.getEditorInspectionFocus({ sliceId: null }), null);
});

test('BuildingEditor W inspection retargets only when the selected runtime slice changes', async () => {
    const { BuildingEditor } = await import('../src/editor/building-editor.js');
    const editor = Object.create(BuildingEditor.prototype);
    const builtinTransform = { id: 'hypercube-transform' };
    const customTransform = { id: 'custom-transform' };
    const focusCalls = [];
    const setCoordinates = [];
    const clearCalls = [];
    editor.editorInspectionSliceId = 'geometry-demo-room';
    editor.transform = { id: 'base-transform' };
    editor.currentPlaneTransform = customTransform;
    editor.planeEditor = { activeTransform: customTransform };
    editor.editorCamera = {
        transform: null,
        camera: { layerMask: 0 },
        focus(point) { focusCalls.push({ ...point }); }
    };
    let inspection = {
        sliceId: 'geometry-demo-4d-chamber',
        transform: builtinTransform,
        layerMask: 0xA0000000
    };
    const focusBySlice = {
        'geometry-demo-4d-chamber': { x: 0, y: 2.5, z: 0 },
        'somnium-main': { x: 123, y: 4.5, z: -456 }
    };
    editor.geometryDemo = {
        setEditorWCoordinate(value) { setCoordinates.push(value); },
        clearEditorWCoordinate() { clearCalls.push(true); },
        getEditorInspectionContext() { return inspection; },
        getEditorInspectionFocus(context) { return focusBySlice[context.sliceId] ?? null; }
    };

    editor.applyEditorWInspection({ coordinate: 75 });
    assert.deepEqual(setCoordinates, [75]);
    assert.equal(editor.editorCamera.transform, builtinTransform);
    assert.equal(editor.editorCamera.camera.layerMask, 0xA0000000);
    assert.deepEqual(focusCalls, [{ x: 0, y: 2.5, z: 0 }]);

    // Decimal changes within the same runtime Plane must not reset the user's orbit.
    editor.applyEditorWInspection({ coordinate: 75.25 });
    assert.deepEqual(focusCalls, [{ x: 0, y: 2.5, z: 0 }]);

    inspection = {
        sliceId: 'somnium-main',
        transform: { id: 'main-transform' },
        layerMask: 0x8FFFFFFF
    };
    editor.applyEditorWInspection({ coordinate: 80 });
    assert.deepEqual(focusCalls, [
        { x: 0, y: 2.5, z: 0 },
        { x: 123, y: 4.5, z: -456 }
    ]);
    assert.equal(editor.editorCamera.transform, inspection.transform);
    assert.equal(editor.editorCamera.camera.layerMask, inspection.layerMask);

    inspection = { sliceId: null, transform: null, layerMask: 0xC0000000 };
    editor.applyEditorWInspection({ coordinate: 40 });
    assert.equal(editor.editorCamera.transform, customTransform, 'empty slices retain the selected authoring Plane transform');
    assert.equal(editor.editorCamera.camera.layerMask, 0xC0000000);

    editor.applyEditorWInspection(null);
    assert.deepEqual(clearCalls, [true]);
    assert.equal(editor.editorInspectionSliceId, null);
    assert.equal(editor.editorCamera.transform, customTransform);
    assert.equal(editor.editorCamera.camera.layerMask, 0x0FFFFFFF);
});

test('inactive geometry demo publishes editor W view changes without enabling gameplay rendering', () => {
    const world = Object.create(GeometryDemoWorld.prototype);
    const definition = makePlane('geometry-demo-4d-chamber', 75);
    const runtime = {
        slice: { id: definition.id, frame: definition.frame },
        planeDefinition: definition,
        transform: { id: 'chamber-transform' },
        layerMask: 0x20000000
    };
    world.active = false;
    world.disposed = false;
    world.editorWCoordinate = null;
    world.editorInspectionContext = null;
    world.sourceSlice = { id: 'geometry-demo-room' };
    world.hypercubeSlice = { id: 'geometry-demo-4d-chamber' };
    world.destination = { slice: { id: 'somnium-main' } };
    world.sliceWorlds = new Map([[definition.id, runtime]]);
    world.savedPlaneDefinitionsById = new Map([[definition.id, definition]]);
    world.cameraController = { getViewSliceId: () => 'geometry-demo-room', mode: 'follow' };
    world.traversalController = { getRoutesForSlice: () => [], getAmbientPlayerPosition: () => ({ x: 0, y: 0, z: 0, w: 0 }) };
    world.updateWDimensionState = (sliceId, position) => { world.lastWState = { sliceId, position }; };
    const views = [];
    world.onViewChanged = (sliceId, state) => views.push({ sliceId, state });

    world.setEditorWCoordinate(75);
    assert.equal(views.length, 1);
    assert.equal(views[0].sliceId, 'geometry-demo-4d-chamber');
    assert.equal(views[0].state.editorInspection, true);
    assert.equal(views[0].state.coordinate, 75);

    world.clearEditorWCoordinate();
    assert.equal(views.length, 2);
    assert.equal(views[1].sliceId, 'geometry-demo-room');
    assert.equal(views[1].state, null);
});
