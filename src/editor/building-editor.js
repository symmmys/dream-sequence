
import { EditorCamera } from "./editor-camera.js";
import { BuildingPlacement } from "./building-placement.js";
import { FloorPlanReference } from "./floor-plan-reference.js";
import { FloorPlanBuilder } from "./floor-plan-builder.js";
import {
    FloorPlanHeightControl
} from "./floor-plan-height-control.js";
import {
    BuildingPreviewRenderer
} from "./building-preview-renderer.js";

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

        this.mode = "room";
        this.gridSize = 1;
        this.activeBuilding = null;
        this.selectedRoom = null;
        this.startPoint = null;
        this.enabled = false;

        this.createInterface();
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
            <h3>BUILDING EDITOR</h3>

<div style="display:grid;gap:7px">
    <button data-mode="room">DRAW ROOM</button>
    <button data-mode="door">ADD DOOR</button>
    <button data-mode="window">ADD WINDOW</button>
    <button data-mode="furniture">PLACE FURNITURE</button>
    <button data-mode="floor-plan">POSITION FLOOR PLAN</button>
</div>
            <hr>

            <h4>FLOOR PLAN</h4>
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

            <h4>BUILDING POSITION</h4>

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
        `;

        document.body.appendChild(this.container);

        this.status = this.container.querySelector(
            "#building-status"
        );

        this.container.querySelectorAll("[data-mode]")
            .forEach(button => {
                button.onclick = () => this.setMode(
                    button.dataset.mode
                );
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

        element("building-close").onclick = () => this.close();

        this.launcher = document.createElement("button");
        this.launcher.textContent = "BUILD";

        Object.assign(this.launcher.style, {
            position: "fixed",
            top: "18px",
            left: "18px",
            zIndex: "1601",
            padding: "12px 20px",
            cursor: "pointer"
        });

        this.launcher.onclick = () => this.open();
        document.body.appendChild(this.launcher);
    }

    setStatus(message) {
        this.status.textContent = message;
    }

    setMode(mode) {
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
    }

    close() {
        this.container.style.display = "none";
        this.enabled = false;
        this.startPoint = null;
        this.gameManager?.exitEditor();
    }

    snap(value) {
        return Math.round(value / this.gridSize) *
            this.gridSize;
    }

    pickWorldPosition() {
        const pick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            mesh => mesh.isPickable &&
                mesh.metadata?.terrainChunk === true
        );

        if (!pick?.hit || !pick.pickedPoint) return null;

        return this.transform.renderToWorld({
            x: pick.pickedPoint.x,
            y: pick.pickedPoint.y,
            z: pick.pickedPoint.z
        });
    }

    pointerDown() {
	    if (
    this.mode === "floor-plan" ||
    this.mode !== "room"
) {
    return;
}
        const point = this.pickWorldPosition();

        if (this.mode !== "room") return;

        if (!point) {
            this.setStatus("Cannot pick terrain.");
            return;
        }

        this.startPoint = point;
        this.setStatus("Drag to define the room footprint.");
    }

    pointerUp() {
	if (this.mode === "floor-plan") {
    return;
}
        const point = this.pickWorldPosition();

        if (!point) {
            if (this.startPoint) {
                this.startPoint = null;
                this.setStatus("No surface detected.");
            }
            return;
        }

        if (this.mode === "room") {
            if (!this.startPoint) return;

            const start = this.startPoint;
            this.startPoint = null;

            try {
                this.createRoomFromPoints(start, point);
            } catch (error) {
                console.error("[BuildingEditor]", error);
                this.setStatus(error.message);
            }

            return;
        }

        if (this.mode === "door" || this.mode === "window") {
            this.placeOpening(this.mode, point);
        }

        if (this.mode === "furniture") {
            this.placeFurniture(point);
        }
    }


createRoomFromPoints(a, b) {
    const minX = this.snap(Math.min(a.x, b.x));
    const maxX = this.snap(Math.max(a.x, b.x));
    const minZ = this.snap(Math.min(a.z, b.z));
    const maxZ = this.snap(Math.max(a.z, b.z));

    if (
        maxX - minX < this.gridSize ||
        maxZ - minZ < this.gridSize
    ) {
        this.setStatus("Room is too small.");
        return;
    }

    // -----------------------------------------
    // VALIDATE ACTIVE BUILDING REGISTRATION
    // -----------------------------------------

    let building = this.activeBuilding;

    if (building) {
        const registered = this.system.getBuilding(
            building.id
        );

        if (registered) {
            // Adopt the authoritative registered instance.
            building = registered;
            this.activeBuilding = registered;
        } else {
            // The building was removed, possibly by
            // restoring another world.
            console.warn(
                "[BuildingEditor] Active building is no longer registered.",
                building.id
            );

            this.activeBuilding = null;
            this.selectedRoom = null;

            this.placement.select(null);

            building = null;
        }
    }

    // -----------------------------------------
    // CREATE BUILDING IF NECESSARY
    // -----------------------------------------

    if (!building) {
        building = this.system.createBuilding({
            name: "My Building",
            position: {
                x: minX,
                y: a.y,
                z: minZ
            }
        });

        this.activeBuilding = building;

        this.placement.select(building);
        this.syncPositionInputs();
    }

    // -----------------------------------------
    // CREATE ROOM
    // -----------------------------------------

    // Final registration invariant.
    if (
        this.system.getBuilding(building.id) !== building
    ) {
        throw new Error(
            "Building registration mismatch."
        );
    }

    const room = this.system.createRoom(
        building.id,
        {
            name: `Room ${building.rooms.length + 1}`,

            minX: minX - building.position.x,
            maxX: maxX - building.position.x,

            minZ: minZ - building.position.z,
            maxZ: maxZ - building.position.z
        }
    );

    this.selectedRoom = room;

    this.updateFloorPlanPosition();

    this.setStatus(
        `Created ${room.name}: ` +
        `${maxX - minX} × ${maxZ - minZ}`
    );
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
        this.editorCamera.dispose();
	this.floorPlanHeightControl?.dispose();

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

    this.placement.select(null);

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

export { BuildingEditor };

