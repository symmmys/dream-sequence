/** Render-space-only visualization for authoritative slice optical paths. */

import { ambientToSlice } from './spatial-4d.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

class OpticalDebugRenderer {
    constructor(scene, options = {}) {
        if (!scene) throw new TypeError('OpticalDebugRenderer requires a Babylon scene.');
        this.scene = scene;
        this.name = options.name ?? 'somniumOpticalRayDebug';
        this.meshes = [];
        this.visible = options.visible ?? true;
        this.disposed = false;
    }

    renderTrace(result, options = {}) {
        this.assertActive();
        const slice = options.slice;
        const transform = options.spatialTransform;
        if (!slice?.id || !slice.frame || typeof transform?.worldToRender !== 'function') {
            throw new TypeError('Optical debug rendering requires a slice and its SpatialTransform.');
        }
        const tolerance = options.sliceTolerance ?? 1e-6;
        if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('Optical debug slice tolerance must be positive.');
        const color = resolveColor(options.color);
        const groups = [];
        let active = [];
        for (const sample of result?.samples ?? []) {
            const local = ambientToSlice(slice.frame, sample.position);
            if (Math.abs(local.normalOffset) > tolerance) {
                flushGroup(groups, active);
                active = [];
                continue;
            }
            const render = transform.worldToRender(local.position);
            if (![render.x, render.y, render.z].every(Number.isFinite)) {
                flushGroup(groups, active);
                active = [];
                continue;
            }
            active.push(new BABYLON.Vector3(render.x, render.y, render.z));
        }
        flushGroup(groups, active);
        this.clear();
        let index = 0;
        for (const points of groups) {
            if (points.length < 2) continue;
            const mesh = BABYLON.MeshBuilder.CreateLines(`${this.name}_${slice.id}_${index++}`, { points }, this.scene);
            mesh.color = new BABYLON.Color3(color.r, color.g, color.b);
            mesh.alpha = options.alpha ?? 1;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.metadata = {
                ...(mesh.metadata || {}),
                opticalDebugRay: true,
                sliceId: slice.id,
                opticalStatus: result.status,
                opticalEvent: result.event?.primitiveType ?? null
            };
            mesh.isVisible = this.visible;
            this.meshes.push(mesh);
        }
        return this.meshes.slice();
    }

    setVisible(visible) {
        this.assertActive();
        this.visible = Boolean(visible);
        for (const mesh of this.meshes) mesh.isVisible = this.visible;
    }

    clear() {
        if (this.disposed) return;
        for (const mesh of this.meshes) mesh.dispose(false, false);
        this.meshes.length = 0;
    }

    getStats() {
        return { visible: this.visible, meshCount: this.meshes.length, disposed: this.disposed };
    }

    assertActive() {
        if (this.disposed) throw new Error('OpticalDebugRenderer has been disposed.');
    }

    dispose() {
        if (this.disposed) return;
        this.clear();
        this.disposed = true;
    }
}

function flushGroup(groups, points) {
    if (points.length > 1) groups.push(points);
}

function resolveColor(value) {
    if (!value) return { r: 0.22, g: 0.92, b: 1 };
    const color = { r: value.r, g: value.g, b: value.b };
    if (![color.r, color.g, color.b].every((component) => Number.isFinite(component) && component >= 0 && component <= 1)) {
        throw new RangeError('Optical debug color components must be between zero and one.');
    }
    return color;
}

export { OpticalDebugRenderer };
