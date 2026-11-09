import { Cloud } from "../atmosphere/cloud.js";
import { CloudSpecies } from "../atmosphere/cloud-species.js";
import { CloudGenerator } from "../atmosphere/cloud-generator.js";
import { CloudRenderer } from "../rendering/cloud-renderer.js";
import { CreateSeededRandom } from "../core/random.js";

export class ChunkCloudSystem {
    constructor(
        scene,
        terrain,
        waterSystem,
        hydrology,
        rainSystem,
        options = {}
    ) {
        this.scene = scene;
        this.terrain = terrain;
        this.waterSystem = waterSystem;
        this.hydrology = hydrology;
        this.rainSystem = rainSystem;

	this.windTime = 0;
this.windUpdateInterval = 2.0;
this.windAccumulator = 0;

        // Chunk configuration.
        this.chunkSize = options.chunkSize ?? 2000;
        this.renderRadius = options.renderRadius ?? 4;
        this.cloudsPerChunk = options.cloudsPerChunk ?? 8;
        this.maxChunksPerUpdate = options.maxChunksPerUpdate ?? 2;
        this.worldSeed = options.worldSeed ?? 91827;

        // Update intervals.
        this.renderInterval = options.renderInterval ?? 0.5;
        this.simulationInterval = options.simulationInterval ?? 0.25;

        // Storage.
        this.records = new Map();
        this.activeChunks = new Set();

        // Rendering.
        this.renderer = new CloudRenderer(scene);

        // Timing.
        this.renderAccumulator = 0;
        this.simulationAccumulator = 0;

        // Diagnostics.
        this.visibleCloudCount = 0;
        this.totalGeneratedClouds = 0;
        this.totalGeneratedStorms = 0;

        // State.
        this.renderDirty = true;
        this.disposed = false;
        this.rainingCloud = null;

        console.log(
            "[ChunkCloudSystem] Initialized with cumulonimbus support."
        );
    }

    getChunkCoordinates(position) {
        return {
            x: Math.floor(position.x / this.chunkSize),
            z: Math.floor(position.z / this.chunkSize)
        };
    }

    getChunkKey(x, z) {
        return `${x},${z}`;
    }

    getChunkSeed(x, z) {
        return (
            this.worldSeed ^
            Math.imul(x, 73856093) ^
            Math.imul(z, 19349663)
        ) >>> 0;
    }

    // ------------------------------------------------
    // CLOUD SPECIES DISTRIBUTION
    // ------------------------------------------------

selectSpecies(random) {
    const value = random();

    if (value < 0.12 && CloudSpecies.cumulonimbus) {
        return "cumulonimbus";
    }

    if (value < 0.32 && CloudSpecies.towering) {
        return "towering";
    }

    if (CloudSpecies.cumulus) {
        return "cumulus";
    }

    // Fall back to whichever species exists.
    const availableSpecies =
        Object.keys(CloudSpecies);

    if (availableSpecies.length === 0) {
        throw new Error(
            "[ChunkCloudSystem] No cloud species configured."
        );
    }

    return availableSpecies[0];
}







    // ------------------------------------------------
    // CHUNK GENERATION
    // ------------------------------------------------

