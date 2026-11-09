/** Deterministic CPU reference integrator for Hamiltonian optical rays in R4. */

import { assertVector4 } from './spatial-4d.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

const AXES = ['x', 'y', 'z', 'w'];
const STATE_SIZE = 8;
const DEFAULTS = Object.freeze({
    maxPathLength: 10,
    initialStepSize: 0.025,
    minStepSize: 1e-7,
    maxStepSize: 0.1,
    absoluteTolerance: 1e-9,
    relativeTolerance: 1e-7,
    gradientStep: 1e-4,
    maxSteps: 4096,
    speedOfLight: 1,
    includeSamples: true,
    segmentEvent: null
});

function createOpticalRayState(options = {}) {
    assertVector4(options.position);
    assertVector4(options.momentum);
    const opticalPathLength = options.opticalPathLength ?? 0;
    const travelTime = options.travelTime ?? 0;
    const intensity = options.intensity ?? 1;
    validateNonNegative(opticalPathLength, 'Optical path length');
    validateNonNegative(travelTime, 'Ray travel time');
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
        throw new RangeError('Ray intensity must be between zero and one.');
    }
    return {
        position: copy4(options.position),
        momentum: copy4(options.momentum),
        opticalPathLength,
        travelTime,
        intensity
    };
}

/** Scales a canonical covector so its initial Hamiltonian equals targetH. */
function normalizeOpticalMomentum(field, position, momentum, targetH = 0.5) {
    requireField(field);
    assertVector4(position);
    assertVector4(momentum);
    validatePositive(targetH, 'Target optical Hamiltonian');
    const sample = field.sample(position);
    const currentH = hamiltonianFromCometric(sample.cometric, momentum);
    if (!Number.isFinite(currentH) || currentH <= 1e-15) {
        throw new RangeError('Optical ray momentum has no component in an available propagation direction.');
    }
    const scale = Math.sqrt(targetH / currentH);
    return {
        x: momentum.x * scale,
        y: momentum.y * scale,
        z: momentum.z * scale,
        w: momentum.w * scale
    };
}

function evaluateOpticalHamiltonian(field, position, momentum) {
    requireField(field);
    assertVector4(position);
    assertVector4(momentum);
    return hamiltonianFromCometric(field.cometricAt(position), momentum);
}

/**
 * Traces one ray with adaptive RK4 step-doubling.
 * The path parameter is normalized optical arclength when H = 1/2. The solver
 * also accumulates the measured optical path and travel time independently.
 *
 * Declared metric-domain boundaries are handled as explicit terminal events: the
 * adaptive integrator reduces a step that crosses the boundary and returns the
 * last valid state if no safe step remains. All other metric/geometry errors
 * propagate unchanged so invalid configurations are not silently hidden.
 */
