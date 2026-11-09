/** Advances entities through an explicit four-dimensional corridor chunk. */

import { ambientToSlice } from './spatial-4d.js';
import { sampleSpatialCorridor } from './spatial-corridor.js';

class CorridorTraversalController {
    constructor(options = {}) {
        this.player = requireObject(options.player, 'player');
        this.movement = requireObject(options.movementController, 'movementController');
        this.camera = requireObject(options.cameraController, 'cameraController');
        this.topology = requireObject(options.topology, 'topology');
        this.corridor = requireObject(options.corridor, 'corridor');
        this.renderer = requireObject(options.corridorRenderer, 'corridorRenderer');
        this.renderers = options.corridorRenderers ?? new Map();
        this.chunkGraph = options.chunkGraph ?? null;
        this.corridorChunk = options.corridorChunk ?? this.chunkGraph?.getCorridorChunk(this.corridor.id) ?? null;
        this.worlds = new Map([
            [options.source.slice.id, options.source],
            [options.destination.slice.id, options.destination]
        ]);
        this.currentSliceId = options.initialSliceId ?? options.source.slice.id;
        this.onSliceChanged = options.onSliceChanged ?? function ignoreSliceChange() {};
        this.options = {
            triggerDistance: 3.4,
            headingThreshold: 0.2,
            speed: 8,
            sprintSpeed: 12,
            transverseSpeed: 3.5,
            entitySpeed: 5,
            entryBlendDistance: 1.4,
            lengthSegments: 128,
            ...options.traversal
        };
        this.validateOptions();
        this.corridorLength = measureCorridor(this.corridor, this.options.lengthSegments);
        this.active = false;
        this.disposed = false;
        this.state = 'idle';
        this.progress = 0;
        this.direction = 0;
        this.startWorld = null;
        this.target = null;
        this.activeRenderer = null;
        this.entryPosition = null;
        this.entryYaw = 0;
        this.offsetU = 0;
        this.offsetV = 0;
        this.offsetW = 0;
        this.spatialPosition4D = null;
        this.entityTransits = new Map();
    }

    update(deltaSeconds) {
        if (!this.active || this.disposed) return;
        const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
        if (this.state === 'idle') this.tryBeginTransit();
        else this.advanceTransit(delta);
        this.advanceOtherEntities(delta);
    }

    setActive(active) {
        this.active = Boolean(active) && !this.disposed;
    }

    getMovementInput() {
        return this.movement.getMovementInput?.() ?? {
            forward: 0, strafe: 0, vertical: 0, sprint: false
        };
    }

    tryBeginTransit() {
        const entry = this.findEntry();
        return entry ? this.beginTransit(entry) : false;
    }

    findEntry() {
        const input = this.getMovementInput();
        if (input.forward <= 0.05) return null;
        const position = this.player.worldPosition;
        const yaw = this.player.yaw;
        const forwardX = Math.sin(yaw);
        const forwardZ = Math.cos(yaw);

        for (const neighbor of this.topology.getTraversableNeighbors(this.currentSliceId)) {
            if (neighbor.corridorId !== this.corridor.id) continue;
            const fromSource = this.corridor.source.sliceId === this.currentSliceId;
            const endpoint = fromSource ? this.corridor.source : this.corridor.destination;
            const dx = endpoint.position.x - position.x;
            const dz = endpoint.position.z - position.z;
            const distance = Math.hypot(dx, dz);
            if (distance > this.options.triggerDistance || distance < 1e-6) continue;
            const heading = (forwardX * dx + forwardZ * dz) / distance;
            if (heading >= this.options.headingThreshold && this.hasChunkConnection(this.currentSliceId, position)) {
                return { fromSource, destinationSliceId: neighbor.sliceId };
            }
        }
        return null;
    }

    beginTransit(entry) {
        this.startWorld = this.worlds.get(this.currentSliceId);
        this.target = this.worlds.get(entry.destinationSliceId);
        if (!this.target || !this.startWorld) throw new Error(`Missing corridor slice for ${this.corridor.id}.`);
        this.direction = entry.fromSource ? 1 : -1;
        this.progress = 0;
        this.offsetU = 0;
        this.offsetV = 0;
        this.offsetW = 0;
        this.entryPosition = this.player.getRenderPosition();
        this.entryYaw = this.player.yaw;
        this.activeRenderer = this.renderers.get(this.currentSliceId) ?? this.renderer;
        this.state = 'transit';
        this.movement.setMovementSuspended(true);
        this.player.setSpatialContext?.(
            this.startWorld.transform,
            this.startWorld.slice.id,
            this.startWorld.layerMask
        );
        this.camera.setSpatialContext(this.startWorld.transform, this.startWorld.layerMask);
        this.corridorChunk?.enter(this.player, { direction: this.direction, progress: 0 });
        this.updatePlayerOnCorridor();
        this.onSliceChanged(this.currentSliceId, {
            transitioning: true,
            corridorId: this.corridor.id,
            renderSliceId: this.currentSliceId,
            direction: this.direction
        });
        return true;
    }

    tryBeginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        this.assertActive();
        if (!entity?.worldPosition || !Number.isFinite(entity.yaw)) return false;
        const forwardX = Math.sin(entity.yaw);
        const forwardZ = Math.cos(entity.yaw);
        for (const neighbor of this.topology.getTraversableNeighbors(fromSliceId)) {
            if (neighbor.corridorId !== this.corridor.id) continue;
            const fromSource = this.corridor.source.sliceId === fromSliceId;
            const endpoint = fromSource ? this.corridor.source : this.corridor.destination;
            const dx = endpoint.position.x - entity.worldPosition.x;
            const dz = endpoint.position.z - entity.worldPosition.z;
            const distance = Math.hypot(dx, dz);
            if (distance < 1e-6 || distance > this.options.triggerDistance) continue;
            const heading = (forwardX * dx + forwardZ * dz) / distance;
            if (heading >= this.options.headingThreshold) return this.beginEntityTransit(entity, fromSliceId);
        }
        return false;
    }

    beginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        this.assertActive();
        if (!entity || entity === this.player) throw new TypeError('Use player traversal for the active player.');
        if (this.entityTransits.has(entity)) return false;
        const link = this.topology.getTraversableNeighbors(fromSliceId)
            .find(function findCorridor(neighbor) { return neighbor.corridorId === this.corridor.id; }, this);
        if (!link) return false;
        const position = entity.worldPosition;
        if (!position || !this.hasChunkConnection(fromSliceId, position)) return false;
        const fromSource = fromSliceId === this.corridor.source.sliceId;
        const target = this.worlds.get(link.sliceId);
        if (!target) throw new Error(`Missing corridor destination slice: ${link.sliceId}`);
        const speed = entity.corridorSpeed ?? this.options.entitySpeed;
        if (!Number.isFinite(speed) || speed <= 0) throw new RangeError('Entity corridorSpeed must be positive.');
        const state = {
            entity, fromSliceId, target, direction: fromSource ? 1 : -1,
            progress: 0, speed,
            entryPosition: getEntityRenderPosition(entity),
            entryYaw: entity.yaw ?? 0,
            renderer: this.renderers.get(fromSliceId) ?? this.renderer
        };
        this.entityTransits.set(entity, state);
        this.corridorChunk?.enter(entity, { direction: state.direction, progress: 0 });
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
                const connected = this.chunkGraph.getNeighbors(nearby).some(function isThisCorridor(node) {
                    return node.kind === 'corridor' && node.id === this.corridor.id;
                }, this);
                if (connected) return true;
            }
        }
        return false;
    }

    advanceTransit(deltaSeconds) {
        const input = this.getMovementInput();
        const forward = clamp(Number(input.forward) || 0, -1, 1);
        const strafe = clamp(Number(input.strafe) || 0, -1, 1);
        const vertical = clamp(Number(input.vertical) || 0, -1, 1);
        const crossSectionW = clamp(Number(input.crossSectionW) || 0, -1, 1);
        const speed = input.sprint ? this.options.sprintSpeed : this.options.speed;
        const next = this.progress + forward * speed * deltaSeconds / this.corridorLength;
        if (next >= 1) {
            this.progress = 1;
            this.updatePlayerOnCorridor();
            this.completeTransit(this.target);
            return;
        }
        if (next < 0 && this.progress > 0) {
            this.progress = 0;
            this.updatePlayerOnCorridor();
            this.completeTransit(this.startWorld);
            return;
        }
        this.progress = clamp(next, 0, 1);
        const radius = this.getCurrentRadius();
        const transverseLimit = radius * 0.62;
        this.offsetU = clamp(
            this.offsetU + strafe * this.options.transverseSpeed * deltaSeconds,
            -transverseLimit,
            transverseLimit
        );
        this.offsetV = clamp(
            this.offsetV + vertical * this.options.transverseSpeed * deltaSeconds,
            -transverseLimit,
            transverseLimit
        );
        this.offsetW = clamp(
            this.offsetW + crossSectionW * this.options.transverseSpeed * deltaSeconds,
            -transverseLimit,
            transverseLimit
        );
        this.constrainCrossSection(transverseLimit);
        this.updatePlayerOnCorridor();
    }

    updatePlayerOnCorridor() {
        const sample = this.getTransitSample(
            this.activeRenderer,
            this.progress,
            this.direction,
            this.offsetU,
            this.offsetV,
            this.offsetW,
            this.entryPosition,
            this.entryYaw
        );
        this.spatialPosition4D = sample.spatialPosition4D;
        this.player.spatialPosition4D = { ...sample.spatialPosition4D };
        this.player.setRenderPosition(sample.position, sample.yaw);
        this.corridorChunk?.updateOccupant(this.player, this.progress, sample.spatialPosition4D);
        this.camera.setRenderAnchor(sample.position, sample.yaw, this.getCameraLookTarget());
    }

    getCameraLookTarget() {
        const ahead = Math.min(0.985, Math.max(0.76, this.progress + 0.18));
        const t = this.direction > 0 ? ahead : 1 - ahead;
        const sample = this.activeRenderer.getDisplaySample(t);
        const axes = sample.axes ?? [];
        const cross = sample.crossSectionAxes ?? [];
        const scale = this.activeRenderer.options?.displayScale ?? 1;
        const axisU = normalize3(axes[0] ?? cross[0]);
        const axisV = orthogonalize3(normalize3(axes[1] ?? cross[1]), axisU);
        const axisW = normalizeOrZero3(cross[2]);
        return add3(
            add3(
                add3(sample.position, scale3(axisU, this.offsetU * scale)),
                scale3(axisV, this.offsetV * scale)
            ),
            scale3(axisW, this.offsetW * scale)
        );
    }

    advanceOtherEntities(deltaSeconds) {
        for (const state of this.entityTransits.values()) {
            state.progress = Math.min(1, state.progress + state.speed * deltaSeconds / this.corridorLength);
            const sample = this.getTransitSample(
                state.renderer, state.progress, state.direction, 0, 0,
                0, state.entryPosition, state.entryYaw
            );
            state.entity.spatialPosition4D = { ...sample.spatialPosition4D };
            setEntityRenderPosition(state.entity, sample.position, sample.yaw);
            this.corridorChunk?.updateOccupant(state.entity, state.progress, sample.spatialPosition4D);
            if (state.progress >= 1) this.completeEntityTransit(state);
        }
    }

    constrainCrossSection(limit) {
        const length = Math.hypot(this.offsetU, this.offsetV, this.offsetW);
        if (length <= limit || length <= 1e-9) return;
        const scale = limit / length;
        this.offsetU *= scale;
        this.offsetV *= scale;
        this.offsetW *= scale;
    }

    getTransitSample(renderer, progress, direction, offsetU, offsetV, offsetW, entryPosition, entryYaw) {
        const t = direction > 0 ? progress : 1 - progress;
        const sample = renderer.getDisplaySample(t);
        const axes = sample.axes ?? [];
        const axisU = normalize3(axes[0]);
        const axisV = orthogonalize3(normalize3(axes[1]), axisU);
        const axisW = normalizeOrZero3(sample.crossSectionAxes?.[2]);
        const scale = renderer.options?.displayScale ?? 1;
        const offset = add3(
            add3(scale3(axisU, offsetU * scale), scale3(axisV, offsetV * scale)),
            scale3(axisW, offsetW * scale)
        );
        const target = add3(sample.position, offset);
        const travelled = progress * this.corridorLength;
        const blend = smoothstep(travelled / this.options.entryBlendDistance);
        const position = lerpPoint(entryPosition, target, blend);
        const yaw = lerpAngle(entryYaw, getYaw(sample.tangent, direction), blend);
        const base = sample.spatialPosition4D ?? sample.position4D ?? { x: 0, y: 0, z: 0, w: 0 };
        const axes4D = sample.axes4D ?? [];
        const spatialPosition4D = addScaled4(base, axes4D[0], offsetU);
        const secondPosition4D = addScaled4(spatialPosition4D, axes4D[1], offsetV);
        const finalPosition4D = addScaled4(secondPosition4D, axes4D[2], offsetW);
        return { position, yaw, progress, spatialPosition4D: finalPosition4D };
    }

    getCurrentRadius() {
        const t = this.direction > 0 ? this.progress : 1 - this.progress;
        const radius = this.corridor.radiusProfile;
        for (let index = 1; index < radius.length; index++) {
            if (t > radius[index].t) continue;
            const left = radius[index - 1];
            const right = radius[index];
            const blend = (t - left.t) / (right.t - left.t);
            return left.radius + (right.radius - left.radius) * blend;
        }
        return radius[radius.length - 1].radius;
    }

    completeTransit(world) {
        const arrival = this.createArrivalPosition(world, this.spatialPosition4D);
        this.player.setSpatialContext(world.transform, world.slice.id, world.layerMask);
        this.player.yaw = world.slice.id === this.corridor.destination.sliceId ? Math.PI : 0;
        this.player.spatialPosition4D = null;
        this.player.setWorldPosition(arrival);
        this.movement.setTerrain(world.terrain);
        this.movement.setMovementSuspended(false);
        this.camera.clearRenderAnchor();
        this.camera.setSpatialContext(world.transform, world.layerMask);
        this.currentSliceId = world.slice.id;
        this.corridorChunk?.leave(this.player);
        this.state = 'idle';
        this.progress = 0;
        this.direction = 0;
        this.startWorld = null;
        this.target = null;
        this.activeRenderer = null;
        this.offsetU = 0;
        this.offsetV = 0;
        this.offsetW = 0;
        this.spatialPosition4D = null;
        this.onSliceChanged(this.currentSliceId, { transitioning: false, corridorId: this.corridor.id });
        return arrival;
    }

    completeEntityTransit(state) {
        const { entity, target } = state;
        const arrival = this.createArrivalPosition(target, entity.spatialPosition4D);
        setEntitySpatialContext(entity, target);
        setEntityWorldPosition(entity, arrival, target);
        entity.spatialPosition4D = null;
        this.corridorChunk?.leave(entity);
        this.entityTransits.delete(entity);
        return arrival;
    }

    createArrivalPosition(world, spatialPosition4D) {
        const atDestination = world.slice.id === this.corridor.destination.sliceId;
        const endpoint = atDestination ? this.corridor.destination : this.corridor.source;
        const local = spatialPosition4D && world.slice.frame
            ? ambientToSlice(world.slice.frame, spatialPosition4D).position
            : endpoint.position;
        const x = clamp(local.x, world.terrain.min.x, world.terrain.max.x);
        const z = clamp(local.z + (atDestination ? 5 : -5), world.terrain.min.z, world.terrain.max.z);
        const sample = world.terrain.sampleAt(x, z);
        if (!sample) throw new RangeError('Corridor arrival lies outside destination terrain.');
        return { x, y: sample.y, z };
    }

    getState() {
        return {
            state: this.state,
            currentSliceId: this.currentSliceId,
            startSliceId: this.startWorld?.slice.id ?? null,
            destinationSliceId: this.target?.slice.id ?? null,
            progress: this.progress,
            direction: this.direction,
            corridorLength: this.corridorLength,
            speed: this.options.speed,
            position4D: this.spatialPosition4D && { ...this.spatialPosition4D },
            corridorOccupants: this.corridorChunk?.occupants.size ?? this.entityTransits.size
        };
    }

    getEntityTransitState(entity) {
        const state = this.entityTransits.get(entity);
        return state ? {
            fromSliceId: state.fromSliceId,
            toSliceId: state.target.slice.id,
            progress: state.progress,
            direction: state.direction
        } : null;
    }

    validateOptions() {
        const { triggerDistance, speed, sprintSpeed, transverseSpeed, entitySpeed,
            entryBlendDistance, lengthSegments, headingThreshold } = this.options;
        if (![triggerDistance, speed, sprintSpeed, transverseSpeed, entitySpeed, entryBlendDistance]
            .every(Number.isFinite) || triggerDistance <= 0 || speed <= 0 || sprintSpeed < speed ||
            transverseSpeed <= 0 || entitySpeed <= 0 || entryBlendDistance <= 0 ||
            !Number.isSafeInteger(lengthSegments) || lengthSegments < 8 || lengthSegments > 4096) {
            throw new RangeError('Corridor movement speeds and sampling options must be positive and valid.');
        }
        if (!Number.isFinite(headingThreshold) || headingThreshold < -1 || headingThreshold > 1) {
            throw new RangeError('Corridor traversal headingThreshold must be between -1 and 1.');
        }
    }

    assertActive() {
        if (this.disposed || !this.active) throw new Error('Corridor traversal is not active.');
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

function measureCorridor(corridor, segments) {
    let length = 0;
    let previous = sampleSpatialCorridor(corridor, 0).position;
    for (let index = 1; index <= segments; index++) {
        const current = sampleSpatialCorridor(corridor, index / segments).position;
        length += Math.hypot(
            current.x - previous.x, current.y - previous.y,
            current.z - previous.z, current.w - previous.w
        );
        previous = current;
    }
    if (!Number.isFinite(length) || length <= 1e-9) throw new RangeError('Corridor length must be positive.');
    return length * (corridor.intrinsicLengthScale ?? 1);
}

function getYaw(tangent, direction) {
    return Math.atan2(tangent.x * direction, tangent.z * direction);
}

function normalize3(vector) {
    const length = Math.hypot(vector?.x ?? 0, vector?.y ?? 0, vector?.z ?? 0);
    return length > 1e-9
        ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
        : { x: 1, y: 0, z: 0 };
}

function normalizeOrZero3(vector) {
    const length = Math.hypot(vector?.x ?? 0, vector?.y ?? 0, vector?.z ?? 0);
    return length > 1e-9
        ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
        : { x: 0, y: 0, z: 0 };
}

function orthogonalize3(vector, axis) {
    const dot = vector.x * axis.x + vector.y * axis.y + vector.z * axis.z;
    return normalize3({
        x: vector.x - axis.x * dot,
        y: vector.y - axis.y * dot,
        z: vector.z - axis.z * dot
    });
}

function add3(left, right) {
    return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale3(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function addScaled4(position, axis, amount) {
    if (!axis || !amount) return { ...position };
    return {
        x: position.x + axis.x * amount,
        y: position.y + axis.y * amount,
        z: position.z + axis.z * amount,
        w: position.w + axis.w * amount
    };
}

function lerpPoint(left, right, amount) {
    return {
        x: left.x + (right.x - left.x) * amount,
        y: left.y + (right.y - left.y) * amount,
        z: left.z + (right.z - left.z) * amount
    };
}

function lerpAngle(left, right, amount) {
    const delta = Math.atan2(Math.sin(right - left), Math.cos(right - left));
    return left + delta * amount;
}

function smoothstep(value) {
    const amount = clamp(value, 0, 1);
    return amount * amount * (3 - 2 * amount);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function getEntityRenderPosition(entity) {
    if (typeof entity.getRenderPosition === 'function') return entity.getRenderPosition();
    const position = entity.root?.position ?? entity.mesh?.position ?? entity.position;
    if (!position) throw new TypeError('Spatial entities require getRenderPosition() or a render position.');
    return { x: position.x, y: position.y, z: position.z };
}

function setEntityRenderPosition(entity, position, yaw) {
    if (typeof entity.setRenderPosition === 'function') {
        entity.setRenderPosition(position, yaw);
        return;
    }
    const target = entity.root ?? entity.mesh ?? entity;
    if (typeof target.position?.set !== 'function') throw new TypeError('Spatial entities require setRenderPosition() or a Babylon position.');
    target.position.set(position.x, position.y, position.z);
    if (Number.isFinite(yaw) && target.rotation) target.rotation.y = yaw;
}

function setEntitySpatialContext(entity, world) {
    if (typeof entity.setSpatialContext === 'function') {
        entity.setSpatialContext(world.transform, world.slice.id, world.layerMask);
        return;
    }
    entity.transform = world.transform;
    entity.sliceId = world.slice.id;
    entity.layerMask = world.layerMask;
    const target = entity.root ?? entity.mesh ?? entity;
    if (target.layerMask !== undefined) target.layerMask = world.layerMask;
    if (target.metadata) target.metadata.sliceId = world.slice.id;
}

function setEntityWorldPosition(entity, position, world) {
    if (typeof entity.setWorldPosition === 'function') {
        entity.setWorldPosition(position);
        return;
    }
    entity.worldPosition = { ...position };
    const render = world.transform.worldToRender(position);
    setEntityRenderPosition(entity, render, entity.yaw ?? 0);
}

function requireObject(value, name) {
    if (!value || typeof value !== 'object') throw new TypeError(`CorridorTraversalController requires ${name}.`);
    return value;
}

export { CorridorTraversalController, measureCorridor };