    generateChunk(chunkX, chunkZ) {
        const key = this.getChunkKey(
            chunkX,
            chunkZ
        );

        if (this.records.has(key)) {
            return this.records.get(key);
        }

        const seed = this.getChunkSeed(
            chunkX,
            chunkZ
        );

        const random = CreateSeededRandom(seed);

        const minX = Math.max(
            chunkX * this.chunkSize,
            this.terrain.min.x
        );

        const maxX = Math.min(
            (chunkX + 1) * this.chunkSize,
            this.terrain.max.x
        );

        const minZ = Math.max(
            chunkZ * this.chunkSize,
            this.terrain.min.z
        );

        const maxZ = Math.min(
            (chunkZ + 1) * this.chunkSize,
            this.terrain.max.z
        );

        const clouds = [];

        if (minX >= maxX || minZ >= maxZ) {
            const record = {
                key,
                chunkX,
                chunkZ,
                seed,
                clouds
            };

            this.records.set(key, record);

            return record;
        }

        let attempts = 0;

        const attemptsLimit =
            this.cloudsPerChunk * 6;

        while (
            clouds.length < this.cloudsPerChunk &&
            attempts < attemptsLimit
        ) {
            attempts++;

            const x =
                minX + random() * (maxX - minX);

            const z =
                minZ + random() * (maxZ - minZ);

            const terrainPosition =
                this.terrain.sampleAt(x, z);

            if (!terrainPosition) {
                continue;
            }

		let speciesName =
    this.selectSpecies(random);

let config =
    CloudSpecies[speciesName];

if (!config) {
    console.error(
        "[ChunkCloudSystem] Missing cloud species:",
        speciesName,
        "Available species:",
        Object.keys(CloudSpecies)
    );

    speciesName = "cumulus";
    config = CloudSpecies.cumulus;
}

if (!config) {
    throw new Error(
        "[ChunkCloudSystem] Cumulus configuration is missing."
    );
}

// Give every cloud a substantially different size.
//
// Storm systems have a narrower variation range so
// their already enormous dimensions remain controlled.

const sizeVariation =
    speciesName === "cumulonimbus"
        ? 0.78 + random() * 0.62
        : 0.62 + random() * 1.08;

const scale = config.scale * (0.75 + random() * 0.55);

const altitude = speciesName === "cumulonimbus"
    ? 4200 + random() * 1800
    : speciesName === "towering"
        ? 3400 + random() * 1500
        : 3000 + random() * 1400;
            const position =
                terrainPosition.add(
                    new BABYLON.Vector3(
                        0,
                        altitude,
                        0
                    )
                );

            const cloud = new Cloud(
                position,
                speciesName,
                scale,
                config
            );

	
const wind = this.sampleWind(position, 0);

cloud.velocity.copyFrom(wind);
cloud.windTarget.copyFrom(wind);
cloud.waterContent =
    random() * cloud.maxWaterCapacity * 0.25;


            cloud.waterContent =
                random() *
                cloud.maxWaterCapacity *
                0.25;

            cloud.baseScale = scale;

            cloud.geometrySeed =
                (seed ^ Math.imul(
                    clouds.length + 1,
                    2654435761
                )) >>> 0;

            cloud.moistureAtLastRender = -1;

            clouds.push(cloud);

            if (speciesName === "cumulonimbus") {
                this.totalGeneratedStorms++;
            }
        }

        const record = {
            key,
            chunkX,
            chunkZ,
            seed,
            clouds
        };

        this.records.set(key, record);

        this.totalGeneratedClouds += clouds.length;

        this.renderDirty = true;

        console.log(
            `[ChunkCloudSystem] Generated ${clouds.length} clouds in ${key}`,
            {
                storms: clouds.filter(
                    cloud => cloud.isStormCloud
                ).length
            }
        );

        return record;
    }

    // ------------------------------------------------
    // CHUNK STREAMING
    // ------------------------------------------------

    updateStreaming(cameraPosition) {
        const center =
            this.getChunkCoordinates(cameraPosition);

        const desiredChunks = new Set();
        const candidates = [];

        for (
            let x = center.x - this.renderRadius;
            x <= center.x + this.renderRadius;
            x++
        ) {
            for (
                let z = center.z - this.renderRadius;
                z <= center.z + this.renderRadius;
                z++
            ) {
                const dx = x - center.x;
                const dz = z - center.z;

                if (
                    dx * dx + dz * dz >
                    this.renderRadius * this.renderRadius
                ) {
                    continue;
                }

                const minX = x * this.chunkSize;
                const minZ = z * this.chunkSize;

                const maxX = minX + this.chunkSize;
                const maxZ = minZ + this.chunkSize;

                if (
                    maxX <= this.terrain.min.x ||
                    minX >= this.terrain.max.x ||
                    maxZ <= this.terrain.min.z ||
                    minZ >= this.terrain.max.z
                ) {
                    continue;
                }

                const key = this.getChunkKey(x, z);

                desiredChunks.add(key);

                if (!this.records.has(key)) {
                    candidates.push({
                        x,
                        z,
                        distance: dx * dx + dz * dz
                    });
                }
            }
        }

        candidates.sort(
            (a, b) => a.distance - b.distance
        );

        let generated = 0;

        for (const candidate of candidates) {
            if (
                generated >= this.maxChunksPerUpdate
            ) {
                break;
            }

            this.generateChunk(
                candidate.x,
                candidate.z
            );

            generated++;
        }

        const nextActive = new Set();

        for (const key of desiredChunks) {
            if (this.records.has(key)) {
                nextActive.add(key);
            }
        }

        const changed =
            nextActive.size !== this.activeChunks.size ||
            [...nextActive].some(
                key => !this.activeChunks.has(key)
            );

        if (changed) {
            this.activeChunks = nextActive;
            this.renderDirty = true;
        }
    }

