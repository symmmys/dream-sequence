/**
 * Slice-aware CPU optical scene registry.
 *
 * Geometry is retained in authoritative slice-local coordinates, before any
 * Babylon/render projection. Static triangle surfaces receive per-registration
 * BVHs; streamed heightfields use analytic height sampling.
 */

import { createOpticalMaterial } from './optical-contracts.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createSliceAddress, getSliceAddressKey } from './world-slice.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const AXES = ['x', 'y', 'z'];
const DEFAULT_LEAF_SIZE = 8;
const EPSILON = 1e-10;

class OpticalSceneRegistry {
    constructor(options = {}) {
        this.leafSize = options.leafSize ?? DEFAULT_LEAF_SIZE;
        if (!Number.isSafeInteger(this.leafSize) || this.leafSize < 1 || this.leafSize > 128) {
            throw new RangeError('Optical BVH leaf size must be an integer from 1 through 128.');
        }
        this.triangleMeshes = new Map();
        this.heightfields = new Map();
        this.disposed = false;
        this.statistics = {
            registeredTriangleMeshes: 0,
            registeredHeightfields: 0,
            triangleCount: 0,
            queries: 0,
            bvhNodesVisited: 0,
            trianglesTested: 0,
            heightfieldSamples: 0,
            hits: 0
        };
    }

    registerTriangleMesh(options = {}) {
        this.assertActive();
        const id = requireId(options.id, 'Optical mesh id');
        const sliceId = requireId(options.sliceId, 'Optical mesh sliceId');
        const geometry = validateTriangleGeometry(options.positions, options.indices);
        const chunkAddress = normalizeChunkAddress(options.chunkAddress, sliceId);
        const material = normalizeMaterial(options.material, id);
        const revision = requireRevision(options.revision);
        const enabled = options.enabled ?? true;
        if (typeof enabled !== 'boolean') throw new TypeError('Optical mesh enabled must be boolean.');

        this.unregister(id);
        const triangles = buildTriangles(geometry.positions, geometry.indices);
        const root = triangles.length ? buildBvh(triangles, this.leafSize) : null;
        const entry = {
            id, sliceId, chunkAddress, chunkKey: chunkAddress ? getSliceAddressKey(chunkAddress) : null,
            revision, enabled, material, root, triangleCount: triangles.length,
            sourceVertexCount: geometry.positions.length / 3
        };
        this.triangleMeshes.set(id, entry);
        this.statistics.registeredTriangleMeshes = this.triangleMeshes.size;
        this.statistics.triangleCount = countTriangles(this.triangleMeshes);
        return describeEntry(entry);
    }

    registerHeightfield(options = {}) {
        this.assertActive();
        const id = requireId(options.id, 'Optical heightfield id');
        const sliceId = requireId(options.sliceId, 'Optical heightfield sliceId');
        const terrain = options.terrain;
        if (!terrain || typeof terrain.sampleHeight !== 'function' ||
            !Number.isSafeInteger(terrain.width) || terrain.width < 2 ||
            !Number.isSafeInteger(terrain.height) || terrain.height < 2) {
            throw new TypeError('Optical heightfield requires a sampled terrain with width and height.');
        }
        const bounds = normalizeHeightfieldBounds(options.bounds);
        const chunkAddress = normalizeChunkAddress(options.chunkAddress, sliceId);
        const material = normalizeMaterial(options.material, id);
        const revision = requireRevision(options.revision);
        const enabled = options.enabled ?? true;
        if (typeof enabled !== 'boolean') throw new TypeError('Optical heightfield enabled must be boolean.');

        this.unregister(id);
        const entry = {
            id, sliceId, terrain, bounds, chunkAddress,
            chunkKey: chunkAddress ? getSliceAddressKey(chunkAddress) : null,
            material, revision, enabled,
            kind: 'heightfield'
        };
        this.heightfields.set(id, entry);
        this.statistics.registeredHeightfields = this.heightfields.size;
        return describeEntry(entry);
    }

    unregister(id) {
        this.assertActive();
        const removedMesh = this.triangleMeshes.delete(id);
        const removedHeightfield = this.heightfields.delete(id);
        this.statistics.registeredTriangleMeshes = this.triangleMeshes.size;
        this.statistics.registeredHeightfields = this.heightfields.size;
        this.statistics.triangleCount = countTriangles(this.triangleMeshes);
        return removedMesh || removedHeightfield;
    }

