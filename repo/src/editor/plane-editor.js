import { createPlaneDefinition, createPlaneObjectDefinition } from '../world/fields/geometry/plane-registry.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createCanonicalSliceFrame } from '../world/fields/geometry/spatial-4d.js';
import { getPlaneAmbientWBounds, getPlaneNormalOffsetAtW, getUniverseWSliceBounds, planeIntersectsWSlice } from '../world/fields/geometry/w-slice-range.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SharedTransformTools } from './shared-transform-tools.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { PlaneObjectRenderer } from './plane-object-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const AXES = ['w', 'x', 'y', 'z'];
const OBJECT_AXES = ['x', 'y', 'z'];
const OBJECT_TYPES = ['box', 'sphere', 'cylinder', 'torus', 'label', 'hypercube4d'];
const OBJECT_COLORS = { box: '#9e78e8', sphere: '#e59c42', cylinder: '#6ec58d', torus: '#55a7dc', label: '#e7edf5', hypercube4d: '#58d7f0' };

/** Plane container and Plane-local object authoring UI. */
class PlaneEditor {
    constructor(scene, spatialTransform, panel, options = {}) {
        this.scene = scene;
        this.transform = spatialTransform;
        this.activeTransform = spatialTransform;
        this.panel = panel;
        this.camera = options.camera ?? null;
        this.previousClearColor = null;
        this.onContextChanged = options.onContextChanged ?? (() => {});
        this.onWViewChanged = options.onWViewChanged ?? (() => {});
        this.currentWSlice = 0;
        this.persistence = null;
        this.geometryDemo = null;
        this.unsubscribeDemoActive = null;
        this.planes = [];
        this.currentPlane = null;
        this.objects = [];
        this.selectedId = null;
        this.selectedObjectId = null;
        this.placementArmed = false;
        this.preview = null;
        this.universeSliceGuides = new Map();
        this.active = false;
        this.objectRenderer = new PlaneObjectRenderer(scene, spatialTransform);
        this.transformTools = new SharedTransformTools(scene, {
            name: 'somnium-plane-object-transform-gizmo',
            rotationAxes: 'all',
            onChange: state => this.applyGizmoTransform(state)
        });
        this.buildInterface();
    }

