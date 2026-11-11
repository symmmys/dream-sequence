
/**
 * SpatialTransform
 *
 * Coordinates world geometry transformations.
 *
 * Separates:
 * - Authoritative world coordinates.
 * - Mathematical geometry coordinates.
 * - Rendering coordinates.
 *
 * Supports Euclidean, Poincare, spherical, and inverted-Poincare charts.
 */

import { PoincareProjection } from "./poincare-projection.js";
import { PoincareMetric } from "./poincare-metric.js";

import { EuclideanGeometry } from "./euclidean-geometry.js";
import { MetricTensor } from "../metric-tensor.js";
import { calculatePoincareVisualScale } from "./poincare-visual-scale.js";

class SpatialTransform {

    constructor(options = {}) {

        this.geometryName =
            options.geometry ?? "poincare";

        this.renderScale =
            options.renderScale ?? 10000;

        this.enabled = options.enabled ?? true;
        this.visualScaleOptions = {
            gamma: options.visualScaleGamma ?? 0.5,
            maxScale: options.maxVisualScale ?? 4,
            boundaryEpsilon: options.visualBoundaryEpsilon ?? 1e-4
        };

        if (
            !Number.isFinite(this.renderScale) ||
            this.renderScale <= 0
        ) {
            throw new Error(
                "Invalid geometry render scale."
            );
        }

        this.euclidean =
            new EuclideanGeometry();

        this.projection =
            options.projection ??
            new PoincareProjection(
                options.bounds ?? {}
            );

        this.metric =
            options.metric ??
            new PoincareMetric(
                this.projection.curvature
            );

        this.setGeometry(this.geometryName);
    }

    // -----------------------------------------
    // GEOMETRY SELECTION
    // -----------------------------------------

    setGeometry(name) {

        if (!["euclidean", "poincare", "spherical", "inverted-poincare"].includes(name)) {
            throw new Error(
                `Unsupported geometry: ${name}`
            );
        }

        this.geometryName = name;

        console.log(
            "[SpatialTransform] Geometry:",
            name
        );

    }

    // -----------------------------------------
    // WORLD TO GEOMETRY COORDINATES
    // -----------------------------------------

    worldToGeometry(position) {

        if (!this.enabled || this.geometryName === "euclidean") return copyPosition(position);
        if (this.geometryName === "poincare") return this.projection.worldToBall(position);
        if (this.geometryName === "spherical") return this.worldToSphericalChart(position);
        return this.worldToInvertedPoincare(position);
    }

    // -----------------------------------------
    // GEOMETRY TO WORLD COORDINATES
    // -----------------------------------------

    geometryToWorld(position) {

        if (!this.enabled || this.geometryName === "euclidean") return copyPosition(position);
        if (this.geometryName === "poincare") return this.projection.ballToWorld(position);
        if (this.geometryName === "spherical") return this.sphericalChartToWorld(position);
        return this.invertedPoincareToWorld(position);
    }

    // -----------------------------------------
    // WORLD TO RENDER COORDINATES
    // -----------------------------------------

    worldToRender(position) {

        const point =
            this.worldToGeometry(position);

        if (!this.enabled || this.geometryName === "euclidean") return point;
        return scalePosition(point, this.renderScale);
    }

    // -----------------------------------------
    // RENDER TO WORLD COORDINATES
    // -----------------------------------------

    renderToWorld(position) {

        if (
            !this.enabled ||
            this.geometryName === "euclidean"
        ) {
            return { ...position };
        }

        return this.geometryToWorld({
            x: position.x / this.renderScale,
            y: position.y / this.renderScale,
            z: position.z / this.renderScale
        });
    }

    /**
     * Constrain an authoritative world-space position to the finite domain of
     * Poincare-based charts before projecting it. This is useful for camera/player
     * positions that move through an anomaly region extending beyond a slice's
     * local chart bounds. The projection itself remains strict.
     */
    /**
     * Returns whether a world point and the centered finite-difference samples
     * used by metricAtWorld() remain inside this transform's finite chart.
     * Optical integration uses this guard to terminate at chart boundaries
     * instead of allowing an RK stage to throw from worldToBall().
     */
    containsMetricDomainPosition(position, options = {}) {
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
            return false;
        }
        if (!this.enabled || !["poincare", "inverted-poincare"].includes(this.geometryName)) {
            return true;
        }

