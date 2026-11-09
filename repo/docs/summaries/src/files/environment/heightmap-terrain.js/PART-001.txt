import { BrowserHeightmapLoader } from './topography/browser-heightmap-loader.js';
import { createHeightmapData, decodeHeightmapPixel, sampleHeightmapData, sampleNormalizedHeightmapData } from './topography/heightmap-data.js';

/** Compatibility terrain adapter for Babylon gameplay and chunk systems. */
class HeightmapTerrain {
    constructor(options = {}) {
        this.url = options.url ?? './assets/0_somnium_map_topographic.png';
        this.fallbackUrl = options.fallbackUrl ?? null;
        this.loadedSource = null;
        this.worldSize = options.worldSize ?? 1000000;
        this.minHeight = options.minHeight ?? -2000;
        this.maxHeight = options.maxHeight ?? 1000;
        this.heightChannel = options.heightChannel ?? 'average';
        this.min = { x: -this.worldSize / 2, y: this.minHeight, z: -this.worldSize / 2 };
        this.max = { x: this.worldSize / 2, y: this.maxHeight, z: this.worldSize / 2 };
        this.width = 0;
        this.height = 0;
        this.pixels = null;
        this.mapData = null;
        this.ready = false;
        this.diagnostics = null;
        this.loader = options.loader ?? new BrowserHeightmapLoader();
    }

    async load() {
        let mapData;
        this.loadedSource = this.url;
        try {
            const raster = await this.loader.load(this.url);
            assertCompleteRaster(raster, Boolean(this.fallbackUrl));
            mapData = this.createMapData(raster);
        } catch (error) {
            if (!this.fallbackUrl || this.fallbackUrl === this.url) throw error;
            console.warn(`[HeightmapTerrain] Primary map failed validation; loading fallback ${this.fallbackUrl}.`, error);
            mapData = this.createMapData(await this.loader.load(this.fallbackUrl));
            this.loadedSource = this.fallbackUrl;
        }
        this.mapData = mapData;
        this.width = this.mapData.width;
        this.height = this.mapData.height;
        this.pixels = this.mapData.pixels;
        this.ready = true;
        this.diagnostics = this.getDiagnostics(32);
        console.log('[HeightmapTerrain] Loaded:', this.diagnostics);
        return this;
    }

    createMapData(raster) {
        return createHeightmapData({
            ...raster,
            channel: this.heightChannel,
            minHeight: this.minHeight,
            maxHeight: this.maxHeight
        });
    }

    getNormalizedCoordinates(x, z) {
        return { u: (x - this.min.x) / this.worldSize, v: (z - this.min.z) / this.worldSize };
    }

    contains(x, z) {
        return x >= this.min.x && x <= this.max.x && z >= this.min.z && z <= this.max.z;
    }

    getPixelValue(x, z) {
        this.assertReady();
        const column = clamp(Math.floor(x), 0, this.width - 1);
        const row = clamp(Math.floor(z), 0, this.height - 1);
        return decodeHeightmapPixel(this.mapData, column, row);
    }

    getHeightPixel(x, z) { return this.getPixelValue(x, z); }

    sampleHeight(x, z) {
        this.assertReady();
        if (!this.contains(x, z)) return null;
        const coordinates = this.getNormalizedCoordinates(x, z);
        return sampleHeightmapData(this.mapData, coordinates.u, coordinates.v);
    }

    sampleMapValue(x, z) {
        this.assertReady();
        if (!this.contains(x, z)) return null;
        const coordinates = this.getNormalizedCoordinates(x, z);
        return sampleNormalizedHeightmapData(this.mapData, coordinates.u, coordinates.v);
    }

    sampleAt(x, z) {
        const height = this.sampleHeight(x, z);
        return height === null ? null : new BABYLON.Vector3(x, height, z);
    }

    sample() {
        return this.sampleAt(
            BABYLON.Scalar.RandomRange(this.min.x, this.max.x),
            BABYLON.Scalar.RandomRange(this.min.z, this.max.z)
        );
    }

    sampleNear(center, radius) {
        const angle = Math.random() * Math.PI * 2;
        const distance = radius * Math.sqrt(Math.random());
        return this.sampleAt(
            center.x + Math.cos(angle) * distance,
            center.z + Math.sin(angle) * distance
        );
    }

    sampleSlopeAt(x, z, spacing = 4) {
        const left = this.sampleHeight(x - spacing, z);
        const right = this.sampleHeight(x + spacing, z);
        const back = this.sampleHeight(x, z - spacing);
        const front = this.sampleHeight(x, z + spacing);
        if ([left, right, back, front].some(isNull)) return null;
        const dx = (right - left) / (2 * spacing);
        const dz = (front - back) / (2 * spacing);
        const magnitude = Math.hypot(dx, dz);
        const angle = Math.atan(magnitude);
        return {
            gradientX: dx,
            gradientZ: dz,
            magnitude,
            angle,
            degrees: angle * 180 / Math.PI,
            normal: new BABYLON.Vector3(-dx, 1, -dz).normalize()
        };
    }

    sampleProfileAt(x, z, spacing = 4) {
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

    getDiagnostics(gridSize = 32) {
        if (!this.ready) return { ready: false, message: 'Heightmap has not finished loading.' };
        const samples = Math.max(1, Math.floor(gridSize));
        let minimum = Infinity;
        let maximum = -Infinity;
        let total = 0;
        let count = 0;
        const extremaSamples = [];
        for (let row = 0; row <= samples; row++) {
            for (let column = 0; column <= samples; column++) {
                const x = this.min.x + column / samples * this.worldSize;
                const z = this.min.z + row / samples * this.worldSize;
                const height = this.sampleHeight(x, z);
                minimum = Math.min(minimum, height);
                maximum = Math.max(maximum, height);
                total += height;
                count++;
                if (isDiagnosticPoint(column, row, samples)) extremaSamples.push({ x, z, height });
            }
        }
        return {
            ready: true,
            image: { width: this.width, height: this.height },
            source: this.loadedSource,
            usingFallback: this.loadedSource !== this.url,
            worldSize: this.worldSize,
            heightChannel: this.heightChannel,
            configuredHeightRange: { min: this.minHeight, max: this.maxHeight },
            sampledHeightRange: { min: minimum, max: maximum, variation: maximum - minimum },
            averageHeight: total / count,
            sampleCount: count,
            samples: extremaSamples
        };
    }

    assertReady() {
        if (!this.ready || !this.mapData) throw new Error('Heightmap not loaded.');
    }

    dispose() {
        this.pixels = null;
        this.mapData = null;
        this.ready = false;
        this.diagnostics = null;
        this.loadedSource = null;
    }
}

function assertCompleteRaster(raster, checkTransparentTail) {
    if (!checkTransparentTail || !raster?.pixels || raster.height < 2) return;
    const threshold = Math.max(8, Math.ceil(raster.height * 0.01));
    let transparentRows = 0;
    for (let row = raster.height - 1; row >= 0; row--) {
        let transparent = true;
        for (let column = 0; column < raster.width; column++) {
            if (raster.pixels[(row * raster.width + column) * 4 + 3] !== 0) {
                transparent = false;
                break;
            }
        }
        if (!transparent) break;
        transparentRows++;
    }
    if (transparentRows >= threshold) {
        throw new Error(`Topographic raster has ${transparentRows} fully transparent trailing rows.`);
    }
}

function isNull(value) { return value === null; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function isDiagnosticPoint(column, row, size) {
    const midpoint = Math.floor(size / 2);
    return [0, midpoint, size].includes(column) && [0, midpoint, size].includes(row);
}

export { HeightmapTerrain };
