
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
 * Supports Euclidean and Poincare geometry.
 */

import { PoincareProjection } from "./poincare-projection.js";
import { PoincareMetric } from "./poincare-metric.js";

import { EuclideanGeometry } from "./euclidean-geometry.js";
import { MetricTensor } from "../metric-tensor.js";

class SpatialTransform {

    constructor(options = {}) {

        this.geometryName =
            options.geometry ?? "poincare";

        this.renderScale =
            options.renderScale ?? 10000;

        this.enabled =
            options.enabled ?? true;

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

        if (
            name !== "euclidean" &&
            name !== "poincare"
        ) {
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

        if (
            !this.enabled ||
            this.geometryName === "euclidean"
        ) {
            return {
                x: position.x,
                y: position.y,
                z: position.z
            };
        }

        return this.projection.worldToBall(position);
    }

    // -----------------------------------------
    // GEOMETRY TO WORLD COORDINATES
    // -----------------------------------------

    geometryToWorld(position) {

        if (
            !this.enabled ||
            this.geometryName === "euclidean"
        ) {
            return { ...position };
        }

        return this.projection.ballToWorld(position);
    }

    // -----------------------------------------
    // WORLD TO RENDER COORDINATES
    // -----------------------------------------

    worldToRender(position) {

        const point =
            this.worldToGeometry(position);

        if (
            !this.enabled ||
            this.geometryName === "euclidean"
        ) {
            return point;
        }

        return {
            x: point.x * this.renderScale,
            y: point.y * this.renderScale,
            z: point.z * this.renderScale
        };
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

        const ballPosition =
            this.projection.worldToBall(position);

        const geometryMetric =
            this.metric.metricAt(ballPosition).values;

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

        return new MetricTensor(values);
    }



    // -----------------------------------------
    // HYPERBOLIC DISTANCE
    // -----------------------------------------

    distance(a, b) {

        if (this.geometryName === "euclidean") {
            return this.euclidean.distance(a, b);
        }

        const pointA =
            this.projection.worldToBall(a);

        const pointB =
            this.projection.worldToBall(b);

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

            projection:
                this.projection.getInfo(),

            metric:
                this.metric.getInfo()
        };
    }

}

export { SpatialTransform };

