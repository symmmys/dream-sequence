
import { EditorCamera } from "./editor-camera.js";
import { SharedTransformTools } from "./shared-transform-tools.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { PlaneEditor } from "./plane-editor.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { BuildingPlacement } from "./building-placement.js";
import { FloorPlanReference } from "./floor-plan-reference.js";
import { FloorPlanBuilder } from "./floor-plan-builder.js";
import {
    FloorPlanHeightControl
} from "./floor-plan-height-control.js";
import {
    BuildingPreviewRenderer
} from "./building-preview-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import {
    quaternionFromEulerDegrees, eulerDegreesFromQuaternion,
    markAnomalyEndpointPlaced, alignAnomalyEndpoints, updateAnomalyConnection
} from "./anomaly-placement.js";

class BuildingEditor {
    constructor(scene, buildingSystem, spatialTransform) {
        this.scene = scene;
        this.system = buildingSystem;
        this.transform = spatialTransform;

        // Building geometry must use the authoritative
        // world-to-render coordinate transformation.
        this.system.renderer.transform = spatialTransform;

        this.editorCamera = new EditorCamera(
            scene,
            spatialTransform
        );

        this.placement = new BuildingPlacement(
            buildingSystem,
            this.editorCamera
        );

        this.floorPlan = new FloorPlanReference(
            scene,
            spatialTransform
        );
this.floorPlanBuilder = new FloorPlanBuilder({
    wallHeight: 3.2,
    doorHeight: 2.1,
    windowHeight: 1.2,
    windowSill: 0.9
});

        this.mode = "floor-plan";
        this.anomalyPlacementArmed = false;
        this.activeAnomalyEndpoint = "source";
        this.currentAnomalyPlaneId = null;
        this.geometryDemo = null;
        this.currentPlaneTransform = spatialTransform;
        this.editorInspectionSliceId = null;
        this.gridSize = 1;
        this.activeBuilding = null;
        this.selectedRoom = null;
        this.startPoint = null;
        this.enabled = false;

        this.createInterface();
        this.transformTools = new SharedTransformTools(scene, {
            name: 'somnium-building-transform-gizmo',
            onChange: state => this.applyBuildingGizmoTransform(state)
        });
        this.planeEditor = new PlaneEditor(scene, spatialTransform, this.container.querySelector('[data-plane-subpanel="editor"]'), {
            camera: this.editorCamera,
            onWViewChanged: state => this.applyEditorWInspection(state),
            onContextChanged: context => {
                this.currentPlaneTransform = context.transform ?? this.transform;
                const inspection = this.geometryDemo?.getEditorInspectionContext?.();
                this.editorCamera.transform = inspection?.transform ?? context.transform ?? this.transform;
                // The editor camera sees the chosen built-in slice plus all
                // custom Plane layers intersecting the same ambient W value.
                // With no registered Plane at an intermediate W, retain only
                // the custom Plane layer for authoring an empty slice.
                this.editorCamera.camera.layerMask = this.activeEditorTab === "planes" && this.activePlaneSubtab === 'editor'
                    ? (inspection?.layerMask ?? 0x40000000)
                    : (context.layerMask ?? 0x0FFFFFFF);
                if (context.focus && (!inspection?.transform || inspection.transform === context.transform)) {
                    this.editorCamera.focus(context.focus, context.focusRadius);
                }
            }
        });
        this.configurePlaneSubtabs();
        this.anomalyTransformTools = new SharedTransformTools(scene, {
            name: 'somnium-anomaly-aperture-gizmo',
            rotationAxes: 'all',
            onChange: state => this.applyAnomalyGizmoTransform(state)
        });
        this.anomalyTransformTools.setMode('scale');
this.previewRenderer = new BuildingPreviewRenderer(
    scene,
    buildingSystem.geometryRenderer
);

this.floorPlanHeightControl =
    new FloorPlanHeightControl(
        this.container,
        this.floorPlanBuilder,
        () => {
            if (
                this.activeBuilding &&
                this.floorPlan.mesh
            ) {
                this.buildFloorFromPlan();
            }
        }
    );

this.installFloorPlanWorkflowControls();

        this.pointerObserver =
            scene.onPointerObservable.add(info => {
                if (!this.enabled) return;

                if (
                    info.type === BABYLON.PointerEventTypes.POINTERDOWN
                ) {
                    this.pointerDown();
                }

                if (
                    info.type === BABYLON.PointerEventTypes.POINTERUP
                ) {
                    this.pointerUp();
                }
            });
    }

    /**
     * Bind the editor camera to the runtime Plane selected by the universe W
     * slider. A slice transition moves the camera target to that Plane's
     * natural inspection point while preserving orbit orientation and radius;
     * moving within the same slice does not repeatedly reset the user's view.
     */
    applyEditorWInspection(state) {
        if (!state) {
            this.geometryDemo?.clearEditorWCoordinate?.();
            this.editorInspectionSliceId = null;
            this.editorCamera.transform = this.planeEditor?.activeTransform ?? this.currentPlaneTransform ?? this.transform;
            if (this.editorCamera?.camera) this.editorCamera.camera.layerMask = 0x0FFFFFFF;
            return null;
        }

        this.geometryDemo?.setEditorWCoordinate?.(state.coordinate);
        const inspection = this.geometryDemo?.getEditorInspectionContext?.() ?? null;
        const sliceId = inspection?.sliceId ?? null;
        const sliceChanged = sliceId !== this.editorInspectionSliceId;
        this.editorInspectionSliceId = sliceId;

        // An unoccupied W coordinate still permits authoring. In that case
        // retain the selected Plane's transform rather than a stale old slice.
        this.editorCamera.transform = inspection?.transform ??
            this.planeEditor?.activeTransform ?? this.currentPlaneTransform ?? this.transform;
        if (this.editorCamera?.camera) {
            this.editorCamera.camera.layerMask = Number.isFinite(inspection?.layerMask)
                ? inspection.layerMask : 0x40000000;
        }

        if (sliceChanged && inspection?.sliceId) {
            const focus = this.geometryDemo?.getEditorInspectionFocus?.(inspection);
            if (focus && this.editorCamera?.focus) {
                // Deliberately omit a radius: retain the zoom level the user
                // chose, but move the target into the newly selected metric.
                this.editorCamera.focus(focus);
            }
        }
        return inspection;
    }

	setGameManager(manager) {
    this.gameManager = manager;

    manager.registerEditor(this.editorCamera.camera);

    this.unsubscribeMode = manager.onModeChanged(mode => {
        const active = mode === "editor";

        this.enabled = active;
        this.container.style.display =
            active ? "block" : "none";

        if (active && this.activeBuilding) {
            this.editorCamera.focus(
                this.activeBuilding.position
            );
        }
    });
}

