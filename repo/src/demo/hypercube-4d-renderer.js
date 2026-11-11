/** Renders the actual 3D cross-section of a rotating 4D tesseract. */

import {
    createHypercubeEdges, createHypercubeSlice, createHypercubeVertices
} from '../world/fields/geometry/hypercube-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const MAX_SECTION_VERTICES = 32;
const MAX_SECTION_EDGES = 64;

class Hypercube4DRenderer {
    constructor(scene, transform, options = {}) {
        if (!scene || !transform?.worldToRender) {
            throw new TypeError('Hypercube renderer requires a scene and spatial transform.');
        }
        this.scene = scene;
        this.transform = transform;
        this.center = { ...(options.center ?? { x: 0, y: 4, z: 0 }) };
        this.angularSpeeds = { xw: 0.68, yw: 0.49, zw: 0.33, ...options.angularSpeeds };
        this.angles = { xw: 0.42, yw: 0.36, zw: 0.32, ...options.initialAngles };
        this.angularSpeed = this.angularSpeeds.xw;
        this.edgeRadius = options.edgeRadius ?? 0.095;
        this.radialSegments = options.radialSegments ?? 7;
        this.vertexDiameter = options.vertexDiameter ?? 0.13;
        this.layerMask = options.layerMask ?? 0x0FFFFFFF;
        this.opticalScene = options.opticalScene ?? null;
        this.opticalSliceId = options.sliceId ?? null;
        this.opticalChunkAddress = options.chunkAddress ?? null;
        this.opticalRevision = 0;
        this.opticalRegistrationId = this.opticalSliceId ? `hypercube-surface:${this.opticalSliceId}` : null;
        this.viewerW = options.viewerW ?? 0;
        this.halfExtent = options.halfExtent ?? 4.2;
        this.objectDimensions = { x: this.halfExtent * 2, y: this.halfExtent * 2, z: this.halfExtent * 2 };
        this.objectRotation = { x: 0, y: 0, z: 0 };
        this.objectRotationMatrix = BABYLON.Matrix.Identity();
        this.objectVisible = true;
        this.disposed = false;
        this.vertices = createHypercubeVertices(options.halfExtent ?? 4.2);
        this.edges = createHypercubeEdges(this.vertices);
        this.surfaceMaterial = this.createMaterial('geometryDemoTesseractSliceSurface', 0.2, 0.16);
        this.edgeMaterial = this.createMaterial('geometryDemoTesseractSliceEdges', 1, 1);
        this.surfaceMesh = this.createSurfaceMesh();
        this.edgeMesh = this.createEdgeMesh();
        this.mesh = this.edgeMesh;
        this.vertexMeshes = this.createVertexMeshes();
        this.meshes = [this.surfaceMesh, this.edgeMesh, ...this.vertexMeshes];
        this.slice = createHypercubeSlice(this.vertices, this.angles, this.viewerW);
        this.update(0, this.viewerW);
    }

    createMaterial(name, alpha, emissive) {
        const material = new BABYLON.StandardMaterial(name, this.scene);
        material.emissiveColor = new BABYLON.Color3(0.28 * emissive, 0.88 * emissive, emissive);
        material.diffuseColor = new BABYLON.Color3(0.12, 0.56, 0.82);
        material.specularColor = BABYLON.Color3.White();
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.alpha = alpha;
        return material;
    }

