/** Applies visibility across current and legacy world-manager contracts. */

export function setWorldManagerVisibility(manager, visible) {
    if (!manager) return;

    const nextVisible = Boolean(visible);
    manager.visible = nextVisible;

    if (applyManagerVisibility(manager, nextVisible)) return;
    applyResidentVisibility(manager, nextVisible);
}

function applyManagerVisibility(manager, visible) {
    if (typeof manager.setVisible !== 'function') return false;

    try {
        manager.setVisible(visible);
        return true;
    } catch (error) {
        console.warn('[GeometryDemo] WorldManager.setVisible failed; using compatibility fallback.', error);
        return false;
    }
}

function applyResidentVisibility(manager, visible) {
    const chunks = manager.chunks;
    if (chunks && typeof chunks.values === 'function') {
        for (const chunk of chunks.values()) setChunkVisibility(chunk, visible);
        return;
    }
    applyMeshVisibility(manager, visible);
}

function setChunkVisibility(chunk, visible) {
    if (!chunk) return;
    chunk.visible = visible;
    if (chunk.mesh) chunk.mesh.isVisible = visible;
}

function applyMeshVisibility(manager, visible) {
    if (typeof manager.getMeshes !== 'function') return;
    for (const mesh of manager.getMeshes() || []) {
        if (mesh) mesh.isVisible = visible;
    }
}
