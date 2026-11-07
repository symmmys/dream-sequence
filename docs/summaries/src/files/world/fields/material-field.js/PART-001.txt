
import { WorldField } from "./world-field.js";
import { PhysicalProperties } from "./physical-properties.js";

const DEFAULT_MATERIALS = {

    granite: {
        density: 2.7,
        hardness: 0.98,
        cohesion: 0.95,
        thermalConductivity: 2.5,
        heatCapacity: 0.79,
        elasticity: 0.7,
        porosity: 0.02,
        moistureCapacity: 0.15
    },

    limestone: {
        density: 2.5,
        hardness: 0.65,
        cohesion: 0.65,
        thermalConductivity: 1.3,
        heatCapacity: 0.91,
        elasticity: 0.5,
        porosity: 0.12,
        moistureCapacity: 0.45
    },

    sand: {
        density: 1.6,
        hardness: 0.08,
        cohesion: 0.12,
        thermalConductivity: 0.3,
        heatCapacity: 0.8,
        elasticity: 0.1,
        porosity: 0.4,
        moistureCapacity: 0.3
    },

    clay: {
        density: 1.8,
        hardness: 0.28,
        cohesion: 0.45,
        thermalConductivity: 1.0,
        heatCapacity: 0.9,
        elasticity: 0.25,
        porosity: 0.35,
        moistureCapacity: 0.9
    },

    fertileSoil: {
        density: 1.3,
        hardness: 0.05,
        cohesion: 0.15,
        thermalConductivity: 0.6,
        heatCapacity: 1.2,
        elasticity: 0.1,
        porosity: 0.55,
        moistureCapacity: 1.0
    },

    coal: {
        density: 1.4,
        hardness: 0.35,
        cohesion: 0.55,
        thermalConductivity: 0.3,
        heatCapacity: 1.1,
        elasticity: 0.25,
        porosity: 0.1,
        moistureCapacity: 0.2
    },

    anomaly: {
        density: 1.0,
        hardness: 0.85,
        cohesion: 0.35,
        thermalConductivity: 0.5,
        heatCapacity: 1.0,
        elasticity: 0.5,
        porosity: 0.2,
        moistureCapacity: 0.5
    }

};

class MaterialField extends WorldField {

    constructor(geologicalField, options = {}) {

        super("material", options);

        this.geologicalField = geologicalField;

        this.materials = {

            ...DEFAULT_MATERIALS,

            ...(options.materials || {})

        };

    }

    evaluate(position, time = 0) {

        const geology = this.geologicalField.sample(
            position.x,
            position.z
        );

        if (!geology) return null;

        const materialName = geology.speciesName;

        const properties =
            this.materials[materialName];

        if (!properties) {

            return {

                name: materialName,

                geology,

                properties: new PhysicalProperties()

            };

        }

        return {

            name: materialName,

            geology,

            properties: new PhysicalProperties(
                properties
            ),

            time

        };

    }

}

export { MaterialField };

