import { GeologicalField } from "./geological-field.js";
import { SurfaceDepositSystem } from "./surface-deposit-system.js";
import { RockSpecies } from "./rock-species.js";
import { ThinInstanceRenderer } from "../rendering/thin-instance-renderer.js";
import { CreateSeededRandom } from "../core/random.js";
import { RockGenerator } from "../geology/rock-generator.js";

let nextFormationId = 0;

class GeologicalManager {

    constructor(scene, terrain, shadowGenerator) {

        this.scene = scene;

        this.terrain = terrain;

        this.shadowGenerator = shadowGenerator;

        this.regionSize = 250;

        this.seed = 91827;

        this.field = new GeologicalField(
            terrain,
            this.seed
        );

	this.surfaceDeposits =
    new SurfaceDepositSystem(
        scene,
        terrain,
        this.field
    );

        this.regions = new Map();

        this.formations = [];

        this.maxFormations = 15000;

        this.minFragmentScale = 0.35;

        this.maxFragmentDepth = 2;

        this.renderDirty = true;

        this.simulationSteps = 0;

        this.renderEverySteps = 5;

        this.renderers = {};


        // One independent rendering batch per material.
        for (const speciesName in RockSpecies) {

            const config = RockSpecies[speciesName];

            const mesh = BABYLON.MeshBuilder.CreateSphere(
                "geology_" + speciesName,
                {
                    diameter: 1,
                    segments: 2
                },
                scene
            );

            const material = new BABYLON.StandardMaterial(
                "geologyMaterial_" + speciesName,
                scene
            );

            material.diffuseColor =
                config.color.clone();

            material.specularColor =
                new BABYLON.Color3(
                    0.06,
                    0.06,
                    0.06
                );

            if (speciesName === "anomaly") {

                material.emissiveColor =
                    config.color.scale(0.35);

            }

            mesh.material = material;

            this.renderers[speciesName] =
                new ThinInstanceRenderer(
                    scene,
                    "geology_" + speciesName,
                    mesh,
                    shadowGenerator
                );

        }

    }


    getRegionKey(x, z) {

        return `${x},${z}`;

    }


    createFormation(
        speciesName,
        position,
        scale,
        seed,
        fragmentDepth = 0
    ) {

        if (
            !position ||
            this.formations.length >= this.maxFormations
        ) {
            return null;
        }

        const formation = {

            id: nextFormationId++,

            speciesName,

            position: position.clone(),

            scale,

            age: 0,

            integrity: 1.0,

            erosionProgress: 0,

            erosionEvents: 0,

            fragmentDepth,

            seed: seed >>> 0,

            alive: true

        };

        this.formations.push(formation);

        return formation;

    }


    createRegion(regionX, regionZ) {

        const key = this.getRegionKey(
            regionX,
            regionZ
        );

        if (this.regions.has(key)) {

            return this.regions.get(key);

        }

        const seed = (
            Math.imul(regionX, 73856093) ^
            Math.imul(regionZ, 19349663) ^
            this.seed
        ) >>> 0;

        const centerX =
            (regionX + 0.5) * this.regionSize;

        const centerZ =
            (regionZ + 0.5) * this.regionSize;

        const centerSample =
            this.field.sample(centerX, centerZ);

        const region = {

            x: regionX,

            z: regionZ,

            seed,

            dominantSpecies:
                centerSample
                    ? centerSample.speciesName
                    : "granite",

            generated: false,

            formationIds: []

        };

        this.regions.set(key, region);

        return region;

    }


