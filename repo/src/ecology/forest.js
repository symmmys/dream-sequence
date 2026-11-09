import { Environment } from "../environment/environment.js";
import { TerrainSampler } from "../environment/terrain.js";
import { SpatialGrid } from "../environment/spatial-grid.js";
import { GeologicalManager } from "../geology/geological-manager.js";
import { GeologicalField } from "../geology/geological-field.js";
import { TreeRenderer, FoliageRenderer } from "../rendering/tree-renderers.js";
import { RockRenderer } from "../rendering/rock-renderer.js";
import { Tree } from "./tree.js";
import { TreeGenerator } from "./tree-generator.js";
import { Genetics } from "../core/genetics.js";
import { CloudSpecies } from  "../atmosphere/cloud-species.js";
import { CloudGenerator } from "../atmosphere/cloud-generator.js";
import { WaterSystem } from "../water/water-system.js";
import { Hydrology } from "../water/hydrology.js";
import { RainSystem } from "../water/rain-system.js";
import { CloudSystem } from "../atmosphere/cloud-system.js";
import { WorldFieldSystem } from "../world/fields/world-field-system.js";

class Forest {


	constructor(
    scene,
    ground,
    sunDirection,
    shadowGenerator,
    seaLevel = -100
) {
        this.scene = scene;

	this.shadowGenerator = shadowGenerator;

        this.environment = new Environment(sunDirection);

        this.terrain = new TerrainSampler(scene, ground);

	this.lastRenderTime = 0;
	this.renderInterval = 5;
	this.simulationSteps = 0;
	this.renderEverySteps = 3;
	this.renderDirty = true;

        this.minSpacing = 2.5;
	this.spatialGrid = new SpatialGrid(this.minSpacing);
	
        this.trees = [];


	this.geology = new GeologicalManager( scene, this.terrain, shadowGenerator );
	// Initialize centralized environmental fields.

this.worldFields = new WorldFieldSystem({

    terrain: this.terrain,

    geologicalField: this.geology.field

});

        this.renderers = {

oak: new TreeRenderer(
    scene,
    "oakBranches",
    shadowGenerator
),

pine: new TreeRenderer(
    scene,
    "pineBranches",
    shadowGenerator
)
        };
	
this.rockRenderer = new RockRenderer(
    scene,
    shadowGenerator
);



	// Initialize the water system.

this.waterSystem = new WaterSystem(
    scene,
    this.terrain,
    -100
);


// Initialize soil hydrology.

this.hydrology = new Hydrology(
    this.terrain,
    this.waterSystem,
    20
);


// Initialize precipitation rendering.

this.rainSystem = new RainSystem(
    scene
);


// Initialize atmospheric simulation.

this.cloudSystem = new CloudSystem(
    scene,
    this.terrain,
    this.waterSystem,
    this.hydrology,
    this.rainSystem
);

	this.foliageRenderers = {
oak: new FoliageRenderer(
    scene,
    "oakLeaves",
    new BABYLON.Color3(0.18, 0.22, 0.12),
    shadowGenerator
),

pine: new FoliageRenderer(
    scene,
    "pineLeaves",
    new BABYLON.Color3(0.12, 0.32, 0.16),
    shadowGenerator
)

};

        const oakMaterial = new BABYLON.StandardMaterial(
            "oakMaterial",
            scene
        );

        oakMaterial.diffuseColor =
            new BABYLON.Color3(0.30, 0.16, 0.07);

        this.renderers.oak.mesh.material = oakMaterial;

        const pineMaterial = new BABYLON.StandardMaterial(
            "pineMaterial",
            scene
        );

        pineMaterial.diffuseColor =
            new BABYLON.Color3(0.40, 0.27, 0.13);

        this.renderers.pine.mesh.material = pineMaterial;
    }


isPositionAvailable(position) {

    return this.spatialGrid.isAvailable(
        position,
        this.minSpacing
    );

}

addTree(tree) {

    this.trees.push(tree);

    this.spatialGrid.insert(tree);

    return tree;

}

generate(numTrees = 80) {

    let attempts = 0;

    let livingCount = this.trees.reduce(
        (count, tree) => count + (tree.alive ? 1 : 0),
        0
    );

    while (
        livingCount < numTrees &&
        attempts < numTrees * 50
    ) {

        attempts++;

        const position = this.terrain.sample();

        if (!position) continue;
	
	if (this.waterSystem.isUnderwater(position)) {
		continue;
	}

        if (!this.isPositionAvailable(position)) {
            continue;
        }

        const speciesName =
            Math.random() < 0.55 ? "oak" : "pine";

        const tree = new Tree(
            speciesName,
            position,
            Genetics.createGenome(),
            null,
            Math.random() * 20
        );

        this.addTree(tree);

        livingCount++;
    }

// Generate geological formations.
this.geology.generateAll();

// Generate atmospheric objects.
this.generateWorldObjects(35);

// Render the forest.
this.renderAll();
    console.log("Initial forest:", livingCount);
}

