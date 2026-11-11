/** Owns the connected 4D demo chambers and their Babylon presentation. */

import { SliceWorldRegistry } from '../world/slice-world-registry.js';
import { createWorldSlice } from '../world/fields/geometry/world-slice.js';
import { createPlaneFrameTransform } from '../editor/plane-object-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { PlaneAnomalyPersistence } from '../world/persistence/plane-anomaly-persistence.js';
import { createRuntimeAnomalyFromDefinition } from '../world/fields/geometry/runtime-anomaly-bridge.js';
import {
    createGeometryDemoTopology, MAIN_WORLD_SLICE_ID
} from './geometry-demo-topology.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SpatialTransform } from '../world/fields/geometry/spatial-transform.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { getPlaneAmbientWBounds, getUniverseWSliceBounds as calculateUniverseWSliceBounds, planeIntersectsWSlice } from '../world/fields/geometry/w-slice-range.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { ambientToSlice, sliceToAmbient } from '../world/fields/geometry/spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import {
    calculateAnomalyApertureScale, mapAnomalyCameraPose
} from '../world/fields/geometry/anomaly-view-transform.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { BabylonGeometryAdapter } from '../world/fields/geometry/babylon-geometry-adapter.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { CorridorRenderer } from '../world/fields/geometry/corridor-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { AnomalyBoundaryRenderer } from '../world/fields/geometry/anomaly-boundary-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { PortalPreviewRenderer } from '../world/fields/geometry/portal-preview-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { AnomalyPassagePresentation } from './anomaly-passage-presentation.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { GeometryDebugGrid } from '../world/fields/geometry/geometry-debug-grid.js';
import { PlayerCharacter } from '../game/player-character.js';
import { PlayerController } from '../game/player-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { GeometryDemoCameraController } from './geometry-demo-camera-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { CorridorTraversalController } from '../world/fields/geometry/corridor-traversal-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SliceTransitionTraversalController } from '../world/fields/geometry/slice-transition-traversal-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SLICE_TRANSITION_ANOMALY } from '../world/fields/geometry/spatial-anomaly.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { CorridorTraversalNetwork } from './corridor-traversal-network.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { Hypercube4DRenderer } from './hypercube-4d-renderer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createAnomalyOpticalTracer } from '../world/fields/geometry/optical-anomaly-tracer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import {
    aimOpticalSpotlightSource, createOpticalSpotlightSource,
    moveOpticalSpotlightSource, projectOpticalSpotlightExitRay, rotateOpticalSpotlightSource,
    traceOpticalSpotlightSource
} from '../world/fields/geometry/optical-light-source.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const SOURCE_LAYER = 0x10000000;
const HYPERCUBE_LAYER = 0x20000000;
const MAIN_WORLD_LAYER = 0x0FFFFFFF;
// User-authored Plane slices share one isolated render layer. Object visibility
// and each portal's explicit render list keep same-layer Planes independent.
const USER_PLANE_LAYER = 0x40000000;
// Keep editor guide/overlay meshes visible without exposing unrelated high-bit
// geometry layers from every runtime slice.
const EDITOR_OVERLAY_LAYER = 0x80000000;
const ROOM_MOVEMENT_PROFILE = Object.freeze({ walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.4 });
const MAIN_WORLD_MOVEMENT_PROFILE = Object.freeze({ walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 });
const GEOMETRY_DEMO_BUILD = '2026-11-10-phase18o-active-w-slice-navigation-1';