    intersectSegment(sliceId, from, to, options = {}) {
        this.assertActive();
        const normalizedSliceId = requireId(sliceId, 'Optical query sliceId');
        validatePosition3(from, 'Optical segment start');
        validatePosition3(to, 'Optical segment end');
        const segment = createSegment(from, to);
        if (segment.length <= EPSILON) return null;

        const allowedChunks = options.allowedChunkAddresses
            ? new Set(options.allowedChunkAddresses.map((address) => getSliceAddressKey(address)))
            : null;
        const minimumParameter = options.minimumParameter ?? 1e-7;
        if (!Number.isFinite(minimumParameter) || minimumParameter < 0 || minimumParameter >= 1) {
            throw new RangeError('Optical segment minimumParameter must be in [0, 1).');
        }

        this.statistics.queries++;
        let best = null;
        const counters = { bvhNodesVisited: 0, trianglesTested: 0, heightfieldSamples: 0 };

        for (const entry of this.triangleMeshes.values()) {
            if (!entry.enabled || !entry.material.enabled || entry.sliceId !== normalizedSliceId ||
                !entry.root || !isAllowedChunk(entry.chunkKey, allowedChunks)) continue;
            const candidate = intersectBvh(entry.root, segment, minimumParameter, best?.parameter ?? 1, counters);
            if (candidate && isBetterHit(candidate, best, entry.id)) {
                best = makeHit(entry, candidate, segment, 'triangle');
            }
        }

        for (const entry of this.heightfields.values()) {
            if (!entry.enabled || !entry.material.enabled || entry.sliceId !== normalizedSliceId ||
                !isAllowedChunk(entry.chunkKey, allowedChunks)) continue;
            const candidate = intersectHeightfield(entry, segment, minimumParameter, best?.parameter ?? 1, counters);
            if (candidate && isBetterHit(candidate, best, entry.id)) {
                best = makeHit(entry, candidate, segment, 'heightfield');
            }
        }

        this.statistics.bvhNodesVisited += counters.bvhNodesVisited;
        this.statistics.trianglesTested += counters.trianglesTested;
        this.statistics.heightfieldSamples += counters.heightfieldSamples;
        if (best) this.statistics.hits++;
        return best;
    }

    getStats() {
        this.assertActive();
        return {
            ...this.statistics,
            registeredTriangleMeshes: this.triangleMeshes.size,
            registeredHeightfields: this.heightfields.size,
            triangleCount: countTriangles(this.triangleMeshes),
            slices: [...new Set([
                ...[...this.triangleMeshes.values()].map((entry) => entry.sliceId),
                ...[...this.heightfields.values()].map((entry) => entry.sliceId)
            ])].sort()
        };
    }

    assertActive() {
        if (this.disposed) throw new Error('OpticalSceneRegistry has been disposed.');
    }

    dispose() {
        if (this.disposed) return;
        this.triangleMeshes.clear();
        this.heightfields.clear();
        this.disposed = true;
        this.statistics.registeredTriangleMeshes = 0;
        this.statistics.registeredHeightfields = 0;
        this.statistics.triangleCount = 0;
    }
}

function validateTriangleGeometry(positions, indices) {
    if (!ArrayBuffer.isView(positions) && !Array.isArray(positions)) {
        throw new TypeError('Optical mesh positions must be an array or typed array.');
    }
    if (positions.length === 0 || positions.length % 3 !== 0) {
        throw new RangeError('Optical mesh positions must contain complete XYZ vertices.');
    }
    if (!ArrayBuffer.isView(indices) && !Array.isArray(indices)) {
        throw new TypeError('Optical mesh indices must be an array or typed array.');
    }
    if (indices.length === 0 || indices.length % 3 !== 0) {
        throw new RangeError('Optical mesh indices must contain complete triangles.');
    }
    const positionCopy = Array.from(positions, Number);
    const indexCopy = Array.from(indices, Number);
    if (!positionCopy.every(Number.isFinite)) throw new TypeError('Optical mesh positions must be finite.');
    const vertexCount = positionCopy.length / 3;
    for (const index of indexCopy) {
        if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
            throw new RangeError('Optical mesh index is outside the vertex buffer.');
        }
    }
    return { positions: positionCopy, indices: indexCopy };
}

