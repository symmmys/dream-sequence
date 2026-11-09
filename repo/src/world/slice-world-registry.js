/** Owns runtime resources for independently addressed world slices. */

class SliceWorldRegistry {
    constructor() {
        this.slices = new Map();
        this.disposed = false;
    }

    register(slice, runtime = {}) {
        this.assertActive();
        if (!slice || typeof slice.id !== 'string' || !slice.id.trim()) {
            throw new TypeError('SliceWorldRegistry requires a valid WorldSlice.');
        }
        if (this.slices.has(slice.id)) throw new Error(`Slice runtime already registered: ${slice.id}`);
        const binding = { slice, ...runtime, disposed: false };
        this.slices.set(slice.id, binding);
        return binding;
    }

    get(sliceId) {
        this.assertActive();
        return this.slices.get(sliceId) ?? null;
    }

    require(sliceId) {
        const binding = this.get(sliceId);
        if (!binding) throw new Error(`Unknown slice runtime: ${sliceId}`);
        return binding;
    }

    getTransform(sliceId) {
        return this.require(sliceId).spatialTransform;
    }

    unregister(sliceId) {
        const binding = this.slices.get(sliceId);
        if (!binding) return false;
        disposeBinding(binding);
        this.slices.delete(sliceId);
        return true;
    }

    assertActive() {
        if (this.disposed) throw new Error('SliceWorldRegistry has been disposed.');
    }

    dispose() {
        if (this.disposed) return;
        for (const binding of this.slices.values()) disposeBinding(binding);
        this.slices.clear();
        this.disposed = true;
    }
}

function disposeBinding(binding) {
    if (binding.disposed) return;
    binding.disposed = true;
    if (typeof binding.dispose === 'function') binding.dispose();
    else if (binding.terrain?.dispose) binding.terrain.dispose();
}

export { SliceWorldRegistry };
