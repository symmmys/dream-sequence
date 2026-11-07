
class WorldField {

    constructor(name, options = {}) {

        if (!name) {
            throw new Error("WorldField requires a name.");
        }

        this.name = name;

        this.enabled = options.enabled ?? true;

        this.priority = options.priority ?? 0;

        this.metadata = options.metadata || {};

    }

    sample(position, time = 0) {

        if (!this.enabled) return null;

        if (!position) return null;

        return this.evaluate(position, time);

    }

    evaluate() {

        throw new Error(
            "WorldField.evaluate() must be implemented."
        );

    }

}

export { WorldField };

