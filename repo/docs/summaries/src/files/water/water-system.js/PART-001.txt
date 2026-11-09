
export class WaterSystem {
    constructor(scene, terrain, seaLevel = -100, options = {}) {
        this.scene = scene;
        this.terrain = terrain;
        this.seaLevel = seaLevel;

        this.chunkSize = options.chunkSize ?? 2000;
        this.renderRadius = options.renderRadius ?? 3;

        this.evaporationRate = 0.12;

        this.tiles = new Map();
        this.disposed = false;

        this.material = this.createWaterMaterial();

        console.log("[Water] Regional water system initialized.");
    }

    createWaterMaterial() {
        const material = new BABYLON.StandardMaterial(
            "regionalOceanMaterial",
            this.scene
        );

        material.diffuseColor =
            new BABYLON.Color3(0.025, 0.19, 0.30);

        material.specularColor =
            new BABYLON.Color3(0.35, 0.45, 0.55);

        material.specularPower = 64;

        material.emissiveColor =
            new BABYLON.Color3(0.005, 0.025, 0.04);

        material.backFaceCulling = false;

        return material;
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    createOceanTile(chunkX, chunkZ) {
        const minX = Math.max(
            chunkX * this.chunkSize,
            this.terrain.min.x
        );

        const maxX = Math.min(
            (chunkX + 1) * this.chunkSize,
            this.terrain.max.x
        );

        const minZ = Math.max(
            chunkZ * this.chunkSize,
            this.terrain.min.z
        );

        const maxZ = Math.min(
            (chunkZ + 1) * this.chunkSize,
            this.terrain.max.z
        );

        const width = maxX - minX;
        const depth = maxZ - minZ;

        if (width <= 0 || depth <= 0) return null;

        const mesh = BABYLON.MeshBuilder.CreateGround(
            `ocean_${chunkX}_${chunkZ}`,
            {
                width,
                height: depth,
                subdivisions: 1
            },
            this.scene
        );

        mesh.position.set(
            (minX + maxX) * 0.5,
            this.seaLevel,
            (minZ + maxZ) * 0.5
        );

        mesh.material = this.material;
        mesh.isPickable = false;
        mesh.receiveShadows = false;

        mesh.metadata = {
            waterType: "ocean",
            chunkX,
            chunkZ
        };

        this.tiles.set(
            this.getChunkKey(chunkX, chunkZ),
            mesh
        );

        return mesh;
    }

    removeTile(key) {
        const mesh = this.tiles.get(key);

        if (!mesh) return;

        mesh.dispose();
        this.tiles.delete(key);
    }

    update(cameraPosition, renderRadius = this.renderRadius) {
        if (this.disposed || !cameraPosition) return;

        const centerX = Math.floor(
            cameraPosition.x / this.chunkSize
        );

        const centerZ = Math.floor(
            cameraPosition.z / this.chunkSize
        );

        const desired = new Set();

        for (
            let x = centerX - renderRadius;
            x <= centerX + renderRadius;
            x++
        ) {
            for (
                let z = centerZ - renderRadius;
                z <= centerZ + renderRadius;
                z++
            ) {
                const minX = x * this.chunkSize;
                const minZ = z * this.chunkSize;

                const maxX = minX + this.chunkSize;
                const maxZ = minZ + this.chunkSize;

                // Ignore chunks outside the terrain.
                if (
                    maxX <= this.terrain.min.x ||
                    minX >= this.terrain.max.x ||
                    maxZ <= this.terrain.min.z ||
                    minZ >= this.terrain.max.z
                ) {
                    continue;
                }

                const key = this.getChunkKey(x, z);

                desired.add(key);

                if (!this.tiles.has(key)) {
                    this.createOceanTile(x, z);
                }
            }
        }

        // Remove distant water meshes.
        for (const key of this.tiles.keys()) {
            if (!desired.has(key)) {
                this.removeTile(key);
            }
        }
    }

    isUnderwater(position) {
        if (!position) return false;

        return position.y < this.seaLevel;
    }

    getTerrainWaterDepth(position) {
        if (!position) return 0;

        return Math.max(
            0,
            this.seaLevel - position.y
        );
    }

    getEvaporationPotential(position) {
        const terrainPosition = this.terrain.sampleAt(
            position.x,
            position.z
        );

        if (!terrainPosition) return 0.2;

        const distanceToSeaLevel = Math.abs(
            terrainPosition.y - this.seaLevel
        );

        const coastalInfluence =
            1 - BABYLON.Scalar.Clamp(
                distanceToSeaLevel / 300,
                0,
                1
            );

        const oceanInfluence =
            terrainPosition.y < this.seaLevel
                ? 1
                : coastalInfluence;

        return BABYLON.Scalar.Clamp(
            0.2 + oceanInfluence * 0.8,
            0.2,
            1
        );
    }

    getStats() {
        return {
            activeOceanTiles: this.tiles.size,
            chunkSize: this.chunkSize,
            seaLevel: this.seaLevel,
            renderRadius: this.renderRadius
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        for (const key of Array.from(this.tiles.keys())) {
            this.removeTile(key);
        }

        this.material.dispose();
    }
}

