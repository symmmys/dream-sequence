import { clamp, getTerrainVertexColor } from "./terrain-color.js";

let terrain = null;

function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

function pixelValue(x, z) {
    const source = terrain;
    const pixelX = clamp(Math.floor(x), 0, source.width - 1);
    const pixelZ = clamp(Math.floor(z), 0, source.height - 1);
    const index = (pixelZ * source.width + pixelX) * 4;
    const red = source.pixels[index];
    const green = source.pixels[index + 1];
    const blue = source.pixels[index + 2];

    switch (source.heightChannel) {
        case "red":
            return red / 255;
        case "green":
            return green / 255;
        case "blue":
            return blue / 255;
        case "luminance":
            return (
                0.2126 * red +
                0.7152 * green +
                0.0722 * blue
            ) / 255;
        case "average":
        default:
            return (red + green + blue) / 765;
    }
}

function heightAt(worldX, worldZ) {
    const normalizedX = clamp(
        (worldX - terrain.minX) / terrain.worldSize
    );
    const normalizedZ = clamp(
        (worldZ - terrain.minZ) / terrain.worldSize
    );

    const pixelX = normalizedX * (terrain.width - 1);
    const pixelZ = normalizedZ * (terrain.height - 1);
    const x0 = Math.floor(pixelX);
    const z0 = Math.floor(pixelZ);
    const x1 = Math.min(x0 + 1, terrain.width - 1);
    const z1 = Math.min(z0 + 1, terrain.height - 1);
    const fractionX = pixelX - x0;
    const fractionZ = pixelZ - z0;

    const top = lerp(
        pixelValue(x0, z0),
        pixelValue(x1, z0),
        fractionX
    );
    const bottom = lerp(
        pixelValue(x0, z1),
        pixelValue(x1, z1),
        fractionX
    );
    const normalizedHeight = lerp(top, bottom, fractionZ);

    return lerp(
        terrain.minHeight,
        terrain.maxHeight,
        normalizedHeight
    );
}

function terrainColor(height, slope, worldX, worldZ) {
    return getTerrainVertexColor(
        height,
        slope,
        worldX,
        worldZ,
        terrain.minHeight,
        terrain.maxHeight
    );
}

function getMeshResolution(lod) {
    const resolutions = [32, 16, 8, 4];
    return resolutions[clamp(lod, 0, resolutions.length - 1)];
}

function createMeshBuffers(resolution) {
    const vertexCount = (resolution + 1) ** 2;
    const indexCount = resolution * resolution * 6;

    return {
        positions: new Float32Array(vertexCount * 3),
        normals: new Float32Array(vertexCount * 3),
        colors: new Float32Array(vertexCount * 4),
        indices: new Uint32Array(indexCount)
    };
}

function getEdgeHeight(edge, index, context) {
    const {
        originX,
        originZ,
        size,
        stride,
        lod,
        neighborLODs
    } = context;
    const otherLOD = neighborLODs[edge] ?? lod;
    const worldDistance = index * stride;

    if (otherLOD <= lod) {
        return sampleEdgeHeight(edge, worldDistance, context);
    }

    const coarseStride = size / getMeshResolution(otherLOD);
    const lower = Math.floor(worldDistance / coarseStride) * coarseStride;
    const upper = Math.min(lower + coarseStride, size);
    const blend = upper === lower
        ? 0
        : (worldDistance - lower) / (upper - lower);

    const lowerPosition = getEdgePosition(edge, lower, context);
    const upperPosition = getEdgePosition(edge, upper, context);

    return lerp(
        heightAt(lowerPosition.x, lowerPosition.z),
        heightAt(upperPosition.x, upperPosition.z),
        blend
    );
}

function getEdgePosition(edge, distance, context) {
    const { originX, originZ, size } = context;

    if (edge === "north" || edge === "south") {
        return {
            x: originX + distance,
            z: originZ + (edge === "south" ? size : 0)
        };
    }

    return {
        x: originX + (edge === "east" ? size : 0),
        z: originZ + distance
    };
}

function sampleEdgeHeight(edge, distance, context) {
    const position = getEdgePosition(edge, distance, context);
    return heightAt(position.x, position.z);
}

function writeTerrainVertex(ix, iz, context, buffers) {
    const sample = getTerrainVertexSample(ix, iz, context);
    const vertexIndex = iz * (context.resolution + 1) + ix;

    writeVertexPositionAndNormal(sample, vertexIndex, buffers);
    writeVertexColor(sample, vertexIndex, buffers);
}

function getTerrainVertexSample(ix, iz, context) {
    const worldX = context.originX + ix * context.stride;
    const worldZ = context.originZ + iz * context.stride;
    const height = getVertexHeight(ix, iz, worldX, worldZ, context);
    const spacing = Math.max(2, context.stride * 0.25);
    const gradientX = getHeightGradientX(worldX, worldZ, spacing);
    const gradientZ = getHeightGradientZ(worldX, worldZ, spacing);

    return {
        worldX,
        worldZ,
        height,
        gradientX,
        gradientZ,
        normalLength: Math.hypot(gradientX, 1, gradientZ),
        slope: Math.hypot(gradientX, gradientZ)
    };
}

