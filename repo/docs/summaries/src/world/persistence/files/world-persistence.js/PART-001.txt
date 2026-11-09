
import { WorldState } from "./world-state.js";

const DATABASE_NAME = "somnium-worlds";
const DATABASE_VERSION = 1;
const STORE_NAME = "worlds";

class WorldPersistence {
    constructor() {
        this.database = null;
        this.opening = null;
    }

    async open() {
        if (this.database) {
            return this.database;
        }

        if (this.opening) {
            return this.opening;
        }

        if (!globalThis.indexedDB) {
            throw new Error(
                "IndexedDB is unavailable in this browser."
            );
        }

        this.opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(
                DATABASE_NAME,
                DATABASE_VERSION
            );

            request.onupgradeneeded = () => {
                const database = request.result;

                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, {
                        keyPath: "metadata.id"
                    });
                }
            };

            request.onsuccess = () => {
                this.database = request.result;

                this.database.onversionchange = () => {
                    this.database.close();
                    this.database = null;
                };

                resolve(this.database);
            };

            request.onerror = () => {
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn(
                    "[WorldPersistence] Database upgrade blocked."
                );
            };
        });

        try {
            return await this.opening;
        } finally {
            this.opening = null;
        }
    }

    async transaction(mode, operation) {
        const database = await this.open();

        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, mode);
            const store = tx.objectStore(STORE_NAME);

            let result;

            try {
                result = operation(store, tx);
            } catch (error) {
                tx.abort();
                reject(error);
                return;
            }

            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(
                tx.error ?? new Error("Transaction aborted.")
            );
        });
    }

    async createWorld(name, options = {}) {
        const cleanName = String(name ?? "").trim();

        if (!cleanName) {
            throw new Error("Please provide a world name.");
        }

        const world = new WorldState({
            ...options,
            name: cleanName
        });

        world.validate();

        await this.transaction("readwrite", store => {
            store.add(world.serialize());
        });

        console.log(
            "[WorldPersistence] Created world:",
            world.metadata.name
        );

        return world;
    }

    async listWorlds() {
        const records = await new Promise(async (resolve, reject) => {
            try {
                const database = await this.open();
                const tx = database.transaction(STORE_NAME, "readonly");
                const request = tx.objectStore(STORE_NAME).getAll();

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });

        return records
            .map(record => ({
                id: record.metadata.id,
                name: record.metadata.name,
                createdAt: record.metadata.createdAt,
                updatedAt: record.metadata.updatedAt,
                revision: record.metadata.revision,
                worldSeed: record.generation.worldSeed
            }))
            .sort((a, b) =>
                b.updatedAt.localeCompare(a.updatedAt)
            );
    }

    async loadWorld(id) {
        const record = await new Promise(async (resolve, reject) => {
            try {
                const database = await this.open();
                const tx = database.transaction(STORE_NAME, "readonly");
                const request = tx.objectStore(STORE_NAME).get(id);

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
        });

        if (!record) {
            throw new Error(`World not found: ${id}`);
        }

        return WorldState.deserialize(record);
    }

    async saveWorld(world, options = {}) {
        if (!(world instanceof WorldState)) {
            throw new TypeError("Expected a WorldState instance.");
        }

        world.validate();

        const serialized = world.serialize();

        await this.transaction("readwrite", (store, tx) => {
            const request = store.get(world.metadata.id);

            request.onsuccess = () => {
                const existing = request.result;

                if (!existing) {
                    if (!options.allowCreate) {
                        tx.abort();
                        return;
                    }

                    world.touch();
                    store.add(world.serialize());
                    return;
                }

                // Prevent overwriting changes from another tab.
                if (
                    existing.metadata.revision !==
                    world.metadata.revision
                ) {
                    tx.abort();
                    return;
                }

                world.touch();
                store.put(world.serialize());
            };
        });

        return world;
    }

    async renameWorld(id, newName) {
        const world = await this.loadWorld(id);
        const cleanName = String(newName ?? "").trim();

        if (!cleanName) {
            throw new Error("World name cannot be empty.");
        }

        world.metadata.name = cleanName;

        return this.saveWorld(world);
    }

    async deleteWorld(id) {
        await this.transaction("readwrite", store => {
            store.delete(id);
        });

        console.log("[WorldPersistence] Deleted world:", id);
    }

    close() {
        this.database?.close();
        this.database = null;
    }
}

export { WorldPersistence };

