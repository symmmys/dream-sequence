
import { HeightmapTerrain } from "../environment/heightmap-terrain.js";
import { WorldManager } from "../world/world-manager.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { ChunkEcologySystem } from "../world/chunk-ecology-system.js";
import { ChunkGeologySystem } from "../world/chunk-geology-system.js";
import { AdaptiveGraphicsController } from "../rendering/adaptive-graphics-controller.js";
import { WaterSystem } from "../water/water-system.js";
import { Hydrology } from "../water/hydrology.js";
import { RainSystem } from "../water/rain-system.js";
import { ChunkCloudSystem } from "../world/chunk-cloud-system.js";

import { SpatialTransform } from "../world/fields/geometry/spatial-transform.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { GeometryRenderer } from "../world/fields/geometry/geometry-renderer.js";
import { GeometryShaderManager } from "../world/fields/geometry/geometry-shader-manager.js";
import { HyperbolicCameraController } from "../world/fields/geometry/hyperbolic-camera-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";

import { GameManager } from "../game/game-manager.js";
import { PlayerCharacter } from "../game/player-character.js";
import { PlayerController } from "../game/player-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { CharacterCameraController } from "../game/camera-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { MainMenu } from "../ui/main-menu.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { CelestialSystem } from "../environment/celestial-system.js";
import { WorldPersistence } from "../world/persistence/world-persistence.js";
import { WorldSession } from "../world/persistence/world-session.js";
import { WorldLibraryUI } from "../world/persistence/world-library-ui.js";
import { BuildingSystem } from "../buildings/building-system.js";
import { BuildingEditor } from "../editor/building-editor.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { DnDMode } from "../game/dnd-mode.js";
import { createGeometryDemoWorld } from "../demo/geometry-demo-world.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { OpticalSceneRegistry } from "../world/fields/geometry/optical-scene-registry.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { OpticalDebugRenderer } from "../world/fields/geometry/optical-debug-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { createSliceOpticalTracer } from "../world/fields/geometry/optical-slice-tracer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";
import { createAnomalyOpticalTracer as buildAnomalyOpticalTracer } from "../world/fields/geometry/optical-anomaly-tracer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";

