
import { Cloud } from "./cloud.js";

import { CloudSpecies } from "./cloud-species.js";

import { CloudGenerator } from "./cloud-generator.js";

import { AirPressureField } from "./air-pressure-field.js";

import { CloudRenderer } from "../rendering/cloud-renderer.js";


class CloudSystem {
    constructor(
        scene,
        terrain,
        waterSystem,
        hydrology,
        rainSystem
    ) {
        this.scene = scene;

        this.terrain = terrain;
        this.waterSystem = waterSystem;
        this.hydrology = hydrology;
        this.rainSystem = rainSystem;

        this.clouds = [];

        this.renderer = new CloudRenderer(scene);

        this.maxClouds = 100;

        this.rainingCloud = null;

        // Atmospheric circulation.
        this.pressureField = new AirPressureField();

        this.elapsed = 0;

        // Regional weather classification.
        this.weatherCellSize = 100000;

        this.weatherCells = new Map();

        // Rendering update frequency.
        this.renderAccumulator = 0;
        this.renderInterval = 0.4;

        this.renderDirty = false;

        this.disposed = false;
    }

    // ------------------------------------------
    // REGIONAL WEATHER
    // ------------------------------------------

    getWeatherCellKey(x, z) {
        const cx = Math.floor(
            x / this.weatherCellSize
        );

        const cz = Math.floor(
            z / this.weatherCellSize
        );

        return `${cx},${cz}`;
    }

    getWeatherRegime(position) {
        const key = this.getWeatherCellKey(
            position.x,
            position.z
        );

        if (this.weatherCells.has(key)) {
            return this.weatherCells.get(key);
        }

        const centerX =
            (Math.floor(
                position.x / this.weatherCellSize
            ) + 0.5) * this.weatherCellSize;

        const centerZ =
            (Math.floor(
                position.z / this.weatherCellSize
            ) + 0.5) * this.weatherCellSize;

        const center = new BABYLON.Vector3(
            centerX,
            position.y,
            centerZ
        );

        const atmospheric =
            this.pressureField.sample(center);

        const moisture = BABYLON.Scalar.Clamp(
            this.waterSystem.getEvaporationPotential(
                center
            ),
            0,
            1
        );

        // Lower pressure favors rising air.
        // Moisture is required for deep convection.
        const instability = BABYLON.Scalar.Clamp(
            0.5 - atmospheric.pressure,
            0,
            1
        );

        let regime = "stable";

        if (
            moisture >= 0.58 &&
            atmospheric.pressure <= -0.12 &&
            instability >= 0.62
        ) {
            regime = "storm";
        } else if (
            moisture >= 0.36 &&
            atmospheric.pressure <= 0.20
        ) {
            regime = "convective";
        }

        this.weatherCells.set(key, regime);

        return regime;
    }

    selectSpecies(regime, random = Math.random) {
        const value = random();

        switch (regime) {
            case "storm":
                if (value < 0.20) {
                    return "cumulus";
                }

                if (value < 0.80) {
                    return "towering";
                }

                return "cumulonimbus";

            case "convective":
                return value < 0.45
                    ? "cumulus"
                    : "towering";

            default:
                return value < 0.85
                    ? "cumulus"
                    : "towering";
        }
    }

    // ------------------------------------------
    // CLOUD GENERATION
    // ------------------------------------------

    generate(count = 35) {
        if (this.disposed) return;

        this.clouds = [];

        this.weatherCells.clear();

        this.renderer.clear();

        const actualCount = Math.min(
            count,
            this.maxClouds
        );

        for (
            let i = 0;
            i < actualCount;
            i++
        ) {
            const terrainPosition =
                this.terrain.sample();

            if (!terrainPosition) continue;

            const weatherRegime =
                this.getWeatherRegime(
                    terrainPosition
                );

            const speciesName =
                this.selectSpecies(weatherRegime);

            const config =
                CloudSpecies[speciesName];

            const scale =
                config.scale *
                (
                    speciesName === "cumulonimbus"
                        ? 0.78 + Math.random() * 0.35
                        : 0.70 + Math.random() * 0.55
                );

            const position =
                terrainPosition.add(
                    new BABYLON.Vector3(
                        0,
                        90 + Math.random() * 65,
                        0
                    )
                );

            const cloud = new Cloud(
                position,
                speciesName,
                scale,
                config,
                weatherRegime
            );

            // Generate the formation relative to
            // its own origin, not world coordinates.
            const generator = new CloudGenerator(
                config
            );

            cloud.geometryMatrices =
                generator.generate(
                    BABYLON.Vector3.Zero(),
                    scale,
                    config.recursionDepth,
                    i + 91827
                );

            // Start with the prevailing wind.
            const atmospheric =
                this.pressureField.sample(position);

            cloud.velocity.copyFrom(
                atmospheric.wind.scale(0.35)
            );

            this.clouds.push(cloud);
        }

        this.updateRendering(true);
    }

    // ------------------------------------------
    // WIND AND CLOUD MOVEMENT
    // ------------------------------------------

