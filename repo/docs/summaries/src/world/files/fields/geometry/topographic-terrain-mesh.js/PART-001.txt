/** Builds reusable Babylon meshes from a topographic terrain sampler. */

function createTopographicTerrainMesh(scene, terrain, options = {}) {
    const buffers = buildTopographicTerrainBuffers(terrain, options);
    const normals = new Array(buffers.positions.length).fill(0);
    BABYLON.VertexData.ComputeNormals(buffers.positions, buffers.indices, normals);
    const data = new BABYLON.VertexData();
    data.positions = buffers.positions;
    data.normals = normals;
    data.colors = buffers.colors;
    data.indices = buffers.indices;
    const mesh = new BABYLON.Mesh(options.name ?? 'topographicTerrain', scene);
    data.applyToMesh(mesh, true);
    mesh.isPickable = options.isPickable ?? false;
    if (Number.isInteger(options.layerMask)) mesh.layerMask = options.layerMask;
    mesh.metadata = {
        ...(mesh.metadata || {}),
        topographicTerrain: true,
        terrainResolution: { x: buffers.resolutionX, z: buffers.resolutionZ },
        worldSizeX: terrain.worldSizeX,
        worldSizeZ: terrain.worldSizeZ
    };
    return mesh;
}

function buildTopographicTerrainBuffers(terrain, options = {}) {
    validateTerrain(terrain);
    const maxSegments = options.maxSegments ?? 100;
    const resolutionX = resolveResolution(options.resolutionX, terrain.width, maxSegments);
    const resolutionZ = resolveResolution(options.resolutionZ, terrain.height, maxSegments);
    const positions = [];
    const colors = [];
    const indices = [];
    for (let row = 0; row <= resolutionZ; row++) {
        for (let column = 0; column <= resolutionX; column++) {
            const x = terrain.min.x + column / resolutionX * terrain.worldSizeX;
            const z = terrain.min.z + row / resolutionZ * terrain.worldSizeZ;
            const height = terrain.sampleHeight(x, z);
            if (!Number.isFinite(height)) throw new Error(`Invalid topographic height at (${x}, ${z}).`);
            positions.push(x, height, z);
            writeElevationColor(height, terrain.minHeight, terrain.maxHeight, colors);
            if (row < resolutionZ && column < resolutionX) {
                writeCell(row, column, resolutionX, indices);
            }
        }
    }
    return { positions, colors, indices, resolutionX, resolutionZ };
}

function validateTerrain(terrain) {
    if (!terrain || !Number.isFinite(terrain.worldSizeX) || !Number.isFinite(terrain.worldSizeZ) ||
        !terrain.min || !Number.isFinite(terrain.min.x) || !Number.isFinite(terrain.min.z) ||
        !Number.isFinite(terrain.minHeight) || !Number.isFinite(terrain.maxHeight) ||
        terrain.minHeight >= terrain.maxHeight || !Number.isSafeInteger(terrain.width) || terrain.width < 2 ||
        !Number.isSafeInteger(terrain.height) || terrain.height < 2 ||
        typeof terrain.sampleHeight !== 'function') {
        throw new TypeError('A valid topographic terrain sampler is required.');
    }
}

function resolveResolution(requested, sourceSize, maximum) {
    const resolution = requested ?? Math.min(maximum, sourceSize - 1);
    if (!Number.isSafeInteger(resolution) || resolution < 1 || resolution > 2048) {
        throw new RangeError('Terrain mesh resolution must be an integer between 1 and 2048.');
    }
    return Math.min(resolution, sourceSize - 1, maximum);
}

function writeElevationColor(height, minimum, maximum, colors) {
    const value = clamp((height - minimum) / (maximum - minimum), 0, 1);
    const rgb = value < 0.48
        ? [0.12 + value * 0.12, 0.3 + value * 0.45, 0.16 + value * 0.08]
        : value < 0.76
            ? [0.42 + value * 0.2, 0.38 + value * 0.12, 0.2]
            : [0.68 + value * 0.2, 0.7 + value * 0.18, 0.72 + value * 0.16];
    colors.push(rgb[0], rgb[1], rgb[2], 1);
}

function writeCell(row, column, resolutionX, indices) {
    const first = row * (resolutionX + 1) + column;
    const second = first + 1;
    const third = first + resolutionX + 1;
    const fourth = third + 1;
    indices.push(first, third, second, second, third, fourth);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export { buildTopographicTerrainBuffers, createTopographicTerrainMesh };
