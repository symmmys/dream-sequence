import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editorSource = await readFile(new URL('../src/editor/building-editor.js', import.meta.url), 'utf8');
const sceneSource = await readFile(new URL('../src/scene/create-scene.js', import.meta.url), 'utf8');

test('Level Builder exposes Planes and Object Editor at top level, with Plane Editor and Anomalies subtabs', () => {
    assert.match(editorSource, /data-editor-tab="planes"[^>]*Planes \(1\)/);
    assert.match(editorSource, /data-editor-tab="object-editor"[^>]*Object Editor \(2\)/);
    assert.doesNotMatch(editorSource, /data-editor-tab="buildings"|data-editor-tab="anomalies"/);
    assert.match(editorSource, /data-editor-panel="object-editor"/);
    assert.match(editorSource, /data-editor-panel="planes"/);
    assert.match(editorSource, /data-plane-subpanel="editor"/);
    assert.match(editorSource, /data-plane-subpanel="anomalies"/);
    assert.match(editorSource, /configurePlaneSubtabs\(\)/);
    assert.match(editorSource, /setPlaneSubtab\(tab\)/);
    assert.match(editorSource, /setEditorTab\(tab\)/);
});

test('Object Editor preserves the floor-plan-to-building workflow and placement controls', () => {
    const start = editorSource.indexOf('<section data-editor-panel="object-editor"');
    const end = editorSource.indexOf('</section>', start);
    const panel = editorSource.slice(start, end);
    for (const id of ['floor-image', 'build-floor', 'position-x', 'building-grid', 'building-close']) {
        assert.ok(panel.includes(`id="${id}"`), `missing preserved building control ${id}`);
    }
});

test('Anomalies panel exposes persistent CRUD and enabled-state controls', () => {
    for (const id of ['anomaly-create', 'anomaly-name', 'anomaly-enabled', 'anomaly-duplicate', 'anomaly-delete']) {
        assert.ok(editorSource.includes(`id="${id}"`), `missing anomaly control ${id}`);
    }
    for (const method of ['refreshAnomalyList', 'createAnomalyRecord', 'duplicateSelectedAnomaly', 'deleteSelectedAnomaly', 'updateSelectedAnomaly']) {
        assert.match(editorSource, new RegExp(`${method}\\(`));
    }
});