    generateRegion(regionX, regionZ) {

        const region = this.createRegion(
            regionX,
            regionZ
        );

        if (region.generated) return;

        const random =
            CreateSeededRandom(region.seed);

        const originX =
            regionX * this.regionSize;

        const originZ =
            regionZ * this.regionSize;


        const samplePosition = () => {

            const x = originX +
                random() * this.regionSize;

            const z = originZ +
                random() * this.regionSize;

            return this.field.sample(x, z);

        };


        const addFormation = (
            sample,
            scale,
            depth,
            salt
        ) => {

            if (!sample) return;
		// These materials have their own surface renderer.
    if (
        sample.speciesName === "sand" ||
        sample.speciesName === "clay" ||
        sample.speciesName === "fertileSoil"
    ) {
        return;
    }

            const speciesName =
                sample.speciesName;

            const config =
                RockSpecies[speciesName];

            // Small local variations.
            const variation =
                0.8 + random() * 0.4;

            const formation = this.createFormation(

                speciesName,

                sample.position,

                scale * variation,

                region.seed ^ salt,

                depth

            );

            if (formation) {

                region.formationIds.push(
                    formation.id
                );

            }

        };


        // PRIMARY GEOLOGICAL FORMATIONS
        // Large formations establish the region.

        const primaryCount = 7;

        for (let i = 0; i < primaryCount; i++) {

            const sample = samplePosition();

            if (!sample) continue;

            const config =
                RockSpecies[sample.speciesName];

            addFormation(

                sample,

                config.scale * 4.0,

                Math.min(2, config.recursionDepth),

                i + 1000

            );

        }


        // SECONDARY FORMATIONS
        // Medium-scale geological structures.

        const secondaryCount = 7;

        for (let i = 0; i < secondaryCount; i++) {

            const sample = samplePosition();

            if (!sample) continue;

            const config =
                RockSpecies[sample.speciesName];

            addFormation(

                sample,

                config.scale * 1.7,

                Math.min(2, config.recursionDepth),

                i + 2000

            );

        }


        // FINE GEOLOGICAL DETAIL

        const detailCount = 32;

        for (let i = 0; i < detailCount; i++) {

            const sample = samplePosition();

            if (!sample) continue;

            const config =
                RockSpecies[sample.speciesName];

            addFormation(

                sample,

                config.scale * (
                    0.35 + random() * 0.4
                ),

                Math.min(1, config.recursionDepth),

                i + 3000

            );

        }


        region.generated = true;

        this.renderDirty = true;

    }


    generateAll() {

        const minX = Math.floor(
            this.terrain.min.x / this.regionSize
        );

        const maxX = Math.floor(
            this.terrain.max.x / this.regionSize
        );

        const minZ = Math.floor(
            this.terrain.min.z / this.regionSize
        );

        const maxZ = Math.floor(
            this.terrain.max.z / this.regionSize
        );

        for (let x = minX; x <= maxX; x++) {

            for (let z = minZ; z <= maxZ; z++) {

                this.generateRegion(x, z);

            }

        }

	this.surfaceDeposits.generate();

this.rebuildRendering();


    }


    // ---------------------------------
    // GEOLOGICAL EROSION
    // ---------------------------------

    erodeFormation(formation, deltaYears) {

        if (!formation.alive) return false;

        const config =
            RockSpecies[formation.speciesName];

        formation.age += deltaYears;

        // Hardness and cohesion both resist erosion.
        const resistance =
            0.5 + config.hardness * 0.5;

        const cohesionResistance =
            0.5 + config.cohesion * 0.5;

        const erosion =
            config.erosionRate *
            deltaYears /
            (resistance * cohesionResistance);

        formation.erosionProgress += erosion;

        if (formation.erosionProgress < 1.0) {

            return false;

        }

        formation.erosionProgress -= 1.0;

        this.fragmentFormation(formation);

        return true;

    }