    createInterface() {
        this.container = document.createElement("div");

        Object.assign(this.container.style, {
            position: "fixed",
            top: "70px",
            left: "18px",
            width: "280px",
            maxHeight: "85vh",
            overflowY: "auto",
            padding: "16px",
            background: "rgba(19,29,40,0.97)",
            border: "1px solid #536779",
            borderRadius: "8px",
            color: "#fff",
            fontFamily: "Arial,sans-serif",
            zIndex: "1600",
            display: "none"
        });

        this.container.innerHTML = `
            <h3 style="margin-top:0">LEVEL BUILDER</h3>
            <div class="somnium-editor-tabs" role="tablist" aria-label="Level Builder sections">
                <button type="button" data-editor-tab="planes" aria-selected="true" title="Switch to Planes (1)">Planes (1)</button>
                <button type="button" data-editor-tab="object-editor" aria-selected="false" title="Switch to Object Editor (2)">Object Editor (2)</button>
            </div>
            <section data-editor-panel="planes">
                <div class="somnium-plane-subtabs" role="tablist" aria-label="Plane editor sections">
                    <button type="button" data-plane-subtab="editor" aria-selected="true">PLANE EDITOR</button>
                    <button type="button" data-plane-subtab="anomalies" aria-selected="false">ANOMALIES</button>
                </div>
                <div data-plane-subpanel="editor"></div>
                <section data-plane-subpanel="anomalies" hidden>

                <h4>ANOMALY CONNECTIONS</h4>
                <p style="font-size:12px;color:#b8c8d7;line-height:1.45">
                    Configure persistent connections between registered Planes. Saved endpoint settings are reflected in the live geometry demo.
                </p>
                <button id="anomaly-create" type="button" style="width:100%">CREATE ANOMALY</button>
                <div id="anomaly-list" style="display:grid;gap:8px;margin-top:12px"></div>
                <div id="anomaly-details" style="display:none;border-top:1px solid #536779;margin-top:14px;padding-top:12px">
                    <label style="display:grid;gap:4px">Name
                        <input id="anomaly-name" type="text" maxlength="100">
                    </label>
                    <div id="anomaly-endpoints" style="font-size:12px;line-height:1.6;margin:10px 0;color:#b8c8d7"></div>
                    <div id="anomaly-mouth-editor" style="display:grid;gap:10px;margin:12px 0">
                        <div class="somnium-mouth-editor" data-mouth="source">
                            <strong>MOUTH A</strong>
                            <label>Plane <select data-plane-select="source"></select></label>
                            <button type="button" data-place-mouth="source">PLACE MOUTH A</button>
                            <div class="somnium-mouth-grid">
                                <label>X <input data-mouth-value="source.x" type="number" step="0.1"></label>
                                <label>Y <input data-mouth-value="source.y" type="number" step="0.1"></label>
                                <label>Z <input data-mouth-value="source.z" type="number" step="0.1"></label>
                                <label>Yaw° <input data-mouth-value="source.yaw" type="number" step="1"></label>
                                <label>Pitch° <input data-mouth-value="source.pitch" type="number" step="1"></label>
                                <label>Roll° <input data-mouth-value="source.roll" type="number" step="1"></label>
                            </div>
                        </div>
                        <div class="somnium-mouth-editor" data-mouth="destination">
                            <strong>MOUTH B</strong>
                            <label>Plane <select data-plane-select="destination"></select></label>
                            <button type="button" data-place-mouth="destination">PLACE MOUTH B</button>
                            <div class="somnium-mouth-grid">
                                <label>X <input data-mouth-value="destination.x" type="number" step="0.1"></label>
                                <label>Y <input data-mouth-value="destination.y" type="number" step="0.1"></label>
                                <label>Z <input data-mouth-value="destination.z" type="number" step="0.1"></label>
                                <label>Yaw° <input data-mouth-value="destination.yaw" type="number" step="1"></label>
                                <label>Pitch° <input data-mouth-value="destination.pitch" type="number" step="1"></label>
                                <label>Roll° <input data-mouth-value="destination.roll" type="number" step="1"></label>
                            </div>
                        </div>
                        <button id="anomaly-align-mouths" type="button">ALIGN MOUTH B TO MOUTH A</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:12px 0">
                        <label style="display:grid;gap:4px;font-size:11px">Aperture radius
                            <input id="anomaly-aperture-radius" type="number" min="0.1" max="1000" step="0.1">
                        </label>
                        <label style="display:grid;gap:4px;font-size:11px">W-freedom radius
                            <input id="anomaly-w-freedom-radius" type="number" min="0.1" max="1000" step="0.1">
                        </label>
                    </div>
                    <small style="display:block;color:#9fb2c4;margin:-5px 0 10px">Select the source Plane. The scale gizmo at Mouth A changes the aperture radius; the numeric field remains available for precise values.</small>
                    <button id="anomaly-save-place" type="button" style="width:100%;font-weight:bold;padding:10px">SAVE &amp; PLACE ANOMALY <span style="font-weight:normal">(Ctrl+Enter)</span></button>
                    <div style="display:grid;gap:6px;margin:10px 0">
                        <label><input id="anomaly-visible" type="checkbox"> Visible</label>
                        <label><input id="anomaly-traversable" type="checkbox"> Traversable</label>
                        <label><input id="anomaly-bidirectional" type="checkbox"> Bidirectional</label>
                        <label style="display:flex;gap:8px;align-items:center"><input id="anomaly-enabled" type="checkbox"> Enabled</label>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
                        <button id="anomaly-duplicate" type="button">DUPLICATE</button>
                        <button id="anomaly-delete" type="button">DELETE</button>
                    </div>
                    <p id="anomaly-detail-status" style="font-size:11px;color:#b8c8d7"></p>
                </div>
                <p id="anomaly-status" style="font-size:12px;color:#b8c8d7">Loading saved anomalies…</p>
                </section>
            </section>
            <section data-editor-panel="object-editor" hidden>
            <h4>CREATE BUILDING FROM FLOOR PLAN</h4>
            <p style="font-size:12px;color:#b8c8d7;line-height:1.45">Import a floor-plan image, position and size it, then construct a building from the plan.</p>
            <h4>FLOOR PLAN IMAGE</h4>
            <input type="file" id="floor-image" accept="image/*">

            <label>Width
                <input id="floor-width" type="number" min="0.1" value="20">
            </label>
	<label>
    Floor Plan Altitude Offset

    <input
        id="floor-altitude"
        type="number"
        step="0.1"
        value="0"
    >
</label>

	<button id="build-floor" style="width:100%">
		BUILD FLOOR FROM PLAN
	</button>

            <label>Depth
                <input id="floor-depth" type="number" min="0.1" value="20">
            </label>

            <label>Opacity
                <input id="floor-opacity" type="range"
                    min="0" max="1" step="0.05" value="0.8">
            </label>

            <label>
                <input id="floor-visible" type="checkbox" checked>
                Show floor plan
            </label>

            <hr>

            <h4>BUILDING SELECTION</h4>
            <label style="display:grid;gap:4px">Select building
                <select id="building-select" style="width:100%"><option value="">No building selected</option></select>
            </label>
            <h4>BUILDING POSITION</h4>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:7px 0">
                <button type="button" data-transform-mode="translate">MOVE</button>
                <button type="button" data-transform-mode="rotate">ROTATE</button>
                <button type="button" data-transform-mode="scale">SCALE</button>
            </div>
            <small style="display:block;color:#9fb2c4;margin-bottom:8px">Blender-style viewport gizmos manipulate the selected building. Numeric fields remain available below.</small>
            <label>Scale X <input id="scale-x" type="number" min="0.01" step="0.1" value="1"></label>
            <label>Scale Y <input id="scale-y" type="number" min="0.01" step="0.1" value="1"></label>
            <label>Scale Z <input id="scale-z" type="number" min="0.01" step="0.1" value="1"></label>

            <label>X
                <input id="position-x" type="number" step="0.1" value="0">
            </label>

            <label>Z
                <input id="position-z" type="number" step="0.1" value="0">
            </label>

            <label>Elevation
                <input id="position-y" type="number" step="0.1" value="0">
            </label>

            <label>Rotation (degrees)
                <input id="position-rotation" type="number"
                    step="1" value="0">
            </label>

            <hr>

            <label>Grid size
                <input id="building-grid" type="number"
                    min="0.1" step="0.1" value="1">
            </label>

            <p id="building-status" style="font-size:12px;color:#b8c8d7">
                Select a construction tool.
            </p>

            <button id="building-close" style="width:100%">
                CLOSE EDITOR
            </button>
            </section>
        `;

        const tabStyle = document.createElement("style");
        tabStyle.textContent = `
            .somnium-editor-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0 14px}
            .somnium-editor-tabs button{padding:9px 6px;border:1px solid #536779;border-radius:5px;background:#26394b;color:#dce8f2;cursor:pointer}
            .somnium-editor-tabs button[aria-selected="true"]{background:#42617c;border-color:#9bbbd4;color:#fff}
            .somnium-build-launcher{color:#fff;background:#172b3c;border:1px solid #536d82;padding:12px 18px;cursor:pointer;border-radius:5px;font-size:13px;font-family:Arial,sans-serif}
            .somnium-build-launcher:hover{background:#294a63}
            [data-editor-panel][hidden]{display:none!important}
            .somnium-plane-subtabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:8px 0 12px}
            .somnium-plane-subtabs button{padding:8px 5px;border:1px solid #536779;border-radius:5px;background:#26394b;color:#dce8f2;cursor:pointer;font-size:11px}
            .somnium-plane-subtabs button[aria-selected="true"]{background:#42617c;border-color:#9bbbd4;color:#fff}
            [data-plane-subpanel][hidden]{display:none!important}
            [data-plane-subpanel="anomalies"]{border:1px solid #536779;border-radius:6px;padding:10px;background:rgba(255,255,255,.025)}
            .somnium-anomaly-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:9px;background:#263746;border:1px solid #536779;border-radius:5px}
            .somnium-anomaly-row button{cursor:pointer}
            .somnium-mouth-editor{display:grid;gap:7px;padding:9px;background:rgba(255,255,255,.045);border:1px solid #536779;border-radius:5px}
            .somnium-mouth-editor label{display:grid;gap:3px;font-size:11px;color:#c5d5e2}
            .somnium-mouth-editor select,.somnium-mouth-editor input{box-sizing:border-box;width:100%;min-width:0}
            .somnium-mouth-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
            .somnium-mouth-editor button{padding:7px;cursor:pointer}
        `;
        document.head.appendChild(tabStyle);
        this.tabStyle = tabStyle;
        this.activeEditorTab = "planes";
        this.activePlaneSubtab = "editor";
        this.container.querySelectorAll("[data-editor-tab]").forEach(button => {
            button.onclick = () => this.setEditorTab(button.dataset.editorTab);
        });
        this.container.querySelector("#anomaly-create").onclick = () => this.createAnomalyRecord();
        this.container.querySelector("#anomaly-name").onchange = event => this.updateSelectedAnomaly({ name: event.target.value });
        this.container.querySelector("#anomaly-enabled").onchange = event => this.updateSelectedAnomaly({ enabled: event.target.checked });
        for (const key of ["visible", "traversable", "bidirectional"]) {
            this.container.querySelector(`#anomaly-${key}`).onchange = event => this.updateSelectedConnection({ [key]: event.target.checked });
        }
        this.container.querySelectorAll("[data-plane-select]").forEach(select => {
            select.onchange = event => this.updateEndpointPlane(select.dataset.planeSelect, event.target.value);
        });
        this.container.querySelectorAll("[data-place-mouth]").forEach(button => {
            button.onclick = () => this.armAnomalyPlacement(button.dataset.placeMouth);
        });
        this.container.querySelectorAll("[data-mouth-value]").forEach(input => {
            input.onchange = () => this.updateEndpointFromInputs(input.dataset.mouthValue.split(".")[0]);
        });
        this.container.querySelector("#anomaly-align-mouths").onclick = () => this.alignSelectedMouths();
        this.container.querySelector("#anomaly-aperture-radius").onchange = () => this.updateSelectedAnomalyRadii();
        this.container.querySelector("#anomaly-w-freedom-radius").onchange = () => this.updateSelectedAnomalyRadii();
        this.container.querySelector("#anomaly-save-place").onclick = () => this.commitSelectedAnomaly();
        this.keydownHandler = event => {
            if (!this.enabled || this.container.style.display === "none" || event.repeat) return;
            const target = event.target;
            // Save should remain available while editing a Plane name or numeric field.
            if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
                event.code === "KeyS" && this.activeEditorTab === "planes" && this.activePlaneSubtab === "editor") {
                event.preventDefault();
                this.planeEditor?.save();
                return;
            }
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
                (event.code === "Digit1" || event.code === "Numpad1")) {
                event.preventDefault();
                this.setEditorTab("planes");
                return;
            }
            if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
                (event.code === "Digit2" || event.code === "Numpad2")) {
                event.preventDefault();
                this.setEditorTab("object-editor");
                return;
            }
            // Plane editor subtabs: Alt+1 = Plane Editor, Alt+2 = Anomalies.
            if (this.activeEditorTab === "planes" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
                (event.code === "Digit1" || event.code === "Numpad1" || event.code === "Digit2" || event.code === "Numpad2")) {
                event.preventDefault();
                this.setPlaneSubtab((event.code === "Digit1" || event.code === "Numpad1") ? "editor" : "anomalies");
                return;
            }
            // Blender-style transform shortcuts: G move, R rotate, S scale.
            if (this.activeEditorTab === "planes" && this.activePlaneSubtab === "editor" &&
                !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
                (event.code === "KeyG" || event.code === "KeyR" || event.code === "KeyS")) {
                const selected = this.planeEditor?.selectedObject?.();
                if (selected) {
                    event.preventDefault();
                    this.planeEditor.transformTools.setMode(({ KeyG: "translate", KeyR: "rotate", KeyS: "scale" })[event.code]);
                    return;
                }
            }
            if (this.activeEditorTab === "planes" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.code === "KeyV") {
                event.preventDefault();
                this.planeEditor?.cycleWheelZoomMultiplier();
                return;
            }
            if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== "Enter") return;
            if (this.activeEditorTab !== "planes" || this.activePlaneSubtab !== "anomalies") return;
            if (target && target.tagName === "BUTTON") return;
            event.preventDefault();
            this.commitSelectedAnomaly();
        };
        document.addEventListener("keydown", this.keydownHandler);
        this.container.querySelector("#anomaly-duplicate").onclick = () => this.duplicateSelectedAnomaly();
        this.container.querySelector("#anomaly-delete").onclick = () => this.deleteSelectedAnomaly();

        document.body.appendChild(this.container);

        this.status = this.container.querySelector(
            "#building-status"
        );

        this.container.querySelectorAll("[data-mode]")
            .forEach(button => {
                button.onclick = () => this.setMode(button.dataset.mode);
            });

        const element = id =>
            this.container.querySelector(`#${id}`);

        element("building-grid").onchange = event => {
            this.gridSize = Math.max(
                0.1,
                Number(event.target.value) || 1
            );
        };

	element("floor-image").onchange = async event => {
    try {
	if (
    this.activeBuilding?.metadata?.editorPreview
) {
    this.setStatus(
        "Please place the current building before importing another plan."
    );

    event.target.value = "";
    return;
}
        await this.floorPlan.load(
            event.target.files[0]
        );
	const width = Number(
    this.container.querySelector("#floor-width").value
);

const depth = width *
    this.floorPlan.image.naturalHeight /
    this.floorPlan.image.naturalWidth;

this.container.querySelector(
    "#floor-depth"
).value = depth.toFixed(2);

this.aspectLock.checked = true;

this.floorPlan.setDimensions(width, depth);

        this.ensureBuildingForFloorPlan();
        this.updateFloorPlanPosition();
	if (
    this.activeBuilding?.metadata?.editorPreview
) {
    this.previewRenderer.show(this.activeBuilding);
}

        this.setStatus(
            "Floor plan imported. Position it, then build the floor."
        );
    } catch (error) {
        this.setStatus(error.message);
    }
};
element("floor-altitude").addEventListener(
    "input",
    event => {
        this.floorPlan.setAltitudeOffset(
            Number(event.target.value) || 0
        );
    }
);

