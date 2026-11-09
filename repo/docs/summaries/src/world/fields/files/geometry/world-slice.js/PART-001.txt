/** Versioned, serializable identity for one ordinary 3D cross-section. */

import {
    createCanonicalSliceFrame,
    createSliceFrame
} from './spatial-4d.js';

const WORLD_SLICE_SCHEMA_VERSION = 1;
const GEOMETRY_TYPES = new Set([
    'euclidean',
    'poincare',
    'spherical',
    'inverted-poincare'
]);

function createWorldSlice(options = {}) {
    const schemaVersion = options.schemaVersion ?? WORLD_SLICE_SCHEMA_VERSION;
    if (schemaVersion !== WORLD_SLICE_SCHEMA_VERSION) {
        throw new RangeError(`Unsupported WorldSlice schema version: ${schemaVersion}`);
    }

    const id = requireId(options.id, 'WorldSlice id');
    const w = options.w ?? 0;
    if (!Number.isFinite(w)) throw new TypeError('WorldSlice w must be finite.');

    const frame = options.frame
        ? createSliceFrame(options.frame)
        : createCanonicalSliceFrame(w);
    if (
        options.frame &&
        options.w !== undefined &&
        Math.abs(frame.origin.w - w) > 1e-9
    ) {
        throw new RangeError('WorldSlice w must match the supplied frame origin.');
    }
    const geometry = options.geometry ?? 'euclidean';
    if (!GEOMETRY_TYPES.has(geometry)) {
        throw new RangeError(`Unsupported slice geometry: ${geometry}`);
    }

    const seed = options.seed ?? 0;
    if (!(typeof seed === 'string' || Number.isSafeInteger(seed))) {
        throw new TypeError('WorldSlice seed must be a string or safe integer.');
    }

    const revision = options.revision ?? 1;
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new RangeError('WorldSlice revision must be a positive safe integer.');
    }

    return {
        schemaVersion,
        id,
        w: frame.origin.w,
        frame,
        geometry,
        seed,
        revision
    };
}

function createSliceAddress(sliceId, chunkX, chunkZ) {
    const id = requireId(sliceId, 'Slice address id');
    assertChunkCoordinate(chunkX, 'chunkX');
    assertChunkCoordinate(chunkZ, 'chunkZ');
    return { schemaVersion: 1, sliceId: id, chunkX, chunkZ };
}

function getSliceAddressKey(address) {
    if (!address || (address.schemaVersion !== undefined && address.schemaVersion !== 1)) {
        throw new RangeError('Unsupported slice address schema version.');
    }
    const normalized = createSliceAddress(
        address.sliceId,
        address.chunkX,
        address.chunkZ
    );
    return JSON.stringify([
        normalized.sliceId,
        normalized.chunkX,
        normalized.chunkZ
    ]);
}

function requireId(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value.trim();
}

function assertChunkCoordinate(value, label) {
    if (!Number.isSafeInteger(value)) {
        throw new TypeError(`${label} must be a safe integer.`);
    }
}

export {
    WORLD_SLICE_SCHEMA_VERSION,
    createSliceAddress,
    createWorldSlice,
    getSliceAddressKey
};
