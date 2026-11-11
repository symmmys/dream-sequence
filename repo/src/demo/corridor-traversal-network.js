/** Coordinates several single-corridor controllers as one connected world graph. */

import { ambientToSlice } from '../world/fields/geometry/spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

class CorridorTraversalNetwork {
    constructor(options = {}) {
        this.topology = requireObject(options.topology, 'topology');
        this.worlds = new Map(options.worlds ?? []);
        this.controllers = [...(options.controllers ?? [])];
        if (!this.controllers.length) throw new TypeError('Traversal network requires at least one controller.');
        this.currentSliceId = options.initialSliceId ?? this.controllers[0].currentSliceId;
        this.onSliceChanged = options.onSliceChanged ?? noop;
        this.active = false;
        this.disposed = false;
        this.activeController = null;
        this.bindControllers();
    }

    bindControllers() {
        for (const controller of this.controllers) this.bindController(controller);
    }

    bindController(controller) {
        const notify = controller.onSliceChanged;
        controller.currentSliceId = this.currentSliceId;
        controller.onSliceChanged = this.handleSliceChanged.bind(this, controller, notify);
        controller.setActive?.(this.active);
    }

    addController(controller) {
        if (!controller || !controller.corridor?.id) throw new TypeError('A traversal controller with a corridor ID is required.');
        if (this.controllers.some(entry => entry.corridor.id === controller.corridor.id)) {
            throw new Error(`Traversal controller already exists: ${controller.corridor.id}`);
        }
        this.controllers.push(controller);
        this.bindController(controller);
        return controller;
    }

    removeController(corridorId) {
        const index = this.controllers.findIndex(entry => entry.corridor.id === corridorId);
        if (index < 0) return false;
        const [controller] = this.controllers.splice(index, 1);
        if (this.activeController === controller) this.activeController = null;
        controller.dispose?.();
        return true;
    }

    handleSliceChanged(controller, notify, sliceId, state) {
        this.currentSliceId = sliceId;
        this.syncSlice(sliceId);
        if (typeof notify === 'function') notify(sliceId, state);
        this.onSliceChanged(sliceId, state);
    }

    update(deltaSeconds) {
        if (!this.active || this.disposed) return;
        const delta = Math.max(0, Math.min(deltaSeconds, 0.1));
        const transit = this.getActiveController();
        if (transit) {
            transit.update(delta);
            for (const controller of this.controllers) {
                if (controller !== transit) controller.advanceOtherEntities(delta);
            }
            if (transit.state !== 'transit') this.activeController = null;
            this.currentSliceId = transit.currentSliceId;
            this.syncSlice(this.currentSliceId);
            return;
        }

        this.activeController = null;
        this.syncSlice(this.currentSliceId);
        for (const controller of this.controllers) {
            if (controller.tryBeginTransit()) {
                this.activeController = controller;
                break;
            }
        }
        if (!this.activeController) this.advanceAmbientInfluenceMovement(delta);
        this.currentSliceId = this.controllers[0]?.currentSliceId ?? this.currentSliceId;
        this.syncSlice(this.currentSliceId);
        for (const controller of this.controllers) controller.advanceOtherEntities(delta);
    }

    advanceAmbientInfluenceMovement(deltaSeconds) {
        const input = this.controllers[0]?.getMovementInput?.() ?? {};
        const direction = Number(input.crossSectionW) || 0;
        if (!direction) return false;

        // Controllers are synchronized to the active slice, but not every
        // controller owns a WorldSlice binding for that slice. Resolve one
        // authoritative ambient position first, then evaluate only routes
        // that actually connect from the current slice.
        const position4D = this.getAmbientPlayerPosition();
        if (!position4D) return false;
        const forceWMovement = Boolean(this.controllers[0]?.camera?.wMovementEnabled);
        const candidates = this.controllers.filter((controller) =>
            controller.ownsSlice?.(this.currentSliceId) ??
                (controller.worlds instanceof Map
                    ? controller.worlds.has(this.currentSliceId)
                    : controller.currentSliceId === this.currentSliceId)
        ).map((controller) => {
            const influence = controller.getInfluenceMovementInfo?.(
                position4D, direction, this.currentSliceId, { ignoreFreedom: forceWMovement }
            );
            return influence ? { controller, influence } : null;
        }).filter(Boolean).sort((left, right) =>
            right.influence.movementScale - left.influence.movementScale
        );
        if (!candidates.length) {
            if (!forceWMovement) return false;
            const owner = this.controllers.find((controller) => controller.worlds?.has?.(this.currentSliceId));
            const world = owner?.worlds?.get?.(this.currentSliceId);
            if (!world?.slice?.frame || !owner?.player) return false;
            const frame = world.slice.frame;
            const local = ambientToSlice(frame, position4D);
            const bounds = world.wBounds ?? { min: -12, max: 12 };
            let minimum = Number.isFinite(bounds.min) ? bounds.min : -12;
            let maximum = Number.isFinite(bounds.max) ? bounds.max : 12;
            // A zero-thickness legacy demo slice is still useful for W-axis
            // playtesting; give it a modest inspection interval without
            // modifying the saved/runtime Plane boundary.
            if (maximum - minimum < 1e-6) { minimum = -12; maximum = 12; }
            const speed = input.sprint ? (owner.options?.sprintSpeed ?? 12) : (owner.options?.speed ?? 8);
            const nextOffset = Math.max(minimum, Math.min(maximum,
                local.normalOffset + direction * speed * Math.min(Math.max(deltaSeconds, 0), 0.1)));
            if (Math.abs(nextOffset - local.normalOffset) < 1e-10) return false;
            const candidate = { ...position4D };
            const deltaW = nextOffset - local.normalOffset;
            candidate.x += frame.normal.x * deltaW;
            candidate.y += frame.normal.y * deltaW;
            candidate.z += frame.normal.z * deltaW;
            candidate.w += frame.normal.w * deltaW;
            owner.player.spatialPosition4D = candidate;
            owner.player.setWorldPosition?.(local.position);
            return true;
        }
        return candidates[0].controller.advanceAmbientInfluenceMovement(deltaSeconds, position4D, { ignoreFreedom: forceWMovement });
    }

