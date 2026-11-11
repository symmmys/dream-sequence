/** Engine-independent spotlight source state and anomaly-transport adapter. */

import { ambientToSlice, dot4, sliceToAmbient } from './spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createOpticalRayState } from './optical-ray-integrator.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createSliceOpticalField } from './optical-slice-tracer.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const DEFAULTS = Object.freeze({
    color: [1, 0.78, 0.48],
    intensity: 1.8,
    range: 64,
    coneAngle: 0.52,
    exponent: 3,
    enabled: true,
    castsShadows: true
});

function createOpticalSpotlightSource(options = {}) {
    const id = requireString(options.id, 'Spotlight id');
    const sliceId = requireString(options.sliceId, 'Spotlight sliceId');
    const position = normalizePosition3(options.position);
    const direction = normalizeDirection3(options.direction);
    const color = normalizeColor(options.color ?? DEFAULTS.color);
    const intensity = finitePositive(options.intensity ?? DEFAULTS.intensity, 'Spotlight intensity', true);
    const range = finitePositive(options.range ?? DEFAULTS.range, 'Spotlight range');
    const coneAngle = options.coneAngle ?? DEFAULTS.coneAngle;
    if (!Number.isFinite(coneAngle) || coneAngle <= 0 || coneAngle >= Math.PI) {
        throw new RangeError('Spotlight coneAngle must be between zero and PI radians.');
    }
    const exponent = options.exponent ?? DEFAULTS.exponent;
    if (!Number.isFinite(exponent) || exponent < 0 || exponent > 128) {
        throw new RangeError('Spotlight exponent must be between zero and 128.');
    }
    const enabled = options.enabled ?? DEFAULTS.enabled;
    const castsShadows = options.castsShadows ?? DEFAULTS.castsShadows;
    if (typeof enabled !== 'boolean' || typeof castsShadows !== 'boolean') {
        throw new TypeError('Spotlight enabled and castsShadows flags must be boolean.');
    }
    return {
        id, sliceId, position, direction, color,
        intensity, range, coneAngle, exponent, enabled, castsShadows
    };
}

function moveOpticalSpotlightSource(source, delta) {
    const current = requireSource(source);
    const offset = normalizePosition3(delta, 'Spotlight movement');
    return createOpticalSpotlightSource({
        ...current,
        position: {
            x: current.position.x + offset.x,
            y: current.position.y + offset.y,
            z: current.position.z + offset.z
        }
    });
}

function rotateOpticalSpotlightSource(source, yawDelta = 0, pitchDelta = 0) {
    const current = requireSource(source);
    if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) {
        throw new TypeError('Spotlight yaw and pitch deltas must be finite.');
    }
    const yaw = Math.atan2(current.direction.x, current.direction.z) + yawDelta;
    const pitch = clamp(
        Math.asin(clamp(current.direction.y, -1, 1)) + pitchDelta,
        -Math.PI * 0.48,
        Math.PI * 0.48
    );
    const horizontal = Math.cos(pitch);
    return createOpticalSpotlightSource({
        ...current,
        direction: {
            x: Math.sin(yaw) * horizontal,
            y: Math.sin(pitch),
            z: Math.cos(yaw) * horizontal
        }
    });
}

function aimOpticalSpotlightSource(source, target) {
    const current = requireSource(source);
    const point = normalizePosition3(target, 'Spotlight target');
    return createOpticalSpotlightSource({
        ...current,
        direction: {
            x: point.x - current.position.x,
            y: point.y - current.position.y,
            z: point.z - current.position.z
        }
    });
}

