import { Species } from "../core/species.js";
import { Genetics } from "../core/genetics.js";
import { TreeGenerator } from "./tree-generator.js";
let nextTreeId = 0;

class Tree {

	constructor(
    speciesName,
    position,
    genome = Genetics.createGenome(),
    parentId = null,
    initialAge = 0
) {

    this.id = nextTreeId++;

    this.speciesName = speciesName;

    this.species = Species[speciesName];

    this.position = position.clone();

    this.genome = genome;

    this.parentId = parentId;

    this.age = initialAge;

    this.seedTimer = 0;

this.soilSample = null;
this.soilSampleTimer = 0;
this.soilSuitability = 1.0;
    // Environmental conditions

    this.lightLevel = 1.0;

    this.lightStress = 0;

    this.lowLightYears = 0;

    this.growthMultiplier = 1.0;


    // Hydrological conditions

    this.soilMoisture = 0.35;

    this.moistureMultiplier = 1.0;

    this.droughtYears = 0;

    this.waterloggingYears = 0;


    this.children = [];

    this.alive = true;

}

	get thicknessFactor() {

    return BABYLON.Scalar.Clamp(
        this.age / (this.maturityAge * 2),
        0,
        1
    );
}

    get maturityAge() {

        return 10 / this.genome.growthRate;
    }


    get maximumAge() {

        return 100 * this.genome.lifespan;
    }


    get ageFactor() {

        return BABYLON.Scalar.Clamp(
            this.age / this.maturityAge,
            0,
            1
        );
    }


    get isMature() {

        return this.age >= this.maturityAge;
    }


    get isElder() {

        return this.age >= this.maximumAge * 0.85;
    }



update(deltaYears, environment, hydrology) {

    if (!this.alive) {
        return;
    }


    // --------------------------------
    // LIGHT CONDITIONS
    // --------------------------------

    const light = environment.sampleLight(
        this.position
    );

    this.lightLevel = light.intensity;


    const minimumLight =
        this.species.lightSensitivity * 0.20;


    this.growthMultiplier =
        BABYLON.Scalar.Clamp(

            0.25 + this.lightLevel * 0.75,

            0.25,

            1.0

        );


    if (this.lightLevel < minimumLight) {

        this.lowLightYears += deltaYears;

    } else {

        this.lowLightYears = Math.max(

            0,

            this.lowLightYears - deltaYears * 0.5

        );

    }


    if (this.lowLightYears >= 15) {

        this.alive = false;

        return;

    }


    // --------------------------------
    // SOIL MOISTURE
    // --------------------------------

	this.soilSampleTimer -= deltaYears;

if (
    hydrology &&
    this.soilSampleTimer <= 0
) {
    this.soilSample = hydrology.sampleSoil(
        this.position
    );

    this.soilSampleTimer = 5.0;
}

	const optimalMoisture = this.species.optimalMoisture;


	const droughtTolerance = this.species.droughtTolerance;


	const waterloggingTolerance = this.species.waterloggingTolerance;

if (hydrology && typeof hydrology.sampleSoil === "function") {
	const soil = this.soilSample;

    if (soil) {
        const affinity = this.species.soilAffinity;

        const textureScore = affinity.preferred.includes(
            soil.surfaceSoil
        ) ? 1.0 : affinity.tolerance;

        const fertilityScore = 1.0 - Math.abs(
            soil.fertility - affinity.fertility
        );

        const drainageScore = 1.0 - Math.abs(
            soil.drainage - affinity.drainage
        );

        const moistureScore = 1.0 - Math.abs(
            this.soilMoisture - affinity.moisture
        );

        this.soilSuitability = BABYLON.Scalar.Clamp(
            textureScore * 0.40 +
            fertilityScore * 0.20 +
            drainageScore * 0.20 +
            moistureScore * 0.20,
            0.15,
            1.0
        );
	    }
	}




    // Growth is best near the species'
    // preferred soil moisture level.

    this.moistureMultiplier =
        BABYLON.Scalar.Clamp(

            0.45 +
            0.55 * Math.min(
                1,
                this.soilMoisture /
                optimalMoisture
            ),

            0.45,

            1.0

        );


    // Drought stress

    if (
        this.soilMoisture <
        droughtTolerance
    ) {

        this.droughtYears += deltaYears;

    } else {

        this.droughtYears = Math.max(

            0,

            this.droughtYears - deltaYears * 0.5

        );

    }


    // Waterlogging stress

    if (
        this.soilMoisture >
        waterloggingTolerance
    ) {

        this.waterloggingYears += deltaYears;

    } else {

        this.waterloggingYears = Math.max(

            0,

            this.waterloggingYears - deltaYears * 0.5

        );

    }


    // Prolonged environmental stress.

    if (
        this.droughtYears >= 20 ||
        this.waterloggingYears >= 15
    ) {

        this.alive = false;

        return;

    }


    // --------------------------------
    // COMBINED GROWTH
    // --------------------------------

const combinedGrowth =
    this.growthMultiplier *
    this.moistureMultiplier *
    this.soilSuitability;

    this.age += deltaYears * combinedGrowth;


    if (this.age >= this.maximumAge) {

        this.alive = false;

    }


    this.seedTimer += deltaYears;

}


    generateGeometry(environment) {

        const generator = new TreeGenerator(
            this.species,
            environment,
            this.genome
        );

        return generator.generate(
            this.position,
            this.ageFactor
        );
    }

	
produceSeeds() {

    if (!this.alive || !this.isMature || this.isElder) {
        return 0;
    }

    // One reproductive opportunity every five years
    const seedInterval = 5;

    if (this.seedTimer < seedInterval) {
        return 0;
    }

    this.seedTimer -= seedInterval;

    // Genetic influence on reproduction
    const seedProduction = this.genome.seedProduction;

    // Number of seeds produced in this event
    return Math.max(
        1,
        Math.round(2 * seedProduction)
    );
}


}
export { Tree }
