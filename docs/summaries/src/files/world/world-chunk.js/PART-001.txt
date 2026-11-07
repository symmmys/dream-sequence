
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
        return [32, 16, 8, 4][
            BABYLON.Scalar.Clamp(lod, 0, 3)
        ];
    }

    setNeighbors(neighbors) {
        this.neighbors = neighbors;
    }

	
applyMeshData(data, lod, material) {
    if (this.disposed) return;

    const vertexData = new BABYLON.VertexData();

    vertexData.positions = Array.from(data.positions);
    vertexData.normals = Array.from(data.normals);
    vertexData.colors = Array.from(data.colors);
    vertexData.indices = Array.from(data.indices);

    if (this.mesh) {
        this.mesh.dispose();
    }

    this.mesh = new BABYLON.Mesh(
        `terrain_chunk_${this.x}_${this.z}`,
        this.scene
    );

    vertexData.applyToMesh(this.mesh, true);

    this.mesh.material = material;

    material.useVertexColors = true;
    material.diffuseColor.set(1, 1, 1);

    this.mesh.useVertexColors = true;
    this.mesh.hasVertexAlpha = false;

    if (
        !this.mesh.isVerticesDataPresent(
            BABYLON.VertexBuffer.ColorKind
        )
    ) {
        console.error(
            "[WorldChunk] Terrain vertex colors missing:",
            this.x,
            this.z
        );
    }

    // IMPORTANT:
    // Terrain must be pickable for architectural editing.

    this.mesh.isPickable = true;

    this.mesh.metadata = {
        chunkX: this.x,
        chunkZ: this.z,
        lod,

        // Explicit identifier for editor terrain picking.
        terrainChunk: true
    };

    // Apply existing spatial transformation.
    this.scene.metadata?.geometryRenderer?.applyMesh(
        this.mesh
    );

    this.lod = lod;
    this.loaded = true;

    console.log(
        "[WorldChunk] Terrain mesh ready for picking:",
        {
            name: this.mesh.name,
            pickable: this.mesh.isPickable,
            terrainChunk: this.mesh.metadata.terrainChunk,
            vertices: this.mesh.getTotalVertices()
        }
    );
}


    generateMesh(lod, material) {
        if (this.disposed) return;

        const resolution = this.getResolution(lod);
        const stride = this.size / resolution;

        const positions = [];
        const indices = [];
        const normals = [];
        const colors = [];

        const minX = this.terrain.min.x;
        const maxX = this.terrain.max.x;
        const minZ = this.terrain.min.z;
        const maxZ = this.terrain.max.z;

        const heightAt = (x, z) =>
            this.terrain.sampleHeight(
                BABYLON.Scalar.Clamp(x, minX, maxX),
                BABYLON.Scalar.Clamp(z, minZ, maxZ)
            );

        for (let z = 0; z <= resolution; z++) {
            for (let x = 0; x <= resolution; x++) {
                const wx = this.originX + x * stride;
                const wz = this.originZ + z * stride;

                const h = heightAt(wx, wz);

                positions.push(wx, h, wz);

                const slope = this.terrain.sampleSlopeAt(
                    wx, wz, Math.max(2, stride * 0.25)
                );

                const normal = slope?.normal ??
                    new BABYLON.Vector3(0, 1, 0);

                normals.push(
                    normal.x, normal.y, normal.z
                );

                const color = this.getTerrainColor(
                    h,
                    slope?.magnitude ?? 0
                );

                colors.push(
                    color.r, color.g, color.b, 1
                );
            }
        }

        for (let z = 0; z < resolution; z++) {
            for (let x = 0; x < resolution; x++) {
                const a = z * (resolution + 1) + x;
                const b = a + 1;
                const c = a + resolution + 1;
                const d = c + 1;

                indices.push(a, c, b, b, c, d);
            }
        }

        this.applyMeshData({
            positions,
            normals,
            colors,
            indices
        }, lod, material);
    }

    getTerrainColor(height, slope) {
        const elevation = BABYLON.Scalar.Clamp(
            (height - this.terrain.minHeight) /
            (this.terrain.maxHeight - this.terrain.minHeight),
            0, 1
        );

        const low = new BABYLON.Color3(0.24, 0.38, 0.19);
        const grass = new BABYLON.Color3(0.42, 0.48, 0.25);
        const mountain = new BABYLON.Color3(0.48, 0.45, 0.39);
        const snow = new BABYLON.Color3(0.82, 0.84, 0.82);

        let color;

        if (elevation < 0.35) {
            color = BABYLON.Color3.Lerp(
                low, grass, elevation / 0.35
            );
        } else if (elevation < 0.78) {
            color = BABYLON.Color3.Lerp(
                grass, mountain, (elevation - 0.35) / 0.43
            );
        } else {
            color = BABYLON.Color3.Lerp(
                mountain, snow, (elevation - 0.78) / 0.22
            );
        }

        return BABYLON.Color3.Lerp(
            color,
            new BABYLON.Color3(0.32, 0.30, 0.28),
            BABYLON.Scalar.Clamp(slope / 0.9, 0, 0.45)
        );
    }

    dispose() {
        this.revision++;

        if (this.mesh) {
            this.mesh.dispose();
            this.mesh = null;
        }

        this.loaded = false;
        this.disposed = true;
    }
}