/** Trace the deterministic centre ray and derive its destination-slice virtual source. */
function traceOpticalSpotlightSource({
    source,
    sourceBinding,
    destinationBinding,
    tracer,
    anomalyId,
    virtualSourceDistance = 0.5,
    traceOptions = {}
} = {}) {
    const validated = requireSource(source);
    if (!sourceBinding?.slice?.frame || sourceBinding.slice.id !== validated.sliceId) {
        throw new TypeError('Spotlight source binding must match its registered source slice.');
    }
    if (!destinationBinding?.slice?.frame || !destinationBinding.spatialTransform) {
        throw new TypeError('Spotlight destination binding requires a slice and SpatialTransform.');
    }
    if (!tracer || typeof tracer.trace !== 'function') {
        throw new TypeError('Spotlight transport requires an anomaly optical tracer.');
    }
    requireString(anomalyId, 'Spotlight anomalyId');
    finitePositive(virtualSourceDistance, 'Virtual source distance');

    const position4 = sliceToAmbient(sourceBinding.slice.frame, validated.position);
    const momentum4 = liftDirection(sourceBinding.slice.frame, validated.direction);
    const initialRay = createOpticalRayState({
        position: position4,
        momentum: momentum4,
        intensity: 1
    });
    const result = tracer.trace(initialRay, {
        sliceId: validated.sliceId,
        maxTransitions: 1,
        stopAfterAnomalyExit: true,
        sliceTraceOptions: {
            maxPathLength: validated.range,
            initialStepSize: 0.025,
            maxStepSize: 0.12,
            maxSteps: 6000,
            ...(traceOptions.sliceTraceOptions ?? {})
        },
        anomalyTraceOptions: {
            maxPathLength: validated.range * 1.5,
            initialStepSize: 0.025,
            maxStepSize: 0.12,
            maxSteps: 12000,
            ...(traceOptions.anomalyTraceOptions ?? {})
        },
        ...(traceOptions.tracerOptions ?? {})
    });

    const anomalySegment = result.pathSegments.find((segment) =>
        segment.kind === 'anomaly' && segment.anomalyId === anomalyId &&
        segment.result.event?.kind === 'anomaly-exit' &&
        segment.result.event.sliceId === destinationBinding.slice.id
    );
    const destinationSegment = result.pathSegments.find((segment) =>
        segment.kind === 'slice' && segment.sliceId === destinationBinding.slice.id
    );
    const exitSample = destinationSegment?.result?.samples?.[0] ?? (
        result.event?.kind === 'anomaly-exit' && result.event.sliceId === destinationBinding.slice.id
            ? { position: result.finalState.position, momentum: result.finalState.momentum }
            : null
    );
    if (!anomalySegment || !exitSample) {
        return {
            transmitted: false,
            reason: result.event?.kind ?? result.status ?? 'no-authorized-anomaly-exit',
            sourceId: validated.id,
            anomalyId,
            trace: result,
            diagnostics: result.diagnostics
        };
    }

    const exitPosition = exitSample.position;
    const exitMomentum = exitSample.momentum;
    const destinationFrame = destinationBinding.slice.frame;
    const exitLocal = ambientToSlice(destinationFrame, exitPosition).position;
    const localCovector = destinationFrame.axes.map((axis) => dot4(axis, exitMomentum));
    const metricField = createSliceOpticalField(
        destinationBinding.slice,
        destinationBinding.spatialTransform
    );
    const cometric = metricField.sample(exitPosition).tangentCometric;
    const velocity = multiplyMatrix3Vector(cometric, localCovector);
    const direction = normalizeDirection3({ x: velocity[0], y: velocity[1], z: velocity[2] });
    const virtualPosition = {
        x: exitLocal.x - direction.x * virtualSourceDistance,
        y: exitLocal.y - direction.y * virtualSourceDistance,
        z: exitLocal.z - direction.z * virtualSourceDistance
    };
    const energy = clamp(result.finalState.intensity, 0, 1);

    return {
        transmitted: energy > 1e-6,
        reason: energy > 1e-6 ? null : 'fully-attenuated',
        sourceId: validated.id,
        anomalyId,
        destinationSliceId: destinationBinding.slice.id,
        exitPosition4: { ...exitPosition },
        exitPosition: { ...exitLocal },
        direction,
        virtualPosition,
        energy,
        trace: result,
        diagnostics: {
            ...result.diagnostics,
            outgoingTransitions: result.transitions.filter((entry) => entry.direction === 'out-of-anomaly').length,
            exitHamiltonian: exitSample.hamiltonian ?? null,
            virtualSourceDistance
        }
    };
}


/** Project the first receiving-slice segment of a successfully transmitted spotlight ray. */
function projectOpticalSpotlightExitRay(result, spatialTransform, length = 400) {
    if (!result?.transmitted || !result.exitPosition || !result.direction) return null;
    if (typeof spatialTransform?.worldToRender !== 'function') {
        throw new TypeError('Spotlight exit-ray projection requires a SpatialTransform.');
    }
    finitePositive(length, 'Spotlight debug-ray length');
    const startWorld = normalizePosition3(result.exitPosition, 'Spotlight exit position');
    const direction = normalizeDirection3(result.direction);
    const endWorld = {
        x: startWorld.x + direction.x * length,
        y: startWorld.y + direction.y * length,
        z: startWorld.z + direction.z * length
    };
    const startRender = spatialTransform.worldToRender(startWorld);
    const endRender = spatialTransform.worldToRender(endWorld);
    for (const [label, point] of [['start', startRender], ['end', endRender]]) {
        if (!point || !['x', 'y', 'z'].every((axis) => Number.isFinite(point[axis]))) {
            throw new RangeError(`Spotlight ${label} ray projection must be finite.`);
        }
    }
    return { startWorld, endWorld, startRender, endRender, length };
}

function liftDirection(frame, direction) {
    return frame.axes.reduce((result, axis, index) => {
        const amount = direction[['x', 'y', 'z'][index]];
        result.x += axis.x * amount;
        result.y += axis.y * amount;
        result.z += axis.z * amount;
        result.w += axis.w * amount;
        return result;
    }, { x: 0, y: 0, z: 0, w: 0 });
}

function multiplyMatrix3Vector(matrix, vector) {
    return [
        matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
        matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
        matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
    ];
}

function normalizeDirection3(value) {
    const vector = normalizePosition3(value, 'Spotlight direction');
    const length = Math.hypot(vector.x, vector.y, vector.z);
    if (length <= 1e-10) throw new RangeError('Spotlight direction must be non-zero.');
    return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function normalizePosition3(value, label = 'Spotlight position') {
    if (!value || !['x', 'y', 'z'].every((axis) => Number.isFinite(value[axis]))) {
        throw new TypeError(`${label} must contain finite x, y, and z coordinates.`);
    }
    return { x: value.x, y: value.y, z: value.z };
}

function normalizeColor(value) {
    if (!Array.isArray(value) || value.length !== 3 ||
        value.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
        throw new RangeError('Spotlight color must be an RGB array with channels between zero and one.');
    }
    return [...value];
}

function finitePositive(value, label, allowZero = false) {
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
        throw new RangeError(`${label} must be ${allowZero ? 'non-negative' : 'positive'} and finite.`);
    }
    return value;
}

function requireString(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value;
}

function requireSource(source) {
    if (!source || typeof source !== 'object') throw new TypeError('A spotlight source is required.');
    return createOpticalSpotlightSource(source);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export {
    aimOpticalSpotlightSource,
    createOpticalSpotlightSource,
    moveOpticalSpotlightSource,
    projectOpticalSpotlightExitRay,
    rotateOpticalSpotlightSource,
    traceOpticalSpotlightSource
};
