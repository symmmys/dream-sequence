/** Pure raster validation, elevation decoding, and bilinear sampling. */

const CHANNELS = new Set([
    'red', 'green', 'blue', 'alpha', 'average', 'luminance'
]);

function createHeightmapData(options = {}) {
    const width = options.width;
    const height = options.height;
    const pixels = options.pixels ?? options.data;
    const channel = options.channel ?? 'luminance';
    const minHeight = options.minHeight ?? 0;
    const maxHeight = options.maxHeight ?? 1;
    const colorStops = normalizeColorStops(options.colorStops);

    validateRaster(width, height, pixels);
    validateHeightRange(minHeight, maxHeight);
    validateChannel(channel, colorStops);

    return {
        width,
        height,
        pixels: new Uint8Array(pixels),
        channel,
        minHeight,
        maxHeight,
        colorStops
    };
}

function validateRaster(width, height, pixels) {
    if (!Number.isSafeInteger(width) || width < 2) {
        throw new RangeError('Heightmap width must be an integer of at least two.');
    }
    if (!Number.isSafeInteger(height) || height < 2) {
        throw new RangeError('Heightmap height must be an integer of at least two.');
    }
    if (!pixels || !Number.isSafeInteger(pixels.length)) {
        throw new TypeError('Heightmap pixels must be a typed or array-like RGBA buffer.');
    }
    if (pixels.length !== width * height * 4) {
        throw new RangeError('Heightmap RGBA buffer length does not match its dimensions.');
    }
    for (let index = 0; index < pixels.length; index++) {
        const value = pixels[index];
        if (!Number.isFinite(value) || value < 0 || value > 255) {
            throw new RangeError(`Heightmap pixel ${index} is outside the byte range.`);
        }
    }
}

function validateHeightRange(minHeight, maxHeight) {
    if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight) || minHeight >= maxHeight) {
        throw new RangeError('Heightmap elevation bounds must be finite and increasing.');
    }
}

function validateChannel(channel, colorStops) {
    if (colorStops.length) return;
    if (!CHANNELS.has(channel)) {
        throw new RangeError(`Unsupported heightmap channel: ${channel}`);
    }
}

function normalizeColorStops(stops = []) {
    if (!Array.isArray(stops)) {
        throw new TypeError('Heightmap colorStops must be an array.');
    }
    const normalized = stops.map(normalizeColorStop);
    if (normalized.length && normalized.length < 2) {
        throw new RangeError('A color elevation palette requires at least two stops.');
    }
    return normalized;
}

function normalizeColorStop(stop) {
    if (!stop || !Array.isArray(stop.color) || stop.color.length < 3) {
        throw new TypeError('Each color stop requires an RGB color and normalized value.');
    }
    const color = stop.color.slice(0, 3);
    if (!color.every(isByte)) throw new RangeError('Palette RGB channels must be bytes.');
    if (!Number.isFinite(stop.value) || stop.value < 0 || stop.value > 1) {
        throw new RangeError('Palette values must be normalized to [0, 1].');
    }
    return { color, value: stop.value };
}

function isByte(value) {
    return Number.isInteger(value) && value >= 0 && value <= 255;
}

function sampleHeightmapData(data, u, v) {
    return data.minHeight + sampleNormalizedHeightmapData(data, u, v) * (data.maxHeight - data.minHeight);
}

function sampleNormalizedHeightmapData(data, u, v) {
    validateSampleCoordinates(u, v);
    const x = clamp(u, 0, 1) * (data.width - 1);
    const z = clamp(v, 0, 1) * (data.height - 1);
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(x0 + 1, data.width - 1);
    const z1 = Math.min(z0 + 1, data.height - 1);
    const tx = x - x0;
    const tz = z - z0;
    const top = lerp(
        decodeHeightmapPixel(data, x0, z0),
        decodeHeightmapPixel(data, x1, z0),
        tx
    );
    const bottom = lerp(
        decodeHeightmapPixel(data, x0, z1),
        decodeHeightmapPixel(data, x1, z1),
        tx
    );
    return lerp(top, bottom, tz);
}

function decodeHeightmapPixel(data, x, z) {
    const offset = (z * data.width + x) * 4;
    const pixels = data.pixels;
    if (data.colorStops.length) return decodePalette(pixels, offset, data.colorStops);

    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const alpha = pixels[offset + 3];
    switch (data.channel) {
        case 'red': return red / 255;
        case 'green': return green / 255;
        case 'blue': return blue / 255;
        case 'alpha': return alpha / 255;
        case 'average': return (red + green + blue) / 765;
        default: return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    }
}

function decodePalette(pixels, offset, stops) {
    let nearest = stops[0];
    let nearestDistance = Infinity;
    for (const stop of stops) {
        const red = pixels[offset] - stop.color[0];
        const green = pixels[offset + 1] - stop.color[1];
        const blue = pixels[offset + 2] - stop.color[2];
        const distance = red * red + green * green + blue * blue;
        if (distance < nearestDistance) {
            nearest = stop;
            nearestDistance = distance;
        }
    }
    return nearest.value;
}

function validateSampleCoordinates(u, v) {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
        throw new TypeError('Heightmap sample coordinates must be finite.');
    }
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function getHeightmapStatistics(data, samples = 24) {
    if (!Number.isSafeInteger(samples) || samples < 1) {
        throw new RangeError('Heightmap statistic sample count must be positive.');
    }
    let minimum = Infinity;
    let maximum = -Infinity;
    let total = 0;
    let count = 0;
    for (let row = 0; row <= samples; row++) {
        for (let column = 0; column <= samples; column++) {
            const value = sampleHeightmapData(data, column / samples, row / samples);
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
            total += value;
            count++;
        }
    }
    return { minimum, maximum, average: total / count, count };
}

export {
    createHeightmapData,
    decodeHeightmapPixel,
    getHeightmapStatistics,
    sampleHeightmapData,
    sampleNormalizedHeightmapData
};