	    // ------------------------------------------------
    // ATMOSPHERIC MOISTURE
    // ------------------------------------------------

    getLocalMoisture(cloud) {
        if (
            !this.hydrology ||
            typeof this.hydrology.sampleMoisture !== "function"
        ) {
            return 0.35;
        }

        return BABYLON.Scalar.Clamp(
            this.hydrology.sampleMoisture(
                cloud.position
            ),
            0,
            1
        );
    }

    getEvaporationPotential(cloud) {
        if (
            !this.waterSystem ||
            typeof this.waterSystem.getEvaporationPotential !== "function"
        ) {
            return 0.2;
        }

        return BABYLON.Scalar.Clamp(
            this.waterSystem.getEvaporationPotential(
                cloud.position
            ),
            0,
            1
        );
    }

    // ------------------------------------------------
    // CLOUD SIMULATION
    // ------------------------------------------------

updateCloud(cloud, deltaSeconds) {
    cloud.position.addInPlace(
        cloud.velocity.scale(deltaSeconds * 0.5)
    );

    // Environmental sampling is more expensive than
    // the simple cloud-water simulation.
    // Refresh it once per second instead of every tick.

    cloud.environmentSampleTimer =
        (cloud.environmentSampleTimer ?? 0) -
        deltaSeconds;

    if (cloud.environmentSampleTimer <= 0) {
        cloud.localMoisture =
            this.getLocalMoisture(cloud);

        cloud.evaporationPotential =
            this.getEvaporationPotential(cloud);

        cloud.environmentSampleTimer = 1.0;
    }

    const moistureAvailability =
        BABYLON.Scalar.Clamp(
            cloud.localMoisture * 0.65 +
            cloud.evaporationPotential * 0.35,
            0,
            1
        );

    if (!cloud.isRaining) {
        cloud.waterContent +=
            cloud.absorptionRate *
            moistureAvailability *
            deltaSeconds *
            0.05;
    }

    cloud.waterContent = BABYLON.Scalar.Clamp(
        cloud.waterContent,
        0,
        cloud.maxWaterCapacity
    );

    const moistureRatio = cloud.moistureRatio;

    if (
        !cloud.isRaining &&
        moistureRatio >= 0.95
    ) {
        this.startRain(cloud);
    }

    if (cloud.isRaining) {
        cloud.rainRemaining -= deltaSeconds;

        if (cloud.rainRemaining <= 0) {
            cloud.isRaining = false;
            cloud.rainIntensity = 0;
            cloud.rainRemaining = 0;
            this.renderDirty = true;
        }
    }

    const previous = cloud.moistureAtLastRender;

    if (
        previous < 0 ||
        Math.abs(moistureRatio - previous) >= 0.08
    ) {
        this.renderDirty = true;
    }
}
    // ------------------------------------------------
    // PRECIPITATION
    // ------------------------------------------------

