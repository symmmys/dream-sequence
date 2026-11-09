/** Free four-axis player traversal inside a bounded slice-transition anomaly. */

import {
    add4,
    ambientToSlice,
    dot4,
    scale4,
    sliceToAmbient,
    subtract4
} from './spatial-4d.js';
import { SLICE_TRANSITION_ANOMALY } from './spatial-anomaly.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';
import { evaluateAnomalyInfluence } from './anomaly-influence-field.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

const AXES = ['x', 'y', 'z', 'w'];

class SliceTransitionTraversalController {
    constructor(options = {}) {
        this.player = requireObject(options.player, 'player');
        this.movement = requireObject(options.movementController, 'movementController');
        this.camera = requireObject(options.cameraController, 'cameraController');
        this.topology = requireObject(options.topology, 'topology');
        const suppliedAnomaly = requireObject(options.anomaly ?? options.corridor, 'anomaly');
        this.corridor = typeof this.topology.getCorridor === 'function'
            ? this.topology.getCorridor(suppliedAnomaly.id)
            : suppliedAnomaly;
        if (this.corridor.type !== SLICE_TRANSITION_ANOMALY) {
            throw new TypeError('SliceTransitionTraversalController requires a slice-transition anomaly.');
        }
        this.renderers = options.corridorRenderers ?? new Map();
        this.chunkGraph = options.chunkGraph ?? null;
        this.corridorChunk = options.corridorChunk ?? this.chunkGraph?.getCorridorChunk(this.corridor.id) ?? null;
        this.worlds = new Map([
            [options.source.slice.id, options.source],
            [options.destination.slice.id, options.destination]
        ]);
        this.currentSliceId = options.initialSliceId ?? options.source.slice.id;
        this.onSliceChanged = options.onSliceChanged ?? noop;
        this.getInfluenceModifiers = options.getInfluenceModifiers ?? null;
        if (this.getInfluenceModifiers !== null && typeof this.getInfluenceModifiers !== 'function') {
            throw new TypeError('getInfluenceModifiers must be a function when provided.');
        }
        this.options = {
            triggerDistance: this.corridor.entryRadius ?? 3.4,
            headingThreshold: 0.2,
            speed: 8,
            sprintSpeed: 12,
            entitySpeed: 8,
            ...options.traversal
        };
        this.validateOptions();
        this.active = false;
        this.disposed = false;
        this.state = 'idle';
        this.progress = 0;
        this.direction = 0;
        this.startWorld = null;
        this.target = null;
        this.spatialPosition4D = null;
        this.entityTransits = new Map();
        this.entryYaw = 0;
        this.entryPosition = null;
        this.entryLock = null;
        this.lastEntryDiagnostic = { reason: 'NOT_CHECKED', anomalyId: this.corridor.id };
    }

    update(deltaSeconds) {
        if (!this.active || this.disposed) return;
        const delta = clamp(Number(deltaSeconds) || 0, 0, 0.1);
        if (this.state === 'idle') {
            if (!this.tryBeginTransit()) this.advanceAmbientInfluenceMovement(delta);
        } else if (this.state === 'transit') this.advanceTransit(delta);
        this.advanceOtherEntities(delta);
    }

    setActive(active) {
        this.active = Boolean(active) && !this.disposed;
    }

    ownsSlice(sliceId) {
        return this.worlds.has(sliceId);
    }

    get corridorLength() {
        if (!this.startWorld || !this.target) return 0;
        return Math.abs(this.getPlaneCoordinate(this.target.slice.frame.origin, this.startWorld.slice.frame.normal) -
            this.getPlaneCoordinate(this.startWorld.slice.frame.origin, this.startWorld.slice.frame.normal));
    }

    getMovementInput() {
        return this.movement.getMovementInput?.() ?? {
            forward: 0, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, sprint: false
        };
    }

    tryBeginTransit() {
        const entry = this.findEntry();
        return entry ? this.beginTransit(entry) : false;
    }

