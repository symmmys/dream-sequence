
import { fractalNoise2D } from "../core/noise.js";

const MATERIALS = {
    granite: {
        density: 2.70,
        hardness: 0.98,
        cohesion: 0.95,
        porosity: 0.02,
        moistureCapacity: 0.12,
        infiltration: 0.08,
        drainage: 0.95,
        fertility: 0.08,
        roughness: 0.94,
        color: [0.39, 0.37, 0.34]
    },

    basalt: {
        density: 2.95,
        hardness: 0.96,
        cohesion: 0.94,
        porosity: 0.06,
        moistureCapacity: 0.18,
        infiltration: 0.15,
        drainage: 0.85,
        fertility: 0.15,
        roughness: 0.92,
        color: [0.24, 0.23, 0.22]
    },

    limestone: {
        density: 2.50,
        hardness: 0.65,
        cohesion: 0.65,
        porosity: 0.12,
        moistureCapacity: 0.45,
        infiltration: 0.55,
        drainage: 0.65,
        fertility: 0.40,
        roughness: 0.82,
        color: [0.63, 0.60, 0.51]
    },

    sandstone: {
        density: 2.20,
        hardness: 0.45,
        cohesion: 0.40,
        porosity: 0.28,
        moistureCapacity: 0.40,
        infiltration: 0.72,
        drainage: 0.85,
        fertility: 0.22,
        roughness: 0.90,
        color: [0.65, 0.43, 0.29]
    },

    scree: {
        density: 1.75,
        hardness: 0.15,
        cohesion: 0.10,
        porosity: 0.42,
        moistureCapacity: 0.12,
        infiltration: 0.90,
        drainage: 0.98,
        fertility: 0.04,
        roughness: 0.98,
        color: [0.43, 0.41, 0.37]
    },

    sand: {
        density: 1.60,
        hardness: 0.08,
        cohesion: 0.12,
        porosity: 0.40,
        moistureCapacity: 0.25,
        infiltration: 0.95,
        drainage: 0.98,
        fertility: 0.12,
        roughness: 0.65,
        color: [0.76, 0.66, 0.46]
    },

    silt: {
        density: 1.45,
        hardness: 0.10,
        cohesion: 0.25,
        porosity: 0.48,
        moistureCapacity: 0.72,
        infiltration: 0.60,
        drainage: 0.45,
        fertility: 0.75,
        roughness: 0.75,
        color: [0.52, 0.40, 0.29]
    },

    loam: {
        density: 1.35,
        hardness: 0.12,
        cohesion: 0.30,
        porosity: 0.50,
        moistureCapacity: 0.78,
        infiltration: 0.72,
        drainage: 0.65,
        fertility: 0.92,
        roughness: 0.82,
        color: [0.35, 0.25, 0.16]
    },

    clay: {
        density: 1.80,
        hardness: 0.28,
        cohesion: 0.45,
        porosity: 0.35,
        moistureCapacity: 0.95,
        infiltration: 0.18,
        drainage: 0.12,
        fertility: 0.58,
        roughness: 0.80,
        color: [0.48, 0.29, 0.21]
    },

    organic: {
        density: 0.85,
        hardness: 0.03,
        cohesion: 0.12,
        porosity: 0.72,
        moistureCapacity: 1.0,
        infiltration: 0.80,
        drainage: 0.38,
        fertility: 1.0,
        roughness: 0.98,
        color: [0.19, 0.13, 0.085]
    },

    fertileSoil: {
        density: 1.30,
        hardness: 0.05,
        cohesion: 0.15,
        porosity: 0.55,
        moistureCapacity: 0.90,
        infiltration: 0.72,
        drainage: 0.55,
        fertility: 0.95,
        roughness: 0.92,
        color: [0.27, 0.19, 0.12]
    },

    coal: {
        density: 1.40,
        hardness: 0.35,
        cohesion: 0.55,
        porosity: 0.10,
        moistureCapacity: 0.20,
        infiltration: 0.12,
        drainage: 0.65,
        fertility: 0.05,
        roughness: 0.90,
        color: [0.075, 0.065, 0.055]
    },

    anomaly: {
        density: 1.0,
        hardness: 0.85,
        cohesion: 0.35,
        porosity: 0.20,
        moistureCapacity: 0.50,
        infiltration: 0.35,
        drainage: 0.45,
        fertility: 0.40,
        roughness: 0.95,
        color: [0.22, 0.12, 0.48]
    }
};

const clamp = (value, min = 0, max = 1) =>
    Math.max(min, Math.min(max, value));

class GeologicalField {
    constructor(terrain, seed = 91827) {
        this.terrain = terrain;
        this.seed = seed;

        this.regionFrequency = 0.0025;
        this.detailFrequency = 0.009;
        this.slopeSamplingDistance = 4;
    }

    noise(x, z, salt, frequency, octaves = 3) {
        return fractalNoise2D(
            x * frequency,
            z * frequency,
            this.seed + salt,
            octaves
        );
    }

