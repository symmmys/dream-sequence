
import { CreateSeededRandom } from "../core/random.js";

export class ChunkPopulationManager {
    constructor(options = {}) {
        this.worldSeed = options.worldSeed ?? 91827;
        this.chunkSize = options.chunkSize ?? 2000;

        this.maxGenerationPerUpdate =
            options.maxGenerationPerUpdate ?? 2;

        this.maxSimulationPerUpdate =
            options.maxSimulationPerUpdate ?? 8;

        this.adapter = options.adapter ?? {};

        this.records = new Map();
        this.pending = [];
        this.activeKeys = new Set();

        this.simulationCursor = 0;

        this.statistics = {
            generated: 0,
            activated: 0,
            deactivated: 0,
            simulated: 0
        };
    }

    getKey(x, z) {
        return `${x},${z}`;
    }

    getSeed(x, z) {
        let seed = this.worldSeed >>> 0;

        seed ^= Math.imul(x | 0, 73856093);
        seed ^= Math.imul(z | 0, 19349663);

        seed = Math.imul(
            seed ^ (seed >>> 16),
            2246822519
        );

        seed = Math.imul(
            seed ^ (seed >>> 13),
            3266489917
        );

        return (seed ^ (seed >>> 16)) >>> 0;
    }

    getChunkCoordinates(position) {
        return {
            x: Math.floor(position.x / this.chunkSize),
            z: Math.floor(position.z / this.chunkSize)
        };
    }

    getRecord(x, z) {
        return this.records.get(this.getKey(x, z)) ?? null;
    }

    requestChunk(x, z, priority = 0) {
        const key = this.getKey(x, z);

        const existing = this.records.get(key);

        if (existing) {
            existing.lastRequested = Date.now();

            this.activateRecord(existing);

            return existing;
        }

        const pending = this.pending.find(
            item => item.key === key
        );

        if (pending) {
            pending.priority = Math.max(
                pending.priority,
                priority
            );

            return null;
        }

        this.pending.push({
            x, z, key, priority
        });

        this.pending.sort(
            (a, b) => b.priority - a.priority
        );

        return null;
    }

    generateRecord(x, z) {
        const key = this.getKey(x, z);

        if (this.records.has(key)) {
            return this.records.get(key);
        }

        const seed = this.getSeed(x, z);

        const random = CreateSeededRandom(seed);

        const bounds = {
            minX: x * this.chunkSize,
            maxX: (x + 1) * this.chunkSize,
            minZ: z * this.chunkSize,
            maxZ: (z + 1) * this.chunkSize
        };

        const context = {
            x, z, key, seed, random, bounds
        };

        const population =
            this.adapter.generate?.(context) ?? {};

        const record = {
            x,
            z,
            key,
            seed,
            bounds,
            population,
            active: false,
            generated: true,
            simulationTime: 0,
            lastRequested: Date.now(),
            metadata: { version: 1 }
        };

        this.records.set(key, record);

        this.statistics.generated++;

        this.activateRecord(record);

        return record;
    }

    activateRecord(record) {
        if (record.active) return;

        this.adapter.activate?.(record);

        record.active = true;

        this.activeKeys.add(record.key);

        this.statistics.activated++;
    }

    deactivateRecord(record) {
        if (!record.active) return;

        this.adapter.deactivate?.(record);

        record.active = false;

        this.activeKeys.delete(record.key);

        this.statistics.deactivated++;
    }

    updateGeneration() {
        let generated = 0;

        while (
            this.pending.length > 0 &&
            generated < this.maxGenerationPerUpdate
        ) {
            const item = this.pending.shift();

            if (this.records.has(item.key)) continue;

            this.generateRecord(item.x, item.z);

            generated++;
        }

        return generated;
    }

    updateSimulation(deltaYears) {
        if (
            !Number.isFinite(deltaYears) ||
            deltaYears < 0
        ) {
            throw new RangeError(
                "deltaYears must be non-negative."
            );
        }

        const active = Array.from(this.activeKeys);

        if (active.length === 0) {
            this.simulationCursor = 0;
            return;
        }

        const count = Math.min(
            active.length,
            this.maxSimulationPerUpdate
        );

        const start =
            this.simulationCursor % active.length;

        for (let i = 0; i < count; i++) {
            const index = (start + i) % active.length;
            const record = this.records.get(active[index]);

            if (!record || !record.active) continue;

            this.adapter.simulate?.(
                record,
                deltaYears
            );

            record.simulationTime += deltaYears;

            this.statistics.simulated++;
        }

        this.simulationCursor =
            (start + count) % active.length;
    }

    updateVisibleChunks(cameraPosition, radius = 3) {
        const center = this.getChunkCoordinates(
            cameraPosition
        );

        const required = new Set();

        for (
            let x = center.x - radius;
            x <= center.x + radius;
            x++
        ) {
            for (
                let z = center.z - radius;
                z <= center.z + radius;
                z++
            ) {
                const dx = x - center.x;
                const dz = z - center.z;

                if (
                    dx * dx + dz * dz >
                    radius * radius
                ) continue;

                const key = this.getKey(x, z);

                required.add(key);

                const distance = Math.sqrt(
                    dx * dx + dz * dz
                );

                this.requestChunk(
                    x, z, 1000 - distance
                );
            }
        }

        // Remove obsolete requests before generating them.
        this.pending = this.pending.filter(
            item => required.has(item.key)
        );

        for (const key of Array.from(this.activeKeys)) {
            if (required.has(key)) continue;

            const record = this.records.get(key);

            if (record) {
                this.deactivateRecord(record);
            }
        }

        this.updateGeneration();
    }

    getPopulation(x, z) {
        return this.getRecord(x, z)?.population ?? null;
    }

    getStats() {
        return {
            ...this.statistics,
            totalRecords: this.records.size,
            activeRecords: this.activeKeys.size,
            pendingRecords: this.pending.length
        };
    }

    exportRecord(x, z) {
        const record = this.getRecord(x, z);

        if (!record) return null;

        return {
            version: 1,
            coordinates: { x, z },
            seed: record.seed,
            bounds: { ...record.bounds },
            simulationTime: record.simulationTime,
            population: this.adapter.serialize
                ? this.adapter.serialize(record)
                : structuredClone(record.population)
        };
    }

    importRecord(data) {
        if (!data || data.version !== 1) {
            throw new Error(
                "Unsupported population record version."
            );
        }

        const { x, z } = data.coordinates;
        const key = this.getKey(x, z);

        const previous = this.records.get(key);

        if (previous?.active) {
            this.deactivateRecord(previous);
        }

        const record = {
            x,
            z,
            key,
            seed: data.seed,
            bounds: { ...data.bounds },

            population: this.adapter.deserialize
                ? this.adapter.deserialize(data.population)
                : structuredClone(data.population),

            active: false,
            generated: true,
            simulationTime: data.simulationTime ?? 0,
            lastRequested: Date.now(),
            metadata: { version: 1 }
        };

        this.records.set(key, record);

        return record;
    }

    dispose() {
        for (const record of this.records.values()) {
            if (record.active) {
                this.deactivateRecord(record);
            }

            this.adapter.dispose?.(record);
        }

        this.records.clear();
        this.pending.length = 0;
        this.activeKeys.clear();

        this.simulationCursor = 0;
    }
}

