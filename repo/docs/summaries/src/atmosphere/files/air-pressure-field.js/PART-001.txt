
class AirPressureField {
    constructor(options = {}) {
        this.time = 0;

        this.spatialScale = options.spatialScale ?? 100000;

        this.gradientStep = options.gradientStep ?? 5000;

        this.windStrength = options.windStrength ?? 0.85;

        this.maxWindSpeed = options.maxWindSpeed ?? 1.1;

        this.prevailingWind = new BABYLON.Vector3(
            0.28,
            0,
            0.12
        );

        this.wind = new BABYLON.Vector3();
    }

    update(deltaTime) {
        this.time += Math.max(0, deltaTime);
    }

    pressureAt(x, z, time = this.time) {
        const scale = this.spatialScale;

        const px = x / scale;
        const pz = z / scale;

        const wave1 = Math.sin(
            px * 0.85 +
            pz * 0.38 +
            time * 0.018
        );

        const wave2 = Math.cos(
            pz * 0.72 -
            px * 0.31 -
            time * 0.012
        );

        const wave3 = Math.sin(
            (px + pz) * 0.42 +
            time * 0.009
        );

        return (
            wave1 * 0.42 +
            wave2 * 0.34 +
            wave3 * 0.24
        );
    }

    sample(position, time = this.time) {
        const x = position.x;
        const z = position.z;
        const h = this.gradientStep;

        const pressure = this.pressureAt(
            x,
            z,
            time
        );

        // Estimate the horizontal pressure gradient.
        const gradientX = (
            this.pressureAt(x + h, z, time) -
            this.pressureAt(x - h, z, time)
        ) / (2 * h);

        const gradientZ = (
            this.pressureAt(x, z + h, time) -
            this.pressureAt(x, z - h, time)
        ) / (2 * h);

        // Air flows approximately from higher pressure
        // toward lower pressure.
        let windX =
            -gradientX *
            this.spatialScale *
            this.windStrength;

        let windZ =
            -gradientZ *
            this.spatialScale *
            this.windStrength;

        windX += this.prevailingWind.x;
        windZ += this.prevailingWind.z;

        const magnitude = Math.hypot(
            windX,
            windZ
        );

        if (magnitude > this.maxWindSpeed) {
            const factor =
                this.maxWindSpeed / magnitude;

            windX *= factor;
            windZ *= factor;
        }

        this.wind.set(
            windX,
            0,
            windZ
        );

        return {
            pressure,
            wind: this.wind.clone()
        };
    }

    getStats(position) {
        const sample = this.sample(position);

        return {
            pressure: sample.pressure,
            windSpeed: sample.wind.length(),
            windDirection: sample.wind.clone().normalize()
        };
    }
}

export { AirPressureField };

