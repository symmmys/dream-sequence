/** Typed, serializable anomaly definitions sharing one explicit topology contract. */

import { createPosition3 } from './spatial-4d.js';
import { createAnomalyOptics } from './optical-contracts.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createSpatialCorridor } from './spatial-corridor.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const SPATIAL_ANOMALY_SCHEMA_VERSION = 1;
const SLICE_TRANSITION_ANOMALY = 'slice-transition';
const BEZIER_CORRIDOR_ANOMALY = 'bezier';
const BOUNDS_AXES = ['x', 'y', 'z', 'w'];
const POSITION_AXES = ['x', 'y', 'z', 'w'];

/**
 * Creates the default slice-transition anomaly. Existing definitions containing
 * a Bezier centreline remain readable as legacy corridors.
 */
function createSpatialAnomaly(options = {}) {
    const type = options.type ?? (Array.isArray(options.centerline)
        ? BEZIER_CORRIDOR_ANOMALY
        : SLICE_TRANSITION_ANOMALY);
    if (type === BEZIER_CORRIDOR_ANOMALY) {
        return createSpatialCorridor({ ...options, type: BEZIER_CORRIDOR_ANOMALY });
    }
    if (type === SLICE_TRANSITION_ANOMALY) return createSliceTransitionAnomaly(options);
    throw new RangeError(`Unsupported spatial anomaly type: ${type}`);
}

function createSliceTransitionAnomaly(options = {}) {
    const schemaVersion = options.schemaVersion ?? SPATIAL_ANOMALY_SCHEMA_VERSION;
    if (schemaVersion !== SPATIAL_ANOMALY_SCHEMA_VERSION) {
        throw new RangeError(`Unsupported spatial anomaly schema version: ${schemaVersion}`);
    }

    const anomaly = {
        schemaVersion,
        id: requireId(options.id, 'Spatial anomaly id'),
        type: SLICE_TRANSITION_ANOMALY,
        revision: options.revision ?? 1,
        source: createEndpoint(options.source, 'source'),
        destination: createEndpoint(options.destination, 'destination'),
        region: createRegion(options.region),
        influence: createInfluence(options.influence),
        optics: createAnomalyOptics(options.optics),
        view: createAnomalyViewConfig(options.view),
        entryRadius: options.entryRadius ?? 3.4,
        visible: options.visible ?? true,
        traversable: options.traversable ?? false,
        bidirectional: options.bidirectional ?? true
    };

    if (!Number.isSafeInteger(anomaly.revision) || anomaly.revision < 1) {
        throw new RangeError('Anomaly revision must be a positive safe integer.');
    }
    if (!Number.isFinite(anomaly.entryRadius) || anomaly.entryRadius <= 0) {
        throw new RangeError('Anomaly entryRadius must be a positive finite number.');
    }
    for (const field of ['visible', 'traversable', 'bidirectional']) {
        if (typeof anomaly[field] !== 'boolean') {
            throw new TypeError(`Anomaly ${field} must be boolean.`);
        }
    }
    return anomaly;
}