element("build-floor").onclick = () =>
    this.buildFloorFromPlan();

        element("floor-opacity").oninput = event =>
            this.floorPlan.setOpacity(Number(event.target.value));

        element("floor-visible").onchange = event =>
            this.floorPlan.setVisible(event.target.checked);

        for (const id of ["floor-width", "floor-depth"]) {
            element(id).onchange = () => {
                this.updateFloorPlanPosition({
                    width: Number(element("floor-width").value),
                    depth: Number(element("floor-depth").value)
                });
            };
        }

const updatePlacement = () => {
    if (!this.activeBuilding) return;

    this.placement.update({
        x: Number(element("position-x").value),
        z: Number(element("position-z").value),
        y: Number(element("position-y").value),
        rotation:
            Number(element("position-rotation").value) *
            Math.PI / 180
    });

    this.updateFloorPlanPosition();
    this.attachBuildingGizmo(this.activeBuilding);

    if (
        this.activeBuilding.metadata?.editorPreview
    ) {
        this.previewRenderer.show(
            this.activeBuilding
        );
    }
};
        for (const id of [
            "position-x",
            "position-z",
            "position-y",
            "position-rotation"
        ]) {
            element(id).onchange = updatePlacement;
        }
        for (const axis of ['x', 'y', 'z']) {
            element(`scale-${axis}`).onchange = () => {
                if (!this.activeBuilding) return;
                this.activeBuilding.scale ??= { x: 1, y: 1, z: 1 };
                this.activeBuilding.scale[axis] = Math.max(0.01, Number(element(`scale-${axis}`).value) || 1);
                this.system.rebuild(this.activeBuilding);
                this.attachBuildingGizmo(this.activeBuilding);
            };
        }
        this.container.querySelectorAll('[data-transform-mode]').forEach(button => {
            button.onclick = () => {
                this.transformTools?.setMode(button.dataset.transformMode);
                this.container.querySelectorAll('[data-transform-mode]').forEach(item => {
                    item.setAttribute('aria-pressed', String(item === button));
                });
            };
        });

        element("building-select").onchange = event => this.selectBuilding(event.target.value);
        this.refreshBuildingSelection();
        element("building-close").onclick = () => this.close();

        this.launcher = document.createElement("button");
        this.launcher.textContent = "BUILD (B)";
        this.launcher.className = "somnium-build-launcher";
        this.launcher.type = "button";
        this.launcher.setAttribute("aria-label", "Open building editor (B)");

        Object.assign(this.launcher.style, {
            position: "fixed",
            top: "18px",
            left: "18px",
            zIndex: "1601"
        });

        this.launcher.onclick = () => this.open();
        document.body.appendChild(this.launcher);
    }

    configurePlaneSubtabs() {
        this.activePlaneSubtab = 'editor';
        this.container.querySelectorAll('[data-plane-subtab]').forEach(button => {
            button.onclick = () => this.setPlaneSubtab(button.dataset.planeSubtab);
        });
        this.container.querySelectorAll('[data-plane-subpanel]').forEach(panel => {
            panel.hidden = panel.dataset.planeSubpanel !== 'editor';
        });
    }

    setPlaneSubtab(tab) {
        if (!['editor', 'anomalies'].includes(tab)) return;
        this.activePlaneSubtab = tab;
        this.container.querySelectorAll('[data-plane-subtab]').forEach(button => {
            button.setAttribute('aria-selected', String(button.dataset.planeSubtab === tab));
        });
        this.container.querySelectorAll('[data-plane-subpanel]').forEach(panel => {
            panel.hidden = panel.dataset.planeSubpanel !== tab;
        });
        if (tab === 'anomalies') this.activateAnomalyEditor();
        else this.deactivateAnomalyEditor();
    }

    activateAnomalyEditor() {
        if (!this.enabled || this.activeEditorTab !== 'planes' || this.activePlaneSubtab !== 'anomalies') return;
        this.planeEditor?.transformTools?.detach();
        this.anomalyTransformTools?.setMode('scale');
        this.planeEditor?.setDemoActive(true);
        if (this.geometryDemo && !this.geometryDemoSliceBeforeAnomalyEdit) {
            this.geometryDemoSliceBeforeAnomalyEdit = this.geometryDemo.currentSliceId;
        }
        this.geometryDemo?.setActive(true);
        this.refreshAnomalyList();
        if (this.currentAnomalyPlaneId) this.setAnomalyPlane(this.currentAnomalyPlaneId);
        else if (this.selectedAnomalyRecord?.source?.planeId) this.setAnomalyPlane(this.selectedAnomalyRecord.source.planeId);
    }

    deactivateAnomalyEditor() {
        this.anomalyPlacementArmed = false;
        this.anomalyTransformTools?.detach();
        this.geometryDemo?.setActive(false);
        this.planeEditor?.setDemoActive(false);
        if (this.geometryDemo && this.geometryDemoSliceBeforeAnomalyEdit) {
            this.geometryDemo.traversalController?.syncSlice(this.geometryDemoSliceBeforeAnomalyEdit);
            this.geometryDemo.activateSlice(this.geometryDemoSliceBeforeAnomalyEdit);
        }
        this.geometryDemoSliceBeforeAnomalyEdit = null;
        if (this.activeEditorTab === 'planes' && this.enabled) this.planeEditor?.activate();
    }

    attachAnomalyApertureGizmo(record = this.selectedAnomalyRecord) {
        if (!this.anomalyTransformTools || !record || this.activePlaneSubtab !== 'anomalies' ||
            !this.enabled || this.activeEditorTab !== 'planes' ||
            this.anomalyPlacementArmed || record.endpointConfiguration?.placementStatus === 'unplaced' ||
            record.endpointConfiguration?.source?.placed === false ||
            record.endpointConfiguration?.destination?.placed === false ||
            this.currentAnomalyPlaneId !== record.source?.planeId) {
            this.anomalyTransformTools?.detach();
            return false;
        }
        try {
            const world = this.geometryDemo?.getWorld(record.source.planeId);
            if (!world?.transform) throw new Error('The source Plane has no live spatial transform.');
            const render = world.transform.worldToRender(record.source.position);
            const visualScale = world.transform.getVisualScale?.(record.source.position) ?? 1;
            const radius = Number(record.runtime?.optics?.apertureRadius ?? record.runtime?.entryRadius ?? 3.4);
            const renderRadius = Math.max(0.08, Math.min(10000, radius * visualScale));
            const orientation = record.source.orientation ?? { x: 0, y: 0, z: 0, w: 1 };
            const rotation = new BABYLON.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w);
            this.anomalyGizmoBaseRadius = radius;
            this.anomalyGizmoBaseRenderScale = renderRadius;
            this.anomalyTransformTools.setLayerMask(world.layerMask ?? 0x0FFFFFFF);
            this.anomalyTransformTools.setMode('scale');
            this.anomalyTransformTools.attach(
                new BABYLON.Vector3(render.x, render.y, render.z), rotation,
                new BABYLON.Vector3(renderRadius, renderRadius, renderRadius)
            );
            return true;
        } catch (error) {
            this.anomalyTransformTools.detach();
            const status = this.container.querySelector('#anomaly-detail-status');
            if (status) status.textContent = `Aperture gizmo unavailable: ${error.message}`;
            return false;
        }
    }

    applyAnomalyGizmoTransform(state) {
        if (!state || state.mode !== 'scale' || !this.selectedAnomalyId || !this.anomalyGizmoBaseRenderScale) return;
        const scale = state.scale;
        const renderScale = (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3;
        const factor = Math.max(0.01, renderScale / this.anomalyGizmoBaseRenderScale);
        const radius = Math.max(0.1, Math.min(1000, this.anomalyGizmoBaseRadius * factor));
        const input = this.container.querySelector('#anomaly-aperture-radius');
        if (input) input.value = radius.toFixed(2);
        const status = this.container.querySelector('#anomaly-detail-status');
        if (status) status.textContent = `Aperture preview: ${radius.toFixed(2)}. Release the scale gizmo to save the new radius.`;
        if (state.phase === 'end') this.updateSelectedAnomalyRadii();
    }

    setAnomalyPersistence(persistence) {
        this.anomalyPersistence = persistence ?? null;
        const ready = this.planeEditor?.setPersistence(this.anomalyPersistence) ?? Promise.resolve();
        if (this.activePlaneSubtab === 'anomalies') this.refreshAnomalyList();
        return ready;
    }

    setGeometryDemo(geometryDemo) {
        this.geometryDemo = geometryDemo ?? null;
        return this.planeEditor?.setGeometryDemo(this.geometryDemo) ?? Promise.resolve();
    }

    async saveAnomalyAndSync(record) {
        const saved = await this.anomalyPersistence.saveAnomaly(record);
        this.geometryDemo?.applyAnomalyDefinition?.(saved);
        return saved;
    }

    setEditorTab(tab) {
        if (!['planes', 'object-editor'].includes(tab)) return;
        this.activeEditorTab = tab;
        this.container.querySelectorAll('[data-editor-tab]').forEach(button => {
            button.setAttribute('aria-selected', String(button.dataset.editorTab === tab));
        });
        this.container.querySelectorAll(':scope > [data-editor-panel]').forEach(panel => {
            panel.hidden = panel.dataset.editorPanel !== tab;
        });
        if (tab !== 'planes') {
            this.deactivateAnomalyEditor();
            this.planeEditor?.deactivate();
            this.editorCamera.transform = this.transform;
            this.currentPlaneTransform = this.transform;
            this.editorCamera.camera.layerMask = 0x0FFFFFFF;
            if (this.activeBuilding) this.attachBuildingGizmo(this.activeBuilding);
            return;
        }
        this.transformTools?.detach();
        this.planeEditor?.activate();
        this.planeEditor?.refresh();
        if (this.activePlaneSubtab === 'anomalies') this.activateAnomalyEditor();
        else this.deactivateAnomalyEditor();
    }

    async refreshAnomalyList() {
        const list = this.container.querySelector("#anomaly-list");
        const status = this.container.querySelector("#anomaly-status");
        if (!this.anomalyPersistence) {
            status.textContent = "Anomaly storage is not available yet.";
            return;
        }
        status.textContent = "Loading saved anomalies…";
        try {
            const records = await this.anomalyPersistence.listAnomalies();
            list.replaceChildren();
            records.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
            for (const record of records) {
                const row = document.createElement("div");
                row.className = "somnium-anomaly-row";
                const label = document.createElement("div");
                label.style.cssText = "min-width:0;overflow-wrap:anywhere";
                const title = document.createElement("strong");
                title.textContent = record.name;
                const meta = document.createElement("div");
                meta.style.cssText = "font-size:10px;color:#b8c8d7;margin-top:3px";
                meta.textContent = `${record.source.planeId} ↔ ${record.destination.planeId}`;
                label.append(title, meta);
                const select = document.createElement("button");
                select.type = "button";
                select.textContent = this.selectedAnomalyId === record.id ? "SELECTED" : "EDIT";
                select.onclick = () => this.selectAnomaly(record.id);
                row.append(label, select);
                list.append(row);
            }
            status.textContent = records.length ? `${records.length} saved connection${records.length === 1 ? "" : "s"}.` : "No saved anomalies yet.";
            if (this.selectedAnomalyId && !records.some(record => record.id === this.selectedAnomalyId)) {
                this.selectedAnomalyId = null;
                this.showSelectedAnomaly(null);
            }
        } catch (error) {
            status.textContent = `Could not load anomalies: ${error.message}`;
        }
    }

    async selectAnomaly(id) {
        try {
            const record = await this.anomalyPersistence.getAnomaly(id);
            this.selectedAnomalyId = record?.id ?? null;
            this.showSelectedAnomaly(record);
            await this.refreshAnomalyList();
        } catch (error) {
            this.container.querySelector("#anomaly-status").textContent = error.message;
        }
    }

    showSelectedAnomaly(record) {
        const details = this.container.querySelector("#anomaly-details");
        details.style.display = record ? "block" : "none";
        this.selectedAnomalyRecord = record ?? null;
        if (!record) { this.anomalyTransformTools?.detach(); return; }
        this.currentAnomalyPlaneId = record.source?.planeId ?? this.currentAnomalyPlaneId;
        this.container.querySelector("#anomaly-name").value = record.name;
        for (const key of ["visible", "traversable", "bidirectional"]) {
            this.container.querySelector(`#anomaly-${key}`).checked = Boolean(record.connection?.[key] ?? record.runtime?.[key]);
        }
        const isUnplacedDraft = record.endpointConfiguration?.placementStatus === "unplaced";
        const enabledControl = this.container.querySelector("#anomaly-enabled");
        enabledControl.checked = record.enabled;
        enabledControl.disabled = isUnplacedDraft;
        const apertureRadius = record.runtime?.optics?.apertureRadius ?? record.runtime?.entryRadius ?? 3.4;
        const wFreedomRadius = record.runtime?.influence?.maxWReach ?? 5;
        this.container.querySelector("#anomaly-aperture-radius").value = apertureRadius;
        this.container.querySelector("#anomaly-w-freedom-radius").value = wFreedomRadius;
        this.container.querySelector("#anomaly-save-place").disabled = isUnplacedDraft;
        this.container.querySelector("#anomaly-endpoints").textContent =
            `${isUnplacedDraft ? "DRAFT · MOUTHS NOT PLACED\n" : ""}` +
            `Mouth A · ${record.source.planeId} · (${record.source.position.x}, ${record.source.position.y}, ${record.source.position.z})\n` +
            `Mouth B · ${record.destination.planeId} · (${record.destination.position.x}, ${record.destination.position.y}, ${record.destination.position.z})`;
        this.container.querySelector("#anomaly-endpoints").style.whiteSpace = "pre-line";
        this.populateEndpointControls(record).then(() => this.attachAnomalyApertureGizmo(record)).catch(error => {
            const status = this.container.querySelector("#anomaly-detail-status");
            if (status) status.textContent = `Could not populate Plane controls: ${error.message}`;
        });
    }

    async updateSelectedAnomaly(changes) {
        if (!this.selectedAnomalyId || !this.anomalyPersistence) return;
        try {
            const current = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!current) return;
            if (changes.enabled === true && current.endpointConfiguration?.placementStatus === "unplaced") {
                this.container.querySelector("#anomaly-detail-status").textContent = "Place both mouths before enabling this connection.";
                return;
            }
            const updated = { ...current, ...changes, revision: current.revision + 1 };
            await this.saveAnomalyAndSync(updated);
            this.showSelectedAnomaly(updated);
            const isBuiltIn = this.geometryDemo?.portalPairs?.some(pair => pair.corridor.id === updated.id);
            this.container.querySelector("#anomaly-detail-status").textContent = isBuiltIn
                ? "Saved and applied to the live anomaly."
                : "Saved. This new record is not yet registered in the live runtime network.";
            await this.refreshAnomalyList();
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Save failed: ${error.message}`;
        }
    }

    async updateSelectedAnomalyRadii() {
        if (!this.selectedAnomalyId || !this.anomalyPersistence) return;
        try {
            const current = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!current) return;
            const apertureRadius = Number(this.container.querySelector("#anomaly-aperture-radius").value);
            const wFreedomRadius = Number(this.container.querySelector("#anomaly-w-freedom-radius").value);
            for (const [label, value] of [["Aperture radius", apertureRadius], ["W-freedom radius", wFreedomRadius]]) {
                if (!Number.isFinite(value) || value <= 0 || value > 1000) {
                    throw new RangeError(`${label} must be greater than 0 and no more than 1000.`);
                }
            }
            const runtime = JSON.parse(JSON.stringify(current.runtime));
            runtime.entryRadius = apertureRadius;
            runtime.optics = { ...(runtime.optics ?? {}), apertureRadius };
            runtime.influence = { ...(runtime.influence ?? {}), maxWReach: wFreedomRadius };
            const updated = { ...current, runtime, revision: current.revision + 1 };
            runtime.revision = updated.revision;
            await this.saveAnomalyAndSync(updated);
            this.showSelectedAnomaly(updated);
            this.container.querySelector("#anomaly-detail-status").textContent = "Aperture and W-freedom radii saved.";
            await this.refreshAnomalyList();
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Radius update failed: ${error.message}`;
        }
    }

    async commitSelectedAnomaly() {
        if (!this.selectedAnomalyId || !this.anomalyPersistence) return;
        const status = this.container.querySelector("#anomaly-detail-status");
        try {
            const current = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!current) throw new Error("Selected anomaly no longer exists.");
            const placement = current.endpointConfiguration ?? {};
            const bothMouthsPlaced = placement.placementStatus !== "unplaced" &&
                placement.source?.placed !== false && placement.destination?.placed !== false;
            if (!bothMouthsPlaced) {
                throw new Error("Place both mouths before saving and placing this anomaly.");
            }
            const apertureRadius = Number(this.container.querySelector("#anomaly-aperture-radius").value);
            const wFreedomRadius = Number(this.container.querySelector("#anomaly-w-freedom-radius").value);
            for (const [label, value] of [["Aperture radius", apertureRadius], ["W-freedom radius", wFreedomRadius]]) {
                if (!Number.isFinite(value) || value <= 0 || value > 1000) {
                    throw new RangeError(`${label} must be greater than 0 and no more than 1000.`);
                }
            }
            const runtime = JSON.parse(JSON.stringify(current.runtime));
            runtime.entryRadius = apertureRadius;
            runtime.optics = { ...(runtime.optics ?? {}), apertureRadius };
            runtime.influence = { ...(runtime.influence ?? {}), maxWReach: wFreedomRadius };
            const updated = {
                ...current, runtime, enabled: true,
                revision: current.revision + 1
            };
            runtime.revision = updated.revision;
            const saved = await this.saveAnomalyAndSync(updated);
            this.showSelectedAnomaly(saved);
            await this.refreshAnomalyList();
            const applied = this.geometryDemo?.portalPairs?.some(pair => pair.corridor.id === saved.id) === true;
            status.textContent = applied
                ? "Anomaly saved, enabled, and placed in the live world."
                : "Anomaly saved and enabled in Plane storage. This anomaly ID is not yet attached to a live runtime portal pair.";
        } catch (error) {
            status.textContent = `Save/place failed: ${error.message}`;
        }
    }

    async createAnomalyRecord() {
        if (!this.anomalyPersistence) return;
        try {
            const [records, planes] = await Promise.all([
                this.anomalyPersistence.listAnomalies(),
                this.anomalyPersistence.listPlanes()
            ]);
            const template = records[0];
            if (!template || planes.length < 1) throw new Error("No anomaly template or registered Planes are available.");
            const id = `anomaly-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`;
            const planeA = planes[0].id;
            const planeB = (planes.find(plane => plane.id !== planeA) ?? planes[0]).id;
            const origin = { x: 0, y: 0, z: 0 };
            const identity = { x: 0, y: 0, z: 0, w: 1 };
            const runtime = {
                ...template.runtime,
                id,
                revision: 1,
                source: { ...template.runtime.source, sliceId: planeA, position: { ...origin } },
                destination: { ...template.runtime.destination, sliceId: planeB, position: { ...origin } }
            };
            const record = {
                ...template,
                id,
                name: "New Anomaly (unplaced)",
                enabled: false,
                revision: 1,
                runtime,
                source: { planeId: planeA, sliceId: planeA, position: { ...origin }, orientation: { ...identity } },
                destination: { planeId: planeB, sliceId: planeB, position: { ...origin }, orientation: { ...identity } },
                endpointConfiguration: {
                    source: { ...(template.endpointConfiguration?.source ?? {}), placed: false },
                    destination: { ...(template.endpointConfiguration?.destination ?? {}), placed: false },
                    placementStatus: "unplaced"
                }
            };
            await this.saveAnomalyAndSync(record);
            this.selectedAnomalyId = id;
            await this.refreshAnomalyList();
            const saved = await this.anomalyPersistence.getAnomaly(id);
            this.showSelectedAnomaly(saved);
            this.container.querySelector("#anomaly-detail-status").textContent = "Draft saved. Place both mouths before enabling this connection.";
        } catch (error) {
            this.container.querySelector("#anomaly-status").textContent = `Could not create anomaly: ${error.message}`;
        }
    }

    async duplicateSelectedAnomaly() {
        if (!this.selectedAnomalyId) return;
        try {
            const source = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!source) return;
            const id = `anomaly-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`;
            const duplicate = JSON.parse(JSON.stringify(source));
            duplicate.id = id;
            duplicate.name = `${source.name} (copy)`;
            duplicate.enabled = false;
            duplicate.revision = 1;
            duplicate.endpointConfiguration = {
                source: { ...(duplicate.endpointConfiguration?.source ?? {}), placed: false },
                destination: { ...(duplicate.endpointConfiguration?.destination ?? {}), placed: false },
                placementStatus: "unplaced"
            };
            duplicate.runtime.id = id;
            duplicate.runtime.revision = 1;
            await this.saveAnomalyAndSync(duplicate);
            this.selectedAnomalyId = id;
            await this.refreshAnomalyList();
            this.showSelectedAnomaly(await this.anomalyPersistence.getAnomaly(id));
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Duplicate failed: ${error.message}`;
        }
    }

    async deleteSelectedAnomaly() {
        if (!this.selectedAnomalyId || !this.anomalyPersistence) return;
        const id = this.selectedAnomalyId;
        try {
            this.geometryDemo?.removeRuntimeAnomaly?.(id);
            await this.anomalyPersistence.deleteAnomaly(id);
            this.selectedAnomalyId = null;
            this.showSelectedAnomaly(null);
            await this.refreshAnomalyList();
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Delete failed: ${error.message}`;
        }
    }

    async populateEndpointControls(record) {
        const persistedPlanes = await this.anomalyPersistence.listPlanes();
        const runtimePlanes = this.geometryDemo?.getPlaneDefinitions?.() ?? [];
        const planesById = new Map();
        for (const plane of [...persistedPlanes, ...runtimePlanes]) {
            if (plane?.id) planesById.set(plane.id, plane);
        }
        // Repair incomplete legacy registries from the live Plane bindings.
        for (const plane of runtimePlanes) {
            if (!persistedPlanes.some(entry => entry.id === plane.id)) {
                try { await this.anomalyPersistence.savePlane(plane); } catch (error) {
                    console.warn(`[AnomalyEditor] Could not repair Plane registry entry ${plane.id}:`, error);
                }
            }
        }
        // A Plane may have been saved after GeometryDemoWorld's startup scan.
        // Register every persisted definition now, before constructing the
        // mouth choices, so custom Plane IDs are real runtime destinations.
        const options = Array.from(planesById.values()).filter(plane => {
            if (!this.geometryDemo?.getWorld) return true;
            try {
                // Saved Plane definitions are authoritative. Promote any Plane
                // created since scene startup before checking runtime readiness,
                // rather than silently dropping it from the mouth selectors.
                this.geometryDemo.ensureRuntimePlane?.(plane);
                return Boolean(this.geometryDemo.getWorld(plane.id));
            } catch (error) {
                console.warn(`[AnomalyEditor] Plane ${plane.id} is not runtime-ready:`, error);
                return false;
            }
        }).map(plane => ({ id: plane.id, name: plane.displayName ?? plane.id }));
        for (const endpointName of ["source", "destination"]) {
            const endpoint = record[endpointName];
            const select = this.container.querySelector(`[data-plane-select="${endpointName}"]`);
            select.replaceChildren();
            for (const plane of options) {
                const option = document.createElement("option");
                option.value = plane.id;
                option.textContent = plane.name;
                select.append(option);
            }
            select.value = endpoint.planeId;
            const euler = eulerDegreesFromQuaternion(endpoint.orientation);
            for (const axis of ["x", "y", "z"]) {
                this.container.querySelector(`[data-mouth-value="${endpointName}.${axis}"]`).value = endpoint.position[axis];
            }
            for (const axis of ["yaw", "pitch", "roll"]) {
                this.container.querySelector(`[data-mouth-value="${endpointName}.${axis}"]`).value = Number(euler[axis].toFixed(2));
            }
        }
        if (!this.currentAnomalyPlaneId || !options.some(plane => plane.id === this.currentAnomalyPlaneId)) {
            this.currentAnomalyPlaneId = record.source.planeId;
        }
        await this.setAnomalyPlane(this.currentAnomalyPlaneId);
    }

    async setAnomalyPlane(planeId) {
        if (!planeId) return;
        const plane = await this.anomalyPersistence.getPlane(planeId);
        if (!plane) throw new Error(`Plane is not registered: ${planeId}`);
        if (this.geometryDemo) {
            this.geometryDemo.ensureRuntimePlane?.(plane);
            this.geometryDemo.getWorld(planeId);
        }
        this.currentAnomalyPlaneId = planeId;
        if (this.geometryDemo) {
            this.geometryDemo.setActive(true);
            this.geometryDemo.traversalController?.syncSlice(planeId);
            this.geometryDemo.activateSlice(planeId);
            const world = this.geometryDemo.getWorld(planeId);
            this.currentPlaneTransform = world.transform;
            this.editorCamera.transform = world.transform;
            this.editorCamera.camera.layerMask = world.layerMask;
            this.editorCamera.focus({ x: 0, y: 0, z: 0 }, 80);
            this.anomalyTransformTools?.setLayerMask(world.layerMask ?? 0x0FFFFFFF);
        }
        this.attachAnomalyApertureGizmo();
        this.container.querySelector("#anomaly-detail-status").textContent = `Editing ${plane.displayName ?? plane.id}. Select a mouth and click the scene to place it.`;
    }

    async updateEndpointPlane(endpointName, planeId) {
        if (!this.selectedAnomalyId) return;
        try {
            const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!record) return;
            if (record.endpointConfiguration?.placementStatus !== "unplaced") {
                record.endpointConfiguration ??= { source: {}, destination: {} };
                record.endpointConfiguration.source = { ...(record.endpointConfiguration.source ?? {}), placed: true };
                record.endpointConfiguration.destination = { ...(record.endpointConfiguration.destination ?? {}), placed: true };
            }
            const next = markAnomalyEndpointPlaced(record, endpointName, {
                planeId,
                position: record[endpointName].position,
                orientation: record[endpointName].orientation
            });
            next.endpointConfiguration[endpointName].placed = false;
            next.endpointConfiguration.placementStatus = "unplaced";
            next.enabled = false;
            next.revision = record.revision + 1;
            next.runtime.revision = next.revision;
            await this.saveAnomalyAndSync(next);
            this.showSelectedAnomaly(next);
            await this.setAnomalyPlane(planeId);
            this.container.querySelector("#anomaly-detail-status").textContent = `Mouth ${endpointName === "source" ? "A" : "B"} moved to ${planeId}. Place it again to complete the connection.`;
            await this.refreshAnomalyList();
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Plane change failed: ${error.message}`;
        }
    }

    async armAnomalyPlacement(endpointName) {
        if (!this.selectedAnomalyId || !["source", "destination"].includes(endpointName)) return;
        const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
        if (!record) return;
        this.activeAnomalyEndpoint = endpointName;
        this.anomalyPlacementArmed = true;
        this.anomalyTransformTools?.detach();
        await this.setAnomalyPlane(record[endpointName].planeId);
        const label = endpointName === "source" ? "A" : "B";
        this.container.querySelector("#anomaly-detail-status").textContent = `PLACEMENT ARMED · Click the scene once to place Mouth ${label}. Your other mouth and its settings will be preserved.`;
    }

    pickAnomalyWorldPosition() {
        const planeId = this.currentAnomalyPlaneId;
        const pick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            mesh => mesh.isPickable && (
                mesh.metadata?.sliceId === planeId ||
                mesh.metadata?.terrainChunk === true
            )
        );
        const transform = this.currentPlaneTransform ?? this.transform;
        if (pick?.hit && pick.pickedPoint) {
            return renderToWorldForEditorPick(transform, {
                x: pick.pickedPoint.x,
                y: pick.pickedPoint.y,
                z: pick.pickedPoint.z
            });
        }
        // A horizontal editor-plane fallback keeps the 4D chamber placeable
        // even when its synthetic movement surface has no pickable mesh.
        const camera = this.scene.activeCamera;
        const ray = this.scene.createPickingRay(
            this.scene.pointerX,
            this.scene.pointerY,
            BABYLON.Matrix.Identity(),
            camera
        );
        const distance = ray.intersectsPlane(new BABYLON.Plane(0, 1, 0, 0));
        if (distance === null || distance < 0) return null;
        const point = ray.origin.add(ray.direction.scale(distance));
        return renderToWorldForEditorPick(transform, { x: point.x, y: point.y, z: point.z });
    }

    async placeArmedAnomalyMouth() {
        const position = this.pickAnomalyWorldPosition();
        if (!position) {
            this.container.querySelector("#anomaly-detail-status").textContent = "No surface or editor plane found. Try clicking a visible point in the selected Plane.";
            return;
        }
        try {
            const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!record) throw new Error("Selected anomaly no longer exists.");
            const endpointName = this.activeAnomalyEndpoint;
            const endpoint = record[endpointName];
            const next = markAnomalyEndpointPlaced(record, endpointName, {
                planeId: this.currentAnomalyPlaneId,
                position,
                orientation: endpoint.orientation
            });
            await this.saveAnomalyAndSync(next);
            this.anomalyPlacementArmed = false;
            this.showSelectedAnomaly(next);
            await this.refreshAnomalyList();
            this.container.querySelector("#anomaly-detail-status").textContent = `Mouth ${endpointName === "source" ? "A" : "B"} placed in ${this.currentAnomalyPlaneId}. ${next.endpointConfiguration.placementStatus === "placed" ? "Both mouths are placed; the connection can now be enabled." : "Now place the other mouth in its destination Plane."}`;
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Placement failed: ${error.message}`;
        }
    }

    async updateEndpointFromInputs(endpointName) {
        if (!this.selectedAnomalyId) return;
        try {
            const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!record) return;
            const read = key => Number(this.container.querySelector(`[data-mouth-value="${endpointName}.${key}"]`).value);
            const position = { x: read("x"), y: read("y"), z: read("z") };
            const orientation = quaternionFromEulerDegrees(read("yaw"), read("pitch"), read("roll"));
            const next = markAnomalyEndpointPlaced(record, endpointName, {
                planeId: record[endpointName].planeId, position, orientation
            });
            await this.saveAnomalyAndSync(next);
            this.showSelectedAnomaly(next);
            await this.refreshAnomalyList();
            this.container.querySelector("#anomaly-detail-status").textContent = `Mouth ${endpointName === "source" ? "A" : "B"} settings saved.`;
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Endpoint update failed: ${error.message}`;
        }
    }

    async alignSelectedMouths() {
        if (!this.selectedAnomalyId) return;
        try {
            const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!record) return;
            const next = alignAnomalyEndpoints(record);
            if (record.endpointConfiguration?.placementStatus !== "unplaced") {
                next.endpointConfiguration.source = {
                    ...(next.endpointConfiguration.source ?? {}), placed: true
                };
            }
            next.endpointConfiguration.destination = {
                ...(next.endpointConfiguration.destination ?? {}),
                placed: true,
                planeId: next.destination.planeId,
                position: { ...next.destination.position },
                orientation: { ...next.destination.orientation }
            };
            next.endpointConfiguration.placementStatus = next.endpointConfiguration.source?.placed === true ? "placed" : "unplaced";
            if (next.endpointConfiguration.placementStatus !== "placed") next.enabled = false;
            next.revision = record.revision + 1;
            next.runtime.revision = next.revision;
            await this.saveAnomalyAndSync(next);
            this.showSelectedAnomaly(next);
            await this.refreshAnomalyList();
            this.container.querySelector("#anomaly-detail-status").textContent = "Mouth B aligned to Mouth A's position and orientation. The destination Plane selection was retained; this is a one-time alignment, not a live linkage.";
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Alignment failed: ${error.message}`;
        }
    }

    async updateSelectedConnection(patch) {
        if (!this.selectedAnomalyId) return;
        try {
            const record = await this.anomalyPersistence.getAnomaly(this.selectedAnomalyId);
            if (!record) return;
            const next = updateAnomalyConnection(record, patch);
            await this.saveAnomalyAndSync(next);
            this.showSelectedAnomaly(next);
            this.container.querySelector("#anomaly-detail-status").textContent = "Connection settings saved.";
        } catch (error) {
            this.container.querySelector("#anomaly-detail-status").textContent = `Connection update failed: ${error.message}`;
        }
    }

    setStatus(message) {
        this.status.textContent = message;
    }

    setMode(mode) {
        if (!["door", "window", "furniture", "floor-plan"].includes(mode)) {
            this.startPoint = null;
            this.mode = "floor-plan";
            this.setStatus("Legacy drag-to-draw room creation is disabled. Use the floor-plan workflow to construct buildings.");
            return;
        }
        this.mode = mode;
        this.startPoint = null;
        this.setStatus(`Active tool: ${mode}`);
    }

    open() {
        this.container.style.display = "block";
        this.enabled = true;
        this.gameManager?.startEditor();

        if (this.activeBuilding) {
            this.editorCamera.focus(this.activeBuilding.position);
        }
        if (this.activeEditorTab === "planes") {
            this.planeEditor?.activate();
            if (this.activePlaneSubtab === 'anomalies') this.activateAnomalyEditor();
        }
    }

    close() {
        this.container.style.display = "none";
        this.enabled = false;
        this.startPoint = null;
        this.anomalyPlacementArmed = false;
        this.deactivateAnomalyEditor();
        this.geometryDemo?.setActive(false);
        this.planeEditor?.deactivate();
        this.planeEditor?.setDemoActive(false);
        this.editorCamera.transform = this.transform;
        this.currentPlaneTransform = this.transform;
        this.editorCamera.camera.layerMask = 0x0FFFFFFF;
        this.gameManager?.exitEditor();
    }

    snap(value) {
        return Math.round(value / this.gridSize) *
            this.gridSize;
    }

    pickWorldPosition(options = {}) {
        const pick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            mesh => mesh.isPickable &&
                mesh.metadata?.terrainChunk === true
        );

        if (pick?.hit && pick.pickedPoint) {
            return (this.currentPlaneTransform ?? this.transform).renderToWorld({
                x: pick.pickedPoint.x,
                y: pick.pickedPoint.y,
                z: pick.pickedPoint.z
            });
        }
        if (options.groundFallback && this.editorCamera?.camera) {
            const ray = this.scene.createPickingRay(
                this.scene.pointerX, this.scene.pointerY,
                BABYLON.Matrix.Identity(), this.editorCamera.camera, false
            );
            const distance = ray.intersectsPlane(new BABYLON.Plane(0, 1, 0, 0));
            if (distance !== null && Number.isFinite(distance) && distance >= 0) {
                const point = ray.origin.add(ray.direction.scale(distance));
                return (this.currentPlaneTransform ?? this.transform).renderToWorld({
                    x: point.x, y: point.y, z: point.z
                });
            }
        }
        return null;
    }

    pointerDown() {
        // Room drawing by dragging is a retired legacy workflow. Placement
        // actions are single-click operations and are handled on pointer-up.
        this.startPoint = null;
    }

    pointerUp() {
        if (this.activeEditorTab === "planes" && this.activePlaneSubtab === "anomalies" && this.anomalyPlacementArmed) {
            this.placeArmedAnomalyMouth();
            return;
        }
        if (this.activeEditorTab === "planes" && this.planeEditor?.placementArmed) {
            const point = this.pickWorldPosition({ groundFallback: true });
            if (!point) {
                this.planeEditor.setStatus("No surface was hit. Try another point or enter XYZ numerically.");
                return;
            }
            this.planeEditor.placeAt(point);
            return;
        }
        if (this.activeEditorTab === "planes") {
            this.planeEditor?.pointerUp();
            return;
        }
        if (this.activeEditorTab !== "object-editor" || this.mode === "floor-plan") return;
        const point = this.pickWorldPosition();
        if (!point) return;
        if (this.mode === "door" || this.mode === "window") this.placeOpening(this.mode, point);
        if (this.mode === "furniture") this.placeFurniture(point);
    }



    placeOpening(type, point) {
        if (!this.activeBuilding || !this.selectedRoom) {
            this.setStatus("Create a room first.");
            return;
        }

        const building = this.activeBuilding;
        const bounds = this.selectedRoom.bounds;

        const x = point.x - building.position.x;
        const z = point.z - building.position.z;

        const distances = [
            { side: "north", distance: Math.abs(z - bounds.minZ),
                offset: (x - bounds.minX) /
                    (bounds.maxX - bounds.minX) },
            { side: "south", distance: Math.abs(z - bounds.maxZ),
                offset: (x - bounds.minX) /
                    (bounds.maxX - bounds.minX) },
            { side: "west", distance: Math.abs(x - bounds.minX),
                offset: (z - bounds.minZ) /
                    (bounds.maxZ - bounds.minZ) },
            { side: "east", distance: Math.abs(x - bounds.maxX),
                offset: (z - bounds.minZ) /
                    (bounds.maxZ - bounds.minZ) }
        ];

        distances.sort((a, b) => a.distance - b.distance);

        const nearest = distances[0];

        if (nearest.offset < 0 || nearest.offset > 1) {
            this.setStatus("Position is outside the selected wall.");
            return;
        }

        const opening = this.system.addOpening(
            building.id,
            this.selectedRoom.id,
            {
                type,
                side: nearest.side,
                offset: nearest.offset,
                width: type === "door" ? 0.9 : 1.4,
                height: type === "door" ? 2.1 : 1.2,
                sill: type === "door" ? 0 : 0.9
            }
        );

        this.setStatus(`Added ${type}: ${opening.id}`);
    }

    placeFurniture(position) {
        if (!this.activeBuilding) {
            this.setStatus("Create a building first.");
            return;
        }

        this.system.addFurniture(
            this.activeBuilding.id,
            {
                type: "table",
                position: {
                    x: position.x - this.activeBuilding.position.x,
                    y: position.y - this.activeBuilding.position.y + 0.5,
                    z: position.z - this.activeBuilding.position.z
                },
                dimensions: { x: 1.6, y: 0.9, z: 1 },
                material: "wood"
            }
        );

        this.setStatus("Furniture placed.");
    }

    refreshBuildingSelection() {
        const select = this.container?.querySelector('#building-select');
        if (!select) return;
        const selected = this.activeBuilding?.id ?? '';
        select.replaceChildren();
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'No building selected';
        select.append(empty);
        for (const building of this.system.buildings.values()) {
            const option = document.createElement('option');
            option.value = building.id;
            option.textContent = `${building.name} · ${building.id.slice(0, 8)}`;
            select.append(option);
        }
        select.value = selected;
    }

    selectBuilding(id) {
        const building = id ? this.system.getBuilding(id) : null;
        this.activeBuilding = building;
        this.selectedRoom = null;
        this.placement.select(building);
        if (building) {
            this.syncPositionInputs();
            this.attachBuildingGizmo(building);
            this.setStatus(`Selected ${building.name}. Move, rotate, or scale it with the viewport gizmo or numeric controls.`);
        } else {
            this.transformTools?.detach();
            this.setStatus('No building selected. Add a box building or construct one from a floor plan.');
        }
        this.refreshBuildingSelection();
    }

    attachBuildingGizmo(building) {
        if (!building || !this.transformTools) return;
        const render = this.transform.worldToRender(building.position);
        const rotation = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, building.rotation ?? 0);
        const scale = building.scale ?? { x: 1, y: 1, z: 1 };
        this.transformTools.attach(new BABYLON.Vector3(render.x, render.y, render.z), rotation,
            new BABYLON.Vector3(scale.x, scale.y, scale.z));
    }

    applyBuildingGizmoTransform(state) {
        const building = this.activeBuilding;
        if (!building || !state) return;
        const world = this.transform.renderToWorld({
            x: state.position.x, y: state.position.y, z: state.position.z
        });
        building.position = { x: world.x, y: world.y, z: world.z };
        if (state.mode === 'rotate') {
            const euler = state.rotation.toEulerAngles();
            building.rotation = euler.y;
        }
        if (state.mode === 'scale') {
            building.scale = {
                x: Math.max(0.01, state.scale.x),
                y: Math.max(0.01, state.scale.y),
                z: Math.max(0.01, state.scale.z)
            };
        }
        this.system.rebuild(building);
        this.syncPositionInputs();
        this.updateFloorPlanPosition();
        if (building.metadata?.editorPreview) this.previewRenderer.show(building);
    }

    syncPositionInputs() {
        if (!this.activeBuilding) return;

        const p = this.activeBuilding.position;
        const set = (id, value) => {
            this.container.querySelector(`#${id}`).value = value;
        };

        set("position-x", p.x);
        set("position-y", p.y);
        set("position-z", p.z);
        set(
            "position-rotation",
            this.activeBuilding.rotation * 180 / Math.PI
        );
        const scale = this.activeBuilding.scale ?? { x: 1, y: 1, z: 1 };
        set("scale-x", scale.x);
        set("scale-y", scale.y);
        set("scale-z", scale.z);
    }