    sample(x, z) {
        const profile = this.terrain.sampleProfileAt(
            x,
            z,
            this.slopeSamplingDistance
        );

        if (!profile) return null;

        const elevation = profile.elevation;
        const slope = profile.slopeDegrees;

        const moistureNoise = this.noise(
            x, z, 1000, this.regionFrequency
        );

        const geologyNoise = this.noise(
            x, z, 2000, this.regionFrequency * 1.5
        );

        const detail = this.noise(
            x, z, 3000, this.detailFrequency
        );

        const strata = this.noise(
            x, z, 4000, 0.004, 4
        );

        const surfaceVariation = this.noise(
            x, z, 5000, 0.025
        );

        const anomalyNoise = this.noise(
            x, z, 6000, 0.0015
        );

        const moisture = clamp(
            moistureNoise * 0.7 + detail * 0.3
        );

        // Determine the underlying geological formation.
        let bedrockType;

        if (anomalyNoise > 0.985) {
            bedrockType = "anomaly";
        } else if (geologyNoise < 0.28) {
            bedrockType = "limestone";
        } else if (geologyNoise < 0.48) {
            bedrockType = "sandstone";
        } else if (geologyNoise > 0.84) {
            bedrockType = "basalt";
        } else {
            bedrockType = "granite";
        }

        if (elevation > 0.70 && geologyNoise > 0.65) {
            bedrockType = "granite";
        }

        // Bedrock exposure increases on steep slopes.
        const exposure = clamp(
            slope / 42 * 0.78 +
            elevation * 0.12 +
            (1 - moisture) * 0.10
        );

	// -----------------------------------------
// TOPOGRAPHIC SOIL DISTRIBUTION
// -----------------------------------------

const mapValue = this.terrain.sampleMapValue(x, z);

let surfaceSoil;

if (mapValue === null) {
    surfaceSoil = "loam";
} else if (mapValue < 0.18) {
    surfaceSoil = "clay";
} else if (mapValue < 0.38) {
    surfaceSoil = "sand";
} else if (mapValue < 0.58) {
    surfaceSoil = "fertileSoil";
} else if (mapValue < 0.76) {
    surfaceSoil = "loam";
} else if (mapValue < 0.90) {
    surfaceSoil = "organic";
} else {
    surfaceSoil = "scree";
}

// Local geology still controls exposed bedrock.
if (exposure > 0.88 || (slope > 32 && exposure > 0.65)) {
    surfaceSoil = "scree";
}

        const surface = MATERIALS[surfaceSoil];
        const bedrock = MATERIALS[bedrockType];

        // Variable soil-horizon depths.
        const soilDepth = Math.max(
            0.08,
            (1 - exposure) *
            (0.8 + moisture * 2.2) *
            (0.75 + surfaceVariation * 0.5)
        );

        const organicThickness = soilDepth *
            (surfaceSoil === "organic" ? 0.22 : 0.06);

        const topsoilThickness = soilDepth * 0.42;
        const subsoilThickness = soilDepth * 0.34;
        const parentThickness = soilDepth -
            organicThickness -
            topsoilThickness -
            subsoilThickness;

        const horizons = {
            O: {
                material: "organic",
                thickness: organicThickness
            },
            A: {
                material: surfaceSoil,
                thickness: topsoilThickness
            },
            B: {
                material: geologyNoise > 0.58 ? "clay" : "silt",
                thickness: subsoilThickness
            },
            C: {
                material: bedrockType,
                thickness: parentThickness
            }
        };

        const weathering = clamp(
            moisture * 0.45 +
            surfaceVariation * 0.25 +
            (1 - bedrock.hardness) * 0.30
        );

        return {
            position: profile.position,
            normal: profile.normal,
            elevation,
            slope,
            slopeDegrees: slope,

            speciesName: exposure > 0.82
                ? bedrockType
                : surfaceSoil,

            bedrockType,
            surfaceSoil,
            horizons,

            soilDepth,
            exposure,
            weathering,
            moisture,
            geology: geologyNoise,
            strata,
            surfaceVariation,

            density: surface.density,
            hardness: surface.hardness,
            cohesion: surface.cohesion,
            porosity: surface.porosity,
            moistureCapacity: surface.moistureCapacity,
            infiltration: surface.infiltration,
            drainage: surface.drainage,
            fertility: surface.fertility,
            roughness: surface.roughness,

            bedrockProperties: { ...bedrock },
            soilProperties: { ...surface },
            material: { ...surface },
            color: surface.color
        };
    }

    getMaterialAt(x, z) {
        return this.sample(x, z);
    }

    getSoilProfileAt(x, z) {
        const sample = this.sample(x, z);

        if (!sample) return null;

        return {
            horizons: sample.horizons,
            soilDepth: sample.soilDepth,
            surfaceSoil: sample.surfaceSoil,
            bedrockType: sample.bedrockType,
            fertility: sample.fertility,
            moistureCapacity: sample.moistureCapacity,
            infiltration: sample.infiltration,
            drainage: sample.drainage,
            exposure: sample.exposure
        };
    }

    getMaterialProperties(x, z) {
        const sample = this.sample(x, z);

        if (!sample) return null;

        return {
            density: sample.density,
            hardness: sample.hardness,
            cohesion: sample.cohesion,
            porosity: sample.porosity,
            moistureCapacity: sample.moistureCapacity,
            infiltration: sample.infiltration,
            drainage: sample.drainage,
            fertility: sample.fertility,
            roughness: sample.roughness
        };
    }
}

export { GeologicalField, MATERIALS };