async function createScene(engine, canvas) {
    console.log("[Scene] Initializing Somnium...");

    const scene = new BABYLON.Scene(engine);
    const opticalScene = new OpticalSceneRegistry();
    const opticalDebugRenderer = new OpticalDebugRenderer(scene);

	scene.clearColor = new BABYLON.Color4(
		0.003, 0.006, 0.022, 1
	);

    const WORLD_SIZE = 40000;
    const CHUNK_SIZE = 2000;

    // -----------------------------------------
    // LIGHTING
    // -----------------------------------------


	// -----------------------------------------
// CELESTIAL LIGHTING
// -----------------------------------------

const sunDirection = new BABYLON.Vector3(
    -0.5, -1, -0.3
).normalize();

const sun = new BABYLON.DirectionalLight(
    "sun",
    sunDirection.clone(),
    scene
);

const ambient = new BABYLON.HemisphericLight(
    "ambient",
    new BABYLON.Vector3(0, 1, 0),
    scene
);

const celestial = new CelestialSystem(
    scene,
    {
        sunLight: sun,
        ambientLight: ambient,
        dayLength: 900,
        orbitDistance: 45000,
        skyRadius: 90000,
        sunSize: 1800,
        moonSize: 1300
    }
);

scene.metadata = {
    ...(scene.metadata || {}),
    celestial
};
    // -----------------------------------------
    // HEIGHTMAP
    // -----------------------------------------

    const terrain = new HeightmapTerrain({
        url: "./assets/0_somnium_map_topographic.png",
        fallbackUrl: "./assets/geometry-demo-topography.png",
        worldSize: WORLD_SIZE,
        minHeight: -2000,
        maxHeight: 1000,
        heightChannel: "average"
    });

    await terrain.load();

    // -----------------------------------------
    // SPATIAL TRANSFORM
    // -----------------------------------------

    const spatialTransform = new SpatialTransform({
        geometry: "poincare",
        renderScale: 10000,

        bounds: {
            minX: terrain.min.x,
            maxX: terrain.max.x,
            minY: -WORLD_SIZE / 2,
            maxY: WORLD_SIZE / 2,
            minZ: terrain.min.z,
            maxZ: terrain.max.z,
            characteristicLength: 0.25
        }
    });

    // -----------------------------------------
    // GEOMETRY RENDERER
    // -----------------------------------------

    const geometryRenderer = new GeometryRenderer(
        scene,
        spatialTransform
    );

const buildingSystem = new BuildingSystem(
    scene,
    geometryRenderer,
    { terrain }
);

const buildingEditor = new BuildingEditor(
    scene,
    buildingSystem,
    spatialTransform
);

scene.metadata = {
    ...(scene.metadata || {}),
    buildingSystem,
    buildingEditor
};

    const geometryShaderManager =
        new GeometryShaderManager(
            scene,
            spatialTransform,
            {
                enabled: true,
                renderScale: spatialTransform.renderScale
            }
        );

    // -----------------------------------------
    // FLIGHT CAMERA
    // -----------------------------------------

    const camera = new BABYLON.FreeCamera(
        "FlightCamera",
        BABYLON.Vector3.Zero(),
        scene
    );

    camera.minZ = 1;
    camera.maxZ = 100000;
    camera.speed = 500;
    camera.angularSensibility = 3000;

    const initialCameraPosition =
        spatialTransform.worldToRender({
            x: 0,
            y: 1800,
            z: -3000
        });

    camera.position.set(
        initialCameraPosition.x,
        initialCameraPosition.y,
        initialCameraPosition.z
    );

    camera.setTarget(BABYLON.Vector3.Zero());

    // -----------------------------------------
    // HYPERBOLIC FLIGHT CAMERA
    // -----------------------------------------

    const hyperbolicCamera =
        new HyperbolicCameraController(
            camera,
            spatialTransform,
            {
                maxHyperbolicSpeed: 2.5,
                boundaryMargin: 1e-7
            }
        );

    // Synchronize after initial camera positioning.
    hyperbolicCamera.synchronize();

    // -----------------------------------------
    // THIRD-PERSON CAMERA
    // -----------------------------------------

    const thirdPersonCamera = new BABYLON.FreeCamera(
        "ThirdPersonCamera",
        BABYLON.Vector3.Zero(),
        scene
    );

    thirdPersonCamera.minZ = 0.5;
    thirdPersonCamera.maxZ = 100000;

    // -----------------------------------------
    // PLAYER CHARACTER
    // -----------------------------------------

    const playerCharacter = new PlayerCharacter(
        scene,
        spatialTransform,
        {
            x: 0,
            z: 0,
            terrain
        }
    );

    const playerController = new PlayerController(
        playerCharacter,
        terrain,
        canvas,
        {
            walkSpeed: 180,
            runSpeed: 360,
            turnSpeed: 2.2
        }
    );

	const characterCameraController =
    new CharacterCameraController(
        scene,
        thirdPersonCamera,
        playerCharacter,
        spatialTransform,
        {
            distance: 24,
            height: 8,

            minDistance: 2.5,
            maxDistance: 1200,

            zoomSensitivity: 0.001,
            orbitSensitivity: 0.005,
            smoothing: 8
        }
    );
    // -----------------------------------------
    // GAME MANAGER
    // -----------------------------------------

    const gameManager = new GameManager(
        scene,
        {
            canvas,
            flightCamera: camera
        }
    );

	buildingEditor.setGameManager(gameManager);

    gameManager.registerThirdPerson(
        thirdPersonCamera,
        playerController,
        characterCameraController
    );

    // -----------------------------------------
    // GEOMETRY DEMONSTRATION WORLD
    // -----------------------------------------

    const geometryDemo = await createGeometryDemoWorld(scene, canvas, {
        terrain,
        spatialTransform,
        chunkSize: CHUNK_SIZE,
        opticalScene
    });
    scene.metadata = {
        ...(scene.metadata || {}),
        planeAnomalyPersistence: geometryDemo.planeAnomalyPersistence,
        planeAnomalyBootstrap: geometryDemo.planeAnomalyBootstrap,
        geometryDemo
    };
    // Load Plane records into the shared object renderer before the user can
    // enter the geometry demo; this avoids a first-frame gap for migrated room
    // primitives while IndexedDB is still being read.
    await buildingEditor.setGeometryDemo(geometryDemo);
    await buildingEditor.setAnomalyPersistence(
        geometryDemo.planeAnomalyPersistence
    );

    gameManager.registerMode('geometryDemo', {
        camera: geometryDemo.camera,
        playerController: geometryDemo.playerController,
        cameraController: geometryDemo.cameraController
    });

    function updateGeometryDemoVisibility(mode) {
        geometryDemo.setActive(mode === 'geometryDemo');
        // The geometry-demo Plane owns its own backdrop. Other gameplay modes
        // return to the ordinary world sky/background instead of inheriting
        // whichever demo chamber was visited most recently.
        if (mode !== 'geometryDemo' && mode !== 'editor') {
            geometryDemo.restoreDefaultSceneBackground?.();
        }
    }

    const removeGeometryModeListener = gameManager.onModeChanged(updateGeometryDemoVisibility);

    // -----------------------------------------
    // MAIN MENU
    // -----------------------------------------

    let dndMode = null;

    function startDnDMode() {
        dndMode?.dispose();
        gameManager.startDnD();
        dndMode = new DnDMode(scene, terrain, spatialTransform);
    }

    function startGeometryDemoMode() {
        gameManager.startGeometryDemo();
    }

    function toggleGeometryDemoGrid() {
        geometryDemo.toggleGrid();
    }

    function toggleGeometryDemoCamera() {
        return geometryDemo.toggleCameraMode();
    }

    function toggleGeometryDemoSpotlightEditor() {
        return geometryDemo.toggleSpotlightEditor();
    }

    function toggleGeometryDemoTestRay() {
        return geometryDemo.toggleSpotlightTestRay();
    }

    function toggleGeometryWMovement() {
        return geometryDemo.cameraController.toggleWMovementEnabled();
    }

    let mainMenu = null;
    geometryDemo.cameraController.onModeChanged = function updateGeometryCameraHud(mode) {
        mainMenu?.setGeometryCameraMode(mode);
    };
    mainMenu = new MainMenu(
        gameManager,
        startDnDMode,
        startGeometryDemoMode,
        toggleGeometryDemoGrid,
        toggleGeometryDemoCamera,
        toggleGeometryDemoSpotlightEditor,
        toggleGeometryDemoTestRay,
        toggleGeometryWMovement
    );
    geometryDemo.onWDimensionStateChanged = (state) => {
        mainMenu?.setGeometryWState(state);
        mainMenu?.setGeometryWMovementEnabled(state.movementEnabled);
    };
    mainMenu.setGeometryWMovementEnabled(geometryDemo.cameraController.wMovementEnabled);
    geometryDemo.onSpotlightEditorStateChanged = (active) => mainMenu?.setSpotlightEditorState(active);
    geometryDemo.onSpotlightTestRayStateChanged = (enabled) => mainMenu?.setSpotlightTestRayState(enabled);
    mainMenu.setSpotlightEditorState(geometryDemo.spotlightEditorActive);
    mainMenu.setSpotlightTestRayState(geometryDemo.spotlightTestRayEnabled);
    geometryDemo.onViewChanged = function updateGeometryViewLabel(sliceId, inspection = null) {
        const label = inspection?.editorInspection && !inspection.hasIntersectingPlane
            ? `EMPTY UNIVERSE W-SLICE · W=${Number(inspection.coordinate).toFixed(2)}`
            : sliceId === geometryDemo.hypercubeSlice.id
                ? '4D HYPERCUBE CHAMBER · LIVE 3D W-SLICE'
                : sliceId === geometryDemo.sourceSlice.id
                    ? 'POINCARE CHAMBER · CONNECTED ANOMALIES'
                    : sliceId === geometryDemo.destination.slice.id
                        ? 'SOMNIUM MAIN WORLD'
                        : 'UNIVERSE W-SLICE INSPECTION';
        mainMenu.setGeometryViewLabel(label);
    };
    geometryDemo.onSliceInfoChanged = function updateGeometrySliceLabel(label) {
        mainMenu?.setGeometrySliceLabel(label);
    };

    scene.metadata = {
        ...(scene.metadata || {}),
        celestial,
        spatialTransform,
        geometryRenderer,
        geometryShaderManager,
        hyperbolicCamera,
        gameManager,
        mainMenu,
        playerCharacter,
        playerController,
        characterCameraController,
        geometryDemo,
        worldSliceRegistry: geometryDemo.registry,
        opticalScene,
        opticalDebugRenderer,
        createSliceOpticalTracer(sliceId, options = {}) {
            const binding = geometryDemo.registry.require(sliceId);
            return createSliceOpticalTracer({
                slice: binding.slice,
                spatialTransform: binding.spatialTransform,
                sceneRegistry: opticalScene,
                debugRenderer: opticalDebugRenderer,
                metricOptions: options
            });
        },
        createAnomalyOpticalTracer(options = {}) {
            return buildAnomalyOpticalTracer({
                ...options,
                topology: geometryDemo.topology,
                sliceRegistry: geometryDemo.registry,
                sceneRegistry: opticalScene,
                chunkGraph: geometryDemo.chunkGraph,
                debugRenderer: opticalDebugRenderer
            });
        },
        getOpticalSceneStats: () => opticalScene.getStats(),
        getOpticalDebugStats: () => opticalDebugRenderer.getStats()
    };
    // -----------------------------------------
    // HEIGHTMAP DIAGNOSTICS
    // -----------------------------------------

    const heightmapDiagnostics =
        terrain.getDiagnostics(64);

    console.log(
        "[Scene] Heightmap diagnostics:",
        heightmapDiagnostics
    );

    // -----------------------------------------
    // TERRAIN STREAMING
    // -----------------------------------------

    const world = new WorldManager(
        scene,
        terrain,
        {
            sliceId: geometryDemo.destination.slice.id,
            chunkGraph: geometryDemo.chunkGraph,
            spatialAdapter: geometryDemo.adapter,
            opticalScene,
            layerMask: geometryDemo.destinationWorld.layerMask,
            visible: true,
            chunkSize: CHUNK_SIZE,
            renderRadius: 3,
            highDetailRadius: 2,
            maxChunksPerUpdate: 4
        }
    );
    geometryDemo.setDestinationWorldManager(world);

    // -----------------------------------------
    // ADAPTIVE GRAPHICS
    // -----------------------------------------

    const graphics = new AdaptiveGraphicsController(
        engine,
        camera,
        world,
        {
            targetFPS: 55,
            minimumFPS: 35
        }
    );

    // -----------------------------------------
    // CHUNK ECOLOGY
    // -----------------------------------------

    const ecology = new ChunkEcologySystem(
        scene,
        terrain,
        {
            worldSeed: 91827,
            chunkSize: CHUNK_SIZE,
            renderRadius: 3,
            treesPerChunk: 60,
            seaLevel: -100,
            sunDirection
        }
    );

    // -----------------------------------------
    // CHUNK GEOLOGY
    // -----------------------------------------

    const geology = new ChunkGeologySystem(
        scene,
        terrain,
        {
            worldSeed: 91827,
            chunkSize: CHUNK_SIZE,
            renderRadius: 3,
            rocksPerChunk: 10,
            seaLevel: -100
        }
    );

    console.log("[Scene] Chunk geology connected.");

    // -----------------------------------------
    // WATER
    // -----------------------------------------

    const water = new WaterSystem(
        scene,
        terrain,
        -100,
        {
            chunkSize: CHUNK_SIZE,
            renderRadius: 3
        }
    );

    // -----------------------------------------
    // HYDROLOGY
    // -----------------------------------------

    const hydrology = new Hydrology(
        terrain,
        water,
        20
    );
// -----------------------------------------
// SHARED GEOLOGICAL AND ECOLOGICAL FIELDS
// -----------------------------------------

// One authoritative geological field is shared
// by hydrology and the active chunk ecology.
hydrology.geologicalField = geology.field;

ecology.geologicalField = geology.field;
ecology.hydrology = hydrology;

console.log(
    "[Scene] Geological soil systems connected."
);

    // -----------------------------------------
    // RAIN
    // -----------------------------------------

    const rain = new RainSystem(scene);

    // -----------------------------------------
    // CLOUDS
    // -----------------------------------------

    const clouds = new ChunkCloudSystem(
        scene,
        terrain,
        water,
        hydrology,
        rain,
        {
            chunkSize: CHUNK_SIZE,
            renderRadius: 4,
            cloudsPerChunk: 8,
            maxChunksPerUpdate: 2,
            worldSeed: 91827,
            renderInterval: 0.5,
            simulationInterval: 0.25
        }
    );

// -----------------------------------------
// PERSISTENT WORLD LIBRARY
// -----------------------------------------

const worldPersistence = new WorldPersistence();

await worldPersistence.open();

const worldSession = new WorldSession(ecology);

let activeWorld = null;
let simulationElapsed = 0;

const worldLibrary = new WorldLibraryUI(
    worldPersistence,
    {

onLoad: async world => {
    const result = worldSession.restore(world);

    buildingSystem.restoreWorld(world);

	
    // Reset stale editor references after rebuilding
    // the authoritative building registry.
    buildingEditor.resetAfterWorldLoad();

    activeWorld = world;
    simulationElapsed = result.elapsedTime;

    geology.worldSeed = result.worldSeed;
    clouds.worldSeed = result.worldSeed;
    geology.field.seed = result.worldSeed;

    geology.records.clear();
    geology.activeChunks.clear();

    for (const renderer of Object.values(geology.renderers)) {
        renderer.clear();
        renderer.update();
    }

    clouds.records.clear();
    clouds.activeChunks.clear();
    clouds.renderer.clear();
    clouds.renderer.update();

    ecology.renderDirty = true;

    console.log("[World] Loaded:", world.metadata.name, result);
},

onCapture: async world => {
    worldSession.capture(world, simulationElapsed);
    buildingSystem.captureWorld(world);
}


    }
);

scene.metadata = {
    ...(scene.metadata || {}),
    worldPersistence,
    worldSession,
    worldLibrary
};

    console.log("[Scene] Environmental systems connected.");

    // -----------------------------------------
    // UPDATE LOOP
    // -----------------------------------------

    let ecologyAccumulator = 0;

    function updateSceneFrame() {
        const deltaSeconds = Math.min(engine.getDeltaTime() / 1000, 0.1);
        celestial.update(deltaSeconds);

        if (gameManager.mode === 'geometryDemo') {
            geometryDemo.update(deltaSeconds);
            return;
        }

        if (activeWorld) simulationElapsed += deltaSeconds;
        graphics.update(deltaSeconds);

        let position;
        let forward;

        if (gameManager.mode === "flight") {
            // Only the flight camera receives hyperbolic
            // camera updates.
            hyperbolicCamera.update(deltaSeconds);

            position =
                hyperbolicCamera.getWorldPosition();

            forward =
                camera.getForwardRay().direction;

        } else if (gameManager.mode === "thirdPerson") {
            // Character movement operates in original
            // authoritative world coordinates.
            playerController.update(deltaSeconds);

            characterCameraController.update(
                deltaSeconds
            );

            position = {
                ...playerCharacter.worldPosition
            };

            const yaw = playerCharacter.yaw;

            forward = new BABYLON.Vector3(
                Math.sin(yaw),
                0,
                Math.cos(yaw)
            );

        } else {
            // Menu and pause: preserve the world at its
            // current camera position without advancing
            // either navigation controller.
            position = hyperbolicCamera.getWorldPosition();
            forward = camera.getForwardRay().direction;
        }

        // -------------------------------------
        // WORLD STREAMING
        // -------------------------------------

        world.update(position, forward);

        // -------------------------------------
        // GEOLOGY
        // -------------------------------------

        geology.update(position);

        // -------------------------------------
        // REGIONAL WATER
        // -------------------------------------

        water.update(position, world.renderRadius);

        // -------------------------------------
        // ATMOSPHERE
        // -------------------------------------

        clouds.update(position, deltaSeconds);

        // -------------------------------------
        // HYDROLOGY
        // -------------------------------------

        const deltaYears = deltaSeconds * 0.05;

        hydrology.update(deltaYears);
        rain.update();

        // -------------------------------------
        // ECOLOGY
        // -------------------------------------

        ecologyAccumulator += deltaSeconds;

        if (ecologyAccumulator >= 0.25) {
            const elapsed = ecologyAccumulator;
            ecologyAccumulator = 0;
            ecology.update(position, elapsed);
        }
    }

    scene.onBeforeRenderObservable.add(updateSceneFrame);

    // -----------------------------------------
    // DIAGNOSTICS
    // -----------------------------------------

    scene.metadata = {
        ...(scene.metadata || {}),

        worldSize: terrain.worldSize,

        spatialTransform,
        geometryRenderer,
        geometryShaderManager,

        getGeometryStats: () =>
            geometryRenderer.getStats(),

	getCelestialStats: () => celestial.getStats(),

        getWorldStats: () =>
            world.getStats(),

        getEcologyStats: () =>
            ecology.getStats(),

        getGeologyStats: () =>
            geology.getStats(),

        getGraphicsStats: () =>
            graphics.getStats(),

        getHeightmapStats: () =>
            terrain.getDiagnostics(64),

        getWaterStats: () =>
            water.getStats(),

        getCloudStats: () =>
            clouds.getStats(),

        getGeometryShaderStats: () =>
            geometryShaderManager.getStats(),

        getHydrologyStats: () =>
            hydrology.getStatistics(),

        getGameStats: () =>
            gameManager.getState(),

        getGeometryDemoStats: () =>
            geometryDemo.getDiagnostics()
    };

    // -----------------------------------------
    // CLEANUP
    // -----------------------------------------

    function disposeSceneSystems() {
        console.log("[Scene] Disposing Somnium systems.");

        removeGeometryModeListener();
        mainMenu.dispose();
        gameManager.dispose();
        dndMode?.dispose();

        playerController.dispose();
        characterCameraController.dispose();
        playerCharacter.dispose();

        geometryRenderer.dispose(world);

        graphics.dispose();
        ecology.dispose();
        geology.dispose();
        world.dispose();
        geometryDemo.dispose();
        opticalDebugRenderer.dispose();
        opticalScene.dispose();

        terrain.dispose();
        rain.dispose();
        water.dispose();
        clouds.dispose();

        geometryShaderManager.dispose();
        hyperbolicCamera.dispose();
	celestial.dispose();


	buildingEditor.dispose();
	buildingSystem.dispose();


        worldLibrary.dispose();
        worldPersistence.close();
    }

    scene.onDisposeObservable.add(disposeSceneSystems);

    // -----------------------------------------
    // INITIALIZATION COMPLETE
    // -----------------------------------------

    console.log("[Scene] Somnium initialized.");

    console.log("[Scene] Configuration:", {
        worldSize: WORLD_SIZE,
        chunkSize: CHUNK_SIZE,
        chunksAcross: WORLD_SIZE / CHUNK_SIZE,
        initialPerspective: gameManager.mode,
        treesPerChunk: ecology.treesPerChunk,
        rocksPerChunk: geology.rocksPerChunk
    });

    return scene;
}

export default createScene;