updateFloorPlanPosition(dimensions = {}) {
    if (!this.activeBuilding) return;

    this.floorPlan.updateTransform(
        this.activeBuilding.position,
        dimensions,
        this.activeBuilding.rotation
    );
}

    dispose() {
        this.enabled = false;

        if (this.pointerObserver) {
            this.scene.onPointerObservable.remove(
                this.pointerObserver
            );
        }

        this.floorPlan.dispose();
        this.planeEditor?.dispose();
        this.anomalyTransformTools?.dispose();
        this.transformTools?.dispose();
        this.editorCamera.dispose();
	this.floorPlanHeightControl?.dispose();

        this.tabStyle?.remove();
        this.container?.remove();
        this.launcher?.remove();

        this.container = null;
        this.launcher = null;

	this.unsubscribeMode?.();
	this.previewRenderer?.dispose();
    }

worldToBuildingLocal(position) {
    const building = this.activeBuilding;
    const dx = position.x - building.position.x;
    const dz = position.z - building.position.z;

    const angle = building.rotation;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
        x: dx * cos + dz * sin,
        y: position.y - building.position.y,
        z: -dx * sin + dz * cos
    };
}


createBoxBuilding() {
    // A simple committed-geometry preview that exercises the complete
    // building transform path without requiring a floor-plan image.
    const building = this.system.createBuilding({
        name: "Box Building",
        position: {
            x: Number(this.container.querySelector("#position-x").value) || 0,
            y: Number(this.container.querySelector("#position-y").value) || 0,
            z: Number(this.container.querySelector("#position-z").value) || 0
        },
        rotation: (Number(this.container.querySelector("#position-rotation").value) || 0) * Math.PI / 180,
        components: [{
            kind: "furniture",
            type: "box",
            position: { x: 0, y: 1, z: 0 },
            dimensions: { x: 2, y: 2, z: 2 },
            rotation: 0,
            material: "furniture"
        }]
    });
    building.metadata ??= {};
    building.metadata.editorPreview = true;
    this.activeBuilding = building;
    this.placement.select(building);
    this.selectedRoom = null;
    this.syncPositionInputs();
    this.attachBuildingGizmo(building);
    this.previewRenderer.show(building);
    this.refreshBuildingSelection();
    this.placeButton.disabled = false;
    this.setStatus("Box building created (2 × 2 × 2). Select MOVE, ROTATE, or SCALE, then place it when ready.");
    return building;
}