    updateWind(cloud, deltaTime) {
        const atmospheric =
            this.pressureField.sample(
                cloud.position
            );

        const target = atmospheric.wind;

        // Gradually approach the local wind velocity.
        // This avoids abrupt changes between regions.
        const response = 1 - Math.exp(
            -cloud.windResponse * deltaTime
        );

        cloud.velocity.x +=
            (target.x - cloud.velocity.x) *
            response;

        cloud.velocity.z +=
            (target.z - cloud.velocity.z) *
            response;

        // Small, smooth atmospheric turbulence.
        const turbulence =
            cloud.windTurbulence;

        const phase = this.elapsed * 0.12;

        cloud.velocity.x +=
            Math.sin(phase + cloud.position.z * 0.0001) *
            turbulence *
            deltaTime;

        cloud.velocity.z +=
            Math.cos(phase + cloud.position.x * 0.0001) *
            turbulence *
            deltaTime;

        cloud.position.x +=
            cloud.velocity.x * deltaTime * 0.5;

        cloud.position.z +=
            cloud.velocity.z * deltaTime * 0.5;
    }

    // ------------------------------------------
    // CLOUD SIMULATION
    // ------------------------------------------

    update(deltaYears) {
        if (this.disposed) return;

        const deltaTime = Math.max(
            0,
            Math.min(deltaYears, 0.25)
        );

        this.elapsed += deltaTime;

        this.pressureField.update(deltaTime);

        let activeRainCloud = null;

        for (const cloud of this.clouds) {
            this.updateCloud(cloud, deltaTime);

            if (
                cloud.isRaining &&
                (
                    !activeRainCloud ||
                    cloud.rainIntensity >
                    activeRainCloud.rainIntensity
                )
            ) {
                activeRainCloud = cloud;
            }
        }

        this.rainingCloud = activeRainCloud;

        if (activeRainCloud) {
            const rainPosition =
                activeRainCloud.position.clone();

            rainPosition.y -= 10;

            this.rainSystem.start(
                rainPosition,
                activeRainCloud.rainIntensity
            );
        } else {
            this.rainSystem.stop();
        }

        this.renderAccumulator += deltaTime;

        if (
            this.renderDirty &&
            this.renderAccumulator >=
                this.renderInterval
        ) {
            this.updateRendering();

            this.renderAccumulator = 0;
        }
    }

    updateCloud(cloud, deltaTime) {
        this.updateWind(cloud, deltaTime);

        // Cache environmental sampling.
        cloud.environmentSampleTimer -= deltaTime;

        if (cloud.environmentSampleTimer <= 0) {
            cloud.evaporationPotential =
                BABYLON.Scalar.Clamp(
                    this.waterSystem.getEvaporationPotential(
                        cloud.position
                    ),
                    0,
                    1
                );

            cloud.environmentSampleTimer = 1.0;
        }

        // Moisture accumulation.
        if (!cloud.isRaining) {
            cloud.waterContent +=
                cloud.absorptionRate *
                cloud.evaporationPotential *
                deltaTime;
        }

        cloud.waterContent = Math.min(
            cloud.waterContent,
            cloud.maxWaterCapacity
        );

        // Precipitation threshold.
        if (
            cloud.waterContent >=
            cloud.maxWaterCapacity
        ) {
            this.startRain(cloud);
        }

        // Rainfall duration.
        if (cloud.isRaining) {
            cloud.rainRemaining -= deltaTime;

            if (cloud.rainRemaining <= 0) {
                cloud.isRaining = false;
                cloud.rainIntensity = 0;
                cloud.rainRemaining = 0;
            }
        }

        this.renderDirty = true;
    }

    startRain(cloud) {
        cloud.isRaining = true;

        cloud.rainRemaining =
            cloud.rainDuration;

        cloud.rainIntensity =
            0.5 + cloud.moistureRatio * 1.5;

        const releasedWater =
            cloud.maxWaterCapacity * 0.45;

        cloud.waterContent -= releasedWater;

        const rainfallAmount =
            0.25 * cloud.rainIntensity;

        const rainfallRadius =
            cloud.scale * 4;

        this.hydrology.addRain(
            cloud.position,
            rainfallRadius,
            rainfallAmount
        );
    }

    // ------------------------------------------
    // RENDERING
    // ------------------------------------------

    updateRendering(force = false) {
        if (
            !force &&
            !this.renderDirty
        ) {
            return;
        }

        this.renderer.clear();

        for (const cloud of this.clouds) {
            const localMatrices =
                cloud.geometryMatrices;

            if (!localMatrices) continue;

            const worldMatrices = [];

            for (const localMatrix of localMatrices) {
                const matrix = localMatrix.clone();

                // Translate the local formation into
                // its current world position.
                matrix.m[12] += cloud.position.x;
                matrix.m[13] += cloud.position.y;
                matrix.m[14] += cloud.position.z;

                worldMatrices.push(matrix);
            }

            this.renderer.addCloud(
                worldMatrices,
                cloud.moistureRatio,
                cloud.speciesName,
                cloud.position
            );
        }

        this.renderer.update();

        this.renderDirty = false;
    }

    // ------------------------------------------
    // DIAGNOSTICS
    // ------------------------------------------

    getStats() {
        const speciesCounts = {
            cumulus: 0,
            towering: 0,
            cumulonimbus: 0
        };

        for (const cloud of this.clouds) {
            speciesCounts[cloud.speciesName]++;
        }

        return {
            totalClouds: this.clouds.length,
            speciesCounts,
            weatherRegions: this.weatherCells.size,
            rainingClouds: this.clouds.filter(
                cloud => cloud.isRaining
            ).length,
            averageWindSpeed:
                this.clouds.length
                    ? this.clouds.reduce(
                        (sum, cloud) =>
                            sum + cloud.velocity.length(),
                        0
                    ) / this.clouds.length
                    : 0
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        this.rainSystem.stop();

        this.renderer.mesh.dispose();

        this.clouds.length = 0;

        this.weatherCells.clear();
    }
}

export { CloudSystem };

