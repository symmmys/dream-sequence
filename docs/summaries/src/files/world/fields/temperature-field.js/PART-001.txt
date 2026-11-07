
import { WorldField } from "./world-field.js";

class TemperatureField extends WorldField {

    constructor(options = {}) {

        super("temperature", options);

        this.baseTemperature =
            options.baseTemperature ?? 15;

        this.referenceHeight =
            options.referenceHeight ?? 0;

        this.lapseRate =
            options.lapseRate ?? 0.0065;

        this.spatialVariation =
            options.spatialVariation || null;

        this.temporalVariation =
            options.temporalVariation || null;

    }

    evaluate(position, time = 0) {

        const altitudeDifference =
            position.y - this.referenceHeight;

        let temperature =
            this.baseTemperature -
            altitudeDifference * this.lapseRate;

        if (this.spatialVariation) {

            temperature +=
                this.spatialVariation(position, time);

        }

        if (this.temporalVariation) {

            temperature +=
                this.temporalVariation(position, time);

        }

        return {

            value: temperature,

            unit: "celsius",

            position,

            time

        };

    }

}

export { TemperatureField };