ensureBuildingForFloorPlan() {
    if (this.activeBuilding) return;

    const element = id =>
        this.container.querySelector(`#${id}`);

    this.activeBuilding = this.system.createBuilding({
        name: "Floor Plan Building",
        position: {
            x: Number(element("position-x").value) || 0,
            y: Number(element("position-y").value) || 0,
            z: Number(element("position-z").value) || 0
        },
        rotation:
            Number(element("position-rotation").value || 0) *
            Math.PI / 180
    });
	this.activeBuilding.metadata ??= {};

this.activeBuilding.metadata.editorPreview = true;

    this.placement.select(this.activeBuilding);
    this.syncPositionInputs();
}

async buildFloorFromPlan() {
    try {
	if (!this.floorPlan.mesh || !this.floorPlan.image) {
    this.setStatus(
        "Import a floor-plan image before constructing a building."
    );

    return null;
}

        this.ensureBuildingForFloorPlan();

        const element = id =>
            this.container.querySelector(`#${id}`);

        const imageData = await this.floorPlan.readPixels();

        const result = this.floorPlanBuilder.build(
            this.activeBuilding,
            imageData,
            {
                width: Number(element("floor-width").value),
                depth: Number(element("floor-depth").value),
                floor: 0
            }
        );

        this.system.rebuild(this.activeBuilding);
	this.activeBuilding.metadata ??= {};

this.activeBuilding.metadata.editorPreview = true;

const outlineCount =
    this.previewRenderer.show(this.activeBuilding);

this.placeButton.disabled = false;

this.setStatus(
    `Preview ready: ${result.walls} walls, ` +
    `${result.doors} doors, ${result.windows} windows. ` +
    `${outlineCount} highlighted components. ` +
    `Adjust dimensions or place the building.`
);


        return result;
    } catch (error) {
        console.error("[BuildingEditor] Floor construction:", error);
        this.setStatus(error.message);
        return null;
    }
}