function traceOpticalRay(field, initialRay, options = {}) {
    requireField(field);
    const config = { ...DEFAULTS, ...options };
    validateTraceOptions(config);

    const ray = createOpticalRayState(initialRay);
    let vector = stateToArray(ray);
    let lambda = 0;
    let stepSize = config.initialStepSize;
    let opticalPathLength = ray.opticalPathLength;
    let travelTime = ray.travelTime;
    let acceptedSteps = 0;
    let rejectedSteps = 0;
    let maxRelativeStepError = 0;
    let event = null;
    const samples = [];
    if (typeof field.containsPosition === 'function' && !field.containsPosition(ray.position)) {
        throw new RangeError('Initial optical ray lies outside the metric domain.');
    }
    let initialHamiltonian = evaluateOpticalHamiltonian(field, ray.position, ray.momentum);
    if (!Number.isFinite(initialHamiltonian) || initialHamiltonian <= 1e-15) {
        throw new RangeError('Initial optical ray must have positive finite Hamiltonian.');
    }
    const startingHamiltonian = initialHamiltonian;
    if (config.includeSamples) samples.push(makeSample(vector, lambda, opticalPathLength, travelTime, initialHamiltonian));

    let status = 'max-path-length';
    while (opticalPathLength - ray.opticalPathLength < config.maxPathLength && acceptedSteps + rejectedSteps < config.maxSteps) {
        const currentPosition = arrayToPosition(vector);
        const currentMomentum = arrayToMomentum(vector);
        const currentHamiltonian = evaluateOpticalHamiltonian(field, currentPosition, currentMomentum);
        const opticalSpeed = Math.sqrt(Math.max(0, 2 * currentHamiltonian));
        if (!Number.isFinite(opticalSpeed) || opticalSpeed <= 1e-14) {
            status = 'stalled';
            break;
        }

        const remainingOpticalPath = config.maxPathLength - (opticalPathLength - ray.opticalPathLength);
        if (remainingOpticalPath <= 1e-12) break;
        const h = Math.min(stepSize, config.maxStepSize, remainingOpticalPath / opticalSpeed);
        if (h < config.minStepSize) {
            status = 'step-underflow';
            break;
        }

        // Step doubling estimates the fourth-order RK error and provides a
        // Richardson-corrected candidate without external numerical libraries.
        // If an intermediate RK stage crosses a finite chart boundary, reject
        // and halve the step until the last valid state is safely retained.
        let full;
        let halfA;
        let halfB;
        let error;
        let corrected = null;
        let nextPosition = null;
        let nextMomentum = null;
        let nextHamiltonian = null;
        try {
            full = rk4Step(field, vector, h, config.gradientStep);
            halfA = rk4Step(field, vector, h / 2, config.gradientStep);
            halfB = rk4Step(field, halfA, h / 2, config.gradientStep);
            error = estimateStepError(full, halfB, config.absoluteTolerance, config.relativeTolerance);
            maxRelativeStepError = Math.max(maxRelativeStepError, error);

            if (error <= 1) {
                corrected = halfB.map((value, index) => value + (value - full[index]) / 15);
                nextPosition = arrayToPosition(corrected);
                assertInsideMetricDomain(field, nextPosition);
                nextMomentum = arrayToMomentum(corrected);
                nextHamiltonian = evaluateOpticalHamiltonian(field, nextPosition, nextMomentum);
            }
        } catch (error) {
            if (!isMetricDomainBoundaryError(error)) throw error;
            rejectedSteps++;
            const reducedStep = h * 0.5;
            if (reducedStep < config.minStepSize) {
                status = 'domain-boundary';
                event = { kind: 'chart-domain-boundary', position: currentPosition };
                break;
            }
            stepSize = reducedStep;
            continue;
        }

        if (error <= 1) {
            if (!Number.isFinite(nextHamiltonian) || nextHamiltonian <= 0) {
                throw new RangeError('Optical ray integration produced an invalid Hamiltonian state.');
            }

            const nextOpticalSpeed = Math.sqrt(2 * nextHamiltonian);
            const opticalIncrement = h * (opticalSpeed + nextOpticalSpeed) / 2;
            const boundedIncrement = Math.min(remainingOpticalPath, opticalIncrement);
            const segment = {
                startPosition: currentPosition,
                endPosition: nextPosition,
                startMomentum: currentMomentum,
                endMomentum: nextMomentum,
                startOpticalPathLength: opticalPathLength,
                endOpticalPathLength: opticalPathLength + boundedIncrement,
                startTravelTime: travelTime,
                endTravelTime: travelTime + boundedIncrement / config.speedOfLight
            };
            const detectedEvent = typeof config.segmentEvent === 'function'
                ? config.segmentEvent(segment)
                : null;
            if (detectedEvent) {
                const parameter = detectedEvent.parameter;
                if (!Number.isFinite(parameter) || parameter < 0 || parameter > 1) {
                    throw new RangeError('Optical segment event parameter must be between zero and one.');
                }
                vector = corrected.map((value, index) => vector[index] + (value - vector[index]) * parameter);
                const hitPosition = arrayToPosition(vector);
                if (typeof field.containsPosition === 'function' && !field.containsPosition(hitPosition)) {
                    vector = stateToArray({ position: currentPosition, momentum: currentMomentum });
                    status = 'domain-boundary';
                    event = { kind: 'chart-domain-boundary', position: currentPosition };
                    break;
                }
                const hitMomentum = arrayToMomentum(vector);
                const hitHamiltonian = evaluateOpticalHamiltonian(field, hitPosition, hitMomentum);
                if (!Number.isFinite(hitHamiltonian) || hitHamiltonian <= 0) {
                    throw new RangeError('Optical segment event produced an invalid Hamiltonian state.');
                }
                const hitOpticalIncrement = boundedIncrement * parameter;
                opticalPathLength += hitOpticalIncrement;
                travelTime += hitOpticalIncrement / config.speedOfLight;
                lambda += h * parameter;
                acceptedSteps++;
                initialHamiltonian = hitHamiltonian;
                event = { ...detectedEvent, parameter };
                if (config.includeSamples) samples.push(makeSample(
                    vector, lambda, opticalPathLength, travelTime, hitHamiltonian
                ));
                status = 'event';
                break;
            }

            opticalPathLength += boundedIncrement;
            travelTime += boundedIncrement / config.speedOfLight;
            lambda += h;
            vector = corrected;
            acceptedSteps++;
            initialHamiltonian = nextHamiltonian;
            if (config.includeSamples) samples.push(makeSample(
                vector, lambda, opticalPathLength, travelTime, nextHamiltonian
            ));

            const factor = error <= 1e-12 ? 2.5 : clamp(0.9 * Math.pow(1 / error, 0.2), 0.2, 2.5);
            stepSize = clamp(h * factor, config.minStepSize, config.maxStepSize);
        } else {
            rejectedSteps++;
            const factor = clamp(0.9 * Math.pow(1 / error, 0.2), 0.1, 0.5);
            stepSize = h * factor;
            if (stepSize < config.minStepSize) {
                status = 'step-underflow';
                break;
            }
        }
    }

    if (acceptedSteps + rejectedSteps >= config.maxSteps &&
        opticalPathLength - ray.opticalPathLength < config.maxPathLength) {
        status = 'max-steps';
    }

    const finalPosition = arrayToPosition(vector);
    const finalMomentum = arrayToMomentum(vector);
    const finalHamiltonian = evaluateOpticalHamiltonian(field, finalPosition, finalMomentum);
    const absoluteHamiltonianDrift = Math.abs(finalHamiltonian - startingHamiltonian);
    const relativeHamiltonianDrift = absoluteHamiltonianDrift / Math.max(Math.abs(startingHamiltonian), 1e-15);
    const finalState = {
        position: finalPosition,
        momentum: finalMomentum,
        opticalPathLength,
        travelTime,
        intensity: ray.intensity
    };

    return {
        status,
        event,
        finalState,
        samples,
        diagnostics: {
            initialHamiltonian: startingHamiltonian,
            finalHamiltonian,
            absoluteHamiltonianDrift,
            relativeHamiltonianDrift,
            acceptedSteps,
            rejectedSteps,
            maxRelativeStepError,
            pathParameter: lambda
        }
    };
}

