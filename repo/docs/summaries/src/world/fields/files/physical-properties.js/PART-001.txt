
class PhysicalProperties {

    constructor(options = {}) {

        this.density = options.density ?? 1.0;

        this.hardness = options.hardness ?? 0.5;

        this.cohesion = options.cohesion ?? 0.5;

        this.thermalConductivity =
            options.thermalConductivity ?? 0.5;

        this.heatCapacity =
            options.heatCapacity ?? 1.0;

        this.elasticity =
            options.elasticity ?? 0.5;

        this.porosity =
            options.porosity ?? 0.3;

        this.moistureCapacity =
            options.moistureCapacity ?? 0.5;

        this.validate();

    }

    validate() {

        for (const [key, value] of Object.entries(this)) {

            if (
                typeof value === "number" &&
                (!Number.isFinite(value) || value < 0)
            ) {

                throw new Error(
                    `Invalid physical property: ${key}`
                );

            }

        }

    }

    clone() {

        return new PhysicalProperties(this);

    }

}

export { PhysicalProperties };

