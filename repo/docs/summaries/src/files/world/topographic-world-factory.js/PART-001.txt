/** Creates independent, serializable world slices from decoded topographic rasters. */

import { createHeightmapData, getHeightmapStatistics, sampleHeightmapData, sampleNormalizedHeightmapData } from '../environment/topography/heightmap-data.js';
import { createWorldSlice } from './fields/geometry/world-slice.js';

class TopographicWorldFactory {
    create(options = {}) {
        const map = createHeightmapData({
            ...(options.raster ?? {}),
            channel: options.heightChannel ?? options.raster?.channel ?? 'luminance',
            minHeight: options.minHeight ?? 0,
            maxHeight: options.maxHeight ?? 100
        });
        const worldSizeX = options.worldSizeX ?? options.worldSize ?? 1000;
        const worldSizeZ = options.worldSizeZ ?? options.worldSize ?? 1000;
        validateWorldSize(worldSizeX, worldSizeZ);

        const slice = createWorldSlice({
            id: options.id,
            w: options.w ?? 0,
            geometry: options.geometry ?? 'euclidean',
            seed: options.seed ?? 0,
            revision: options.revision ?? 1,
            frame: options.frame
        });
        const terrain = new TopographicTerrain(map, worldSizeX, worldSizeZ);
        const metadata = {
            source: options.source ?? null,
            width: map.width,
            height: map.height,
            channel: map.channel,
            colorStopCount: map.colorStops.length,
            minHeight: map.minHeight,
            maxHeight: map.maxHeight,
            statistics: getHeightmapStatistics(map, options.statisticsSamples ?? 24)
        };

        return { slice, terrain, metadata };
    }
}

class TopographicTerrain {
    constructor(map, worldSizeX, worldSizeZ) {
        this.map = map;
        this.pixels = map.pixels;
        this.width = map.width;
        this.height = map.height;
        this.worldSizeX = worldSizeX;
        this.worldSizeZ = worldSizeZ;
        this.worldSize = Math.max(worldSizeX, worldSizeZ);
        this.minHeight = map.minHeight;
        this.maxHeight = map.maxHeight;
        this.heightChannel = map.channel;
        this.min = { x: -worldSizeX / 2, y: map.minHeight, z: -worldSizeZ / 2 };
        this.max = { x: worldSizeX / 2, y: map.maxHeight, z: worldSizeZ / 2 };
        this.disposed = false;
    }

    get ready() { return !this.disposed; }

    sampleHeight(x, z) {
        this.assertReady();
        if (!this.contains(x, z)) return null;
        return sampleHeightmapData(this.map, this.toU(x), this.toV(z));
    }

    sampleAt(x, z) {
        const y = this.sampleHeight(x, z);
        return y === null ? null : { x, y, z };
    }

    sampleMapValue(x, z) {
        this.assertReady();
        if (!this.contains(x, z)) return null;
        return sampleNormalizedHeightmapData(this.map, this.toU(x), this.toV(z));
    }

    sampleSlopeAt(x, z, spacing = 1) {
        if (!Number.isFinite(spacing) || spacing <= 0) {
            throw new RangeError('Terrain slope spacing must be finite and positive.');
        }
        const left = this.sampleHeight(x - spacing, z);
        const right = this.sampleHeight(x + spacing, z);
        const back = this.sampleHeight(x, z - spacing);
        const front = this.sampleHeight(x, z + spacing);
        if ([left, right, back, front].some(isNull)) return null;
        const gradientX = (right - left) / (2 * spacing);
        const gradientZ = (front - back) / (2 * spacing);
        const magnitude = Math.hypot(gradientX, gradientZ);
        return {
            gradientX,
            gradientZ,
            magnitude,
            angle: Math.atan(magnitude),
            degrees: Math.atan(magnitude) * 180 / Math.PI,
            normal: normalize3({ x: -gradientX, y: 1, z: -gradientZ })
        };
    }

    sampleProfileAt(x, z, spacing = 1) {
        const position = this.sampleAt(x, z);
        const slope = this.sampleSlopeAt(x, z, spacing);
        if (!position || !slope) return null;
        return {
            position,
            elevation: clamp((position.y - this.minHeight) / (this.maxHeight - this.minHeight), 0, 1),
            slope: slope.magnitude,
            slopeDegrees: slope.degrees,
            normal: slope.normal
        };
    }

    getDiagnostics(samples = 24) {
        this.assertReady();
        return {
            ready: !this.disposed,
            width: this.width,
            height: this.height,
            worldSizeX: this.worldSizeX,
            worldSizeZ: this.worldSizeZ,
            heightChannel: this.heightChannel,
            sampledHeightRange: getHeightmapStatistics(this.map, samples)
        };
    }

    contains(x, z) {
        return Number.isFinite(x) && Number.isFinite(z) &&
            x >= this.min.x && x <= this.max.x && z >= this.min.z && z <= this.max.z;
    }

    toU(x) { return (x - this.min.x) / this.worldSizeX; }
    toV(z) { return (z - this.min.z) / this.worldSizeZ; }

    assertReady() {
        if (this.disposed) throw new Error('Topographic terrain has been disposed.');
    }

    dispose() {
        this.disposed = true;
        this.map = null;
        this.pixels = null;
    }
}

function validateWorldSize(width, depth) {
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
        throw new RangeError('Topographic world dimensions must be finite and positive.');
    }
}

function normalize3(vector) {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function isNull(value) { return value === null; }

export { TopographicTerrain, TopographicWorldFactory };
