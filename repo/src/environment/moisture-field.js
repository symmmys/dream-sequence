
class MoistureField {
    constructor(terrain, options = {}) {
        this.terrain = terrain;

        this.seaLevel = options.seaLevel ?? -100;

        this.baseMoisture = options.baseMoisture ?? 0.08;
        this.oceanMoisture = options.oceanMoisture ?? 0.82;

        this.coastalRadius = options.coastalRadius ?? 24000;
        this.atmosphericScale = options.atmosphericScale ?? 7000;

        this.cloudContribution = options.cloudContribution ?? 0.25;
    }

    clamp(value) {
        return Math.max(0, Math.min(1, value));
    }

    getSurfaceHeight(x, z) {
        const height = this.terrain.sampleHeight(x, z);

        if (height === null || !Number.isFinite(height)) {
            return null;
        }

        return height;
    }

    getOceanInfluence(x, z) {
        const centerHeight = this.getSurfaceHeight(x, z);

        if (centerHeight === null) {
            return 0;
        }

        // Directly over the ocean.
        if (centerHeight <= this.seaLevel) {
            return 1;
        }

        // Sample the surrounding terrain to estimate
        // proximity to ocean water.
        const directions = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [0.7071, 0.7071],
            [-0.7071, 0.7071],
            [0.7071, -0.7071],
            [-0.7071, -0.7071]
        ];

        let influence = 0;

        const distances = [
            this.coastalRadius * 0.4,
            this.coastalRadius
        ];

        for (let distanceIndex = 0;
             distanceIndex < distances.length;
             distanceIndex++) {

            const distance = distances[distanceIndex];

            const weight = distanceIndex === 0 ? 0.65 : 0.35;

            let oceanSamples = 0;

            for (const direction of directions) {
                const height = this.getSurfaceHeight(
                    x + direction[0] * distance,
                    z + direction[1] * distance
                );

                if (height !== null && height <= this.seaLevel) {
                    oceanSamples++;
                }
            }

            influence += (
                oceanSamples / directions.length
            ) * weight;
        }

        return this.clamp(influence);
    }

    sample(position, cloudMoisture = 0) {
        if (!position) {
            return this.baseMoisture;
        }

        const surfaceHeight = this.getSurfaceHeight(
            position.x,
            position.z
        );

        if (surfaceHeight === null) {
            return this.baseMoisture;
        }

        const referenceHeight = Math.max(
            surfaceHeight,
            this.seaLevel
        );

        const altitude = Math.max(
            0,
            position.y - referenceHeight
        );

        // Moisture availability decreases with altitude.
        const altitudeFactor = Math.exp(
            -altitude / this.atmosphericScale
        );

        const oceanInfluence = this.getOceanInfluence(
            position.x,
            position.z
        );

        const oceanContribution =
            oceanInfluence *
            this.oceanMoisture *
            altitudeFactor;

        const cloudContribution =
            this.clamp(cloudMoisture) *
            this.cloudContribution;

        return this.clamp(
            this.baseMoisture +
            oceanContribution +
            cloudContribution
        );
    }

    sampleSurface(x, z) {
        const position = {
            x,
            y: this.seaLevel,
            z
        };

        return this.sample(position);
    }

    getStats() {
        return {
            seaLevel: this.seaLevel,
            baseMoisture: this.baseMoisture,
            oceanMoisture: this.oceanMoisture,
            coastalRadius: this.coastalRadius,
            atmosphericScale: this.atmosphericScale
        };
    }
}

export { MoistureField };

