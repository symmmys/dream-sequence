
class CloudGenerator {
    constructor(config) {
        this.config = config;
    }

    createRandom(seed = 91827) {
        let state = seed >>> 0;

        return () => {
            state = (
                Math.imul(state, 1664525) +
                1013904223
            ) >>> 0;

            return state / 4294967296;
        };
    }

    generate(
        position,
        scale,
        maxDepth = 2,
        seed = 91827
    ) {
        const matrices = [];
        const random = this.createRandom(seed);

        this.generateRecursive(
            position.clone(),
            scale,
            maxDepth,
            0,
            random,
            matrices
        );

        return matrices;
    }

    generateRecursive(
        position,
        scale,
        maxDepth,
        currentDepth,
        random,
        matrices
    ) {
        const config = this.config;
        const irregularity = config.irregularity;

        const dimensions = new BABYLON.Vector3(
            scale * config.width *
                (0.80 + random() * irregularity),
            scale * config.height *
                (0.80 + random() * irregularity),
            scale * config.depth *
                (0.80 + random() * irregularity)
        );

        const rotation =
            BABYLON.Quaternion.RotationYawPitchRoll(
                random() * 0.35,
                (random() - 0.5) * 0.22,
                (random() - 0.5) * 0.22
            );

        matrices.push(
            BABYLON.Matrix.Compose(
                dimensions,
                rotation,
                position
            )
        );

        if (currentDepth >= maxDepth) {
            return;
        }

        for (
            let i = 0;
            i < config.branchCount;
            i++
        ) {
            const angle = random() * Math.PI * 2;

            const horizontal =
                scale *
                config.horizontalSpread *
                (0.45 + random() * 0.75);

            const vertical =
                scale * config.verticalSpread;

            let verticalOffset =
                (random() * 2 - 1) * vertical;

            if (config.height > 2) {
                verticalOffset =
                    verticalOffset * 0.45 +
                    Math.abs(verticalOffset) * 0.75;
            }

            const offset = new BABYLON.Vector3(
                Math.cos(angle) * horizontal,
                verticalOffset,
                Math.sin(angle) * horizontal
            );

            const childPosition =
                position.add(offset);

            const childScale =
                scale *
                config.scaleDecay *
                (0.78 + random() * 0.38);

            this.generateRecursive(
                childPosition,
                childScale,
                maxDepth,
                currentDepth + 1,
                random,
                matrices
            );
        }
    }
}

export { CloudGenerator };

