/** Owns the connected 4D demo chambers and their Babylon presentation. */

import { SliceWorldRegistry } from '../world/slice-world-registry.js';
import {
    createGeometryDemoTopology, MAIN_WORLD_SLICE_ID
} from './geometry-demo-topology.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { SpatialTransform } from '../world/fields/geometry/spatial-transform.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { ambientToSlice } from '../world/fields/geometry/spatial-4d.js';
import {
    calculateAnomalyApertureScale, mapAnomalyCameraPose
} from '../world/fields/geometry/anomaly-view-transform.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { BabylonGeometryAdapter } from '../world/fields/geometry/babylon-geometry-adapter.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { CorridorRenderer } from '../world/fields/geometry/corridor-renderer.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { PortalPreviewRenderer } from '../world/fields/geometry/portal-preview-renderer.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { GeometryDebugGrid } from '../world/fields/geometry/geometry-debug-grid.js';
import { PlayerCharacter } from '../game/player-character.js';
import { PlayerController } from '../game/player-controller.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { GeometryDemoCameraController } from './geometry-demo-camera-controller.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { CorridorTraversalController } from '../world/fields/geometry/corridor-traversal-controller.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { SliceTransitionTraversalController } from '../world/fields/geometry/slice-transition-traversal-controller.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { SLICE_TRANSITION_ANOMALY } from '../world/fields/geometry/spatial-anomaly.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { CorridorTraversalNetwork } from './corridor-traversal-network.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { Hypercube4DRenderer } from './hypercube-4d-renderer.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

const SOURCE_LAYER = 0x10000000;
const HYPERCUBE_LAYER = 0x20000000;
const MAIN_WORLD_LAYER = 0x0FFFFFFF;
const ROOM_MOVEMENT_PROFILE = Object.freeze({ walkSpeed: 4.5, runSpeed: 7.5, turnSpeed: 2.4 });
const MAIN_WORLD_MOVEMENT_PROFILE = Object.freeze({ walkSpeed: 180, runSpeed: 360, turnSpeed: 2.2 });
const GEOMETRY_DEMO_BUILD = '2026-11-08-phase16d-anomaly-aperture-views-2';

