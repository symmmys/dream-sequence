const Genetics = {

    createGenome() {

        return {

            growthRate: 1.0,
            maxHeight: 1.0,

            // Structural characteristics
            trunkThickness: 1.0,
            branchDensity: 1.0,
            branchThickness: 1.0,
            branchTaper: 0.75,
            branchAngle: 1.0,

            // Foliage characteristics
            leafDensity: 1.0,
            canopyWidth: 1.0,
            leafSize: 1.0,

            // Environmental characteristics
            lightSensitivity: 1.0,

            seedProduction: 1.0,
            lifespan: 1.0
        };

    },


    inherit(parentGenome, mutationRate = 0.8) {

        const child = {};

        for (const gene in parentGenome) {

            const mutation = (Math.random() * 2 - 1) * mutationRate;

            child[gene] = BABYLON.Scalar.Clamp(
                parentGenome[gene] * (1 + mutation),
                0.1,
                1.5
            );
        }

        return child;
    }

};
export { Genetics };
