
import { WorldField } from "./world-field.js";
import { MetricTensor } from "./metric-tensor.js";

class SpacetimeField extends WorldField {

    constructor(options = {}) {

        super("spacetime", options);

        this.metricProvider =
            options.metricProvider || null;

        this.lapseProvider =
            options.lapseProvider || null;

        this.defaultMetric =
            options.defaultMetric || MetricTensor.identity();

        this.defaultLapse =
            options.defaultLapse ?? 1.0;

        if (
            !Number.isFinite(this.defaultLapse) ||
            this.defaultLapse <= 0
        ) {
            throw new Error("Lapse must be positive.");
        }

    }

    evaluate(position, time = 0) {

        const metric = this.metricProvider
            ? this.metricProvider(position, time)
            : this.defaultMetric;

        const lapse = this.lapseProvider
            ? this.lapseProvider(position, time)
            : this.defaultLapse;

        if (!(metric instanceof MetricTensor)) {
            throw new TypeError("Invalid spatial metric.");
        }

        if (
            !Number.isFinite(lapse) ||
            lapse <= 0
        ) {
            throw new Error("Invalid temporal lapse.");
        }

        return {

            metric,

            lapse,

            coordinateTime: time,

            properTimeRate: lapse

        };

    }

    getProperTime(position, coordinateDelta, time = 0) {

        if (
            !Number.isFinite(coordinateDelta) ||
            coordinateDelta < 0
        ) {
            throw new RangeError("Invalid time interval.");
        }

        return this.sample(position, time).lapse *
            coordinateDelta;

    }

}

export { SpacetimeField };