    findEntry() {
        const input = this.getMovementInput();
        if (input.forward <= 0.05) {
            this.lastEntryDiagnostic = { reason: 'NO_FORWARD_INPUT', anomalyId: this.corridor.id };
            return null;
        }
        const position = this.player.worldPosition;
        if (this.entryLock?.sliceId === this.currentSliceId) {
            const distanceFromExit = Math.hypot(
                position.x - this.entryLock.position.x,
                position.z - this.entryLock.position.z
            );
            if (distanceFromExit < 1.25) {
                this.lastEntryDiagnostic = { reason: 'EXIT_LOCKED', anomalyId: this.corridor.id, distance: distanceFromExit };
                return null;
            }
            this.entryLock = null;
        }
        const yaw = this.player.yaw;
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);
        const neighbors = this.topology.getTraversableNeighbors(this.currentSliceId)
            .filter((neighbor) => neighbor.corridorId === this.corridor.id);
        if (!neighbors.length) {
            this.lastEntryDiagnostic = { reason: 'NO_TOPOLOGY_CONNECTION', anomalyId: this.corridor.id };
            return null;
        }
        let diagnostic = { reason: 'TOO_FAR', anomalyId: this.corridor.id, distance: Infinity, entryRadius: this.options.triggerDistance };

        for (const neighbor of neighbors) {
            const fromSource = this.corridor.source.sliceId === this.currentSliceId;
            const endpoint = fromSource ? this.corridor.source : this.corridor.destination;
            const dx = endpoint.position.x - position.x;
            const dz = endpoint.position.z - position.z;
            const distance = Math.hypot(dx, dz);
            diagnostic = { ...diagnostic, distance, entryRadius: this.options.triggerDistance };
            if (distance > this.options.triggerDistance) continue;
            const heading = distance < 1e-6 ? 1 : (forwardX * dx + forwardZ * dz) / distance;
            if (heading < this.options.headingThreshold) {
                diagnostic = { ...diagnostic, reason: 'WRONG_HEADING', heading, headingThreshold: this.options.headingThreshold };
                continue;
            }
            const currentWorld = this.worlds.get(this.currentSliceId);
            const ambientPosition = currentWorld ? this.getAmbientPlayerPosition() : null;
            if (!ambientPosition || !this.isInsideRegion(ambientPosition)) {
                diagnostic = { ...diagnostic, reason: 'OUTSIDE_ANOMALY_REGION', heading };
                continue;
            }
            if (!this.hasChunkConnection(this.currentSliceId, position)) {
                diagnostic = { ...diagnostic, reason: 'NO_CHUNK_CONNECTION', heading };
                continue;
            }
            this.lastEntryDiagnostic = { reason: 'READY', anomalyId: this.corridor.id, distance, heading };
            return { fromSource, destinationSliceId: neighbor.sliceId };
        }
        this.lastEntryDiagnostic = diagnostic;
        return null;
    }

    getEntryDiagnostic() {
        return { ...this.lastEntryDiagnostic };
    }

    getAmbientPlayerPosition() {
        const world = this.worlds.get(this.currentSliceId);
        if (!world) return null;
        const base = sliceToAmbient(world.slice.frame, this.player.worldPosition);
        const prior = this.player.spatialPosition4D;
        const normalOffset = prior && this.player.sliceId === this.currentSliceId
            ? ambientToSlice(world.slice.frame, prior).normalOffset : 0;
        return add4(base, scale4(world.slice.frame.normal, normalOffset));
    }

    getAnomalyInfluence(position4D) {
        const modifiers = this.getInfluenceModifiers?.({
            player: this.player, anomaly: this.corridor, position4D
        }) ?? {};
        return evaluateAnomalyInfluence(this.corridor, position4D, modifiers);
    }

    getInfluenceMovementInfo(position4D, direction, sliceId = this.currentSliceId) {
        if (!Number.isFinite(direction) || Math.abs(direction) < 1e-6 ||
            !this.active || this.disposed || this.state !== 'idle' || !this.corridor.traversable) return null;
        const neighbor = this.topology.getTraversableNeighbors(sliceId)
            .find((entry) => entry.corridorId === this.corridor.id);
        if (!neighbor) return null;
        const sourceWorld = this.worlds.get(sliceId);
        const targetWorld = this.worlds.get(neighbor.sliceId);
        if (!sourceWorld || !targetWorld) return null;
        const normal = sourceWorld.slice.frame.normal;
        const currentPlane = dot4(position4D, normal);
        const targetPlane = dot4(targetWorld.slice.frame.origin, normal);
        const remaining = targetPlane - currentPlane;
        const targetDirection = Math.sign(remaining);
        const influence = this.getAnomalyInfluence(position4D);
        if (influence.freedom <= 0 || influence.wMovementScale <= 0) return null;
        return {
            anomalyId: this.corridor.id,
            sourceWorld,
            targetWorld,
            sourceSliceId: sliceId,
            targetSliceId: neighbor.sliceId,
            direction: targetDirection,
            inputDirection: Math.sign(direction),
            movingTowardTarget: targetDirection !== 0 && Math.sign(direction) === targetDirection,
            remainingWDistance: Math.abs(remaining),
            freedom: influence.freedom,
            wReach: influence.wReach,
            movementScale: influence.wMovementScale,
            influenceDistance: influence.distance
        };
    }

    advanceAmbientInfluenceMovement(deltaSeconds) {
        const input = this.getMovementInput();
        if (!input.crossSectionW) return false;
        const position4D = this.getAmbientPlayerPosition();
        if (!position4D) return false;
        const info = this.getInfluenceMovementInfo(position4D, input.crossSectionW);
        if (!info) return false;
        const speed = input.sprint ? this.options.sprintSpeed : this.options.speed;
        const frame = info.sourceWorld.slice.frame;
        const amount = Math.sign(input.crossSectionW) * speed *
            info.movementScale * Math.min(Math.max(deltaSeconds, 0), 0.1);
        if (Math.abs(amount) <= 1e-10) return false;
        let candidate = add4(position4D, scale4(frame.normal, amount));
        const currentPlane = dot4(position4D, frame.normal);
        const candidatePlane = dot4(candidate, frame.normal);
        const targetPlane = dot4(info.targetWorld.slice.frame.origin, frame.normal);
        const crossed = info.direction > 0
            ? candidatePlane >= targetPlane - 1e-8
            : candidatePlane <= targetPlane + 1e-8;

        if (crossed) {
            candidate = add4(candidate, scale4(frame.normal, targetPlane - candidatePlane));
            const sourceLocal = ambientToSlice(info.sourceWorld.slice.frame, candidate).position;
            const targetLocal = ambientToSlice(info.targetWorld.slice.frame, candidate).position;
            const sourceAddress = this.chunkGraph?.getAddress(info.sourceSliceId, sourceLocal);
            const targetAddress = this.chunkGraph?.getAddress(info.targetSliceId, targetLocal);
            const reachability = sourceAddress && targetAddress
                ? this.chunkGraph.getReachability(sourceAddress, targetAddress, {
                    position4D: candidate, corridorId: this.corridor.id
                })
                : { reachable: true };
            if (!reachability.reachable) {
                candidate = add4(candidate, scale4(frame.normal, -info.direction * 1e-7));
            } else {
                this.startWorld = info.sourceWorld;
                this.target = info.targetWorld;
                this.direction = info.direction;
                this.spatialPosition4D = candidate;
                this.completeTransit(info.targetWorld, candidate);
                return true;
            }
        }

        this.player.spatialPosition4D = candidate;
        const local = ambientToSlice(info.sourceWorld.slice.frame, candidate);
        if (Math.abs(local.normalOffset) <= 1e-7) this.player.spatialPosition4D = null;
        return true;
    }

    beginTransit(entry) {
        this.startWorld = this.worlds.get(this.currentSliceId);
        this.target = this.worlds.get(entry.destinationSliceId);
        if (!this.startWorld || !this.target) {
            throw new Error(`Missing slice-transition world for anomaly ${this.corridor.id}.`);
        }
        this.direction = entry.fromSource ? 1 : -1;
        this.entryYaw = this.player.yaw;
        this.entryPosition = { ...this.player.worldPosition };
        this.spatialPosition4D = this.getAmbientPlayerPosition();
        if (!this.isInsideRegion(this.spatialPosition4D)) {
            throw new RangeError(`Player entered outside anomaly bounds: ${this.corridor.id}.`);
        }
        this.progress = this.calculateProgress(this.spatialPosition4D);
        this.state = 'transit';
        this.movement.setMovementSuspended(true);
        this.player.setSpatialContext?.(
            this.startWorld.transform,
            this.startWorld.slice.id,
            this.startWorld.layerMask
        );
        this.camera.clearRenderAnchor?.();
        this.camera.setSpatialContext(this.startWorld.transform, this.startWorld.layerMask);
        this.corridorChunk?.enter(this.player, {
            direction: this.direction,
            progress: clamp(this.progress, 0, 1),
            position4D: this.spatialPosition4D
        });
        this.onSliceChanged(this.currentSliceId, {
            transitioning: true,
            anomalyId: this.corridor.id,
            corridorId: this.corridor.id,
            type: this.corridor.type,
            renderSliceId: this.currentSliceId,
            direction: this.direction,
            position4D: { ...this.spatialPosition4D }
        });
        return true;
    }

    hasChunkConnection(sliceId, position) {
        if (!this.chunkGraph) return true;
        const address = this.chunkGraph.getAddress(sliceId, position);
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                const nearby = {
                    sliceId,
                    chunkX: address.chunkX + offsetX,
                    chunkZ: address.chunkZ + offsetZ
                };
                const connected = this.chunkGraph.getNeighbors(nearby).some((node) =>
                    node.kind === 'corridor' && node.id === this.corridor.id
                );
                if (connected) return true;
            }
        }
        return false;
    }

    advanceTransit(deltaSeconds) {
        const input = this.getMovementInput();
        const speed = input.sprint ? this.options.sprintSpeed : this.options.speed;
        if (Number.isFinite(input.turn) && input.turn !== 0) {
            this.player.yaw += input.turn * (this.movement.turnSpeed ?? 2.2) * deltaSeconds;
        }
        const yaw = this.player.yaw;
        const forward = clamp(Number(input.forward) || 0, -1, 1);
        const strafe = clamp(Number(input.strafe) || 0, -1, 1);
        const vertical = clamp(Number(input.vertical) || 0, -1, 1);
        const crossSectionW = clamp(Number(input.crossSectionW) || 0, -1, 1);
        const horizontalLength = Math.hypot(forward, strafe);
        const horizontalScale = horizontalLength > 1 ? 1 / horizontalLength : 1;
        const dx = (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * deltaSeconds * horizontalScale;
        const dz = (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * deltaSeconds * horizontalScale;
        const dy = vertical * speed * deltaSeconds;
        const frame = this.startWorld.slice.frame;
        let candidate = add4(
            add4(
                add4(this.spatialPosition4D, scale4(frame.axes[0], dx)),
                scale4(frame.axes[1], dy)
            ),
            scale4(frame.axes[2], dz)
        );
        const influence = this.getAnomalyInfluence(this.spatialPosition4D);
        const wSpeedScale = influence.wMovementScale;
        candidate = add4(candidate, scale4(frame.normal, crossSectionW * speed * deltaSeconds * wSpeedScale));

        const startPlane = this.getPlaneCoordinate(frame.origin, frame.normal);
        const destinationPlane = this.getPlaneCoordinate(this.target.slice.frame.origin, frame.normal);
        const targetDirection = Math.sign(destinationPlane - startPlane);
        const currentPlane = this.getPlaneCoordinate(this.spatialPosition4D, frame.normal);
        const nextPlane = this.getPlaneCoordinate(candidate, frame.normal);
        const targetReached = targetDirection > 0
            ? nextPlane >= destinationPlane - 1e-8
            : nextPlane <= destinationPlane + 1e-8;
        const hasEnteredSliceInterval = (currentPlane - startPlane) * targetDirection > 1e-8;
        const returningToSource = hasEnteredSliceInterval &&
            (nextPlane - currentPlane) * targetDirection < -1e-8 &&
            (nextPlane - startPlane) * targetDirection <= 1e-8;

        candidate = clampToRegion(candidate, this.corridor.region);
        candidate = constrainAmbientPositionToWorldChart(this.startWorld, candidate);
        this.spatialPosition4D = candidate;
        this.progress = clamp(this.calculateProgress(candidate), 0, 1);
        this.updatePlayerPosition();
        this.corridorChunk?.updateOccupant(this.player, this.progress, candidate);

        if (targetReached) {
            this.completeTransit(this.target, candidate);
        } else if (returningToSource) {
            this.completeTransit(this.startWorld, candidate);
        }
    }

    updatePlayerPosition() {
        const local = ambientToSlice(this.startWorld.slice.frame, this.spatialPosition4D).position;
        this.player.spatialPosition4D = { ...this.spatialPosition4D };
        this.player.setWorldPosition(local);
    }

    calculateProgress(position4D) {
        if (!this.startWorld || !this.target) return 0;
        const normal = this.startWorld.slice.frame.normal;
        const start = this.getPlaneCoordinate(this.startWorld.slice.frame.origin, normal);
        const end = this.getPlaneCoordinate(this.target.slice.frame.origin, normal);
        const current = this.getPlaneCoordinate(position4D, normal);
        return Math.abs(end - start) <= 1e-9 ? 0 : (current - start) / (end - start);
    }

    getPlaneCoordinate(position, normal) {
        return dot4(position, normal);
    }

    isInsideRegion(position) {
        return AXES.every((axis) =>
            position[axis] >= this.corridor.region.min[axis] - 1e-7 &&
            position[axis] <= this.corridor.region.max[axis] + 1e-7
        );
    }

    completeTransit(world, position4D = this.spatialPosition4D) {
        const arrival = this.createArrivalPosition(world, position4D);
        this.player.setSpatialContext?.(world.transform, world.slice.id, world.layerMask);
        this.player.spatialPosition4D = null;
        this.player.setWorldPosition(arrival);
        this.movement.setTerrain(world.terrain);
        if (world.movementProfile) this.movement.setMovementProfile?.(world.movementProfile);
        this.movement.setMovementSuspended(false);
        this.camera.clearRenderAnchor?.();
        this.camera.setSpatialContext(world.transform, world.layerMask);
        this.currentSliceId = world.slice.id;
        this.entryLock = { sliceId: world.slice.id, position: { ...arrival } };
        this.corridorChunk?.leave(this.player);
        this.state = 'idle';
        this.progress = 0;
        this.direction = 0;
        this.startWorld = null;
        this.target = null;
        this.spatialPosition4D = null;
        this.entryPosition = null;
        this.onSliceChanged(this.currentSliceId, {
            transitioning: false,
            anomalyId: this.corridor.id,
            corridorId: this.corridor.id,
            type: this.corridor.type
        });
        return arrival;
    }

    createArrivalPosition(world, position4D) {
        const local = ambientToSlice(world.slice.frame, position4D).position;
        const fallback = world.slice.id === this.corridor.destination.sliceId
            ? this.corridor.destination.position : this.corridor.source.position;
        const terrain = world.terrain;
        const x = clampToTerrain(local.x, terrain.min.x, terrain.max.x);
        const z = clampToTerrain(local.z, terrain.min.z, terrain.max.z);
        const sample = terrain.sampleAt(x, z);
        let arrival;
        if (!sample || !Number.isFinite(sample.y)) {
            const fallbackX = clampToTerrain(fallback.x, terrain.min.x, terrain.max.x);
            const fallbackZ = clampToTerrain(fallback.z, terrain.min.z, terrain.max.z);
            const fallbackSample = terrain.sampleAt(fallbackX, fallbackZ);
            if (!fallbackSample || !Number.isFinite(fallbackSample.y)) {
                throw new RangeError('Slice-transition arrival lies outside destination terrain.');
            }
            arrival = { x: fallbackX, y: fallbackSample.y, z: fallbackZ };
        } else {
            arrival = { x, y: sample.y, z };
        }
        return world.transform?.constrainWorldPosition?.(arrival) ?? arrival;
    }

    tryBeginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        if (!this.active || this.disposed || !entity?.worldPosition || !Number.isFinite(entity.yaw)) return false;
        const inputForward = { x: Math.sin(entity.yaw), z: Math.cos(entity.yaw) };
        for (const neighbor of this.topology.getTraversableNeighbors(fromSliceId)) {
            if (neighbor.corridorId !== this.corridor.id) continue;
            const fromSource = this.corridor.source.sliceId === fromSliceId;
            const endpoint = fromSource ? this.corridor.source : this.corridor.destination;
            const dx = endpoint.position.x - entity.worldPosition.x;
            const dz = endpoint.position.z - entity.worldPosition.z;
            const distance = Math.hypot(dx, dz);
            if (distance <= 1e-6 || distance > this.options.triggerDistance) continue;
            const heading = (inputForward.x * dx + inputForward.z * dz) / distance;
            if (heading >= this.options.headingThreshold) return this.beginEntityTransit(entity, fromSliceId);
        }
        return false;
    }

    beginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        if (!this.active || this.disposed) throw new Error('Slice-transition anomaly is not active.');
        if (!entity || entity === this.player || this.entityTransits.has(entity)) return false;
        const neighbor = this.topology.getTraversableNeighbors(fromSliceId)
            .find((entry) => entry.corridorId === this.corridor.id);
        if (!neighbor) return false;
        const source = this.worlds.get(fromSliceId);
        const target = this.worlds.get(neighbor.sliceId);
        if (!source || !target || !this.hasChunkConnection(fromSliceId, entity.worldPosition)) return false;
        const position4D = sliceToAmbient(source.slice.frame, entity.worldPosition);
        if (!this.isInsideRegion(position4D)) return false;
        this.entityTransits.set(entity, {
            entity, source, target, fromSliceId,
            direction: fromSliceId === this.corridor.source.sliceId ? 1 : -1,
            speed: entity.anomalySpeed ?? this.options.entitySpeed,
            position4D
        });
        this.corridorChunk?.enter(entity, { direction: fromSliceId === this.corridor.source.sliceId ? 1 : -1,
            progress: clamp(this.calculateEntityProgress(position4D, source, target), 0, 1), position4D });
        return true;
    }

    calculateEntityProgress(position4D, source, target) {
        const normal = source.slice.frame.normal;
        const start = dot4(source.slice.frame.origin, normal);
        const end = dot4(target.slice.frame.origin, normal);
        return Math.abs(end - start) <= 1e-9 ? 0 : (dot4(position4D, normal) - start) / (end - start);
    }

    advanceOtherEntities(deltaSeconds) {
        for (const [entity, state] of this.entityTransits) {
            const normal = state.source.slice.frame.normal;
            const start = dot4(state.source.slice.frame.origin, normal);
            const end = dot4(state.target.slice.frame.origin, normal);
            const targetDirection = Math.sign(end - start);
            const step = scale4(normal, targetDirection * state.speed * deltaSeconds);
            const candidate = clampToRegion(add4(state.position4D, step), this.corridor.region);
            state.position4D = candidate;
            const progress = clamp(this.calculateEntityProgress(candidate, state.source, state.target), 0, 1);
            this.corridorChunk?.updateOccupant(entity, progress, candidate);
            if (progress >= 1 - 1e-8) {
                const arrival = this.createArrivalPosition(state.target, candidate);
                entity.setSpatialContext?.(state.target.transform, state.target.slice.id, state.target.layerMask);
                entity.setWorldPosition?.(arrival);
                if (!entity.setWorldPosition) entity.worldPosition = arrival;
                entity.spatialPosition4D = null;
                this.corridorChunk?.leave(entity);
                this.entityTransits.delete(entity);
            }
        }
    }

    getEntityTransitState(entity) {
        const state = this.entityTransits.get(entity);
        return state ? {
            fromSliceId: state.fromSliceId,
            toSliceId: state.target.slice.id,
            progress: clamp(this.calculateEntityProgress(state.position4D, state.source, state.target), 0, 1),
            direction: state.direction,
            position4D: { ...state.position4D }
        } : null;
    }

    getState() {
        return {
            state: this.state,
            currentSliceId: this.currentSliceId,
            startSliceId: this.startWorld?.slice.id ?? null,
            destinationSliceId: this.target?.slice.id ?? null,
            anomalyId: this.corridor.id,
            anomalyType: this.corridor.type,
            progress: this.progress,
            direction: this.direction,
            position4D: this.spatialPosition4D && { ...this.spatialPosition4D },
            bounds: this.corridor.region,
            influence: this.corridor.influence ? { ...this.corridor.influence, center: { ...this.corridor.influence.center } } : null,
            entryDiagnostic: this.getEntryDiagnostic(),
            corridorOccupants: this.corridorChunk?.occupants.size ?? this.entityTransits.size
        };
    }

    validateOptions() {
        const { triggerDistance, speed, sprintSpeed, entitySpeed, headingThreshold } = this.options;
        if (![triggerDistance, speed, sprintSpeed, entitySpeed].every(Number.isFinite) ||
            triggerDistance <= 0 || speed <= 0 || sprintSpeed < speed || entitySpeed <= 0) {
            throw new RangeError('Slice-transition movement options must be positive and valid.');
        }
        if (!Number.isFinite(headingThreshold) || headingThreshold < -1 || headingThreshold > 1) {
            throw new RangeError('Slice-transition headingThreshold must be between -1 and 1.');
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.active = false;
        if (this.state === 'transit') {
            this.movement.setMovementSuspended(false);
            this.corridorChunk?.leave(this.player);
        }
        for (const entity of this.entityTransits.keys()) this.corridorChunk?.leave(entity);
        this.entityTransits.clear();
        this.state = 'disposed';
        this.target = null;
        this.startWorld = null;
    }
}

function constrainAmbientPositionToWorldChart(world, position4D) {
    if (typeof world?.transform?.constrainWorldPosition !== 'function') return position4D;
    const frame = world.slice.frame;
    const local = ambientToSlice(frame, position4D);
    const constrained = world.transform.constrainWorldPosition(local.position);
    if (AXES.slice(0, 3).every((axis) => Math.abs(constrained[axis] - local.position[axis]) <= 1e-10)) {
        return position4D;
    }
    return add4(
        sliceToAmbient(frame, constrained),
        scale4(frame.normal, local.normalOffset)
    );
}

function clampToRegion(position, region) {
    return {
        x: clamp(position.x, region.min.x, region.max.x),
        y: clamp(position.y, region.min.y, region.max.y),
        z: clamp(position.z, region.min.z, region.max.z),
        w: clamp(position.w, region.min.w, region.max.w)
    };
}

function clampToTerrain(value, minimum, maximum) {
    return clamp(value, minimum, maximum);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function requireObject(value, label) {
    if (!value || typeof value !== 'object') throw new TypeError(`${label} is required.`);
    return value;
}

function noop() {}

export { SliceTransitionTraversalController };