    startRain(cloud) {
        cloud.isRaining = true;

        cloud.rainRemaining =
            cloud.rainDuration;

        const moistureRatio =
            cloud.moistureRatio;

        const stormMultiplier =
            cloud.isStormCloud ? 2.0 : 1.0;

        cloud.rainIntensity =
            (0.5 + moistureRatio * 1.5) *
            stormMultiplier;

        const releasedWater =
            cloud.maxWaterCapacity * 0.45;

        cloud.waterContent = Math.max(
            0,
            cloud.waterContent - releasedWater
        );

        if (
            this.hydrology &&
            typeof this.hydrology.addRain === "function"
        ) {
            const rainfallAmount =
                0.25 * cloud.rainIntensity;

            const rainfallRadius =
                cloud.scale *
                (cloud.isStormCloud ? 5 : 4);

            this.hydrology.addRain(
                cloud.position,
                rainfallRadius,
                rainfallAmount
            );
        }

        this.renderDirty = true;

        console.log(
            "[ChunkCloudSystem] Precipitation initiated:",
            {
                species: cloud.speciesName,
                position: cloud.position.asArray(),
                moistureRatio,
                intensity: cloud.rainIntensity
            }
        );
    }


updateSimulation(deltaSeconds) {
    let strongestRainCloud = null;

    // Only update currently active chunks.
    for (const key of this.activeChunks) {
        const record = this.records.get(key);

        if (!record) continue;

        for (const cloud of record.clouds) {
		this.windTime += deltaSeconds;

for (const key of this.activeChunks) {
    const record = this.records.get(key);
    if (!record) continue;

    for (const cloud of record.clouds) {
        const wind = this.sampleWind(
            cloud.position,
            this.windTime
        );

        cloud.updateWind(wind, deltaSeconds);

        this.updateCloudEnvironment(cloud, deltaSeconds);
    }
}
this.renderDirty = true;

            if (
                cloud.isRaining &&
                (
                    !strongestRainCloud ||
                    cloud.rainIntensity >
                    strongestRainCloud.rainIntensity
                )
            ) {
                strongestRainCloud = cloud;
            }
        }
    }

    this.rainingCloud = strongestRainCloud;

    if (strongestRainCloud) {
        const rainPosition =
            strongestRainCloud.position.clone();

        rainPosition.y -=
            strongestRainCloud.isStormCloud
                ? 300
                : 10;

        this.rainSystem.start(
            rainPosition,
            strongestRainCloud.rainIntensity
        );
    } else {
        this.rainSystem.stop();
    }
}

    // ------------------------------------------------
    // CLOUD DIMENSIONS
    // ------------------------------------------------

getCloudRenderScale(cloud) {
    const moisture = cloud.moistureRatio;

    const expansion = 1.0 + moisture * 0.15;

    const verticalExpansion =
        cloud.isStormCloud
            ? 1.0 + moisture * 0.40
            : cloud.speciesName === "towering"
                ? 1.0 + moisture * 0.30
                : 1.0 + moisture * 0.10;

    return {
        horizontal: cloud.baseScale * expansion,
        vertical:
            cloud.baseScale *
            expansion *
            verticalExpansion
    };
}

	    // ------------------------------------------------
    // CLOUD RENDERING
    // ------------------------------------------------

    rebuildRendering() {
        if (this.disposed) return;

        this.renderer.clear();

        let visibleCount = 0;

        for (const key of this.activeChunks) {
            const record = this.records.get(key);

            if (!record) continue;

            for (const cloud of record.clouds) {
                const config =
                    CloudSpecies[cloud.speciesName];

                if (!config) continue;

                // Generate persistent geometry once.
                if (!cloud.baseGeometryMatrices) {
                    const generator =
                        new CloudGenerator(config);

                    cloud.baseGeometryMatrices =
                        generator.generate(
                            cloud.position,
                            cloud.baseScale,
                            config.recursionDepth,
                            cloud.geometrySeed
                        );

                    cloud.baseGeometryPosition =
                        cloud.position.clone();
                }

                const dimensions =
                    this.getCloudRenderScale(cloud);

                const horizontalScale =
                    dimensions.horizontal /
                    cloud.baseScale;

                const verticalScale =
                    dimensions.vertical /
                    cloud.baseScale;

                const offset =
                    cloud.position.subtract(
                        cloud.baseGeometryPosition
                    );

                for (
                    const matrix of cloud.baseGeometryMatrices
                ) {
                    const scaling =
                        new BABYLON.Vector3();

                    const rotation =
                        new BABYLON.Quaternion();

                    const translation =
                        new BABYLON.Vector3();

                    matrix.decompose(
                        scaling,
                        rotation,
                        translation
                    );

                    scaling.x *= horizontalScale;
                    scaling.z *= horizontalScale;
                    scaling.y *= verticalScale;

                    translation.addInPlace(offset);

                    const adjustedMatrix =
                        BABYLON.Matrix.Compose(
                            scaling,
                            rotation,
                            translation
                        );

                    this.renderer.addMatrix(
                        adjustedMatrix,
                        cloud.speciesName,
                        cloud.moistureRatio,
                        cloud.position
                    );
                }

                cloud.moistureAtLastRender =
                    cloud.moistureRatio;

                visibleCount++;
            }
        }

        this.renderer.update();

        this.visibleCloudCount = visibleCount;
        this.renderDirty = false;
    }

    // ------------------------------------------------
    // MAIN UPDATE
    // ------------------------------------------------

