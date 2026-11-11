import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createHypercubeEdges, createHypercubeSlice, createHypercubeVertices,
    rotateHypercubePoint
} from '../src/world/fields/geometry/hypercube-4d.js';

const BASE_ANGLES = { xw: 0, yw: 0, zw: 0 };
const OBLIQUE_ANGLES = { xw: 0.42, yw: 0.36, zw: 0.32 };

test('tesseract contains 16 distinct corners and 32 single-axis edges', function tesseractTopology() {
    const vertices = createHypercubeVertices(2.5);
    const edges = createHypercubeEdges(vertices);
    const unique = new Set(vertices.map(function coordinateKey(point) {
        return ['x', 'y', 'z', 'w'].map(function value(axis) { return point[axis]; }).join(':');
    }));
    assert.equal(vertices.length, 16);
    assert.equal(unique.size, 16);
    assert.equal(edges.length, 32);
    assert.ok(vertices.every(function hasFourCoordinates(point) {
        return ['x', 'y', 'z', 'w'].every(function finite(axis) { return Number.isFinite(point[axis]); });
    }));
    assert.ok(edges.every(function joinsAdjacentCorners(edge) {
        return ['x', 'y', 'z', 'w'].filter(function differs(axis) {
            return edge[0][axis] !== edge[1][axis];
        }).length === 1;
    }));
});

test('XW-plane rotation moves vertices through the fourth dimension', function xwRotation() {
    const rotated = rotateHypercubePoint({ x: 2, y: 0, z: 0, w: 0 }, { xw: Math.PI / 2 });
    assert.ok(Math.abs(rotated.x) < 1e-9);
    assert.ok(Math.abs(rotated.w - 2) < 1e-9);
});

test('central axis-aligned slice is a cube with six square faces', function centralCubeSlice() {
    const slice = createHypercubeSlice(createHypercubeVertices(2), BASE_ANGLES, 0);
    assert.equal(slice.vertices.length, 8);
    assert.equal(slice.faces.length, 6);
    assert.ok(slice.faces.every(function squareFace(face) { return face.length === 4; }));
    assert.equal(slice.edges.length, 12);
    assert.equal(slice.empty, false);
});

test('oblique 4D orientation produces a non-cubic central section', function obliqueSection() {
    const slice = createHypercubeSlice(createHypercubeVertices(4.2), OBLIQUE_ANGLES, 0);
    assert.equal(slice.vertices.length, 12);
    assert.equal(slice.faces.length, 8);
    assert.equal(slice.edges.length, 18);
    assert.ok(slice.faces.some(function nonSquareFace(face) { return face.length !== 4; }));
});

test('cross-section is a closed polyhedral boundary with two faces per edge', function closedSectionBoundary() {
    const slice = createHypercubeSlice(createHypercubeVertices(4.2), OBLIQUE_ANGLES, 0);
    const edgeUse = new Map();
    for (const face of slice.faces) {
        for (let index = 0; index < face.length; index++) {
            const a = face[index];
            const b = face[(index + 1) % face.length];
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
        }
    }
    assert.equal(edgeUse.size, slice.edges.length);
    assert.ok([...edgeUse.values()].every(function sharedByTwoFaces(count) { return count === 2; }));
    assert.equal(slice.vertices.length - slice.edges.length + slice.faces.length, 2);
});

test('moving along W reveals different 3D cross-sections', function changingWSection() {
    const vertices = createHypercubeVertices(4.2);
    const center = createHypercubeSlice(vertices, OBLIQUE_ANGLES, 0);
    const offset = createHypercubeSlice(vertices, OBLIQUE_ANGLES, 5);
    const outside = createHypercubeSlice(vertices, OBLIQUE_ANGLES, 9);
    assert.equal(center.vertices.length, 12);
    assert.equal(offset.vertices.length, 6);
    assert.notDeepEqual(center.vertices, offset.vertices);
    assert.equal(outside.empty, true);
});

test('W slice topology changes continuously with 4D rotation', function rotatingSection() {
    const vertices = createHypercubeVertices(4.2);
    const initial = createHypercubeSlice(vertices, BASE_ANGLES, 0);
    const rotated = createHypercubeSlice(vertices, OBLIQUE_ANGLES, 0);
    assert.equal(initial.vertices.length, 8);
    assert.equal(rotated.vertices.length, 12);
});