async function createGeometryDemoWorld(scene, canvas, mainWorld) {
    console.info(`[GeometryDemo] Build: ${GEOMETRY_DEMO_BUILD}`);
    const data = createGeometryDemoTopology(mainWorld);
    const defaultAnomalies = new Map([
        [data.corridor.id, data.corridor],
        [data.hypercubeCorridor.id, data.hypercubeCorridor],
        [data.hypercubeMainCorridor.id, data.hypercubeMainCorridor]
    ]);
    // Plane topology is global project data, intentionally separate from the
    // saved-World database. Seed built-in demo Planes/anomalies once without
    // overwriting records a user has subsequently edited.
    const planeAnomalyPersistence = new PlaneAnomalyPersistence();
    let planeAnomalyBootstrap = null;
    let savedAnomalyDefinitions = [];
    let savedPlaneDefinitions = [];
    try {
        planeAnomalyBootstrap = await planeAnomalyPersistence.bootstrapDemo(data.topology);
        console.info('[PlaneAnomalyPersistence] Demo topology bootstrap:', planeAnomalyBootstrap);
        const planeObjectBootstrap = await planeAnomalyPersistence.bootstrapDemoPlaneObjects();
        console.info('[PlaneAnomalyPersistence] Demo Plane object migration:', planeObjectBootstrap);
        savedPlaneDefinitions = await planeAnomalyPersistence.listPlanes();
    } catch (error) {
        // Keep the geometry demo playable if browser storage is unavailable;
        // the authoring/persistence subsystem reports its own error when used.
        console.error('[PlaneAnomalyPersistence] Demo topology bootstrap failed:', error);
    }
    // Persistent definitions are the source of truth for the three built-in
    // runtime links. Apply them before renderers/controllers/chunk addresses
    // are created so a reload reflects the editor's saved endpoint positions.
    try {
        const savedDefinitions = await planeAnomalyPersistence.listAnomalies();
        savedAnomalyDefinitions = savedDefinitions;
        for (const definition of savedDefinitions) {
            if (!defaultAnomalies.has(definition.id)) continue;
            try {
                const current = data.topology.getCorridor(definition.id);
                const runtime = createRuntimeAnomalyFromDefinition(definition, data.topology);
                runtime.revision = Math.max(runtime.revision, current.revision + 1);
                data.topology.updateCorridor(runtime);
                data.chunkGraph.removeCorridor(definition.id);
                data.chunkGraph.registerCorridor(definition.id);
            } catch (error) {
                console.error(`[PlaneAnomalyPersistence] Could not activate ${definition.id}:`, error);
            }
        }
        data.corridor = data.topology.getCorridor(data.corridor.id);
        data.hypercubeCorridor = data.topology.getCorridor(data.hypercubeCorridor.id);
        data.hypercubeMainCorridor = data.topology.getCorridor(data.hypercubeMainCorridor.id);
        data.corridorChunk = data.chunkGraph.getCorridorChunk(data.corridor.id);
        data.hypercubeCorridorChunk = data.chunkGraph.getCorridorChunk(data.hypercubeCorridor.id);
        data.hypercubeMainCorridorChunk = data.chunkGraph.getCorridorChunk(data.hypercubeMainCorridor.id);
        data.sourceChunkAddress = data.chunkGraph.getAddress(data.sourceSlice.id, data.corridor.source.position);
        data.destinationChunkAddress = data.chunkGraph.getAddress(data.mainSlice.id, data.corridor.destination.position);
        data.hypercubeChunkAddress = data.chunkGraph.getAddress(data.hypercubeSlice.id, data.hypercubeCorridor.source.position);
        data.hypercubeDestinationChunkAddress = data.chunkGraph.getAddress(data.sourceSlice.id, data.hypercubeCorridor.destination.position);
        data.hypercubeMainChunkAddress = data.chunkGraph.getAddress(data.hypercubeSlice.id, data.hypercubeMainCorridor.source.position);
        data.hypercubeMainDestinationChunkAddress = data.chunkGraph.getAddress(data.mainSlice.id, data.hypercubeMainCorridor.destination.position);
    } catch (error) {
        console.error('[PlaneAnomalyPersistence] Could not load saved anomaly definitions:', error);
    }
    const {
        sourceSlice, hypercubeSlice, mainSlice, corridor, hypercubeCorridor, hypercubeMainCorridor,
        topology, chunkGraph, corridorChunk, hypercubeCorridorChunk, hypercubeMainCorridorChunk, mainAnchor,
        sourceChunkAddress, hypercubeChunkAddress, hypercubeDestinationChunkAddress,
        destinationChunkAddress, hypercubeMainChunkAddress, hypercubeMainDestinationChunkAddress
    } = data;

    const sourceTransform = createSourceTransform();
    const hypercubeTransform = createHypercubeTransform();
    const registry = new SliceWorldRegistry();
    registry.register(sourceSlice, { spatialTransform: sourceTransform });
    registry.register(hypercubeSlice, { spatialTransform: hypercubeTransform });
    registry.register(mainSlice, { spatialTransform: mainWorld.spatialTransform });

    const adapter = new BabylonGeometryAdapter(scene, { opticalScene: mainWorld.opticalScene });
    adapter.registerSlice(sourceSlice, sourceTransform);
    adapter.registerSlice(hypercubeSlice, hypercubeTransform);
    adapter.registerSlice(mainSlice, mainWorld.spatialTransform);

    // Presence of the Plane record (not a non-empty object list) distinguishes
    // a successful empty user edit from a storage failure.
    const sourcePlaneObjectsReady = savedPlaneDefinitions.some(plane => plane.id === sourceSlice.id);
    const sourceMeshes = createDemoRoom(scene, adapter, sourceTransform, sourceSlice.id, { usePlaneObjects: sourcePlaneObjectsReady });
    const hypercubeRenderer = new Hypercube4DRenderer(scene, hypercubeTransform, {
        center: { x: 0, y: 4, z: 0 }, halfExtent: 4.2,
        initialAngles: { xw: 0.42, yw: 0.36, zw: 0.32 },
        opticalScene: mainWorld.opticalScene,
        sliceId: hypercubeSlice.id,
        chunkAddress: hypercubeChunkAddress,
        angularSpeeds: { xw: 0.68, yw: 0.49, zw: 0.33 },
        viewerW: 0, layerMask: HYPERCUBE_LAYER,
        edgeRadius: 0.095, vertexDiameter: 0.13
    });
    const hypercubeMeshes = [...hypercubeRenderer.meshes];
    const hypercubePlaneRecord = savedPlaneDefinitions.find(plane => plane.id === hypercubeSlice.id);
    const storedHypercube = hypercubePlaneRecord?.objects?.find(object => object.type === 'hypercube4d');
    if (hypercubePlaneRecord) {
        if (storedHypercube) hypercubeRenderer.setObjectDefinition(storedHypercube);
        else hypercubeRenderer.objectVisible = false;
    }
    const hypercubeAuxiliaryMeshes = [];

    const hypercubePortalCamera = {
        x: -28, y: 9, z: 30, targetX: -2, targetY: 3, targetZ: -2, fov: 0.9
    };
    const sourceHypercubePortalCamera = {
        x: 0, y: 10, z: -32, targetX: 0, targetY: 4, targetZ: 0, fov: 0.9
    };
    const mainPreviewCamera = createMainPreviewCamera(mainWorld.spatialTransform, mainAnchor);
    const mainWorldPortalLayout = getMainWorldAnomalyPortalLayout(mainAnchor);
    // Visible portals are intentionally spaced for readability, while their
    // authoritative 4D anomaly endpoints remain compact. These maps reconcile
    // local presentation coordinates with the canonical endpoint frames.
    const mainCorridorPresentationEndpoints = {
        [sourceSlice.id]: { x: 0, y: 2.5, z: 20.15 },
        [mainSlice.id]: { ...mainWorldPortalLayout.mainWorldCorridor.position }
    };
    const hypercubeMainPresentationEndpoints = {
        [hypercubeSlice.id]: { x: 18, y: 2.5, z: 0.15 },
        [mainSlice.id]: { ...mainWorldPortalLayout.hypercubeMainWorld.position }
    };
    const mainSourcePortal = createPortal(scene, sourceSlice.id, adapter, [], {
        position: { x: 0, y: 2.5, z: 20.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: corridor.view?.apertureShape ?? 'circle',
        previewSurface: corridor.view?.previewSurface ?? 'flat',
        showRim: corridor.view?.showRim ?? false,
        layerMask: SOURCE_LAYER, renderLayerMask: MAIN_WORLD_LAYER,
        rimName: 'geometryMainWorldPortalRim', camera: mainPreviewCamera
    });
    const mainDestinationPortal = createDestinationPortal(
        scene, mainSlice.id, adapter, [], mainAnchor, corridor.view,
        mainWorldPortalLayout.mainWorldCorridor
    );
    const hypercubeSourcePortal = createPortal(scene, hypercubeSlice.id, adapter, [], {
        position: { x: -18, y: 2.5, z: 0.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: hypercubeCorridor.view?.apertureShape ?? 'circle',
        previewSurface: hypercubeCorridor.view?.previewSurface ?? 'flat',
        showRim: hypercubeCorridor.view?.showRim ?? false,
        layerMask: HYPERCUBE_LAYER, renderLayerMask: SOURCE_LAYER,
        rimName: 'geometryPoincareChamberPortalRim', camera: hypercubePortalCamera
    });
    const hypercubeDestinationPortal = createPortal(scene, sourceSlice.id, adapter, [], {
        position: { x: -18, y: 2.5, z: 0.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: hypercubeCorridor.view?.apertureShape ?? 'circle',
        previewSurface: hypercubeCorridor.view?.previewSurface ?? 'flat',
        showRim: hypercubeCorridor.view?.showRim ?? false,
        layerMask: SOURCE_LAYER, renderLayerMask: HYPERCUBE_LAYER,
        rimName: 'geometryHypercubePortalRim', camera: sourceHypercubePortalCamera
    });
    const hypercubeMainPortal = createPortal(scene, hypercubeSlice.id, adapter, [], {
        position: { x: 18, y: 2.5, z: 0.15 },
        width: 5.6, height: 5.6, rimDiameter: 6.1,
        apertureShape: hypercubeMainCorridor.view?.apertureShape ?? 'circle',
        previewSurface: hypercubeMainCorridor.view?.previewSurface ?? 'flat',
        showRim: hypercubeMainCorridor.view?.showRim ?? false,
        layerMask: HYPERCUBE_LAYER, renderLayerMask: MAIN_WORLD_LAYER,
        rimName: 'geometryHypercubeMainWorldPortalRim', camera: mainPreviewCamera
    });
    const hypercubeMainDestinationPortal = createPortal(scene, mainSlice.id, adapter, [], {
        ...mainWorldPortalLayout.hypercubeMainWorld,
        apertureShape: hypercubeMainCorridor.view?.apertureShape ?? 'circle',
        previewSurface: hypercubeMainCorridor.view?.previewSurface ?? 'flat',
        showRim: hypercubeMainCorridor.view?.showRim ?? false,
        layerMask: MAIN_WORLD_LAYER, renderLayerMask: HYPERCUBE_LAYER,
        rimName: 'geometryMainWorldHypercubePortalRim', camera: hypercubePortalCamera
    });

    const mainCorridorLabel = createWorldLabel(
        scene, sourceSlice.id, 'geometryMainCorridorLabel',
        'ANOMALY 02  |  SOMNIUM MAIN WORLD', 0, 8.5, 20.2, 12
    );
    const hypercubeCorridorLabel = createWorldLabel(
        scene, sourceSlice.id, 'geometryHypercubeCorridorLabel',
        'ANOMALY 01  |  4D HYPERCUBE CHAMBER', -18, 8.5, 0, 12
    );
    sourceMeshes.push(mainCorridorLabel, hypercubeCorridorLabel);
    applySliceMeshes([mainCorridorLabel, hypercubeCorridorLabel], adapter, sourceTransform, sourceSlice.id);
    for (const mesh of sourceMeshes) mesh.layerMask = SOURCE_LAYER;
    const hypercubeMainCorridorLabel = createWorldLabel(
        scene, hypercubeSlice.id, 'geometryHypercubeMainCorridorLabel',
        'ANOMALY 03  |  SOMNIUM MAIN WORLD  ·  W +5', 18, 8.5, 0, 12
    );
    applySliceMeshes([hypercubeMainCorridorLabel], adapter, hypercubeTransform, hypercubeSlice.id);
    hypercubeMainCorridorLabel.layerMask = HYPERCUBE_LAYER;
    hypercubeMeshes.push(hypercubeMainCorridorLabel);
    hypercubeAuxiliaryMeshes.push(hypercubeMainCorridorLabel);

    const mainSourceRenderer = corridor.type === SLICE_TRANSITION_ANOMALY
        ? null
        : new CorridorRenderer(scene, corridor, sourceTransform);
    const mainDestinationRenderer = corridor.type === SLICE_TRANSITION_ANOMALY
        ? null
        : new CorridorRenderer(scene, corridor, mainWorld.spatialTransform, { anchorT: 1 });
    if (mainSourceRenderer) mainSourceRenderer.mesh.layerMask = SOURCE_LAYER;
    if (mainDestinationRenderer) mainDestinationRenderer.mesh.layerMask = MAIN_WORLD_LAYER;

    const hypercubeSourceRenderer = hypercubeCorridor.type === SLICE_TRANSITION_ANOMALY
        ? null
        : new CorridorRenderer(scene, hypercubeCorridor, hypercubeTransform);
    const hypercubeDestinationRenderer = hypercubeCorridor.type === SLICE_TRANSITION_ANOMALY
        ? null
        : new CorridorRenderer(scene, hypercubeCorridor, sourceTransform, { anchorT: 1 });
    if (hypercubeSourceRenderer) hypercubeSourceRenderer.mesh.layerMask = HYPERCUBE_LAYER;
    if (hypercubeDestinationRenderer) hypercubeDestinationRenderer.mesh.layerMask = SOURCE_LAYER;

    const sourceGrid = new GeometryDebugGrid(scene, adapter, {
        sliceId: sourceSlice.id, size: 60, spacing: 2, visible: false
    });
    sourceGrid.mesh.layerMask = SOURCE_LAYER;
    const hypercubeGrid = new GeometryDebugGrid(scene, adapter, {
        sliceId: hypercubeSlice.id, size: 52, spacing: 2, visible: false
    });
    hypercubeGrid.mesh.layerMask = HYPERCUBE_LAYER;
    const mainWorldGrid = new GeometryDebugGrid(scene, adapter, {
        sliceId: mainSlice.id,
        size: 120,
        spacing: 4,
        sampleStep: 2,
        center: { x: mainAnchor.x, z: mainAnchor.z },
        visible: false,
        heightAt(x, z) {
            const sample = mainWorld.terrain.sampleAt(x, z);
            return Number.isFinite(sample?.y) ? sample.y + 0.35 : null;
        }
    });
    mainWorldGrid.mesh.layerMask = MAIN_WORLD_LAYER;

    const hypercubeTerrain = createHypercubeMovementSurface();
    const player = new PlayerCharacter(scene, hypercubeTransform, {
        x: 0, z: -18, terrain: hypercubeTerrain,
        sliceId: hypercubeSlice.id, layerMask: HYPERCUBE_LAYER
    });
    const playerController = new PlayerController(player, hypercubeTerrain, canvas, {
        ...ROOM_MOVEMENT_PROFILE
    });
    const getInfluenceModifiers = () =>
        playerController.getAnomalyInfluenceModifiers?.() ?? playerController.anomalyInfluenceModifiers ?? {};
    const camera = createDemoCamera(scene);
    const cameraController = new GeometryDemoCameraController(
        scene, camera, player, hypercubeTransform, playerController,
        {
            distance: 18, height: 8, minDistance: 2.5, maxDistance: 800, smoothing: 9,
            orbitSensitivity: 0.005
        }
    );

    const sourceWorld = createDemoWorldBinding(
        sourceSlice, sourceTransform, createRoomMovementSurface(), SOURCE_LAYER, sourceChunkAddress,
        { movementProfile: ROOM_MOVEMENT_PROFILE }
    );
    const hypercubeWorld = createDemoWorldBinding(
        hypercubeSlice, hypercubeTransform, hypercubeTerrain, HYPERCUBE_LAYER, hypercubeChunkAddress,
        { fourDimensionalRegion: false, wBounds: { min: 0, max: 0 }, movementProfile: ROOM_MOVEMENT_PROFILE }
    );
    const sourceExitWorld = createDemoWorldBinding(
        sourceSlice, sourceTransform, sourceWorld.terrain, SOURCE_LAYER, hypercubeDestinationChunkAddress,
        { movementProfile: ROOM_MOVEMENT_PROFILE }
    );
    const destinationWorld = createDemoWorldBinding(
        mainSlice, mainWorld.spatialTransform, mainWorld.terrain, MAIN_WORLD_LAYER, destinationChunkAddress,
        { movementProfile: mainWorld.movementProfile ?? MAIN_WORLD_MOVEMENT_PROFILE }
    );
    chunkGraph.registerChunk(sourceChunkAddress, sourceWorld);
    chunkGraph.registerChunk(hypercubeDestinationChunkAddress, sourceExitWorld);
    chunkGraph.registerChunk(hypercubeChunkAddress, hypercubeWorld);

    const portalPairs = [
        {
            corridor, sourceSliceId: sourceSlice.id, destinationSliceId: mainSlice.id,
            sourcePortal: mainSourcePortal, destinationPortal: mainDestinationPortal,
            sourceRenderer: mainSourceRenderer, destinationRenderer: mainDestinationRenderer,
            presentationEndpointsBySlice: mainCorridorPresentationEndpoints
        },
        {
            corridor: hypercubeCorridor, sourceSliceId: hypercubeSlice.id, destinationSliceId: sourceSlice.id,
            sourcePortal: hypercubeSourcePortal, destinationPortal: hypercubeDestinationPortal,
            sourceRenderer: hypercubeSourceRenderer, destinationRenderer: hypercubeDestinationRenderer
        },
        {
            corridor: hypercubeMainCorridor,
            sourceSliceId: hypercubeSlice.id,
            destinationSliceId: mainSlice.id,
            sourcePortal: hypercubeMainPortal,
            destinationPortal: hypercubeMainDestinationPortal,
            sourceRenderer: null,
            destinationRenderer: null,
            presentationEndpointsBySlice: hypercubeMainPresentationEndpoints
        }
    ];
    for (const pair of portalPairs) {
        const baseline = defaultAnomalies.get(pair.corridor.id) ?? pair.corridor;
        const sourceDisplay = pair.presentationEndpointsBySlice?.[baseline.source.sliceId] ?? baseline.source.position;
        const destinationDisplay = pair.presentationEndpointsBySlice?.[baseline.destination.sliceId] ?? baseline.destination.position;
        pair.presentationOffsetsByEndpoint = {
            source: subtractPosition(sourceDisplay, baseline.source.position),
            destination: subtractPosition(destinationDisplay, baseline.destination.position)
        };
        pair.sourceSliceId = pair.corridor.source.sliceId;
        pair.destinationSliceId = pair.corridor.destination.sliceId;
    }
    for (const pair of portalPairs) {
        const view = pair.corridor.view ?? {};
        if (view.previewSurface === 'spherical' && view.interiorBoundary === 'open-4d-cylinder') {
            pair.passagePresentation = new AnomalyPassagePresentation(scene, pair);
        }
    }
    const anomalyLayerMasks = new Map([
        [sourceSlice.id, SOURCE_LAYER],
        [hypercubeSlice.id, HYPERCUBE_LAYER],
        [mainSlice.id, MAIN_WORLD_LAYER]
    ]);
    for (const pair of portalPairs) {
        refreshPairPresentationEndpoints(pair);
        applyPortalEndpointPose(scene, adapter, registry, anomalyLayerMasks, pair, 'source');
        applyPortalEndpointPose(scene, adapter, registry, anomalyLayerMasks, pair, 'destination');
    }
    const anomalyBoundaryRenderers = createAnomalyBoundaryRenderers(
        scene, portalPairs, registry, anomalyLayerMasks
    );
    const world = new GeometryDemoWorld({
        scene, sourceSlice, hypercubeSlice, planeAnomalyPersistence, planeAnomalyBootstrap, savedAnomalyDefinitions, savedPlaneDefinitions,
        destination: { slice: mainSlice, terrain: mainWorld.terrain, metadata: {
            kind: 'existing-main-world', chunkSize: mainWorld.chunkSize ?? 2000,
            exit: { ...mainAnchor }
        } },
        corridor, hypercubeCorridor, hypercubeMainCorridor, topology, registry, adapter,
        sourceMeshes, hypercubeMeshes, hypercubeAuxiliaryMeshes, hypercubeRenderer,
        sourceWorld, sourceExitWorld, hypercubeWorld, destinationWorld,
        mainSourcePortal, mainDestinationPortal, hypercubeSourcePortal, hypercubeDestinationPortal,
        hypercubeMainPortal, hypercubeMainDestinationPortal,
        portalPairs, anomalyBoundaryRenderers, anomalyLayerMasks, opticalScene: mainWorld.opticalScene,
        mainWorldPortalLayout, mainCorridorPresentationEndpoints, hypercubeMainPresentationEndpoints,
        mainSourceRenderer, mainDestinationRenderer,
        hypercubeSourceRenderer, hypercubeDestinationRenderer,
        sourceGrid, hypercubeGrid, mainWorldGrid,
        chunkGraph, corridorChunk, hypercubeCorridorChunk, hypercubeMainCorridorChunk,
        hypercubeMainChunkAddress, hypercubeMainDestinationChunkAddress,
        destinationWorldManager: null, mainAnchor,
        player, playerController, camera, cameraController, getInfluenceModifiers,
        sliceWorlds: new Map([
            [sourceSlice.id, sourceWorld],
            [hypercubeSlice.id, hypercubeWorld],
            [mainSlice.id, destinationWorld]
        ])
    });

    const controllers = [
        createAnomalyTraversalController({
            player, movementController: playerController, cameraController,
            anomaly: hypercubeCorridor, topology, getInfluenceModifiers,
            corridorRenderers: new Map([
                [hypercubeSlice.id, hypercubeSourceRenderer],
                [sourceSlice.id, hypercubeDestinationRenderer]
            ]),
            chunkGraph, corridorChunk: hypercubeCorridorChunk,
            source: hypercubeWorld, destination: sourceExitWorld,
            initialSliceId: hypercubeSlice.id,
            traversal: {
                speed: 12, sprintSpeed: 18, entitySpeed: 10,
                presentationEndpointsBySlice: portalPairs.find(pair => pair.corridor.id === hypercubeCorridor.id).presentationEndpointsBySlice
            }
        }),
        createAnomalyTraversalController({
            player, movementController: playerController, cameraController,
            anomaly: hypercubeMainCorridor, topology, getInfluenceModifiers,
            corridorRenderers: new Map(),
            chunkGraph, corridorChunk: hypercubeMainCorridorChunk,
            source: hypercubeWorld, destination: destinationWorld,
            initialSliceId: hypercubeSlice.id,
            traversal: {
                speed: 12, sprintSpeed: 18, entitySpeed: 10,
                triggerDistanceBySlice: { [mainSlice.id]: 30 },
                presentationEndpointsBySlice: portalPairs.find(pair => pair.corridor.id === hypercubeMainCorridor.id).presentationEndpointsBySlice
            }
        }),
        createAnomalyTraversalController({
            player, movementController: playerController, cameraController,
            anomaly: corridor, topology, getInfluenceModifiers,
            corridorRenderers: new Map([
                [sourceSlice.id, mainSourceRenderer],
                [mainSlice.id, mainDestinationRenderer]
            ]),
            chunkGraph, corridorChunk,
            source: sourceWorld, destination: destinationWorld,
            initialSliceId: hypercubeSlice.id,
            traversal: {
                speed: 12, sprintSpeed: 18, entitySpeed: 10,
                triggerDistanceBySlice: { [mainSlice.id]: 30 },
                presentationEndpointsBySlice: portalPairs.find(pair => pair.corridor.id === corridor.id).presentationEndpointsBySlice
            }
        })
    ];
    world.traversalController = new CorridorTraversalNetwork({
        topology,
        worlds: new Map([
            [hypercubeSlice.id, hypercubeWorld],
            [sourceSlice.id, sourceWorld],
            [mainSlice.id, destinationWorld]
        ]),
        controllers,
        initialSliceId: hypercubeSlice.id,
        onSliceChanged: world.activateSlice.bind(world)
    });
    cameraController.setTraversalController(world.traversalController);
    // User-authored Plane records must be registered before saved anomalies
    // are reconstructed, otherwise endpoints cannot resolve their WorldSlice.
    const builtInPlaneIds = new Set([sourceSlice.id, hypercubeSlice.id, mainSlice.id]);
    for (const definition of savedPlaneDefinitions) {
        if (builtInPlaneIds.has(definition.id)) continue;
        try { world.ensureRuntimePlane(definition); }
        catch (error) { console.error(`[PlaneRuntime] Could not register saved Plane ${definition.id}:`, error); }
    }
    for (const definition of savedAnomalyDefinitions) {
        if (defaultAnomalies.has(definition.id)) continue;
        try {
            world.applyAnomalyDefinition(definition);
        } catch (error) {
            console.error(`[PlaneAnomalyPersistence] Could not construct saved runtime anomaly ${definition.id}:`, error);
        }
    }
    return world;
}


function subtractPosition(left, right) {
    return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function addPosition(left, right) {
    return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function refreshPairPresentationEndpoints(pair) {
    const sourceOffset = pair.presentationOffsetsByEndpoint?.source ?? { x: 0, y: 0, z: 0 };
    const destinationOffset = pair.presentationOffsetsByEndpoint?.destination ?? { x: 0, y: 0, z: 0 };
    pair.presentationEndpointsBySlice = {
        [pair.corridor.source.sliceId]: addPosition(pair.corridor.source.position, sourceOffset),
        [pair.corridor.destination.sliceId]: addPosition(pair.corridor.destination.position, destinationOffset)
    };
}

function applyPortalEndpointPose(scene, adapter, registry, layerMasks, pair, endpointName) {
    const isSource = endpointName === 'source';
    const endpoint = isSource ? pair.corridor.source : pair.corridor.destination;
    const sliceId = endpoint.sliceId;
    const remoteSliceId = isSource ? pair.corridor.destination.sliceId : pair.corridor.source.sliceId;
    const world = registry.require(sliceId);
    const remoteMask = layerMasks.get(remoteSliceId);
    const localMask = layerMasks.get(sliceId);
    if (!localMask || !remoteMask) throw new Error(`Anomaly ${pair.corridor.id} references an unsupported runtime Plane.`);
    const offset = pair.presentationOffsetsByEndpoint?.[endpointName] ?? { x: 0, y: 0, z: 0 };
    const displayPosition = addPosition(endpoint.position, offset);
    pair.presentationEndpointsBySlice ??= {};
    pair.presentationEndpointsBySlice[sliceId] = { ...displayPosition };
    const portal = isSource ? pair.sourcePortal : pair.destinationPortal;
    reapplyPortalMesh(adapter, portal, portal.surface, sliceId, displayPosition, endpoint.orientation, localMask);
    if (portal.rim) reapplyPortalMesh(adapter, portal, portal.rim, sliceId, displayPosition, endpoint.orientation, localMask);
    portal.camera.layerMask = remoteMask;
    portal.surface.layerMask = localMask;
    if (portal.rim) portal.rim.layerMask = localMask;
    portal.setHomePose();
    if (isSource) pair.sourceSliceId = sliceId;
    else pair.destinationSliceId = sliceId;
}

function reapplyPortalMesh(adapter, portal, mesh, sliceId, position, orientation, layerMask) {
    const original = mesh.metadata?.somniumOriginalGeometry;
    if (!original) throw new Error(`Portal mesh ${mesh.name} is missing its original geometry snapshot.`);
    adapter.restoreMesh(mesh);
    mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, new Float32Array(original.positions), true, 3);
    if (original.normals) mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, new Float32Array(original.normals), true, 3);
    mesh.position.set(position.x, position.y, position.z);
    mesh.scaling.set(original.scaling.x, original.scaling.y, original.scaling.z);
    mesh.rotation.set(0, 0, 0);
    mesh.rotationQuaternion = orientation
        ? new BABYLON.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w)
        : null;
    mesh.layerMask = layerMask;
    mesh.metadata = { ...(mesh.metadata ?? {}), sliceId };
    adapter.applyMesh(mesh, sliceId);
    mesh.layerMask = layerMask;
}

function createAnomalyBoundaryRenderers(scene, portalPairs, registry, layerMasks) {
    const entries = [];
    for (const pair of portalPairs) {
        if (!['open-4d-hypercube', 'open-4d-cylinder'].includes(pair.corridor.view?.interiorBoundary)) continue;
        for (const sliceId of [pair.sourceSliceId, pair.destinationSliceId]) {
            const binding = registry.require(sliceId);
            const endpoint = pair.corridor.source.sliceId === sliceId
                ? pair.corridor.source : pair.corridor.destination;
            const endpointAmbient = sliceToAmbient(binding.slice.frame, endpoint.position);
            const sourceBinding = registry.require(pair.corridor.source.sliceId);
            const destinationBinding = registry.require(pair.corridor.destination.sliceId);
            const sourceAmbient = sliceToAmbient(sourceBinding.slice.frame, pair.corridor.source.position);
            const destinationAmbient = sliceToAmbient(
                destinationBinding.slice.frame, pair.corridor.destination.position
            );
            const renderer = new AnomalyBoundaryRenderer(
                scene,
                pair.corridor,
                binding.slice,
                binding.spatialTransform,
                {
                    layerMask: layerMasks.get(sliceId),
                    presentationEndpoint: pair.presentationEndpointsBySlice?.[sliceId] ?? null,
                    sourceAmbient,
                    destinationAmbient,
                    gridSegments: 5,
                    opacity: 0.11,
                    edgeAlpha: 0.72
                }
            );
            entries.push({
                anomaly: pair.corridor,
                corridorId: pair.corridor.id,
                sliceId,
                endpointW: endpointAmbient.w,
                renderer
            });
        }
    }
    return entries;
}

function createAnomalyTraversalController(options) {
    const { anomaly, corridorRenderers, ...rest } = options;
    if (anomaly.type === SLICE_TRANSITION_ANOMALY) {
        return new SliceTransitionTraversalController({
            ...rest,
            anomaly,
            corridor: anomaly,
            corridorRenderers
        });
    }
    return new CorridorTraversalController({
        ...rest,
        corridor: anomaly,
        corridorRenderer: corridorRenderers?.get(options.source.slice.id),
        corridorRenderers
    });
}

function clonePlaneDefinition(definition) {
    return JSON.parse(JSON.stringify(definition));
}

function createUserPlaneProjectionBounds(fallbackTransform) {
    const projection = fallbackTransform?.projection;
    return {
        minX: -500000, maxX: 500000,
        minY: -2000, maxY: 1000,
        minZ: -500000, maxZ: 500000,
        characteristicLength: projection?.characteristicLength ?? 100000,
        boundaryEpsilon: projection?.boundaryEpsilon ?? 1e-9,
        curvature: projection?.curvature ?? -1
    };
}

function createUserPlaneMovementSurface(definition) {
    const dimensions = definition?.container?.dimensions ?? {};
    const halfX = Math.max(0.5, Number(dimensions.x ?? 100) / 2);
    const halfZ = Math.max(0.5, Number(dimensions.z ?? 100) / 2);
    const halfY = Math.max(0.5, Number(dimensions.y ?? 60) / 2);
    const floorY = -halfY;
    return {
        min: { x: -halfX, y: floorY, z: -halfZ },
        max: { x: halfX, y: halfY, z: halfZ },
        sampleAt(x, z) {
            if (!Number.isFinite(x) || !Number.isFinite(z) ||
                x < -halfX || x > halfX || z < -halfZ || z > halfZ) return null;
            return { x, y: floorY, z };
        }
    };
}

function createDemoWorldBinding(slice, transform, terrain, layerMask, address, options = {}) {
    return {
        slice, transform, terrain, layerMask, address,
        fourDimensionalRegion: Boolean(options.fourDimensionalRegion),
        wBounds: options.wBounds ?? null,
        movementProfile: options.movementProfile ? { ...options.movementProfile } : null,
        spatialNeighbors: [], adjacentWorldChunks: [],
        setSpatialNeighbors: function setSpatialNeighbors(neighbors, worldChunks) {
            this.spatialNeighbors = neighbors;
            this.adjacentWorldChunks = worldChunks;
        }
    };
}

function createMainPreviewCamera(transform, anchor) {
    const bounds = transform.projection?.bounds;
    const cameraWorld = {
        x: anchor.x,
        y: Math.min(anchor.y + 90, (bounds?.maxY ?? anchor.y + 90) - 1),
        z: Math.max(anchor.z - 260, (bounds?.minZ ?? anchor.z - 260) + 1)
    };
    const targetWorld = {
        x: anchor.x,
        y: clamp(anchor.y + 18, (bounds?.minY ?? anchor.y - 18) + 1, (bounds?.maxY ?? anchor.y + 18) - 1),
        z: clamp(anchor.z + 520, (bounds?.minZ ?? anchor.z + 520) + 1, (bounds?.maxZ ?? anchor.z + 520) - 1)
    };
    const position = transform.worldToRender(cameraWorld);
    const target = transform.worldToRender(targetWorld);
    return {
        x: position.x, y: position.y, z: position.z,
        targetX: target.x, targetY: target.y, targetZ: target.z,
        fov: 0.88, maxZ: 100000
    };
}

function cloneSceneColor(color) {
    if (!color) return null;
    if (typeof color.clone === 'function') return color.clone();
    return new BABYLON.Color4(color.r ?? 0, color.g ?? 0, color.b ?? 0, color.a ?? 1);
}

class GeometryDemoWorld {
    constructor(resources) {
        Object.assign(this, resources);
        this.active = false;
        this.activeListeners = new Set();
        this.savedPlaneDefinitionsById = new Map((this.savedPlaneDefinitions ?? []).map(plane => [plane.id, plane]));
        this.defaultSceneClearColor = cloneSceneColor(this.scene?.clearColor);
        this.disposed = false;
        this.corridorRenderer = this.mainSourceRenderer;
        this.destinationCorridorRenderer = this.mainDestinationRenderer;
        this.didStart = false;
        this.gridEnabled = false;
        this.currentSliceId = this.hypercubeSlice.id;
        this.editorWCoordinate = null;
        this.editorInspectionContext = null;
        this.grids = new Map([
            [this.sourceSlice.id, this.sourceGrid],
            [this.hypercubeSlice.id, this.hypercubeGrid],
            [this.destination.slice.id, this.mainWorldGrid]
        ]);
        this.onGridKeyDown = this.handleGridKeyDown.bind(this);
        if (typeof window !== 'undefined') window.addEventListener('keydown', this.onGridKeyDown);
        this.initializeOpticalSpotlight();
        this.corridorRenderers = [
            [this.sourceSlice.id, this.mainSourceRenderer],
            [this.destination.slice.id, this.mainDestinationRenderer],
            [this.hypercubeSlice.id, this.hypercubeSourceRenderer],
            [this.sourceSlice.id, this.hypercubeDestinationRenderer]
        ].filter(([, renderer]) => Boolean(renderer))
            .map(([sliceId, renderer]) => ({ sliceId, renderer, corridorId: renderer.corridor?.id ?? null }));
        this.setActive(false);
    }

    setEditorWCoordinate(coordinate) {
        const value = coordinate == null ? NaN : Number(coordinate);
        this.editorWCoordinate = Number.isFinite(value) ? value : null;
        this.editorInspectionContext = Number.isFinite(this.editorWCoordinate)
            ? this.resolveEditorInspectionContext(this.editorWCoordinate) : null;
        // The editor slider is a real slice navigator, not just a render hint:
        // update the runtime slice presentation immediately as well as on the
        // next animation frame.
        if (this.active) this.updateCameraPresentation();
        else this.onViewChanged?.(this.editorInspectionContext?.sliceId ?? null, {
            editorInspection: true,
            coordinate: this.editorWCoordinate,
            hasIntersectingPlane: Boolean(this.editorInspectionContext?.hasIntersectingPlane),
            includedPlaneIds: this.editorInspectionContext?.includedPlaneIds ?? []
        });
        this.publishWDimensionState();
        return this.editorWCoordinate;
    }

    clearEditorWCoordinate() {
        this.editorWCoordinate = null;
        this.editorInspectionContext = null;
        if (this.active) this.updateCameraPresentation();
        else this.onViewChanged?.(this.cameraController?.getViewSliceId?.() ?? this.currentSliceId, null);
        this.publishWDimensionState();
    }

    /**
     * Resolve the editor's absolute ambient-W coordinate to the actual runtime
     * Plane presentation. Built-in demo slices overlap by their default W
     * thickness, so only the nearest built-in slice is rendered; every
     * user-authored Plane intersecting the selected W coordinate is included.
     * This makes W=0, 75 and 80 unambiguously select the Poincare room, 4D
     * chamber and Main World respectively while still composing custom Planes
     * into the same inspection slice.
     */
    resolveEditorInspectionContext(coordinate = this.editorWCoordinate) {
        if (!Number.isFinite(Number(coordinate))) return null;
        const w = Number(coordinate);
        const builtinIds = new Set([
            this.sourceSlice?.id,
            this.hypercubeSlice?.id,
            this.destination?.slice?.id
        ].filter(Boolean));
        const entries = Array.from(this.sliceWorlds?.values?.() ?? []).map(world => {
            const id = world?.slice?.id;
            if (!id) return null;
            const definition = world.planeDefinition ?? this.savedPlaneDefinitionsById?.get(id) ?? {
                id, frame: world.slice.frame, w: world.slice.w
            };
            const bounds = getPlaneAmbientWBounds(definition);
            return {
                id, world, definition, bounds,
                builtin: builtinIds.has(id),
                intersects: planeIntersectsWSlice(definition, w)
            };
        }).filter(Boolean);
        const builtins = entries.filter(entry => entry.builtin && entry.intersects)
            .sort((a, b) => Math.abs(a.bounds.center - w) - Math.abs(b.bounds.center - w));
        const custom = entries.filter(entry => !entry.builtin && entry.intersects)
            .sort((a, b) => Math.abs(a.bounds.center - w) - Math.abs(b.bounds.center - w));
        const primary = builtins[0] ?? custom[0] ?? null;
        const visible = [
            ...(primary?.builtin ? [primary] : []),
            ...custom
        ];
        const visibleSliceIds = new Set(visible.map(entry => entry.id));
        const layerMask = visible.reduce((mask, entry) => mask | (Number(entry.world.layerMask) || 0), EDITOR_OVERLAY_LAYER) | USER_PLANE_LAYER;
        return {
            coordinate: w,
            sliceId: primary?.id ?? null,
            world: primary?.world ?? null,
            transform: primary?.world?.transform ?? null,
            layerMask,
            visibleSliceIds,
            hasIntersectingPlane: visible.length > 0,
            primaryPlaneCenterW: primary?.bounds.center ?? null,
            includedPlaneIds: Array.from(visibleSliceIds)
        };
    }

    getEditorInspectionContext() {
        if (!Number.isFinite(this.editorWCoordinate)) return null;
        // Re-resolve on demand because a Plane can be created or edited while
        // the editor remains open at a fixed W coordinate.
        this.editorInspectionContext = this.resolveEditorInspectionContext(this.editorWCoordinate);
        return this.editorInspectionContext;
    }

    /** Return a local XYZ focus point appropriate for the selected runtime Plane. */
    getEditorInspectionFocus(context = this.getEditorInspectionContext()) {
        if (!context?.sliceId) return null;
        if (context.sliceId === this.destination?.slice?.id) {
            return this.mainAnchor ? { ...this.mainAnchor } : { x: 0, y: 2.5, z: 0 };
        }
        if (context.sliceId === this.sourceSlice?.id || context.sliceId === this.hypercubeSlice?.id) {
            return { x: 0, y: 2.5, z: 0 };
        }
        // Custom Plane runtime frames use Plane-local coordinates for rendering.
        return { x: 0, y: 2, z: 0 };
    }

    getPresentationSliceId() {
        if (Number.isFinite(this.editorWCoordinate)) {
            return this.getEditorInspectionContext()?.sliceId ?? null;
        }
        return this.cameraController?.getViewSliceId?.() ?? this.currentSliceId;
    }

    publishWDimensionState() {
        if (!this.cameraController || !this.traversalController) return;
        const sliceId = Number.isFinite(this.editorWCoordinate)
            ? (this.getPresentationSliceId() ?? this.cameraController.getViewSliceId?.() ?? this.currentSliceId)
            : (this.cameraController.getViewSliceId?.() ?? this.currentSliceId);
        const inspection = this.getEditorInspectionContext();
        const position = inspection
            ? { ...(inspection.world?.slice?.frame?.origin ?? { x: 0, y: 0, z: 0 }), w: this.editorWCoordinate }
            : (this.cameraController.mode === 'free'
                ? this.cameraController.getFreeAmbientPosition?.()
                : this.traversalController.getAmbientPlayerPosition?.());
        this.updateWDimensionState(sliceId, position ?? null);
    }

    getUniverseWSliceBounds(additionalDefinitions = []) {
        const definitions = new Map(this.savedPlaneDefinitionsById ?? []);
        for (const definition of additionalDefinitions ?? []) {
            if (definition?.id) definitions.set(definition.id, definition);
        }
        return calculateUniverseWSliceBounds(
            Array.from(definitions.values()), this.sliceWorlds ?? null
        );
    }

    onActiveChanged(listener) {
        if (typeof listener !== 'function') throw new TypeError('Active-state listener must be a function.');
        this.activeListeners.add(listener);
        return () => this.activeListeners.delete(listener);
    }

    setActive(active) {
        if (this.disposed) return;
        this.active = Boolean(active);
        for (const listener of this.activeListeners) {
            try { listener(this.active); } catch (error) { console.error('[GeometryDemo] Active-state listener failed:', error); }
        }
        for (const mesh of [...this.sourceMeshes, ...this.hypercubeMeshes]) mesh.isVisible = this.active;
        this.player.root.setEnabled(this.active && this.cameraController.mode !== 'free');
        this.traversalController?.setActive(this.active);
        for (const entry of this.corridorRenderers) entry.renderer.mesh.isVisible = this.active;
        for (const entry of this.anomalyBoundaryRenderers ?? []) {
            entry.renderer.setVisible(this.active && entry.anomaly.visible);
        }
        for (const pair of this.portalPairs) {
            pair.sourcePortal.setVisible(false);
            pair.destinationPortal.setVisible(false);
            pair.passagePresentation?.deactivate(this.camera, this.getWorld(this.cameraController.getViewSliceId()).layerMask);
        }
        if (!this.active) {
            for (const grid of this.grids.values()) grid.setActive(false);
            this.spotlightSourceLight?.setEnabled(false);
            this.spotlightMarker && (this.spotlightMarker.isVisible = false);
            this.spotlightAimLine && (this.spotlightAimLine.isVisible = false);
            this.destinationSpotlight?.setEnabled(false);
            if (this.destinationSpotlightRayLine) this.destinationSpotlightRayLine.isVisible = false;
            this.clearOpticalSpotlightShadowCasters();
            return;
        }
        if (this.cameraController.mode !== 'follow') this.cameraController.setMode('follow');
        this.spotlightSourceLight?.setEnabled(Boolean(this.spotlightTestRayEnabled));
        this.spotlightMarker && (this.spotlightMarker.isVisible = true);
        this.spotlightAimLine && (this.spotlightAimLine.isVisible = true);
        this.spotlightNeedsTrace = true;
        this.didStart = true;
        const transitioning = this.traversalController?.state === 'transit';
        this.activateSlice(this.currentSliceId, {
            transitioning,
            renderSliceId: this.traversalController?.startWorld?.slice.id ?? this.currentSliceId
        });
        this.updateCameraPresentation();
        this.updatePortalLists();
    }

    activateSlice(sliceId, state = {}) {
        this.currentSliceId = sliceId;
        const transitioning = Boolean(state.transitioning);
        const renderWorld = this.getWorld(transitioning ? (state.renderSliceId ?? sliceId) : sliceId);
        this.camera.layerMask = renderWorld.layerMask;
        this.applyPlaneBackground(sliceId);
        this.cameraController.setSpatialContext(renderWorld.transform, renderWorld.layerMask);
        this.player.setLayerMask(renderWorld.layerMask);
        if (!transitioning && renderWorld.terrain?.sampleAt) {
            this.playerController?.setTerrain?.(renderWorld.terrain);
            if (renderWorld.movementProfile) this.playerController?.setMovementProfile?.(renderWorld.movementProfile);
        }
        this.updateCameraPresentation();
    }

    /** Apply the saved appearance associated with the active runtime Plane. */
    applyPlaneBackground(planeId = this.currentSliceId) {
        const definition = this.savedPlaneDefinitionsById?.get(planeId);
        const color = definition?.container?.backgroundColor;
        if (!color || typeof color !== 'string') {
            this.restoreDefaultSceneBackground();
            return false;
        }
        const rgb = BABYLON.Color3.FromHexString(color);
        const opacityValue = Number(definition.container.backgroundOpacity ?? 1);
        const opacity = Number.isFinite(opacityValue) ? Math.max(0, Math.min(1, opacityValue)) : 1;
        const background = new BABYLON.Color4(rgb.r, rgb.g, rgb.b, opacity);
        this.scene.metadata ??= {};
        this.scene.metadata.somniumPlaneBackground = background.clone?.() ?? cloneSceneColor(background);
        this.scene.clearColor = background;
        return true;
    }

    /** Refresh the runtime appearance after a Plane definition is saved. */
    applyPlaneDefinition(definition) {
        if (!definition?.id) return false;
        this.savedPlaneDefinitionsById ??= new Map();
        this.savedPlaneDefinitionsById.set(definition.id, definition);
        if (this.active && definition.id === this.currentSliceId) {
            this.applyPlaneBackground(definition.id);
        }
        return true;
    }

    applyCurrentPlaneBackground() {
        return this.applyPlaneBackground(this.currentSliceId);
    }

    restoreDefaultSceneBackground() {
        if (this.scene?.metadata) delete this.scene.metadata.somniumPlaneBackground;
        if (this.defaultSceneClearColor && this.scene) {
            this.scene.clearColor = cloneSceneColor(this.defaultSceneClearColor);
        }
    }

    getPlaneDefinitions() {
        const definitions = new Map(this.savedPlaneDefinitionsById ?? []);
        for (const slice of [this.sourceSlice, this.hypercubeSlice, this.destination.slice]) {
            if (definitions.has(slice.id)) continue;
            definitions.set(slice.id, {
                id: slice.id,
                displayName: ({
                    'geometry-demo-room': 'Poincaré Room',
                    'geometry-demo-4d-chamber': '4D Room',
                    'somnium-main': 'Main World'
                })[slice.id] ?? slice.id,
                geometry: slice.geometry, seed: slice.seed, frame: slice.frame, source: 'runtime-demo'
            });
        }
        return Array.from(definitions.values(), definition => clonePlaneDefinition(definition));
    }

    /**
     * Register a saved user Plane as a real runtime slice so it can be selected
     * by anomaly mouths, rendered through portals, and traversed. The first
     * saved frame/geometry becomes its runtime identity; subsequent authoring
     * saves update appearance and movement bounds without relocating a Plane
     * that may already have connected anomaly endpoints.
     */
    ensureRuntimePlane(definition) {
        if (!definition?.id) throw new TypeError('A saved Plane definition with an ID is required.');
        this.savedPlaneDefinitionsById ??= new Map();
        this.savedPlaneDefinitionsById.set(definition.id, clonePlaneDefinition(definition));
        const existing = this.sliceWorlds?.get(definition.id);
        if (existing) {
            if (existing.isUserDefinedPlane) {
                existing.planeDefinition = clonePlaneDefinition(definition);
                existing.terrain = createUserPlaneMovementSurface(definition);
                const halfW = Math.max(0.01, Number(definition.container?.dimensions?.w ?? 10) / 2);
                existing.wBounds = { min: -halfW, max: halfW };
            }
            return existing;
        }

        const frame = definition.frame ?? null;
        const slice = createWorldSlice({
            id: definition.id, geometry: definition.geometry ?? 'euclidean',
            seed: definition.seed ?? 0, frame: frame ?? undefined,
            w: Number.isFinite(definition.w) ? definition.w : undefined
        });
        const fallbackTransform = this.sourceWorld?.transform ?? this.hypercubeWorld?.transform;
        if (!fallbackTransform) throw new Error('Cannot register a user Plane before the geometry transforms are initialized.');
        const chartTransform = new SpatialTransform({
            geometry: slice.geometry,
            renderScale: slice.geometry === 'euclidean' ? 1 : (fallbackTransform.renderScale ?? 24),
            visualScaleGamma: fallbackTransform.visualScaleOptions?.gamma ?? 0.72,
            maxVisualScale: fallbackTransform.visualScaleOptions?.maxScale ?? 3.5,
            bounds: createUserPlaneProjectionBounds(fallbackTransform)
        });
        const framed = createPlaneFrameTransform(chartTransform, slice.frame);
        const transform = framed.transform;
        this.topology.registerSlice(slice);
        this.registry.register(slice, { spatialTransform: transform });
        this.adapter.registerSlice(slice, transform);
        this.chunkGraph.registerSlice(slice, { chunkSize: 32 });
        const address = this.chunkGraph.getAddress(slice.id, { x: 0, z: 0 });
        const terrain = createUserPlaneMovementSurface(definition);
        const halfW = Math.max(0.01, Number(definition.container?.dimensions?.w ?? 10) / 2);
        const world = createDemoWorldBinding(
            slice, transform, terrain, USER_PLANE_LAYER, address,
            { movementProfile: ROOM_MOVEMENT_PROFILE, fourDimensionalRegion: true, wBounds: { min: -halfW, max: halfW } }
        );
        world.isUserDefinedPlane = true;
        world.planeDefinition = clonePlaneDefinition(definition);
        this.chunkGraph.registerChunk(address, world);
        this.sliceWorlds.set(slice.id, world);
        this.anomalyLayerMasks.set(slice.id, USER_PLANE_LAYER);
        this.traversalController?.worlds?.set?.(slice.id, world);
        if (this.active && this.currentSliceId === slice.id) this.applyPlaneBackground(slice.id);
        return world;
    }

    /** Apply a saved Plane's runtime appearance and ensure it is addressable. */
    applyPlaneDefinition(definition) {
        if (!definition?.id) return false;
        this.savedPlaneDefinitionsById ??= new Map();
        this.savedPlaneDefinitionsById.set(definition.id, clonePlaneDefinition(definition));
        // Plane background persistence can be exercised before the complete
        // runtime graph is assembled (for example during bootstrapping/tests).
        // In the live application all of these registries exist, so a newly
        // saved Plane is immediately promoted to a traversable runtime slice.
        const runtimeReady = this.sliceWorlds instanceof Map && this.topology &&
            this.registry && this.adapter && this.chunkGraph &&
            (this.sourceWorld?.transform || this.hypercubeWorld?.transform);
        if (runtimeReady) this.ensureRuntimePlane(definition);
        if (this.active && definition.id === this.currentSliceId) this.applyPlaneBackground(definition.id);
        this.updatePortalLists?.();
        return true;
    }

    applyPlaneObjectDefinitions(planeId, objects) {
        if (planeId !== this.hypercubeSlice.id) return false;
        const hypercube = (objects ?? []).find(object => object.type === 'hypercube4d');
        if (!hypercube) {
            this.hypercubeRenderer.objectVisible = false;
            return true;
        }
        return this.hypercubeRenderer.setObjectDefinition(hypercube);
    }

    applyAnomalyDefinition(definition) {
        if (!definition?.id) return false;
        const placed = definition.endpointConfiguration?.placementStatus !== 'unplaced' &&
            definition.endpointConfiguration?.source?.placed !== false &&
            definition.endpointConfiguration?.destination?.placed !== false;
        if (!placed) return false;
        for (const endpoint of [definition.source, definition.destination]) {
            const planeId = endpoint?.planeId ?? endpoint?.sliceId;
            if (!planeId) throw new TypeError('Anomaly endpoint is missing its Plane ID.');
            if (!this.sliceWorlds?.has(planeId)) {
                const planeDefinition = this.savedPlaneDefinitionsById?.get(planeId);
                if (!planeDefinition) throw new Error(`Anomaly references an unregistered Plane: ${planeId}`);
                this.ensureRuntimePlane(planeDefinition);
            }
        }
        const current = this.topology.toJSON().corridors.find(entry => entry.id === definition.id);
        const runtime = createRuntimeAnomalyFromDefinition(definition, this.topology);
        if (runtime.source.sliceId === runtime.destination.sliceId) {
            throw new RangeError('An anomaly must connect two different Planes.');
        }
        // Validate both live Plane bindings and avoid mutating topology during transit.
        this.getWorld(runtime.source.sliceId);
        this.getWorld(runtime.destination.sliceId);
        if (this.traversalController?.getActiveController?.()) {
            throw new Error('Finish the active anomaly traversal before editing the runtime network.');
        }
        runtime.revision = Math.max(runtime.revision, (current?.revision ?? 0) + 1);
        if (current) this.topology.updateCorridor(runtime);
        else this.topology.registerCorridor(runtime);
        this.chunkGraph.removeCorridor(definition.id);
        const corridorChunk = this.chunkGraph.registerCorridor(definition.id);
        let pair = this.portalPairs.find(entry => entry.corridor.id === definition.id);
        if (!pair) {
            pair = this.createRuntimePortalPair(runtime);
            this.portalPairs.push(pair);
        } else {
            pair.corridor = this.topology.getCorridor(definition.id);
            pair.sourceSliceId = pair.corridor.source.sliceId;
            pair.destinationSliceId = pair.corridor.destination.sliceId;
            refreshPairPresentationEndpoints(pair);
            applyPortalEndpointPose(this.scene, this.adapter, this.registry, this.anomalyLayerMasks, pair, 'source');
            applyPortalEndpointPose(this.scene, this.adapter, this.registry, this.anomalyLayerMasks, pair, 'destination');
            this.rebuildPairRenderers(pair);
        }
        pair.corridor = this.topology.getCorridor(definition.id);
        pair.sourceSliceId = pair.corridor.source.sliceId;
        pair.destinationSliceId = pair.corridor.destination.sliceId;
        pair.passagePresentation?.dispose?.();
        pair.passagePresentation = null;
        if (pair.corridor.view?.previewSurface === 'spherical' && pair.corridor.view?.interiorBoundary === 'open-4d-cylinder') {
            pair.passagePresentation = new AnomalyPassagePresentation(this.scene, pair);
        }
        this.rebuildTraversalController(pair, corridorChunk);
        this.rebuildAnomalyBoundaryRenderers();
        this.updatePortalLists();
        this.updateCameraPresentation();
        return true;
    }

    createRuntimePortalPair(corridor) {
        const sourceWorld = this.getWorld(corridor.source.sliceId);
        const destinationWorld = this.getWorld(corridor.destination.sliceId);
        const sourceMask = this.anomalyLayerMasks.get(corridor.source.sliceId);
        const destinationMask = this.anomalyLayerMasks.get(corridor.destination.sliceId);
        if (!sourceMask || !destinationMask) throw new Error(`Anomaly ${corridor.id} references a Plane without a live renderer.`);
        const radius = Math.max(1, Math.min(40, corridor.optics?.apertureRadius ?? corridor.entryRadius ?? 3.5));
        const cameraFor = (endpoint, mask) => ({
            x: endpoint.position.x,
            y: endpoint.position.y + Math.max(18, radius * 5),
            z: endpoint.position.z - Math.max(32, radius * 9),
            targetX: endpoint.position.x,
            targetY: endpoint.position.y,
            targetZ: endpoint.position.z,
            fov: 0.9,
            maxZ: 100000,
            layerMask: mask
        });
        const common = {
            width: radius * 2,
            height: radius * 2,
            rimDiameter: radius * 2.2,
            apertureShape: corridor.view?.apertureShape ?? 'circle',
            previewSurface: corridor.view?.previewSurface ?? 'flat',
            showRim: corridor.view?.showRim === true
        };
        const sourcePortal = createPortal(this.scene, corridor.source.sliceId, this.adapter, [], {
            ...common, position: corridor.source.position, layerMask: sourceMask,
            renderLayerMask: destinationMask, camera: cameraFor(corridor.destination, destinationMask),
            rimName: `somniumAnomaly_${corridor.id}_sourceRim`
        });
        const destinationPortal = createPortal(this.scene, corridor.destination.sliceId, this.adapter, [], {
            ...common, position: corridor.destination.position, layerMask: destinationMask,
            renderLayerMask: sourceMask, camera: cameraFor(corridor.source, sourceMask),
            rimName: `somniumAnomaly_${corridor.id}_destinationRim`
        });
        const pair = {
            corridor, sourceSliceId: corridor.source.sliceId, destinationSliceId: corridor.destination.sliceId,
            sourcePortal, destinationPortal, sourceRenderer: null, destinationRenderer: null,
            presentationOffsetsByEndpoint: {
                source: { x: 0, y: 0, z: 0 }, destination: { x: 0, y: 0, z: 0 }
            }
        };
        refreshPairPresentationEndpoints(pair);
        applyPortalEndpointPose(this.scene, this.adapter, this.registry, this.anomalyLayerMasks, pair, 'source');
        applyPortalEndpointPose(this.scene, this.adapter, this.registry, this.anomalyLayerMasks, pair, 'destination');
        this.rebuildPairRenderers(pair);
        return pair;
    }

    rebuildPairRenderers(pair) {
        const ownedRenderers = new Set([pair.sourceRenderer, pair.destinationRenderer].filter(Boolean));
        for (const entry of this.corridorRenderers ?? []) {
            if (entry.corridorId === pair.corridor.id && !ownedRenderers.has(entry.renderer)) {
                entry.renderer.dispose?.();
            }
        }
        this.corridorRenderers = (this.corridorRenderers ?? []).filter(entry => entry.corridorId !== pair.corridor.id);
        pair.sourceRenderer?.dispose?.();
        pair.destinationRenderer?.dispose?.();
        pair.sourceRenderer = null;
        pair.destinationRenderer = null;
        if (pair.corridor.type !== SLICE_TRANSITION_ANOMALY) {
            const sourceWorld = this.getWorld(pair.corridor.source.sliceId);
            const destinationWorld = this.getWorld(pair.corridor.destination.sliceId);
            pair.sourceRenderer = new CorridorRenderer(this.scene, pair.corridor, sourceWorld.transform);
            pair.destinationRenderer = new CorridorRenderer(this.scene, pair.corridor, destinationWorld.transform, { anchorT: 1 });
            pair.sourceRenderer.mesh.layerMask = sourceWorld.layerMask;
            pair.destinationRenderer.mesh.layerMask = destinationWorld.layerMask;
            this.corridorRenderers.push(
                { corridorId: pair.corridor.id, sliceId: sourceWorld.slice.id, renderer: pair.sourceRenderer },
                { corridorId: pair.corridor.id, sliceId: destinationWorld.slice.id, renderer: pair.destinationRenderer }
            );
        }
    }

    rebuildTraversalController(pair, corridorChunk) {
        const existing = this.traversalController.controllers.find(entry => entry.corridor.id === pair.corridor.id);
        if (existing?.state === 'transit') throw new Error('Cannot rebuild an anomaly while its traversal is in progress.');
        if (existing) this.traversalController.removeController(pair.corridor.id);
        const sourceWorld = this.getWorld(pair.corridor.source.sliceId);
        const destinationWorld = this.getWorld(pair.corridor.destination.sliceId);
        const renderers = new Map();
        if (pair.sourceRenderer) renderers.set(sourceWorld.slice.id, pair.sourceRenderer);
        if (pair.destinationRenderer) renderers.set(destinationWorld.slice.id, pair.destinationRenderer);
        const controller = createAnomalyTraversalController({
            player: this.player,
            movementController: this.playerController,
            cameraController: this.cameraController,
            anomaly: pair.corridor,
            topology: this.topology,
            getInfluenceModifiers: this.getInfluenceModifiers,
            corridorRenderers: renderers,
            chunkGraph: this.chunkGraph,
            corridorChunk,
            source: sourceWorld,
            destination: destinationWorld,
            initialSliceId: this.traversalController.currentSliceId,
            traversal: {
                speed: 12, sprintSpeed: 18, entitySpeed: 10,
                triggerDistance: pair.corridor.entryRadius,
                triggerDistanceBySlice: {
                    [sourceWorld.slice.id]: pair.corridor.entryRadius,
                    [destinationWorld.slice.id]: pair.corridor.entryRadius
                },
                presentationEndpointsBySlice: pair.presentationEndpointsBySlice ?? {}
            }
        });
        this.traversalController.addController(controller);
    }

    rebuildAnomalyBoundaryRenderers() {
        for (const entry of this.anomalyBoundaryRenderers ?? []) entry.renderer.dispose?.();
        this.anomalyBoundaryRenderers = createAnomalyBoundaryRenderers(
            this.scene, this.portalPairs, this.registry, this.anomalyLayerMasks
        );
        for (const entry of this.anomalyBoundaryRenderers) {
            entry.renderer.setVisible(this.active && entry.anomaly.visible);
        }
    }

    removeRuntimeAnomaly(anomalyId) {
        const activeController = this.traversalController?.controllers?.find(entry => entry.corridor.id === anomalyId);
        if (activeController?.state === 'transit') {
            throw new Error('Cannot delete an anomaly while its traversal is in progress.');
        }
        const pairIndex = this.portalPairs.findIndex(entry => entry.corridor.id === anomalyId);
        if (pairIndex >= 0) {
            const [pair] = this.portalPairs.splice(pairIndex, 1);
            pair.passagePresentation?.dispose?.();
            pair.sourcePortal.dispose();
            pair.destinationPortal.dispose();
            pair.sourceRenderer?.dispose?.();
            pair.destinationRenderer?.dispose?.();
        }
        this.traversalController?.removeController?.(anomalyId);
        try { this.topology.removeCorridor(anomalyId); } catch {}
        this.chunkGraph.removeCorridor(anomalyId);
        this.corridorRenderers = (this.corridorRenderers ?? []).filter(entry => entry.corridorId !== anomalyId);
        this.rebuildAnomalyBoundaryRenderers();
        this.updatePortalLists();
        this.updateCameraPresentation();
        return pairIndex >= 0;
    }

    getWorld(sliceId) {
        const world = this.sliceWorlds?.get(sliceId) ?? [this.hypercubeWorld, this.sourceWorld, this.destinationWorld]
            .find(function matchWorld(entry) { return entry.slice.id === sliceId; });
        if (!world) throw new Error(`Unknown geometry demo slice: ${sliceId}`);
        return world;
    }

    update(deltaSeconds) {
        if (!this.active || this.disposed) return;
        // A follow camera smooths from its previous position. Remove the
        // passage's temporary display-space translation before letting that
        // controller calculate its next authoritative camera pose; otherwise
        // the follow-camera lerp would absorb the visual offset and make it
        // accumulate or drift across frames.
        for (const pair of this.portalPairs ?? []) {
            pair.passagePresentation?.restoreCameraPoseForControllerUpdate(this.camera);
        }
        this.playerController.update(deltaSeconds);
        this.traversalController.update(deltaSeconds);
        this.cameraController.update(deltaSeconds);
        const inspection = this.getEditorInspectionContext();
        const gameplaySliceId = this.cameraController.getViewSliceId();
        const viewSliceId = inspection?.sliceId ?? (Number.isFinite(this.editorWCoordinate) ? null : gameplaySliceId);
        const ambientPosition4D = inspection
            ? { ...(inspection.world?.slice?.frame?.origin ?? { x: 0, y: 0, z: 0 }), w: this.editorWCoordinate }
            : (this.cameraController.mode === 'free'
                ? this.cameraController.getFreeAmbientPosition()
                : this.traversalController.getAmbientPlayerPosition?.());
        const presentationSliceId = viewSliceId;
        this.updateAnomalyBoundaryRenderers(presentationSliceId, ambientPosition4D);
        let viewerW = 0;
        if (presentationSliceId === this.hypercubeSlice.id) {
            if (this.cameraController.mode === 'free') {
                viewerW = this.cameraController.getFreeW();
            } else if (ambientPosition4D) {
                viewerW = ambientToSlice(this.hypercubeSlice.frame, ambientPosition4D).normalOffset;
            }
        }
        if (Number.isFinite(this.editorWCoordinate)) {
            viewerW = this.editorWCoordinate - (Number(this.hypercubeSlice.frame?.origin?.w) || 0);
        }
        this.hypercubeRenderer.update(deltaSeconds, viewerW);
        this.updateHypercubeSliceHud();
        this.updateWDimensionState(presentationSliceId, ambientPosition4D);
        this.updateCameraPresentation();
        this.updatePortalPreview();
        this.updatePortalLists();
        this.updateOpticalSpotlight(deltaSeconds);
        const focus = this.getDestinationFocus();
        const focusDirection = this.destinationPreviewDirection ?? { x: 0, z: 1 };
        const reachabilityContext = ambientPosition4D ? {
            sourceSliceId: this.cameraController.mode === 'free'
                ? this.cameraController.freeSliceId : this.traversalController.currentSliceId,
            position4D: ambientPosition4D,
            influenceOptions: this.playerController.getAnomalyInfluenceModifiers?.() ??
                this.playerController.anomalyInfluenceModifiers ?? {}
        } : null;
        this.destinationWorldManager?.update(focus, focusDirection, reachabilityContext);
        const destinationMeshes = this.destinationWorldManager?.getMeshes() ?? [];
        const destinationPreviewMeshes = getDestinationPreviewRenderList(
            [...destinationMeshes, ...this.getAnomalyBoundaryMeshes(this.destination.slice.id)],
            this.destinationSpotlightRayLine
        );
        this.mainSourcePortal.setRenderList(destinationPreviewMeshes);
        this.hypercubeMainPortal.setRenderList(destinationPreviewMeshes);
    }

    updateWDimensionState(viewSliceId, position4D) {
        let freedomScale = 0;
        if (position4D) {
            const active = this.traversalController.getActiveController?.();
            if (active?.getAnomalyInfluence) {
                freedomScale = Number(active.getAnomalyInfluence(position4D)?.wMovementScale) || 0;
            } else {
                const routes = this.traversalController.getRoutesForSlice?.(viewSliceId) ?? [];
                freedomScale = routes.reduce((maximum, route) => Math.max(
                    maximum, Number(route.controller?.getAnomalyInfluence?.(position4D)?.wMovementScale) || 0
                ), 0);
            }
        }
        const world = (() => { try { return this.getWorld(viewSliceId); } catch { return null; } })();
        const playerCoordinate = Number.isFinite(position4D?.w)
            ? position4D.w : Number(world?.slice?.frame?.origin?.w) || 0;
        // While the Plane Editor is inspecting a cross-section, its global W
        // selection is the authoritative coordinate presented in the HUD.
        const coordinate = Number.isFinite(this.editorWCoordinate)
            ? this.editorWCoordinate : playerCoordinate;
        this.onWDimensionStateChanged?.({
            coordinate,
            editorInspection: Number.isFinite(this.editorWCoordinate),
            freedomPercent: Math.round(Math.max(0, Math.min(1, freedomScale)) * 100),
            movementEnabled: Boolean(this.cameraController.wMovementEnabled),
            inspectionPlaneIds: this.getEditorInspectionContext()?.includedPlaneIds ?? [],
            inspectionHasPlane: this.getEditorInspectionContext()?.hasIntersectingPlane ?? false,
            sliceId: viewSliceId,
            inTransit: Boolean(this.traversalController.state === 'transit' || this.cameraController.freeTransit)
        });
    }

    updateHypercubeSliceHud() {
        const inspecting = Number.isFinite(this.editorWCoordinate);
        const viewSliceId = inspecting ? this.getPresentationSliceId() : this.cameraController.getViewSliceId();
        if (!viewSliceId && inspecting) {
            const label = `EMPTY W-SLICE · W ${this.editorWCoordinate.toFixed(2)}`;
            if (label !== this.lastHypercubeSliceLabel) {
                this.lastHypercubeSliceLabel = label;
                this.onSliceInfoChanged?.(label, null);
            }
            return;
        }
        if (viewSliceId !== this.hypercubeSlice.id) {
            const position4D = this.cameraController.mode === 'free'
                ? this.cameraController.getFreeAmbientPosition?.()
                : this.traversalController.getAmbientPlayerPosition?.();
            const routes = this.traversalController.getRoutesForSlice?.(viewSliceId) ?? [];
            const availableFields = position4D ? routes.map((route) => ({
                route,
                influence: route.controller?.getAnomalyInfluence?.(position4D)
            })).filter((entry) => Number(entry.influence?.wMovementScale) > 0) : [];
            availableFields.sort((left, right) =>
                right.influence.wMovementScale - left.influence.wMovementScale
            );
            const best = availableFields[0] ?? null;
            const freedomPercent = best
                ? Math.round(best.influence.wMovementScale * 100) : 0;
            const label = best
                ? `W FREEDOM ACTIVE · ${freedomPercent}%`
                : 'W SLICE INACTIVE';
            if (label !== this.lastHypercubeSliceLabel) {
                this.lastHypercubeSliceLabel = label;
                this.onSliceInfoChanged?.(label, best ? {
                    anomalyId: best.route.corridorId,
                    freedom: best.influence.freedom,
                    wMovementScale: best.influence.wMovementScale,
                    wReach: best.influence.wReach,
                    position4D: { ...position4D }
                } : null);
            }
            return;
        }
        const info = this.hypercubeRenderer.getInfo();
        const active = this.cameraController.mode === 'free'
            ? this.cameraController.getFreeTransitState()
            : this.traversalController.getActiveController?.();
        const inAnomaly = (active?.state === 'transit' || active?.type === SLICE_TRANSITION_ANOMALY) &&
            active.startWorld?.slice.id === this.hypercubeSlice.id &&
            (active.spatialPosition4D || active.position4D);
        const label = inAnomaly
            ? `ANOMALY W ${info.viewerW.toFixed(2)} · ${info.sliceVertexCount} VERTICES · ${info.sliceFaceCount} FACES`
            : `W ${info.viewerW.toFixed(2)} · ${info.sliceVertexCount} VERTICES · ${info.sliceFaceCount} FACES`;
        if (label === this.lastHypercubeSliceLabel) return;
        this.lastHypercubeSliceLabel = label;
        this.onSliceInfoChanged?.(label, info);
    }

    updateCameraPresentation() {
        if (!this.corridorRenderers) return updateLegacyCameraPresentation(this);
        const inspection = this.getEditorInspectionContext();
        const inspecting = Number.isFinite(this.editorWCoordinate);
        const gameplaySliceId = this.cameraController.getViewSliceId();
        const viewSliceId = inspecting ? (inspection?.sliceId ?? null) : gameplaySliceId;
        const fallbackSliceId = viewSliceId ?? gameplaySliceId;
        const world = this.getWorld(fallbackSliceId);
        const visibleSliceIds = inspecting
            ? (inspection?.visibleSliceIds ?? new Set())
            : new Set([viewSliceId]);
        this.camera.layerMask = inspecting ? (inspection?.layerMask ?? USER_PLANE_LAYER) : world.layerMask;
        for (const entry of this.corridorRenderers) {
            entry.renderer.mesh.isVisible = this.active && visibleSliceIds.has(entry.sliceId);
        }
        for (const [sliceId, grid] of this.grids) {
            grid.setActive(this.active && visibleSliceIds.has(sliceId));
        }
        for (const pair of this.portalPairs) {
            const sourceActive = visibleSliceIds.has(pair.sourceSliceId);
            const destinationActive = visibleSliceIds.has(pair.destinationSliceId);
            const viewEnabled = pair.corridor.visible !== false && pair.corridor.view?.enabled !== false;
            pair.sourcePortal.setVisible(this.active && viewEnabled && sourceActive);
            pair.destinationPortal.setVisible(this.active && viewEnabled && destinationActive);
        }
        this.onViewChanged?.(viewSliceId, inspecting ? {
            editorInspection: true,
            coordinate: this.editorWCoordinate,
            hasIntersectingPlane: Boolean(inspection?.hasIntersectingPlane),
            includedPlaneIds: inspection?.includedPlaneIds ?? []
        } : null);
    }

    updatePortalLists() {
        const getPreviewMeshes = sliceId => {
            const layerMask = this.anomalyLayerMasks.get(sliceId);
            if (!layerMask) return [];
            return this.scene.meshes.filter(mesh => {
                if (!mesh || mesh.isDisposed?.() || mesh.isEnabled?.() === false) return false;
                const metadata = mesh.metadata ?? {};
                const belongsToPlane = (metadata.sliceId ?? metadata.planeId) === sliceId;
                // Plane-authored meshes are intentionally hidden outside their
                // own slice because custom Planes share a render layer. Keep
                // eligible hidden meshes in the portal render list; the portal
                // target temporarily reveals them while it renders this Plane.
                const hiddenOnlyBySliceContext = mesh.isVisible === false &&
                    metadata.planeObject === true && metadata.planeObjectPreviewEligible === true;
                if (mesh.isVisible === false && !hiddenOnlyBySliceContext) return false;
                if ((mesh.layerMask & layerMask) === 0) return false;
                return belongsToPlane && metadata.geometryPortal !== true &&
                    metadata.geometryPortalRim !== true && metadata.anomalyPassageMouth !== 'entry' && metadata.anomalyPassageMouth !== 'exit';
            });
        };
        for (const pair of this.portalPairs ?? []) {
            pair.sourcePortal.setRenderList(getPreviewMeshes(pair.destinationSliceId));
            pair.destinationPortal.setRenderList(getPreviewMeshes(pair.sourceSliceId));
        }
    }

    getAnomalyBoundaryMeshes(sliceId) {
        return (this.anomalyBoundaryRenderers ?? [])
            .filter((entry) => entry.sliceId === sliceId)
            .flatMap((entry) => [entry.renderer.mesh, entry.renderer.edgeMesh])
            .filter(Boolean);
    }

    updateAnomalyBoundaryRenderers(viewSliceId, ambientPosition4D) {
        for (const entry of this.anomalyBoundaryRenderers ?? []) {
            const region = entry.anomaly.region;
            const viewerInsideWSpan = ambientPosition4D &&
                ambientPosition4D.w >= region.min.w - 1e-7 &&
                ambientPosition4D.w <= region.max.w + 1e-7;
            const viewerW = entry.sliceId === viewSliceId && viewerInsideWSpan
                ? ambientPosition4D.w : entry.endpointW;
            entry.renderer.update(viewerW);
            entry.renderer.setVisible(this.active && entry.anomaly.visible);
        }
    }

    toggleSpotlightEditor() {
        this.setSpotlightEditorEnabled(!this.spotlightEditorActive);
        return this.spotlightEditorActive;
    }

    setSpotlightEditorEnabled(enabled) {
        this.spotlightEditorActive = Boolean(enabled);
        if (!this.spotlightEditorActive) this.handleSpotlightPointerUp();
        this.onSpotlightEditorStateChanged?.(this.spotlightEditorActive);
        return this.spotlightEditorActive;
    }

    toggleSpotlightTestRay() {
        return this.setSpotlightTestRayEnabled(!this.spotlightTestRayEnabled);
    }

    getDestinationFocus() {
        if (this.currentSliceId !== this.destination.slice.id && this.destinationPreviewFocus) {
            return this.destinationPreviewFocus;
        }
        if (this.cameraController.mode === 'free' &&
            this.cameraController.freeSliceId === this.destination.slice.id) {
            return this.cameraController.getFreeWorldPosition() ?? this.mainAnchor;
        }
        return this.currentSliceId === this.destination.slice.id
            ? this.player.worldPosition : this.mainAnchor;
    }

    beginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        return this.traversalController.beginEntityTransit(entity, fromSliceId);
    }

    tryBeginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        return this.traversalController.tryBeginEntityTransit(entity, fromSliceId);
    }

    toggleGrid() {
        const sliceId = this.getPresentationSliceId();
        if (!sliceId || !this.grids.has(sliceId)) return false;
        this.gridEnabled = !this.gridEnabled;
        for (const grid of this.grids.values()) grid.setVisible(this.gridEnabled);
        this.updateCameraPresentation();
        return this.gridEnabled;
    }

    initializeOpticalSpotlight() {
        const mouth = this.hypercubeMainCorridor.source.position;
        this.spotlightSource = aimOpticalSpotlightSource(createOpticalSpotlightSource({
            id: 'hypercube-main-world-spotlight',
            sliceId: this.hypercubeSlice.id,
            // Aim slightly upward through the mouth so the transported ray
            // emerges just above the Main World terrain instead of underground.
            position: { x: mouth.x - 10, y: mouth.y - 0.75, z: mouth.z },
            direction: { x: 1, y: -0.25, z: 0 },
            color: [1, 0.78, 0.48],
            intensity: 1.8,
            range: 64,
            coneAngle: 0.52,
            exponent: 3,
            enabled: true,
            castsShadows: true
        }), mouth);
        this.spotlightEditorActive = false;
        this.spotlightTestRayEnabled = true;
        this.spotlightPointerDragging = false;
        this.spotlightPreviousPointer = { x: 0, y: 0 };
        this.spotlightPointerSensitivity = 0.0035;
        this.spotlightNeedsTrace = true;
        this.spotlightTraceState = { transmitted: false, reason: 'not-traced-yet' };
        this.spotlightShadowCasters = new Set();
        this.spotlightOriginalReceiveShadows = new Map();
        this.spotlightShadowRefreshElapsed = Infinity;
        this.spotlightShadowCasterLimit = 18;
        this.spotlightVirtualSourceDistance = 0.5;
        this.spotlightDebugRayLength = 400;

        const anomalyId = this.hypercubeMainCorridor.id;
        const restrictedTopology = {
            getCorridor: (id) => this.topology.getCorridor(id),
            getOpticallyConnectedNeighbors: (sliceId) =>
                this.topology.getOpticallyConnectedNeighbors(sliceId)
                    .filter((neighbor) => neighbor.corridorId === anomalyId),
            hasOpticalConnection: (fromSliceId, toSliceId) =>
                this.topology.getOpticallyConnectedNeighbors(fromSliceId)
                    .some((neighbor) => neighbor.corridorId === anomalyId && neighbor.sliceId === toSliceId)
        };
        this.spotlightTracer = this.opticalScene
            ? createAnomalyOpticalTracer({
                topology: restrictedTopology,
                sliceRegistry: this.registry,
                sceneRegistry: this.opticalScene,
                chunkGraph: this.chunkGraph
            })
            : null;

        if (typeof BABYLON === 'undefined' || !this.scene) return;

        const sourceTransform = this.hypercubeWorld.transform;
        const sourcePosition = sourceTransform.worldToRender(this.spotlightSource.position);
        const sourceTarget = sourceTransform.worldToRender(add3(
            this.spotlightSource.position,
            scale3(this.spotlightSource.direction, 12)
        ));
        const sourceDirection = normalize3(subtract3(sourceTarget, sourcePosition));
        this.spotlightSourceLight = new BABYLON.SpotLight(
            'geometryDemoOpticalSpotlightSource',
            toBabylonVector3(sourcePosition),
            toBabylonVector3(sourceDirection),
            this.spotlightSource.coneAngle,
            this.spotlightSource.exponent,
            this.scene
        );
        this.spotlightSourceLight.diffuse = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.spotlightSourceLight.specular = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.spotlightSourceLight.intensity = this.spotlightSource.intensity;
        this.spotlightSourceLight.range = distance3(sourcePosition, sourceTarget) + 8;
        this.spotlightSourceLight.includeOnlyWithLayerMask = HYPERCUBE_LAYER;
        this.spotlightSourceLight.setEnabled(false);

        this.spotlightMarkerMaterial = new BABYLON.StandardMaterial(
            'geometryDemoOpticalSpotlightMarkerMaterial', this.scene
        );
        this.spotlightMarkerMaterial.disableLighting = true;
        this.spotlightMarkerMaterial.diffuseColor = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.spotlightMarkerMaterial.emissiveColor = BABYLON.Color3.FromArray(this.spotlightSource.color).scale(0.9);
        this.spotlightMarkerMaterial.specularColor = BABYLON.Color3.Black();
        this.spotlightMarker = BABYLON.MeshBuilder.CreateSphere(
            'geometryDemoOpticalSpotlightMarker', { diameter: 0.72, segments: 16 }, this.scene
        );
        this.spotlightMarker.position.copyFrom(toBabylonVector3(sourcePosition));
        this.spotlightMarker.material = this.spotlightMarkerMaterial;
        this.spotlightMarker.layerMask = HYPERCUBE_LAYER;
        this.spotlightMarker.isPickable = false;
        this.spotlightMarker.isVisible = false;

        this.spotlightAimLine = BABYLON.MeshBuilder.CreateLines(
            'geometryDemoOpticalSpotlightAim', {
                points: [toBabylonVector3(sourcePosition), toBabylonVector3(sourceTarget)]
            }, this.scene
        );
        this.spotlightAimLine.color = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.spotlightAimLine.layerMask = HYPERCUBE_LAYER;
        this.spotlightAimLine.isPickable = false;
        this.spotlightAimLine.isVisible = false;

        this.destinationSpotlight = new BABYLON.SpotLight(
            'geometryDemoTransmittedSpotlight', BABYLON.Vector3.Zero(),
            new BABYLON.Vector3(1, 0, 0), this.spotlightSource.coneAngle,
            this.spotlightSource.exponent, this.scene
        );
        this.destinationSpotlight.diffuse = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.destinationSpotlight.specular = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.destinationSpotlight.intensity = 0;
        this.destinationSpotlight.includeOnlyWithLayerMask = MAIN_WORLD_LAYER;
        this.destinationSpotlight.includedOnlyMeshes = [];
        this.destinationSpotlight.setEnabled(false);

        this.destinationSpotlightRayLine = BABYLON.MeshBuilder.CreateLines(
            'geometryDemoTransmittedSpotlightRay', {
                points: [BABYLON.Vector3.Zero(), new BABYLON.Vector3(1, 0, 0)]
            }, this.scene
        );
        this.destinationSpotlightRayLine.color = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.destinationSpotlightRayLine.alpha = 0.96;
        this.destinationSpotlightRayLine.layerMask = MAIN_WORLD_LAYER;
        this.destinationSpotlightRayLine.isPickable = false;
        this.destinationSpotlightRayLine.alwaysSelectAsActiveMesh = true;
        this.destinationSpotlightRayLine.metadata = {
            ...(this.destinationSpotlightRayLine.metadata || {}),
            opticalDebugRay: true,
            anomalyId: this.hypercubeMainCorridor.id,
            sourceSliceId: this.hypercubeSlice.id,
            destinationSliceId: this.destination.slice.id
        };
        this.destinationSpotlightRayLine.isVisible = false;

        if (this.spotlightSource.castsShadows && BABYLON.ShadowGenerator) {
            try {
                this.spotlightShadowGenerator = new BABYLON.ShadowGenerator(1024, this.destinationSpotlight);
                this.spotlightShadowGenerator.bias = 0.0005;
                this.spotlightShadowGenerator.normalBias = 0.02;
                this.spotlightShadowGenerator.usePercentageCloserFiltering = true;
                if (BABYLON.ShadowGenerator.QUALITY_MEDIUM !== undefined) {
                    this.spotlightShadowGenerator.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
                }
            } catch (error) {
                console.warn('[GeometryDemo] Transmitted spotlight shadow map unavailable:', error);
                this.spotlightShadowGenerator = null;
            }
        }

        this.onSpotlightEditorKeyDown = this.handleSpotlightEditorKeyDown.bind(this);
        this.onSpotlightPointerDown = this.handleSpotlightPointerDown.bind(this);
        this.onSpotlightPointerMove = this.handleSpotlightPointerMove.bind(this);
        this.onSpotlightPointerUp = this.handleSpotlightPointerUp.bind(this);
        this.onSpotlightPointerBlur = this.handleSpotlightPointerUp.bind(this);
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this.onSpotlightEditorKeyDown, true);
            window.addEventListener('pointerdown', this.onSpotlightPointerDown, true);
            window.addEventListener('pointermove', this.onSpotlightPointerMove, true);
            window.addEventListener('pointerup', this.onSpotlightPointerUp, true);
            window.addEventListener('blur', this.onSpotlightPointerBlur);
        }
        this.syncSpotlightSourcePresentation();
    }

    syncSpotlightSourcePresentation() {
        if (!this.spotlightSource || !this.spotlightSourceLight || typeof BABYLON === 'undefined') return;
        const transform = this.hypercubeWorld.transform;
        const sourcePosition = transform.worldToRender(this.spotlightSource.position);
        const sourceTarget = transform.worldToRender(add3(
            this.spotlightSource.position,
            scale3(this.spotlightSource.direction, 12)
        ));
        const direction = normalize3(subtract3(sourceTarget, sourcePosition));
        this.spotlightSourceLight.position.copyFrom(toBabylonVector3(sourcePosition));
        this.spotlightSourceLight.direction.copyFrom(toBabylonVector3(direction));
        this.spotlightSourceLight.angle = this.spotlightSource.coneAngle;
        this.spotlightSourceLight.exponent = this.spotlightSource.exponent;
        this.spotlightSourceLight.intensity = this.spotlightSource.intensity;
        this.spotlightSourceLight.range = distance3(sourcePosition, sourceTarget) + 8;
        this.spotlightMarker?.position.copyFrom(toBabylonVector3(sourcePosition));
        if (this.spotlightAimLine) {
            this.spotlightAimLine = BABYLON.MeshBuilder.CreateLines(
                'geometryDemoOpticalSpotlightAim', {
                    points: [toBabylonVector3(sourcePosition), toBabylonVector3(sourceTarget)],
                    instance: this.spotlightAimLine
                }, this.scene
            );
        }
    }

    handleSpotlightEditorKeyDown(event) {
        if (!this.active || this.disposed || event.ctrlKey || event.metaKey || event.altKey) return;
        const tagName = String(event.target?.tagName ?? '').toUpperCase();
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || event.target?.isContentEditable) return;
        if (event.code === 'KeyP' && !event.repeat) {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            this.setSpotlightTestRayEnabled(!this.spotlightTestRayEnabled);
            console.info(`[OpticalSpotlight] Test light/ray ${this.spotlightTestRayEnabled ? 'ON' : 'OFF'}.`);
            return;
        }
        if (event.code === 'KeyL' && !event.repeat) {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            this.setSpotlightEditorEnabled(!this.spotlightEditorActive);
            console.info(this.spotlightEditorActive
                ? '[OpticalSpotlight] Edit mode ON: WASD/arrows move X/Z, R/F move Y, U/O yaw, I/K pitch; drag mouse to aim; Esc exits.'
                : '[OpticalSpotlight] Edit mode OFF.');
            return;
        }
        if (!this.spotlightEditorActive) return;
        if (event.code === 'Escape') {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            this.setSpotlightEditorEnabled(false);
            console.info('[OpticalSpotlight] Edit mode OFF.');
            return;
        }
        const step = event.shiftKey ? 2 : 0.5;
        const angle = event.shiftKey ? Math.PI / 12 : Math.PI / 36;
        const movement = {
            ArrowLeft: { x: -step, y: 0, z: 0 }, KeyA: { x: -step, y: 0, z: 0 },
            ArrowRight: { x: step, y: 0, z: 0 }, KeyD: { x: step, y: 0, z: 0 },
            ArrowUp: { x: 0, y: 0, z: step }, KeyW: { x: 0, y: 0, z: step },
            ArrowDown: { x: 0, y: 0, z: -step }, KeyS: { x: 0, y: 0, z: -step },
            KeyR: { x: 0, y: step, z: 0 }, KeyF: { x: 0, y: -step, z: 0 }
        }[event.code];
        const rotations = {
            KeyU: [-angle, 0], KeyO: [angle, 0],
            KeyI: [0, angle], KeyK: [0, -angle]
        }[event.code];
        if (!movement && !rotations) return;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        this.spotlightSource = movement
            ? moveOpticalSpotlightSource(this.spotlightSource, movement)
            : rotateOpticalSpotlightSource(this.spotlightSource, rotations[0], rotations[1]);
        this.syncSpotlightSourcePresentation();
        this.spotlightNeedsTrace = true;
    }

    handleSpotlightPointerDown(event) {
        if (!this.active || this.disposed || !this.spotlightEditorActive || event.button !== 0) return;
        const canvas = this.scene?.getEngine?.()?.getRenderingCanvas?.();
        if (canvas && event.target !== canvas && !canvas.contains?.(event.target)) return;
        this.spotlightPointerDragging = true;
        this.spotlightPreviousPointer = { x: event.clientX, y: event.clientY };
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
    }

    handleSpotlightPointerMove(event) {
        if (!this.spotlightPointerDragging || !this.active || !this.spotlightEditorActive || this.disposed) return;
        const yaw = (event.clientX - this.spotlightPreviousPointer.x) * this.spotlightPointerSensitivity;
        const pitch = -(event.clientY - this.spotlightPreviousPointer.y) * this.spotlightPointerSensitivity;
        this.spotlightPreviousPointer = { x: event.clientX, y: event.clientY };
        if (Math.abs(yaw) + Math.abs(pitch) <= 1e-9) return;
        this.spotlightSource = rotateOpticalSpotlightSource(this.spotlightSource, yaw, pitch);
        this.syncSpotlightSourcePresentation();
        this.spotlightNeedsTrace = true;
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
    }

    handleSpotlightPointerUp() {
        this.spotlightPointerDragging = false;
    }

    setSpotlightTestRayEnabled(enabled) {
        this.spotlightTestRayEnabled = Boolean(enabled);
        if (this.spotlightSource) this.spotlightSource.enabled = this.spotlightTestRayEnabled;
        this.onSpotlightTestRayStateChanged?.(this.spotlightTestRayEnabled);
        this.spotlightSourceLight?.setEnabled(this.active && this.spotlightTestRayEnabled);
        if (!this.spotlightTestRayEnabled) {
            this.spotlightTraceState = { transmitted: false, reason: 'test-ray-disabled' };
            this.destinationSpotlight?.setEnabled(false);
            if (this.destinationSpotlight) this.destinationSpotlight.intensity = 0;
            if (this.destinationSpotlightRayLine) this.destinationSpotlightRayLine.isVisible = false;
            this.clearOpticalSpotlightShadowCasters();
        } else {
            this.spotlightNeedsTrace = true;
        }
        return this.spotlightTestRayEnabled;
    }

    updateOpticalSpotlight(deltaSeconds = 0) {
        if (!this.active || !this.spotlightSource) return;
        if (this.spotlightNeedsTrace) {
            this.spotlightNeedsTrace = false;
            this.refreshOpticalSpotlightTrace();
            this.spotlightShadowRefreshElapsed = Infinity;
        }
        if (this.destinationSpotlight?.isEnabled?.()) {
            this.spotlightShadowRefreshElapsed += Math.max(0, deltaSeconds || 0);
            if (this.spotlightShadowRefreshElapsed >= 0.45) {
                this.spotlightShadowRefreshElapsed = 0;
                this.updateSpotlightShadowCasters();
            }
        }
    }

    refreshOpticalSpotlightTrace() {
        if (!this.spotlightTracer || !this.destinationSpotlight) {
            this.spotlightTraceState = { transmitted: false, reason: 'optical-renderer-unavailable' };
            this.destinationSpotlight?.setEnabled(false);
            if (this.destinationSpotlightRayLine) this.destinationSpotlightRayLine.isVisible = false;
            this.clearOpticalSpotlightShadowCasters();
            return;
        }
        if (!this.spotlightTestRayEnabled || !this.spotlightSource.enabled || !this.hypercubeMainCorridor.optics?.enabled) {
            this.spotlightTraceState = { transmitted: false, reason: 'source-or-anomaly-disabled' };
            this.destinationSpotlight.setEnabled(false);
            if (this.destinationSpotlightRayLine) this.destinationSpotlightRayLine.isVisible = false;
            this.clearOpticalSpotlightShadowCasters();
            return;
        }
        const sourceBinding = this.registry.require(this.spotlightSource.sliceId);
        const destinationBinding = this.registry.require(this.destination.slice.id);
        const result = traceOpticalSpotlightSource({
            source: this.spotlightSource,
            sourceBinding,
            destinationBinding,
            tracer: this.spotlightTracer,
            anomalyId: this.hypercubeMainCorridor.id,
            virtualSourceDistance: this.spotlightVirtualSourceDistance
        });
        if (!result.transmitted) {
            this.spotlightTraceState = result;
            this.destinationSpotlight.setEnabled(false);
            this.destinationSpotlight.intensity = 0;
            if (this.destinationSpotlightRayLine) this.destinationSpotlightRayLine.isVisible = false;
            this.clearOpticalSpotlightShadowCasters();
            return;
        }

        const presentationResult = this.mapOpticalSpotlightResultToPresentation(result);
        this.spotlightTraceState = {
            ...result,
            presentationOffset: presentationResult.presentationOffset ?? { x: 0, z: 0 },
            presentationVirtualPosition: { ...presentationResult.virtualPosition },
            presentationExitPosition: { ...presentationResult.exitPosition }
        };
        const transform = destinationBinding.spatialTransform;
        const lightPosition = transform.worldToRender(presentationResult.virtualPosition);
        const directionSample = transform.worldToRender(add3(
            presentationResult.virtualPosition, scale3(result.direction, 2)
        ));
        const lightDirection = normalize3(subtract3(directionSample, lightPosition));
        const rangeSample = transform.worldToRender(add3(
            presentationResult.virtualPosition, scale3(result.direction, this.spotlightSource.range)
        ));
        this.destinationSpotlight.position.copyFrom(toBabylonVector3(lightPosition));
        this.destinationSpotlight.direction.copyFrom(toBabylonVector3(lightDirection));
        this.destinationSpotlight.angle = this.spotlightSource.coneAngle;
        this.destinationSpotlight.exponent = this.spotlightSource.exponent;
        this.destinationSpotlight.range = Math.max(1, distance3(lightPosition, rangeSample));
        this.destinationSpotlight.intensity = this.spotlightSource.intensity * result.energy;
        this.destinationSpotlight.diffuse = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.destinationSpotlight.specular = BABYLON.Color3.FromArray(this.spotlightSource.color);
        this.destinationSpotlight.setEnabled(this.active);
        this.updateDestinationSpotlightRay(presentationResult, transform);
        this.updateSpotlightShadowCasters(true);
    }

    mapOpticalSpotlightResultToPresentation(result) {
        const pair = this.portalPairs?.find((entry) => entry.corridor.id === result.anomalyId);
        const presentation = pair?.presentationEndpointsBySlice?.[result.destinationSliceId];
        const endpoint = endpointForSlice(pair?.corridor, result.destinationSliceId);
        if (!presentation || !endpoint) return result;
        const offset = {
            x: presentation.x - endpoint.position.x,
            z: presentation.z - endpoint.position.z
        };
        const translate = (position) => position ? {
            ...position, x: position.x + offset.x, z: position.z + offset.z
        } : position;
        return {
            ...result,
            exitPosition: translate(result.exitPosition),
            virtualPosition: translate(result.virtualPosition),
            presentationOffset: offset
        };
    }

    updateDestinationSpotlightRay(result, transform) {
        if (!this.destinationSpotlightRayLine || !this.active) return false;
        let projected;
        try {
            projected = projectOpticalSpotlightExitRay(
                result, transform, this.spotlightDebugRayLength ?? 400
            );
        } catch (error) {
            // A debug segment may extend beyond a finite destination chart even
            // when the aperture exit itself is valid. Hide only that diagnostic.
            if (error instanceof RangeError) {
                this.destinationSpotlightRayLine.isVisible = false;
                return false;
            }
            throw error;
        }
        if (!projected) {
            this.destinationSpotlightRayLine.isVisible = false;
            return false;
        }
        this.destinationSpotlightRayLine = BABYLON.MeshBuilder.CreateLines(
            'geometryDemoTransmittedSpotlightRay', {
                points: [
                    toBabylonVector3(projected.startRender),
                    toBabylonVector3(projected.endRender)
                ],
                instance: this.destinationSpotlightRayLine
            }, this.scene
        );
        this.destinationSpotlightRayLine.layerMask = MAIN_WORLD_LAYER;
        this.destinationSpotlightRayLine.alpha = 0.96;
        this.destinationSpotlightRayLine.isPickable = false;
        this.destinationSpotlightRayLine.isVisible = true;
        this.destinationSpotlightRayLine.metadata = {
            ...(this.destinationSpotlightRayLine.metadata || {}),
            opticalDebugRay: true,
            anomalyId: result.anomalyId,
            sourceSliceId: this.hypercubeSlice.id,
            destinationSliceId: result.destinationSliceId,
            worldStart: projected.startWorld,
            worldEnd: projected.endWorld
        };
        return true;
    }

    updateSpotlightShadowCasters(force = false) {
        if (!this.destinationSpotlight || !this.destinationWorldManager) return;
        const lightPosition = this.destinationSpotlight.position;
        const sceneMeshes = this.scene?.meshes ?? [];
        const worldMeshes = new Set([
            ...(this.destinationWorldManager.getMeshes?.() ?? []),
            ...sceneMeshes
        ]);
        const excludedName = /portal|corridor|preview|sky|cloud|water|(?:^|[-_])rain(?:[-_]|$)|debug|grid|hud|camera|geometrydemo/i;
        const maxDistance = Math.max(1, Number(this.destinationSpotlight.range) || Infinity);
        const candidates = [...worldMeshes]
            .filter((mesh) => mesh && !mesh.isDisposed?.() &&
                mesh.isEnabled?.() !== false && mesh.isVisible !== false &&
                ((mesh.layerMask ?? MAIN_WORLD_LAYER) & MAIN_WORLD_LAYER) !== 0 &&
                !excludedName.test(String(mesh.name ?? '')))
            .map((mesh) => {
                let center = mesh.position;
                try {
                    mesh.computeWorldMatrix?.(true);
                    center = mesh.getBoundingInfo?.().boundingSphere?.centerWorld ?? center;
                } catch { /* Use the mesh origin when bounds are not available yet. */ }
                return { mesh, distance: center ? distance3(center, lightPosition) : Infinity };
            })
            .filter((entry) => entry.distance <= maxDistance * 1.15)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, this.spotlightShadowCasterLimit)
            .map((entry) => entry.mesh);
        if (!this.spotlightShadowGenerator) {
            this.destinationSpotlight.includedOnlyMeshes = candidates;
            return;
        }
        const next = new Set(candidates);
        if (!force && next.size === this.spotlightShadowCasters.size &&
            [...next].every((mesh) => this.spotlightShadowCasters.has(mesh))) return;

        for (const mesh of this.spotlightShadowCasters) {
            if (next.has(mesh)) continue;
            this.spotlightShadowGenerator?.removeShadowCaster?.(mesh, false);
            if (this.spotlightOriginalReceiveShadows.has(mesh)) {
                mesh.receiveShadows = this.spotlightOriginalReceiveShadows.get(mesh);
                this.spotlightOriginalReceiveShadows.delete(mesh);
            }
        }
        for (const mesh of next) {
            if (!this.spotlightShadowCasters.has(mesh)) {
                this.spotlightOriginalReceiveShadows.set(mesh, Boolean(mesh.receiveShadows));
                this.spotlightShadowGenerator?.addShadowCaster?.(mesh, false);
            }
            mesh.receiveShadows = true;
        }
        this.spotlightShadowCasters = next;
        this.destinationSpotlight.includedOnlyMeshes = candidates;
    }

    clearOpticalSpotlightShadowCasters() {
        for (const mesh of this.spotlightShadowCasters ?? []) {
            this.spotlightShadowGenerator?.removeShadowCaster?.(mesh, false);
        }
        for (const [mesh, receiveShadows] of this.spotlightOriginalReceiveShadows ?? []) {
            if (!mesh.isDisposed?.()) mesh.receiveShadows = receiveShadows;
        }
        this.spotlightShadowCasters?.clear();
        this.spotlightOriginalReceiveShadows?.clear();
        if (this.destinationSpotlight) this.destinationSpotlight.includedOnlyMeshes = [];
    }

    getOpticalSpotlightDiagnostics() {
        return {
            source: this.spotlightSource ? {
                ...this.spotlightSource,
                position: { ...this.spotlightSource.position },
                direction: { ...this.spotlightSource.direction },
                color: [...this.spotlightSource.color]
            } : null,
            editing: Boolean(this.spotlightEditorActive),
            testRayEnabled: Boolean(this.spotlightTestRayEnabled && this.spotlightSource?.enabled),
            trace: this.spotlightTraceState ? {
                transmitted: Boolean(this.spotlightTraceState.transmitted),
                reason: this.spotlightTraceState.reason ?? null,
                anomalyId: this.spotlightTraceState.anomalyId ?? null,
                energy: this.spotlightTraceState.energy ?? 0,
                virtualPosition: this.spotlightTraceState.presentationVirtualPosition ??
                    this.spotlightTraceState.virtualPosition ?? null,
                physicalVirtualPosition: this.spotlightTraceState.virtualPosition ?? null,
                presentationOffset: this.spotlightTraceState.presentationOffset ?? null,
                direction: this.spotlightTraceState.direction ?? null,
                transitions: this.spotlightTraceState.trace?.transitions?.length ?? 0,
                pathLength: this.spotlightTraceState.diagnostics?.pathLength ?? null
            } : null,
            receiverEnabled: Boolean(this.destinationSpotlight?.isEnabled?.()),
            destinationRayVisible: Boolean(this.destinationSpotlightRayLine?.isVisible),
            destinationRayLength: this.spotlightDebugRayLength ?? 0,
            shadowGeneratorAvailable: Boolean(this.spotlightShadowGenerator),
            shadowCasterCount: this.spotlightShadowCasters?.size ?? 0,
            shadowCasterLimit: this.spotlightShadowCasterLimit,
            controls: 'L toggle edit; P test light/ray on/off; WASD/arrows move X/Z; R/F move Y; U/O yaw; I/K pitch; drag mouse to aim; Shift=faster; Escape exits'
        };
    }

    disposeOpticalSpotlight() {
        this.clearOpticalSpotlightShadowCasters();
        this.spotlightShadowGenerator?.dispose?.();
        this.destinationSpotlight?.dispose?.();
        this.destinationSpotlightRayLine?.dispose?.();
        this.spotlightSourceLight?.dispose?.();
        this.spotlightMarker?.dispose?.();
        this.spotlightAimLine?.dispose?.();
        this.spotlightMarkerMaterial?.dispose?.();
        this.spotlightTracer = null;
    }

    handleGridKeyDown(event) {
        if (!this.active || this.disposed || event.code !== 'KeyG' || event.repeat ||
            event.ctrlKey || event.metaKey || event.altKey) return;
        const tagName = String(event.target?.tagName ?? '').toUpperCase();
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || event.target?.isContentEditable) return;
        event.preventDefault?.();
        this.toggleGrid();
    }

    toggleCameraMode() { return this.cameraController.toggleMode(); }

    updatePortalPreview() {
        this.destinationPreviewFocus = null;
        this.destinationPreviewDirection = null;
        if (!this.active) return;
        if (!Array.isArray(this.portalPairs)) return updateLegacyPortalPreview(this);

        const viewSliceId = this.getPresentationSliceId();
        if (!viewSliceId) {
            for (const pair of this.portalPairs) {
                pair.sourcePortal.setVisible(false);
                pair.destinationPortal.setVisible(false);
                pair.passagePresentation?.deactivate(this.camera, this.camera.layerMask);
            }
            return;
        }
        const viewerWorld = this.getWorld(viewSliceId);
        const playerController = this.traversalController.getActiveController?.();
        const playerTransit = playerController?.state === 'transit' ? playerController : null;
        const cameraTransit = this.cameraController.getFreeTransitState();
        const transit = Number.isFinite(this.editorWCoordinate) ? null :
            (this.cameraController.mode === 'free' ? cameraTransit : playerTransit);
        const transitAnomaly = transit?.type === SLICE_TRANSITION_ANOMALY ||
            transit?.corridor?.type === SLICE_TRANSITION_ANOMALY ||
            transit?.anomaly?.type === SLICE_TRANSITION_ANOMALY;
        const transitCorridorId = transit?.corridorId ?? transit?.corridor?.id ??
            transit?.anomaly?.id ?? playerController?.corridor?.id ?? null;
        const transitTargetSliceId = transit?.targetWorld?.slice?.id ??
            transit?.target?.slice?.id ?? transit?.toSliceId ?? null;
        this.destinationApproachState = null;

        const passagePair = transitAnomaly
            ? this.portalPairs.find((entry) => entry.corridor.id === transitCorridorId)
            : null;
        for (const pair of this.portalPairs) {
            if (pair !== passagePair) {
                pair.passagePresentation?.deactivate(this.camera, viewerWorld.layerMask);
            }
        }

        if (transitAnomaly) {
            const presentation = passagePair?.passagePresentation;
            const startWorld = transit?.startWorld ?? this.getWorld(viewSliceId);
            const targetWorld = transit?.targetWorld ?? transit?.target ??
                (transitTargetSliceId ? this.getWorld(transitTargetSliceId) : null);
            if (presentation && startWorld && targetWorld) {
                const progress = clamp(transit.progress ?? 0, 0, 1);
                const viewerPresentationPosition = passagePair.presentationEndpointsBySlice?.[startWorld.slice.id];
                const exitPose = mapAnomalyCameraPose({
                    camera: this.camera, viewerWorld: startWorld, remoteWorld: targetWorld,
                    anomaly: passagePair.corridor, approachProgress: progress,
                    viewerEndpoint: viewerPresentationPosition
                        ? { sliceId: startWorld.slice.id, position: viewerPresentationPosition }
                        : null
                });
                for (const pair of this.portalPairs) {
                    pair.sourcePortal.setVisible(false);
                    pair.destinationPortal.setVisible(false);
                }
                const presentationDirection = this.cameraController.mode === 'follow' &&
                    Number.isFinite(this.player?.yaw)
                    ? { x: Math.sin(this.player.yaw), y: 0, z: Math.cos(this.player.yaw) }
                    : null;
                const passageState = presentation.update({
                    camera: this.camera, startWorld, targetWorld, progress,
                    exitCameraPose: exitPose, presentationDirection
                });
                this.destinationApproachState = {
                    anomalyId: passagePair.corridor.id, progress,
                    entryScale: passageState.entry.scale, exitScale: passageState.exit.scale,
                    mouthSeparation: passageState.separation,
                    cameraConvergence: exitPose?.approachEase ?? null,
                    remoteEyeLocalPosition: exitPose?.remoteLocalPosition ?? null
                };
                if (targetWorld.slice.id === this.destination.slice.id && exitPose?.remoteLocalPosition) {
                    this.destinationPreviewFocus = { ...exitPose.remoteLocalPosition };
                    const horizontalLength = Math.hypot(exitPose.direction.x, exitPose.direction.z);
                    this.destinationPreviewDirection = horizontalLength > 1e-6
                        ? { x: exitPose.direction.x / horizontalLength, z: exitPose.direction.z / horizontalLength }
                        : { x: 0, z: 1 };
                }
                return;
            }
        }

        for (const pair of this.portalPairs) {
            const viewingFromSource = viewSliceId === pair.sourceSliceId;
            const viewingFromDestination = viewSliceId === pair.destinationSliceId;
            if (!viewingFromSource && !viewingFromDestination) continue;

            const portal = viewingFromSource ? pair.sourcePortal : pair.destinationPortal;
            const remoteSliceId = viewingFromSource ? pair.destinationSliceId : pair.sourceSliceId;
            if (pair.corridor.visible === false) {
                portal.setVisible?.(false);
                continue;
            }
            const remoteWorld = this.getWorld(remoteSliceId);
            const approachProgress = transitAnomaly && transitCorridorId === pair.corridor.id &&
                transitTargetSliceId === remoteSliceId
                ? clamp(transit.progress ?? 0, 0, 1) : null;
            const viewConfig = pair.corridor.view ?? {
                enabled: true, mapping: 'endpoint-frame', apertureShape: 'circle',
                crossSection: 'constant', centerNormalOffset: 0
            };
            if (viewConfig.enabled === false) {
                portal.setVisible?.(false);
                continue;
            }

            if (viewConfig.mapping === 'endpoint-frame') {
                const viewerPresentationPosition = pair.presentationEndpointsBySlice?.[viewSliceId];
                const pose = mapAnomalyCameraPose({
                    camera: this.camera,
                    viewerWorld,
                    remoteWorld,
                    anomaly: pair.corridor,
                    approachProgress,
                    viewerEndpoint: viewerPresentationPosition
                        ? { sliceId: viewSliceId, position: viewerPresentationPosition }
                        : null
                });
                if (!pose) {
                    portal.setVisible?.(false);
                    continue;
                }
                portal.setCameraPose?.(pose.position, pose.target, pose.up, this.camera.fov);
                if (approachProgress !== null) {
                    this.destinationApproachState = {
                        anomalyId: pair.corridor.id,
                        progress: approachProgress,
                        cameraConvergence: pose.approachEase,
                        remoteEyeLocalPosition: { ...pose.remoteLocalPosition }
                    };
                }
                if (remoteSliceId === this.destination.slice.id) {
                    this.destinationPreviewFocus = { ...pose.remoteLocalPosition };
                    const horizontalLength = Math.hypot(pose.direction.x, pose.direction.z);
                    this.destinationPreviewDirection = horizontalLength > 1e-6
                        ? { x: pose.direction.x / horizontalLength, z: pose.direction.z / horizontalLength }
                        : { x: 0, z: 1 };
                }
            }

            const apertureScale = calculateAnomalyApertureScale({
                anomaly: pair.corridor,
                viewerWorld,
                viewConfig,
                approachProgress,
                viewingFromSource,
                viewerNormalOffset: this.getViewerNormalOffset(viewerWorld)
            });
            portal.setApertureScale?.(apertureScale);
            if (approachProgress !== null && this.destinationApproachState?.anomalyId === pair.corridor.id) {
                this.destinationApproachState.apertureScale = apertureScale;
            }
        }

        // Cubic Bezier corridors retain their established moving look-ahead
        // preview. Slice-transition anomalies instead expose a fixed 4D mouth
        // whose remote camera and visible aperture now converge smoothly as
        // the observer advances toward the far mouth.
        if (transitAnomaly) return;

        if (!transit) {
            for (const pair of this.portalPairs) {
                pair.passagePresentation?.deactivate(
                    this.camera, this.getWorld(viewSliceId).layerMask
                );
            }
            for (const pair of this.portalPairs) {
                if (pair.corridor.type !== SLICE_TRANSITION_ANOMALY) {
                    pair.sourcePortal.resetPose();
                    pair.destinationPortal.resetPose();
                }
            }
            return;
        }

        const corridorId = transit.corridorId ?? transit.corridor?.id ?? playerController?.corridor.id;
        const pair = this.portalPairs.find(function findPair(entry) { return entry.corridor.id === corridorId; });
        if (!pair) return;
        const length = transit.corridorLength ?? playerController?.corridorLength ?? 1;
        const lead = clamp(14 / Math.max(1, length), 0.08, 0.22);
        const progress = clamp(transit.progress ?? 0, 0, 1);
        const previewProgress = Math.min(0.995, progress + lead);
        const t = transit.direction > 0 ? previewProgress : 1 - previewProgress;
        const renderer = transit.activeRenderer ?? transit.renderer;
        const sample = renderer?.getDisplaySample?.(t);
        if (!sample) return;
        const portal = transit.direction > 0 ? pair.sourcePortal : pair.destinationPortal;
        portal.setPose(sample.position, scaleVector(sample.tangent, transit.direction));
        portal.setVisible(true);
        for (const other of this.portalPairs) {
            if (other === pair || other.corridor.type === SLICE_TRANSITION_ANOMALY) continue;
            other.sourcePortal.setVisible(false);
            other.destinationPortal.setVisible(false);
        }
    }

    getViewerNormalOffset(viewerWorld) {
        let position4D = null;
        if (this.cameraController.mode === 'free') {
            position4D = this.cameraController.getFreeAmbientPosition?.();
        } else {
            position4D = this.traversalController.getAmbientPlayerPosition?.();
        }
        if (!position4D) return this.cameraController.mode === 'free'
            ? (this.cameraController.getFreeW?.() ?? 0) : 0;
        return ambientToSlice(viewerWorld.slice.frame, position4D).normalOffset;
    }

    getDiagnostics() {
        return {
            defaultSlice: this.hypercubeSlice.id,
            sourceSlice: this.sourceSlice.id,
            destinationSlice: this.destination.slice.id,
            corridors: this.portalPairs.map(function describePair(pair) {
                return { id: pair.corridor.id, type: pair.corridor.type, source: pair.sourceSliceId, destination: pair.destinationSliceId };
            }),
            hypercube: this.hypercubeRenderer.getInfo(),
            chunkGraph: this.chunkGraph.getStats(),
            destinationChunking: this.destinationWorldManager?.getStats() ?? null,
            traversal: this.traversalController.getState(),
            camera: this.cameraController.getModeInfo(),
            viewSliceId: this.getPresentationSliceId(),
            visibleDestinations: this.getPresentationSliceId() ? this.topology.getVisibleDestinations(this.getPresentationSliceId()) : [],
            traversableNeighbors: this.getPresentationSliceId() ? this.topology.getTraversableNeighbors(this.getPresentationSliceId()) : [],
            editorInspection: this.getEditorInspectionContext() ? {
                coordinate: this.getEditorInspectionContext().coordinate,
                sliceId: this.getEditorInspectionContext().sliceId,
                layerMask: this.getEditorInspectionContext().layerMask,
                hasIntersectingPlane: this.getEditorInspectionContext().hasIntersectingPlane,
                includedPlaneIds: this.getEditorInspectionContext().includedPlaneIds
            } : null,
            opticalSpotlight: this.getOpticalSpotlightDiagnostics(),
            destinationApproach: this.destinationApproachState ?? null,
            portalViews: this.portalPairs.map((pair) => ({
                anomalyId: pair.corridor.id,
                view: pair.corridor.view ?? null,
                source: pair.sourcePortal.getInfo?.() ?? null,
                destination: pair.destinationPortal.getInfo?.() ?? null,
                passage: pair.passagePresentation?.getInfo?.() ?? null
            })),
            anomalyBoundaries: (this.anomalyBoundaryRenderers ?? []).map((entry) => entry.renderer.getInfo()),
            anomalyEntryDiagnostics: this.traversalController.getEntryDiagnostics?.() ?? [],
            ambientPlayerPosition4D: this.cameraController.mode === 'free'
                ? this.cameraController.getFreeAmbientPosition()
                : this.traversalController.getAmbientPlayerPosition?.() ?? null,
            sourceGrid: this.sourceGrid.getInfo(),
            hypercubeGrid: this.hypercubeGrid.getInfo(),
            mainWorldGrid: this.mainWorldGrid.getInfo(),
            metricGridEnabled: this.gridEnabled,
            geometry: this.adapter.getStats()
        };
    }

    setDestinationWorldManager(manager) {
        if (!manager || manager.sliceId !== this.destination.slice.id) {
            throw new TypeError('Geometry demo requires the main WorldManager for its destination slice.');
        }
        if (manager.chunkGraph !== this.chunkGraph || manager.spatialAdapter !== this.adapter ||
            manager.terrain !== this.destination.terrain) {
            throw new Error('Main WorldManager must share the main terrain, geometry adapter, and chunk graph.');
        }
        this.destinationWorldManager = manager;
        this.spotlightShadowRefreshElapsed = Infinity;
        this.spotlightNeedsTrace = true;
        return manager;
    }

    dispose() {
        if (this.disposed) return;
        this.setActive(false);
        this.disposed = true;
        this.activeListeners.clear();
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.onGridKeyDown);
            window.removeEventListener('keydown', this.onSpotlightEditorKeyDown, true);
            window.removeEventListener('pointerdown', this.onSpotlightPointerDown, true);
            window.removeEventListener('pointermove', this.onSpotlightPointerMove, true);
            window.removeEventListener('pointerup', this.onSpotlightPointerUp, true);
            window.removeEventListener('blur', this.onSpotlightPointerBlur);
        }
        this.disposeOpticalSpotlight();
        this.traversalController?.dispose();
        this.chunkGraph.dispose();
        this.cameraController.dispose();
        this.camera.dispose();
        this.playerController.dispose();
        this.player.dispose();
        for (const grid of this.grids.values()) grid.dispose();
        for (const pair of this.portalPairs) {
            pair.passagePresentation?.dispose();
            pair.sourcePortal.dispose();
            pair.destinationPortal.dispose();
        }
        for (const entry of this.corridorRenderers) entry.renderer.dispose();
        for (const entry of this.anomalyBoundaryRenderers ?? []) entry.renderer.dispose();
        this.hypercubeRenderer.dispose();
        disposeMeshes(this.sourceMeshes);
        disposeMeshes(this.hypercubeAuxiliaryMeshes ?? []);
        this.adapter.dispose();
        this.registry.dispose();
    }
}