function buildTriangles(positions, indices) {
    const triangles = [];
    for (let index = 0; index < indices.length; index += 3) {
        const a = readVertex(positions, indices[index]);
        const b = readVertex(positions, indices[index + 1]);
        const c = readVertex(positions, indices[index + 2]);
        const normal = cross3(subtract3(b, a), subtract3(c, a));
        const normalLength = length3(normal);
        if (normalLength <= EPSILON) continue;
        const min = componentBounds([a, b, c], 'min');
        const max = componentBounds([a, b, c], 'max');
        triangles.push({
            primitiveIndex: index / 3,
            a, b, c,
            min, max,
            centroid: scale3(add3(add3(a, b), c), 1 / 3),
            normal: scale3(normal, 1 / normalLength)
        });
    }
    return triangles;
}

function buildBvh(triangles, leafSize) {
    const bounds = componentBounds(triangles.flatMap((triangle) => [triangle.min, triangle.max]), 'bounds');
    if (triangles.length <= leafSize) return { bounds, triangles };
    const centroidBounds = componentBounds(triangles.map((triangle) => triangle.centroid), 'bounds');
    const extents = AXES.map((axis) => centroidBounds.max[axis] - centroidBounds.min[axis]);
    const axisIndex = extents.indexOf(Math.max(...extents));
    const axis = AXES[axisIndex];
    if (extents[axisIndex] <= EPSILON) return { bounds, triangles };
    triangles.sort((left, right) =>
        left.centroid[axis] - right.centroid[axis] || left.primitiveIndex - right.primitiveIndex
    );
    const middle = Math.floor(triangles.length / 2);
    return {
        bounds,
        left: buildBvh(triangles.slice(0, middle), leafSize),
        right: buildBvh(triangles.slice(middle), leafSize)
    };
}

function intersectBvh(node, segment, minParameter, maximumParameter, counters) {
    if (!intersectAabbSegment(node.bounds, segment, maximumParameter)) return null;
    counters.bvhNodesVisited++;
    if (node.triangles) {
        let best = null;
        for (const triangle of node.triangles) {
            if (!intersectAabbSegment({ min: triangle.min, max: triangle.max }, segment, best?.parameter ?? maximumParameter)) continue;
            counters.trianglesTested++;
            const parameter = intersectTriangle(segment.from, segment.direction, triangle, minParameter, best?.parameter ?? maximumParameter);
            if (parameter === null) continue;
            if (!best || parameter < best.parameter) {
                best = {
                    parameter,
                    primitiveIndex: triangle.primitiveIndex,
                    point: interpolate3(segment.from, segment.to, parameter),
                    normal: triangle.normal,
                    barycentric: triangleBarycentric(segment.from, segment.direction, triangle, parameter)
                };
            }
        }
        return best;
    }
    const left = intersectBvh(node.left, segment, minParameter, maximumParameter, counters);
    const rightLimit = left ? Math.min(maximumParameter, left.parameter) : maximumParameter;
    const right = intersectBvh(node.right, segment, minParameter, rightLimit, counters);
    if (!left) return right;
    if (!right) return left;
    return left.parameter <= right.parameter ? left : right;
}

function intersectTriangle(origin, direction, triangle, minimumParameter, maximumParameter) {
    const edge1 = subtract3(triangle.b, triangle.a);
    const edge2 = subtract3(triangle.c, triangle.a);
    const p = cross3(direction, edge2);
    const determinant = dot3(edge1, p);
    if (Math.abs(determinant) <= EPSILON) return null;
    const inverse = 1 / determinant;
    const tVector = subtract3(origin, triangle.a);
    const u = dot3(tVector, p) * inverse;
    if (u < -EPSILON || u > 1 + EPSILON) return null;
    const q = cross3(tVector, edge1);
    const v = dot3(direction, q) * inverse;
    if (v < -EPSILON || u + v > 1 + EPSILON) return null;
    const parameter = dot3(edge2, q) * inverse;
    if (parameter <= minimumParameter || parameter > maximumParameter + EPSILON) return null;
    return parameter;
}

