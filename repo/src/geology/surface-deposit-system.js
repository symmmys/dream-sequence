import { SurfaceDepositRenderer } from "../rendering/surface-deposit-renderer.js"
import { CreateSeededRandom } from "../core/random.js";

class SurfaceDepositSystem {

    constructor(scene, terrain, geologicalField) {

        this.scene = scene;

        this.terrain = terrain;

        this.field = geologicalField;

        this.spacing = 28;

        this.seed = 48391;

        this.renderers = {

            sand: new SurfaceDepositRenderer(
                scene,
                "sand",
                new BABYLON.Color3(
                    0.76,
                    0.65,
                    0.43
                )
            ),

            clay: new SurfaceDepositRenderer(
                scene,
                "clay",
                new BABYLON.Color3(
                    0.48,
                    0.25,
                    0.17
                )
            ),

            fertileSoil: new SurfaceDepositRenderer(
                scene,
                "fertileSoil",
                new BABYLON.Color3(
                    0.22,
                    0.16,
                    0.10
                )
            )

        };

        this.generated = false;

    }


    generate() {

        if (this.generated) return;

        for (const speciesName in this.renderers) {

            this.renderers[speciesName].clear();

        }


        const minX = this.terrain.min.x;
        const maxX = this.terrain.max.x;

        const minZ = this.terrain.min.z;
        const maxZ = this.terrain.max.z;


        const startX =
            Math.floor(minX / this.spacing) *
            this.spacing;

        const startZ =
            Math.floor(minZ / this.spacing) *
            this.spacing;


        for (
            let x = startX;
            x <= maxX;
            x += this.spacing
        ) {

            for (
                let z = startZ;
                z <= maxZ;
                z += this.spacing
            ) {

                const cellX = Math.floor(
                    x / this.spacing
                );

                const cellZ = Math.floor(
                    z / this.spacing
                );

                const seed = (

                    this.seed ^

                    Math.imul(cellX, 73856093) ^

                    Math.imul(cellZ, 19349663)

                ) >>> 0;

                const random =
                    CreateSeededRandom(seed);


                // Small deterministic displacement.
                const sampleX =
                    x + (random() - 0.5) *
                    this.spacing * 0.5;

                const sampleZ =
                    z + (random() - 0.5) *
                    this.spacing * 0.5;


                const sample = this.field.sample(
                    sampleX,
                    sampleZ
                );

                if (!sample) continue;


                const speciesName =
                    sample.speciesName;

const renderer =
    this.renderers[speciesName];

if (!renderer) continue;

// Surface deposits should not cover steep terrain.
if (sample.slopeDegrees > 12) {
    continue;
}

// Avoid large deposits at high elevations.
if (
    sample.elevation > 0.72 &&
    speciesName !== "clay"
) {
    continue;
}

const baseRadius =
    this.spacing *
    (0.85 + random() * 0.45);

                // Slightly flatten and vary each deposit.
                const radiusX =
                    baseRadius *
                    (0.85 + random() * 0.35);

                const radiusZ =
                    baseRadius *
                    (0.85 + random() * 0.35);

                const rotation =
                    random() * Math.PI * 2;


                renderer.addPatch(

                    sample.position,

                    radiusX,

                    radiusZ,

                    rotation,

                    0.025 + random() * 0.025,
			sample.normal

                );


                // Secondary overlapping patches
                // create less regular boundaries.
                if (random() > 0.35) {

                    const offsetX =
                        (random() - 0.5) *
                        this.spacing * 0.65;

                    const offsetZ =
                        (random() - 0.5) *
                        this.spacing * 0.65;

                    const secondaryPosition =
                        this.terrain.sampleAt(
                            sampleX + offsetX,
                            sampleZ + offsetZ
                        );

			const secondaryProfile =
    this.terrain.sampleProfileAt(
        sampleX + offsetX,
        sampleZ + offsetZ
    );

if (
    secondaryProfile &&
    secondaryProfile.slopeDegrees < 12
) {

    renderer.addPatch(
        secondaryProfile.position,
        radiusX * 0.5,
        radiusZ * 0.5,
        random() * Math.PI * 2,
        0.02,
        secondaryProfile.normal
    );

}

                }

            }

        }


        this.update();

        this.generated = true;

    }


    update() {

        for (const speciesName in this.renderers) {

            this.renderers[speciesName].update();

        }

    }


}
export { SurfaceDepositSystem }
