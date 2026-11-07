
import { DnDCharacter } from "./dnd-character.js";
import { DnDBattle } from "./dnd-battle.js";
import { DnDActionRegistry } from "./dnd-action-registry.js";
import { DnDTacticalUI } from "./dnd-tactical-ui.js";

const GRID_SETTINGS_KEY = "somnium-dnd-grid-settings";
const MIN_GRID_DIMENSION = 2;
const MAX_GRID_DIMENSION = 300;
const MIN_CELL_SIZE = 0.5;
const MAX_CELL_SIZE = 1000;
const INITIAL_CAMERA_RADIUS = 30;
const FOCUS_CAMERA_RADIUS_FACTOR = 2;
const MIN_CAMERA_RADIUS = 8;
const MAX_CHARACTER_ALTITUDE = 1000;
const CHARACTER_MODEL_DIAMETER = 0.8;
const REPLAY_STEP_DELAY = 450;

function resolveDelay(milliseconds, resolve) {
    setTimeout(resolve, milliseconds);
}

function waitFor(milliseconds) {
    return new Promise(resolveDelay.bind(null, milliseconds));
}

function serializeBattle(battle) {
    return battle.toJSON();
}

function serializeCharacter(character) {
    return character.toJSON();
}

function restoreBattle(data) {
    return DnDBattle.fromJSON(data);
}

function isMovementAction(action) {
    return action.type === "move";
}

function isMatchingCharacter(character, candidate) {
    return candidate.id === character.id;
}

class DnDMode {
    constructor(scene, terrain, spatialTransform) {
        this.initializeDomainState(scene, terrain, spatialTransform);
        this.initializeRenderingState();
        this.initializeRuntimeState(scene);
        this.restoreGridOriginPreference();
        this.restoreGridConfiguration();
        this.initializeBattlefield();
        this.restoreBattles();
        this.logRestorationSummary();
        this.initializeTacticalInterface();
        this.bindSceneInput();
        this.refreshUI();
    }

    initializeDomainState(scene, terrain, spatialTransform) {
        this.scene = scene;
        this.terrain = terrain;
        this.transform = spatialTransform;
        this.characters = new Map();
        this.battles = [];
        this.activeBattle = null;
        this.selectedCharacter = null;
        this.gridRows = 20;
        this.gridColumns = 20;
        this.cellSize = 10;
        this.maxGridRows = MAX_GRID_DIMENSION;
        this.maxGridColumns = MAX_GRID_DIMENSION;
        this.gridOrigin = { x: -100, z: -100 };
    }

    initializeRenderingState() {
        this.gridMeshes = [];
        this.characterMeshes = new Map();
        this.movementMeshes = [];
        this.movementPreview = false;
        this.movementColors = { movement: "#25d9a0", dash: "#e9a33c" };
        this.movementMaterials = {};
        this.targetMovementMesh = null;
        this.hoveredMovementCell = null;
        this.initializeMovementTargetMaterial();
    }