function triangleBarycentric(origin, direction, triangle, parameter) {
    const point = interpolate3(origin, add3(origin, direction), parameter);
    const v0 = subtract3(triangle.b, triangle.a);
    const v1 = subtract3(triangle.c, triangle.a);
    const v2 = subtract3(point, triangle.a);
    const d00 = dot3(v0, v0);
    const d01 = dot3(v0, v1);
    const d11 = dot3(v1, v1);
    const d20 = dot3(v2, v0);
    const d21 = dot3(v2, v1);
    const denominator = d00 * d11 - d01 * d01;
    if (Math.abs(denominator) <= EPSILON) return { u: 1, v: 0, w: 0 };
    const v = (d11 * d20 - d01 * d21) / denominator;
    const w = (d00 * d21 - d01 * d20) / denominator;
    return { u: 1 - v - w, v, w };
}

function intersectHeightfield(entry, segment, minimumParameter, maximumParameter, counters) {
    const range = intersectXZBounds(segment, entry.bounds, minimumParameter, maximumParameter);
    if (!range) return null;
    const span = range.max - range.min;
    if (span <= EPSILON) return null;
    const horizontalDistance = Math.hypot(segment.direction.x, segment.direction.z) * span;
    // Terrain dimensions cover the complete source heightmap, not this chunk.
    // Use the source raster's world-space sample spacing so chunk size does not
    // accidentally change the intersection sampling density.
    const cellSpacing = terrainCellSpacing(entry);
    const cell = Math.max(Math.min(cellSpacing.x, cellSpacing.z), 1e-6);
    const sampleCount = Math.min(4096, Math.max(8, Math.ceil(horizontalDistance / cell * 2)));
    let previousT = range.min;
    let previousValue = heightDifference(entry, segment, previousT, counters);
    for (let index = 1; index <= sampleCount; index++) {
        const currentT = range.min + span * index / sampleCount;
        const currentValue = heightDifference(entry, segment, currentT, counters);
        if (previousValue === null) {
            previousT = currentT;
            previousValue = currentValue;
            continue;
        }
        if (currentValue !== null && crossesSurface(previousValue, currentValue)) {
            const parameter = refineHeightfieldRoot(entry, segment, previousT, currentT, counters);
            if (parameter !== null && parameter > minimumParameter && parameter <= maximumParameter + EPSILON) {
                const point = interpolate3(segment.from, segment.to, parameter);
                return {
                    parameter,
                    primitiveIndex: null,
                    point: { x: point.x, y: entry.terrain.sampleHeight(point.x, point.z), z: point.z },
                    normal: heightfieldNormal(entry, point.x, point.z),
                    barycentric: null
                };
            }
        }
        previousT = currentT;
        previousValue = currentValue;
    }
    return null;
}

function heightDifference(entry, segment, parameter, counters) {
    const point = interpolate3(segment.from, segment.to, parameter);
    if (!insideHeightfieldBounds(entry.bounds, point.x, point.z)) return null;
    const height = entry.terrain.sampleHeight(point.x, point.z);
    counters.heightfieldSamples++;
    if (!Number.isFinite(height)) return null;
    return point.y - height;
}

function refineHeightfieldRoot(entry, segment, left, right, counters) {
    let leftValue = heightDifference(entry, segment, left, counters);
    let rightValue = heightDifference(entry, segment, right, counters);
    if (leftValue === null || rightValue === null) return null;
    if (Math.abs(leftValue) <= 1e-10) return left;
    if (Math.abs(rightValue) <= 1e-10) return right;
    if (!crossesSurface(leftValue, rightValue)) return null;
    for (let iteration = 0; iteration < 36; iteration++) {
        const middle = (left + right) / 2;
        const middleValue = heightDifference(entry, segment, middle, counters);
        if (middleValue === null) return null;
        if (Math.abs(middleValue) <= 1e-10) return middle;
        if ((leftValue < 0) === (middleValue < 0)) {
            left = middle;
            leftValue = middleValue;
        } else {
            right = middle;
            rightValue = middleValue;
        }
    }
    return (left + right) / 2;
}