    getAmbientPlayerPosition() {
        const active = this.getActiveController();
        if (active?.spatialPosition4D) return { ...active.spatialPosition4D };

        // A network may contain routes that do not touch the current slice.
        // Do not stop at the first synchronized controller: find the first
        // controller that owns a binding for this actual WorldSlice and can
        // resolve a finite ambient position.
        let fallback = null;
        // Multiple anomalies can have separate presentation mouths in one
        // slice. Prefer the controller whose visible portal approach contains
        // the player; otherwise an unrelated route can rebase coordinates
        // against its own canonical endpoint and keep the correct W field off.
        for (const controller of this.controllers) {
            const ownsSlice = typeof controller.ownsSlice === 'function'
                ? controller.ownsSlice(this.currentSliceId)
                : controller.worlds instanceof Map
                    ? controller.worlds.has(this.currentSliceId)
                    : controller.currentSliceId === this.currentSliceId;
            if (!ownsSlice || typeof controller.getAmbientPlayerPosition !== 'function') continue;
            const position = controller.getAmbientPlayerPosition();
            if (!isFinitePosition4(position)) continue;
            if (controller.isNearPresentationPortal?.(this.currentSliceId)) return { ...position };
            if (!fallback) fallback = { ...position };
        }
        return fallback;
    }

    getEntryDiagnostics() {
        return this.controllers.map((controller) => ({
            anomalyId: controller.corridor.id,
            ...controller.getEntryDiagnostic?.()
        }));
    }

    syncSlice(sliceId) {
        for (const controller of this.controllers) controller.currentSliceId = sliceId;
    }

    setActive(active) {
        this.active = Boolean(active) && !this.disposed;
        for (const controller of this.controllers) controller.setActive(this.active);
    }

    getActiveController() {
        return this.activeController?.state === 'transit'
            ? this.activeController
            : this.controllers.find(function inTransit(controller) {
                return controller.state === 'transit';
            }) ?? null;
    }

    get state() { return this.getActiveController()?.state ?? 'idle'; }
    get corridor() { return this.getActiveController()?.corridor ?? null; }
    get corridorLength() { return this.getActiveController()?.corridorLength ?? 0; }
    get startWorld() { return this.getActiveController()?.startWorld ?? null; }
    get target() { return this.getActiveController()?.target ?? null; }
    get direction() { return this.getActiveController()?.direction ?? 0; }
    get progress() { return this.getActiveController()?.progress ?? 0; }
    get offsetU() { return this.getActiveController()?.offsetU ?? 0; }
    get offsetV() { return this.getActiveController()?.offsetV ?? 0; }
    get offsetW() { return this.getActiveController()?.offsetW ?? 0; }
    get activeRenderer() { return this.getActiveController()?.activeRenderer ?? null; }

    getRoutesForSlice(sliceId) {
        return this.topology.getTraversableNeighbors(sliceId)
            .map(this.resolveRoute.bind(this, sliceId))
            .filter(Boolean);
    }

    resolveRoute(sliceId, link) {
        const controller = this.controllers.find(function matchingController(entry) {
            return entry.corridor.id === link.corridorId;
        });
        if (!controller) return null;
        return {
            ...link, controller, corridor: controller.corridor,
            fromSource: controller.corridor.source.sliceId === sliceId,
            renderer: controller.renderers.get(sliceId) ?? controller.renderer,
            corridorLength: controller.corridorLength
        };
    }

    getRouteForSlice(sliceId, corridorId) {
        return this.getRoutesForSlice(sliceId).find(function matchRoute(route) {
            return route.corridorId === corridorId;
        }) ?? null;
    }

    beginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        const routes = this.getRoutesForSlice(fromSliceId);
        const preferred = routes.find(function preferredRoute(route) {
            return route.corridorId === entity?.corridorId;
        });
        for (const route of preferred ? [preferred] : routes) {
            if (route.controller.beginEntityTransit(entity, fromSliceId)) return true;
        }
        return false;
    }

    tryBeginEntityTransit(entity, fromSliceId = entity?.sliceId) {
        for (const route of this.getRoutesForSlice(fromSliceId)) {
            if (route.controller.tryBeginEntityTransit(entity, fromSliceId)) return true;
        }
        return false;
    }

    getEntityTransitState(entity) {
        for (const controller of this.controllers) {
            const state = controller.getEntityTransitState(entity);
            if (state) return state;
        }
        return null;
    }

    getState() {
        return {
            state: this.state,
            currentSliceId: this.currentSliceId,
            activeCorridorId: this.corridor?.id ?? null,
            routes: this.controllers.map(function summarize(controller) {
                return controller.getState();
            })
        };
    }

    dispose() {
        if (this.disposed) return;
        this.setActive(false);
        this.disposed = true;
        for (const controller of this.controllers) controller.dispose();
        this.controllers.length = 0;
        this.activeController = null;
    }
}


function isFinitePosition4(position) {
    return Boolean(position) &&
        Number.isFinite(position.x) && Number.isFinite(position.y) &&
        Number.isFinite(position.z) && Number.isFinite(position.w);
}

function requireObject(value, label) {
    if (!value || typeof value !== 'object') throw new TypeError(`${label} is required.`);
    return value;
}

function noop() {}

export { CorridorTraversalNetwork };