async function createGeometryDemoWorld(scene, canvas, mainWorld) {
    console.info(`[GeometryDemo] Build: ${GEOMETRY_DEMO_BUILD}`);
    const data = createGeometryDemoTopology(mainWorld);
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

    const sourceMeshes = createDemoRoom(scene, adapter, sourceTransform, sourceSlice.id);
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
    const hypercubeAuxiliaryMeshes = [];

    const hypercubePortalCamera = {
        x: -28, y: 9, z: 30, targetX: -2, targetY: 3, targetZ: -2, fov: 0.9
    };
    const sourceHypercubePortalCamera = {
        x: 0, y: 10, z: -32, targetX: 0, targetY: 4, targetZ: 0, fov: 0.9
    };
    const mainPreviewCamera = createMainPreviewCamera(mainWorld.spatialTransform, mainAnchor);
    const mainSourcePortal = createPortal(scene, sourceSlice.id, adapter, [], {
        position: { x: 0, y: 2.5, z: 20.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: corridor.view?.apertureShape ?? 'circle',
        layerMask: SOURCE_LAYER, renderLayerMask: MAIN_WORLD_LAYER,
        rimName: 'geometryMainWorldPortalRim', camera: mainPreviewCamera
    });
    const mainDestinationPortal = createDestinationPortal(
        scene, mainSlice.id, adapter, [], mainAnchor, corridor.view
    );
    const hypercubeSourcePortal = createPortal(scene, hypercubeSlice.id, adapter, [], {
        position: { x: -18, y: 2.5, z: 0.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: hypercubeCorridor.view?.apertureShape ?? 'circle',
        layerMask: HYPERCUBE_LAYER, renderLayerMask: SOURCE_LAYER,
        rimName: 'geometryPoincareChamberPortalRim', camera: hypercubePortalCamera
    });
    const hypercubeDestinationPortal = createPortal(scene, sourceSlice.id, adapter, [], {
        position: { x: -18, y: 2.5, z: 0.15 },
        width: 7, height: 7, rimDiameter: 7.6,
        apertureShape: hypercubeCorridor.view?.apertureShape ?? 'circle',
        layerMask: SOURCE_LAYER, renderLayerMask: HYPERCUBE_LAYER,
        rimName: 'geometryHypercubePortalRim', camera: sourceHypercubePortalCamera
    });
    const hypercubeMainPortal = createPortal(scene, hypercubeSlice.id, adapter, [], {
        position: { x: 18, y: 2.5, z: 0.15 },
        width: 5.6, height: 5.6, rimDiameter: 6.1,
        apertureShape: hypercubeMainCorridor.view?.apertureShape ?? 'circle',
        layerMask: HYPERCUBE_LAYER, renderLayerMask: MAIN_WORLD_LAYER,
        rimName: 'geometryHypercubeMainWorldPortalRim', camera: mainPreviewCamera
    });
    const hypercubeMainDestinationPortal = createPortal(scene, mainSlice.id, adapter, [], {
        position: { x: 18, y: mainAnchor.y + 35, z: -2 },
        width: 5.6, height: 5.6, rimDiameter: 6.1, rimThickness: 0.28,
        apertureShape: hypercubeMainCorridor.view?.apertureShape ?? 'circle',
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
            sourceRenderer: mainSourceRenderer, destinationRenderer: mainDestinationRenderer
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
            destinationRenderer: null
        }
    ];
    const world = new GeometryDemoWorld({
        scene, sourceSlice, hypercubeSlice,
        destination: { slice: mainSlice, terrain: mainWorld.terrain, metadata: {
            kind: 'existing-main-world', chunkSize: mainWorld.chunkSize ?? 2000,
            exit: { ...mainAnchor }
        } },
        corridor, hypercubeCorridor, hypercubeMainCorridor, topology, registry, adapter,
        sourceMeshes, hypercubeMeshes, hypercubeAuxiliaryMeshes, hypercubeRenderer,
        sourceWorld, sourceExitWorld, hypercubeWorld, destinationWorld,
        mainSourcePortal, mainDestinationPortal, hypercubeSourcePortal, hypercubeDestinationPortal,
        hypercubeMainPortal, hypercubeMainDestinationPortal,
        portalPairs,
        mainSourceRenderer, mainDestinationRenderer,
        hypercubeSourceRenderer, hypercubeDestinationRenderer,
        sourceGrid, hypercubeGrid, mainWorldGrid,
        chunkGraph, corridorChunk, hypercubeCorridorChunk, hypercubeMainCorridorChunk,
        hypercubeMainChunkAddress, hypercubeMainDestinationChunkAddress,
        destinationWorldManager: null, mainAnchor,
        player, playerController, camera, cameraController
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
            traversal: { speed: 12, sprintSpeed: 18, entitySpeed: 10 }
        }),
        createAnomalyTraversalController({
            player, movementController: playerController, cameraController,
            anomaly: hypercubeMainCorridor, topology, getInfluenceModifiers,
            corridorRenderers: new Map(),
            chunkGraph, corridorChunk: hypercubeMainCorridorChunk,
            source: hypercubeWorld, destination: destinationWorld,
            initialSliceId: hypercubeSlice.id,
            traversal: { speed: 12, sprintSpeed: 18, entitySpeed: 10 }
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
            traversal: { speed: 12, sprintSpeed: 18, entitySpeed: 10 }
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
    return world;
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

class GeometryDemoWorld {
    constructor(resources) {
        Object.assign(this, resources);
        this.active = false;
        this.disposed = false;
        this.corridorRenderer = this.mainSourceRenderer;
        this.destinationCorridorRenderer = this.mainDestinationRenderer;
        this.didStart = false;
        this.gridEnabled = false;
        this.currentSliceId = this.hypercubeSlice.id;
        this.grids = new Map([
            [this.sourceSlice.id, this.sourceGrid],
            [this.hypercubeSlice.id, this.hypercubeGrid],
            [this.destination.slice.id, this.mainWorldGrid]
        ]);
        this.onGridKeyDown = this.handleGridKeyDown.bind(this);
        if (typeof window !== 'undefined') window.addEventListener('keydown', this.onGridKeyDown);
        this.corridorRenderers = [
            [this.sourceSlice.id, this.mainSourceRenderer],
            [this.destination.slice.id, this.mainDestinationRenderer],
            [this.hypercubeSlice.id, this.hypercubeSourceRenderer],
            [this.sourceSlice.id, this.hypercubeDestinationRenderer]
        ].filter(([, renderer]) => Boolean(renderer))
            .map(([sliceId, renderer]) => ({ sliceId, renderer }));
        this.setActive(false);
    }

    setActive(active) {
        if (this.disposed) return;
        this.active = Boolean(active);
        for (const mesh of [...this.sourceMeshes, ...this.hypercubeMeshes]) mesh.isVisible = this.active;
        this.player.root.setEnabled(this.active && this.cameraController.mode !== 'free');
        this.traversalController?.setActive(this.active);
        for (const entry of this.corridorRenderers) entry.renderer.mesh.isVisible = this.active;
        for (const pair of this.portalPairs) {
            pair.sourcePortal.setVisible(false);
            pair.destinationPortal.setVisible(false);
        }
        if (!this.active) {
            for (const grid of this.grids.values()) grid.setActive(false);
            return;
        }
        if (this.cameraController.mode !== 'follow') this.cameraController.setMode('follow');
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
        this.cameraController.setSpatialContext(renderWorld.transform, renderWorld.layerMask);
        this.player.setLayerMask(renderWorld.layerMask);
        this.updateCameraPresentation();
    }

    getWorld(sliceId) {
        const world = [this.hypercubeWorld, this.sourceWorld, this.destinationWorld]
            .find(function matchWorld(entry) { return entry.slice.id === sliceId; });
        if (!world) throw new Error(`Unknown geometry demo slice: ${sliceId}`);
        return world;
    }

    update(deltaSeconds) {
        if (!this.active || this.disposed) return;
        this.playerController.update(deltaSeconds);
        this.traversalController.update(deltaSeconds);
        this.cameraController.update(deltaSeconds);
        const viewSliceId = this.cameraController.getViewSliceId();
        const ambientPosition4D = this.cameraController.mode === 'free'
            ? this.cameraController.getFreeAmbientPosition()
            : this.traversalController.getAmbientPlayerPosition?.();
        let viewerW = 0;
        if (viewSliceId === this.hypercubeSlice.id) {
            if (this.cameraController.mode === 'free') {
                viewerW = this.cameraController.getFreeW();
            } else if (ambientPosition4D) {
                viewerW = ambientToSlice(this.hypercubeSlice.frame, ambientPosition4D).normalOffset;
            }
        }
        this.hypercubeRenderer.update(deltaSeconds, viewerW);
        this.updateHypercubeSliceHud();
        this.updateCameraPresentation();
        this.updatePortalPreview();
        this.updatePortalLists();
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
        this.mainSourcePortal.setRenderList(destinationMeshes);
        this.hypercubeMainPortal.setRenderList(destinationMeshes);
    }

    updateHypercubeSliceHud() {
        const viewSliceId = this.cameraController.getViewSliceId();
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
        const viewSliceId = this.cameraController.getViewSliceId();
        const world = this.getWorld(viewSliceId);
        this.camera.layerMask = world.layerMask;
        for (const entry of this.corridorRenderers) {
            entry.renderer.mesh.isVisible = this.active && entry.sliceId === viewSliceId;
        }
        for (const [sliceId, grid] of this.grids) {
            grid.setActive(this.active && sliceId === viewSliceId);
        }
        for (const pair of this.portalPairs) {
            const sourceActive = pair.sourceSliceId === viewSliceId;
            const destinationActive = pair.destinationSliceId === viewSliceId;
            const viewEnabled = pair.corridor.view?.enabled !== false;
            pair.sourcePortal.setVisible(this.active && viewEnabled && sourceActive);
            pair.destinationPortal.setVisible(this.active && viewEnabled && destinationActive);
        }
        this.onViewChanged?.(viewSliceId);
    }

    updatePortalLists() {
        const poincareMeshes = [
            ...this.sourceMeshes,
            this.mainSourceRenderer?.mesh,
            this.hypercubeDestinationRenderer?.mesh
        ].filter(Boolean);
        const hypercubeMeshes = [
            ...this.hypercubeMeshes,
            this.hypercubeSourceRenderer?.mesh
        ].filter(Boolean);
        this.mainDestinationPortal.setRenderList(poincareMeshes);
        this.hypercubeSourcePortal.setRenderList(poincareMeshes);
        this.hypercubeDestinationPortal.setRenderList(hypercubeMeshes);
        this.hypercubeMainDestinationPortal.setRenderList(hypercubeMeshes);
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
        const sliceId = this.cameraController.getViewSliceId();
        if (!this.grids.has(sliceId)) return false;
        this.gridEnabled = !this.gridEnabled;
        for (const grid of this.grids.values()) grid.setVisible(this.gridEnabled);
        this.updateCameraPresentation();
        return this.gridEnabled;
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

        const viewSliceId = this.cameraController.getViewSliceId();
        const viewerWorld = this.getWorld(viewSliceId);
        for (const pair of this.portalPairs) {
            const viewingFromSource = viewSliceId === pair.sourceSliceId;
            const viewingFromDestination = viewSliceId === pair.destinationSliceId;
            if (!viewingFromSource && !viewingFromDestination) continue;

            const portal = viewingFromSource ? pair.sourcePortal : pair.destinationPortal;
            const remoteSliceId = viewingFromSource ? pair.destinationSliceId : pair.sourceSliceId;
            const remoteWorld = this.getWorld(remoteSliceId);
            const viewConfig = pair.corridor.view ?? {
                enabled: true, mapping: 'endpoint-frame', apertureShape: 'circle',
                crossSection: 'constant', centerNormalOffset: 0
            };
            if (viewConfig.enabled === false) {
                portal.setVisible?.(false);
                continue;
            }

            if (viewConfig.mapping === 'endpoint-frame') {
                const pose = mapAnomalyCameraPose({
                    camera: this.camera,
                    viewerWorld,
                    remoteWorld,
                    anomaly: pair.corridor
                });
                if (!pose) {
                    portal.setVisible?.(false);
                    continue;
                }
                portal.setCameraPose?.(pose.position, pose.target, pose.up, this.camera.fov);
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
                viewerNormalOffset: this.getViewerNormalOffset(viewerWorld)
            });
            portal.setApertureScale?.(apertureScale);
        }

        // Cubic Bezier corridors retain their established moving look-ahead
        // preview. Slice-transition anomalies instead expose a fixed 4D mouth
        // whose remote camera is continuously transported above.
        const playerController = this.traversalController.getActiveController?.();
        const playerTransit = playerController?.state === 'transit' ? playerController : null;
        const cameraTransit = this.cameraController.getFreeTransitState();
        const transit = this.cameraController.mode === 'free' ? cameraTransit : playerTransit;
        const transitAnomaly = transit?.type === SLICE_TRANSITION_ANOMALY ||
            transit?.corridor?.type === SLICE_TRANSITION_ANOMALY;
        if (transitAnomaly) return;

        if (!transit) {
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
            viewSliceId: this.cameraController.getViewSliceId(),
            visibleDestinations: this.topology.getVisibleDestinations(this.cameraController.getViewSliceId()),
            traversableNeighbors: this.topology.getTraversableNeighbors(this.cameraController.getViewSliceId()),
            portalViews: this.portalPairs.map((pair) => ({
                anomalyId: pair.corridor.id,
                view: pair.corridor.view ?? null,
                source: pair.sourcePortal.getInfo?.() ?? null,
                destination: pair.destinationPortal.getInfo?.() ?? null
            })),
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
        return manager;
    }

    dispose() {
        if (this.disposed) return;
        this.setActive(false);
        this.disposed = true;
        if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onGridKeyDown);
        this.traversalController?.dispose();
        this.chunkGraph.dispose();
        this.cameraController.dispose();
        this.camera.dispose();
        this.playerController.dispose();
        this.player.dispose();
        for (const grid of this.grids.values()) grid.dispose();
        for (const pair of this.portalPairs) {
            pair.sourcePortal.dispose();
            pair.destinationPortal.dispose();
        }
        for (const entry of this.corridorRenderers) entry.renderer.dispose();
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

function createDemoRoom(scene, adapter, transform, sliceId) {
    const palette = createRoomPalette(scene);
    const meshes = [
        ...createRoomObjects(scene, palette),
        ...createRoomLabels(scene, sliceId)
    ];
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

function createPortal(scene, sliceId, adapter, renderMeshes, options = {}) {
    const position = options.position ?? { x: 0, y: 2.5, z: 20.15 };
    const width = options.width ?? 5.4;
    const height = options.height ?? 5.6;
    const rimDiameter = options.rimDiameter ?? 6.3;
    const rimThickness = options.rimThickness ?? 0.28;
    const portal = new PortalPreviewRenderer(scene, {
        position, width, height, resolution: options.resolution ?? 512,
        apertureShape: options.apertureShape ?? 'plane',
        camera: { ...options.camera, layerMask: options.renderLayerMask }
    });
    portal.surface.layerMask = options.layerMask;
    portal.surface.metadata = { ...(portal.surface.metadata || {}), sliceId };
    adapter.applyMesh(portal.surface, sliceId);
    portal.surface.layerMask = options.layerMask;
    portal.setRenderList(renderMeshes);

    const rim = BABYLON.MeshBuilder.CreateTorus(options.rimName ?? `geometryPortalRim_${sliceId}`, {
        diameter: rimDiameter, thickness: rimThickness, tessellation: 64
    }, scene);
    rim.position.set(position.x, position.y, position.z - 0.03);
    rim.material = makeMaterial(scene, `${options.rimName ?? 'geometryPortal'}Material`, '#69d8f0', '#286d8b');
    rim.metadata = { sliceId, geometryPortalRim: true };
    rim.layerMask = options.layerMask;
    adapter.applyMesh(rim, sliceId);
    rim.layerMask = options.layerMask;
    portal.rim = rim;
    portal.setHomePose();
    return portal;
}

function createDestinationPortal(scene, sliceId, adapter, sourceMeshes, anchor, viewConfig = {}) {
    const position = { x: anchor.x, y: anchor.y + 35, z: anchor.z - 2 };
    return createPortal(scene, sliceId, adapter, sourceMeshes, {
        position,
        width: 7,
        height: 7,
        rimDiameter: 7.6,
        rimThickness: 0.28,
        apertureShape: viewConfig.apertureShape ?? 'circle',
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

export { GeometryDemoWorld, createGeometryDemoWorld, MAIN_WORLD_SLICE_ID };
