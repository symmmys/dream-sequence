/** Switches between player-following and independent 3D/4D inspection views. */

import { CharacterCameraController } from '../game/camera-controller.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { add4, ambientToSlice, dot4, scale4, sliceToAmbient } from '../world/fields/geometry/spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SLICE_TRANSITION_ANOMALY } from '../world/fields/geometry/spatial-anomaly.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { resolveAnomalyInfluence } from '../world/fields/geometry/anomaly-influence-field.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const CAMERA_BUILD = '2026-11-10-phase18o-active-w-slice-navigation-1';
const MOVEMENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyE', 'KeyQ', 'ShiftLeft'];

class GeometryDemoCameraController extends CharacterCameraController {
    constructor(scene, camera, character, transform, playerController, options = {}) {
        super(scene, camera, character, transform, options);
        this.playerController = playerController;
        this.traversal = null;
        this.mode = 'follow';
        this.freeKeys = new Set();
        this.freePosition = null;
        this.freeSliceId = null;
        this.freeW = 0;
        this.wMovementEnabled = false;
        this.freeEntryLock = null;
        this.freeTransit = null;
        this.freeYaw = 0;
        this.freePitch = 0;
        this.lookYawOffset = 0;
        this.lookPitchOffset = 0;
        this.freeSpeed = options.freeSpeed ?? 18;
        this.freeEntryDistance = options.freeEntryDistance ?? 14;
        this.freeTransverseSpeed = options.freeTransverseSpeed ?? 7;
        this.freeMouseSensitivity = options.freeMouseSensitivity ?? 0.0035;
        this.freeDragging = false;
        this.previousMouse = { x: 0, y: 0 };
        this.onFreeKeyDown = this.handleFreeKeyDown.bind(this);
        this.onFreeKeyUp = this.handleFreeKeyUp.bind(this);
        this.onFreeBlur = this.handleFreeBlur.bind(this);
        this.onFreePointerDown = this.handleFreePointerDown.bind(this);
        this.onFreePointerMove = this.handleFreePointerMove.bind(this);
        this.onFreePointerUp = this.handleFreePointerUp.bind(this);
        window.addEventListener('keydown', this.onFreeKeyDown);
        window.addEventListener('keyup', this.onFreeKeyUp);
        window.addEventListener('blur', this.onFreeBlur);
        this.canvas?.addEventListener('pointerdown', this.onFreePointerDown);
        window.addEventListener('pointermove', this.onFreePointerMove);
        window.addEventListener('pointerup', this.onFreePointerUp);
        this.onModeChanged = options.onModeChanged ?? function ignoreModeChange() {};
        console.info(`[GeometryDemoCamera] Build: ${CAMERA_BUILD}`);
    }


    setTraversalController(controller) {
        this.traversal = controller;
    }

    setWMovementEnabled(enabled) {
        this.wMovementEnabled = Boolean(enabled);
        this.freeKeys.delete('KeyE');
        this.freeKeys.delete('KeyQ');
        this.onWMovementChanged?.(this.wMovementEnabled);
        return this.wMovementEnabled;
    }

    toggleWMovementEnabled() {
        return this.setWMovementEnabled(!this.wMovementEnabled);
    }

    setEnabled(enabled) {
        if (!enabled && this.mode === 'free') this.setMode('follow');
        super.setEnabled(enabled);
        this.playerController?.setInputEnabled(this.mode !== 'free');
        if (!enabled) this.freeKeys.clear();
    }

    toggleMode() {
        return this.setMode(this.mode === 'follow' ? 'free' : 'follow');
    }

    setMode(mode) {
        if (!['follow', 'free'].includes(mode)) throw new RangeError(`Unknown geometry camera mode: ${mode}`);
        if (mode === this.mode) return this.mode;
        if (mode === 'free' && (!this.enabled || this.disposed)) return this.mode;
        if (mode === 'free') this.enterFreeMode();
        else this.enterFollowMode();
        this.mode = mode;
        this.playerController?.setInputEnabled(mode !== 'free');
        this.character.root?.setEnabled(mode !== 'free');
        this.freeKeys.clear();
        this.freeDragging = false;
        this.onModeChanged(mode);
        if (mode === 'follow' && this.enabled) super.setEnabled(true);
        return this.mode;
    }

