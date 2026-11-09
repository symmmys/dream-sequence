
const WORLD_SCHEMA_VERSION = 1;

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `world-${Date.now()}-${Math.random()
        .toString(36).slice(2)}`;
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

class WorldState {
    constructor(options = {}) {
        const now = new Date().toISOString();

        this.schemaVersion = WORLD_SCHEMA_VERSION;

        this.metadata = {
            id: options.id ?? createId(),
            name: options.name ?? "Untitled World",
            createdAt: options.createdAt ?? now,
            updatedAt: now,
            revision: options.revision ?? 0
        };

        this.generation = {
            worldSeed: options.worldSeed ?? 91827,
            generatorVersion: options.generatorVersion ?? 1,
            configuration: options.configuration ?? {}
        };

        this.simulation = {
            elapsedTime: options.elapsedTime ?? 0,
            simulationRate: options.simulationRate ?? 1,
            paused: options.paused ?? false
        };

        this.ecology = {
            chunkRecords: options.chunkRecords ?? []
        };

        this.entities = {
            manual: options.manualEntities ?? [],
            overrides: options.entityOverrides ?? [],
            removedProceduralIds: options.removedProceduralIds ?? []
        };

        this.environment = {
            state: options.environmentState ?? {}
        };
    }

    validate() {
        if (!this.metadata.id || !this.metadata.name.trim()) {
            throw new Error("World requires an ID and name.");
        }

        if (!Number.isInteger(this.generation.worldSeed)) {
            throw new Error("Invalid world seed.");
        }

        if (
            !Number.isFinite(this.simulation.elapsedTime) ||
            this.simulation.elapsedTime < 0
        ) {
            throw new Error("Invalid simulation time.");
        }

        if (!Array.isArray(this.ecology.chunkRecords)) {
            throw new Error("Invalid ecology records.");
        }

        if (
            !Array.isArray(this.entities.manual) ||
            !Array.isArray(this.entities.overrides) ||
            !Array.isArray(this.entities.removedProceduralIds)
        ) {
            throw new Error("Invalid entity collections.");
        }

        return true;
    }

    touch() {
        this.metadata.updatedAt = new Date().toISOString();
        this.metadata.revision++;
    }

    serialize() {
        this.validate();

        return cloneData(this);
    }

    static deserialize(data) {
        if (!data || typeof data !== "object") {
            throw new Error("Invalid world data.");
        }

        if (data.schemaVersion !== WORLD_SCHEMA_VERSION) {
            throw new Error(
                `Unsupported world schema: ${data.schemaVersion}`
            );
        }

        const state = new WorldState({
            id: data.metadata?.id,
            name: data.metadata?.name,
            createdAt: data.metadata?.createdAt,
            revision: data.metadata?.revision,
            worldSeed: data.generation?.worldSeed,
            generatorVersion: data.generation?.generatorVersion,
            configuration: data.generation?.configuration,
            elapsedTime: data.simulation?.elapsedTime,
            simulationRate: data.simulation?.simulationRate,
            paused: data.simulation?.paused,
            chunkRecords: data.ecology?.chunkRecords,
            manualEntities: data.entities?.manual,
            entityOverrides: data.entities?.overrides,
            removedProceduralIds:
                data.entities?.removedProceduralIds,
            environmentState: data.environment?.state
        });

        state.metadata.updatedAt =
            data.metadata.updatedAt ?? state.metadata.updatedAt;

        state.validate();

        return state;
    }
}

export {
    WorldState,
    WORLD_SCHEMA_VERSION
};

