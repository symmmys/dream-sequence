
import { GeometryModel } from "./geometry-model.js";
import { MetricTensor } from "../metric-tensor.js";

class EuclideanGeometry extends GeometryModel {

    constructor() {

        super("euclidean");

        this.metric = MetricTensor.identity();

    }

    metricAt() {

        return this.metric;

    }

    distance(a, b) {

        return Math.hypot(
            b.x - a.x,
            b.y - a.y,
            b.z - a.z
        );

    }

}

export { EuclideanGeometry };