    enterFreeMode() {
        this.lookYawOffset = 0;
        this.lookPitchOffset = 0;
        this.freePosition = copyVector(this.camera.position);
        const forward = this.camera.getForwardRay().direction;
        this.freeYaw = Math.atan2(forward.x, forward.z);
        this.freePitch = Math.asin(clamp(forward.y, -1, 1));
        const traversal = this.traversal;
        this.freeSliceId = traversal?.state === 'transit'
            ? traversal.startWorld.slice.id
            : traversal?.currentSliceId ?? this.character.sliceId;
        const initialWorld = traversal?.worlds.get(this.freeSliceId);
        this.constrainFreePosition(initialWorld);
        const initialMinW = Number.isFinite(initialWorld?.wBounds?.min) ? initialWorld.wBounds.min : -12;
        const initialMaxW = Number.isFinite(initialWorld?.wBounds?.max) ? initialWorld.wBounds.max : 12;
        this.freeW = clamp(Number.isFinite(this.freeW) ? this.freeW : 0, initialMinW, initialMaxW);
        const world = traversal?.worlds.get(this.freeSliceId);
        if (world) this.setSpatialContext(world.transform, world.layerMask);
        this.freeTransit = traversal?.state === 'transit'
            ? this.createTransitFromPlayer(traversal)
            : null;
        if (this.freeTransit) this.updateFreeTransitCamera();
    }

    enterFollowMode() {
        const worldId = this.character.sliceId ?? this.traversal?.currentSliceId;
        const world = this.traversal?.worlds.get(worldId);
        if (world) this.setSpatialContext(world.transform, world.layerMask);
        this.freeTransit = null;
        this.freePosition = null;
        this.freeSliceId = null;
        this.freeW = 0;
    }

    setFreeView(position, target, sliceId, w = 0) {
        this.freeSliceId = sliceId;
        const targetWorld = this.traversal?.worlds.get(sliceId);
        const minW = Number.isFinite(targetWorld?.wBounds?.min) ? targetWorld.wBounds.min : -12;
        const maxW = Number.isFinite(targetWorld?.wBounds?.max) ? targetWorld.wBounds.max : 12;
        this.freeW = clamp(Number.isFinite(w) ? w : 0, minW, maxW);
        this.freePosition = copyVector(position);
        const direction = normalize3(subtract3(target, position));
        this.freeYaw = Math.atan2(direction.x, direction.z);
        this.freePitch = Math.asin(clamp(direction.y, -1, 1));
        const world = this.traversal?.worlds.get(sliceId);
        if (world) {
            this.setSpatialContext(world.transform, world.layerMask);
            this.constrainFreePosition(world);
        }
        this.applyFreePose();
    }

    createTransitFromPlayer(traversal) {
        const active = traversal.getActiveController?.() ?? traversal;
        if (active.corridor?.type === SLICE_TRANSITION_ANOMALY) {
            return {
                type: SLICE_TRANSITION_ANOMALY,
                controller: active,
                anomaly: active.corridor,
                corridor: active.corridor,
                startWorld: active.startWorld,
                targetWorld: active.target,
                direction: active.direction,
                progress: active.progress,
                position4D: active.spatialPosition4D ? { ...active.spatialPosition4D } : null,
                bounds: active.corridor.region
            };
        }
        const length = active.corridorLength || traversal.corridorLength;
        const lag = Math.min(0.18, (this.distance || 0) / length);
        return {
            type: 'bezier',
            controller: active,
            startWorld: active.startWorld,
            targetWorld: active.target,
            direction: active.direction,
            progress: clamp(active.progress - lag, 0, 1),
            offsetU: active.offsetU,
            offsetV: active.offsetV,
            offsetW: active.offsetW,
            renderer: active.activeRenderer,
            corridorLength: length
        };
    }

    handleWheel(event) {
        if (this.mode !== 'free') return super.handleWheel(event);
        if (!this.enabled || this.disposed) return;
        event.preventDefault();
        this.freeSpeed = clamp(this.freeSpeed * Math.exp(-event.deltaY * 0.001), 2, 120);
    }

