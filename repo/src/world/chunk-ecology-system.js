
import { ChunkPopulationManager } from "./chunk-population-manager.js";
import { CreateSeededRandom } from "../core/random.js";
import { Tree } from "../ecology/tree.js";
import { Genetics } from "../core/genetics.js";
import { Environment } from "../environment/environment.js";
import { Species } from "../core/species.js";

import {
    TreeRenderer,
    FoliageRenderer
} from "../rendering/tree-renderers.js";

export class ChunkEcologySystem {
    constructor(scene, terrain, options = {}) {
        this.scene = scene;
        this.terrain = terrain;


	this.renderAccumulator = 0;
	this.renderInterval = 0.75;
	
	this.hydrology = options.hydrology ?? null;
	this.geologicalField = options.geologicalField ?? null;

        this.chunkSize = options.chunkSize ?? 2000;
        this.renderRadius = options.renderRadius ?? 3;
        this.treesPerChunk = options.treesPerChunk ?? 24;
        this.seaLevel = options.seaLevel ?? -100;

        this.worldSeed = options.worldSeed ?? 91827;

        this.environment = new Environment(
            options.sunDirection ??
            new BABYLON.Vector3(-0.5, -1, -0.3)
        );

        this.activeRecords = new Set();

        this.trunkRenderers = {
            oak: new TreeRenderer(
                scene, "chunkOakTrunks", null
            ),
            pine: new TreeRenderer(
                scene, "chunkPineTrunks", null
            )
        };

        this.foliageRenderers = {
            oak: new FoliageRenderer(
                scene,
                "chunkOakFoliage",
                new BABYLON.Color3(0.18, 0.32, 0.13),
                null
            ),
            pine: new FoliageRenderer(
                scene,
                "chunkPineFoliage",
                new BABYLON.Color3(0.10, 0.27, 0.17),
                null
            )
        };

        this.trunkRenderers.oak.mesh.material =
            this.createTrunkMaterial(
                "chunkOakMaterial",
                new BABYLON.Color3(0.30, 0.16, 0.07)
            );

        this.trunkRenderers.pine.mesh.material =
            this.createTrunkMaterial(
                "chunkPineMaterial",
                new BABYLON.Color3(0.40, 0.27, 0.13)
            );

        this.populationManager =
            new ChunkPopulationManager({
                worldSeed: this.worldSeed,
                chunkSize: this.chunkSize,
                maxGenerationPerUpdate: 2,
                maxSimulationPerUpdate: 8,

                adapter: {
                    generate: context =>
                        this.generatePopulation(context),

activate: record => {
    this.activeRecords.add(record);
    this.renderDirty = true;
},

deactivate: record => {
    this.activeRecords.delete(record);
    this.renderDirty = true;
},

                    simulate: (record, deltaYears) =>
                        this.simulatePopulation(
                            record, deltaYears
                        ),

                    serialize: record =>
                        this.serializePopulation(record),

                    deserialize: data =>
                        this.deserializePopulation(data)
                }
            });

        this.renderDirty = true;
        this.disposed = false;
    }

    createTrunkMaterial(name, color) {
        const material = new BABYLON.StandardMaterial(
            name,
            this.scene
        );

        material.diffuseColor = color;
        material.specularColor =
            new BABYLON.Color3(0.03, 0.03, 0.03);

        return material;
    }