/** Stable, timestamp-free JSON representation for deterministic ray debugging. */
function serializeOpticalRayResult(result, precision = 12) {
    if (!result || !result.finalState || !Array.isArray(result.samples) || !result.diagnostics) {
        throw new TypeError('A complete optical ray result is required for serialization.');
    }
    if (!Number.isSafeInteger(precision) || precision < 0 || precision > 15) {
        throw new RangeError('Optical ray serialization precision must be an integer from zero through fifteen.');
    }
    const round = (value) => Number(value.toFixed(precision));
    const point = (value) => AXES.map((axis) => round(value[axis]));
    const output = {
        schemaVersion: 1,
        status: result.status,
        finalState: {
            position: point(result.finalState.position),
            momentum: point(result.finalState.momentum),
            opticalPathLength: round(result.finalState.opticalPathLength),
            travelTime: round(result.finalState.travelTime),
            intensity: round(result.finalState.intensity)
        },
        samples: result.samples.map((sample) => ({
            pathParameter: round(sample.pathParameter),
            opticalPathLength: round(sample.opticalPathLength),
            travelTime: round(sample.travelTime),
            position: point(sample.position),
            momentum: point(sample.momentum),
            hamiltonian: round(sample.hamiltonian)
        })),
        diagnostics: Object.fromEntries(Object.entries(result.diagnostics).map(([key, value]) => [key, round(value)]))
    };
    return JSON.stringify(output);
}

function rk4Step(field, state, h, gradientStep) {
    const k1 = derivative(field, state, gradientStep);
    const k2 = derivative(field, addScaled(state, k1, h / 2), gradientStep);
    const k3 = derivative(field, addScaled(state, k2, h / 2), gradientStep);
    const k4 = derivative(field, addScaled(state, k3, h), gradientStep);
    return state.map((value, index) => value + h * (
        k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]
    ) / 6);
}

function derivative(field, state, gradientStep) {
    const position = arrayToPosition(state);
    assertInsideMetricDomain(field, position);
    const momentum = arrayToMomentum(state);
    const sample = field.sample(position);
    const velocity = multiply4(sample.cometric, momentum);
    const gradient = field.cometricGradientAt(position, { step: gradientStep });
    const momentumDerivative = new Array(4).fill(0);
    for (let coordinate = 0; coordinate < 4; coordinate++) {
        let contraction = 0;
        for (let row = 0; row < 4; row++) {
            for (let column = 0; column < 4; column++) {
                contraction += gradient[coordinate][row * 4 + column] *
                    momentum[AXES[row]] * momentum[AXES[column]];
            }
        }
        momentumDerivative[coordinate] = -0.5 * contraction;
    }
    return [
        velocity.x, velocity.y, velocity.z, velocity.w,
        ...momentumDerivative
    ];
}


