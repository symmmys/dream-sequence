
/**
 * PoincareMetric
 *
 * Three-dimensional hyperbolic geometry
 * represented using Poincare ball coordinates.
 *
 * Supports:
 * - Metric tensor evaluation.
 * - Exact hyperbolic distances.
 * - Hyperboloid conversion.
 * - Analytic geodesic interpolation.
 * - Geodesic path generation.
 */

import { MetricTensor } from "../metric-tensor.js";

class PoincareMetric {

    constructor(curvature = -1) {

        if (
            !Number.isFinite(curvature) ||
            curvature >= 0
        ) {
            throw new Error(
                "Poincare curvature must be negative."
            );
        }

        this.curvature = curvature;

        this.k = -curvature;

        this.radius = 1 / Math.sqrt(this.k);
    }

    // -----------------------------------------
    // POSITION VALIDATION
    // -----------------------------------------

    validatePosition(position) {

        if (
            !position ||
            !Number.isFinite(position.x) ||
            !Number.isFinite(position.y) ||
            !Number.isFinite(position.z)
        ) {
            throw new TypeError(
                "Invalid Poincare position."
            );
        }

        if (!this.isInside(position)) {
            throw new RangeError(
                "Position lies outside the open Poincare ball."
            );
        }
    }

    isInside(position) {

        if (
            !position ||
            !Number.isFinite(position.x) ||
            !Number.isFinite(position.y) ||
            !Number.isFinite(position.z)
        ) {
            return false;
        }

        const radiusSquared =
            position.x ** 2 +
            position.y ** 2 +
            position.z ** 2;

        return radiusSquared <
            this.radius ** 2;
    }

    // -----------------------------------------
    // METRIC TENSOR
    // -----------------------------------------

    metricAt(position) {

        this.validatePosition(position);

        const radiusSquared =
            position.x ** 2 +
            position.y ** 2 +
            position.z ** 2;

        const denominator =
            this.radius ** 2 - radiusSquared;

        const factor =
            4 * this.radius ** 4 /
            (denominator ** 2);

        return new MetricTensor([
            factor, 0, 0,
            0, factor, 0,
            0, 0, factor
        ]);
    }

    // -----------------------------------------
    // HYPERBOLIC DISTANCE
    // -----------------------------------------

    distance(a, b) {

        this.validatePosition(a);
        this.validatePosition(b);

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;

        const differenceSquared =
            dx * dx + dy * dy + dz * dz;

        const normA =
            a.x ** 2 +
            a.y ** 2 +
            a.z ** 2;

        const normB =
            b.x ** 2 +
            b.y ** 2 +
            b.z ** 2;

        const numerator =
            this.k * differenceSquared;

        const denominator =
            (1 - this.k * normA) *
            (1 - this.k * normB);

        const argument =
            1 + 2 * numerator / denominator;

        return Math.acosh(
            Math.max(1, argument)
        ) / Math.sqrt(this.k);
    }

    // -----------------------------------------
    // POINCARE TO HYPERBOLOID
    // -----------------------------------------

    toHyperboloid(position) {

        this.validatePosition(position);

        const R = this.radius;

        const radiusSquared =
            position.x ** 2 +
            position.y ** 2 +
            position.z ** 2;

        const denominator =
            R * R - radiusSquared;

        const factor =
            2 * R * R / denominator;

        return {
            w:
                R * (R * R + radiusSquared) /
                denominator,

            x: factor * position.x,

            y: factor * position.y,

            z: factor * position.z
        };
    }

    // -----------------------------------------
    // HYPERBOLOID TO POINCARE
    // -----------------------------------------

    fromHyperboloid(position) {

        const R = this.radius;

        if (
            !position ||
            !Number.isFinite(position.w) ||
            !Number.isFinite(position.x) ||
            !Number.isFinite(position.y) ||
            !Number.isFinite(position.z) ||
            position.w <= 0
        ) {
            throw new TypeError(
                "Invalid hyperboloid position."
            );
        }

        const denominator =
            position.w + R;

        const result = {
            x: R * position.x / denominator,

            y: R * position.y / denominator,

            z: R * position.z / denominator
        };

        this.validatePosition(result);

        return result;
    }

    // -----------------------------------------
    // MINKOWSKI INNER PRODUCT
    // -----------------------------------------

    minkowskiProduct(a, b) {

        return (
            -a.w * b.w +
            a.x * b.x +
            a.y * b.y +
            a.z * b.z
        );
    }

    // -----------------------------------------
    // GEODESIC INTERPOLATION
    // -----------------------------------------

    interpolateGeodesic(a, b, t) {

        this.validatePosition(a);
        this.validatePosition(b);

        if (
            !Number.isFinite(t) ||
            t < 0 ||
            t > 1
        ) {
            throw new RangeError(
                "Geodesic parameter must be between 0 and 1."
            );
        }

        if (t === 0) return { ...a };
        if (t === 1) return { ...b };

        const A = this.toHyperboloid(a);
        const B = this.toHyperboloid(b);

        const R = this.radius;

        const coshDistance =
            -this.minkowskiProduct(A, B) /
            (R * R);

        const distance = Math.acosh(
            Math.max(1, coshDistance)
        );

        // Handle nearly identical points.

        if (distance < 1e-10) {

            return {
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
                z: a.z + (b.z - a.z) * t
            };
        }

        const denominator =
            Math.sinh(distance);

        const weightA =
            Math.sinh((1 - t) * distance) /
            denominator;

        const weightB =
            Math.sinh(t * distance) /
            denominator;

        const point = {
            w:
                weightA * A.w +
                weightB * B.w,

            x:
                weightA * A.x +
                weightB * B.x,

            y:
                weightA * A.y +
                weightB * B.y,

            z:
                weightA * A.z +
                weightB * B.z
        };

        return this.fromHyperboloid(point);
    }

    // -----------------------------------------
    // GEODESIC PATH
    // -----------------------------------------

    geodesic(a, b, segments = 32) {

        this.validatePosition(a);
        this.validatePosition(b);

        if (
            !Number.isInteger(segments) ||
            segments < 1 ||
            segments > 10000
        ) {
            throw new RangeError(
                "Invalid geodesic segment count."
            );
        }

        const points = [];

        for (let i = 0; i <= segments; i++) {

            const t = i / segments;

            points.push(
                this.interpolateGeodesic(
                    a,
                    b,
                    t
                )
            );
        }

        return {
            points,

            length: this.distance(a, b),

            segments,

            geometry: "poincare-3d"
        };
    }

    // -----------------------------------------
    // INFORMATION
    // -----------------------------------------

    getInfo() {

        return {
            geometry: "poincare-3d",

            curvature: this.curvature,

            radius: this.radius,

            dimensions: 3,

            boundaryReachable: false
        };
    }
}

export { PoincareMetric };