function updateLegacyCameraPresentation(world) {
    const viewSliceId = world.cameraController.getViewSliceId();
    const isSource = viewSliceId === world.sourceSlice.id;
    const renderWorld = isSource ? world.sourceWorld : world.destinationWorld;
    world.camera.layerMask = renderWorld.layerMask;
    world.corridorRenderer.mesh.isVisible = world.active && isSource;
    world.destinationCorridorRenderer.mesh.isVisible = world.active && !isSource;
    world.debugGrid?.setActive(world.active && isSource && !world.cameraController.getFreeTransitState?.());
}

function updateLegacyPortalPreview(world) {
    const controller = world.traversalController;
    const playerTransit = controller.state === 'transit' ? controller : null;
    const cameraTransit = world.cameraController.getFreeTransitState?.();
    const transit = world.cameraController.mode === 'free' ? cameraTransit : playerTransit;
    const sourceActive = world.cameraController.getViewSliceId?.() === world.sourceSlice.id;
    if (!transit) {
        world.portal.resetPose();
        world.destinationPortal.resetPose();
        world.portal.setVisible(sourceActive);
        world.destinationPortal.setVisible(!sourceActive);
        world.portal.rim.isVisible = sourceActive;
        world.destinationPortal.rim.isVisible = !sourceActive;
        return;
    }
    const length = controller.corridorLength || 1;
    const lead = clamp(14 / Math.max(1, length), 0.08, 0.22);
    const progress = clamp(transit.progress ?? 0, 0, 1);
    const t = transit.direction > 0 ? Math.min(0.995, progress + lead) : 1 - Math.min(0.995, progress + lead);
    const sample = (transit.activeRenderer ?? transit.renderer ?? controller.renderer).getDisplaySample(t);
    const target = transit.direction > 0 ? world.portal : world.destinationPortal;
    const other = transit.direction > 0 ? world.destinationPortal : world.portal;
    target.setPose(sample.position, scaleVector(sample.tangent, transit.direction));
    target.setVisible(true);
    target.rim.isVisible = true;
    other.resetPose();
    other.setVisible(false);
    other.rim.isVisible = false;
}