test('Babylon renderer rebuilds a real slice surface and edge shell in place', async function rendererLifecycle() {
    const { Hypercube4DRenderer } = await import('../src/demo/hypercube-4d-renderer.js');
    const calls = [];
    class FakeMesh {
        constructor(name) {
            this.name = name;
            this.data = new Map();
            this.isVisible = true;
            this.position = { set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
            this.scaling = { setAll: (value) => { this.scale = value; } };
        }
        setVerticesData(kind, data) { this.data.set(kind, data.slice()); calls.push(`set-${kind}`); }
        updateVerticesData(kind, data) { this.data.set(kind, data.slice()); calls.push(`update-${kind}`); }
        setIndices(indices) { this.indices = indices.slice(); }
        refreshBoundingInfo() { calls.push('bounds'); }
        dispose() { calls.push(`dispose-${this.name}`); }
        setEnabled(enabled) { this.enabled = enabled; }
    }
    class Color3 {
        constructor(r, g, b) { Object.assign(this, { r, g, b }); }
        static White() { return new Color3(1, 1, 1); }
        static FromHexString(hex) {
            const value = String(hex).replace('#', '');
            return new Color3(
                parseInt(value.slice(0, 2), 16) / 255,
                parseInt(value.slice(2, 4), 16) / 255,
                parseInt(value.slice(4, 6), 16) / 255
            );
        }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
        static TransformCoordinates(value) { return new Vector3(value.x, value.y, value.z); }
    }
    class Quaternion {
        static Identity() { return new Quaternion(); }
        static FromEulerAngles(x, y, z) { return Object.assign(new Quaternion(), { x, y, z }); }
        toRotationMatrix(result) {
            result.rotation = this;
            return result;
        }
    }
    class Matrix {
        static Identity() { return new Matrix(); }
    }
    class StandardMaterial {
        constructor(name) { this.name = name; }
        dispose() { calls.push(`material-dispose-${this.name}`); }
    }
    globalThis.BABYLON = {
        Mesh: FakeMesh,
        VertexBuffer: { PositionKind: 'position', NormalKind: 'normal' },
        MeshBuilder: {
            CreateSphere(name) { calls.push(`sphere-${name}`); return new FakeMesh(name); }
        },
        StandardMaterial,
        Color3, Vector3, Quaternion, Matrix
    };
    try {
        const renderer = new Hypercube4DRenderer({ scene: true }, {
            worldToRender(point) { return point; }
        });
        const initialPositions = renderer.edgeMesh.data.get('position');
        assert.equal(renderer.edges.length, 32);
        assert.equal(renderer.slice.vertices.length, 12);
        assert.equal(renderer.slice.faces.length, 8);
        assert.ok(renderer.surfaceMesh.indices.length > 0);
        assert.ok(renderer.edgeMesh.indices.length > 0);
        assert.equal(renderer.vertexMeshes.length, 32);
        assert.equal(renderer.meshes.length, 34);
        assert.equal(renderer.vertexMeshes.filter(function visible(marker) { return marker.isVisible; }).length, 12);
        renderer.update(0.5, 5);
        assert.notDeepEqual(renderer.edgeMesh.data.get('position'), initialPositions);
        assert.ok(Math.abs(renderer.angle - 0.42 - 0.068) < 1e-9);
        assert.equal(renderer.viewerW, 5);
        assert.equal(renderer.slice.vertices.length, 6);
        assert.equal(renderer.getInfo().sliceFaceCount, 5);
        assert.equal(renderer.getInfo().visibleMeshCount, 8);
        renderer.update(0.1, 9);
        assert.equal(renderer.getInfo().visibleMeshCount, 0);
        const applied = renderer.setObjectDefinition({
            id: 'test-tesseract', type: 'hypercube4d',
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 15, y: 25, z: 35 },
            dimensions: { x: 8, y: 7, z: 6 },
            material: { color: '#abcdef' }, visible: true
        });
        assert.equal(applied, true);
        assert.ok(Math.abs(renderer.objectRotationMatrix.rotation.x - 15 * Math.PI / 180) < 1e-12);
        assert.ok(Math.abs(renderer.objectRotationMatrix.rotation.y - 25 * Math.PI / 180) < 1e-12);
        assert.ok(Math.abs(renderer.objectRotationMatrix.rotation.z - 35 * Math.PI / 180) < 1e-12);
        assert.deepEqual(renderer.center, { x: 1, y: 2, z: 3 });
        assert.ok(Math.abs(renderer.surfaceMaterial.diffuseColor.r - 0xab / 255) < 1e-12);
        assert.ok(Math.abs(renderer.surfaceMaterial.diffuseColor.g - 0xcd / 255) < 1e-12);
        assert.ok(Math.abs(renderer.surfaceMaterial.diffuseColor.b - 0xef / 255) < 1e-12);
        assert.ok(Math.abs(renderer.edgeMaterial.emissiveColor.r - 0xab / 255) < 1e-12);
        assert.ok(Math.abs(renderer.edgeMaterial.emissiveColor.g - 0xcd / 255) < 1e-12);
        assert.ok(Math.abs(renderer.edgeMaterial.emissiveColor.b - 0xef / 255) < 1e-12);
        renderer.dispose();
        assert.equal(calls.filter(function disposedMesh(call) { return call.startsWith('dispose-'); }).length, 34);
        const disposedMaterials = calls.filter(function disposedMaterial(call) {
            return call.startsWith('material-dispose-');
        });
        assert.equal(disposedMaterials.length, 2);
    } finally {
        delete globalThis.BABYLON;
    }
});