    buildInterface() {
        this.panel.innerHTML = `
            <h4>PLANE EDITOR</h4>
            <p style="font-size:12px;color:#b8c8d7;line-height:1.45">Create and configure 4D Plane containers. W sets the center of the container in the fourth dimension; W thickness defines its extent. Runtime-backed Planes keep their geometry and ambient center locked until relocation can update connected anomaly endpoints together.</p>
            <button id="plane-create" type="button" style="width:100%">CREATE NEW PLANE</button>
            <label style="display:grid;gap:4px;margin-top:10px">Registered Planes
                <select id="plane-select" style="width:100%"></select>
            </label>
            <label style="display:grid;gap:4px">Mouse-wheel zoom speed
                <select id="plane-wheel-zoom-speed" style="width:100%">
                    <option value="1">1× · normal</option>
                    <option value="10">10× · fast</option>
                    <option value="100">100× · very fast</option>
                </select>
            </label>
            <small style="color:#9fb2c4">Press V to cycle 1× → 10× → 100×. Mouse wheel zooms the editor camera.</small>
            <div id="plane-form" style="display:grid;gap:9px;margin-top:12px">
                <label style="display:grid;gap:4px">Plane name <input id="plane-name" type="text" maxlength="100"></label>
                <label style="display:grid;gap:4px">Plane ID <input id="plane-id" type="text" maxlength="100" disabled></label>
                <label style="display:grid;gap:4px">Geometry
                    <select id="plane-geometry"><option value="euclidean">Euclidean</option><option value="poincare">Poincaré</option><option value="spherical">Spherical</option><option value="inverted-poincare">Inverted Poincaré</option></select>
                </label>
                <fieldset style="border:1px solid #536779;border-radius:5px;padding:9px;display:grid;gap:7px">
                    <legend>4D CONTAINER CENTER</legend>
                    <div class="somnium-plane-grid">${AXES.map(axis => `<label>${axis.toUpperCase()} <input data-plane-origin="${axis}" type="number" step="0.1"></label>`).join('')}</div>
                    <button id="plane-place-origin" type="button">PLACE CENTER WITH MOUSE</button>
                    <small id="plane-placement-status" style="color:#b8c8d7">Enter XYZ numerically or arm mouse placement and click a terrain surface. W remains independently editable.</small>
                </fieldset>
                <fieldset style="border:1px solid #536779;border-radius:5px;padding:9px;display:grid;gap:7px">
                    <legend>4D BOX DIMENSIONS</legend>
                    <div class="somnium-plane-grid">${AXES.map(axis => `<label>${axis.toUpperCase()} size <input data-plane-dimension="${axis}" type="number" min="0.1" step="0.1"></label>`).join('')}</div>
                </fieldset>
                <fieldset id="plane-w-slice-inspector" style="border:1px solid #6a8198;border-radius:5px;padding:9px;display:grid;gap:7px">
                    <legend>UNIVERSE W-SLICE INSPECTOR</legend>
                    <label style="display:grid;gap:4px">Ambient W coordinate · integer slider
                        <input id="plane-w-slice-slider" type="range" min="-5" max="5" step="1" value="0">
                    </label>
                    <label style="display:grid;gap:4px">Ambient W coordinate · decimal precision
                        <input id="plane-w-slice-value" type="number" step="0.01" value="0">
                    </label>
                    <small id="plane-w-slice-range" style="color:#9fb2c4">Browse the full universe W range. Every Plane intersecting this slice is shown; new Planes are centered at the selected W coordinate.</small>
                </fieldset>
                <fieldset style="border:1px solid #536779;border-radius:5px;padding:9px;display:grid;gap:7px">
                    <legend>APPEARANCE</legend>
                    <label style="display:flex;gap:8px;align-items:center"><input id="plane-boundary-visible" type="checkbox"> Show optional box boundary</label>
                    <label>Boundary color <input id="plane-boundary-color" type="color" value="#8aa4c8"></label>
                    <label>Boundary opacity <input id="plane-boundary-opacity" type="number" min="0" max="1" step="0.05"></label>
                    <label>Background color <input id="plane-background-color" type="color" value="#101827"></label>
                    <label>Background opacity <input id="plane-background-opacity" type="number" min="0" max="1" step="0.05"></label>
                </fieldset>
                <small style="color:#9fb2c4">The scene view switches to the runtime room at this universe W coordinate. The saved W size remains the Plane's full fourth-dimensional thickness.</small>
                <label style="display:flex;gap:8px;align-items:center"><input id="plane-preview-visible" type="checkbox" checked> Show selected Plane boundary guide</label>
                <label style="display:flex;gap:8px;align-items:center"><input id="plane-universe-guides-visible" type="checkbox" checked> Show other Planes intersecting this W slice</label>
                <fieldset id="plane-object-editor" style="border:1px solid #6a8198;border-radius:5px;padding:9px;display:grid;gap:8px">
                    <legend>PLANE OBJECTS</legend>
                    <small style="color:#b8c8d7">Objects use Plane-local XYZ coordinates. Select an object here or click it in the viewport.</small>
                    <div class="somnium-object-add-grid">
                        <button type="button" data-add-plane-object="box">+ BOX</button>
                        <button type="button" data-add-plane-object="sphere">+ SPHERE</button>
                        <button type="button" data-add-plane-object="cylinder">+ CYLINDER</button>
                        <button type="button" data-add-plane-object="torus">+ TORUS</button>
                        <button type="button" data-add-plane-object="label">+ LABEL</button>
                        <button type="button" data-add-plane-object="hypercube4d">+ 4D HYPERCUBE</button>
                    </div>
                    <label style="display:grid;gap:4px">Object selection <select id="plane-object-select" style="width:100%"></select></label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                        <button id="plane-object-duplicate" type="button">DUPLICATE</button>
                        <button id="plane-object-delete" type="button">DELETE</button>
                    </div>
                    <label>Name <input id="plane-object-name" type="text" maxlength="100"></label>
                    <label style="display:flex;align-items:center;gap:8px"><input id="plane-object-visible" type="checkbox" checked> Visible</label>
                    <div style="font-size:11px;color:#b8c8d7;font-weight:bold">LOCAL POSITION</div>
                    <div class="somnium-object-grid">${OBJECT_AXES.map(axis => `<label>${axis.toUpperCase()} <input data-object-position="${axis}" type="number" step="0.1"></label>`).join('')}</div>
                    <div style="font-size:11px;color:#b8c8d7;font-weight:bold">LOCAL ROTATION · DEGREES</div>
                    <div class="somnium-object-grid">${OBJECT_AXES.map(axis => `<label>${axis.toUpperCase()}° <input data-object-rotation="${axis}" type="number" step="1"></label>`).join('')}</div>
                    <div style="font-size:11px;color:#b8c8d7;font-weight:bold">DIMENSIONS / SCALE</div>
                    <div class="somnium-object-grid">${OBJECT_AXES.map(axis => `<label>${axis.toUpperCase()} <input data-object-dimension="${axis}" type="number" min="0.01" step="0.1"></label>`).join('')}</div>
                    <label>Material color <input id="plane-object-color" type="color" value="#9e78e8"></label>
                    <label id="plane-object-text-wrap" style="display:grid;gap:4px">Label text <input id="plane-object-text" type="text" maxlength="160"></label>
                    <label id="plane-object-width-wrap" style="display:grid;gap:4px">Label display width <input id="plane-object-width" type="number" min="0.1" step="0.5"></label>
                    <label id="plane-object-billboard-wrap" style="display:flex;align-items:center;gap:8px"><input id="plane-object-billboard" type="checkbox" checked> Face camera</label>
                    <small id="plane-object-rotation-help" style="color:#9fb2c4" hidden>Label rotation controls are enabled when Face camera is off.</small>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px">
                        <button type="button" data-plane-transform="translate">MOVE</button>
                        <button type="button" data-plane-transform="rotate">ROTATE</button>
                        <button type="button" data-plane-transform="scale">SCALE</button>
                    </div>
                    <small style="color:#9fb2c4">Gizmos manipulate the selected object in the active Plane's local 3D chart. Object changes are saved with SAVE PLANE & OBJECTS.</small>
                </fieldset>
                <button id="plane-save" type="button" style="width:100%;font-weight:bold;padding:10px">SAVE PLANE & OBJECTS <span style="font-weight:normal">(Ctrl+S)</span></button>
                <p id="plane-status" style="font-size:11px;color:#b8c8d7;margin:0" aria-live="polite"></p>
            </div>`;

        const style = document.createElement('style');
        style.textContent = `
            .somnium-plane-grid,.somnium-object-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
            .somnium-plane-grid label,.somnium-object-grid label{display:grid;gap:3px;font-size:11px;color:#c5d5e2}
            .somnium-plane-grid input,.somnium-object-grid input{box-sizing:border-box;width:100%;min-width:0}
            .somnium-object-add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
            .somnium-object-add-grid button{padding:6px 3px;font-size:10px}
            #plane-form fieldset label{display:grid;gap:4px;font-size:11px;color:#c5d5e2}
            #plane-form input,#plane-form select{box-sizing:border-box;min-width:0}
        `;
        document.head.appendChild(style);
        this.style = style;

        this.panel.querySelector('#plane-create').onclick = () => this.createDraft();
        this.panel.querySelector('#plane-select').onchange = event => this.select(event.target.value);
        this.panel.querySelector('#plane-wheel-zoom-speed').value = String(this.camera?.getWheelZoomMultiplier?.() ?? 1);
        this.panel.querySelector('#plane-wheel-zoom-speed').onchange = event => this.setWheelZoomMultiplier(Number(event.target.value));
        this.panel.querySelector('#plane-place-origin').onclick = () => this.armPlacement();
        this.panel.querySelector('#plane-save').onclick = () => this.save();
        this.panel.querySelector('#plane-preview-visible').onchange = () => this.updatePreview();
        this.panel.querySelector('#plane-universe-guides-visible').onchange = () => this.updatePreview();
        for (const input of this.panel.querySelectorAll('[data-plane-origin], [data-plane-dimension], #plane-boundary-visible, #plane-boundary-color, #plane-boundary-opacity')) {
            const apply = () => {
                if (input.matches('[data-plane-origin="w"]')) this.handleWSliceBoundsChanged({ centerChanged: true });
                else if (input.matches('[data-plane-dimension="w"]')) this.handleWSliceBoundsChanged();
                this.updatePreview();
            };
            input.addEventListener('input', apply);
            input.addEventListener('change', apply);
        }
        this.panel.querySelector('#plane-w-slice-slider').addEventListener('input', event => {
            this.setWSlice(Number(event.target.value), { fromSlider: true });
        });
        this.panel.querySelector('#plane-w-slice-value').addEventListener('input', event => {
            if (event.target.value === '') return;
            this.setWSlice(Number(event.target.value));
        });
        this.panel.querySelector('#plane-w-slice-value').addEventListener('change', event => {
            if (event.target.value === '') this.syncWSliceControls();
            else this.setWSlice(Number(event.target.value));
        });
        for (const input of this.panel.querySelectorAll('#plane-background-color, #plane-background-opacity')) {
            const apply = () => {
                this.applyPlaneBackgroundFromInputs();
                this.updatePreview();
            };
            input.addEventListener('input', apply);
            input.addEventListener('change', apply);
        }
        this.panel.querySelector('#plane-geometry').addEventListener('change', () => {
            const id = this.panel.querySelector('#plane-id').value.trim();
            const context = this.objectRenderer.resolveContext(id, this.panel.querySelector('#plane-geometry').value);
            this.activeTransform = context.transform;
            this.transformTools.setLayerMask(context.layerMask);
            this.syncCurrentPlaneObjects();
            this.attachObjectGizmo();
            this.publishWView();
            if (this.active) this.onContextChanged({ transform: context.transform, layerMask: context.layerMask, focus: this.selectedObject()?.position ?? { x: 0, y: 2, z: 0 }, planeId: id, wSlice: this.currentWSlice });
            this.updatePlaneContextStatus(context);
            this.updatePreview();
        });
        for (const button of this.panel.querySelectorAll('[data-add-plane-object]')) button.onclick = () => this.addObject(button.dataset.addPlaneObject);
        for (const button of this.panel.querySelectorAll('[data-plane-transform]')) button.onclick = () => this.transformTools.setMode(button.dataset.planeTransform);
        this.panel.querySelector('#plane-object-select').onchange = event => this.selectObject(event.target.value);
        this.panel.querySelector('#plane-object-duplicate').onclick = () => this.duplicateObject();
        this.panel.querySelector('#plane-object-delete').onclick = () => this.deleteObject();
        for (const input of this.panel.querySelectorAll('[data-object-position], [data-object-rotation], [data-object-dimension], #plane-object-name, #plane-object-visible, #plane-object-color, #plane-object-text, #plane-object-width, #plane-object-billboard')) {
            input.addEventListener('input', () => this.updateObjectFromInputs());
            input.addEventListener('change', () => this.updateObjectFromInputs());
        }
        this.setObjectControlsEnabled(false);
    }