    handleFreeKeyDown(event) {
        if (!this.enabled || this.disposed) return;
        // Do not intercept browser shortcuts (notably Ctrl+R / Cmd+R).
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === 'KeyC' && !event.repeat) {
            event.preventDefault();
            this.toggleMode();
            return;
        }
        if (this.mode !== 'free' || !MOVEMENT_KEYS.includes(event.code)) return;
        this.freeKeys.add(event.code);
        event.preventDefault();
    }

    handleFreeKeyUp(event) {
        this.freeKeys.delete(event.code);
    }

    handleFreeBlur() {
        this.freeKeys.clear();
        this.freeDragging = false;
    }

    handleFreePointerDown(event) {
        if (!this.enabled || this.mode !== 'free' || event.button !== 0) return;
        this.freeDragging = true;
        this.previousMouse = { x: event.clientX, y: event.clientY };
        event.preventDefault();
    }

    handleFreePointerMove(event) {
        if (!this.freeDragging || !this.enabled || this.mode !== 'free' || this.disposed) return;
        const yawDelta = (event.clientX - this.previousMouse.x) * this.freeMouseSensitivity;
        const pitchDelta = -(event.clientY - this.previousMouse.y) * this.freeMouseSensitivity;
        if (this.freeTransit) {
            this.lookYawOffset += yawDelta;
            this.lookPitchOffset = clamp(this.lookPitchOffset + pitchDelta, -1.2, 1.2);
        } else {
            this.freeYaw += yawDelta;
            this.freePitch = clamp(this.freePitch + pitchDelta, -1.48, 1.48);
        }
        this.previousMouse = { x: event.clientX, y: event.clientY };
    }

    handleFreePointerUp() {
        this.freeDragging = false;
    }

    update(deltaSeconds) {
        if (this.mode === 'follow') {
            super.update(deltaSeconds);
            return;
        }
        if (!this.enabled || this.disposed) return;
        const delta = clamp(deltaSeconds, 0, 0.1);
        const input = this.getFreeInput();
        if (this.freeTransit?.type === SLICE_TRANSITION_ANOMALY) this.updateFreeAnomaly(delta, input);
        else if (this.freeTransit) this.updateFreeTransit(delta, input);
        else if (!this.tryEnterCorridor(input.forward)) this.updateFreeWorld(delta, input);
    }

    getFreeInput() {
        return {
            forward: keyAxis(this.freeKeys, 'KeyW', 'KeyS'),
            strafe: keyAxis(this.freeKeys, 'KeyD', 'KeyA'),
            vertical: keyAxis(this.freeKeys, 'KeyR', 'KeyF'),
            crossSectionW: keyAxis(this.freeKeys, 'KeyE', 'KeyQ'),
            sprint: this.freeKeys.has('ShiftLeft')
        };
    }

    updateFreeWorld(delta, input) {
        const speed = this.freeSpeed * (input.sprint ? 2 : 1);
        const forward = this.getForwardVector();
        const right = { x: Math.cos(this.freeYaw), y: 0, z: -Math.sin(this.freeYaw) };
        const movement = add3(
            add3(scale3(forward, input.forward), scale3(right, input.strafe)),
            { x: 0, y: input.vertical, z: 0 }
        );
        const length = length3(movement);
        if (length > 1e-9) {
            const candidate = add3(
                this.freePosition,
                scale3(movement, speed * delta / Math.max(1, length))
            );
            this.freePosition = this.constrainFreePosition(
                this.traversal?.worlds.get(this.freeSliceId), candidate
            );
        }
        const movedAlongAnomaly = this.advanceFreeInfluenceMovement(delta, input, speed);
        // With the playtest override enabled, E/Q move the inspection cross-section
        // through the Plane's actual W thickness even when no anomaly is nearby.
        // W is centered on the Plane frame origin and bounded by its container.
        const activeWorld = this.traversal?.worlds.get(this.freeSliceId);
        if (input.crossSectionW && !movedAlongAnomaly && this.wMovementEnabled) {
            const bounds = activeWorld?.wBounds;
            let minW = Number.isFinite(bounds?.min) ? bounds.min : -12;
            let maxW = Number.isFinite(bounds?.max) ? bounds.max : 12;
            if (this.wMovementEnabled && maxW - minW < 1e-6) { minW = -12; maxW = 12; }
            this.freeW = clamp(this.freeW + input.crossSectionW * speed * delta, minW, maxW);
        }
        this.applyFreePose();
    }

    advanceFreeInfluenceMovement(delta, input, speed) {
        if (!input.crossSectionW || !this.traversal || !this.freeSliceId) return false;
        const world = this.traversal.worlds.get(this.freeSliceId);
        const worldPosition = this.renderFreePositionToWorld(world);
        if (!world || !worldPosition) return false;
        const routes = this.traversal.getRoutesForSlice?.(this.freeSliceId) ?? this.getLegacyRoute();
        const candidates = routes.map((route) => {
            const physicalPosition = route.controller?.getPhysicalEndpointLocalPosition?.(world, worldPosition) ?? worldPosition;
            const base = sliceToAmbient(world.slice.frame, physicalPosition);
            const current = add4(base, scale4(world.slice.frame.normal, this.freeW));
            const info = route.controller?.getInfluenceMovementInfo?.(
                current, input.crossSectionW, this.freeSliceId, { ignoreFreedom: this.wMovementEnabled }
            );
            return info ? { route, info, current } : null;
        }).filter(Boolean).sort((left, right) =>
            right.info.movementScale - left.info.movementScale
        );
        if (!candidates.length) return false;

        const { route, info, current } = candidates[0];
        const amount = Math.sign(input.crossSectionW) * speed * delta * info.movementScale;
        if (Math.abs(amount) <= 1e-10) return false;
        const normal = world.slice.frame.normal;
        let candidate = add4(current, scale4(normal, amount));
        const nextPlane = dot4(candidate, normal);
        const targetPlane = dot4(info.targetWorld.slice.frame.origin, normal);
        const crossed = info.direction > 0
            ? nextPlane >= targetPlane - 1e-8
            : nextPlane <= targetPlane + 1e-8;

        if (crossed) {
            candidate = add4(candidate, scale4(normal, targetPlane - nextPlane));
            const sourceLocal = ambientToSlice(world.slice.frame, candidate).position;
            const targetLocal = ambientToSlice(info.targetWorld.slice.frame, candidate).position;
            const graph = route.controller?.chunkGraph;
            const sourceAddress = graph?.getAddress(this.freeSliceId, sourceLocal);
            const targetAddress = graph?.getAddress(info.targetSliceId, targetLocal);
            const reachability = sourceAddress && targetAddress
                ? graph.getReachability(sourceAddress, targetAddress, {
                    position4D: candidate, corridorId: info.anomalyId
                }) : { reachable: true };
            if (reachability.reachable) {
                this.completeFreeInfluenceHandoff(info.targetWorld, candidate, route, world);
                return true;
            }
            candidate = add4(candidate, scale4(normal, -info.direction * 1e-7));
        }

        this.freeW = ambientToSlice(world.slice.frame, candidate).normalOffset;
        return true;
    }

    completeFreeInfluenceHandoff(world, position4D, route = null, fromWorld = null) {
        const local = route?.controller?.createArrivalPosition
            ? route.controller.createArrivalPosition(world, position4D, fromWorld)
            : ambientToSlice(world.slice.frame, position4D).position;
        const arrival = world.transform?.constrainWorldPosition?.(local) ?? local;
        this.freeSliceId = world.slice.id;
        this.freeW = 0;
        this.freeTransit = null;
        this.freeEntryLock = { sliceId: world.slice.id, position: { ...arrival } };
        this.setSpatialContext(world.transform, world.layerMask);
        this.freePosition = world.transform.worldToRender(arrival);
        this.applyFreePose();
    }

    getFreeAmbientPosition() {
        if (this.mode !== 'free' || !this.freePosition || !this.freeSliceId) return null;
        if (this.freeTransit?.position4D) return { ...this.freeTransit.position4D };
        const world = this.traversal?.worlds.get(this.freeSliceId);
        const position = this.renderFreePositionToWorld(world);
        if (!world || !position) return null;
        const routes = this.traversal.getRoutesForSlice?.(this.freeSliceId) ?? this.getLegacyRoute();
        const nearby = routes.find((route) =>
            route.controller?.isNearPresentationPortal?.(this.freeSliceId, position)
        );
        const physicalPosition = nearby?.controller?.getPhysicalEndpointLocalPosition?.(world, position) ?? position;
        return add4(
            sliceToAmbient(world.slice.frame, physicalPosition),
            scale4(world.slice.frame.normal, this.freeW)
        );
    }

    tryEnterCorridor(forwardInput) {
        if (forwardInput <= 0 || !this.traversal || !this.freeSliceId) return false;
        if (this.freeEntryLock?.sliceId === this.freeSliceId) {
            const world = this.traversal.worlds.get(this.freeSliceId);
            const position = this.renderFreePositionToWorld(world);
            if (position && Math.hypot(
                position.x - this.freeEntryLock.position.x,
                position.z - this.freeEntryLock.position.z
            ) < 1.25) return false;
            this.freeEntryLock = null;
        }
        const routes = this.traversal.getRoutesForSlice?.(this.freeSliceId) ?? this.getLegacyRoute();
        for (const route of routes) {
            const corridor = route.corridor;
            const fromSource = route.fromSource ?? (corridor.source.sliceId === this.freeSliceId);
            const endpoint = fromSource ? corridor.source : corridor.destination;
            const world = this.traversal.worlds.get(this.freeSliceId);
            const renderer = route.renderer ?? route.controller?.renderers?.get(this.freeSliceId);
            const presentationEndpoint = route.controller?.getPresentationEndpoint?.(this.freeSliceId);
            const mouthLocal = presentationEndpoint ?? endpoint.position;
            const mouth = renderer?.getDisplaySample(fromSource ? 0 : 1).position ??
                world?.transform?.worldToRender(mouthLocal);
            if (!mouth) continue;
            const delta = subtract3(mouth, this.freePosition);
            const distance = length3(delta);
            const entryDistance = corridor.type === SLICE_TRANSITION_ANOMALY
                ? (route.controller?.getEntryTriggerDistance?.(this.freeSliceId) ?? corridor.entryRadius ?? this.freeEntryDistance)
                : this.freeEntryDistance;
            if (distance > entryDistance) continue;
            const facing = distance < 1e-6 ? 1 :
                dot3(this.getForwardVector(), scale3(delta, 1 / distance));
            if (facing < 0.25) continue;
            const startWorld = world;
            const targetWorld = this.traversal.worlds.get(route.sliceId);
            if (!startWorld || !targetWorld) continue;
            this.lookYawOffset = 0;
            this.lookPitchOffset = 0;
            if (corridor.type === SLICE_TRANSITION_ANOMALY) {
                const position3 = this.renderFreePositionToWorld(startWorld);
                if (!position3) continue;
                const physicalPosition3 = route.controller?.getPhysicalEndpointLocalPosition?.(startWorld, position3) ?? position3;
                const basePosition4D = sliceToAmbient(startWorld.slice.frame, physicalPosition3);
                const position4D = add4(basePosition4D, scale4(startWorld.slice.frame.normal, this.freeW));
                const resolvedAnomaly = corridor.influence?.center ? corridor : resolveAnomalyInfluence(
                    corridor,
                    sliceToAmbient(startWorld.slice.frame, fromSource ? corridor.source.position : corridor.destination.position),
                    sliceToAmbient(targetWorld.slice.frame, fromSource ? corridor.destination.position : corridor.source.position),
                    startWorld.slice.frame.normal
                );
                if (!isInsideBounds(position4D, resolvedAnomaly.region)) continue;
                this.freeTransit = {
                    type: SLICE_TRANSITION_ANOMALY,
                    controller: route.controller ?? this.traversal,
                    anomaly: resolvedAnomaly,
                    corridor: resolvedAnomaly,
                    startWorld,
                    targetWorld,
                    direction: fromSource ? 1 : -1,
                    position4D,
                    bounds: corridor.region,
                    progress: 0
                };
                this.freeW = ambientToSlice(startWorld.slice.frame, position4D).normalOffset;
                this.updateFreeAnomalyCamera();
            } else {
                if (!renderer) continue;
                this.freeTransit = {
                    type: 'bezier',
                    controller: route.controller ?? this.traversal,
                    corridor,
                    corridorId: corridor.id,
                    corridorLength: route.corridorLength ?? route.controller?.corridorLength ?? this.traversal.corridorLength,
                    startWorld, targetWorld,
                    direction: fromSource ? 1 : -1,
                    progress: 0, offsetU: 0, offsetV: 0, offsetW: 0, renderer
                };
                this.updateFreeTransitCamera();
            }
            return true;
        }
        return false;
    }

    getLegacyRoute() {
        const corridor = this.traversal?.corridor;
        if (!corridor) return [];
        const link = this.traversal.topology?.getTraversableNeighbors(this.freeSliceId)
            .find(function findLink(neighbor) { return neighbor.corridorId === corridor.id; });
        return link ? [{
            ...link, corridor,
            fromSource: corridor.source.sliceId === this.freeSliceId,
            renderer: this.traversal.renderers?.get(this.freeSliceId) ?? this.traversal.renderer,
            controller: this.traversal,
            corridorLength: this.traversal.corridorLength
        }] : [];
    }

    updateFreeAnomaly(delta, input) {
        const transit = this.freeTransit;
        const frame = transit.startWorld.slice.frame;
        const speed = this.freeSpeed * (input.sprint ? 2 : 1);
        const forward = this.getForwardVector();
        const right = { x: Math.cos(this.freeYaw), y: 0, z: -Math.sin(this.freeYaw) };
        const movement = add3(
            add3(scale3(forward, input.forward), scale3(right, input.strafe)),
            { x: 0, y: input.vertical, z: 0 }
        );
        const length = length3(movement);
        const distance = length > 1e-9 ? speed * delta / Math.max(1, length) : 0;
        const raw = { ...transit.position4D };
        for (const [index, key] of ['x', 'y', 'z'].entries()) {
            const component = key === 'x' ? movement.x : key === 'y' ? movement.y : movement.z;
            const axis = frame.axes[index];
            raw.x += axis.x * component * distance;
            raw.y += axis.y * component * distance;
            raw.z += axis.z * component * distance;
            raw.w += axis.w * component * distance;
        }
        // W remains an independent axis inside the anomaly passage.
        const wStep = input.crossSectionW * speed * delta;
        raw.x += frame.normal.x * wStep;
        raw.y += frame.normal.y * wStep;
        raw.z += frame.normal.z * wStep;
        raw.w += frame.normal.w * wStep;

        const startPlane = dot4(frame.origin, frame.normal);
        const targetPlane = dot4(transit.targetWorld.slice.frame.origin, frame.normal);
        const currentPlane = dot4(transit.position4D, frame.normal);
        const nextPlane = dot4(raw, frame.normal);
        const targetDirection = Math.sign(targetPlane - startPlane);
        const reachedTarget = targetDirection > 0
            ? nextPlane >= targetPlane - 1e-8
            : nextPlane <= targetPlane + 1e-8;
        const hasEnteredSliceInterval = (currentPlane - startPlane) * targetDirection > 1e-8;
        const returnedToSource = hasEnteredSliceInterval &&
            (nextPlane - currentPlane) * targetDirection < -1e-8 &&
            (nextPlane - startPlane) * targetDirection <= 1e-8;

        transit.position4D = clampAmbient(raw, transit.bounds);
        transit.position4D = constrainAmbientPositionToWorldChart(transit.startWorld, transit.position4D);
        transit.progress = clamp((dot4(transit.position4D, frame.normal) - startPlane) /
            (targetPlane - startPlane), 0, 1);
        if (reachedTarget) {
            transit.position4D = clampAmbient(raw, transit.bounds);
            this.completeFreeAnomaly(transit.targetWorld, transit);
        } else if (returnedToSource) {
            this.completeFreeAnomaly(transit.startWorld, transit);
        } else {
            this.updateFreeAnomalyCamera();
        }
    }

    updateFreeAnomalyCamera() {
        const transit = this.freeTransit;
        if (!transit) return;
        transit.position4D = constrainAmbientPositionToWorldChart(transit.startWorld, transit.position4D);
        const local = ambientToSlice(transit.startWorld.slice.frame, transit.position4D).position;
        this.freePosition = transit.startWorld.transform.worldToRender(local);
        this.freeW = ambientToSlice(transit.startWorld.slice.frame, transit.position4D).normalOffset;
        this.applyFreePose();
    }

    completeFreeAnomaly(world, transit) {
        const ambient = transit.position4D;
        const controller = transit.controller;
        const baseArrival = controller?.createArrivalPosition
            ? controller.createArrivalPosition(world, ambient, transit.startWorld)
            : ambientToSlice(world.slice.frame, ambient).position;
        const arrival = { ...baseArrival, y: baseArrival.y + 4 };
        this.freeSliceId = world.slice.id;
        this.freeEntryLock = { sliceId: world.slice.id, position: { x: arrival.x, y: arrival.y, z: arrival.z } };
        const chartSafeArrival = world.transform.constrainWorldPosition?.(arrival) ?? arrival;
        this.freeW = 0;
        this.setSpatialContext(world.transform, world.layerMask);
        this.freePosition = world.transform.worldToRender(chartSafeArrival);
        this.freeTransit = null;
        this.applyFreePose();
    }

    updateFreeTransit(delta, input) {
        const transit = this.freeTransit;
        const speed = this.freeSpeed * (input.sprint ? 2 : 1);
        transit.progress = clamp(
            transit.progress + input.forward * speed * delta / (transit.corridorLength ?? this.traversal.corridorLength),
            0,
            1
        );
        transit.offsetU += input.strafe * this.freeTransverseSpeed * delta;
        transit.offsetV += input.vertical * this.freeTransverseSpeed * delta;
        transit.offsetW += input.crossSectionW * this.freeTransverseSpeed * delta;
        this.constrainFreeOffset(transit);
        if (transit.progress >= 1 || (transit.progress <= 0 && input.forward < 0)) {
            this.updateFreeTransitCamera();
            const destination = transit.progress >= 1 ? transit.targetWorld : transit.startWorld;
            this.completeFreeTransit(destination, transit);
            return;
        }
        this.updateFreeTransitCamera();
    }

    constrainFreeOffset(transit) {
        const sample = this.getFreeCorridorSample(transit);
        const scale = transit.renderer.options?.displayScale ?? 1;
        const limit = sample.radius / Math.max(scale, 1e-9) * 0.62;
        const length = Math.hypot(transit.offsetU, transit.offsetV, transit.offsetW);
        if (length <= limit || length <= 1e-9) return;
        const factor = limit / length;
        transit.offsetU *= factor;
        transit.offsetV *= factor;
        transit.offsetW *= factor;
    }

    getFreeCorridorSample(transit) {
        const t = transit.direction > 0 ? transit.progress : 1 - transit.progress;
        return transit.renderer.getDisplaySample(t);
    }

    updateFreeTransitCamera() {
        const transit = this.freeTransit;
        const sample = this.getFreeCorridorSample(transit);
        const scale = transit.renderer.options?.displayScale ?? 1;
        const axes = getDisplayAxes(sample);
        const position = add3(
            add3(
                add3(sample.position, scale3(axes[0], transit.offsetU * scale)),
                scale3(axes[1], transit.offsetV * scale)
            ),
            scale3(axes[2], transit.offsetW * scale)
        );
        this.freePosition = position;
        const tangent = normalize3(sample.tangent);
        const tangentYaw = Math.atan2(tangent.x * transit.direction, tangent.z * transit.direction);
        const tangentPitch = Math.asin(clamp(tangent.y * transit.direction, -1, 1));
        this.freeYaw = tangentYaw + this.lookYawOffset;
        this.freePitch = clamp(tangentPitch + this.lookPitchOffset, -1.48, 1.48);
        this.applyFreePose();
        transit.spatialPosition4D = applyAmbientOffsets(sample, transit);
    }

    completeFreeTransit(world, transit) {
        const ambientPosition = transit.spatialPosition4D ?? this.getAmbientPosition(transit);
        const arrival = (transit.controller ?? this.traversal).createArrivalPosition(world, ambientPosition);
        const rawCameraWorld = { ...arrival, y: arrival.y + 4 };
        const cameraWorld = world.transform?.constrainWorldPosition?.(rawCameraWorld) ?? rawCameraWorld;
        this.freeSliceId = world.slice.id;
        this.freeW = world.fourDimensionalRegion ? ambientPosition.w - world.slice.frame.origin.w : 0;
        this.freeW = clamp(this.freeW, world.wBounds?.min ?? -12, world.wBounds?.max ?? 12);
        this.setSpatialContext(world.transform, world.layerMask);
        this.freePosition = world.transform.worldToRender(cameraWorld);
        const sample = transit.renderer.getDisplaySample(transit.direction > 0 ? 1 : 0);
        const tangent = normalize3(sample.tangent);
        const tangentYaw = Math.atan2(tangent.x * transit.direction, tangent.z * transit.direction);
        const tangentPitch = Math.asin(clamp(tangent.y * transit.direction, -1, 1));
        this.freeYaw = tangentYaw + this.lookYawOffset;
        this.freePitch = clamp(tangentPitch + this.lookPitchOffset, -1.48, 1.48);
        this.freeTransit = null;
        this.applyFreePose();
    }

    getAmbientPosition(transit) {
        return applyAmbientOffsets(this.getFreeCorridorSample(transit), transit);
    }

    getForwardVector() {
        const horizontal = Math.cos(this.freePitch);
        return {
            x: Math.sin(this.freeYaw) * horizontal,
            y: Math.sin(this.freePitch),
            z: Math.cos(this.freeYaw) * horizontal
        };
    }

    applyFreePose() {
        if (!this.freePosition) return;
        const forward = this.getForwardVector();
        this.camera.position.set(this.freePosition.x, this.freePosition.y, this.freePosition.z);
        this.camera.setTarget(new BABYLON.Vector3(
            this.freePosition.x + forward.x,
            this.freePosition.y + forward.y,
            this.freePosition.z + forward.z
        ));
    }

    getModeInfo() {
        return {
            mode: this.mode,
            freeSliceId: this.freeSliceId,
            inCorridor: Boolean(this.freeTransit),
            anomalyType: this.freeTransit?.type ?? null,
            corridorProgress: this.freeTransit?.progress ?? null,
            corridorPosition4D: this.freeTransit?.position4D ?? this.freeTransit?.spatialPosition4D ?? null,
            fourthCoordinate: this.freeW,
            wMovementEnabled: this.wMovementEnabled,
            speed: this.freeSpeed
        };
    }

    getFreeTransitState() {
        return this.freeTransit;
    }

    getViewSliceId() {
        if (this.mode === 'free') {
            return this.freeTransit?.startWorld.slice.id ??
                this.freeSliceId ?? this.traversal?.currentSliceId ?? this.character.sliceId;
        }
        if (this.traversal?.state === 'transit') return this.traversal.startWorld.slice.id;
        return this.traversal?.currentSliceId ?? this.character.sliceId;
    }

    getFreeW() { return this.mode === 'free' ? this.freeW : 0; }

    getFreeWorldPosition() {
        if (this.mode !== 'free' || this.freeTransit || !this.freePosition) return null;
        const world = this.traversal?.worlds.get(this.freeSliceId);
        if (typeof world?.transform?.renderToWorld !== 'function') return null;
        const position = this.renderFreePositionToWorld(world);
        return isFinitePosition(position) ? position : null;
    }

    constrainFreePosition(world, position = this.freePosition) {
        if (!position) return position;
        const constrained = world?.transform?.constrainRenderPosition?.(position) ?? position;
        this.freePosition = copyVector(constrained);
        return this.freePosition;
    }

    renderFreePositionToWorld(world) {
        if (typeof world?.transform?.renderToWorld !== 'function' || !this.freePosition) return null;
        this.constrainFreePosition(world);
        try {
            return world.transform.renderToWorld(this.freePosition);
        } catch (error) {
            // A chart-boundary miss should prevent corridor entry for this
            // frame, not terminate the entire render/update loop.
            if (error instanceof RangeError) return null;
            throw error;
        }
    }

    dispose() {
        if (this.disposed) return;
        window.removeEventListener('keydown', this.onFreeKeyDown);
        window.removeEventListener('keyup', this.onFreeKeyUp);
        window.removeEventListener('blur', this.onFreeBlur);
        this.canvas?.removeEventListener('pointerdown', this.onFreePointerDown);
        window.removeEventListener('pointermove', this.onFreePointerMove);
        window.removeEventListener('pointerup', this.onFreePointerUp);
        this.playerController?.setInputEnabled(true);
        this.freeKeys.clear();
        this.freeTransit = null;
        super.dispose();
    }
}