    generatePopulation(context) {
        const random = context.random;

        const trees = [];

        const minX = Math.max(
            context.bounds.minX,
            this.terrain.min.x
        );

        const maxX = Math.min(
            context.bounds.maxX,
            this.terrain.max.x
        );

        const minZ = Math.max(
            context.bounds.minZ,
            this.terrain.min.z
        );

        const maxZ = Math.min(
            context.bounds.maxZ,
            this.terrain.max.z
        );

        if (minX >= maxX || minZ >= maxZ) {
            return { trees };
        }

        const attemptsLimit = this.treesPerChunk * 12;

        let attempts = 0;

        while (
            trees.length < this.treesPerChunk &&
            attempts < attemptsLimit
        ) {
            attempts++;

            const x = minX + random() * (maxX - minX);
            const z = minZ + random() * (maxZ - minZ);

            const profile = this.terrain.sampleProfileAt(
                x, z, 4
            );

            if (!profile) continue;

            if (profile.position.y <= this.seaLevel) {
                continue;
            }

            if (profile.slopeDegrees > 28) {
                continue;
            }

	const soil = this.geologicalField
    ? this.geologicalField.sample(x, z)
    : null;

const speciesName = this.chooseSpeciesForSoil(
    soil,
    random
);

            const genome = Genetics.createGenome();

            // Reproducible genetic variation.
            for (const gene of Object.keys(genome)) {
                genome[gene] *= 0.85 + random() * 0.30;
            }

            const initialAge = random() * 20;

            const tree = new Tree(
                speciesName,
                profile.position,
                genome,
                null,
                initialAge
            );

            tree.soilMoisture =
                0.25 + random() * 0.40;

            trees.push(tree);
        }

        return {
            trees,
            seed: context.seed,
            generatedCount: trees.length
        };
    }

simulatePopulation(record, deltaYears) {
    for (const tree of record.population.trees) {
        if (!tree.alive) continue;

        tree.update(
            deltaYears,
            this.environment,
            this.hydrology
        );
    }

    this.renderDirty = true;
}

    serializePopulation(record) {
        return {
            trees: record.population.trees.map(tree => ({
                speciesName: tree.speciesName,
                position: {
                    x: tree.position.x,
                    y: tree.position.y,
                    z: tree.position.z
                },
                genome: { ...tree.genome },
                parentId: tree.parentId,
                age: tree.age,
                seedTimer: tree.seedTimer,
                soilMoisture: tree.soilMoisture,
                alive: tree.alive,
                droughtYears: tree.droughtYears,
                waterloggingYears: tree.waterloggingYears,
                lowLightYears: tree.lowLightYears
            }))
        };
    }

    deserializePopulation(data) {
        const trees = [];

        for (const item of data.trees ?? []) {
            const tree = new Tree(
                item.speciesName,
                new BABYLON.Vector3(
                    item.position.x,
                    item.position.y,
                    item.position.z
                ),
                { ...item.genome },
                item.parentId,
                item.age
            );

            tree.seedTimer = item.seedTimer ?? 0;
            tree.soilMoisture = item.soilMoisture ?? 0.35;
            tree.alive = item.alive ?? true;

            tree.droughtYears = item.droughtYears ?? 0;
            tree.waterloggingYears =
                item.waterloggingYears ?? 0;
            tree.lowLightYears = item.lowLightYears ?? 0;

            trees.push(tree);
        }

        return { trees };
    }