    spawnOffspring(parent) {

        const numSeeds = parent.produceSeeds();

        let successful = 0;

        for (let i = 0; i < numSeeds; i++) {

// Check available light at the parent location
const parentLight =
    this.environment.sampleLight(parent.position);

// Establish a minimum germination requirement
const minimumGerminationLight = 0.30;

if (parentLight.intensity < minimumGerminationLight) {
    continue;
}

// Germination probability increases with available light
const germinationChance =
    0.65 *
    BABYLON.Scalar.Clamp(
        parentLight.intensity,
        0,
        1
    );

if (Math.random() > germinationChance) {
    continue;
}
// Only successful germination attempts
// need a terrain sample.
const position = this.terrain.sampleNear(
    parent.position,
    10
);

if (!position) continue;

if (this.waterSystem.isUnderwater(position)) {
    continue;
}


// Check actual germination location
const seedLight =
    this.environment.sampleLight(position);

if (seedLight.intensity < minimumGerminationLight) {
    continue;
}

            // Inherit and mutate the parent's genome
            const childGenome = Genetics.inherit(
                parent.genome,
                0.8
            );

            const child = new Tree(
                parent.speciesName,
                position,
                childGenome,
                parent.id,
                0
            );

            this.addTree(child);

            parent.children.push(child.id);

            successful++;
        }

        return successful;
    }


advance(deltaYears) {

	   // Advance water and atmospheric systems.

    this.waterSystem.update(deltaYears);

    this.hydrology.update(deltaYears);

    this.cloudSystem.update(deltaYears);


	// Advance geological processes.
	this.geology.advance(deltaYears);

    const initialTreeCount = this.trees.length;

    // Rebuild environmental canopy information
    this.environment.rebuildCanopyGrid(
        this.trees
    );

    for (
        let i = 0;
        i < initialTreeCount;
        i++
    ) {

        const tree = this.trees[i];

        if (!tree.alive) continue;

        const wasAlive = tree.alive;

tree.update(
    deltaYears,
    this.environment,
    this.hydrology
);
        if (!tree.alive && wasAlive) {

            this.renderDirty = true;

        }

        if (tree.alive && tree.isMature) {

            const offspring =
                this.spawnOffspring(tree);

            if (offspring > 0) {
                this.renderDirty = true;
            }

        }

    }

    this.simulationSteps++;

    if (
        this.renderDirty ||
        this.simulationSteps >= this.renderEverySteps
    ) {

        this.renderAll();

        this.renderDirty = false;

        this.simulationSteps = 0;

    }

}


updateRendering() {

    if (!this.renderDirty) return;

    this.renderAll();

    this.renderDirty = false;
}

renderAll() {

    this.renderers.oak.matrices = [];
    this.renderers.pine.matrices = [];

    this.foliageRenderers.oak.matrices = [];
    this.foliageRenderers.pine.matrices = [];

	
const camera = this.scene.activeCamera;

const cameraPosition = camera
    ? camera.globalPosition
    : BABYLON.Vector3.Zero();

const maxRenderDistance = 250;

const nearDistance = 80;
const mediumDistance = 180;

const maxRenderDistanceSquared =
    maxRenderDistance * maxRenderDistance;

const nearDistanceSquared =
    nearDistance * nearDistance;

const mediumDistanceSquared =
    mediumDistance * mediumDistance;

for (const tree of this.trees) {

    if (!tree.alive) continue;

    const dx =
        tree.position.x - cameraPosition.x;

    const dz =
        tree.position.z - cameraPosition.z;

    const distanceSquared =
        dx * dx + dz * dz;

    // Cull distant trees
    if (
        distanceSquared >
        maxRenderDistanceSquared
    ) {
        continue;
    }

    // Determine geometry detail
    let detailLevel;

    if (distanceSquared < nearDistanceSquared) {

        detailLevel = 2;

    } else if (
        distanceSquared < mediumDistanceSquared
    ) {

        detailLevel = 1;

    } else {

        detailLevel = 0;

    }

    const generator = new TreeGenerator(
        tree.species,
        this.environment,
        tree.genome
    );

    const branches = generator.generate(
        tree.position,
        tree.ageFactor,
        tree.thicknessFactor,
        detailLevel
    );

    this.renderers[tree.speciesName]
        .addMatrices(branches);

    const foliage = generator.foliage;

    const renderer =
        this.foliageRenderers[tree.speciesName];

    for (const cluster of foliage) {

        let scale = cluster.scale;

        if (tree.speciesName === "oak") {

            scale *= 1.5;

        } else {

            scale *= 1.15;

        }

        renderer.add(
            cluster.position,
            scale
        );

    }

}


    // Upload branch buffers
    this.renderers.oak.update();
    this.renderers.pine.update();

    // Upload foliage buffers
    this.foliageRenderers.oak.update();
    this.foliageRenderers.pine.update();


	// Update geological formations.
this.rockRenderer.update();
// Update atmospheric rendering.

this.cloudSystem.updateRendering();
}


generateWorldObjects(cloudCount = 35) {

    this.cloudSystem.generate(cloudCount);

}




}
export { Forest }