test('scene injects the separate Plane/anomaly persistence service into the editor', () => {
    assert.match(sceneSource, /buildingEditor\.setAnomalyPersistence\(/);
    assert.match(sceneSource, /geometryDemo\.planeAnomalyPersistence/);
});

test('Anomaly selection populates Plane controls from persisted and live Plane registries', () => {
    assert.match(editorSource, /this\.populateEndpointControls\(record\)\.then/);
    assert.match(editorSource, /this\.geometryDemo\?\.getPlaneDefinitions\?\.\(\)/);
    assert.match(editorSource, /this\.anomalyPersistence\.savePlane\(plane\)/);
});

test('saved anomaly edits are applied to the live runtime topology', () => {
    assert.match(editorSource, /this\.geometryDemo\?\.applyAnomalyDefinition\?\.\(saved\)/);
    assert.match(editorSource, /this\.geometryDemo\?\.removeRuntimeAnomaly\?\.\(id\)/);
});


test('Anomaly editor exposes an explicit save/place action and Ctrl+Enter shortcut', () => {
    assert.match(editorSource, /id="anomaly-save-place"/);
    assert.match(editorSource, /Ctrl\+Enter/);
    assert.match(editorSource, /event\.code !== "Enter"/);
    assert.match(editorSource, /async commitSelectedAnomaly\(/);
    assert.match(editorSource, /placementStatus !== "placed"/);
});

test('Anomaly editor exposes independently persisted aperture and W-freedom radii', () => {
    assert.match(editorSource, /id="anomaly-aperture-radius"/);
    assert.match(editorSource, /id="anomaly-w-freedom-radius"/);
    assert.match(editorSource, /runtime\.optics = \{ \.\.\.\(runtime\.optics \?\? \{\}\), apertureRadius \}/);
    assert.match(editorSource, /runtime\.influence = \{ \.\.\.\(runtime\.influence \?\? \{\}\), maxWReach: wFreedomRadius \}/);
});

test('Planes and Object Editor tabs advertise and implement 1/2 keyboard navigation', () => {
    assert.match(editorSource, /data-editor-tab="planes"[^>]*Planes \(1\)/);
    assert.match(editorSource, /data-editor-tab="object-editor"[^>]*Object Editor \(2\)/);
    assert.match(editorSource, /event\.code === "Digit1" \|\| event\.code === "Numpad1"/);
    assert.match(editorSource, /event\.code === "Digit2" \|\| event\.code === "Numpad2"/);
    assert.match(editorSource, /this\.setEditorTab\("planes"\)/);
    assert.match(editorSource, /this\.setEditorTab\("object-editor"\)/);
});

test('Build launcher matches the main menu button treatment and advertises B', () => {
    assert.match(editorSource, /this\.launcher\.textContent = "BUILD \(B\)"/);
    assert.match(editorSource, /somnium-build-launcher/);
    assert.match(editorSource, /background:#172b3c/);
    assert.match(editorSource, /background:#294a63/);
});

test('dynamic saved anomalies are loaded into the live runtime after network construction', async () => {
    const runtimeSource = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.match(runtimeSource, /const savedDefinitions = await planeAnomalyPersistence\.listAnomalies\(\)/);
    assert.match(runtimeSource, /world\.applyAnomalyDefinition\(definition\)/);
    assert.match(runtimeSource, /createRuntimePortalPair\(runtime\)/);
    assert.match(runtimeSource, /this\.traversalController\.addController\(controller\)/);
});


test('Anomaly submenu uses the shared scale gizmo to edit aperture radius', () => {
    assert.match(editorSource, /somnium-anomaly-aperture-gizmo/);
    assert.match(editorSource, /applyAnomalyGizmoTransform\(state\)/);
    assert.match(editorSource, /anomalyGizmoBaseRenderScale/);
    assert.match(editorSource, /this\.updateSelectedAnomalyRadii\(\)/);
    assert.match(editorSource, /this\.anomalyTransformTools\.attach\(/);
    assert.match(editorSource, /data-place-mouth="source"/);
    assert.match(editorSource, /data-place-mouth="destination"/);
});

test('Anomaly placement pointer workflow is routed through the nested Plane submenu', () => {
    assert.match(editorSource, /this\.activeEditorTab === "planes" && this\.activePlaneSubtab === "anomalies" && this\.anomalyPlacementArmed/);
    assert.match(editorSource, /activateAnomalyEditor\(\)/);
    assert.match(editorSource, /deactivateAnomalyEditor\(\)/);
});

test('Plane object color updates both diffuse and emissive channels, including the 4D demo renderer', async () => {
    const planeRenderer = await readFile(new URL('../src/editor/plane-object-renderer.js', import.meta.url), 'utf8');
    const hypercubeRenderer = await readFile(new URL('../src/demo/hypercube-4d-renderer.js', import.meta.url), 'utf8');
    assert.match(planeRenderer, /record\.material\.diffuseColor = BABYLON\.Color3\.FromHexString\(color\)/);
    assert.match(planeRenderer, /record\.material\.emissiveColor = record\.material\.diffuseColor\.scale/);
    assert.match(planeRenderer, /edges\.color = BABYLON\.Color3\.FromHexString\(object\.material\?\.color/);
    assert.match(hypercubeRenderer, /this\.edgeMaterial\.emissiveColor = new BABYLON\.Color3/);
});

test('Plane background override survives the CelestialSystem per-frame sky update', async () => {
    const planeEditor = await readFile(new URL('../src/editor/plane-editor.js', import.meta.url), 'utf8');
    const celestial = await readFile(new URL('../src/environment/celestial-system.js', import.meta.url), 'utf8');
    assert.match(planeEditor, /somniumPlaneBackground = background\.clone\(\)/);
    assert.match(planeEditor, /applyPlaneBackgroundFromInputs\(\);\s*let definition/);
    assert.match(planeEditor, /geometryDemo\?\.applyPlaneDefinition\?\.\(saved\)/);
    const runtime = await readFile(new URL('../src/demo/geometry-demo-world.js', import.meta.url), 'utf8');
    assert.match(runtime, /applyPlaneBackground\(planeId = this\.currentSliceId\)/);
    assert.match(runtime, /this\.applyPlaneBackground\(sliceId\)/);
    assert.match(celestial, /const planeBackground = this\.scene\.metadata\?\.somniumPlaneBackground/);
});


test('Plane save is available through Ctrl+S, including while a Plane form field is focused', async () => {
    assert.match(editorSource, /event\.code === "KeyS" && this\.activeEditorTab === "planes" && this\.activePlaneSubtab === "editor"/);
    assert.match(editorSource, /this\.planeEditor\?\.save\(\)/);
    const planeEditor = await readFile(new URL('../src/editor/plane-editor.js', import.meta.url), 'utf8');
    assert.match(planeEditor, /SAVE PLANE & OBJECTS <span[^>]*>\(Ctrl\+S\)<\/span>/);
});