installFloorPlanWorkflowControls() {
    const buildButton =
        this.container.querySelector("#build-floor");

    const placeButton = document.createElement("button");

    placeButton.id = "place-building";
    placeButton.textContent =
        "PLACE BUILDING & START NEXT";

    placeButton.disabled = true;

    placeButton.style.width = "100%";
    placeButton.style.marginTop = "8px";

    buildButton.after(placeButton);

    placeButton.onclick = () => {
        this.placeCurrentBuilding();
    };

    this.placeButton = placeButton;

    const depthInput =
        this.container.querySelector("#floor-depth");

    const aspectLabel = document.createElement("label");

    aspectLabel.style.display = "block";
    aspectLabel.style.margin = "8px 0";

    this.aspectLock = document.createElement("input");
    this.aspectLock.type = "checkbox";
    this.aspectLock.checked = true;

    aspectLabel.append(
        this.aspectLock,
        document.createTextNode(
            " Maintain image aspect ratio"
        )
    );

    depthInput.parentElement.after(aspectLabel);

    const updateDimensions = source => {
        const width = Number(
            this.container.querySelector("#floor-width").value
        );

        let depth = Number(depthInput.value);

        if (
            this.aspectLock.checked &&
            this.floorPlan.image
        ) {
            if (source === "depth") {
                this.aspectLock.checked = false;
            } else {
                depth = width *
                    this.floorPlan.image.naturalHeight /
                    this.floorPlan.image.naturalWidth;

                depthInput.value = depth.toFixed(2);
            }
        }

        if (
            !Number.isFinite(width) ||
            !Number.isFinite(depth) ||
            width <= 0 ||
            depth <= 0
        ) {
            return;
        }

        this.updateFloorPlanPosition({
            width,
            depth
        });
if (
    this.activeBuilding?.metadata?.editorPreview === true &&
    this.floorPlan.mesh &&
    this.floorPlan.image
) {
    this.buildFloorFromPlan();
}
    };

    this.container.querySelector(
        "#floor-width"
    ).onchange = () => updateDimensions("width");

    depthInput.onchange = () => updateDimensions("depth");

    this.aspectLock.onchange = () => {
        updateDimensions("width");
    };
}