    setPersistence(persistence) {
        this.persistence = persistence ?? null;
        return this.refresh();
    }

    setGeometryDemo(geometryDemo) {
        this.unsubscribeDemoActive?.();
        this.geometryDemo = geometryDemo ?? null;
        this.objectRenderer.setGeometryDemo(this.geometryDemo);
        this.unsubscribeDemoActive = this.geometryDemo?.onActiveChanged?.(active => this.objectRenderer.setDemoActive(active)) ?? null;
        if (this.persistence) return this.refresh();
        return Promise.resolve();
    }

    setDemoActive(active) { this.objectRenderer.setDemoActive(active); }

    async refresh() {
        if (!this.persistence) { this.setStatus('Plane storage is unavailable.'); return; }
        try {
            this.planes = await this.persistence.listPlanes();
            this.objectRenderer.syncPlanes(this.planes);
            const select = this.panel.querySelector('#plane-select');
            const previous = this.selectedId;
            select.replaceChildren();
            for (const plane of this.planes) {
                const option = document.createElement('option');
                option.value = plane.id;
                option.textContent = `${plane.displayName} (${plane.id})`;
                select.append(option);
            }
            if (previous && this.planes.some(plane => plane.id === previous)) this.selectedId = previous;
            else this.selectedId = this.planes[0]?.id ?? null;
            if (this.selectedId) { select.value = this.selectedId; await this.loadSelected(); }
            else this.createDraft();
        } catch (error) { this.setStatus(`Could not load Planes: ${error.message}`); }
    }

    createDraft() {
        this.placementArmed = false;
        this.selectedId = null;
        this.currentPlane = null;
        this.objects = [];
        this.selectedObjectId = null;
        this.panel.querySelector('#plane-select').value = '';
        const id = `plane-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`;
        this.setValue('#plane-name', 'New Plane');
        this.setValue('#plane-id', id);
        this.setValue('#plane-geometry', 'euclidean');
        this.panel.querySelector('#plane-geometry').disabled = false;
        this.panel.querySelectorAll('[data-plane-origin]').forEach(input => { input.disabled = false; });
        this.panel.querySelector('#plane-place-origin').disabled = false;
        // A new Plane is created on the currently inspected universe W slice,
        // rather than silently snapping back to the canonical W=0 layer.
        const draftW = Number.isFinite(this.currentWSlice) ? this.currentWSlice : 0;
        const frame = createCanonicalSliceFrame(draftW);
        for (const axis of ['x', 'y', 'z', 'w']) this.setValue(`[data-plane-origin="${axis}"]`, frame.origin[axis]);
        const defaults = { w: 10, x: 100, y: 60, z: 100 };
        for (const axis of AXES) this.setValue(`[data-plane-dimension="${axis}"]`, defaults[axis]);
        this.currentWSlice = frame.origin.w;
        this.syncWSliceControls();
        this.publishWView();
        this.setValue('#plane-boundary-visible', false, 'checked');
        this.setValue('#plane-boundary-color', '#8aa4c8');
        this.setValue('#plane-boundary-opacity', 0.35);
        this.setValue('#plane-background-color', '#101827');
        this.setValue('#plane-background-opacity', 1);
        this.renderObjectList();
        this.objectRenderer.syncPlane({ id, geometry: 'euclidean', objects: [] });
        this.objectRenderer.setEditorContext(this.active, id);
        const context = this.objectRenderer.resolveContext(id, 'euclidean');
        this.activeTransform = context.transform;
        this.transformTools.setLayerMask(context.layerMask);
        this.transformTools.detach();
        this.setObjectControlsEnabled(false);
        this.setStatus('Unsaved Plane draft. Configure its 4D box, add local objects, and save when ready.');
        if (this.active) this.onContextChanged({ transform: this.activeTransform, layerMask: context.layerMask, focus: { x: 0, y: 2, z: 0 }, planeId: id, wSlice: this.currentWSlice });
        this.updatePreview();
    }

