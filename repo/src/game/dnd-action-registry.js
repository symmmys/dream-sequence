
class DnDActionRegistry {
    constructor() {
        this.handlers = new Map();
    }

    register(type, handler) {
        if (
            typeof type !== "string" ||
            !type.trim()
        ) {
            throw new Error(
                "Handler type is required."
            );
        }

        if (typeof handler !== "function") {
            throw new Error(
                "Handler must be a function."
            );
        }

        if (this.handlers.has(type)) {
            throw new Error(
                `Handler already registered: ${type}`
            );
        }

        this.handlers.set(type, handler);

        return () => this.unregister(type);
    }

    unregister(type) {
        return this.handlers.delete(type);
    }

    has(type) {
        return this.handlers.has(type) ||
            this.handlers.has("*");
    }

    async dispatch(context, payload) {
        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
        ) {
            throw new Error(
                "Action payload must be a JSON object."
            );
        }

        const type = payload.type;

        if (
            typeof type !== "string" ||
            !type.trim()
        ) {
            throw new Error(
                "Generic actions require a type field."
            );
        }

        const handler =
            this.handlers.get(type) ||
            this.handlers.get("*");

        if (!handler) {
            throw new Error(
                `No handler registered for: ${type}`
            );
        }

        const safePayload = JSON.parse(
            JSON.stringify(payload)
        );

        return handler({
            ...context,
            payload: safePayload
        });
    }
}

export { DnDActionRegistry };

