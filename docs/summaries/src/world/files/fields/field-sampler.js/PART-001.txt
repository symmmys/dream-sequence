
class FieldSampler {

    constructor(registry) {

        this.registry = registry;

    }

    sample(name, position, time = 0) {

        const field = this.registry.get(name);

        if (!field) return null;

        return field.sample(position, time);

    }

    sampleAll(position, time = 0) {

        const result = {};

        for (const field of this.registry.getAll()) {

            if (!field.enabled) continue;

            result[field.name] =
                field.sample(position, time);

        }

        return result;

    }

}

export { FieldSampler };