    async select(id) {
        if (!id) return;
        this.selectedId = id;
        await this.loadSelected();
    }

    async loadSelected() {
        if (!this.selectedId || !this.persistence) return;
        try {
            const plane = await this.persistence.getPlane(this.selectedId);
            if (!plane) throw new Error('Plane record no longer exists.');
            this.currentPlane = plane;
            // Promote saved definitions before resolving their editor transform.
            // Otherwise an unregistered Plane falls back to the generic chart and
            // the editor camera can appear to remain in the previous Plane.
            this.geometryDemo?.ensureRuntimePlane?.(plane);
            this.objects = plane.objects.map(object => createPlaneObjectDefinition(object));
            this.selectedObjectId = this.objects.some(object => object.id === this.selectedObjectId) ? this.selectedObjectId : this.objects[0]?.id ?? null;
            this.setValue('#plane-name', plane.displayName);
            this.setValue('#plane-id', plane.id);
            this.setValue('#plane-geometry', plane.geometry);
            const origin = plane.frame?.origin ?? { x: 0, y: 0, z: 0, w: plane.w ?? 0 };
            for (const axis of AXES) this.setValue(`[data-plane-origin="${axis}"]`, origin[axis]);
            for (const axis of AXES) this.setValue(`[data-plane-dimension="${axis}"]`, plane.container.dimensions[axis]);
            this.setValue('#plane-boundary-visible', plane.container.boundary.visible, 'checked');
            this.setValue('#plane-boundary-color', plane.container.boundary.color);
            this.setValue('#plane-boundary-opacity', plane.container.boundary.opacity);
            this.setValue('#plane-background-color', plane.container.backgroundColor);
            this.setValue('#plane-background-opacity', plane.container.backgroundOpacity);
            this.currentWSlice = Number(origin.w ?? 0);
            this.syncWSliceControls();
            this.objectRenderer.syncPlane(plane);
            this.geometryDemo?.applyPlaneObjectDefinitions?.(plane.id, this.objects);
            this.applyPlaneBackgroundFromInputs();
            this.renderObjectList();
            const context = this.setPlaneContext(plane);
            this.selectObject(this.selectedObjectId, { focus: false });
            this.setStatus(`Editing ${plane.displayName}. Object positions and transforms are Plane-local; save to persist changes.`);
            this.updatePlaneContextStatus(context);
            this.updatePreview();
        } catch (error) { this.setStatus(`Could not load Plane: ${error.message}`); }
    }

    setPlaneContext(plane, notify = this.active) {
        const context = this.objectRenderer.resolveContext(plane.id, plane.geometry);
        this.activeTransform = context.transform;
        this.transformTools.setLayerMask(context.layerMask);
        const frameLocked = Boolean(context.runtimeWorld);
        this.panel.querySelector('#plane-geometry').disabled = frameLocked;
        this.panel.querySelectorAll('[data-plane-origin]').forEach(input => { input.disabled = frameLocked; });
        this.panel.querySelector('#plane-place-origin').disabled = frameLocked;
        this.objectRenderer.setEditorContext(this.active, plane.id);
        const focus = this.selectedObject()?.position ?? { x: 0, y: 2, z: 0 };
        const dimensions = plane.container?.dimensions ?? {};
        const visualScale = context.transform.getVisualScale?.(focus) ?? 1;
        const focusRadius = Math.max(12, Math.max(Number(dimensions.x ?? 100), Number(dimensions.y ?? 60), Number(dimensions.z ?? 100)) * visualScale * 0.72);
        this.syncWSliceControls();
        this.publishWView();
        if (notify) this.onContextChanged({ transform: context.transform, layerMask: context.layerMask, focus, focusRadius, planeId: plane.id, wCenter: plane.frame?.origin?.w ?? plane.w ?? 0, wThickness: Number(dimensions.w ?? 10), wSlice: this.currentWSlice });
        return context;
    }

    updatePlaneContextStatus(context) {
        if (context?.frameProjectionSupported === false) {
            this.setStatus('WARNING: This Plane has a 4D frame whose XYZ projection collapses one or more local axes. The editor is showing a fallback XYZ preview; the saved 4D frame is unchanged.');
        } else if (context?.runtimeWorld) {
            this.setStatus('Runtime Plane geometry and ambient center are locked in this phase. Create a new Plane to author a different frame; registered Plane relocation and connected anomaly updates are a later phase.');
        }
    }

    collectDefinition() {
        const number = selector => Number(this.panel.querySelector(selector).value);
        const origin = {};
        for (const axis of AXES) origin[axis] = number(`[data-plane-origin="${axis}"]`);
        const dimensions = {};
        for (const axis of AXES) dimensions[axis] = number(`[data-plane-dimension="${axis}"]`);
        const current = this.selectedId ? this.currentPlane ?? this.planes.find(plane => plane.id === this.selectedId) : null;
        return createPlaneEditorDefinition(current, {
            id: this.panel.querySelector('#plane-id').value.trim(),
            displayName: this.panel.querySelector('#plane-name').value.trim(),
            geometry: this.panel.querySelector('#plane-geometry').value,
            origin, dimensions,
            boundary: { visible: this.panel.querySelector('#plane-boundary-visible').checked, color: this.panel.querySelector('#plane-boundary-color').value, opacity: number('#plane-boundary-opacity') },
            backgroundColor: this.panel.querySelector('#plane-background-color').value,
            backgroundOpacity: number('#plane-background-opacity'),
            objects: this.objects
        });
    }

    async save() {
        if (!this.persistence) return this.setStatus('Plane storage is unavailable.');
        try {
            const definition = this.collectDefinition();
            const saved = await this.persistence.savePlane(definition);
            // Register/update the Plane before refreshing so object meshes are
            // rebuilt against its runtime transform. refresh() then creates or
            // updates all authored meshes; rebuild portal lists afterward so a
            // just-saved object is immediately visible through connected mouths.
            this.geometryDemo?.applyPlaneDefinition?.(saved);
            this.applyPlaneBackgroundFromInputs();
            this.selectedId = saved.id;
            this.currentPlane = saved;
            await this.refresh();
            this.geometryDemo?.updatePortalLists?.();
            this.setStatus(`Saved ${saved.displayName} with ${saved.objects.length} Plane-local object${saved.objects.length === 1 ? '' : 's'}.`);
        } catch (error) { this.setStatus(`Plane save failed: ${error.message}`); }
    }