    createSurfaceMesh() {
        const mesh = new BABYLON.Mesh('geometryDemoTesseractSliceSurface', this.scene);
        mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, new Float32Array(MAX_SECTION_VERTICES * 3), true, 3);
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, new Float32Array(MAX_SECTION_VERTICES * 3), true, 3);
        mesh.material = this.surfaceMaterial;
        this.configureMesh(mesh, { section: 'surface' });
        return mesh;
    }

    createEdgeMesh() {
        const mesh = new BABYLON.Mesh('geometryDemoTesseractSliceEdges', this.scene);
        mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind,
            new Float32Array(MAX_SECTION_EDGES * this.radialSegments * 6), true, 3);
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind,
            new Float32Array(MAX_SECTION_EDGES * this.radialSegments * 6), true, 3);
        mesh.material = this.edgeMaterial;
        this.configureMesh(mesh, { section: 'edges' });
        return mesh;
    }

    configureMesh(mesh, metadata) {
        mesh.layerMask = this.layerMask;
        mesh.isVisible = true;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.metadata = { geometryDemo: true, hypercube4D: true, sliceId: this.opticalSliceId, ...metadata };
    }

    createVertexMeshes() {
        return Array.from({ length: MAX_SECTION_VERTICES }, function createMarker(unused, index) {
            const mesh = BABYLON.MeshBuilder.CreateSphere(
                `geometryDemoTesseractSliceVertex${index}`,
                { diameter: this.vertexDiameter, segments: 8 },
                this.scene
            );
            mesh.material = this.edgeMaterial;
            mesh.layerMask = this.layerMask;
            mesh.isPickable = false;
            mesh.isVisible = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.metadata = { geometryDemo: true, hypercube4DSectionVertex: index, sliceId: this.opticalSliceId };
            return mesh;
        }, this);
    }

    toRenderPoint(point) {
        const local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(
            point.x * (this.objectDimensions.x / (2 * this.halfExtent)),
            point.y * (this.objectDimensions.y / (2 * this.halfExtent)),
            point.z * (this.objectDimensions.z / (2 * this.halfExtent))
        ), this.objectRotationMatrix);
        return this.transform.worldToRender({
            x: this.center.x + local.x,
            y: this.center.y + local.y,
            z: this.center.z + local.z
        });
    }

    setObjectDefinition(definition) {
        if (!definition || definition.type !== 'hypercube4d') return false;
        const parameters = definition.parameters ?? {};
        const halfExtent = parameters.halfExtent ?? Math.max(0.1, definition.dimensions?.x / 2 ?? 4.2);
        this.center = { ...definition.position };
        this.halfExtent = halfExtent;
        this.objectDimensions = { ...definition.dimensions };
        this.objectRotation = { x: definition.rotation?.x ?? 0, y: definition.rotation?.y ?? 0, z: definition.rotation?.z ?? 0 };
        const rotation = BABYLON.Quaternion.FromEulerAngles(this.objectRotation.x * Math.PI / 180, this.objectRotation.y * Math.PI / 180, this.objectRotation.z * Math.PI / 180);
        this.objectRotationMatrix = rotation.toRotationMatrix(BABYLON.Matrix.Identity());
        this.vertices = createHypercubeVertices(halfExtent);
        this.angles = { xw: 0.42, yw: 0.36, zw: 0.32, ...(parameters.initialAngles ?? {}) };
        this.angularSpeeds = { xw: 0.68, yw: 0.49, zw: 0.33, ...(parameters.angularSpeeds ?? {}) };
        this.objectVisible = definition.visible !== false;
        const objectColor = BABYLON.Color3.FromHexString(definition.material?.color ?? '#58d7f0');
        this.surfaceMaterial.diffuseColor = new BABYLON.Color3(objectColor.r, objectColor.g, objectColor.b);
        this.surfaceMaterial.emissiveColor = new BABYLON.Color3(objectColor.r * 0.2, objectColor.g * 0.2, objectColor.b * 0.2);
        this.edgeMaterial.diffuseColor = new BABYLON.Color3(objectColor.r, objectColor.g, objectColor.b);
        this.edgeMaterial.emissiveColor = new BABYLON.Color3(objectColor.r, objectColor.g, objectColor.b);
        this.slice = createHypercubeSlice(this.vertices, this.angles, this.viewerW);
        return true;
    }

    createSurfaceBuffers(section) {
        if (section.vertices.length > MAX_SECTION_VERTICES) {
            throw new RangeError('Tesseract section exceeds the renderer vertex capacity.');
        }
        const positions = new Float32Array(MAX_SECTION_VERTICES * 3);
        const normals = new Float32Array(MAX_SECTION_VERTICES * 3);
        const points = section.vertices.map(this.toRenderPoint.bind(this));
        for (let index = 0; index < points.length; index++) writeVector3(positions, index * 3, points[index]);
        const indices = [];
        for (const face of section.faces) {
            for (let index = 1; index < face.length - 1; index++) {
                const a = face[0];
                const b = face[index];
                const c = face[index + 1];
                indices.push(a, b, c);
                const normal = normalize3(cross3(subtract3(points[b], points[a]), subtract3(points[c], points[a])));
                for (const vertex of [a, b, c]) {
                    normals[vertex * 3] += normal.x;
                    normals[vertex * 3 + 1] += normal.y;
                    normals[vertex * 3 + 2] += normal.z;
                }
            }
        }
        for (let index = 0; index < section.vertices.length; index++) {
            const offset = index * 3;
            const normal = normalize3({ x: normals[offset], y: normals[offset + 1], z: normals[offset + 2] });
            writeVector3(normals, offset, normal);
        }
        return { positions, normals, indices, points };
    }

    createEdgeBuffers(section, points) {
        if (section.edges.length > MAX_SECTION_EDGES) {
            throw new RangeError('Tesseract section exceeds the renderer edge capacity.');
        }
        const vertexCount = MAX_SECTION_EDGES * this.radialSegments * 2;
        const positions = new Float32Array(vertexCount * 3);
        const normals = new Float32Array(vertexCount * 3);
        const indices = [];
        let offset = 0;
        for (const edge of section.edges) {
            const start = points[edge[0]];
            const end = points[edge[1]];
            offset = appendTube(start, end, this.edgeRadius, this.radialSegments, offset, positions, normals, indices);
        }
        return { positions, normals, indices };
    }

    update(deltaSeconds, viewerW = 0) {
        if (this.disposed) return;
        const delta = Math.max(0, Math.min(Number(deltaSeconds) || 0, 0.1));
        for (const plane of ['xw', 'yw', 'zw']) {
            this.angles[plane] = (this.angles[plane] + delta * this.angularSpeeds[plane]) % (Math.PI * 2);
        }
        this.angle = this.angles.xw;
        this.viewerW = Number.isFinite(viewerW) ? viewerW : 0;
        this.slice = createHypercubeSlice(this.vertices, this.angles, this.viewerW);
        const surface = this.createSurfaceBuffers(this.slice);
        const edges = this.createEdgeBuffers(this.slice, surface.points);
        this.updateMesh(this.surfaceMesh, surface);
        this.updateMesh(this.edgeMesh, edges);
        this.updateOpticalSurface(this.slice);
        const visible = this.slice.vertices.length > 0;
        this.surfaceMesh.isVisible = this.objectVisible && visible && this.slice.faces.length > 0;
        this.edgeMesh.isVisible = this.objectVisible && visible && this.slice.edges.length > 0;
        for (let index = 0; index < this.vertexMeshes.length; index++) {
            const marker = this.vertexMeshes[index];
            const point = surface.points[index];
            marker.isVisible = this.objectVisible && Boolean(point);
            if (point) marker.position.set(point.x, point.y, point.z);
        }
    }

    updateOpticalSurface(section) {
        if (!this.opticalScene || !this.opticalSliceId || !this.opticalRegistrationId) return;
        const positions = new Float64Array(section.vertices.length * 3);
        section.vertices.forEach((point, index) => {
            const offset = index * 3;
            const local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(
                point.x * (this.objectDimensions.x / (2 * this.halfExtent)),
                point.y * (this.objectDimensions.y / (2 * this.halfExtent)),
                point.z * (this.objectDimensions.z / (2 * this.halfExtent))
            ), this.objectRotationMatrix);
            positions[offset] = this.center.x + local.x;
            positions[offset + 1] = this.center.y + local.y;
            positions[offset + 2] = this.center.z + local.z;
        });
        const indices = [];
        for (const face of section.faces) {
            for (let index = 1; index < face.length - 1; index++) {
                indices.push(face[0], face[index], face[index + 1]);
            }
        }
        if (indices.length === 0) {
            this.opticalScene.unregister(this.opticalRegistrationId);
            return;
        }
        this.opticalRevision++;
        this.opticalScene.registerTriangleMesh({
            id: this.opticalRegistrationId,
            sliceId: this.opticalSliceId,
            chunkAddress: this.opticalChunkAddress,
            positions,
            indices,
            material: { id: 'material:hypercube-cross-section', refractiveIndex: 1, transmission: 1 },
            revision: this.opticalRevision
        });
    }

    updateMesh(mesh, buffers) {
        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, buffers.positions, false, false);
        mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, buffers.normals, false, false);
        mesh.setIndices(buffers.indices);
        mesh.refreshBoundingInfo();
    }

    getInfo() {
        return {
            vertices: this.vertices.length,
            edges: this.edges.length,
            rotationPlane: 'xw+yw+zw',
            rotationAngles: { ...this.angles },
            angle: this.angle,
            viewerW: this.viewerW,
            sliceVertexCount: this.slice.vertices.length,
            sliceFaceCount: this.slice.faces.length,
            sliceEdgeCount: this.slice.edges.length,
            visibleMeshCount: Number(this.surfaceMesh.isVisible) + Number(this.edgeMesh.isVisible) +
                this.vertexMeshes.filter(function visibleMarker(marker) { return marker.isVisible; }).length,
            mesh: this.edgeMesh
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.opticalRegistrationId) this.opticalScene?.unregister(this.opticalRegistrationId);
        for (const mesh of this.meshes) mesh.dispose(false, false);
        this.surfaceMaterial.dispose(false, true);
        this.edgeMaterial.dispose(false, true);
    }
}