function constrainAmbientPositionToWorldChart(world, position4D) {
    if (typeof world?.transform?.constrainWorldPosition !== 'function') return position4D;
    const frame = world.slice.frame;
    const local = ambientToSlice(frame, position4D);
    const constrained = world.transform.constrainWorldPosition(local.position);
    if (['x', 'y', 'z'].every((axis) => Math.abs(constrained[axis] - local.position[axis]) <= 1e-10)) {
        return position4D;
    }
    return add4(
        sliceToAmbient(frame, constrained),
        scale4(frame.normal, local.normalOffset)
    );
}

function applyAmbientOffsets(sample, transit) {
    const position = { ...sample.spatialPosition4D };
    for (const [index, key] of ['offsetU', 'offsetV', 'offsetW'].entries()) {
        const axis = sample.axes4D[index];
        const amount = transit[key];
        position.x += axis.x * amount;
        position.y += axis.y * amount;
        position.z += axis.z * amount;
        position.w += axis.w * amount;
    }
    return position;
}

function getDisplayAxes(sample) {
    const first = normalize3(sample.axes?.[0] ?? sample.crossSectionAxes?.[0]);
    const secondRaw = normalize3(sample.axes?.[1] ?? sample.crossSectionAxes?.[1]);
    const second = normalize3(subtract3(secondRaw, scale3(first, dot3(secondRaw, first))));
    const third = normalize3(sample.crossSectionAxes?.[2] ?? cross3(sample.tangent, first));
    return [first, second, length3(third) > 1e-9 ? third : normalize3(cross3(first, second))];
}

