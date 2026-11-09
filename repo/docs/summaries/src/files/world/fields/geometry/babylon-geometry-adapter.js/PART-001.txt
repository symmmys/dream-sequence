/** Routes meshes to the renderer bound to their WorldSlice identity. */

import { GeometryRenderer } from './geometry-renderer.js';

class BabylonGeometryAdapter {
    constructor(scene, options = {}) {
        if (!scene) throw new TypeError('BabylonGeometryAdapter requires a scene.');
        this.scene = scene;
        this.renderers = new Map();
        this.useGpu = options.useGpu ?? false;
        this.opticalScene = options.opticalScene ?? null;
        this.opticalBindings = new Map();
        this.statistics = { applied: 0, skipped: 0, missingSlice: 0 };
    }

    registerSlice(slice, spatialTransform) {
        if (!slice?.id || !spatialTransform) throw new TypeError('A slice and transform are required.');
        if (this.renderers.has(slice.id)) throw new Error(`Geometry slice already registered: ${slice.id}`);
        const renderer = new GeometryRenderer(this.scene, spatialTransform);
        this.renderers.set(slice.id, { slice, spatialTransform, renderer });
        return renderer;
    }

    applyMesh(mesh, sliceId = mesh?.metadata?.sliceId) {
        if (!mesh || !sliceId) return this.skipMissingSlice();
        const binding = this.renderers.get(sliceId);
        if (!binding) return this.skipMissingSlice();
        if (mesh.parent) {
            console.warn(`[GeometryAdapter] Parent transforms are unsupported for ${mesh.name}; mesh kept unchanged.`);
            this.statistics.skipped++;
            return false;
        }
        bakeMeshTransform(mesh);
        mesh.metadata = { ...(mesh.metadata || {}), sliceId, geometryRenderPath: 'cpu' };
        this.registerOpticalMesh(mesh, sliceId);
        const applied = binding.renderer.applyMesh(mesh);
        if (applied) this.statistics.applied++;
        else this.statistics.skipped++;
        return applied;
    }

    skipMissingSlice() {
        this.statistics.missingSlice++;
        return false;
    }

    restoreMesh(mesh) {
        const sliceId = mesh?.metadata?.sliceId;
        const binding = this.renderers.get(sliceId);
        this.unregisterOpticalMesh(mesh);
        return binding ? binding.renderer.restoreMesh(mesh) : false;
    }

    registerOpticalMesh(mesh, sliceId) {
        if (!this.opticalScene || !mesh || shouldIgnoreOpticalMesh(mesh)) return false;
        const positions = mesh.getVerticesData?.(BABYLON.VertexBuffer.PositionKind);
        const indices = mesh.getIndices?.();
        if (!positions?.length || !indices?.length) return false;
        const previousRevision = this.opticalBindings.get(mesh)?.revision ?? 0;
        this.unregisterOpticalMesh(mesh);
        const id = `babylon-mesh:${mesh.uniqueId ?? mesh.id ?? mesh.name}`;
        const materialId = mesh.material?.id ?? mesh.material?.name ?? mesh.name ?? id;
        const opticalMaterial = mesh.metadata?.opticalMaterial ?? { id: `material:${materialId}` };
        const registration = this.opticalScene.registerTriangleMesh({
            id,
            sliceId,
            positions,
            indices,
            chunkAddress: mesh.metadata?.chunkAddress ?? (
                Number.isSafeInteger(mesh.metadata?.chunkX) && Number.isSafeInteger(mesh.metadata?.chunkZ)
                    ? { sliceId, chunkX: mesh.metadata.chunkX, chunkZ: mesh.metadata.chunkZ }
                    : null
            ),
            material: opticalMaterial,
            revision: previousRevision + 1,
            enabled: mesh.isEnabled?.() !== false
        });
        this.opticalBindings.set(mesh, { id, revision: registration.revision });
        return true;
    }

    unregisterOpticalMesh(mesh) {
        const binding = this.opticalBindings.get(mesh);
        if (!binding) return false;
        this.opticalScene?.unregister(binding.id);
        this.opticalBindings.delete(mesh);
        return true;
    }

    getStats() {
        return {
            registeredSlices: this.renderers.size,
            renderers: Array.from(this.renderers, rendererStats),
            ...this.statistics,
            opticalRegistrations: this.opticalBindings.size,
            gpuEnabled: this.useGpu
        };
    }

    dispose() {
        for (const mesh of this.opticalBindings.keys()) this.unregisterOpticalMesh(mesh);
        for (const binding of this.renderers.values()) binding.renderer.dispose();
        this.renderers.clear();
    }
}

function shouldIgnoreOpticalMesh(mesh) {
    const metadata = mesh.metadata ?? {};
    return metadata.opticalIgnore === true || metadata.renderOnly === true ||
        metadata.geometryProxy === true || metadata.geometryDebugGrid === true ||
        metadata.demoLabel === true || metadata.hypercube4D === true ||
        metadata.hypercube4DSectionVertex !== undefined || mesh.isPickable === false && metadata.opticalSurface !== true;
}

function bakeMeshTransform(mesh) {
    mesh.computeWorldMatrix(true);
    if (mesh.bakeCurrentTransformIntoVertices) mesh.bakeCurrentTransformIntoVertices();
}

function rendererStats(entry) {
    return { sliceId: entry[0], ...entry[1].renderer.getStats() };
}

export { BabylonGeometryAdapter };
