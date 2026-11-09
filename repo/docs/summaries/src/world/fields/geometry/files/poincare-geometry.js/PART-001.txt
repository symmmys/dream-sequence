
import { GeometryModel } from "./geometry-model.js";
import { MetricTensor } from "../metric-tensor.js";

class PoincareGeometry extends GeometryModel {

    constructor(curvature = -1) {

        super("poincare");

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

    isInside(position) {

        const radiusSquared =
            position.x * position.x +
            position.y * position.y +
            position.z * position.z;

        return radiusSquared <
            this.radius * this.radius;

    }

    metricAt(position) {

        if (!this.isInside(position)) {

            throw new RangeError(
                "Position lies outside the Poincare ball."
            );

        }

        const r2 =
            position.x * position.x +
            position.y * position.y +
            position.z * position.z;

        const denominator =
            1 - this.k * r2;

        const factor =
            4 / (denominator * denominator);

        return new MetricTensor([

            factor, 0, 0,

            0, factor, 0,

            0, 0, factor

        ]);

    }

    distance(a, b) {

        if (
            !this.isInside(a) ||
            !this.isInside(b)
        ) {

            throw new RangeError(
                "Both positions must lie inside the Poincare ball."
            );

        }

        const dot = 
            a.x * b.x +
            a.y * b.y +
            a.z * b.z;

        const normA =
            a.x * a.x +
            a.y * a.y +
            a.z * a.z;

        const normB =
            b.x * b.x +
            b.y * b.y +
            b.z * b.z;

        const differenceSquared =

            (a.x - b.x) ** 2 +

            (a.y - b.y) ** 2 +

            (a.z - b.z) ** 2;

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

}

export { PoincareGeometry };

