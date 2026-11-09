import assert from 'node:assert/strict';
import test from 'node:test';
import { GeometryDebugGrid } from '../src/world/fields/geometry/geometry-debug-grid.js';

class Vector3 {
    constructor(x, y, z) { Object.assign(this, { x, y, z }); }
}

class Color3 {
    constructor(r, g, b) { Object.assign(this, { r, g, b }); }
}

test('metric grid visibility is independently controlled by active slice and user preference', function gridVisibilityState() {
    const previousBabylon = globalThis.BABYLON;
    let mesh;
    globalThis.BABYLON = {
        Vector3,
        Color3,
        MeshBuilder: {
            CreateLineSystem(name, options) {
                mesh = {
                    name,
                    lines: options.lines,
                    isVisible: false,
                    dispose() { this.disposed = true; }
                };
                return mesh;
            }
        }
    };
    try {
        const grid = new GeometryDebugGrid({}, { applyMesh() {} }, {
            sliceId: 'somnium-main',
            size: 4,
            spacing: 2,
            visible: false
        });
        assert.equal(grid.mesh.isVisible, false);
        grid.setActive(true);
        assert.equal(grid.mesh.isVisible, false);
        grid.setVisible(true);
        assert.equal(grid.mesh.isVisible, true);
        grid.setActive(false);
        assert.equal(grid.mesh.isVisible, false);
        grid.setActive(true);
        assert.equal(grid.mesh.isVisible, true);
        grid.setVisible(false);
        assert.equal(grid.mesh.isVisible, false);
        grid.dispose();
        assert.equal(mesh.disposed, true);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('terrain-conformed metric grid samples surface height at each vertex', function terrainConformedGrid() {
    const previousBabylon = globalThis.BABYLON;
    let mesh;
    globalThis.BABYLON = {
        Vector3,
        Color3,
        MeshBuilder: {
            CreateLineSystem(name, options) {
                mesh = { name, lines: options.lines, dispose() {} };
                return mesh;
            }
        }
    };
    try {
        const sampled = [];
        new GeometryDebugGrid({}, { applyMesh() {} }, {
            sliceId: 'somnium-main',
            size: 4,
            spacing: 2,
            sampleStep: 1,
            center: { x: 10, z: 20 },
            visible: true,
            heightAt(x, z) {
                sampled.push({ x, z });
                return 0.5 * x + 0.25 * z;
            }
        });
        assert.ok(mesh.lines.length > 0);
        assert.ok(sampled.length > 0);
        const vertex = mesh.lines[0][0];
        assert.equal(vertex.x, 8);
        assert.equal(vertex.z, 18);
        assert.equal(vertex.y, 8.5);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});


test('terrain gaps split metric-grid lines instead of drawing across missing samples', function gridRespectsTerrainGaps() {
    const previousBabylon = globalThis.BABYLON;
    let mesh;
    globalThis.BABYLON = {
        Vector3,
        Color3,
        MeshBuilder: {
            CreateLineSystem(name, options) {
                mesh = { name, lines: options.lines, dispose() {} };
                return mesh;
            }
        }
    };
    try {
        new GeometryDebugGrid({}, { applyMesh() {} }, {
            sliceId: 'somnium-main',
            size: 4,
            spacing: 2,
            sampleStep: 1,
            heightAt(x, z) {
                return Math.abs(x) < 1e-8 && Math.abs(z) < 1e-8 ? null : 0;
            }
        });
        const centerColumnSegments = mesh.lines.filter((line) =>
            line.every((vertex) => Math.abs(vertex.x) < 1e-8)
        );
        assert.ok(centerColumnSegments.length >= 2);
        for (const line of centerColumnSegments) {
            assert.equal(line.some((vertex) => vertex.z < 0) && line.some((vertex) => vertex.z > 0), false);
        }
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});