function createHypercubeTransform() {
    return new SpatialTransform({ geometry: 'euclidean', renderScale: 1, enabled: true });
}

function createHypercubeMovementSurface() {
    return {
        min: { x: -34, y: -10, z: -30 },
        max: { x: 34, y: 20, z: 34 },
        sampleAt: function sampleHypercubeGround(x, z) {
            if (x < -34 || x > 34 || z < -30 || z > 34) return null;
            return { x, y: 0, z };
        }
    };
}

function createSourceTransform() {
    return new SpatialTransform({
        geometry: 'poincare',
        renderScale: 24,
        visualScaleGamma: 0.72,
        maxVisualScale: 3.5,
        bounds: {
            minX: -46, maxX: 46,
            minY: -5, maxY: 18,
            minZ: -48, maxZ: 46,
            characteristicLength: 0.7,
            boundaryEpsilon: 1e-5
        }
    });
}

function createDemoRoom(scene, adapter, transform, sliceId, options = {}) {
    // Plane-local database records are authoritative when migration succeeds.
    // Retain the original meshes as a graceful storage-unavailable fallback so
    // the demo remains visible even when IndexedDB cannot be opened.
    if (options.usePlaneObjects) return [];
    const palette = createRoomPalette(scene);
    const meshes = [...createRoomObjects(scene, palette), ...createRoomLabels(scene, sliceId)];
    applySliceMeshes(meshes, adapter, transform, sliceId);
    for (const mesh of meshes) mesh.layerMask = SOURCE_LAYER;
    return meshes;
}

