
import { CreateSeededRandom } from "../core/random.js";

class RecursiveObjectGenerator {
    constructor(config) {
        this.config = config;
        this.matrices = [];
    }

    generate(position, scale, depth) {
        this.matrices = [];

        this.generateRecursive(
            position,
            scale,
            depth,
            0
        );

        return this.matrices;
    }

    generateRecursive() {
        throw new Error(
            "generateRecursive must be implemented"
        );
    }
}

class RockGenerator extends RecursiveObjectGenerator {
    constructor(config, seed = 1) {
        super(config);
        this.random = CreateSeededRandom(seed);
    }

    generateRecursive(
        position,
        scale,
        maxDepth,
        currentDepth
    ) {
        const c = this.config;
        const random = this.random;

        const irregularity = c.irregularity ?? 0.5;

        // Angular, asymmetric rock body.
        const sx = scale * (
            0.75 + random() * irregularity
        );

        const sy = scale * (
            0.65 + random() * irregularity
        ) * (c.verticalScale ?? 1);

        const sz = scale * (
            0.75 + random() * irregularity
        );

        // Fractured formations tend to have tilted faces.
        const rotation =
            BABYLON.Quaternion.RotationYawPitchRoll(
                random() * Math.PI * 2,
                (random() - 0.5) * 0.8,
                (random() - 0.5) * 0.8
            );

        const buriedFraction = currentDepth === 0
            ? 0.30
            : 0.05;

        const center = position.add(
            new BABYLON.Vector3(
                0,
                sy * (0.5 - buriedFraction),
                0
            )
        );

        this.matrices.push(
            BABYLON.Matrix.Compose(
                new BABYLON.Vector3(sx, sy, sz),
                rotation,
                center
            )
        );

        if (currentDepth >= maxDepth) {
            return;
        }

        const count = Math.max(
            2,
            Math.round(
                c.branchCount *
                (1 - currentDepth * 0.10)
            )
        );

        for (let i = 0; i < count; i++) {
            const phi = random() * Math.PI * 2;

            // Bias protrusions toward the upper surface.
            const vertical = random() * 1.4 - 0.15;

            const radial = Math.sqrt(
                Math.max(0, 1 - vertical * vertical)
            );

            const direction = new BABYLON.Vector3(
                Math.cos(phi) * radial,
                vertical,
                Math.sin(phi) * radial
            ).normalize();

            const displacement =
                (c.displacement ?? 0.8) *
                (0.65 + random() * 0.55);

            const childPosition = position.add(
                direction.scale(scale * displacement)
            );

            const childScale = scale *
                (c.scaleDecay ?? 0.6) *
                (0.75 + random() * 0.35);

            this.generateRecursive(
                childPosition,
                childScale,
                maxDepth,
                currentDepth + 1
            );
        }
    }
}

export {
    RockGenerator,
    RecursiveObjectGenerator
};

