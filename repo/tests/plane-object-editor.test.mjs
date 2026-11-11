import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPlaneDefinition, createPlaneObjectDefinition } from '../src/world/fields/geometry/plane-registry.js';
import { PlaneEditor, createPlaneEditorDefinition } from '../src/editor/plane-editor.js';
import { PlaneAnomalyPersistence } from '../src/world/persistence/plane-anomaly-persistence.js';
import { createPlaneFrameTransform, projectPlaneLocalPosition } from '../src/editor/plane-object-renderer.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Plane object definitions normalize stable local position, rotation, scale, visibility, and material data', () => {
    const object = createPlaneObjectDefinition({
        id: 'local-box', type: 'box', name: 'Local Box',
        position: { x: 2, y: 3, z: -4 }, rotation: { x: 10, y: 25, z: 40 },
        dimensions: { x: 2, y: 3, z: 4 }, visible: false,
        material: { color: '#AABBCC' }
    });
    assert.deepEqual(object.position, { x: 2, y: 3, z: -4 });
    assert.deepEqual(object.rotation, { x: 10, y: 25, z: 40 });
    assert.deepEqual(object.dimensions, { x: 2, y: 3, z: 4 });
    assert.equal(object.visible, false);
    assert.equal(object.material.color, '#aabbcc');
});


test('label object definitions default to camera-facing annotations but preserve explicit orientation', () => {
    const defaultLabel = createPlaneObjectDefinition({ id: 'label-default', type: 'label', text: 'HELLO' });
    const fixedLabel = createPlaneObjectDefinition({ id: 'label-fixed', type: 'label', text: 'HELLO', parameters: { billboard: false } });
    assert.equal(defaultLabel.parameters.billboard, true);
    assert.equal(fixedLabel.parameters.billboard, false);
});

test('Plane frame transform converts local coordinates through its ambient origin and tangent axes', () => {
    const chart = {
        geometryName: 'test-chart',
        worldToRender: point => ({ x: 5 + 10 * point.x, y: -3 + 10 * point.y, z: 2 + 10 * point.z }),
        renderToWorld: point => ({ x: (point.x - 5) / 10, y: (point.y + 3) / 10, z: (point.z - 2) / 10 }),
        getVisualScale: () => 2,
        getJacobian: () => [10, 0, 0, 0, 10, 0, 0, 0, 10]
    };
    const frame = {
        origin: { x: 10, y: 20, z: 30, w: 7 },
        axes: [
            { x: 0, y: 1, z: 0, w: 0 },
            { x: -1, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ]
    };
    const result = createPlaneFrameTransform(chart, frame);
    assert.equal(result.supported, true);
    const local = { x: 2, y: 3, z: 4 };
    const render = result.transform.worldToRender(local);
    assert.deepEqual(render, { x: 75, y: 217, z: 342 });
    const roundTrip = result.transform.renderToWorld(render);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(roundTrip[axis] - local[axis]) < 1e-10);
    assert.equal(result.transform.getVisualScale(local), 2);
    assert.equal(typeof result.transform.getInfo, 'function', 'frame adapters must expose the SpatialTransform diagnostics contract');
    assert.equal(result.transform.getInfo().geometry, 'test-chart');
    assert.deepEqual(result.transform.getJacobian(local), [0, -10, 0, 10, 0, 0, 0, 0, 10]);
});


test('Plane-local preview projections clamp points beyond finite Poincare bounds without relaxing strict transforms', () => {
    const chart = new SpatialTransform({
        geometry: 'poincare', renderScale: 24,
        bounds: { minX: -10, maxX: 10, minY: -5, maxY: 5, minZ: -10, maxZ: 10, characteristicLength: 1, boundaryEpsilon: 1e-5 }
    });
    const frame = createPlaneFrameTransform(chart, {
        origin: { x: 0, y: 0, z: 0, w: 0 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ]
    }).transform;
    const outside = { x: 0, y: -8, z: 12 };
    assert.throws(() => chart.worldToRender(outside), /outside world bounds/);
    const rendered = projectPlaneLocalPosition(frame, outside);
    assert.ok([rendered.x, rendered.y, rendered.z].every(Number.isFinite));
    assert.doesNotThrow(() => chart.worldToRender(chart.constrainWorldPosition(outside, { boundaryMargin: 1e-5 })));
});

