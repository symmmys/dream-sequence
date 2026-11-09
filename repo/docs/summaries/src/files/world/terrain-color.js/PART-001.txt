/**
 * Shared terrain surface-color model.
 *
 * Soil classification is derived from normalized topographic elevation until
 * a dedicated world soil-distribution texture becomes available. Both the
 * worker and synchronous chunk renderer use this module so their palettes
 * cannot drift apart.
 */

const DEFAULT_SEED = 91827;

const SOIL_COLORS = Object.freeze({
    clay: [0.48, 0.29, 0.21],
    sand: [0.92, 0.73, 0.39],
    fertileSoil: [0.43, 0.29, 0.18],
    loam: [0.35, 0.25, 0.16],
    organic: [0.19, 0.13, 0.085],
    scree: [0.43, 0.41, 0.37]
});

const BEDROCK_COLORS = Object.freeze({
    limestone: [0.63, 0.60, 0.51],
    sandstone: [0.65, 0.43, 0.29],
    basalt: [0.24, 0.23, 0.22],
    granite: [0.39, 0.37, 0.34]
});

const SNOW_COLOR = [0.82, 0.84, 0.82];

/** Clamp a numeric value, defaulting to the normalized [0, 1] range. */
export function clamp(value, min = 0, max = 1) {
    if (!Number.isFinite(value)) {
        return value === Infinity ? max : min;
    }

    return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function hashNoise2D(x, z, seed = DEFAULT_SEED) {
    let value =
        Math.imul(x | 0, 374761393) +
        Math.imul(z | 0, 668265263) +
        Math.imul(seed | 0, 1442695041);

    value = Math.imul(
        value ^ (value >>> 13),
        1274126177
    );

    value ^= value >>> 16;

    return (value >>> 0) / 4294967295;
}

function smoothNoise2D(x, z, seed = DEFAULT_SEED) {
    const integerX = Math.floor(x);
    const integerZ = Math.floor(z);
    const fractionX = x - integerX;
    const fractionZ = z - integerZ;

    const blendX = fractionX * fractionX * (3 - 2 * fractionX);
    const blendZ = fractionZ * fractionZ * (3 - 2 * fractionZ);

    const topLeft = hashNoise2D(integerX, integerZ, seed);
    const topRight = hashNoise2D(integerX + 1, integerZ, seed);
    const bottomLeft = hashNoise2D(integerX, integerZ + 1, seed);
    const bottomRight = hashNoise2D(integerX + 1, integerZ + 1, seed);

    return lerp(
        lerp(topLeft, topRight, blendX),
        lerp(bottomLeft, bottomRight, blendX),
        blendZ
    );
}

function fractalNoise2D(x, z, seed, octaves = 3) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let totalAmplitude = 0;

    for (let octave = 0; octave < octaves; octave++) {
        value += smoothNoise2D(
            x * frequency,
            z * frequency,
            seed + octave * 1013
        ) * amplitude;

        totalAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }

    return totalAmplitude > 0 ? value / totalAmplitude : 0;
}

function mixColor(first, second, amount) {
    const blend = clamp(amount);

    return [
        lerp(first[0], second[0], blend),
        lerp(first[1], second[1], blend),
        lerp(first[2], second[2], blend)
    ];
}

/**
 * Map normalized elevation to the current provisional soil distribution.
 * Values come from the grayscale topographic heightmap, not a soil texture.
 */
export function classifySoilType(elevation) {
    const value = clamp(elevation);

    if (value < 0.18) return "clay";
    if (value < 0.38) return "sand";
    if (value < 0.58) return "fertileSoil";
    if (value < 0.76) return "loam";
    if (value < 0.90) return "organic";

    return "scree";
}

function getBedrockColor(geology, elevation) {
    if (elevation > 0.70 && geology > 0.65) {
        return BEDROCK_COLORS.granite;
    }

    if (geology < 0.28) return BEDROCK_COLORS.limestone;
    if (geology < 0.48) return BEDROCK_COLORS.sandstone;
    if (geology > 0.84) return BEDROCK_COLORS.basalt;

    return BEDROCK_COLORS.granite;
}

function applyTextureVariation(color, variation) {
    const texture = 0.92 + variation * 0.16;
    const result = new Array(3);

    for (let channel = 0; channel < 3; channel++) {
        result[channel] = clamp(color[channel] * texture);
    }

    return result;
}

function applySnow(color, elevation) {
    if (elevation <= 0.92) return color;

    const snowBlend = clamp((elevation - 0.92) / 0.08);
    return mixColor(color, SNOW_COLOR, snowBlend);
}

/**
 * Return an RGB vertex color for a terrain sample.
 *
 * `height` is expressed in world units; `slope` is the horizontal gradient
 * magnitude. Invalid sample values are safely normalized instead of
 * propagating NaN values into Babylon.js vertex buffers.
 */
export function getTerrainVertexColor(
    height,
    slope,
    worldX,
    worldZ,
    minHeight,
    maxHeight,
    seed = DEFAULT_SEED
) {
    const heightRange = maxHeight - minHeight;
    const elevation = heightRange > 0
        ? clamp((height - minHeight) / heightRange)
        : 0;

    const safeSlope = Number.isFinite(slope) ? Math.max(0, slope) : 0;
    const safeX = Number.isFinite(worldX) ? worldX : 0;
    const safeZ = Number.isFinite(worldZ) ? worldZ : 0;
    const slopeDegrees = Math.atan(safeSlope) * 180 / Math.PI;

    const moisture =
        fractalNoise2D(safeX * 0.0025, safeZ * 0.0025, seed + 1000, 3) * 0.7 +
        fractalNoise2D(safeX * 0.009, safeZ * 0.009, seed + 3000, 3) * 0.3;

    const geology = fractalNoise2D(
        safeX * 0.00375,
        safeZ * 0.00375,
        seed + 2000,
        3
    );

    const variation = fractalNoise2D(
        safeX * 0.025,
        safeZ * 0.025,
        seed + 5000,
        3
    );

    const exposure = clamp(
        slopeDegrees / 42 * 0.78 +
        elevation * 0.12 +
        (1 - moisture) * 0.10
    );

    const soilType = classifySoilType(elevation);
    const soilColor = SOIL_COLORS[soilType];
    const bedrockColor = getBedrockColor(geology, elevation);
    const bedrockBlend = clamp((exposure - 0.25) / 0.65);

    const exposedColor = mixColor(
        soilColor,
        bedrockColor,
        bedrockBlend
    );

    const variedColor = applyTextureVariation(
        exposedColor,
        variation
    );

    const finalColor = applySnow(variedColor, elevation);

    return [
        clamp(finalColor[0]),
        clamp(finalColor[1]),
        clamp(finalColor[2])
    ];
}