    update(cameraPosition, deltaSeconds) {
        if (this.disposed || !cameraPosition) {
            return;
        }

        const elapsed = Math.min(
            Math.max(deltaSeconds, 0),
            1
        );

        this.updateStreaming(cameraPosition);

        this.simulationAccumulator += elapsed;

        while (
            this.simulationAccumulator >=
            this.simulationInterval
        ) {
            this.updateSimulation(
                this.simulationInterval
            );

            this.simulationAccumulator -=
                this.simulationInterval;
        }

        this.renderAccumulator += elapsed;

        if (
            this.renderDirty ||
            this.renderAccumulator >=
            this.renderInterval
        ) {
            this.rebuildRendering();

            this.renderAccumulator = 0;
        }
    }

    // ------------------------------------------------
    // DIAGNOSTICS
    // ------------------------------------------------

    getStats() {
        let totalClouds = 0;
        let rainingClouds = 0;
        let stormClouds = 0;
        let averageMoisture = 0;
        let moistureSamples = 0;

        for (const record of this.records.values()) {
            for (const cloud of record.clouds) {
                totalClouds++;

                if (cloud.isRaining) {
                    rainingClouds++;
                }

                if (cloud.isStormCloud) {
                    stormClouds++;
                }

                averageMoisture +=
                    cloud.moistureRatio;

                moistureSamples++;
            }
        }

        return {
            generatedChunks: this.records.size,
            activeChunks: this.activeChunks.size,

            retainedChunks: this.records.size,

            totalClouds,
            visibleClouds: this.visibleCloudCount,

            stormClouds,
            totalGeneratedStorms:
                this.totalGeneratedStorms,

            rainingClouds,

            averageMoisture:
                moistureSamples > 0
                    ? averageMoisture /
                      moistureSamples
                    : 0,

            renderRadius: this.renderRadius,
            chunkSize: this.chunkSize,

            simulationInterval:
                this.simulationInterval,

            renderInterval:
                this.renderInterval,

            renderDirty: this.renderDirty
        };
    }

    // ------------------------------------------------
    // DISPOSAL
    // ------------------------------------------------

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        if (this.rainSystem) {
            this.rainSystem.stop();
        }

        if (this.renderer) {
            this.renderer.mesh.dispose(
                false,
                true
            );
        }

        this.records.clear();
        this.activeChunks.clear();

        this.rainingCloud = null;

        this.visibleCloudCount = 0;
        this.totalGeneratedClouds = 0;
        this.totalGeneratedStorms = 0;

        console.log(
            "[ChunkCloudSystem] Disposed."
        );
    }


sampleWind(position, time) {
    const x = position.x;
    const z = position.z;

    // Large-scale atmospheric circulation.
    const broad = Math.sin(
        x * 0.000035 + z * 0.000018 + time * 0.018
    );

    const secondary = Math.cos(
        z * 0.000045 - x * 0.000012 + time * 0.012
    );

    const direction = new BABYLON.Vector3(
        0.75 + broad * 0.20,
        0,
        0.30 + secondary * 0.25
    ).normalize();

    const speed = 4 + 9 * (
        0.5 + 0.5 * Math.sin(
            x * 0.00002 + z * 0.000025 + time * 0.01
        )
    );

    return direction.scale(speed);
}

updateCloudEnvironment(cloud, deltaSeconds) {
    // Keep the existing moisture and precipitation simulation.
    // These values should be sampled periodically, not every frame.

    cloud.environmentSampleTimer =
        (cloud.environmentSampleTimer || 0) + deltaSeconds;

    const sampleInterval = 2.0;

    if (cloud.environmentSampleTimer >= sampleInterval) {
        cloud.environmentSampleTimer = 0;

        const position = cloud.position;

        // Use the existing environmental sampling functions
        // from your original updateCloud implementation.
        if (this.moistureField) {
            cloud.localMoisture =
                this.moistureField.sample(
                    position.x,
                    position.z
                );
        }
    }

    // Preserve cloud water capacity.
    cloud.waterContent = BABYLON.Scalar.Clamp(
        cloud.waterContent,
        0,
        cloud.maxWaterCapacity
    );

    // Existing precipitation lifecycle.
    if (cloud.isRaining) {
        cloud.rainRemaining -= deltaSeconds;

        if (cloud.rainRemaining <= 0) {
            cloud.isRaining = false;
            cloud.rainIntensity = 0;
            cloud.rainRemaining = 0;
        }
    }
}

}