    selectedObject() { return this.objects.find(object => object.id === this.selectedObjectId) ?? null; }

    addObject(type) {
        if (!OBJECT_TYPES.includes(type)) return;
        if (!this.panel.querySelector('#plane-id').value.trim()) return;
        const id = `object-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`;
        const count = this.objects.length;
        const object = createPlaneObjectDefinition({
            id, type, name: `${type === 'hypercube4d' ? '4D Hypercube' : type[0].toUpperCase() + type.slice(1)} ${count + 1}`,
            position: { x: (count % 4) * 3 - 4.5, y: type === 'label' ? 4 : 1, z: Math.floor(count / 4) * 3 },
            rotation: { x: 0, y: 0, z: 0 }, dimensions: type === 'hypercube4d' ? { x: 8.4, y: 8.4, z: 8.4 } : type === 'label' ? { x: 1, y: 1, z: 1 } : { x: 2, y: 2, z: 2 },
            visible: true, material: { color: OBJECT_COLORS[type] },
            text: type === 'label' ? 'NEW LABEL' : undefined,
            parameters: type === 'label' ? { width: 8, billboard: true } : type === 'hypercube4d' ? { halfExtent: 4.2, initialAngles: { xw: 0.42, yw: 0.36, zw: 0.32 }, angularSpeeds: { xw: 0.68, yw: 0.49, zw: 0.33 } } : {}
        });
        this.objects.push(object);
        this.syncCurrentPlaneObjects();
        this.renderObjectList();
        this.selectObject(object.id);
        this.setStatus(`Added ${object.name}. Save Plane & Objects to persist it.`);
    }

    duplicateObject() {
        const source = this.selectedObject();
        if (!source) return;
        const copy = createPlaneObjectDefinition({ ...source, id: `object-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`, name: `${source.name} Copy`, position: { ...source.position, x: source.position.x + Math.max(1, source.dimensions.x) } });
        this.objects.push(copy);
        this.syncCurrentPlaneObjects();
        this.renderObjectList();
        this.selectObject(copy.id);
        this.setStatus(`Duplicated ${source.name}. Save Plane & Objects to persist it.`);
    }

    deleteObject() {
        const object = this.selectedObject();
        if (!object) return;
        this.objects = this.objects.filter(entry => entry.id !== object.id);
        this.selectedObjectId = this.objects[0]?.id ?? null;
        this.syncCurrentPlaneObjects();
        this.renderObjectList();
        this.selectObject(this.selectedObjectId);
        this.setStatus(`Deleted ${object.name} from this unsaved Plane draft.`);
    }

    selectObject(id, options = {}) {
        this.selectedObjectId = id || null;
        this.objectRenderer.setSelected(this.selectedId ?? this.panel.querySelector('#plane-id').value, this.selectedObjectId);
        const object = this.selectedObject();
        this.setObjectControlsEnabled(Boolean(object));
        this.renderObjectList();
        if (!object) { this.transformTools.detach(); return; }
        this.syncObjectInputs();
        if (!this.active) { this.transformTools.detach(); return; }
        const pose = this.objectRenderer.getRenderPose(this.panel.querySelector('#plane-id').value, object);
        this.transformTools.attach(pose.position, pose.rotation, pose.scale);
        if (options.focus !== false) this.onContextChanged({ transform: this.activeTransform, layerMask: this.objectRenderer.resolveContext(this.panel.querySelector('#plane-id').value).layerMask, focus: object.position, planeId: this.selectedId });
    }

    renderObjectList() {
        const select = this.panel.querySelector('#plane-object-select');
        if (!select) return;
        select.replaceChildren();
        for (const object of this.objects) {
            const option = document.createElement('option');
            option.value = object.id;
            option.textContent = `${object.name} · ${object.type}`;
            select.append(option);
        }
        select.value = this.selectedObjectId ?? '';
    }

    setObjectControlsEnabled(enabled) {
        for (const selector of ['#plane-object-name', '#plane-object-visible', '#plane-object-select', '#plane-object-duplicate', '#plane-object-delete', '#plane-object-color', '#plane-object-text', '#plane-object-width', '#plane-object-billboard', '[data-object-position]', '[data-object-rotation]', '[data-object-dimension]', '[data-plane-transform]']) {
            this.panel.querySelectorAll(selector).forEach(element => { element.disabled = !enabled; });
        }
    }

    syncObjectInputs() {
        const object = this.selectedObject();
        if (!object) return;
        this.setValue('#plane-object-name', object.name);
        this.setValue('#plane-object-visible', object.visible !== false, 'checked');
        this.setValue('#plane-object-color', object.material?.color ?? OBJECT_COLORS[object.type]);
        this.setValue('#plane-object-text', object.text ?? '');
        this.setValue('#plane-object-width', object.parameters?.width ?? 8);
        this.setValue('#plane-object-billboard', object.parameters?.billboard !== false, 'checked');
        for (const axis of OBJECT_AXES) {
            this.setValue(`[data-object-position="${axis}"]`, object.position[axis]);
            this.setValue(`[data-object-rotation="${axis}"]`, object.rotation[axis]);
            this.setValue(`[data-object-dimension="${axis}"]`, object.dimensions[axis]);
        }
        const label = object.type === 'label';
        this.panel.querySelector('#plane-object-text-wrap').hidden = !label;
        this.panel.querySelector('#plane-object-width-wrap').hidden = !label;
        this.panel.querySelector('#plane-object-billboard-wrap').hidden = !label;
        const billboard = label && object.parameters?.billboard !== false;
        this.panel.querySelector('#plane-object-rotation-help').hidden = !billboard;
        for (const input of this.panel.querySelectorAll('[data-object-rotation]')) input.disabled = billboard;
        const rotateButton = this.panel.querySelector('[data-plane-transform="rotate"]');
        rotateButton.disabled = billboard;
        rotateButton.title = billboard ? 'Turn off Face camera to rotate this label.' : 'Rotate the selected Plane object.';
    }