    fragmentFormation(parent) {

        const config =
            RockSpecies[parent.speciesName];

        parent.erosionEvents++;

        // Smaller parent after fracturing.
        parent.scale *= 0.72;

        parent.integrity = 1.0;

        const canFragment =

            parent.fragmentDepth <
                this.maxFragmentDepth &&

            parent.scale >
                this.minFragmentScale &&

            parent.erosionEvents <= 3 &&

            this.formations.length <
                this.maxFormations;


        if (!canFragment) {

            if (
                parent.erosionEvents >= 3 ||
                parent.scale <= this.minFragmentScale
            ) {

                parent.alive = false;

            }

            return;

        }


        const random = CreateSeededRandom(
            parent.seed ^
            Math.imul(parent.erosionEvents, 7919)
        );


        const fragmentCount = Math.max(

            2,

            Math.round(
                2 + config.fragmentation * 3
            )

        );


        for (
            let i = 0;
            i < fragmentCount;
            i++
        ) {

            const angle =
                random() * Math.PI * 2;

            const distance =
                parent.scale *
                (1.0 + random() * 2.0) *
                config.fragmentation;

            const x =
                parent.position.x +
                Math.cos(angle) * distance;

            const z =
                parent.position.z +
                Math.sin(angle) * distance;

            const position =
                this.terrain.sampleAt(x, z);

            if (!position) continue;


            const fragmentScale =
                parent.scale *
                (0.25 + random() * 0.18);


            const fragmentSeed =
                (
                    parent.seed ^
                    Math.imul(i + 1, 2654435761) ^
                    parent.erosionEvents
                ) >>> 0;


            this.createFormation(

                parent.speciesName,

                position,

                fragmentScale,

                fragmentSeed,

                parent.fragmentDepth + 1

            );

        }


        // Fine sediment is gradually incorporated
        // into the surrounding ground.
        if (
            parent.fragmentDepth >=
                this.maxFragmentDepth ||
            parent.scale < this.minFragmentScale * 2
        ) {

            parent.alive = false;

        }

    }


    advance(deltaYears) {

        let changed = false;

        // Only process formations that existed
        // at the beginning of this simulation step.
        const initialCount =
            this.formations.length;

        for (
            let i = 0;
            i < initialCount;
            i++
        ) {

            const formation =
                this.formations[i];

            if (!formation.alive) continue;

            if (
                this.erodeFormation(
                    formation,
                    deltaYears
                )
            ) {

                changed = true;

            }

        }


        if (changed) {

            this.renderDirty = true;

        }


        this.simulationSteps++;

        if (
            this.renderDirty ||
            this.simulationSteps >=
                this.renderEverySteps
        ) {

            this.rebuildRendering();

            this.simulationSteps = 0;

        }

    }


    // ---------------------------------
    // RENDERING
    // ---------------------------------

    rebuildRendering() {

        for (const speciesName in this.renderers) {

            this.renderers[speciesName].clear();

        }


        for (const formation of this.formations) {

            if (!formation.alive) continue;

            const config =
                RockSpecies[formation.speciesName];

            const generator =
                new RockGenerator(
                    config,
                    formation.seed
                );

            const matrices = generator.generate(

                formation.position,

                formation.scale,

                formation.fragmentDepth === 0
                    ? config.recursionDepth
                    : Math.max(
                        0,
                        config.recursionDepth -
                        formation.fragmentDepth
                    )

            );


            this.renderers[
                formation.speciesName
            ].addMatrices(matrices);

        }


        for (const speciesName in this.renderers) {

            this.renderers[speciesName].update();

        }

        this.renderDirty = false;

    }


    getLivingFormationCount() {

        return this.formations.reduce(

            (count, formation) =>

                count + (formation.alive ? 1 : 0),

            0

        );

    }

	getMaterialAt(position) {

    return this.field.sample(
        position.x,
        position.z
    );

}


getSoilQualityAt(position) {

    const sample = this.getMaterialAt(position);

    if (!sample) return 0.5;

    const quality = {

        fertileSoil: 1.0,

        clay: 0.55,

        limestone: 0.45,

        granite: 0.20,

        sand: 0.12,

        anomaly: 0.65

    };

    return quality[sample.speciesName] ?? 0.5;

}

}
export { GeologicalManager }