function createAnomalyViewConfig(options = {}) {
    const result = {
        enabled: options.enabled ?? true,
        mapping: options.mapping ?? 'endpoint-frame',
        apertureShape: options.apertureShape ?? 'circle',
        previewSurface: options.previewSurface ?? 'flat',
        showRim: options.showRim ?? false,
        crossSection: options.crossSection ?? 'constant',
        interiorBoundary: options.interiorBoundary ?? 'none',
        centerNormalOffset: options.centerNormalOffset ?? null,
        destinationSphereStartScale: options.destinationSphereStartScale ?? 0.08,
        destinationSphereGrowthExponent: options.destinationSphereGrowthExponent ?? 0.55
    };
    if (typeof result.enabled !== 'boolean') {
        throw new TypeError('Anomaly view enabled must be boolean.');
    }
    if (!['endpoint-frame', 'static'].includes(result.mapping)) {
        throw new RangeError(`Unsupported anomaly view mapping: ${result.mapping}`);
    }
    if (!['circle', 'ellipse', 'rectangle'].includes(result.apertureShape)) {
        throw new RangeError(`Unsupported anomaly aperture shape: ${result.apertureShape}`);
    }
    if (!['flat', 'spherical'].includes(result.previewSurface)) {
        throw new RangeError(`Unsupported anomaly preview surface: ${result.previewSurface}`);
    }
    if (result.previewSurface === 'spherical' && result.apertureShape === 'rectangle') {
        throw new RangeError('A spherical anomaly preview surface requires a circular or elliptical aperture.');
    }
    if (typeof result.showRim !== 'boolean') {
        throw new TypeError('Anomaly view showRim must be boolean.');
    }
    if (!['constant', 'euclidean-4d-ball'].includes(result.crossSection)) {
        throw new RangeError(`Unsupported anomaly aperture cross-section: ${result.crossSection}`);
    }
    if (!['none', 'open-4d-hypercube', 'open-4d-cylinder'].includes(result.interiorBoundary)) {
        throw new RangeError(`Unsupported anomaly interior boundary: ${result.interiorBoundary}`);
    }
    // Preserve Phase 17I dual-mouth presentation settings through anomaly
    // normalization and persistence. These values are presentation metadata,
    // not part of the canonical 4D traversal geometry.
    if (options.passagePresentation !== undefined) {
        if (!options.passagePresentation || typeof options.passagePresentation !== 'object' || Array.isArray(options.passagePresentation)) {
            throw new TypeError('Anomaly passagePresentation must be an object.');
        }
        let serialized;
        try { serialized = JSON.stringify(options.passagePresentation); }
        catch { throw new TypeError('Anomaly passagePresentation must be JSON-serializable.'); }
        if (serialized === undefined) throw new TypeError('Anomaly passagePresentation must be JSON-serializable.');
        result.passagePresentation = JSON.parse(serialized);
    }
    if (options.interiorBoundaryRadii !== undefined) {
        const radii = options.interiorBoundaryRadii;
        if (!radii || !Number.isFinite(radii.source) || radii.source <= 0 ||
            !Number.isFinite(radii.destination) || radii.destination <= 0 ||
            radii.source > 1000 || radii.destination > 1000) {
            throw new RangeError('Anomaly interior boundary radii must be positive finite values no greater than 1000.');
        }
        result.interiorBoundaryRadii = { source: radii.source, destination: radii.destination };
    }
    if (result.interiorBoundary === 'open-4d-cylinder' && !result.interiorBoundaryRadii) {
        throw new TypeError('An open 4D cylinder requires source and destination interior boundary radii.');
    }
    if (result.centerNormalOffset !== null && !Number.isFinite(result.centerNormalOffset)) {
        throw new TypeError('Anomaly view centerNormalOffset must be finite or null.');
    }
    if (!Number.isFinite(result.destinationSphereStartScale) ||
        result.destinationSphereStartScale <= 0 || result.destinationSphereStartScale > 1) {
        throw new RangeError('Anomaly destinationSphereStartScale must be greater than 0 and at most 1.');
    }
    if (!Number.isFinite(result.destinationSphereGrowthExponent) ||
        result.destinationSphereGrowthExponent <= 0 || result.destinationSphereGrowthExponent > 1) {
        throw new RangeError('Anomaly destinationSphereGrowthExponent must be greater than 0 and at most 1.');
    }
    return result;
}

