/** Shared perspective-style growth profile for a remote anomaly mouth. */

const DEFAULT_INITIAL_RADIUS_RATIO = 0.035;
const DEFAULT_GROWTH_EXPONENT = 2.0;

/**
 * Returns the apparent radius fraction of the remote mouth.
 *
 * The quadratic (or configurable power) approach curve keeps a distant mouth
 * small near entry and accelerates its apparent angular growth near the exit.
 * This is a controllable perspective approximation rather than a claim that
 * the W parameter is Euclidean camera depth.
 */
function calculatePerspectiveMouthGrowth(progress, options = {}) {
    if (!Number.isFinite(progress)) {
        throw new TypeError('Destination-mouth progress must be finite.');
    }
    const initialRadiusRatio = options.initialRadiusRatio ?? DEFAULT_INITIAL_RADIUS_RATIO;
    const growthExponent = options.growthExponent ?? DEFAULT_GROWTH_EXPONENT;
    if (!Number.isFinite(initialRadiusRatio) || initialRadiusRatio <= 0 || initialRadiusRatio > 0.5) {
        throw new RangeError('Destination-mouth initial radius ratio must be greater than zero and no greater than 0.5.');
    }
    if (!Number.isFinite(growthExponent) || growthExponent <= 1 || growthExponent > 4) {
        throw new RangeError('Destination-mouth growth exponent must be greater than one and no greater than four.');
    }
    const normalized = Math.max(0, Math.min(1, progress));
    return initialRadiusRatio + (1 - initialRadiusRatio) * Math.pow(normalized, growthExponent);
}

export { calculatePerspectiveMouthGrowth, DEFAULT_INITIAL_RADIUS_RATIO, DEFAULT_GROWTH_EXPONENT };
