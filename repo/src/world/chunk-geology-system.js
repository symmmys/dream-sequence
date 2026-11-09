
import { GeologicalField } from "../geology/geological-field.js";
import { RockSpecies } from "../geology/rock-species.js";
import { RockGenerator } from "../geology/rock-generator.js";
import { CreateSeededRandom } from "../core/random.js";
import { ThinInstanceRenderer } from "../rendering/thin-instance-renderer.js";

export class ChunkGeologySystem {
    constructor(scene, terrain, options = {}) {
        this.scene = scene;
        this.terrain = terrain;

        this.chunkSize = options.chunkSize ?? 2000;
        this.renderRadius = options.renderRadius ?? 3;
        this.rocksPerChunk = options.rocksPerChunk ?? 10;
        this.seaLevel = options.seaLevel ?? -100;
        this.worldSeed = options.worldSeed ?? 91827;

        this.field = new GeologicalField(
            terrain,
            this.worldSeed
        );

        // Persistent geological records.
        this.records = new Map();

        // Currently rendered chunks.
        this.activeChunks = new Set();

        this.renderers = {};
        this.disposed = false;
        this.renderDirty = true;

        this.createRenderers();

        console.log(
            "[Geology] Chunk geology initialized."
        );
    }

    createRenderers() {
        for (const speciesName of Object.keys(RockSpecies)) {
            const config = RockSpecies[speciesName];

            // Surface materials are handled separately.
            if (
                speciesName === "sand" ||
                speciesName === "clay" ||
                speciesName === "fertileSoil"
            ) {
                continue;
            }

		const mesh = BABYLON.MeshBuilder.CreateBox(
    "chunkRock_" + speciesName,
    {
        size: 1,
        faceUV: [
            new BABYLON.Vector4(0, 0, 1, 1),
            new BABYLON.Vector4(0, 0, 1, 1),
            new BABYLON.Vector4(0, 0, 1, 1),
            new BABYLON.Vector4(0, 0, 1, 1),
            new BABYLON.Vector4(0, 0, 1, 1),
            new BABYLON.Vector4(0, 0, 1, 1)
        ]
    },
    this.scene
);

            const material = new BABYLON.StandardMaterial(
                "chunkRockMaterial_" + speciesName,
                this.scene
            );

            material.diffuseColor = config.color.clone();

            material.specularColor =
                new BABYLON.Color3(0.06, 0.06, 0.06);

            if (speciesName === "anomaly") {
                material.emissiveColor =
                    config.color.scale(0.35);
            }

            mesh.material = material;

            this.renderers[speciesName] =
                new ThinInstanceRenderer(
                    this.scene,
                    "chunkRock_" + speciesName,
                    mesh,
                    null
                );
        }
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    getChunkSeed(chunkX, chunkZ) {
        return (
            this.worldSeed ^
            Math.imul(chunkX, 73856093) ^
            Math.imul(chunkZ, 19349663)
        ) >>> 0;
    }

    generateChunk(chunkX, chunkZ) {
        const key = this.getChunkKey(chunkX, chunkZ);

        if (this.records.has(key)) {
            return this.records.get(key);
        }

        const seed = this.getChunkSeed(
            chunkX,
            chunkZ
        );

        const random = CreateSeededRandom(seed);

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

        const formations = [];

        if (minX >= maxX || minZ >= maxZ) {
            const emptyRecord = {
                key,
                chunkX,
                chunkZ,
                seed,
                formations
            };

            this.records.set(key, emptyRecord);
            return emptyRecord;
        }

        const attemptsLimit = this.rocksPerChunk * 12;

        let attempts = 0;

        while (
            formations.length < this.rocksPerChunk &&
            attempts < attemptsLimit
        ) {
            attempts++;

            const x = minX + random() * (maxX - minX);
            const z = minZ + random() * (maxZ - minZ);

            const sample = this.field.sample(x, z);

            if (!sample) continue;

            if (sample.position.y <= this.seaLevel) {
                continue;
            }

		// Formations come from underlying bedrock,
// not the current surface-soil classification.
if (sample.exposure < 0.45) {
    continue;
}

const speciesName = sample.bedrockType;
const config = RockSpecies[speciesName];

            // Only generate actual geological formations.
            if (!config) continue;

            if (
                speciesName === "sand" ||
                speciesName === "clay" ||
                speciesName === "fertileSoil"
            ) {
                continue;
            }

            const variation = 0.85 + random() * 0.65;

            const formationSeed = (
                seed ^
                Math.imul(formations.length + 1, 2654435761)
            ) >>> 0;

            formations.push({
                id: `${key}:${formations.length}`,
                speciesName,
                position: sample.position.clone(),
                scale: config.scale * variation * 2.0,
                seed: formationSeed,
                age: 0,
                integrity: 1,
                erosionProgress: 0,
                alive: true
            });
        }

        const record = {
            key,
            chunkX,
            chunkZ,
            seed,
            formations
        };

        this.records.set(key, record);

        console.log(
            `[Geology] Generated ${formations.length} formations in ${key}`
        );

        return record;
    }

    update(cameraPosition) {
        if (this.disposed) return;

        const centerX = Math.floor(
            cameraPosition.x / this.chunkSize
        );

        const centerZ = Math.floor(
            cameraPosition.z / this.chunkSize
        );

        const desiredChunks = new Set();

        for (
            let x = centerX - this.renderRadius;
            x <= centerX + this.renderRadius;
            x++
        ) {
            for (
                let z = centerZ - this.renderRadius;
                z <= centerZ + this.renderRadius;
                z++
            ) {
                const minX = x * this.chunkSize;
                const minZ = z * this.chunkSize;

                const maxX = minX + this.chunkSize;
                const maxZ = minZ + this.chunkSize;

                if (
                    maxX <= this.terrain.min.x ||
                    minX >= this.terrain.max.x ||
                    maxZ <= this.terrain.min.z ||
                    minZ >= this.terrain.max.z
                ) {
                    continue;
                }

                const key = this.getChunkKey(x, z);

                desiredChunks.add(key);

                // Generate once, preserve thereafter.
                this.generateChunk(x, z);
            }
        }

        let changed = false;

        for (const key of this.activeChunks) {
            if (!desiredChunks.has(key)) {
                this.activeChunks.delete(key);
                changed = true;
            }
        }

        for (const key of desiredChunks) {
            if (!this.activeChunks.has(key)) {
                this.activeChunks.add(key);
                changed = true;
            }
        }

        if (changed || this.renderDirty) {
            this.rebuildRendering();
        }
    }

    rebuildRendering() {
        if (this.disposed) return;

        for (const renderer of Object.values(this.renderers)) {
            renderer.clear();
        }

        let visibleFormationCount = 0;

        for (const key of this.activeChunks) {
            const record = this.records.get(key);

            if (!record) continue;

            for (const formation of record.formations) {
                if (!formation.alive) continue;

                const config =
                    RockSpecies[formation.speciesName];

                const renderer =
                    this.renderers[formation.speciesName];

                if (!config || !renderer) continue;

                const generator = new RockGenerator(
                    config,
                    formation.seed
                );

                // Conservative initial detail level.
                // Higher recursive detail can be introduced
                // after performance validation.
                const depth = Math.min(
                    1,
                    config.recursionDepth
                );

                const matrices = generator.generate(
                    formation.position,
                    formation.scale,
                    depth
                );

                renderer.addMatrices(matrices);

                visibleFormationCount++;
            }
        }

        for (const renderer of Object.values(this.renderers)) {
            renderer.update();
        }

        this.visibleFormationCount =
            visibleFormationCount;

        this.renderDirty = false;
    }

    getStats() {
        let totalFormations = 0;

        for (const record of this.records.values()) {
            totalFormations += record.formations.filter(
                formation => formation.alive
            ).length;
        }

        return {
            generatedChunks: this.records.size,
            activeChunks: this.activeChunks.size,
            totalFormations,
            visibleFormations: this.visibleFormationCount ?? 0
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        for (const renderer of Object.values(this.renderers)) {
            renderer.mesh.dispose();
        }

        this.renderers = {};
        this.activeChunks.clear();
        this.records.clear();
    }
}

