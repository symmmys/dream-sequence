/** Shared continuous W-freedom field and generalized chunk reachability math. */

import { norm4, subtract4 } from './spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const AXES = ['x', 'y', 'z', 'w'];
const EPSILON = 1e-9;

/**
 * Resolves an anomaly's ambient-space field from its actual slice endpoints.
 * The default horizon extends beyond the complete axis-aligned anomaly region.
 */
function resolveAnomalyInfluence(anomaly, sourceAmbient, destinationAmbient, sourceNormal = null) {
    validatePosition4(sourceAmbient, 'Source ambient position');
    validatePosition4(destinationAmbient, 'Destination ambient position');
    const influence = anomaly.influence ?? {};
    const centerMode = influence.centerMode ?? (influence.center ? 'fixed' : 'endpoints');
    const center = centerMode === 'fixed' && influence.center
        ? { ...validatePosition4(influence.center, 'Influence center') } : {
        x: (sourceAmbient.x + destinationAmbient.x) / 2,
        y: (sourceAmbient.y + destinationAmbient.y) / 2,
        z: (sourceAmbient.z + destinationAmbient.z) / 2,
        w: (sourceAmbient.w + destinationAmbient.w) / 2
    };
    const endpointDelta = subtract4(destinationAmbient, sourceAmbient);
    const span = norm4(endpointDelta);
    // The W reach budget measures separation normal to the source slice, not
    // incidental XYZ displacement between the two portal mouths.
    const wSpan = sourceNormal
        ? Math.abs(sourceNormal.x * endpointDelta.x + sourceNormal.y * endpointDelta.y +
            sourceNormal.z * endpointDelta.z + sourceNormal.w * endpointDelta.w)
        : Math.abs(endpointDelta.w);
    const regionRadius = getRegionBoundingRadius(anomaly.region, center);
    const innerRadius = influence.innerRadius ?? clamp(span * 0.06, 1.5, 4);
    const horizonRadius = influence.horizonRadius ?? Math.max(
        regionRadius + Math.max(12, Math.min(24, span * 0.25)),
        innerRadius + 1
    );
    const defaultWReach = sourceNormal ? wSpan : (wSpan > EPSILON ? wSpan : span);
    const maxWReach = influence.maxWReach ?? defaultWReach;
    const maxWMovementScale = influence.maxWMovementScale ?? 1;

    validateRadius(innerRadius, 'Anomaly inner influence radius');
    validateRadius(horizonRadius, 'Anomaly horizon radius');
    if (horizonRadius <= innerRadius) {
        throw new RangeError('Anomaly horizon radius must exceed its inner influence radius.');
    }
    if (!Number.isFinite(maxWReach) || maxWReach <= 0) {
        throw new RangeError('Anomaly maximum W reach must be a positive finite number.');
    }
    if (!Number.isFinite(maxWMovementScale) || maxWMovementScale < 0 || maxWMovementScale > 1) {
        throw new RangeError('Anomaly W movement scale must be between zero and one.');
    }

    return {
        ...anomaly,
        influence: {
            center,
            horizonRadius,
            innerRadius,
            maxWReach,
            maxWMovementScale,
            freedomMultiplier: influence.freedomMultiplier ?? 1,
            reachMultiplier: influence.reachMultiplier ?? 1,
            centerMode
        }
    };
}

/** Evaluates the ambient 4D smootherstep field at one point. */
function evaluateAnomalyInfluence(anomaly, position4D, options = {}) {
    validatePosition4(position4D, 'Influence evaluation position');
    const influence = anomaly?.influence;
    if (!influence?.center || !Number.isFinite(influence.horizonRadius) ||
        !Number.isFinite(influence.innerRadius) || !Number.isFinite(influence.maxWReach)) {
        return {
            distance: Infinity,
            normalized: 0,
            freedom: 0,
            wReach: 0,
            wMovementScale: 0,
            insideHorizon: false,
            insideInnerRegion: false
        };
    }

    const distance = norm4(subtract4(position4D, influence.center));
    const normalized = clamp(
        (influence.horizonRadius - distance) /
            (influence.horizonRadius - influence.innerRadius),
        0,
        1
    );
    const configuredFreedom = clamp(influence.freedomMultiplier ?? 1, 0, 1);
    const configuredReach = clamp(influence.reachMultiplier ?? 1, 0, 1);
    const freedom = smootherstep(normalized) * configuredFreedom *
        clamp(options.freedomMultiplier ?? 1, 0, 1);
    const reachMultiplier = configuredReach * clamp(options.reachMultiplier ?? 1, 0, 1);
    const wReach = influence.maxWReach * freedom * reachMultiplier;
    const wMovementScale = influence.maxWMovementScale * freedom;

    return {
        distance,
        normalized,
        freedom,
        wReach,
        wMovementScale,
        insideHorizon: distance < influence.horizonRadius,
        insideInnerRegion: distance <= influence.innerRadius
    };
}

/**
 * Generic reachability predicate. Spatial and W dimensions remain independent
 * inputs so additional metric dimensions can be added without rewriting callers.
 */
function evaluateChunkReachability(parameters = {}) {
    const spatialDistance = requireNonNegative(parameters.spatialDistance, 'Spatial distance');
    const spatialReach = requireNonNegative(parameters.spatialReach, 'Spatial reach');
    const wDistance = requireNonNegative(parameters.wDistance ?? 0, 'W distance');
    const wReach = requireNonNegative(parameters.wReach ?? 0, 'W reach');
    const spatialReachable = spatialDistance <= spatialReach + EPSILON;
    const wReachable = wDistance <= wReach + EPSILON;
    return {
        reachable: spatialReachable && wReachable,
        spatialReachable,
        wReachable,
        spatialDistance,
        spatialReach,
        wDistance,
        wReach
    };
}

function getRegionBoundingRadius(region, center) {
    if (!region?.min || !region?.max) return 0;
    let maximum = 0;
    for (let mask = 0; mask < 16; mask++) {
        const corner = {};
        for (let index = 0; index < AXES.length; index++) {
            const axis = AXES[index];
            corner[axis] = mask & (1 << index) ? region.max[axis] : region.min[axis];
        }
        maximum = Math.max(maximum, norm4(subtract4(corner, center)));
    }
    return maximum;
}

function smootherstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function validatePosition4(value, label) {
    if (!value || !AXES.every((axis) => Number.isFinite(value[axis]))) {
        throw new TypeError(`${label} must contain finite x/y/z/w coordinates.`);
    }
    return value;
}

function validateRadius(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite.`);
}

function requireNonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be non-negative and finite.`);
    return value;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export {
    evaluateAnomalyInfluence,
    evaluateChunkReachability,
    resolveAnomalyInfluence,
    smootherstep
};
