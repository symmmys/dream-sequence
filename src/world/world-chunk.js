import { getTerrainVertexColor } from "./terrain-color.js";

export class WorldChunk {
    constructor(x, z, size, terrain, scene) {
        this.x = x;
        this.z = z;
        this.size = size;
        this.terrain = terrain;
        this.scene = scene;

        this.mesh = null;
        this.lod = -1;
        this.loaded = false;
        this.disposed = false;
        this.revision = 0;

        this.neighbors = {
            north: null,
            south: null,
            east: null,
            west: null
        };
    }

    get originX() {
        return this.x * this.size;
    }

    get originZ() {
        return this.z * this.size;
    }

    getResolution(lod) {
        const resolutions = [32, 16, 8, 4];
        const index = BABYLON.Scalar.Clamp(lod, 0, 3);
        return resolutions[index];
    }

    setNeighbors(neighbors) {
        this.neighbors = neighbors;
    }

    validateMeshData(data) {
        if (!data || !data.positions || !data.normals || !data.colors || !data.indices) {
            throw new Error("Terrain mesh data is incomplete.");
        }

        const vertexCount = data.positions.length / 3;

        if (
            !Number.isInteger(vertexCount) ||
            data.normals.length !== vertexCount * 3 ||
            data.colors.length !== vertexCount * 4
        ) {
            throw new Error("Terrain mesh vertex buffers have inconsistent lengths.");
        }

        for (let index = 0; index < data.colors.length; index++) {
            if (!Number.isFinite(data.colors[index])) {
                throw new Error(
                    `Terrain mesh contains a non-finite vertex color at ${index}.`
                );
            }
        }
    }

    applyMeshData(data, lod, material) {
        if (this.disposed) return;

        this.validateMeshData(data);

        const vertexData = new BABYLON.VertexData();
        vertexData.positions = Array.from(data.positions);
        vertexData.normals = Array.from(data.normals);
        vertexData.colors = Array.from(data.colors);
        vertexData.indices = Array.from(data.indices);

        this.disposeMesh();
        this.mesh = new BABYLON.Mesh(
            `terrain_chunk_${this.x}_${this.z}`,
            this.scene
        );

        vertexData.applyToMesh(this.mesh, true);
        this.configureMeshMaterial(material);
        this.configureMeshPicking(lod);
        this.applySpatialTransform();

        this.lod = lod;
        this.loaded = true;
    }

    disposeMesh() {
        if (!this.mesh) return;

        this.mesh.dispose();
        this.mesh = null;
    }

    configureMeshMaterial(material) {
        this.mesh.material = material;
        material.useVertexColors = true;
        material.diffuseColor.set(1, 1, 1);
        this.mesh.useVertexColors = true;
        this.mesh.hasVertexAlpha = false;
    }

    configureMeshPicking(lod) {
        this.mesh.isPickable = true;
        this.mesh.metadata = {
            chunkX: this.x,
            chunkZ: this.z,
            lod,
            terrainChunk: true
        };

        if (!this.mesh.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind)) {
            throw new Error(
                `[WorldChunk] Terrain vertex colors missing for ${this.mesh.name}.`
            );
        }
    }

    applySpatialTransform() {
        this.scene.metadata?.geometryRenderer?.applyMesh(this.mesh);
    }

    generateMesh(lod, material) {
        if (this.disposed) return;

        const resolution = this.getResolution(lod);
        const buffers = this.createMeshBuffers(resolution);

        for (let z = 0; z <= resolution; z++) {
            for (let x = 0; x <= resolution; x++) {
                this.writeVertex(x, z, resolution, buffers);
            }
        }

        this.writeIndices(resolution, buffers.indices);
        this.applyMeshData(buffers, lod, material);
    }

    createMeshBuffers(resolution) {
        const vertexCount = (resolution + 1) ** 2;
        const indexCount = resolution * resolution * 6;

        return {
            positions: new Float32Array(vertexCount * 3),
            normals: new Float32Array(vertexCount * 3),
            colors: new Float32Array(vertexCount * 4),
            indices: new Uint32Array(indexCount)
        };
    }

    getHeightAt(x, z) {
        const clampedX = BABYLON.Scalar.Clamp(
            x,
            this.terrain.min.x,
            this.terrain.max.x
        );
        const clampedZ = BABYLON.Scalar.Clamp(
            z,
            this.terrain.min.z,
            this.terrain.max.z
        );

        return this.terrain.sampleHeight(clampedX, clampedZ);
    }

    getTerrainColor(height, slope, worldX, worldZ) {
        return getTerrainVertexColor(
            height,
            slope,
            worldX,
            worldZ,
            this.terrain.minHeight,
            this.terrain.maxHeight
        );
    }

    writeVertex(x, z, resolution, buffers) {
        const sample = this.getVertexSample(x, z, resolution);
        const vertexIndex = z * (resolution + 1) + x;

        this.writeVertexPositionAndNormal(sample, vertexIndex, buffers);
        this.writeVertexColor(sample, vertexIndex, buffers);
    }

    getVertexSample(x, z, resolution) {
        const stride = this.size / resolution;
        const worldX = this.originX + x * stride;
        const worldZ = this.originZ + z * stride;
        const height = this.getHeightAt(worldX, worldZ);
        const slope = this.terrain.sampleSlopeAt(
            worldX,
            worldZ,
            Math.max(2, stride * 0.25)
        );
        const normal = slope?.normal ?? new BABYLON.Vector3(0, 1, 0);

        return {
            worldX,
            worldZ,
            height,
            slope: slope?.magnitude ?? 0,
            normal
        };
    }

    writeVertexPositionAndNormal(sample, vertexIndex, buffers) {
        const offset = vertexIndex * 3;

        buffers.positions[offset] = sample.worldX;
        buffers.positions[offset + 1] = sample.height;
        buffers.positions[offset + 2] = sample.worldZ;

        buffers.normals[offset] = sample.normal.x;
        buffers.normals[offset + 1] = sample.normal.y;
        buffers.normals[offset + 2] = sample.normal.z;
    }

    writeVertexColor(sample, vertexIndex, buffers) {
        const offset = vertexIndex * 4;
        const color = this.getTerrainColor(
            sample.height,
            sample.slope,
            sample.worldX,
            sample.worldZ
        );

        buffers.colors[offset] = color[0];
        buffers.colors[offset + 1] = color[1];
        buffers.colors[offset + 2] = color[2];
        buffers.colors[offset + 3] = 1;
    }

    writeIndices(resolution, indices) {
        let cursor = 0;

        for (let z = 0; z < resolution; z++) {
            for (let x = 0; x < resolution; x++) {
                const topLeft = z * (resolution + 1) + x;
                const topRight = topLeft + 1;
                const bottomLeft = topLeft + resolution + 1;
                const bottomRight = bottomLeft + 1;

                indices[cursor++] = topLeft;
                indices[cursor++] = bottomLeft;
                indices[cursor++] = topRight;
                indices[cursor++] = topRight;
                indices[cursor++] = bottomLeft;
                indices[cursor++] = bottomRight;
            }
        }
    }

    dispose() {
        this.revision++;
        this.disposeMesh();
        this.loaded = false;
        this.disposed = true;
    }
}