    updateObjectFromInputs() {
        const object = this.selectedObject();
        if (!object) return;
        const number = selector => Number(this.panel.querySelector(selector).value);
        try {
            const next = createPlaneObjectDefinition({
                ...object,
                name: this.panel.querySelector('#plane-object-name').value.trim() || object.name,
                visible: this.panel.querySelector('#plane-object-visible').checked,
                position: Object.fromEntries(OBJECT_AXES.map(axis => [axis, number(`[data-object-position="${axis}"]`)])),
                rotation: Object.fromEntries(OBJECT_AXES.map(axis => [axis, number(`[data-object-rotation="${axis}"]`)])),
                dimensions: Object.fromEntries(OBJECT_AXES.map(axis => [axis, number(`[data-object-dimension="${axis}"]`)])),
                material: { ...object.material, color: this.panel.querySelector('#plane-object-color').value },
                text: object.type === 'label' ? this.panel.querySelector('#plane-object-text').value : object.text,
                parameters: object.type === 'label' ? { ...object.parameters, width: number('#plane-object-width'), billboard: this.panel.querySelector('#plane-object-billboard').checked } : object.parameters
            });
            this.replaceObject(next);
            this.syncObjectInputs();
            this.attachObjectGizmo();
            this.setStatus(`Updated ${next.name}. Save Plane & Objects to persist it.`);
        } catch (error) { this.setStatus(`Object settings are invalid: ${error.message}`); }
    }

    replaceObject(next) {
        this.objects = this.objects.map(object => object.id === next.id ? next : object);
        this.syncCurrentPlaneObjects();
    }

    syncCurrentPlaneObjects() {
        const id = this.panel.querySelector('#plane-id').value.trim();
        if (!id) return;
        let plane;
        try {
            plane = this.collectDefinition();
        } catch (error) {
            this.setStatus(`Object edit is waiting for valid Plane settings: ${error.message}`);
            return;
        }
        this.currentPlane = plane;
        this.objectRenderer.syncPlane(plane);
        this.objectRenderer.setSelected(id, this.selectedObjectId);
        this.geometryDemo?.applyPlaneObjectDefinitions?.(id, this.objects);
        this.updatePreview();
    }

    attachObjectGizmo() {
        const object = this.selectedObject();
        if (!object) { this.transformTools.detach(); return; }
        const id = this.panel.querySelector('#plane-id').value.trim();
        if (!this.active) { this.transformTools.detach(); return; }
        const pose = this.objectRenderer.getRenderPose(id, object);
        this.transformTools.attach(pose.position, pose.rotation, pose.scale);
    }

    applyGizmoTransform(state) {
        const object = this.selectedObject();
        if (!object || !state) return;
        try {
            const planeId = this.panel.querySelector('#plane-id').value.trim();
            const position = this.objectRenderer.renderToLocal(planeId, state.position);
            const patch = { ...object, position: { x: position.x, y: position.y, z: position.z } };
            if (state.mode === 'rotate') {
                const localRotation = this.objectRenderer.renderRotationToLocal(planeId, object, state.rotation);
                const euler = localRotation.toEulerAngles();
                patch.rotation = { x: euler.x * 180 / Math.PI, y: euler.y * 180 / Math.PI, z: euler.z * 180 / Math.PI };
            }
            if (state.mode === 'scale') patch.dimensions = this.objectRenderer.renderScaleToLocal(planeId, object, state.scale);
            const next = createPlaneObjectDefinition(patch);
            this.replaceObject(next);
            this.syncObjectInputs();
            if (state.phase === 'end') this.attachObjectGizmo();
        } catch (error) { this.setStatus(`Transform update failed: ${error.message}`); }
    }