function appendTube(start, end, radius, radialSegments, offset, positions, normals, indices) {
    const direction = normalize3(subtract3(end, start));
    const reference = Math.abs(direction.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const first = normalize3(cross3(direction, reference));
    const second = cross3(direction, first);
    const base = offset / 3;
    for (const point of [start, end]) {
        for (let index = 0; index < radialSegments; index++) {
            const angle = index / radialSegments * Math.PI * 2;
            const normal = add3(scale3(first, Math.cos(angle)), scale3(second, Math.sin(angle)));
            const target = offset;
            positions[target] = point.x + normal.x * radius;
            positions[target + 1] = point.y + normal.y * radius;
            positions[target + 2] = point.z + normal.z * radius;
            normals[target] = normal.x;
            normals[target + 1] = normal.y;
            normals[target + 2] = normal.z;
            offset += 3;
        }
    }
    for (let index = 0; index < radialSegments; index++) {
        const next = (index + 1) % radialSegments;
        const a = base + index;
        const b = base + radialSegments + index;
        const c = base + next;
        const d = base + radialSegments + next;
        indices.push(a, c, b, c, d, b);
    }
    return offset;
}

function writeVector3(target, offset, value) {
    target[offset] = value.x;
    target[offset + 1] = value.y;
    target[offset + 2] = value.z;
}
function subtract3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale3(value, amount) { return { x: value.x * amount, y: value.y * amount, z: value.z * amount }; }
function cross3(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function length3(value) { return Math.hypot(value.x, value.y, value.z); }
function normalize3(value) {
    const length = length3(value);
    return length > 1e-9 ? scale3(value, 1 / length) : { x: 0, y: 1, z: 0 };
}

export { Hypercube4DRenderer };
