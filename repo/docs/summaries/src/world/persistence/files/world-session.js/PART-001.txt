
import { WorldState } from "./world-state.js";

class WorldSession {
    constructor(ecology) {
        if (!ecology?.populationManager) {
            throw new Error(
                "WorldSession requires ChunkEcologySystem."
            );
        }

        this.ecology = ecology;
    }

    capture(world, elapsedTime = 0) {
        if (!(world instanceof WorldState)) {
            throw new TypeError("Expected WorldState.");
        }

        const manager = this.ecology.populationManager;

        const chunkRecords = [];

        for (const record of manager.records.values()) {
            const exported = manager.exportRecord(
                record.x,
                record.z
            );

            if (exported) {
                chunkRecords.push(exported);
            }
        }

        world.generation.worldSeed = manager.worldSeed;

        world.simulation.elapsedTime = elapsedTime;

        world.ecology.chunkRecords = chunkRecords;


        return world;
    }

    restore(world) {
        if (!(world instanceof WorldState)) {
            throw new TypeError("Expected WorldState.");
        }

        const ecology = this.ecology;
        const manager = ecology.populationManager;

        // Deactivate currently rendered populations.
        for (const record of manager.records.values()) {
            if (record.active) {
                manager.deactivateRecord(record);
            }
        }

        manager.records.clear();
        manager.pending.length = 0;
        manager.activeKeys.clear();
        manager.simulationCursor = 0;

        ecology.worldSeed = world.generation.worldSeed;
        manager.worldSeed = world.generation.worldSeed;

        // Restore all previously generated populations.
        for (const record of world.ecology.chunkRecords) {
            manager.importRecord(record);
        }

        ecology.renderDirty = true;

        return {
            elapsedTime: world.simulation.elapsedTime,
            worldSeed: world.generation.worldSeed,
            restoredChunks: world.ecology.chunkRecords.length
        };
    }

    getStats() {
        return {
            worldSeed: this.ecology.populationManager.worldSeed,
            generatedChunks:
                this.ecology.populationManager.records.size
        };
    }
}

export { WorldSession };