function heightfieldNormal(entry, x, z) {
    const cellSpacing = terrainCellSpacing(entry);
    const epsilonX = Math.max(cellSpacing.x * 0.5, 1e-4);
    const epsilonZ = Math.max(cellSpacing.z * 0.5, 1e-4);
    const x0 = Math.max(entry.bounds.minX, x - epsilonX);
    const x1 = Math.min(entry.bounds.maxX, x + epsilonX);
    const z0 = Math.max(entry.bounds.minZ, z - epsilonZ);
    const z1 = Math.min(entry.bounds.maxZ, z + epsilonZ);
    const centerHeight = entry.terrain.sampleHeight(x, z);
    const hx0 = entry.terrain.sampleHeight(x0, z);
    const hx1 = entry.terrain.sampleHeight(x1, z);
    const hz0 = entry.terrain.sampleHeight(x, z0);
    const hz1 = entry.terrain.sampleHeight(x, z1);
    const gradientX = estimateHeightGradient(hx0, centerHeight, hx1, x0, x, x1);
    const gradientZ = estimateHeightGradient(hz0, centerHeight, hz1, z0, z, z1);
    return normalize3({ x: -gradientX, y: 1, z: -gradientZ });
}

function terrainCellSpacing(entry) {
    const terrain = entry.terrain;
    const worldWidth = terrainAxisSpan(terrain, 'x', entry.bounds.maxX - entry.bounds.minX);
    const worldDepth = terrainAxisSpan(terrain, 'z', entry.bounds.maxZ - entry.bounds.minZ);
    return {
        x: worldWidth / Math.max(1, terrain.width - 1),
        z: worldDepth / Math.max(1, terrain.height - 1)
    };
}

function terrainAxisSpan(terrain, axis, fallback) {
    const minimum = terrain.min?.[axis];
    const maximum = terrain.max?.[axis];
    if (Number.isFinite(minimum) && Number.isFinite(maximum) && maximum > minimum) {
        return maximum - minimum;
    }
    const explicitSize = axis === 'x' ? terrain.worldSizeX : terrain.worldSizeZ;
    if (Number.isFinite(explicitSize) && explicitSize > 0) return explicitSize;
    if (Number.isFinite(terrain.worldSize) && terrain.worldSize > 0) return terrain.worldSize;
    return fallback;
}

function estimateHeightGradient(low, center, high, lowCoordinate, centerCoordinate, highCoordinate) {
    if (Number.isFinite(low) && Number.isFinite(high) && highCoordinate - lowCoordinate > EPSILON) {
        return (high - low) / (highCoordinate - lowCoordinate);
    }
    if (Number.isFinite(center) && Number.isFinite(high) && highCoordinate - centerCoordinate > EPSILON) {
        return (high - center) / (highCoordinate - centerCoordinate);
    }
    if (Number.isFinite(center) && Number.isFinite(low) && centerCoordinate - lowCoordinate > EPSILON) {
        return (center - low) / (centerCoordinate - lowCoordinate);
    }
    return 0;
}

function intersectXZBounds(segment, bounds, minimum, maximum) {
    let lower = minimum;
    let upper = maximum;
    for (const axis of ['x', 'z']) {
        const min = axis === 'x' ? bounds.minX : bounds.minZ;
        const max = axis === 'x' ? bounds.maxX : bounds.maxZ;
        const origin = segment.from[axis];
        const direction = segment.direction[axis];
        if (Math.abs(direction) <= EPSILON) {
            if (origin < min || origin > max) return null;
            continue;
        }
        let first = (min - origin) / direction;
        let second = (max - origin) / direction;
        if (first > second) [first, second] = [second, first];
        lower = Math.max(lower, first);
        upper = Math.min(upper, second);
        if (lower > upper) return null;
    }
    return { min: lower, max: upper };
}

function intersectAabbSegment(bounds, segment, maximumParameter = 1) {
    let lower = 0;
    let upper = maximumParameter;
    for (const axis of AXES) {
        const origin = segment.from[axis];
        const direction = segment.direction[axis];
        if (Math.abs(direction) <= EPSILON) {
            if (origin < bounds.min[axis] - EPSILON || origin > bounds.max[axis] + EPSILON) return false;
            continue;
        }
        let first = (bounds.min[axis] - origin) / direction;
        let second = (bounds.max[axis] - origin) / direction;
        if (first > second) [first, second] = [second, first];
        lower = Math.max(lower, first);
        upper = Math.min(upper, second);
        if (lower > upper) return false;
    }
    return upper >= 0 && lower <= maximumParameter;
}