function createEndpoint(endpoint, label) {
    if (!endpoint) throw new TypeError(`Anomaly ${label} endpoint is required.`);
    const result = {
        sliceId: requireId(endpoint.sliceId, `${label} slice id`),
        position: createPosition3(endpoint.position)
    };
    if (endpoint.orientation !== undefined) {
        const q = endpoint.orientation;
        if (!q || !['x', 'y', 'z', 'w'].every(axis => Number.isFinite(q[axis]))) {
            throw new TypeError(`Anomaly ${label} orientation requires finite quaternion x/y/z/w values.`);
        }
        const length = Math.hypot(q.x, q.y, q.z, q.w);
        if (length < 1e-12) throw new RangeError(`Anomaly ${label} orientation cannot be a zero quaternion.`);
        result.orientation = { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
    }
    return result;
}

function createRegion(region) {
    if (!region?.min || !region?.max) {
        throw new TypeError('A slice-transition anomaly requires four-dimensional region bounds.');
    }
    const min = {};
    const max = {};
    for (const axis of BOUNDS_AXES) {
        if (!Number.isFinite(region.min[axis]) || !Number.isFinite(region.max[axis])) {
            throw new TypeError(`Anomaly region requires finite ${axis} bounds.`);
        }
        if (region.max[axis] <= region.min[axis]) {
            throw new RangeError(`Anomaly region ${axis} maximum must exceed its minimum.`);
        }
        min[axis] = region.min[axis];
        max[axis] = region.max[axis];
    }
    return { min, max };
}


function createInfluence(influence = {}) {
    const center = influence.center == null ? null : createPosition4(influence.center);
    const centerMode = influence.centerMode ?? (center ? 'fixed' : 'endpoints');
    if (!['fixed', 'endpoints'].includes(centerMode)) {
        throw new RangeError('Anomaly influence centerMode must be fixed or endpoints.');
    }
    if (centerMode === 'fixed' && !center) {
        throw new TypeError('A fixed anomaly influence center requires finite x/y/z/w coordinates.');
    }
    const result = {
        center,
        centerMode,
        horizonRadius: influence.horizonRadius ?? null,
        innerRadius: influence.innerRadius ?? null,
        maxWReach: influence.maxWReach ?? null,
        maxWMovementScale: influence.maxWMovementScale ?? 1,
        freedomMultiplier: influence.freedomMultiplier ?? 1,
        reachMultiplier: influence.reachMultiplier ?? 1
    };
    for (const key of ['horizonRadius', 'innerRadius', 'maxWReach']) {
        if (result[key] !== null && (!Number.isFinite(result[key]) || result[key] <= 0)) {
            throw new RangeError(`Anomaly influence ${key} must be positive and finite.`);
        }
    }
    if (result.horizonRadius !== null && result.innerRadius !== null &&
        result.horizonRadius <= result.innerRadius) {
        throw new RangeError('Anomaly horizon radius must exceed its inner radius.');
    }
    if (!Number.isFinite(result.maxWMovementScale) ||
        result.maxWMovementScale < 0 || result.maxWMovementScale > 1) {
        throw new RangeError('Anomaly W movement scale must be between zero and one.');
    }
    for (const key of ['freedomMultiplier', 'reachMultiplier']) {
        if (!Number.isFinite(result[key]) || result[key] < 0 || result[key] > 1) {
            throw new RangeError(`Anomaly influence ${key} must be between zero and one.`);
        }
    }
    return result;
}

function createPosition4(position) {
    if (!position || !POSITION_AXES.every((axis) => Number.isFinite(position[axis]))) {
        throw new TypeError('Anomaly influence center requires finite x/y/z/w coordinates.');
    }
    return { x: position.x, y: position.y, z: position.z, w: position.w };
}

function containsAmbientPoint(region, point, tolerance = 1e-7) {
    return BOUNDS_AXES.every(function inside(axis) {
        return point[axis] >= region.min[axis] - tolerance &&
            point[axis] <= region.max[axis] + tolerance;
    });
}

function requireId(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string.`);
    }
    return value.trim();
}

export {
    BEZIER_CORRIDOR_ANOMALY,
    SLICE_TRANSITION_ANOMALY,
    SPATIAL_ANOMALY_SCHEMA_VERSION,
    containsAmbientPoint,
    createAnomalyViewConfig,
    createSliceTransitionAnomaly,
    createSpatialAnomaly
};