function assertInsideMetricDomain(field, position) {
    if (typeof field.containsPosition === 'function' && !field.containsPosition(position)) {
        const error = new RangeError('Optical ray reached a finite geometry chart boundary.');
        error.code = 'OPTICAL_METRIC_DOMAIN_BOUNDARY';
        throw error;
    }
}

function isMetricDomainBoundaryError(error) {
    return error?.code === 'OPTICAL_METRIC_DOMAIN_BOUNDARY';
}

function estimateStepError(full, half, absoluteTolerance, relativeTolerance) {
    let maximum = 0;
    for (let index = 0; index < STATE_SIZE; index++) {
        const scale = absoluteTolerance + relativeTolerance * Math.max(Math.abs(full[index]), Math.abs(half[index]));
        maximum = Math.max(maximum, Math.abs(half[index] - full[index]) / (15 * scale));
    }
    return maximum;
}

function hamiltonianFromCometric(cometric, momentum) {
    const values = AXES.map((axis) => momentum[axis]);
    let result = 0;
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            result += values[row] * cometric[row * 4 + column] * values[column];
        }
    }
    return 0.5 * result;
}

function multiply4(matrix, vector) {
    const values = AXES.map((axis) => vector[axis]);
    const result = new Array(4).fill(0);
    for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
            result[row] += matrix[row * 4 + column] * values[column];
        }
    }
    return { x: result[0], y: result[1], z: result[2], w: result[3] };
}

function makeSample(state, pathParameter, opticalPathLength, travelTime, hamiltonian) {
    return {
        pathParameter,
        opticalPathLength,
        travelTime,
        position: arrayToPosition(state),
        momentum: arrayToMomentum(state),
        hamiltonian
    };
}

function stateToArray(state) {
    return [
        state.position.x, state.position.y, state.position.z, state.position.w,
        state.momentum.x, state.momentum.y, state.momentum.z, state.momentum.w
    ];
}

function arrayToPosition(state) {
    return { x: state[0], y: state[1], z: state[2], w: state[3] };
}

function arrayToMomentum(state) {
    return { x: state[4], y: state[5], z: state[6], w: state[7] };
}

function addScaled(state, derivativeValues, scale) {
    return state.map((value, index) => value + derivativeValues[index] * scale);
}

function requireField(field) {
    if (!field || typeof field.sample !== 'function' ||
        typeof field.cometricAt !== 'function' || typeof field.cometricGradientAt !== 'function') {
        throw new TypeError('A compatible OpticalMetricField is required.');
    }
}

function validateTraceOptions(options) {
    validatePositive(options.maxPathLength, 'Maximum optical path length');
    validatePositive(options.initialStepSize, 'Initial optical step size');
    validatePositive(options.minStepSize, 'Minimum optical step size');
    validatePositive(options.maxStepSize, 'Maximum optical step size');
    validatePositive(options.absoluteTolerance, 'Optical absolute tolerance');
    validatePositive(options.relativeTolerance, 'Optical relative tolerance');
    validatePositive(options.gradientStep, 'Optical gradient step');
    validatePositive(options.speedOfLight, 'Optical speed of light');
    if (options.minStepSize > options.initialStepSize || options.initialStepSize > options.maxStepSize) {
        throw new RangeError('Optical step sizes must satisfy min <= initial <= max.');
    }
    if (!Number.isSafeInteger(options.maxSteps) || options.maxSteps < 1) {
        throw new RangeError('Optical maximum steps must be a positive safe integer.');
    }
    if (typeof options.includeSamples !== 'boolean') {
        throw new TypeError('includeSamples must be boolean.');
    }
    if (options.segmentEvent !== null && typeof options.segmentEvent !== 'function') {
        throw new TypeError('segmentEvent must be a function or null.');
    }
}

function validatePositive(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite.`);
}

function validateNonNegative(value, label) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be non-negative and finite.`);
}

function copy4(value) {
    return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export {
    createOpticalRayState,
    evaluateOpticalHamiltonian,
    normalizeOpticalMomentum,
    serializeOpticalRayResult,
    traceOpticalRay
};