test('custom Plane geometry contexts construct and use a real SpatialTransform', async () => {
    const { PlaneObjectRenderer } = await import('../src/editor/plane-object-renderer.js');
    const fallback = {
        geometryName: 'poincare', renderScale: 24,
        worldToRender: point => point,
        renderToWorld: point => point,
        getVisualScale: () => 1,
        getJacobian: () => [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const renderer = new PlaneObjectRenderer({}, fallback);
    const context = renderer.resolveCustomTransform('custom-euclidean', 'euclidean', {
        origin: { x: 3, y: 4, z: 5, w: 6 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ]
    });
    assert.equal(context.transform.geometryName, 'euclidean');
    assert.deepEqual(context.transform.worldToRender({ x: 1, y: 2, z: 3 }), { x: 4, y: 6, z: 8 });
    assert.deepEqual(context.transform.renderToWorld({ x: 4, y: 6, z: 8 }), { x: 1, y: 2, z: 3 });
    renderer.dispose();
});

test('Plane frame transform reports singular XYZ projections and uses a deterministic fallback', () => {
    const chart = {
        geometryName: 'test-chart',
        worldToRender: point => ({ ...point }),
        renderToWorld: point => ({ ...point }),
        getJacobian: () => [1, 0, 0, 0, 1, 0, 0, 0, 1]
    };
    const frame = {
        origin: { x: 4, y: 5, z: 6, w: 7 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 0, w: 1 },
            { x: 0, y: 0, z: 1, w: 0 }
        ]
    };
    const result = createPlaneFrameTransform(chart, frame);
    assert.equal(result.supported, false);
    assert.deepEqual(result.transform.worldToRender({ x: 2, y: 3, z: 4 }), { x: 6, y: 8, z: 10 });
    assert.deepEqual(result.transform.renderToWorld({ x: 6, y: 8, z: 10 }), { x: 2, y: 3, z: 4 });
});

test('Plane background inputs apply immediately to the active editor scene with configured opacity', () => {
    class Color4Stub { constructor(r, g, b, a) { Object.assign(this, { r, g, b, a }); } clone() { return new Color4Stub(this.r, this.g, this.b, this.a); } }
    globalThis.BABYLON = {
        Color3: { FromHexString: hex => ({ r: 0x12 / 255, g: 0x34 / 255, b: 0x56 / 255 }) },
        Color4: Color4Stub
    };
    const values = new Map([
        ['#plane-background-color', { value: '#123456' }],
        ['#plane-background-opacity', { value: '0.65' }]
    ]);
    const editor = Object.create(PlaneEditor.prototype);
    editor.active = true;
    editor.panel = { querySelector: selector => values.get(selector) };
    editor.scene = { clearColor: new Color4Stub(0, 0, 0, 1) };
    editor.applyPlaneBackgroundFromInputs();
    assert.ok(editor.scene.metadata?.somniumPlaneBackground, 'live background override is recorded for per-frame scene systems');
    assert.ok(Math.abs(editor.scene.metadata.somniumPlaneBackground.r - 0x12 / 255) < 1e-10);
    assert.ok(Math.abs(editor.scene.clearColor.r - 0x12 / 255) < 1e-10);
    assert.ok(Math.abs(editor.scene.clearColor.g - 0x34 / 255) < 1e-10);
    assert.ok(Math.abs(editor.scene.clearColor.b - 0x56 / 255) < 1e-10);
    assert.equal(editor.scene.clearColor.a, 0.65);
    const applied = editor.scene.clearColor;
    editor.active = false;
    editor.applyPlaneBackgroundFromInputs();
    assert.equal(editor.scene.clearColor, applied, 'inactive Plane editor must not override the scene background');
});

test('Plane Editor definition commits edited object records without changing the Plane frame', () => {
    const original = createPlaneDefinition({
        id: 'plane-objects', displayName: 'Objects', geometry: 'euclidean',
        frame: {
            origin: { x: 0, y: 0, z: 0, w: 12 },
            axes: [{ x: 0, y: 1, z: 0, w: 0 }, { x: -1, y: 0, z: 0, w: 0 }, { x: 0, y: 0, z: 1, w: 0 }],
            normal: { x: 0, y: 0, z: 0, w: 1 }
        },
        objects: [{ id: 'old', type: 'box', position: { x: 1, y: 2, z: 3 } }]
    });
    const object = createPlaneObjectDefinition({ id: 'new', type: 'sphere', position: { x: 7, y: 8, z: 9 } });
    const updated = createPlaneEditorDefinition(original, {
        id: original.id, displayName: original.displayName, geometry: original.geometry,
        origin: { x: 0, y: 0, z: 0, w: 12 },
        dimensions: { w: 10, x: 100, y: 60, z: 100 },
        boundary: { visible: false, color: '#8aa4c8', opacity: 0.35 },
        backgroundColor: '#101827', backgroundOpacity: 1,
        objects: [object]
    });
    assert.deepEqual(updated.frame.axes, original.frame.axes);
    assert.deepEqual(updated.frame.normal, original.frame.normal);
    assert.equal(updated.container.backgroundColor, '#101827');
    assert.equal(updated.container.backgroundOpacity, 1);
    assert.deepEqual(updated.objects, [object]);
});

test('Plane editor exposes local object creation, selection, numeric transforms, and shared gizmo modes', async () => {
    const code = await source('../src/editor/plane-editor.js');
    assert.match(code, /data-add-plane-object="box"/);
    assert.match(code, /data-add-plane-object="hypercube4d"/);
    assert.match(code, /id="plane-object-select"/);
    assert.match(code, /data-object-position/);
    assert.match(code, /data-object-rotation/);
    assert.match(code, /data-object-dimension/);
    assert.match(code, /new SharedTransformTools/);
    assert.match(code, /rotationAxes: 'all'/);
    assert.match(code, /applyGizmoTransform\(state\)/);
    assert.match(code, /pointerUp\(\)/);
    assert.match(code, /id=\"plane-object-billboard\"/);
    assert.match(code, /renderRotationToLocal/);
    assert.match(code, /renderScaleToLocal/);
    assert.match(code, /state\.phase === 'end'/);
    assert.match(code, /const frameLocked = Boolean\(context\.runtimeWorld\)/);
    assert.match(code, /data-plane-origin/);
    assert.match(code, /registered Plane relocation and connected anomaly updates are a later phase/);
    assert.match(code, /rotateButton\.disabled = billboard/);
    assert.match(code, /Label rotation controls are enabled when Face camera is off/);
    assert.match(code, /id=\"plane-background-color\"/);
    assert.match(code, /applyPlaneBackgroundFromInputs/);
    assert.match(code, /id=\"plane-wheel-zoom-speed\"/);
    assert.match(code, /cycleWheelZoomMultiplier/);
});

test('Plane object renderer projects editable local geometry, tags pickable meshes, and supports procedural tesseract sections', async () => {
    const code = await source('../src/editor/plane-object-renderer.js');
    assert.match(code, /projectPlaneLocalPosition\(transform, position\)/);
    assert.match(code, /renderToLocal\(planeId, position\)/);
    const editor = await source('../src/editor/plane-editor.js');
    assert.match(editor, /this\.objectRenderer\.renderToLocal\(planeId, state\.position\)/); // gizmo callback maps render position back to Plane-local coordinates
    assert.match(code, /planeObjectId: object\.id/);
    assert.match(code, /createHypercubeSlice\(/);
    assert.match(code, /CreateLineSystem/);
    assert.match(code, /mesh\.isPickable = visible && \(mesh\.metadata/);
    assert.match(code, /surface\.isPickable = true/);
    assert.match(code, /mesh === record\.meshes\[0\] \|\| mesh === record\.meshes\[2\]/);
    assert.match(code, /surface\.refreshBoundingInfo\(\)/);
    assert.match(code, /setEditorContext\(active, planeId = null\)/);
    assert.match(code, /this\.editorActive[\s\S]*?this\.isPlaneInEditorWSlice\(record\.planeId\)/);
    assert.match(code, /return unprojectPlaneRenderPosition\(transform, position\)/);
    assert.match(code, /import \{ SpatialTransform \}/);
    assert.match(code, /new SpatialTransform\(/);
    assert.match(code, /mesh\.billboardMode = BABYLON\.Mesh\.BILLBOARDMODE_ALL/);
});

test('editor camera zoom selector and V hotkey are exposed only in the Planes workflow', async () => {
    const code = await source('../src/editor/building-editor.js');
    assert.match(code, /this\.activeEditorTab === \"planes\"[^\n]*event\.code === \"KeyV\"/);
    assert.match(code, /this\.planeEditor\?\.cycleWheelZoomMultiplier\(\)/);
    const camera = await source('../src/editor/editor-camera.js');
    assert.match(camera, /this\.baseWheelPrecision \/ multiplier/);
    assert.match(camera, /cycleWheelZoomMultiplier\(direction = 1\)/);
});

test('Demo Plane object migration is additive, one-time, and includes the room primitives, labels, and tesseract', async () => {
    assert.equal(typeof PlaneAnomalyPersistence.prototype.bootstrapDemoPlaneObjects, 'function');
    const code = await source('../src/world/persistence/plane-anomaly-persistence.js');
    assert.match(code, /geometry-demo-plane-objects-v1/);
    for (const id of ['demo-sphere', 'demo-cube', 'demo-cylinder', 'demo-torus', 'demo-title-label', 'demo-sphere-label', 'demo-cube-label', 'demo-cylinder-label', 'demo-torus-label', 'demo-hypercube4d']) {
        assert.ok(code.includes(id), `missing migrated object ${id}`);
    }
    assert.match(code, /const ids = new Set\(plane\.objects\.map/);
    assert.match(code, /plane\.objects\.push\(\.\.\.additions\)/);
});

test('Demo renders Plane records instead of recreating hard-coded room meshes, and applies tesseract records to runtime', async () => {
    const code = await source('../src/demo/geometry-demo-world.js');
    assert.match(code, /bootstrapDemoPlaneObjects\(\)/);
    assert.match(code, /applyPlaneObjectDefinitions\(planeId, objects\)/);
    assert.match(code, /usePlaneObjects: sourcePlaneObjectsReady/);
    assert.match(code, /savedPlaneDefinitions\.some\(plane => plane\.id === sourceSlice\.id\)/);
    assert.match(code, /options\.usePlaneObjects\) return \[\];/);
    assert.match(code, /else hypercubeRenderer\.objectVisible = false/);
    const scene = await source('../src/scene/create-scene.js');
    assert.match(scene, /await buildingEditor\.setGeometryDemo\(geometryDemo\)/);
    assert.match(scene, /await buildingEditor\.setAnomalyPersistence/);
    const hypercube = await source('../src/demo/hypercube-4d-renderer.js');
    assert.match(hypercube, /setObjectDefinition\(definition\)/);
    assert.match(hypercube, /this\.objectVisible = definition\.visible !== false/);
    assert.match(hypercube, /this\.objectRotationMatrix = rotation\.toRotationMatrix\(BABYLON\.Matrix\.Identity\(\)\)/);
    const planeRenderer = await source('../src/editor/plane-object-renderer.js');
    assert.doesNotMatch(hypercube + planeRenderer, /BABYLON\.Matrix\.FromQuaternion/);
    assert.equal((planeRenderer.match(/\.toRotationMatrix\(BABYLON\.Matrix\.Identity\(\)\)/g) ?? []).length, 4);
});



test('Plane selection promotes the saved definition before resolving the camera context', async () => {
    const sourceText = await source('../src/editor/plane-editor.js');
    assert.match(sourceText, /ensureRuntimePlane\?\.\(plane\)/);
    assert.match(sourceText, /focusRadius/);
});

test('new Plane drafts inherit the currently inspected universe W coordinate', async () => {
    const sourceText = await source('../src/editor/plane-editor.js');
    assert.match(sourceText, /const draftW = Number\.isFinite\(this\.currentWSlice\) \? this\.currentWSlice : 0/);
    assert.match(sourceText, /createCanonicalSliceFrame\(draftW\)/);
});

test('editor keyboard shortcuts select transform modes and Plane subtabs without stealing typing', async () => {
    const sourceText = await source('../src/editor/building-editor.js');
    assert.match(sourceText, /event\.code === "KeyG"[\s\S]*?translate/);
    assert.match(sourceText, /event\.code === "KeyR"[\s\S]*?rotate/);
    assert.match(sourceText, /event\.code === "KeyS"[\s\S]*?scale/);
    assert.match(sourceText, /event\.altKey[\s\S]*?setPlaneSubtab/);
    assert.match(sourceText, /INPUT\|TEXTAREA\|SELECT/);
});

test('additional authored hypercubes are not suppressed as duplicates of the original demo tesseract', async () => {
    const sourceText = await source('../src/editor/plane-object-renderer.js');
    assert.match(sourceText, /record\.object\.id === 'demo-hypercube4d'/);
});

test('Plane frame adapter forwards render-space chart constraints for spherical mouse picks', () => {
    let received = null;
    const chart = {
        geometryName: 'spherical',
        worldToRender: point => ({ ...point }),
        renderToWorld: point => ({ x: point.x, y: point.y, z: point.z }),
        constrainRenderPosition: (point, options) => {
            received = { point: { ...point }, options: { ...options } };
            return { x: 1, y: 2, z: 3 };
        }
    };
    const frame = createPlaneFrameTransform(chart, {
        origin: { x: 0, y: 0, z: 0, w: 0 },
        axes: [
            { x: 1, y: 0, z: 0, w: 0 },
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ]
    }).transform;
    assert.deepEqual(frame.constrainRenderPosition({ x: 10, y: 20, z: 30 }, { boundaryMargin: 1e-5 }), { x: 1, y: 2, z: 3 });
    assert.deepEqual(received, {
        point: { x: 10, y: 20, z: 30 }, options: { boundaryMargin: 1e-5 }
    });
});

test('W-slice inspector spans the universe and does not clamp to the selected Plane thickness', () => {
    const controls = new Map([
        ['[data-plane-origin="w"]', { value: '5.25' }],
        ['[data-plane-dimension="w"]', { value: '10' }],
        ['#plane-w-slice-slider', { min: '', max: '', step: '', value: '' }],
        ['#plane-w-slice-value', { min: '', max: '', step: '', value: '' }],
        ['#plane-w-slice-range', { textContent: '' }],
        ['#plane-id', { value: 'custom-plane' }],
        ['#plane-geometry', { value: 'spherical' }]
    ]);
    const events = [];
    const editor = Object.create(PlaneEditor.prototype);
    editor.active = true;
    editor.currentWSlice = 7.125;
    editor.currentPlane = null;
    editor.planes = [];
    editor.panel = { querySelector: selector => controls.get(selector) };
    editor.objectRenderer = {
        setViewerW(value, planeId) { events.push({ type: 'viewer', value, planeId }); },
        setEditorWCoordinate(value) { events.push({ type: 'global', value }); }
    };
    editor.onWViewChanged = value => events.push({ type: 'view', value });
    editor.updatePreview = () => {};

    editor.syncWSliceControls();
    assert.equal(controls.get('#plane-w-slice-slider').step, '1');
    assert.equal(controls.get('#plane-w-slice-slider').min, '-10');
    assert.equal(controls.get('#plane-w-slice-slider').max, '90');
    assert.equal(controls.get('#plane-w-slice-value').min, '-10');
    assert.equal(controls.get('#plane-w-slice-value').max, '90');
    assert.equal(controls.get('#plane-w-slice-value').step, '0.01');
    assert.equal(controls.get('#plane-w-slice-value').value, '7.125');
    assert.match(controls.get('#plane-w-slice-range').textContent, /Universe W range -10 to 90/);

    editor.setWSlice(82.375);
    assert.equal(editor.currentWSlice, 82.375, 'global slice can move well outside the selected Plane interval');
    assert.equal(events.at(-3).type, 'global');
    assert.equal(events.at(-3).value, 82.375);
    assert.equal(events.at(-2).type, 'viewer');
    assert.equal(events.at(-2).value, 77.125);
    assert.equal(events.at(-2).planeId, 'custom-plane');
    assert.equal(events.at(-1).value.coordinate, 82.375);
    assert.equal(events.at(-1).value.center, 5.25);
    assert.equal(events.at(-1).value.min, -10);
    assert.equal(events.at(-1).value.max, 90);
});