function createRoomPalette(scene) {
    return {
        amber: makeMaterial(scene, 'demoAmber', '#e59c42', '#3b210d'),
        violet: makeMaterial(scene, 'demoViolet', '#9e78e8', '#25143f'),
        green: makeMaterial(scene, 'demoGreen', '#6ec58d', '#142b20'),
        blue: makeMaterial(scene, 'demoBlue', '#55a7dc', '#102b40')
    };
}

function createRoomObjects(scene, palette) {
    return [
        createPrimitive(scene, 'demoSphere', 'sphere', -15, 1.25, -9, palette.amber),
        createPrimitive(scene, 'demoCube', 'box', -5, 1.1, 2, palette.violet),
        createPrimitive(scene, 'demoCylinder', 'cylinder', 6, 1.1, -9, palette.green),
        createPrimitive(scene, 'demoTorus', 'torus', 15, 2.1, 7, palette.blue)
    ];
}

function createRoomLabels(scene, sliceId) {
    return [
        createWorldLabel(scene, sliceId, 'demoTitleLabel', 'SOMNIUM  |  POINCARE TEST CHAMBER', 0, 10.5, -1, 14),
        createWorldLabel(scene, sliceId, 'demoSphereLabel', '01  SPHERE  |  AMBER', -15, 4.1, -9, 7),
        createWorldLabel(scene, sliceId, 'demoCubeLabel', '02  CUBE  |  VIOLET', -5, 3.9, 2, 7),
        createWorldLabel(scene, sliceId, 'demoCylinderLabel', '03  CYLINDER  |  GREEN', 6, 4.0, -9, 8),
        createWorldLabel(scene, sliceId, 'demoTorusLabel', '04  TORUS  |  BLUE', 15, 5.0, 7, 7)
    ];
}