placeCurrentBuilding() {
    const building = this.activeBuilding;

    if (
        !building ||
        building.metadata?.editorPreview !== true
    ) {
        this.setStatus(
            "There is no provisional building to place."
        );
        return false;
    }

    // Commit the preview.
    this.previewRenderer.commit(building);

    building.metadata.editorPreview = false;

    this.system.refresh();

    // Release the current building selection.
    this.activeBuilding = null;
    this.selectedRoom = null;
    this.startPoint = null;
    this.refreshBuildingSelection();

    this.placement.select(null);
    this.transformTools?.detach();

    // Reset construction controls.
    this.placeButton.disabled = true;

    // Keep the previous image available as a reference,
    // but require an explicit new build operation.
    this.setStatus(
        "Building placed successfully. " +
        "Import another floor plan to construct the next building."
    );

    return true;
}



resetAfterWorldLoad() {
    this.activeBuilding = null;
    this.selectedRoom = null;
    this.startPoint = null;
    this.refreshBuildingSelection();

    this.placement.select(null);

    if (this.placeButton) {
        this.placeButton.disabled = true;
    }

    this.previewRenderer?.clear?.();

    this.setStatus(
        "World loaded. Select a construction tool to begin."
    );
}


}


/** Clamp mouse-derived render points to an invertible chart interior before picking. */
function renderToWorldForEditorPick(transform, position) {
    // Spherical inverse projection grows without bound as a pick approaches
    // the antipode. Keep mouse placement a little farther inside that chart;
    // Poincare only needs its established narrow edge epsilon.
    const boundaryMargin = transform?.geometryName === 'spherical' ? 0.05 : 1e-5;
    const safe = transform?.constrainRenderPosition?.(position, { boundaryMargin }) ?? position;
    return transform.renderToWorld(safe);
}

export { BuildingEditor };