function getHeightGradientX(worldX, worldZ, spacing) {
    return (
        heightAt(worldX + spacing, worldZ) -
        heightAt(worldX - spacing, worldZ)
    ) / (2 * spacing);
}

function getHeightGradientZ(worldX, worldZ, spacing) {
    return (
        heightAt(worldX, worldZ + spacing) -
        heightAt(worldX, worldZ - spacing)
    ) / (2 * spacing);
}

function writeVertexPositionAndNormal(sample, vertexIndex, buffers) {
    const offset = vertexIndex * 3;

    buffers.positions[offset] = sample.worldX;
    buffers.positions[offset + 1] = sample.height;
    buffers.positions[offset + 2] = sample.worldZ;

    buffers.normals[offset] = -sample.gradientX / sample.normalLength;
    buffers.normals[offset + 1] = 1 / sample.normalLength;
    buffers.normals[offset + 2] = -sample.gradientZ / sample.normalLength;
}

function writeVertexColor(sample, vertexIndex, buffers) {
    const offset = vertexIndex * 4;
    const color = terrainColor(
        sample.height,
        sample.slope,
        sample.worldX,
        sample.worldZ
    );

    buffers.colors[offset] = color[0];
    buffers.colors[offset + 1] = color[1];
    buffers.colors[offset + 2] = color[2];
    buffers.colors[offset + 3] = 1;
}

function getVertexHeight(ix, iz, worldX, worldZ, context) {
    const { resolution } = context;
    let height = heightAt(worldX, worldZ);

    if (iz === 0) {
        height = getEdgeHeight("north", ix, context);
    }

    if (iz === resolution) {
        height = getEdgeHeight("south", ix, context);
    }

    if (ix === 0) {
        height = getEdgeHeight("west", iz, context);
    }

    if (ix === resolution) {
        height = getEdgeHeight("east", iz, context);
    }

    return height;
}

function writeMeshIndices(resolution, indices) {
    let cursor = 0;

    for (let iz = 0; iz < resolution; iz++) {
        for (let ix = 0; ix < resolution; ix++) {
            const topLeft = iz * (resolution + 1) + ix;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + resolution + 1;
            const bottomRight = bottomLeft + 1;

            indices[cursor++] = topLeft;
            indices[cursor++] = bottomLeft;
            indices[cursor++] = topRight;
            indices[cursor++] = topRight;
            indices[cursor++] = bottomLeft;
            indices[cursor++] = bottomRight;
        }
    }
}

function generateMesh(job) {
    const resolution = getMeshResolution(job.lod);
    const stride = job.size / resolution;
    const buffers = createMeshBuffers(resolution);
    const context = {
        resolution,
        stride,
        size: job.size,
        originX: job.x * job.size,
        originZ: job.z * job.size,
        lod: job.lod,
        neighborLODs: job.neighborLODs ?? {}
    };

    for (let iz = 0; iz <= resolution; iz++) {
        for (let ix = 0; ix <= resolution; ix++) {
            writeTerrainVertex(ix, iz, context, buffers);
        }
    }

    writeMeshIndices(resolution, buffers.indices);
    validateGeneratedColors(buffers.colors);

    return buffers;
}

function validateWorkerTerrain(message) {
    const settings = message.terrain;
    const pixels = new Uint8ClampedArray(message.pixels);
    const expectedLength = settings.width * settings.height * 4;

    if (
        !Number.isInteger(settings.width) || settings.width < 1 ||
        !Number.isInteger(settings.height) || settings.height < 1 ||
        !Number.isFinite(settings.worldSize) || settings.worldSize <= 0 ||
        !Number.isFinite(settings.minX) ||
        !Number.isFinite(settings.minZ) ||
        !Number.isFinite(settings.minHeight) ||
        !Number.isFinite(settings.maxHeight) ||
        settings.maxHeight <= settings.minHeight ||
        pixels.length < expectedLength
    ) {
        throw new Error("Terrain worker received invalid heightmap data.");
    }

    terrain = {
        ...settings,
        pixels
    };
}

function validateGeneratedColors(colors) {
    for (let index = 0; index < colors.length; index++) {
        if (!Number.isFinite(colors[index])) {
            throw new Error(
                `Terrain color generation produced a non-finite value at ${index}.`
            );
        }
    }
}

function transferMeshData(message, buffers) {
    self.postMessage({
        type: "complete",
        id: message.id,
        revision: message.revision,
        data: buffers
    }, [
        buffers.positions.buffer,
        buffers.normals.buffer,
        buffers.colors.buffer,
        buffers.indices.buffer
    ]);
}

function postWorkerError(message, error) {
    self.postMessage({
        type: "error",
        id: message.id,
        revision: message.revision,
        message: error.message
    });
}

function handleWorkerMessage(event) {
    const message = event.data;

    if (message.type === "init") {
        validateWorkerTerrain(message);
        self.postMessage({ type: "ready" });
        return;
    }

    if (message.type !== "generate" || !terrain) return;

    try {
        const buffers = generateMesh(message.job);
        transferMeshData(message, buffers);
    } catch (error) {
        postWorkerError(message, error);
    }
}

self.onmessage = handleWorkerMessage;