function isInsideBounds(position, bounds) {
    return ['x', 'y', 'z', 'w'].every((axis) =>
        position[axis] >= bounds.min[axis] - 1e-7 && position[axis] <= bounds.max[axis] + 1e-7
    );
}

function clampAmbient(position, bounds) {
    return {
        x: clamp(position.x, bounds.min.x, bounds.max.x),
        y: clamp(position.y, bounds.min.y, bounds.max.y),
        z: clamp(position.z, bounds.min.z, bounds.max.z),
        w: clamp(position.w, bounds.min.w, bounds.max.w)
    };
}

function keyAxis(keys, positive, negative) {
    return Number(keys.has(positive)) - Number(keys.has(negative));
}

function copyVector(value) { return { x: value.x, y: value.y, z: value.z }; }
function add3(left, right) { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract3(left, right) { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale3(value, amount) { return { x: value.x * amount, y: value.y * amount, z: value.z * amount }; }
function dot3(left, right) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross3(left, right) {
    return {
        x: left.y * right.z - left.z * right.y,
        y: left.z * right.x - left.x * right.z,
        z: left.x * right.y - left.y * right.x
    };
}
function length3(value) { return Math.hypot(value.x, value.y, value.z); }
function normalize3(value) {
    const length = length3(value);
    return length > 1e-9 ? scale3(value, 1 / length) : { x: 0, y: 0, z: 1 };
}
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

function isFinitePosition(position) {
    return Boolean(position && ['x', 'y', 'z'].every(function finiteAxis(axis) {
        return Number.isFinite(position[axis]);
    }));
}

export { GeometryDemoCameraController };