        const derivativeStep = options.jacobianStep ?? 0.01;
        const margin = options.boundaryMarginWorld ?? derivativeStep * 1.1;
        if (!Number.isFinite(derivativeStep) || derivativeStep <= 0 ||
            !Number.isFinite(margin) || margin < derivativeStep) {
            throw new RangeError("Invalid metric-domain boundary margin.");
        }
        const bounds = this.projection.bounds;
        for (const axis of ["x", "y", "z"]) {
            if (position[axis] < bounds[`min${axis.toUpperCase()}`] + margin ||
                position[axis] > bounds[`max${axis.toUpperCase()}`] - margin) {
                return false;
            }
        }

        try {
            this.projection.worldToBall(position);
            for (const axis of ["x", "y", "z"]) {
                for (const direction of [-1, 1]) {
                    const sample = { ...position, [axis]: position[axis] + direction * derivativeStep };
                    this.projection.worldToBall(sample);
                }
            }
            return true;
        } catch (error) {
            if (error instanceof RangeError) return false;
            throw error;
        }
    }

    constrainWorldPosition(position, options = {}) {
        validateRenderPosition(position);

        if (!this.enabled || !["poincare", "inverted-poincare"].includes(this.geometryName)) {
            return copyPosition(position);
        }

        const bounds = this.projection.bounds;
        const margin = options.boundaryMargin ?? Math.max(
            this.projection.boundaryEpsilon,
            1e-7
        );
        if (!Number.isFinite(margin) || margin <= 0 || margin >= 0.01) {
            throw new RangeError("World chart boundary margin must be between zero and 0.01.");
        }

        const clampAxis = (value, minimum, maximum) => {
            const inset = (maximum - minimum) * margin;
            return Math.min(maximum - inset, Math.max(minimum + inset, value));
        };

        return {
            x: clampAxis(position.x, bounds.minX, bounds.maxX),
            y: clampAxis(position.y, bounds.minY, bounds.maxY),
            z: clampAxis(position.z, bounds.minZ, bounds.maxZ)
        };
    }

    /**
     * Keep render-space picks inside the active chart before attempting an
     * inverse projection. Poincare charts have an open-ball boundary;
     * spherical exponential charts end at their antipodal limit.
     *
     * This is intentionally a render-space constraint; authoritative world
     * positions and the strict projection validation remain unchanged.
     */
    constrainRenderPosition(position, options = {}) {
        validateRenderPosition(position);

        if (!this.enabled || !["poincare", "spherical"].includes(this.geometryName)) {
            return copyPosition(position);
        }

        const margin = options.boundaryMargin ?? Math.max(
            this.projection.boundaryEpsilon,
            this.visualScaleOptions.boundaryEpsilon,
            1e-6
        );
        if (!Number.isFinite(margin) || margin <= 0 || margin >= 1) {
            throw new RangeError("Render chart boundary margin must be between zero and one.");
        }

        // The Poincare chart occupies an open ball of radius R. The spherical
        // exponential chart is valid only before the antipode at pi*R. Clamp
        // render-space interaction points just inside either chart boundary.
        const chartRadius = this.geometryName === "spherical"
            ? Math.PI * this.projection.radius
            : this.projection.radius;
        const renderRadius = chartRadius * this.renderScale;
        const maximumRadius = renderRadius * (1 - margin);
        const distance = Math.hypot(position.x, position.y, position.z);
        if (distance <= maximumRadius || distance === 0) {
            return copyPosition(position);
        }

        const factor = maximumRadius / distance;
        return {
            x: position.x * factor,
            y: position.y * factor,
            z: position.z * factor
        };
    }

    worldToSphericalChart(position) {
        this.projection.validatePosition(position);
        const offset = subtractPosition(position, this.projection.center);
        const distance = lengthPosition(offset);
        if (distance === 0) return { x: 0, y: 0, z: 0 };
        const radius = this.projection.radius;
        const chartDistance = 2 * radius * Math.atan(distance / (2 * radius));
        return scalePosition(offset, chartDistance / distance);
    }

    sphericalChartToWorld(position) {
        this.projection.validatePosition(position);
        const distance = lengthPosition(position);
        const chartLimit = Math.PI * this.projection.radius;
        if (distance >= chartLimit) throw new RangeError("Spherical chart reaches its antipodal limit.");
        if (distance === 0) return copyPosition(this.projection.center);
        const worldDistance = 2 * this.projection.radius * Math.tan(distance / (2 * this.projection.radius));
        return addPosition(this.projection.center, scalePosition(position, worldDistance / distance));
    }

    worldToInvertedPoincare(position) {
        const ball = this.projection.worldToBall(position);
        const distance = lengthPosition(ball);
        const epsilon = this.projection.boundaryEpsilon;
        if (distance <= epsilon * this.projection.radius) {
            throw new RangeError("Inverted-Poincare chart is singular at its centre.");
        }
        const invertedRadius = Math.min(
            this.projection.radius / epsilon,
            this.projection.radius ** 2 / distance
        );
        return scalePosition(ball, invertedRadius / distance);
    }

    invertedPoincareToWorld(position) {
        this.projection.validatePosition(position);
        const distance = lengthPosition(position);
        if (distance <= this.projection.radius) {
            throw new RangeError("Inverted-Poincare coordinates must lie outside the sphere.");
        }
        const ballRadius = this.projection.radius ** 2 / distance;
        const ball = scalePosition(position, ballRadius / distance);
        return this.projection.ballToWorld(ball);
    }

    getVisualScale(position, options = {}) {
        if (!this.enabled || this.geometryName !== "poincare") return 1;
        const ball = this.projection.worldToBall(position);
        return calculatePoincareVisualScale(
            lengthPosition(ball),
            this.projection.radius,
            { ...this.visualScaleOptions, ...options }
        );
    }

    // -----------------------------------------
    // NUMERICAL JACOBIAN
    // -----------------------------------------

    getJacobian(position, options = {}) {

        const h = options.step ?? 0.01;

        if (
            !Number.isFinite(h) ||
            h <= 0
        ) {
            throw new Error(
                "Invalid Jacobian step."
            );
        }

        const origin =
            this.worldToRender(position);

        const columns = [];

        for (const axis of ["x", "y", "z"]) {

            const forward = { ...position };
            const backward = { ...position };

            forward[axis] += h;
            backward[axis] -= h;

            const a = this.worldToRender(forward);
            const b = this.worldToRender(backward);

            columns.push([
                (a.x - b.x) / (2 * h),
                (a.y - b.y) / (2 * h),
                (a.z - b.z) / (2 * h)
            ]);
        }

        return [
            columns[0][0],
            columns[1][0],
            columns[2][0],

            columns[0][1],
            columns[1][1],
            columns[2][1],

            columns[0][2],
            columns[1][2],
            columns[2][2]
        ];
    }

    // -----------------------------------------
    // DIRECTION TRANSFORMATION
    // -----------------------------------------

    transformDirection(position, direction) {

        const J = this.getJacobian(position);

        return {
            x:
                J[0] * direction.x +
                J[1] * direction.y +
                J[2] * direction.z,

            y:
                J[3] * direction.x +
                J[4] * direction.y +
                J[5] * direction.z,

            z:
                J[6] * direction.x +
                J[7] * direction.y +
                J[8] * direction.z
        };
    }

    // -----------------------------------------
    // SPATIAL METRIC
    // -----------------------------------------

	
    metricAtWorld(position) {

        if (
            !this.enabled ||
            this.geometryName === "euclidean"
        ) {
            return this.euclidean.metricAt(position);
        }

        if (this.geometryName === "spherical") {
            return new MetricTensor(this.sphericalMetricAt(position));
        }

        const ballPosition = this.projection.worldToBall(position);
        const geometryMetric = this.metric.metricAt(ballPosition).values;

        // Convert the rendering Jacobian into
        // the mathematical projection Jacobian.

        const J = this.getJacobian(position).map(
            value => value / this.renderScale
        );

        // Pull back G into world coordinates:
        // G_world = transpose(J) * G_ball * J

        const values = new Array(9).fill(0);

        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {

                for (let k = 0; k < 3; k++) {
                    for (let l = 0; l < 3; l++) {

                        values[i * 3 + j] +=
                            J[k * 3 + i] *
                            geometryMetric[k * 3 + l] *
                            J[l * 3 + j];
                    }
                }
            }
        }

        // J^T G J is symmetric analytically. The two off-diagonal sums can
        // differ by a few ulps because their floating-point accumulation order
        // is reversed; symmetrize before MetricTensor's strict validation.
        for (let row = 0; row < 3; row++) {
            for (let column = row + 1; column < 3; column++) {
                const average = 0.5 * (
                    values[row * 3 + column] + values[column * 3 + row]
                );
                values[row * 3 + column] = average;
                values[column * 3 + row] = average;
            }
        }
        return new MetricTensor(values);
    }



    sphericalMetricAt(position) {
        const chart = this.worldToSphericalChart(position);
        const radius = lengthPosition(chart);
        const sphereRadius = this.projection.radius;
        const ratio = radius === 0 ? 1 : Math.sin(radius / sphereRadius) / (radius / sphereRadius);
        const direction = radius === 0 ? { x: 0, y: 0, z: 0 } : scalePosition(chart, 1 / radius);
        const radialCorrection = 1 - ratio ** 2;
        const chartMetric = [
            ratio ** 2 + radialCorrection * direction.x ** 2,
            radialCorrection * direction.x * direction.y,
            radialCorrection * direction.x * direction.z,
            radialCorrection * direction.y * direction.x,
            ratio ** 2 + radialCorrection * direction.y ** 2,
            radialCorrection * direction.y * direction.z,
            radialCorrection * direction.z * direction.x,
            radialCorrection * direction.z * direction.y,
            ratio ** 2 + radialCorrection * direction.z ** 2
        ];
        return pullbackMetric(chartMetric, this.getJacobian(position).map((value) => value / this.renderScale));
    }

    sphericalDistance(first, second) {
        const a = this.worldToSphericalChart(first);
        const b = this.worldToSphericalChart(second);
        const radius = this.projection.radius;
        const ra = lengthPosition(a);
        const rb = lengthPosition(b);
        const dot = dotPosition(a, b);
        const cosAngle = Math.cos(ra / radius) * Math.cos(rb / radius) +
            (ra === 0 || rb === 0 ? 0 : Math.sin(ra / radius) * Math.sin(rb / radius) * dot / (ra * rb));
        return radius * Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    }

    // -----------------------------------------
    // HYPERBOLIC DISTANCE
    // -----------------------------------------

    distance(a, b) {

        if (this.geometryName === "euclidean") return this.euclidean.distance(a, b);
        if (this.geometryName === "spherical") return this.sphericalDistance(a, b);

        const pointA = this.projection.worldToBall(a);
        const pointB = this.projection.worldToBall(b);

        return this.metric.distance(
            pointA,
            pointB
        );
    }

    // -----------------------------------------
    // DIAGNOSTICS
    // -----------------------------------------

    getInfo() {

        return {
            geometry: this.geometryName,

            enabled: this.enabled,

            renderScale: this.renderScale,

            projection: this.projection.getInfo(),
            metric: this.metric.getInfo(),
            visualScale: this.geometryName === "poincare" ? "bounded-conformal" : "unit"
        };
    }

}

function copyPosition(position) {
    return { x: position.x, y: position.y, z: position.z };
}

function validateRenderPosition(position) {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) {
        throw new TypeError("Render position must contain finite x, y, and z coordinates.");
    }
}

function addPosition(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtractPosition(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scalePosition(position, factor) {
    return { x: position.x * factor, y: position.y * factor, z: position.z * factor };
}

function dotPosition(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function lengthPosition(position) { return Math.hypot(position.x, position.y, position.z); }

function pullbackMetric(metric, jacobian) {
    const values = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            for (let first = 0; first < 3; first++) {
                for (let second = 0; second < 3; second++) {
                    values[row * 3 + column] += jacobian[first * 3 + row] *
                        metric[first * 3 + second] * jacobian[second * 3 + column];
                }
            }
        }
    }
    return values;
}

export { SpatialTransform };

