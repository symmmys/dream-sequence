
import { FieldRegistry } from "./field-registry.js";
import { FieldSampler } from "./field-sampler.js";

import { SpacetimeField } from "./spacetime-field.js";
import { TemperatureField } from "./temperature-field.js";
import { MaterialField } from "./material-field.js";

import { MetricTensor } from "./metric-tensor.js";

import { EuclideanGeometry } from "./geometry/euclidean-geometry.js";
import { PoincareGeometry } from "./geometry/poincare-geometry.js";
import { GeodesicSolver } from "./geometry/geodesic-solver.js";


class WorldFieldSystem {

    constructor(options = {}) {

        this.terrain = options.terrain || null;

        this.geologicalField =
            options.geologicalField || null;

        this.registry = new FieldRegistry();

        this.sampler = new FieldSampler(
            this.registry
        );

        this.geometries = new Map();

        // Default geometry.
        this.geometries.set(
            "euclidean",
            new EuclideanGeometry()
        );

        this.geometries.set(
            "poincare",
            new PoincareGeometry(-1)
        );

        this.activeGeometry =
            this.geometries.get("euclidean");

        // Initial spacetime configuration.
        this.spacetime = new SpacetimeField({

            defaultMetric: MetricTensor.identity(),

            defaultLapse: 1.0

        });

        // Initial environmental fields.
        this.temperature = new TemperatureField(
            options.temperature || {}
        );

        this.material = this.geologicalField
            ? new MaterialField(
                this.geologicalField,
                options.material || {}
            )
            : null;

        // Register fields.
        this.registry.register(this.spacetime);

        this.registry.register(this.temperature);

        if (this.material) {

            this.registry.register(this.material);

        }

    }

    registerField(field) {

        return this.registry.register(field);

    }

    unregisterField(name) {

        return this.registry.unregister(name);

    }

    getField(name) {

        return this.registry.get(name);

    }

    sample(name, position, time = 0) {

        return this.sampler.sample(
            name,
            position,
            time
        );

    }

    sampleAll(position, time = 0) {

        return this.sampler.sampleAll(
            position,
            time
        );

    }

    sampleEnvironment(position, time = 0) {

        return {

            spacetime: this.sample(
                "spacetime",
                position,
                time
            ),

            temperature: this.sample(
                "temperature",
                position,
                time
            ),

            material: this.sample(
                "material",
                position,
                time
            )

        };

    }

    setGeometry(name) {

        const geometry = this.geometries.get(name);

        if (!geometry) {

            throw new Error(
                `Unknown geometry model: ${name}`
            );

        }

        this.activeGeometry = geometry;

        return geometry;

    }

    registerGeometry(name, geometry) {

        if (!geometry || typeof geometry.metricAt !== "function") {

            throw new TypeError("Invalid geometry model.");

        }

        this.geometries.set(name, geometry);

        return geometry;

    }

    getGeometry(name = null) {

        if (!name) return this.activeGeometry;

        return this.geometries.get(name) || null;

    }

    createGeodesicSolver(options = {}) {

        return new GeodesicSolver(
            this.activeGeometry,
            options
        );

    }

    getSpatialMetric(position) {

        return this.activeGeometry.metricAt(position);

    }

    getProperTime(position, coordinateDelta, time = 0) {

        return this.spacetime.getProperTime(
            position,
            coordinateDelta,
            time
        );

    }

    dispose() {

        this.registry.clear();

        this.geometries.clear();

    }

}

export { WorldFieldSystem };