function createWorldLabel(scene, sliceId, name, text, x, y, z, width = 8) {
    const texture = createLabelTexture(scene, name, text);
    const material = createLabelMaterial(scene, name, texture);
    const label = createLabelPlane(scene, name, material, width);
    label.position.set(x, y, z);
    label.metadata = {
        sliceId, demoLabel: true, labelText: text,
        worldPosition: { x, y, z }
    };
    return label;
}

function createLabelTexture(scene, name, text) {
    const texture = new BABYLON.DynamicTexture(
        `${name}Texture`, { width: 1024, height: 160 }, scene, false
    );
    texture.hasAlpha = true;
    texture.drawText(
        text, null, null, 'bold 46px Arial',
        '#ffffff', 'rgba(7, 15, 28, 0.88)', true
    );
    return texture;
}

function createLabelMaterial(scene, name, texture) {
    const material = new BABYLON.StandardMaterial(`${name}Material`, scene);
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = BABYLON.Color3.White();
    material.specularColor = BABYLON.Color3.Black();
    material.backFaceCulling = false;
    material.zOffset = -2;
    return material;
}

function createLabelPlane(scene, name, material, width) {
    const label = BABYLON.MeshBuilder.CreatePlane(name, {
        width,
        height: width * 0.16,
        sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene);
    label.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    label.material = material;
    label.isPickable = false;
    return label;
}

function applySliceMeshes(meshes, adapter, transform, sliceId) {
    for (const mesh of meshes) {
        mesh.metadata = { ...(mesh.metadata || {}), sliceId, demoRoom: true };
        if (mesh.metadata.demoLabel) {
            positionWorldLabel(mesh, transform);
        } else if (!mesh.metadata.spatiallyTransformed) {
            adapter.applyMesh(mesh, sliceId);
        }
    }
}

function positionWorldLabel(mesh, transform) {
    const world = mesh.metadata.worldPosition;
    const render = transform.worldToRender(world);
    mesh.position.set(render.x, render.y, render.z);
    mesh.scaling.setAll(transform.getVisualScale(world));
}


function createPrimitive(scene, name, type, x, y, z, material) {
    const mesh = type === 'sphere'
        ? BABYLON.MeshBuilder.CreateSphere(name, { diameter: 2.4, segments: 20 }, scene)
        : type === 'box'
            ? BABYLON.MeshBuilder.CreateBox(name, { size: 2.1 }, scene)
            : type === 'cylinder'
                ? BABYLON.MeshBuilder.CreateCylinder(name, { height: 2.2, diameter: 1.8, tessellation: 24 }, scene)
                : BABYLON.MeshBuilder.CreateTorus(name, { diameter: 2.7, thickness: 0.45, tessellation: 32 }, scene);
    mesh.position.set(x, y, z);
    mesh.material = material;
    return mesh;
}

function makeMaterial(scene, name, color, emissive) {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.diffuseColor = BABYLON.Color3.FromHexString(color);
    material.emissiveColor = BABYLON.Color3.FromHexString(emissive);
    material.specularColor = new BABYLON.Color3(0.12, 0.14, 0.18);
    material.roughness = 0.86;
    return material;
}

function capturePortalOriginalGeometry(mesh) {
    mesh.metadata ??= {};
    mesh.metadata.somniumOriginalGeometry = {
        positions: Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) ?? []),
        normals: mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind)
            ? Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind)) : null,
        scaling: { x: mesh.scaling.x, y: mesh.scaling.y, z: mesh.scaling.z }
    };
}

