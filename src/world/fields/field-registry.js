
class FieldRegistry {

    constructor() {

        this.fields = new Map();

    }

    register(field) {

        if (!field || !field.name || typeof field.sample !== "function") {

            throw new TypeError("Invalid world field.");

        }

        if (this.fields.has(field.name)) {

            throw new Error(
                `Field already registered: ${field.name}`
            );

        }

        this.fields.set(field.name, field);

        return field;

    }

    unregister(name) {

        return this.fields.delete(name);

    }

    get(name) {

        return this.fields.get(name) || null;

    }

    has(name) {

        return this.fields.has(name);

    }

    getAll() {

        return Array.from(this.fields.values());

    }

    clear() {

        this.fields.clear();

    }

}

export { FieldRegistry };