    pointerUp() {
        if (!this.active || this.placementArmed) return;
        const planeId = this.panel.querySelector('#plane-id').value.trim();
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, mesh => mesh?.isPickable && mesh.metadata?.planeObject === true && mesh.metadata?.planeId === planeId);
        if (pick?.hit && pick.pickedMesh?.metadata?.planeObjectId) this.selectObject(pick.pickedMesh.metadata.planeObjectId, { focus: false });
    }

    activate() {
        if (!this.active) {
            this.previousClearColor = cloneColor4(this.scene.clearColor);
            this.previousBackgroundOverride = this.scene.metadata?.somniumPlaneBackground ?? null;
        }
        this.active = true;
        this.objectRenderer.setDemoActive(false);
        if (this.currentPlane) this.setPlaneContext(this.currentPlane);
        else {
            this.syncWSliceControls();
            this.publishWView();
            this.objectRenderer.setEditorContext(true, this.panel.querySelector('#plane-id').value.trim());
            this.transformTools.setLayerMask(0x0FFFFFFF);
        }
        this.applyPlaneBackgroundFromInputs();
        if (this.selectedObject()) this.attachObjectGizmo();
    }

    deactivate() {
        this.active = false;
        this.placementArmed = false;
        this.onWViewChanged?.(null);
        this.objectRenderer.setEditorWCoordinate?.(null);
        this.objectRenderer.setViewerW?.(null, this.selectedId);
        this.objectRenderer.setEditorContext(false, null);
        this.transformTools.detach();
        this.transformTools.setLayerMask(0x0FFFFFFF);
        this.disposePreview();
        this.disposeUniverseSliceGuides();
        // Returning to gameplay should reveal the saved appearance of the
        // runtime Plane that was active before editing. If a different Plane
        // was being authored, restore the exact pre-editor scene background.
        const runtimePlaneId = this.geometryDemo?.currentSliceId ?? null;
        if (runtimePlaneId && this.currentPlane?.id === runtimePlaneId) {
            this.geometryDemo?.applyCurrentPlaneBackground?.();
        } else {
            if (this.scene.metadata) {
                if (this.previousBackgroundOverride) this.scene.metadata.somniumPlaneBackground = this.previousBackgroundOverride;
                else delete this.scene.metadata.somniumPlaneBackground;
            }
            if (this.previousClearColor) this.scene.clearColor = cloneColor4(this.previousClearColor);
        }
        this.previousClearColor = null;
        this.previousBackgroundOverride = null;
    }

    getWSliceBounds() {
        // The selected Plane's physical W extent is useful for status/readout,
        // but it must not constrain the universe-wide inspection slider.
        const base = this.currentPlane ?? {};
        const center = Number(this.panel.querySelector('[data-plane-origin="w"]')?.value ?? base.frame?.origin?.w ?? base.w ?? 0);
        const thickness = Number(this.panel.querySelector('[data-plane-dimension="w"]')?.value ?? base.container?.dimensions?.w ?? 10);
        const definition = {
            ...base,
            frame: {
                ...(base.frame ?? {}),
                origin: { ...(base.frame?.origin ?? {}), w: Number.isFinite(center) ? center : 0 },
                normal: base.frame?.normal ?? { x: 0, y: 0, z: 0, w: 1 }
            },
            container: {
                ...(base.container ?? {}),
                dimensions: { ...(base.container?.dimensions ?? {}), w: Number.isFinite(thickness) ? thickness : 10 }
            }
        };
        const bounds = getPlaneAmbientWBounds(definition);
        return { center: bounds.center, min: bounds.min, max: bounds.max };
    }

    getUniverseWSliceBounds() {
        const definitions = [...(this.planes ?? [])];
        let draft = this.currentPlane;
        try { draft = this.collectDefinition(); } catch { /* keep the last valid definition while fields are edited */ }
        if (draft?.id) {
            const index = definitions.findIndex(plane => plane.id === draft.id);
            if (index >= 0) definitions[index] = draft;
            else definitions.push(draft);
        }
        const runtimeBounds = this.geometryDemo?.getUniverseWSliceBounds?.(definitions);
        return runtimeBounds ?? getUniverseWSliceBounds(definitions, this.geometryDemo?.sliceWorlds ?? null);
    }

    syncWSliceControls() {
        const slider = this.panel.querySelector('#plane-w-slice-slider');
        const value = this.panel.querySelector('#plane-w-slice-value');
        const range = this.panel.querySelector('#plane-w-slice-range');
        if (!slider || !value) return;
        const universe = this.getUniverseWSliceBounds();
        const selected = this.getWSliceBounds();
        this.currentWSlice = Math.max(universe.min, Math.min(universe.max,
            Number.isFinite(this.currentWSlice) ? this.currentWSlice : selected.center));
        slider.min = String(universe.min);
        slider.max = String(universe.max);
        slider.step = '1';
        slider.value = String(Math.max(universe.min, Math.min(universe.max, Math.round(this.currentWSlice))));
        value.min = String(universe.min);
        value.max = String(universe.max);
        value.step = '0.01';
        value.value = String(Number(this.currentWSlice.toFixed(4)));
        if (range) range.textContent = `Universe W range ${universe.min} to ${universe.max} · selected Plane ${selected.min.toFixed(2)} to ${selected.max.toFixed(2)} (center ${selected.center.toFixed(2)}, thickness ${(selected.max - selected.min).toFixed(2)})`;
    }

    handleWSliceBoundsChanged(options = {}) {
        const selected = this.getWSliceBounds();
        if (options.centerChanged) this.currentWSlice = selected.center;
        const universe = this.getUniverseWSliceBounds();
        this.currentWSlice = Math.max(universe.min, Math.min(universe.max, this.currentWSlice));
        this.syncWSliceControls();
        this.publishWView();
    }

    setWSlice(value, options = {}) {
        if (!Number.isFinite(value)) return this.currentWSlice;
        const universe = this.getUniverseWSliceBounds();
        this.currentWSlice = Math.max(universe.min, Math.min(universe.max, value));
        this.syncWSliceControls();
        if (options.fromSlider && Math.abs(this.currentWSlice - Math.round(this.currentWSlice)) < 1e-7) {
            const input = this.panel.querySelector('#plane-w-slice-value');
            if (input) input.value = String(this.currentWSlice);
        }
        this.publishWView();
        this.updatePreview();
        return this.currentWSlice;
    }

    publishWView() {
        const selected = this.getWSliceBounds();
        const universe = this.getUniverseWSliceBounds();
        const planeId = this.selectedId ?? this.panel.querySelector('#plane-id')?.value ?? null;
        const offset = getPlaneNormalOffsetAtW(this.currentPlane ?? {
            frame: { origin: { w: selected.center }, normal: { w: 1 } }
        }, this.currentWSlice);
        this.objectRenderer.setEditorWCoordinate?.(this.active ? this.currentWSlice : null);
        this.objectRenderer.setViewerW?.(this.active ? offset : null, planeId);
        this.onWViewChanged?.(this.active ? {
            coordinate: this.currentWSlice, center: selected.center, offset,
            min: universe.min, max: universe.max,
            planeMin: selected.min, planeMax: selected.max,
            planeId, geometry: this.panel.querySelector('#plane-geometry')?.value ?? 'euclidean'
        } : null);
    }

    updateUniverseSliceGuides() {
        this.disposeUniverseSliceGuides();
        if (!this.active || !this.panel.querySelector('#plane-universe-guides-visible')?.checked) return;
        const currentId = this.panel.querySelector('#plane-id')?.value?.trim();
        const candidates = [...(this.planes ?? [])];
        for (const plane of this.geometryDemo?.getPlaneDefinitions?.() ?? []) {
            if (!candidates.some(candidate => candidate.id === plane.id)) candidates.push(plane);
        }
        const halfFor = plane => {
            const dimensions = plane.container?.dimensions ?? {};
            return { x: Number(dimensions.x ?? 100) / 2, y: Number(dimensions.y ?? 60) / 2, z: Number(dimensions.z ?? 100) / 2 };
        };
        for (const plane of candidates) {
            if (!plane?.id || plane.id === currentId || !Number.isFinite(this.currentWSlice)) continue;
            if (this.currentPlane?.id === plane.id) continue;
            if (this.currentWSlice < getPlaneAmbientWBounds(plane).min - 1e-8 || this.currentWSlice > getPlaneAmbientWBounds(plane).max + 1e-8) continue;
            const half = halfFor(plane);
            const vertices = [];
            try {
                for (let bits = 0; bits < 8; bits++) {
                    const local = { x: bits & 1 ? half.x : -half.x, y: bits & 2 ? half.y : -half.y, z: bits & 4 ? half.z : -half.z };
                    const rendered = this.objectRenderer.localToRender(plane.id, local);
                    vertices.push(new BABYLON.Vector3(rendered.x, rendered.y, rendered.z));
                }
                const lines = [];
                for (let i = 0; i < 8; i++) for (let axis = 0; axis < 3; axis++) {
                    const j = i ^ (1 << axis);
                    if (i < j) lines.push([vertices[i], vertices[j]]);
                }
                const guide = BABYLON.MeshBuilder.CreateLineSystem(`plane-editor-w-slice-${plane.id}`, { lines }, this.scene);
                guide.color = BABYLON.Color3.FromHexString(plane.container?.boundary?.color ?? '#6686a5');
                guide.alpha = Math.max(0.25, Number(plane.container?.boundary?.opacity ?? 0.35));
                guide.isPickable = false;
                guide.renderingGroupId = 3;
                guide.layerMask = 0x80000000;
                guide.metadata = { planeWSliceGuide: true, planeId: plane.id, wCoordinate: this.currentWSlice };
                this.universeSliceGuides.set(plane.id, guide);
            } catch (error) {
                console.warn(`[PlaneEditor] Could not draw W-slice guide for ${plane.id}:`, error);
            }
        }
    }

    disposeUniverseSliceGuides() {
        for (const guide of this.universeSliceGuides?.values?.() ?? []) guide.dispose();
        this.universeSliceGuides?.clear?.();
    }

    setWheelZoomMultiplier(multiplier) {
        const applied = this.camera?.setWheelZoomMultiplier?.(multiplier) ?? multiplier;
        const select = this.panel.querySelector('#plane-wheel-zoom-speed');
        if (select) select.value = String(applied);
        this.setStatus(`Mouse-wheel zoom speed: ${applied}×.`);
        return applied;
    }

    cycleWheelZoomMultiplier() {
        const applied = this.camera?.cycleWheelZoomMultiplier?.() ?? 1;
        const select = this.panel.querySelector('#plane-wheel-zoom-speed');
        if (select) select.value = String(applied);
        this.setStatus(`Mouse-wheel zoom speed: ${applied}×.`);
        return applied;
    }

    applyPlaneBackgroundFromInputs() {
        if (!this.active) return;
        const color = this.panel.querySelector('#plane-background-color')?.value ?? '#101827';
        const opacity = Number(this.panel.querySelector('#plane-background-opacity')?.value ?? 1);
        const rgb = BABYLON.Color3.FromHexString(color);
        const background = new BABYLON.Color4(rgb.r, rgb.g, rgb.b, Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1)));
        this.scene.metadata ??= {};
        this.scene.metadata.somniumPlaneBackground = background.clone();
        this.scene.clearColor = background;
    }

    armPlacement() {
        this.placementArmed = true;
        this.setValue('#plane-placement-status', 'PLACEMENT ARMED · Click a terrain point to set XYZ. The current W coordinate is preserved.', 'textContent');
        this.setStatus('Plane center placement armed. Click once in the viewport.');
    }

    placeAt(point) {
        const origin = { x: point.x, y: point.y, z: point.z, w: Number(this.panel.querySelector('[data-plane-origin="w"]').value) };
        for (const axis of ['x', 'y', 'z']) this.setValue(`[data-plane-origin="${axis}"]`, origin[axis]);
        this.placementArmed = false;
        this.setValue('#plane-placement-status', `Center set to (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)}) with W=${origin.w}.`, 'textContent');
        this.updatePreview();
    }

    updatePreview() {
        this.disposePreview();
        this.disposeUniverseSliceGuides();
        // Keep presentation changes live even if a temporarily incomplete
        // geometry field prevents reconstruction of the container preview.
        this.applyPlaneBackgroundFromInputs();
        let definition;
        try { definition = this.collectDefinition(); } catch { return; }
        if (!this.panel.querySelector('#plane-preview-visible')?.checked) { this.updateUniverseSliceGuides(); return; }
        this.objectRenderer.setPlaneDefinition(definition);
        if (!planeIntersectsWSlice(definition, this.currentWSlice)) {
            this.updateUniverseSliceGuides();
            return;
        }
        const half = { x: definition.container.dimensions.x / 2, y: definition.container.dimensions.y / 2, z: definition.container.dimensions.z / 2 };
        const vertices = [];
        for (let bits = 0; bits < 8; bits++) {
            const local = {
                x: (bits & 1 ? 1 : -1) * half.x,
                y: (bits & 2 ? 1 : -1) * half.y,
                z: (bits & 4 ? 1 : -1) * half.z
            };
            const rendered = this.objectRenderer.localToRender(definition.id, local);
            vertices.push(new BABYLON.Vector3(rendered.x, rendered.y, rendered.z));
        }
        const lines = [];
        for (let i = 0; i < 8; i++) for (let axis = 0; axis < 3; axis++) { const j = i ^ (1 << axis); if (i < j) lines.push([vertices[i], vertices[j]]); }
        this.preview = BABYLON.MeshBuilder.CreateLineSystem('plane-editor-container-preview', { lines }, this.scene);
        this.preview.color = BABYLON.Color3.FromHexString(definition.container.boundary.color);
        this.preview.alpha = Math.max(0.45, definition.container.boundary.opacity);
        this.preview.isPickable = false;
        this.preview.renderingGroupId = 3;
        const context = this.objectRenderer.resolveContext(definition.id, definition.geometry);
        this.preview.layerMask = context.layerMask;
        this.updateUniverseSliceGuides();
    }

    disposePreview() { this.preview?.dispose(); this.preview = null; }
    setValue(selector, value, property = 'value') { const element = this.panel.querySelector(selector); if (element) element[property] = value; }
    setStatus(message) { const status = this.panel.querySelector('#plane-status'); if (status) status.textContent = message; }

    dispose() {
        this.deactivate();
        this.unsubscribeDemoActive?.();
        this.objectRenderer.dispose();
        this.transformTools.dispose();
        this.style?.remove();
    }
}

function cloneColor4(color) {
    if (!color) return null;
    if (typeof color.clone === 'function') return color.clone();
    return new BABYLON.Color4(color.r ?? 0, color.g ?? 0, color.b ?? 0, color.a ?? 1);
}

function createPlaneEditorDefinition(current, values) {
    const origin = values.origin;
    const frame = current?.frame ? JSON.parse(JSON.stringify(current.frame)) : createCanonicalSliceFrame(origin.w);
    frame.origin = { ...frame.origin, ...origin };
    return createPlaneDefinition({
        ...(current ?? {}), schemaVersion: 2,
        id: values.id, displayName: values.displayName, geometry: values.geometry, w: origin.w, frame,
        container: {
            type: 'box', dimensions: values.dimensions, boundary: values.boundary,
            backgroundColor: values.backgroundColor, backgroundOpacity: values.backgroundOpacity
        },
        objects: values.objects ?? current?.objects ?? [],
        source: current?.source ?? 'user'
    });
}

export { PlaneEditor, createPlaneEditorDefinition };