function createPortal(scene, sliceId, adapter, renderMeshes, options = {}) {
    const position = options.position ?? { x: 0, y: 2.5, z: 20.15 };
    const width = options.width ?? 5.4;
    const height = options.height ?? 5.6;
    const rimDiameter = options.rimDiameter ?? 6.3;
    const rimThickness = options.rimThickness ?? 0.28;
    const portal = new PortalPreviewRenderer(scene, {
        position, width, height, resolution: options.resolution ?? 512,
        apertureShape: options.apertureShape ?? 'plane',
        previewSurface: options.previewSurface ?? 'flat',
        camera: { ...options.camera, layerMask: options.renderLayerMask }
    });
    portal.surface.layerMask = options.layerMask;
    portal.surface.metadata = { ...(portal.surface.metadata || {}), sliceId };
    capturePortalOriginalGeometry(portal.surface);
    adapter.applyMesh(portal.surface, sliceId);
    portal.surface.layerMask = options.layerMask;
    portal.setRenderList(renderMeshes);

    // The old torus was a legacy flat-mouth marker. Keep it opt-in for
    // anomalies that explicitly request a decorative rim; spherical mouths
    // and the current demo portals do not create it.
    if (options.showRim === true) {
        const rim = BABYLON.MeshBuilder.CreateTorus(options.rimName ?? `geometryPortalRim_${sliceId}`, {
            diameter: rimDiameter, thickness: rimThickness, tessellation: 64
        }, scene);
        rim.position.set(position.x, position.y, position.z - 0.03);
        rim.material = makeMaterial(scene, `${options.rimName ?? 'geometryPortal'}Material`, '#69d8f0', '#286d8b');
        rim.metadata = { sliceId, geometryPortalRim: true };
        rim.layerMask = options.layerMask;
        capturePortalOriginalGeometry(rim);
        adapter.applyMesh(rim, sliceId);
        rim.layerMask = options.layerMask;
        portal.rim = rim;
    }
    portal.setHomePose();
    return portal;
}


