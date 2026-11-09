/** Toggleable per-slice metric grid, optionally conformed to local terrain. */

class GeometryDebugGrid {
    constructor(scene, adapter, options = {}) {
        this.scene = scene;
        this.adapter = adapter;
        this.sliceId = options.sliceId;
        this.size = options.size ?? 24;
        this.spacing = options.spacing ?? 2;
        this.center = {
            x: options.center?.x ?? 0,
            z: options.center?.z ?? 0
        };
        this.heightAt = typeof options.heightAt === 'function' ? options.heightAt : null;
        this.sampleStep = options.sampleStep ?? Math.min(this.spacing, 2);
        this.visible = options.visible ?? true;
        this.active = true;
        this.mesh = this.createMesh(options.y ?? 0.04);
        this.mesh.isVisible = this.active && this.visible;
    }

    createMesh(height) {
        const mesh = BABYLON.MeshBuilder.CreateLineSystem(
            `geometryMetricDebugGrid-${this.sliceId ?? 'unbound'}`,
            {
                lines: createGridLines(
                    this.size, this.spacing, height, this.center,
                    this.heightAt, this.sampleStep
                )
            },
            this.scene
        );
        mesh.color = new BABYLON.Color3(0.18, 0.78, 0.94);
        mesh.alpha = 0.72;
        mesh.isPickable = false;
        mesh.metadata = { sliceId: this.sliceId, geometryDebugGrid: true };
        this.adapter.applyMesh(mesh, this.sliceId);
        return mesh;
    }

    toggle() {
        this.setVisible(!this.visible);
        return this.visible;
    }

    setVisible(visible) {
        this.visible = Boolean(visible);
        this.mesh.isVisible = this.active && this.visible;
    }

    setActive(active) {
        this.active = Boolean(active);
        this.mesh.isVisible = this.active && this.visible;
    }

    getInfo() {
        return {
            visible: this.visible,
            active: this.active,
            sliceId: this.sliceId,
            size: this.size,
            spacing: this.spacing
        };
    }

    dispose() {
        this.mesh.dispose();
    }
}

function createGridLines(size, spacing, height, center, heightAt, sampleStep) {
    const lines = [];
    const half = size / 2;
    const segments = Math.max(1, Math.ceil(size / sampleStep));
    const step = size / segments;

    for (let offset = -half; offset <= half + 1e-6; offset += spacing) {
        if (!heightAt) {
            lines.push([
                new BABYLON.Vector3(center.x + offset, height, center.z - half),
                new BABYLON.Vector3(center.x + offset, height, center.z + half)
            ]);
            lines.push([
                new BABYLON.Vector3(center.x - half, height, center.z + offset),
                new BABYLON.Vector3(center.x + half, height, center.z + offset)
            ]);
            continue;
        }

        let longitudinal = [];
        let transverse = [];
        for (let index = 0; index <= segments; index++) {
            const distance = -half + index * step;
            const xForLongitudinal = center.x + offset;
            const zForLongitudinal = center.z + distance;
            const longY = sampleHeight(heightAt, xForLongitudinal, zForLongitudinal);
            longitudinal = appendTerrainSample(
                lines, longitudinal, xForLongitudinal, longY, zForLongitudinal
            );

            const xForTransverse = center.x + distance;
            const zForTransverse = center.z + offset;
            const transverseY = sampleHeight(heightAt, xForTransverse, zForTransverse);
            transverse = appendTerrainSample(
                lines, transverse, xForTransverse, transverseY, zForTransverse
            );
        }
        flushTerrainLine(lines, longitudinal);
        flushTerrainLine(lines, transverse);
    }
    return lines;
}

function sampleHeight(heightAt, x, z) {
    try {
        const value = heightAt(x, z);
        return Number.isFinite(value) ? value : null;
    } catch (error) {
        return null;
    }
}

function appendTerrainSample(lines, line, x, y, z) {
    if (Number.isFinite(y)) {
        line.push(new BABYLON.Vector3(x, y, z));
        return line;
    }
    flushTerrainLine(lines, line);
    return [];
}

function flushTerrainLine(lines, line) {
    if (line.length > 1) lines.push(line);
}

export { GeometryDebugGrid };
