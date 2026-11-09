
export class Cloud {
    constructor(position, speciesName, scale, config) {
        this.position = position.clone();
        this.speciesName = speciesName;
        this.scale = scale;
        this.baseScale = scale;
        this.config = config;

        this.waterContent = 0;
        this.maxWaterCapacity = config.moistureCapacity ?? 100;
        this.absorptionRate = config.absorptionRate ?? 16;

        this.rainIntensity = 0;
        this.rainRemaining = 0;
        this.rainDuration = config.rainDuration ?? 1.5;
        this.isRaining = false;

        // Atmospheric wind state.
        this.velocity = BABYLON.Vector3.Zero();
        this.windTarget = BABYLON.Vector3.Zero();
        this.windResponse = 0.12;

        this.localMoisture = 0;
        this.evaporationPotential = 0;
        this.environmentSampleTimer = 0;

        // Persistent geometry cache.
        this.moistureAtLastRender = -1;
        this.baseGeometryMatrices = null;
        this.baseGeometryPosition = null;

        this.geometrySeed = 1;
    }

    get moistureRatio() {
        return BABYLON.Scalar.Clamp(
            this.waterContent / this.maxWaterCapacity,
            0,
            1
        );
    }

    get isStormCloud() {
        return this.speciesName === "cumulonimbus";
    }

    updateWind(target, deltaSeconds) {
        this.windTarget.copyFrom(target);

        const response = 1 - Math.exp(
            -this.windResponse * deltaSeconds
        );

        BABYLON.Vector3.LerpToRef(
            this.velocity,
            this.windTarget,
            response,
            this.velocity
        );

        this.position.addInPlace(
            this.velocity.scale(deltaSeconds*0.01)
        );
    }
}