    rebuildRendering() {
        if (this.disposed) return;

        for (const renderer of Object.values(
            this.trunkRenderers
        )) {
            renderer.clear();
        }

        for (const renderer of Object.values(
            this.foliageRenderers
        )) {
            renderer.clear();
        }

        const allTrees = [];

        for (const record of this.activeRecords) {
            if (!record.active) continue;

            for (const tree of record.population.trees) {
                if (tree.alive) allTrees.push(tree);
            }
        }

        this.environment.rebuildCanopyGrid(allTrees);

        for (const tree of allTrees) {
            const species = tree.species;
            const age = tree.ageFactor;

            const growth =
                age * age * (3 - 2 * age);

            const height =
                species.trunkLength *
                growth *
                tree.genome.maxHeight;

            const radius =
                species.trunkRadius *
                Math.sqrt(Math.max(age, 0.001)) *
                tree.genome.trunkThickness;

            if (height <= 0.05) continue;

            const trunkMatrix = BABYLON.Matrix.Compose(
                new BABYLON.Vector3(
                    radius,
                    height,
                    radius
                ),
                BABYLON.Quaternion.Identity(),
                new BABYLON.Vector3(
                    tree.position.x,
                    tree.position.y + height * 0.5,
                    tree.position.z
                )
            );

            this.trunkRenderers[
                tree.speciesName
            ].addMatrix(trunkMatrix);

            const canopy = species.canopy;

            const canopyHeight = height * canopy.height;

            const canopyWidth =
                height *
                canopy.width *
                tree.genome.canopyWidth;

            const canopyCenter = new BABYLON.Vector3(
                tree.position.x,
                tree.position.y +
                    height * (
                        canopy.startHeight +
                        canopy.height * 0.5
                    ),
                tree.position.z
            );

            const foliageScale = Math.max(
                0.08,
                canopyWidth * 0.42
            );

            const foliageMatrix = BABYLON.Matrix.Compose(
                new BABYLON.Vector3(
                    foliageScale * 1.6,
                    Math.max(0.1, canopyHeight * 0.45),
                    foliageScale * 1.6
                ),
                BABYLON.Quaternion.Identity(),
                canopyCenter
            );

            this.foliageRenderers[
                tree.speciesName
            ].addMatrix(foliageMatrix);
        }

        for (const renderer of Object.values(
            this.trunkRenderers
        )) {
            renderer.update();
        }

        for (const renderer of Object.values(
            this.foliageRenderers
        )) {
            renderer.update();
        }

        this.renderDirty = false;
    }


update(cameraPosition, deltaSeconds = 0) {
    if (this.disposed) return;

    // Streaming and simulation continue normally.
    this.populationManager.updateVisibleChunks(
        cameraPosition,
        this.renderRadius
    );

    const deltaYears = deltaSeconds * 0.05;

    if (deltaYears > 0) {
        this.populationManager.updateSimulation(
            deltaYears
        );
    }

    // Batch expensive rendering work.
    this.renderAccumulator += Math.max(
        0,
        Math.min(deltaSeconds, 0.25)
    );

    if (
        this.renderDirty &&
        (
            this.renderAccumulator >= this.renderInterval
        )
    ) {
        this.rebuildRendering();
        this.renderAccumulator = 0;
    }
}


    getStats() {
        return {
            ...this.populationManager.getStats(),

            activeTrees: Array.from(
                this.activeRecords
            ).reduce(
                (total, record) =>
                    total + record.population.trees.filter(
                        tree => tree.alive
                    ).length,
                0
            )
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        this.populationManager.dispose();

        for (const renderer of Object.values(
            this.trunkRenderers
        )) {
            renderer.mesh.dispose();
        }

        for (const renderer of Object.values(
            this.foliageRenderers
        )) {
            renderer.mesh.dispose();
        }

        this.activeRecords.clear();
    }


chooseSpeciesForSoil(soil, random) {
    const fallback = random() < 0.55 ? "oak" : "pine";

    if (!soil) {
        return fallback;
    }

    const calculateScore = (speciesName) => {
        const species = Species[speciesName];

        // Some species definitions may not yet have
        // geological affinity data.
        if (!species || !species.soilAffinity) {
            return 0.5;
        }

        const affinity = species.soilAffinity;

        const preferred = Array.isArray(affinity.preferred)
            ? affinity.preferred
            : [];

        const texture = preferred.includes(soil.surfaceSoil)
            ? 1.0
            : (affinity.tolerance ?? 0.5);

        const fertility = 1 - Math.abs(
            (soil.fertility ?? 0.5) -
            (affinity.fertility ?? 0.5)
        );

        const drainage = 1 - Math.abs(
            (soil.drainage ?? 0.5) -
            (affinity.drainage ?? 0.5)
        );

        const moisture = 1 - Math.abs(
            (soil.moisture ?? 0.5) -
            (affinity.moisture ?? 0.5)
        );

        return (
            texture * 0.45 +
            fertility * 0.20 +
            drainage * 0.20 +
            moisture * 0.15
        );
    };

    const oakScore = calculateScore("oak");
    const pineScore = calculateScore("pine");

    const total = oakScore + pineScore;

    if (total <= 0) {
        return fallback;
    }

    return random() < oakScore / total
        ? "oak"
        : "pine";
}

}