function makeHit(entry, candidate, segment, primitiveType) {
    return {
        primitiveType,
        objectId: entry.id,
        sliceId: entry.sliceId,
        chunkAddress: entry.chunkAddress ? { ...entry.chunkAddress } : null,
        geometryRevision: entry.revision,
        primitiveIndex: candidate.primitiveIndex,
        parameter: candidate.parameter,
        point: { ...candidate.point },
        normal: { ...candidate.normal },
        barycentric: candidate.barycentric ? { ...candidate.barycentric } : null,
        segmentDistance: segment.length * candidate.parameter,
        material: { ...entry.material }
    };
}

function createSegment(from, to) {
    const direction = subtract3(to, from);
    return { from: { ...from }, to: { ...to }, direction, length: length3(direction) };
}

function normalizeChunkAddress(address, sliceId) {
    if (address == null) return null;
    const normalized = createSliceAddress(address.sliceId, address.chunkX, address.chunkZ);
    if (normalized.sliceId !== sliceId) throw new RangeError('Optical chunk address must belong to its registered slice.');
    return normalized;
}

function normalizeHeightfieldBounds(bounds) {
    if (!bounds) throw new TypeError('Optical heightfield requires explicit X/Z bounds.');
    const normalized = {
        minX: bounds.minX ?? bounds.min?.x,
        maxX: bounds.maxX ?? bounds.max?.x,
        minZ: bounds.minZ ?? bounds.min?.z,
        maxZ: bounds.maxZ ?? bounds.max?.z
    };
    if (!Object.values(normalized).every(Number.isFinite) ||
        normalized.minX >= normalized.maxX || normalized.minZ >= normalized.maxZ) {
        throw new RangeError('Optical heightfield X/Z bounds must be finite and increasing.');
    }
    return normalized;
}

function normalizeMaterial(material, id) {
    if (!material) return createOpticalMaterial({ id: `optical:${id}` });
    return createOpticalMaterial(material);
}

function requireRevision(value = 1) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Optical geometry revision must be a positive safe integer.');
    return value;
}

function requireId(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function validatePosition3(value, label) {
    if (!value || !AXES.every((axis) => Number.isFinite(value[axis]))) {
        throw new TypeError(`${label} must contain finite x/y/z coordinates.`);
    }
}

function readVertex(positions, index) {
    const offset = index * 3;
    return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] };
}

function componentBounds(points, mode) {
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const point of points) {
        for (const axis of AXES) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
        }
    }
    return mode === 'min' ? min : mode === 'max' ? max : { min, max };
}

function isAllowedChunk(chunkKey, allowedChunks) {
    // Non-chunked static surfaces are slice-global and remain queryable while
    // the caller narrows streamed terrain to a set of resident chunk addresses.
    return !allowedChunks || chunkKey === null || allowedChunks.has(chunkKey);
}

function isBetterHit(candidate, current, objectId) {
    if (!current) return true;
    if (candidate.parameter < current.parameter - EPSILON) return true;
    if (Math.abs(candidate.parameter - current.parameter) <= EPSILON) {
        return `${objectId}` < `${current.objectId}`;
    }
    return false;
}

function crossesSurface(left, right) {
    return left === 0 || right === 0 || (left < 0) !== (right < 0);
}

function insideHeightfieldBounds(bounds, x, z) {
    return x >= bounds.minX - EPSILON && x <= bounds.maxX + EPSILON &&
        z >= bounds.minZ - EPSILON && z <= bounds.maxZ + EPSILON;
}

function countTriangles(meshes) {
    let count = 0;
    for (const entry of meshes.values()) count += entry.triangleCount;
    return count;
}

function describeEntry(entry) {
    return {
        id: entry.id,
        sliceId: entry.sliceId,
        chunkAddress: entry.chunkAddress ? { ...entry.chunkAddress } : null,
        revision: entry.revision,
        enabled: entry.enabled,
        kind: entry.kind ?? 'triangles',
        triangleCount: entry.triangleCount ?? 0
    };
}

function subtract3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale3(value, scale) { return { x: value.x * scale, y: value.y * scale, z: value.z * scale }; }
function cross3(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function length3(value) { return Math.hypot(value.x, value.y, value.z); }
function normalize3(value) {
    const length = length3(value);
    if (!Number.isFinite(length) || length <= EPSILON) throw new RangeError('Cannot normalize a zero-length surface normal.');
    return scale3(value, 1 / length);
}
function interpolate3(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export { OpticalSceneRegistry };