function getDestinationPreviewRenderList(meshes, opticalRayLine) {
    const renderList = Array.isArray(meshes) ? [...meshes] : [];
    if (opticalRayLine?.isVisible && !renderList.includes(opticalRayLine)) {
        renderList.push(opticalRayLine);
    }
    return renderList;
}

const MAIN_WORLD_ANOMALY_PORTAL_SPACING = 260;
const MAIN_WORLD_ANOMALY_PORTAL_SIZE = 72;

function getMainWorldAnomalyPortalLayout(anchor) {
    if (!anchor || !['x', 'y', 'z'].every((axis) => Number.isFinite(anchor[axis]))) {
        throw new TypeError('Main World anomaly portal layout requires a finite anchor.');
    }
    const makePortal = (side) => ({
        position: {
            x: anchor.x + side * MAIN_WORLD_ANOMALY_PORTAL_SPACING,
            y: anchor.y + 35,
            z: anchor.z - 2
        },
        width: MAIN_WORLD_ANOMALY_PORTAL_SIZE,
        height: MAIN_WORLD_ANOMALY_PORTAL_SIZE,
        rimDiameter: 80,
        rimThickness: 1.6
    });
    return {
        mainWorldCorridor: makePortal(-1),
        hypercubeMainWorld: makePortal(1),
        spacing: MAIN_WORLD_ANOMALY_PORTAL_SPACING * 2
    };
}

function createDestinationPortal(scene, sliceId, adapter, sourceMeshes, anchor, viewConfig = {}, layout = {}) {
    const position = layout.position ?? { x: anchor.x, y: anchor.y + 35, z: anchor.z - 2 };
    return createPortal(scene, sliceId, adapter, sourceMeshes, {
        position,
        width: layout.width ?? 72,
        height: layout.height ?? 72,
        rimDiameter: layout.rimDiameter ?? 80,
        rimThickness: layout.rimThickness ?? 1.6,
        apertureShape: viewConfig.apertureShape ?? 'circle',
        previewSurface: viewConfig.previewSurface ?? 'flat',
        showRim: viewConfig.showRim ?? false,
        layerMask: MAIN_WORLD_LAYER,
        renderLayerMask: SOURCE_LAYER,
        rimName: 'geometryDestinationPortalRim',
        camera: { x: 0, y: 28, z: 48, targetY: 2, targetZ: 0, fov: 0.95 }
    });
}

function createRoomMovementSurface() {
    return {
        min: { x: -21.5, y: 0, z: -27.5 },
        max: { x: 21.5, y: 0, z: 28 },
        sampleAt: sampleRoomElevation
    };
}

function sampleRoomElevation(x, z) {
    if (x < -21.5 || x > 21.5 || z < -27.5 || z > 28) return null;
    return { x, y: 0, z };
}

function createDemoCamera(scene) {
    const camera = new BABYLON.FreeCamera('geometryDemoThirdPersonCamera', BABYLON.Vector3.Zero(), scene);
    camera.minZ = 0.08;
    camera.maxZ = 1000;
    camera.fov = 0.82;
    return camera;
}

function endpointForSlice(anomaly, sliceId) {
    if (anomaly?.source?.sliceId === sliceId) return anomaly.source;
    if (anomaly?.destination?.sliceId === sliceId) return anomaly.destination;
    return null;
}

function toBabylonVector3(vector) {
    return new BABYLON.Vector3(vector.x, vector.y, vector.z);
}

function add3(left, right) {
    return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract3(left, right) {
    return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale3(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function distance3(left, right) {
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function normalize3(vector) {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    if (!Number.isFinite(length) || length <= 1e-10) {
        throw new RangeError('Cannot normalize a zero or invalid 3D direction.');
    }
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function scaleVector(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function disposeMeshes(meshes) {
    for (const mesh of meshes) {
        const material = mesh.material;
        if (mesh.metadata?.demoLabel) material?.diffuseTexture?.dispose();
        mesh.dispose(false, false);
        if (material && !material.isDisposed()) material.dispose();
    }
}

export { GeometryDemoWorld, createGeometryDemoWorld, getDestinationPreviewRenderList, getMainWorldAnomalyPortalLayout, MAIN_WORLD_SLICE_ID };
