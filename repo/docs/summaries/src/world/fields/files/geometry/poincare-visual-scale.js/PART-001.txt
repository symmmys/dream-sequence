/** Bounded rendering exaggeration; never modifies the authoritative Poincare metric. */

const DEFAULT_GAMMA = 0.5;
const DEFAULT_MAX_SCALE = 4;
const DEFAULT_BOUNDARY_EPSILON = 1e-4;

function calculatePoincareMetricFactor(radius, ballRadius) {
    validateRadii(radius, ballRadius);
    if (radius >= ballRadius) {
        throw new RangeError('Poincare metric is undefined at or beyond the ball boundary.');
    }
    return 2 * ballRadius ** 2 / (ballRadius ** 2 - radius ** 2);
}

// This bounded rendering exaggeration is deliberately separate from the true metric.
function calculatePoincareVisualScale(radius, ballRadius, options = {}) {
    validateRadii(radius, ballRadius);
    const gamma = options.gamma ?? DEFAULT_GAMMA;
    const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
    const boundaryEpsilon = options.boundaryEpsilon ?? DEFAULT_BOUNDARY_EPSILON;
    validateOptions(gamma, maxScale, boundaryEpsilon);

    const safeRadius = Math.min(radius, ballRadius * (1 - boundaryEpsilon));
    const normalizedRadius = safeRadius / ballRadius;
    const rawScale = (1 - normalizedRadius ** 2) ** -gamma;
    return Math.min(maxScale, Math.max(1, rawScale));
}

function validateRadii(radius, ballRadius) {
    if (!Number.isFinite(radius) || radius < 0) {
        throw new RangeError('Poincare radius must be finite and non-negative.');
    }
    if (!Number.isFinite(ballRadius) || ballRadius <= 0) {
        throw new RangeError('Poincare ball radius must be finite and positive.');
    }
}

function validateOptions(gamma, maxScale, boundaryEpsilon) {
    if (!Number.isFinite(gamma) || gamma < 0) {
        throw new RangeError('Visual expansion gamma must be finite and non-negative.');
    }
    if (!Number.isFinite(maxScale) || maxScale < 1) {
        throw new RangeError('Maximum visual scale must be finite and at least one.');
    }
    if (
        !Number.isFinite(boundaryEpsilon) ||
        boundaryEpsilon <= 0 ||
        boundaryEpsilon >= 1
    ) {
        throw new RangeError('Boundary epsilon must be between zero and one.');
    }
}

export {
    calculatePoincareMetricFactor,
    calculatePoincareVisualScale
};