    initializeMovementTargetMaterial() {
        this.targetMovementMaterial = new BABYLON.StandardMaterial(
            "dnd-movement-target-material",
            this.scene
        );
        this.targetMovementMaterial.diffuseColor = new BABYLON.Color3(0.15, 0.55, 1.0);
        this.targetMovementMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.35, 0.9);
        this.targetMovementMaterial.alpha = 0.3;
        this.targetMovementMaterial.disableLighting = true;
        this.targetMovementMaterial.backFaceCulling = false;
    }

    initializeRuntimeState(scene) {
        this.disposed = false;
        this.replaying = false;
        this.gamepadState = new Map();
        this.gamepadDeadzone = 0.5;
        this.gamepadRepeatDelay = 180;
        this.lastGamepadNavigation = 0;
        this.actionRegistry = new DnDActionRegistry();
        this.registerDefaultActionHandlers();
        this.previousCamera = scene.activeCamera;
        this.camera = null;
    }

    restoreGridOriginPreference() {
        try {
            const savedOrigin = JSON.parse(
                localStorage.getItem("somnium-dnd-grid-origin") || "null"
            );
            if (this.isValidGridOrigin(savedOrigin?.x, savedOrigin?.z)) {
                this.gridOrigin = savedOrigin;
            }
        } catch (error) {
            console.warn("[DnD] Unable to restore grid origin.", error);
        }
    }

    initializeBattlefield() {
        this.createMovementMaterials();
        this.createCamera();
        this.createGrid();
    }

    logRestorationSummary() {
        console.info(
            "[DnD] Character restoration complete:",
            this.characters.size,
            "characters"
        );
    }

    initializeTacticalInterface() {
        try {
            this.createUI();
            console.info("[DnD] Tactical UI initialized.");
        } catch (error) {
            this.handleInterfaceInitializationFailure(error);
        }
    }

    handleInterfaceInitializationFailure(error) {
        console.error("[DnD] Tactical UI initialization failed:", error);
        this.ui = null;
        this.panel = null;
    }

    bindSceneInput() {
        this.onKeyDown = this.handleKeyDown.bind(this);
        this.onPointerObservable = this.handlePointerObservable.bind(this);
        this.scene.onPointerObservable.add(this.onPointerObservable);
        this.onGamepadUpdate = this.updateGamepad.bind(this);
        this.gamepadObserver = this.scene.onBeforeRenderObservable.add(
            this.onGamepadUpdate
        );
    }

    handleKeyDown(event) {
        if (this.disposed) return;
        if (this.isFormInput(event.target)) return;

        if (event.code === "ArrowLeft") {
            event.preventDefault();
            this.selectAdjacentCharacter(-1);
        }

        if (event.code === "ArrowRight") {
            event.preventDefault();
            this.selectAdjacentCharacter(1);
        }
    }

    isFormInput(target) {
        return (
            target instanceof HTMLElement &&
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        );
    }

    handlePointerObservable(pointerInfo) {
        if (this.disposed) return;

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
            this.handleMovementPointerMove();
            return;
        }

        if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERPICK) {
            this.handlePointerPick();
        }
    }

    isMovementCellMesh(mesh) {
        return Boolean(mesh.metadata?.dndMovementCell);
    }

    isSelectableBattlefieldMesh(mesh) {
        return Boolean(
            mesh.metadata?.dndMovementCell ||
            mesh.metadata?.dndCharacterId
        );
    }

    handleMovementPointerMove() {
        if (!this.movementPreview) {
            this.setTargetMovementCell(null);
            return;
        }

        const pick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            this.isMovementCellMesh.bind(this),
            false,
            this.camera
        );

        const cell = pick?.hit
            ? pick.pickedMesh?.metadata?.dndMovementCell
            : null;

        this.setTargetMovementCell(cell || null);
    }

    handlePointerPick() {
        const pick = this.scene.pick(
            this.scene.pointerX,
            this.scene.pointerY,
            this.isSelectableBattlefieldMesh.bind(this),
            false,
            this.camera
        );

        if (!pick?.hit || !pick.pickedMesh) return;

        const movementCell =
            pick.pickedMesh.metadata?.dndMovementCell;

        if (movementCell && this.movementPreview) {
            this.handleMovementCellPick(movementCell);
            return;
        }

        const characterId = pick.pickedMesh.metadata?.dndCharacterId;

        if (characterId) this.selectCharacter(characterId);
    }

    handleMovementCellPick(cell) {
        const character = this.getActiveCharacter();
        if (!character) return;

        try {
            this.moveCharacter(character, cell.row, cell.col, cell.type);
            this.setTargetMovementCell(null);
        } catch (error) {
            this.showMessage(error.message);
        }
    }

    createMovementMaterials() {
        for (const type of ["movement", "dash"]) {
            const material = new BABYLON.StandardMaterial(
                `dnd-${type}-range-material`,
                this.scene
            );

            const color = BABYLON.Color3.FromHexString(
                this.movementColors[type]
            );

            material.diffuseColor = color;

            material.emissiveColor = color.scale(0.65);

            // More transparent battlefield overlays.
            material.alpha = 0.22;

            material.disableLighting = true;
            material.backFaceCulling = false;

            // Keep overlays visible without depth-writing.
            material.needDepthPrePass = true;

            this.movementMaterials[type] = material;
        }
    }

    setMovementColors(colors) {
        for (const type of ["movement", "dash"]) {
            if (!/^#[0-9a-f]{6}$/i.test(colors[type] || "")) {
                continue;
            }

            this.movementColors[type] = colors[type];

            const color = BABYLON.Color3.FromHexString(
                colors[type]
            );

            const material = this.movementMaterials[type];

            material.diffuseColor = color;
            material.emissiveColor = color.scale(0.55);
        }

        if (this.movementPreview) {
            this.refreshMovementPreview();
        }
    }

    restoreGridConfiguration() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(GRID_SETTINGS_KEY) || "null"
            );

            if (!saved || typeof saved !== "object") return;

            // Accept both the current rectangular schema and legacy saves.
            const rows = saved.rows ?? saved.gridRows ?? saved.gridSize;
            const columns = saved.columns ?? saved.gridColumns ?? saved.gridSize;
            const cellSize = saved.cellSize ?? this.cellSize;

            if (
                !this.validateGridDimensions(rows, columns) ||
                !this.isValidCellSize(cellSize)
            ) {
                console.warn(
                    "[DnD] Ignoring invalid saved grid configuration."
                );
                return;
            }

            this.gridRows = rows;
            this.gridColumns = columns;
            this.cellSize = cellSize;
        } catch (error) {
            console.warn(
                "[DnD] Unable to restore grid configuration.",
                error
            );
        }
    }

    saveGridConfiguration() {
        try {
            localStorage.setItem(
                GRID_SETTINGS_KEY,
                JSON.stringify({
                    version: 2,
                    rows: this.gridRows,
                    columns: this.gridColumns,
                    cellSize: this.cellSize
                })
            );
            return true;
        } catch (error) {
            console.warn(
                "[DnD] Grid configuration could not be persisted.",
                error
            );
            return false;
        }
    }

    createCamera() {
        const canvas =
            this.scene.getEngine().getRenderingCanvas();

        this.camera = new BABYLON.ArcRotateCamera(
            "dndTacticalCamera",
            -Math.PI / 2,
            Math.PI / 3,
            BABYLON.Scalar.Clamp(
                this.cellSize * 3,
                MIN_CAMERA_RADIUS * 2,
                INITIAL_CAMERA_RADIUS
            ),
            BABYLON.Vector3.Zero(),
            this.scene
        );

        this.camera.lowerRadiusLimit = MIN_CAMERA_RADIUS;
        this.camera.upperRadiusLimit = 1500;
        this.camera.wheelPrecision = 30;

        this.camera.panningSensibility = 0;
        this.camera.inertia = 0.8;

        this.camera.attachControl(canvas, true);

        this.scene.activeCamera = this.camera;

        this.centerCameraOnActiveCharacter();
    }

    getCameraFocusCharacter() {
        return this.getActiveCharacter() || this.selectedCharacter;
    }

    centerCameraOnActiveCharacter() {
        if (!this.camera) return false;
        const character = this.getCameraFocusCharacter();
        if (character) return this.centerCameraOnCharacter(character);
        return this.centerCameraOnGridCenter();
    }

    centerCameraOnGridCenter() {
        const row = (this.gridRows - 1) / 2;
        const col = (this.gridColumns - 1) / 2;
        const position = this.samplePosition(row, col);
        const projected = this.transform.worldToRender({
            x: position.x,
            y: position.y + 1,
            z: position.z
        });
        this.camera.setTarget(new BABYLON.Vector3(
            projected.x,
            projected.y,
            projected.z
        ));
        return true;
    }

    centerCameraOnSelectedCharacter() {
        if (!this.selectedCharacter || !this.camera) return false;
        return this.centerCameraOnCharacter(this.selectedCharacter);
    }

    centerCameraOnCharacter(character) {
        if (!character || !this.camera) return false;

        const meshes = this.characterMeshes.get(character.id);
        if (!meshes) return false;

        this.syncCharacter(character);
        const target = meshes.root.position.add(
            new BABYLON.Vector3(0, 1, 0)
        );
        this.camera.setTarget(target);
        return true;
    }

    zoomToActiveCharacter() {
        const character = this.getCameraFocusCharacter();

        if (!character || !this.camera) {
            this.showMessage("Select a character or start a battle first.");
            return false;
        }

        this.centerCameraOnCharacter(character);
        this.clearCameraInertia();
        this.camera.lowerRadiusLimit = MIN_CAMERA_RADIUS;
        this.camera.radius = BABYLON.Scalar.Clamp(
            this.cellSize * FOCUS_CAMERA_RADIUS_FACTOR,
            MIN_CAMERA_RADIUS,
            32
        );

        return true;
    }

    clearCameraInertia() {
        if (!this.camera) return;

        this.camera.inertialRadiusOffset = 0;
        this.camera.inertialAlphaOffset = 0;
        this.camera.inertialBetaOffset = 0;
        this.camera.inertialPanningX = 0;
        this.camera.inertialPanningY = 0;
    }

    // Retained for compatibility with earlier UI integrations.
    zoomToGrid() {
        return this.zoomToActiveCharacter();
    }

    worldPosition(row, col) {
        return {
            x: this.gridOrigin.x + (col + 0.5) * this.cellSize,
            z: this.gridOrigin.z + (row + 0.5) * this.cellSize
        };
    }

    samplePosition(row, col) {
        const position = this.worldPosition(row, col);

        const sample = this.terrain.sampleAt(
            position.x,
            position.z
        );

        if (!sample) {
            throw new Error(
                "Unable to sample battlefield terrain."
            );
        }

        return {
            ...position,
            y: sample.y,
            row,
            col
        };
    }

    projectTerrainPoint(point) {
        const sample = this.terrain.sampleAt(
            point.x,
            point.z
        );

        if (!sample) return null;

        const projected = this.transform.worldToRender({
            x: point.x,
            y: sample.y + 0.5,
            z: point.z
        });

        return new BABYLON.Vector3(
            projected.x,
            projected.y,
            projected.z
        );
    }

    createGrid() {
        this.disposeGridMeshes();

        const largeGrid =
            this.gridRows * this.gridColumns > 10000;

        const divisions = largeGrid
            ? 1
            : Math.min(
                6,
                Math.max(2, Math.ceil(this.cellSize / 2))
            );

        const horizontalExtent =
            this.gridColumns * this.cellSize;

        const verticalExtent =
            this.gridRows * this.cellSize;

        this.createGridAxis({
            count: this.gridColumns,
            subdivisions: divisions,
            fixedAxis: "x",
            extent: verticalExtent
        });

        this.createGridAxis({
            count: this.gridRows,
            subdivisions: divisions,
            fixedAxis: "z",
            extent: horizontalExtent
        });
    }

    createGridAxis({
        count,
        subdivisions,
        fixedAxis,
        extent
    }) {
        for (let index = 0; index <= count; index++) {
            const offset = index * this.cellSize;
            const points = [];

            for (
                let step = 0;
                step <= subdivisions *
                    Math.ceil(extent / this.cellSize);
                step++
            ) {
                const distance =
                    Math.min(
                        step * this.cellSize / subdivisions,
                        extent
                    );

                const worldPoint = fixedAxis === "x"
                    ? {
                        x: this.gridOrigin.x + offset,
                        z: this.gridOrigin.z + distance
                    }
                    : {
                        x: this.gridOrigin.x + distance,
                        z: this.gridOrigin.z + offset
                    };

                const projected =
                    this.projectTerrainPoint(worldPoint);

                if (!projected) {
                    points.length = 0;
                    break;
                }

                points.push(projected);
            }

            if (points.length > 1) {
                this.createGridLine(points);
            }
        }
    }

    createGridLine(points) {
        const mesh = BABYLON.MeshBuilder.CreateLines(
            "dndGridLine",
            { points },
            this.scene
        );

        mesh.color = new BABYLON.Color3(
            0.3, 0.8, 0.95
        );

        mesh.alpha = 0.65;
        mesh.isPickable = false;

        this.gridMeshes.push(mesh);
    }

    disposeGridMeshes() {
        for (const mesh of this.gridMeshes) {
            mesh.dispose();
        }

        this.gridMeshes = [];
    }

    moveGrid(dx, dz) {
        if (
            !Number.isFinite(dx) ||
            !Number.isFinite(dz)
        ) return false;

        return this.setGridOrigin(
            this.gridOrigin.x + dx,
            this.gridOrigin.z + dz
        );
    }

    setGridOrigin(x, z) {
        if (!this.isValidGridOrigin(x, z)) return this.rejectGridOrigin();
        const previous = this.captureGridOriginState();
        try {
            this.applyGridOrigin({ x, z }, previous);
            return true;
        } catch (error) {
            this.rollbackGridOrigin(previous);
            return this.reportGridOriginError(error);
        }
    }

    isValidGridOrigin(x, z) {
        return Number.isSafeInteger(x) && Number.isSafeInteger(z);
    }

    rejectGridOrigin() {
        this.showMessage("Grid coordinates must be integers.");
        return false;
    }

    captureGridOriginState() {
        return {
            origin: { ...this.gridOrigin },
            camera: this.captureCameraOrbit()
        };
    }

    captureCameraOrbit() {
        if (!this.camera) return null;
        return {
            radius: this.camera.radius,
            alpha: this.camera.alpha,
            beta: this.camera.beta
        };
    }

    applyGridOrigin(origin, previous) {
        this.validateGridOriginTerrain(origin);
        this.gridOrigin = origin;
        this.validateCharactersAtGridOrigin();
        this.createGrid();
        this.syncAllCharacters();
        this.persistGridOrigin();
        this.recenterCameraPreservingOrbit(previous.camera);
        this.refreshGridDependents();
    }

    validateGridOriginTerrain(origin) {
        const valid = this.validateTerrainCoverage(
            this.gridRows,
            this.gridColumns,
            this.cellSize,
            origin
        );
        if (!valid) throw new Error(
            "The requested grid exceeds available terrain."
        );
    }

    validateCharactersAtGridOrigin() {
        for (const character of this.characters.values()) {
            this.samplePosition(
                character.position.row,
                character.position.col
            );
        }
    }

    persistGridOrigin() {
        try {
            localStorage.setItem(
                "somnium-dnd-grid-origin",
                JSON.stringify(this.gridOrigin)
            );
        } catch (error) {
            console.warn("[DnD] Grid origin could not be persisted.", error);
        }
    }

    refreshGridDependents() {
        this.refreshMovementPreview();
        this.saveCharacters();
        this.refreshUI();
    }

    rollbackGridOrigin(previous) {
        this.gridOrigin = previous.origin;
        this.createGrid();
        this.syncAllCharacters();
        this.recenterCameraPreservingOrbit(previous.camera);
    }

    recenterCameraPreservingOrbit(cameraState) {
        if (!this.camera || !cameraState) return;
        this.centerCameraOnActiveCharacter();
        this.restoreCameraOrbit(cameraState);
    }

    reportGridOriginError(error) {
        console.warn("[DnD] Grid repositioning rejected.", error);
        this.showMessage(error.message);
        return false;
    }

    addCharacter(name, row, col) {
        const position = this.samplePosition(row, col);

        const character = new DnDCharacter({
            name,
            position
        });

        this.characters.set(character.id, character);

        this.createCharacterMesh(character);
        this.syncAllCharacters();
        this.selectCharacter(character.id);

        this.saveCharacters();

        return character;
    }

    createCharacterMesh(character) {
        const meshes = this.createCharacterGeometry(character);
        this.assignCharacterMaterials(meshes, character.id);
        this.configureCharacterPicking(meshes, character.id);
        this.characterMeshes.set(character.id, meshes);
        this.syncCharacter(character);
    }

    createCharacterGeometry(character) {
        const root = new BABYLON.TransformNode(
            `dnd-character-${character.id}`,
            this.scene
        );
        return {
            root,
            body: this.createCharacterBody(character.id, root),
            head: this.createCharacterHead(character.id, root)
        };
    }

    createCharacterBody(characterId, root) {
        const body = BABYLON.MeshBuilder.CreateCapsule(
            `dnd-body-${characterId}`,
            { height: 1.8, radius: 0.35 },
            this.scene
        );
        body.parent = root;
        body.position.y = 0.9;
        return body;
    }

    createCharacterHead(characterId, root) {
        const head = BABYLON.MeshBuilder.CreateSphere(
            `dnd-head-${characterId}`,
            { diameter: 0.48 },
            this.scene
        );
        head.parent = root;
        head.position.y = 1.95;
        return head;
    }

    assignCharacterMaterials(meshes, characterId) {
        meshes.material = this.createCharacterMaterial(
            `dnd-material-${characterId}`,
            new BABYLON.Color3(0.2, 0.65, 0.9)
        );
        meshes.headMaterial = this.createCharacterMaterial(
            `dnd-head-material-${characterId}`,
            new BABYLON.Color3(0.82, 0.69, 0.55)
        );
        meshes.body.material = meshes.material;
        meshes.head.material = meshes.headMaterial;
    }

    createCharacterMaterial(name, color) {
        const material = new BABYLON.StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        return material;
    }

    configureCharacterPicking(meshes, characterId) {
        meshes.body.metadata = { dndCharacterId: characterId };
        meshes.head.metadata = { dndCharacterId: characterId };
        meshes.body.isPickable = true;
        meshes.head.isPickable = true;
    }

    syncCharacter(character) {
        const meshes = this.characterMeshes.get(character.id);
        if (!meshes) return;

        const layout = this.getCharacterCellLayout(character);
        const position = this.getCharacterWorldPosition(character, layout);
        const projected = this.transform.worldToRender(position);

        this.updateCharacterPosition(character, position);
        this.updateCharacterMeshTransform(meshes, projected, layout);
    }

    getCharacterWorldPosition(character, layout) {
        const center = this.samplePosition(
            character.position.row,
            character.position.col
        );
        const x = center.x + layout.offsetX;
        const z = center.z + layout.offsetZ;
        const sample = this.terrain.sampleAt(x, z);
        if (!sample) throw new Error("Unable to sample character terrain.");

        return {
            x,
            y: sample.y + this.getCharacterAltitude(character),
            z
        };
    }

    getCharacterCellLayout(character) {
        const occupants = this.getCellOccupants(
            character.position.row,
            character.position.col
        );
        if (occupants.length <= 1) return this.getCenteredCharacterLayout();

        const index = this.getCharacterOccupancyIndex(occupants, character);
        return this.createCharacterFormationLayout(index, occupants.length);
    }

    getCenteredCharacterLayout() {
        return { offsetX: 0, offsetZ: 0, scale: 1 };
    }

    getCharacterOccupancyIndex(occupants, character) {
        return Math.max(0, occupants.findIndex(
            isMatchingCharacter.bind(null, character)
        ));
    }

    createCharacterFormationLayout(index, count) {
        const radius = this.getCharacterFormationRadius(count);
        const angle = (Math.PI * 2 * index) / count;
        const spacing = 2 * radius * Math.sin(Math.PI / count);
        const boundaryDiameter = this.cellSize - 2 * radius;
        const scale = this.getCharacterFormationScale(
            spacing,
            boundaryDiameter
        );

        return {
            offsetX: Math.cos(angle) * radius,
            offsetZ: Math.sin(angle) * radius,
            scale
        };
    }

    getCharacterFormationRadius(count) {
        const requiredRadius = CHARACTER_MODEL_DIAMETER /
            (2 * Math.sin(Math.PI / count));
        return Math.min(this.cellSize * 0.25, requiredRadius);
    }

    getCharacterFormationScale(spacing, boundaryDiameter) {
        return Math.min(
            1,
            spacing / CHARACTER_MODEL_DIAMETER,
            boundaryDiameter / CHARACTER_MODEL_DIAMETER
        );
    }

    getCellOccupants(row, col) {
        const occupants = [];
        for (const character of this.characters.values()) {
            if (
                character.position.row === row &&
                character.position.col === col
            ) {
                occupants.push(character);
            }
        }
        return occupants;
    }

    getCharacterAltitude(character) {
        const altitude = character.position.altitude;
        if (!Number.isFinite(altitude)) return 0;
        return Math.min(MAX_CHARACTER_ALTITUDE, Math.max(0, altitude));
    }

    updateCharacterPosition(character, position) {
        character.position.x = position.x;
        character.position.y = position.y;
        character.position.z = position.z;
        character.position.altitude = this.getCharacterAltitude(character);
    }

    updateCharacterMeshTransform(meshes, projected, layout) {
        meshes.root.position.set(projected.x, projected.y, projected.z);
        meshes.root.scaling.set(layout.scale, layout.scale, layout.scale);
    }

    setCharacterAltitude(character, altitude) {
        this.validateCharacterAltitude(character, altitude);
        character.position.altitude = altitude;
        this.syncCharacter(character);
        this.saveCharacters();
        this.refreshUI();
        return true;
    }

    validateCharacterAltitude(character, altitude) {
        if (!this.characters.has(character?.id)) {
            throw new Error("Select a character before changing altitude.");
        }
        if (
            !Number.isFinite(altitude) ||
            altitude < 0 ||
            altitude > MAX_CHARACTER_ALTITUDE
        ) {
            throw new Error(`Altitude must be between 0 and ${MAX_CHARACTER_ALTITUDE} world units.`);
        }
    }

    removeCharacter(characterId) {
        const character = this.characters.get(characterId);
        if (!character) return false;
        this.validateCharacterRemoval(characterId);
        this.disposeCharacterMeshes(characterId);
        this.characters.delete(characterId);
        this.clearCharacterSelection(characterId);
        this.syncAllCharacters();
        this.updateCharacterHighlight();
        this.saveCharacters();
        this.refreshUI();
        return true;
    }

    validateCharacterRemoval(characterId) {
        if (this.activeBattle?.characterIds.includes(characterId)) {
            throw new Error("Cannot remove a character participating in the active battle.");
        }
    }

    disposeCharacterMeshes(characterId) {
        const meshes = this.characterMeshes.get(characterId);
        if (!meshes) return;
        meshes.root.dispose(false, true);
        meshes.material.dispose();
        meshes.headMaterial.dispose();
        this.characterMeshes.delete(characterId);
    }

    clearCharacterSelection(characterId) {
        if (this.selectedCharacter?.id === characterId) {
            this.selectedCharacter = null;
        }
    }

    updateCharacterHighlight() {
        for (const [id, meshes] of this.characterMeshes) {
            const selected =
                id === this.selectedCharacter?.id;

            meshes.material.diffuseColor = selected
                ? new BABYLON.Color3(1, 0.78, 0.15)
                : new BABYLON.Color3(0.2, 0.65, 0.9);

            meshes.material.emissiveColor = selected
                ? new BABYLON.Color3(0.25, 0.12, 0)
                : BABYLON.Color3.Black();
        }
    }

    selectCharacter(id) {
        const character = this.characters.get(id);

        if (!character) return;

        this.selectedCharacter = character;

        this.updateCharacterHighlight();

        if (!this.activeBattle) {
            this.centerCameraOnActiveCharacter();
        }

        this.refreshMovementPreview();
        this.refreshUI();
    }

    selectAdjacentCharacter(direction) {
        const characters = [...this.characters.values()];

        if (!characters.length) return;

        let index = -1;
        for (let cursor = 0; cursor < characters.length; cursor++) {
            if (characters[cursor].id === this.selectedCharacter?.id) {
                index = cursor;
                break;
            }
        }

        index = index < 0
            ? 0
            : (index + direction + characters.length) %
                characters.length;

        this.selectCharacter(characters[index].id);
    }

    updateGamepad() {
        if (this.disposed) return;

        const gamepads = navigator.getGamepads?.();

        if (!gamepads) return;

        for (const gamepad of gamepads) {
            if (!gamepad || !gamepad.connected) continue;

            const left = gamepad.buttons[14]?.pressed;
            const right = gamepad.buttons[15]?.pressed;

            const shoulderLeft =
                gamepad.buttons[4]?.pressed;

            const shoulderRight =
                gamepad.buttons[5]?.pressed;

            const axis = gamepad.axes[0] || 0;

            const direction =
                left || shoulderLeft ||
                axis < -this.gamepadDeadzone
                    ? -1
                    : right || shoulderRight ||
                        axis > this.gamepadDeadzone
                        ? 1
                        : 0;

            const previous =
                this.gamepadState.get(gamepad.index) || 0;

            const now = performance.now();

            if (
                direction !== 0 &&
                (
                    direction !== previous ||
                    now - this.lastGamepadNavigation >
                        this.gamepadRepeatDelay
                )
            ) {
                this.selectAdjacentCharacter(direction);
                this.lastGamepadNavigation = now;
            }

            this.gamepadState.set(
                gamepad.index,
                direction
            );
        }
    }

    startBattle() {
        if (this.activeBattle?.active) {
            this.showMessage("A battle is already in progress.");
            return;
        }

        if (!this.characters.size) {
            this.showMessage(
                "Add characters before starting a battle."
            );
            return;
        }

        const battle = new DnDBattle({
            name: `Battle ${this.battles.length + 1}`,
            characterIds: [...this.characters.keys()]
        });

        battle.start([...this.characters.values()]);

        this.activeBattle = battle;
        this.battles.push(battle);

        this.setMovementPreview(false);
        this.selectCharacter(battle.activeCharacterId);
        this.centerCameraOnActiveCharacter();

        this.saveBattle();
        this.refreshUI();
    }

    advanceTurn() {
        if (!this.activeBattle?.active) return;

        this.setMovementPreview(false);

        this.activeBattle.advanceTurn();

        const activeId =
            this.activeBattle.activeCharacterId;

        this.selectCharacter(activeId);
        this.centerCameraOnActiveCharacter();

        this.saveBattle();
        this.refreshUI();
    }

    endBattle() {
        if (!this.activeBattle) return;

        this.setMovementPreview(false);

        this.activeBattle.stop();
        this.saveBattle();

        this.activeBattle = null;

        this.refreshUI();
        this.centerCameraOnActiveCharacter();
    }

    moveCharacter(character, row, col, movementType = null) {
        this.validateMovementRequest(character, row, col);
        const destination = this.createMovementDestination(
            character,
            row,
            col,
            movementType
        );
        this.activeBattle.move(
            character,
            destination.position,
            destination.distance
        );
        this.completeCharacterMovement();
    }

    validateMovementRequest(character, row, col) {
        if (!this.activeBattle?.active) {
            throw new Error("Start a battle first.");
        }
        this.activeBattle.assertActiveCharacter(character);
        this.validateMovementCoordinates(row, col);
    }

    validateMovementCoordinates(row, col) {
        const valid = Number.isInteger(row) &&
            Number.isInteger(col) &&
            row >= 0 && col >= 0 &&
            this.isValidGridCoordinate(row, col);
        if (!valid) throw new Error("Invalid grid coordinates.");
    }

    createMovementDestination(character, row, col, movementType) {
        const position = this.samplePosition(row, col);
        position.altitude = this.getCharacterAltitude(character);
        const distance = this.getMovementDistance(character, row, col);
        this.consumeDashWhenRequired(character, distance, movementType);
        return { position, distance };
    }

    completeCharacterMovement() {
        this.syncAllCharacters();
        this.centerCameraOnActiveCharacter();
        this.saveBattle();
        this.refreshMovementPreview();
        this.refreshUI();
    }

    getMovementDistance(character, row, col) {
        const rowDistance = Math.abs(row - character.position.row);
        const columnDistance = Math.abs(col - character.position.col);
        return (rowDistance + columnDistance) * this.cellSize;
    }

    consumeDashWhenRequired(character, distance, movementType = null) {
        const resources = this.activeBattle.currentResources;
        const baseRemaining = character.movement - resources.movementUsed;
        const selectedDashRegion = movementType === "dash";
        if (
            (!selectedDashRegion && distance <= baseRemaining) ||
            resources.dashUsed
        ) return;
        this.validateDashAvailability(character, distance, resources);
        this.activeBattle.useAction(character, { description: "Dash" });
    }

    validateDashAvailability(character, distance, resources) {
        if (resources.actionUsed) {
            throw new Error("Dash requires an unused action.");
        }
        const dashAllowance = character.movement * 2 - resources.movementUsed;
        if (distance > dashAllowance) {
            throw new Error("Movement exceeds the Dash allowance.");
        }
    }

    getActiveCharacter() {
        if (!this.activeBattle?.active) return null;

        return this.characters.get(
            this.activeBattle.activeCharacterId
        ) || null;
    }

    
    setMovementPreview(enabled) {
        this.movementPreview = Boolean(enabled);

        if (this.movementPreview) {
            this.refreshMovementPreview();
        } else {
            this.clearMovementMeshes();
        }
    }


    refreshMovementPreview() {
        this.clearMovementMeshes();
        if (!this.movementPreview) return;

        const character = this.getActiveCharacter();
        if (!character || !this.activeBattle?.active) return;

        const resources = this.activeBattle.currentResources;
        if (!resources) return;

        this.createMovementPreview(character, resources);
    }

    createMovementPreview(character, resources) {
        const range = this.getMovementPreviewRange(character, resources);
        for (let row = 0; row < this.gridRows; row++) {
            this.createMovementPreviewRow(row, character, range);
        }
    }

    getMovementPreviewRange(character, resources) {
        const normalRemaining = this.getNormalMovementRemaining(character, resources);
        const mayUseDash = this.canExtendMovement(resources);
        const totalRemaining = this.getTotalMovementRemaining(
            character,
            resources,
            mayUseDash
        );
        return this.createMovementPreviewRange(
            normalRemaining,
            totalRemaining,
            mayUseDash
        );
    }

    getNormalMovementRemaining(character, resources) {
        return Math.max(0, character.movement - resources.movementUsed);
    }

    canExtendMovement(resources) {
        return resources.dashUsed || !resources.actionUsed;
    }

    getTotalMovementRemaining(character, resources, mayUseDash) {
        const multiplier = mayUseDash ? 2 : 1;
        return Math.max(
            0,
            character.movement * multiplier - resources.movementUsed
        );
    }

    createMovementPreviewRange(normalRemaining, totalRemaining, mayUseDash) {
        return {
            normalCells: Math.floor(normalRemaining / this.cellSize),
            extendedCells: Math.floor(totalRemaining / this.cellSize),
            mayUseDash
        };
    }

    createMovementPreviewRow(row, character, range) {
        for (let col = 0; col < this.gridColumns; col++) {
            this.createMovementPreviewCell(row, col, character, range);
        }
    }

    createMovementPreviewCell(row, col, character, range) {
        if (!this.isValidGridCoordinate(row, col)) return;
        const distance = this.getMovementDistance(character, row, col);
        const type = this.getMovementCellType(distance, range);
        if (type) this.createMovementCell(row, col, type);
    }

    getMovementCellType(distance, range) {
        if (distance === 0) return null;
        if (distance <= range.normalCells * this.cellSize) {
            return "movement";
        }
        if (
            range.mayUseDash &&
            distance <= range.extendedCells * this.cellSize
        ) {
            return "dash";
        }
        return null;
    }

    createMovementCell(row, col, type) {
        if (
            row < 0 ||
            col < 0 ||
            !this.isValidGridCoordinate(row, col)
        ) {
            return;
        }

        const mesh = this.createProjectedCellMesh({
            name: `dnd-movement-${row}-${col}`,
            row,
            col,
            material: this.movementMaterials[type],
            verticalOffset: 0.8,
            pickable: true,
            metadata: {
                dndMovementCell: {
                    row,
                    col,
                    type
                }
            }
        });

        if (!mesh) return;

        this.movementMeshes.push(mesh);
    }

    setTargetMovementCell(cell) {
        if (
            cell &&
            this.hoveredMovementCell &&
            this.hoveredMovementCell.row === cell.row &&
            this.hoveredMovementCell.col === cell.col
        ) {
            return;
        }

        this.hoveredMovementCell = cell
            ? { ...cell }
            : null;

        this.targetMovementMesh?.dispose();
        this.targetMovementMesh = null;

        if (!cell || !this.movementPreview) return;

        if (
            cell.row < 0 ||
            cell.col < 0 ||
            !this.isValidGridCoordinate(cell.row, cell.col)
        ) {
            return;
        }

        this.targetMovementMesh = this.createProjectedCellMesh({
            name: "dnd-movement-target",
            row: cell.row,
            col: cell.col,
            material: this.targetMovementMaterial,
            verticalOffset: 1.0,
            pickable: false,
            metadata: {
                dndMovementTarget: true,
                row: cell.row,
                col: cell.col
            }
        });
    }

    clearMovementMeshes() {
        this.setTargetMovementCell(null);

        for (const mesh of this.movementMeshes) {
            mesh.dispose();
        }

        this.movementMeshes = [];
    }

    performAction(character, description = "") {
        if (!this.activeBattle?.active) {
            throw new Error("Start a battle first.");
        }

        const event = this.activeBattle.useAction(
            character,
            { description }
        );

        this.saveBattle();
        this.refreshMovementPreview();
        this.refreshUI();

        return event;
    }

    performBonusAction(character, description = "") {
        if (!this.activeBattle?.active) {
            throw new Error("Start a battle first.");
        }

        const event = this.activeBattle.useBonusAction(
            character,
            { description }
        );

        this.saveBattle();
        this.refreshUI();

        return event;
    }

    speakAsCharacter(character, text) {
        if (!this.activeBattle?.active) {
            throw new Error("Start a battle first.");
        }

        const event = this.activeBattle.speak(
            character,
            text
        );

        this.saveBattle();
        this.refreshUI();

        return event;
    }

    registerDefaultActionHandlers() {
        this.registerActionHandler(
            "*",
            this.handleDefaultAction.bind(this)
        );
    }

    async handleDefaultAction({ character, payload }) {
        return {
            accepted: true,
            characterId: character.id,
            actionType: payload.type,
            processedAt: Date.now()
        };
    }

    registerActionHandler(type, handler) {
        return this.actionRegistry.register(type, handler);
    }

    async dispatchOtherAction(character, payload) {
        if (!this.activeBattle?.active) {
            throw new Error("Start a battle first.");
        }

        this.activeBattle.assertActiveCharacter(character);

        const event = this.activeBattle.useOther(
            character,
            payload
        );

        this.saveBattle();

        try {
            const result = await this.actionRegistry.dispatch(
                {
                    mode: this,
                    battle: this.activeBattle,
                    character
                },
                payload
            );

            event.data.result = result === undefined
                ? null
                : JSON.parse(JSON.stringify(result));

            this.saveBattle();
            this.refreshUI();

            return result;
        } catch (error) {
            event.data.handlerError = error.message;

            this.saveBattle();
            this.refreshUI();

            throw error;
        }
    }

    saveBattle() {
        try {
            this.saveCharacters();

            const data = {
                version: 2,
                activeBattleId:
                    this.activeBattle?.id ?? null,
                battles: this.battles.map(serializeBattle)
            };

            localStorage.setItem(
                "somnium-dnd-battles",
                JSON.stringify(data)
            );

            return true;
        } catch (error) {
            console.error(
                "[DnD] Battle save failed.",
                error
            );

            this.showMessage("Unable to save battle.");

            return false;
        }
    }

    saveCharacters() {
        try {
            localStorage.setItem(
                "somnium-dnd-characters",
                JSON.stringify(
                    [...this.characters.values()].map(serializeCharacter)
                )
            );

            return true;
        } catch (error) {
            console.error(
                "[DnD] Character save failed.",
                error
            );

            return false;
        }
    }

    restoreBattles() {
        try {
            this.restoreSavedCharacters();
            const saved = this.loadSavedBattles();
            this.restoreBattleRecords(saved);
            this.selectRestoredCharacter();
            this.centerCameraOnActiveCharacter();
            this.refreshUI();
        } catch (error) {
            this.handleRestoreFailure(error);
        }
    }

    restoreSavedCharacters() {
        for (const data of this.readSavedCharacters()) {
            const character = DnDCharacter.fromJSON(data);
            this.characters.set(character.id, character);
            this.createCharacterMesh(character);
        }
        this.syncAllCharacters();
    }

    readSavedCharacters() {
        return JSON.parse(
            localStorage.getItem("somnium-dnd-characters") || "[]"
        );
    }

    loadSavedBattles() {
        return JSON.parse(
            localStorage.getItem("somnium-dnd-battles") || "null"
        );
    }

    restoreBattleRecords(saved) {
        if (!saved) {
            this.battles = [];
            this.activeBattle = null;
            return;
        }
        const records = Array.isArray(saved) ? saved : saved.battles || [];
        this.battles = records.map(restoreBattle);
        const activeId = Array.isArray(saved) ? null : saved.activeBattleId;
        this.activeBattle = this.findRestorableBattle(activeId);
    }

    selectRestoredCharacter() {
        if (this.activeBattle) {
            this.selectCharacter(this.activeBattle.activeCharacterId);
            return;
        }
        const first = this.characters.values().next().value;
        if (first) this.selectCharacter(first.id);
    }

    handleRestoreFailure(error) {
        console.warn("[DnD] Unable to restore saved data.", error);
        this.battles = [];
        this.activeBattle = null;
        this.refreshUI();
    }

    findRestorableBattle(activeBattleId) {
        for (const battle of this.battles) {
            if (
                battle.id === activeBattleId &&
                this.isRestorableBattle(battle)
            ) return battle;
        }
        for (const battle of this.battles) {
            if (this.isRestorableBattle(battle)) return battle;
        }
        return null;
    }

    isRestorableBattle(battle) {
        if (!battle.active || !battle.turnOrder.length) return false;
        for (const id of battle.turnOrder) {
            if (!this.characters.has(id)) return false;
        }
        return true;
    }

    async replayBattle(battle) {
        if (!battle || this.replaying) return;
        this.replaying = true;
        try {
            await this.replayBattleMoves(battle);
            if (!this.disposed) this.saveCharacters();
        } catch (error) {
            this.reportReplayFailure(error);
        } finally {
            this.replaying = false;
        }
    }

    async replayBattleMoves(battle) {
        const moves = battle.actions.filter(isMovementAction);
        for (const action of moves) {
            if (this.disposed) break;
            await this.replayBattleMove(action);
        }
    }

    async replayBattleMove(action) {
        const data = action.data || action;
        const character = this.characters.get(data.characterId);
        if (!character || !data.from || !data.to) return;
        await this.replayCharacterPosition(character, data.from);
        if (!this.disposed) await this.replayCharacterPosition(character, data.to);
    }

    async replayCharacterPosition(character, position) {
        character.position = { ...position };
        this.syncCharacter(character);
        this.centerCameraOnActiveCharacter();
        await waitFor(REPLAY_STEP_DELAY);
    }

    reportReplayFailure(error) {
        console.error("[DnD] Battle replay failed.", error);
    }

    createUI() {
        this.ui = new DnDTacticalUI(this);
        this.panel = this.ui.panel;
    }

    refreshUI() {
        this.ui?.refresh();
    }

    showMessage(message) {
        this.ui?.showMessage(message);
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        window.removeEventListener(
            "keydown",
            this.onKeyDown
        );

        this.scene.onPointerObservable.remove(
            this.onPointerObservable
        );

        this.scene.onBeforeRenderObservable.remove(
            this.gamepadObserver
        );

        this.clearMovementMeshes();
        this.disposeGridMeshes();

        for (const meshes of this.characterMeshes.values()) {
            meshes.root.dispose(false, true);
            meshes.material.dispose();
            meshes.headMaterial.dispose();
        }

        this.characterMeshes.clear();
        this.gamepadState.clear();

        this.ui?.dispose();
        this.ui = null;

        for (const material of Object.values(
            this.movementMaterials
        )) {
            material.dispose();
        }

        this.movementMaterials = {};

        if (this.camera) {
            this.camera.detachControl();

            if (
                this.previousCamera &&
                !this.previousCamera.isDisposed()
            ) {
                this.scene.activeCamera = this.previousCamera;
            } else {
                this.scene.activeCamera = null;
            }

            this.camera.dispose();
            this.camera = null;
        }


        this.targetMovementMesh?.dispose();
        this.targetMovementMesh = null;

        this.targetMovementMaterial?.dispose();

        this.clearMovementMeshes();
    }

    createProjectedCellMesh({
        name,
        row,
        col,
        material,
        verticalOffset = 0.8,
        pickable = false,
        metadata = null
    }) {
        // Exact world-space boundaries of this grid cell.
        const x0 = this.gridOrigin.x + col * this.cellSize;
        const x1 = x0 + this.cellSize;

        const z0 = this.gridOrigin.z + row * this.cellSize;
        const z1 = z0 + this.cellSize;

        const worldCorners = [
            { x: x0, z: z0 },
            { x: x1, z: z0 },
            { x: x1, z: z1 },
            { x: x0, z: z1 }
        ];

        // Project every corner independently. This is important
        // for nonlinear spatial transformations.
        const positions = [];

        for (const corner of worldCorners) {
            const sample = this.terrain.sampleAt(
                corner.x,
                corner.z
            );

            if (!sample) return null;

            const projected = this.transform.worldToRender({
                x: corner.x,
                y: sample.y + verticalOffset,
                z: corner.z
            });

            if (
                !Number.isFinite(projected.x) ||
                !Number.isFinite(projected.y) ||
                !Number.isFinite(projected.z)
            ) {
                return null;
            }

            positions.push(
                projected.x,
                projected.y,
                projected.z
            );
        }

        const mesh = new BABYLON.Mesh(name, this.scene);

        const vertexData = new BABYLON.VertexData();

        vertexData.positions = positions;

        vertexData.indices = [
            0, 1, 2,
            0, 2, 3
        ];

        const normals = [];

        BABYLON.VertexData.ComputeNormals(
            positions,
            vertexData.indices,
            normals
        );

        vertexData.normals = normals;

        vertexData.applyToMesh(mesh);

        mesh.material = material;
        mesh.isPickable = pickable;
        mesh.renderingGroupId = 1;

        mesh.metadata = metadata;

        return mesh;
    }

    setGridConfiguration(rows, columns, cellSize) {
        const configuration = this.normalizeGridConfiguration(
            rows,
            columns,
            cellSize
        );

        if (!configuration) return false;
        if (!this.charactersFitGrid(configuration)) return false;

        const previous = this.captureGridConfiguration();

        try {
            this.applyGridConfiguration(configuration, previous);
            this.refreshUI();

            const saved = this.saveGridConfiguration();
            this.saveCharacters();

            this.showMessage(saved
                ? this.formatGridConfigurationMessage(configuration)
                : "Grid updated, but settings could not be saved."
            );

            return true;
        } catch (error) {
            this.restoreGridConfigurationState(previous);
            this.reportGridConfigurationError(error);
            return false;
        }
    }

    normalizeGridConfiguration(rows, columns, cellSize) {
        // Preserve integrations using the former (size, cellSize) API.
        if (cellSize === undefined) {
            cellSize = columns;
            columns = rows;
        }

        if (!this.validateGridDimensions(rows, columns)) {
            this.showMessage(
                `Grid rows and columns must each be between ${MIN_GRID_DIMENSION} and ${MAX_GRID_DIMENSION}.`
            );
            return null;
        }

        if (!this.isValidCellSize(cellSize)) {
            this.showMessage(
                `Cell size must be between ${MIN_CELL_SIZE} and ${MAX_CELL_SIZE} world units.`
            );
            return null;
        }

        const configuration = { rows, columns, cellSize };

        if (!this.validateTerrainCoverage(
            rows,
            columns,
            cellSize,
            this.gridOrigin
        )) {
            this.showMessage(
                "The proposed grid extends beyond available terrain."
            );
            return null;
        }

        return configuration;
    }

    charactersFitGrid({ rows, columns }) {
        for (const character of this.characters.values()) {
            const { row, col } = character.position;

            if (row >= rows || col >= columns || row < 0 || col < 0) {
                this.showMessage(
                    `Grid resize would exclude ${character.name}.`
                );
                return false;
            }
        }

        return true;
    }

    captureGridConfiguration() {
        return {
            rows: this.gridRows,
            columns: this.gridColumns,
            cellSize: this.cellSize,
            radius: this.camera?.radius,
            alpha: this.camera?.alpha,
            beta: this.camera?.beta
        };
    }

    applyGridConfiguration(configuration, previous) {
        this.gridRows = configuration.rows;
        this.gridColumns = configuration.columns;
        this.cellSize = configuration.cellSize;

        this.createGrid();
        this.syncAllCharacters();
        this.refreshMovementPreview();

        this.recenterCameraPreservingOrbit(previous);
    }

    restoreGridConfigurationState(previous) {
        this.gridRows = previous.rows;
        this.gridColumns = previous.columns;
        this.cellSize = previous.cellSize;

        this.createGrid();
        this.syncAllCharacters();
        this.refreshMovementPreview();

        this.recenterCameraPreservingOrbit(previous);
    }

    formatGridConfigurationMessage({ rows, columns, cellSize }) {
        return (
            `Grid updated: ${rows} rows × ${columns} columns; ` +
            `${cellSize} world units per cell.`
        );
    }

    reportGridConfigurationError(error) {
        console.warn("[DnD] Grid configuration rejected.", error);
        this.showMessage(error.message);
    }

    setGridDimensions(rows, columns, cellSize) {
        return this.setGridConfiguration(rows, columns, cellSize);
    }

    validateTerrainCoverage(rows, columns, cellSize, origin) {
        for (let row = 0; row <= rows; row++) {
            for (let col = 0; col <= columns; col++) {
                const x = origin.x + col * cellSize;
                const z = origin.z + row * cellSize;

                if (!this.terrain.sampleAt(x, z)) return false;
            }
        }

        return true;
    }

    syncAllCharacters() {
        for (const character of this.characters.values()) {
            this.syncCharacter(character);
        }
    }

    restoreCameraOrbit(previous) {
        if (!this.camera || !previous) return;

        if (Number.isFinite(previous.radius)) {
            this.camera.radius = previous.radius;
        }
        if (Number.isFinite(previous.alpha)) {
            this.camera.alpha = previous.alpha;
        }
        if (Number.isFinite(previous.beta)) {
            this.camera.beta = previous.beta;
        }
    }

    isValidCellSize(cellSize) {
        return (
            Number.isFinite(cellSize) &&
            cellSize >= MIN_CELL_SIZE &&
            cellSize <= MAX_CELL_SIZE
        );
    }


    get gridSize() {
        // Legacy read-only alias; rectangular grids deliberately return null.
        return this.gridRows === this.gridColumns
            ? this.gridRows
            : null;
    }

    isValidGridCoordinate(row, col) {
        return (
            Number.isInteger(row) &&
            Number.isInteger(col) &&
            row >= 0 &&
            col >= 0 &&
            row < this.gridRows &&
            col < this.gridColumns
        );
    }

    validateGridDimensions(rows, columns) {
        return (
            Number.isInteger(rows) &&
            Number.isInteger(columns) &&
            rows >= MIN_GRID_DIMENSION &&
            columns >= MIN_GRID_DIMENSION &&
            rows <= this.maxGridRows &&
            columns <= this.maxGridColumns
        );
    }

}

export { DnDMode };

