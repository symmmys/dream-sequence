
import { WorldChunk } from "./world-chunk.js";

export class WorldManager {
    constructor(scene, terrain, options = {}) {
        this.scene = scene;
        this.terrain = terrain;

	this.fallbackScheduled = false;

        this.chunkSize = options.chunkSize ?? 2000;
        this.renderRadius = options.renderRadius ?? 14;
        this.highDetailRadius = options.highDetailRadius ?? 2;

        this.maxChunksPerUpdate =
            options.maxChunksPerUpdate ?? 6;

        this.chunks = new Map();

        this.enabled = true;

        this.stats = {
            generated: 0,
            unloaded: 0,
            loaded: 0,
            workerCompleted: 0,
            workerErrors: 0,
            pendingMeshes: 0
        };

        this.minChunkX = Math.floor(
            terrain.min.x / this.chunkSize
        );

        this.maxChunkX = Math.ceil(
            terrain.max.x / this.chunkSize
        ) - 1;

        this.minChunkZ = Math.floor(
            terrain.min.z / this.chunkSize
        );

        this.maxChunkZ = Math.ceil(
            terrain.max.z / this.chunkSize
        ) - 1;

this.material = new BABYLON.StandardMaterial(
    "worldTerrainMaterial",
    scene
);

this.material.diffuseColor = new BABYLON.Color3(
    1.0, 1.0, 1.0
);

this.material.ambientColor = new BABYLON.Color3(
    1, 1, 1
);

// Preserve vertex colors, but allow actual illumination.
this.material.useVertexColors = true;
this.material.disableLighting = false;

// Small nighttime visibility contribution.
this.material.emissiveColor = new BABYLON.Color3(
    0.1, 0.1, 0.1
);

this.material.backFaceCulling = false;

this.material.specularColor = BABYLON.Color3.Black();
this.material.roughness = 1.0;
	
        this.meshQueue = [];
        this.worker = null;
        this.workerReady = false;
        this.workerBusy = false;
        this.nextTaskId = 1;

        this.initializeWorker();
    }

    getKey(x, z) {
        return `${x},${z}`;
    }

    getChunk(x, z) {
        return this.chunks.get(this.getKey(x, z)) ?? null;
    }

    getCoordinates(position) {
        return {
            x: Math.floor(position.x / this.chunkSize),
            z: Math.floor(position.z / this.chunkSize)
        };
    }

    isInsideWorld(x, z) {
        return (
            x >= this.minChunkX &&
            x <= this.maxChunkX &&
            z >= this.minChunkZ &&
            z <= this.maxChunkZ
        );
    }

	initializeWorker() {
    if (typeof Worker === "undefined") {
        console.warn(
            "[WorldManager] Workers unavailable. Using fallback."
        );
        return;
    }

    try {
        this.worker = new Worker(
            new URL("./terrain-mesh-worker.js", import.meta.url),
            { type: "module" }
        );

        this.worker.onmessage = event => {
            const message = event.data;

            if (message.type === "ready") {
                if (this.workerInitTimer) {
                    clearTimeout(this.workerInitTimer);
                    this.workerInitTimer = null;
                }

                this.workerReady = true;

                console.log(
                    "[WorldManager] Terrain worker ready."
                );

                this.pumpWorker();
                return;
            }

            this.handleWorkerMessage(message);
        };

        this.worker.onerror = error => {
            this.failWorker(error);
        };

        this.worker.onmessageerror = error => {
            this.failWorker(error);
        };

        const pixels = this.terrain.pixels.slice();

        this.worker.postMessage({
            type: "init",
            terrain: {
                width: this.terrain.width,
                height: this.terrain.height,
                worldSize: this.terrain.worldSize,
                minX: this.terrain.min.x,
                minZ: this.terrain.min.z,
                minHeight: this.terrain.minHeight,
                maxHeight: this.terrain.maxHeight,
                heightChannel:
                    this.terrain.heightChannel ?? "average"
            },
            pixels: pixels.buffer
        }, [pixels.buffer]);

        this.workerInitTimer = setTimeout(() => {
            if (!this.workerReady && this.worker) {
                this.failWorker(
                    "Worker initialization timed out."
                );
            }
        }, 5000);

    } catch (error) {
        this.failWorker(error);
    }
}

    handleWorkerMessage(message) {
        if (message.type === "ready") {
            this.workerReady = true;
            this.pumpWorker();
            return;
        }

        if (
            message.type === "complete" ||
            message.type === "error"
        ) {
            const task = this.currentTask;

            this.workerBusy = false;
            this.currentTask = null;

            if (
                task &&
                task.id === message.id
            ) {
                const chunk = this.chunks.get(task.key);

                if (
                    chunk &&
                    !chunk.disposed &&
                    chunk.revision === message.revision
                ) {
                    if (message.type === "complete") {
                        chunk.applyMeshData(
                            message.data,
                            task.lod,
                            this.material
                        );

                        this.stats.workerCompleted++;
                    } else {
                        this.stats.workerErrors++;

                        console.error(
                            "[WorldManager] Mesh generation failed:",
                            message.message
                        );

                        chunk.generateMesh(
                            task.lod,
                            this.material
                        );
                    }
                }
            }

            this.pumpWorker();
        }
    }

    scheduleMesh(chunk, lod) {
        if (!chunk || chunk.disposed) return;

        const neighbors = this.getNeighbors(chunk);

        chunk.setNeighbors(neighbors);
        chunk.lod = lod;
        chunk.revision++;

        const job = {
            id: this.nextTaskId++,
            key: this.getKey(chunk.x, chunk.z),
            revision: chunk.revision,
            lod,

            x: chunk.x,
            z: chunk.z,
            size: chunk.size,

            neighborLODs: {
                north: neighbors.north?.lod ?? lod,
                south: neighbors.south?.lod ?? lod,
                east: neighbors.east?.lod ?? lod,
                west: neighbors.west?.lod ?? lod
            }
        };

        this.meshQueue = this.meshQueue.filter(
            item => item.key !== job.key
        );

        this.meshQueue.push(job);

        this.stats.pendingMeshes = this.meshQueue.length;

        this.pumpWorker();
    }

    pumpWorker() {
        if (
            !this.worker ||
            !this.workerReady ||
            this.workerBusy ||
            this.meshQueue.length === 0
        ) {
            return;
        }

        const job = this.meshQueue.shift();

        this.stats.pendingMeshes = this.meshQueue.length;

        const chunk = this.chunks.get(job.key);

        if (
            !chunk ||
            chunk.disposed ||
            chunk.revision !== job.revision
        ) {
            this.pumpWorker();
            return;
        }

        this.currentTask = job;
        this.workerBusy = true;

        this.worker.postMessage({
            type: "generate",
            id: job.id,
            revision: job.revision,
            job
        });
    }

	processFallbackQueue() {
    if (
        this.fallbackScheduled ||
        this.meshQueue.length === 0 ||
        !this.enabled
    ) {
        return;
    }

    this.fallbackScheduled = true;

    setTimeout(() => {
        this.fallbackScheduled = false;

        const job = this.meshQueue.shift();

        if (job) {
            const chunk = this.chunks.get(job.key);

            if (
                chunk &&
                !chunk.disposed &&
                chunk.revision === job.revision
            ) {
                try {
                    chunk.generateMesh(
                        job.lod,
                        this.material
                    );
                } catch (error) {
                    console.error(
                        "[WorldManager] Synchronous terrain generation failed:",
                        error
                    );
                }
            }
        }

        this.stats.pendingMeshes = this.meshQueue.length;
        this.processFallbackQueue();

    }, 0);
}

    getNeighbors(chunk) {
        return {
            north: this.getChunk(chunk.x, chunk.z - 1),
            south: this.getChunk(chunk.x, chunk.z + 1),
            east: this.getChunk(chunk.x + 1, chunk.z),
            west: this.getChunk(chunk.x - 1, chunk.z)
        };
    }

    rebuildChunk(chunk) {
        this.scheduleMesh(
            chunk,
            chunk.lod < 0 ? 3 : chunk.lod
        );
    }

    createChunk(x, z, lod) {
        if (!this.isInsideWorld(x, z)) return null;

        const chunk = new WorldChunk(
            x,
            z,
            this.chunkSize,
            this.terrain,
            this.scene
        );

        this.chunks.set(
            this.getKey(x, z),
            chunk
        );

        this.stats.generated++;
        this.stats.loaded++;

        this.scheduleMesh(chunk, lod);

        // Existing neighbors may need new boundary stitching.
        for (const neighbor of Object.values(
            this.getNeighbors(chunk)
        )) {
            if (neighbor) {
                this.rebuildChunk(neighbor);
            }
        }

        return chunk;
    }

    getLOD(x, z, cameraPosition) {
        const centerX = (x + 0.5) * this.chunkSize;
        const centerZ = (z + 0.5) * this.chunkSize;

        const distance = Math.hypot(
            centerX - cameraPosition.x,
            centerZ - cameraPosition.z
        );

if (
    distance <=
    this.chunkSize * (this.highDetailRadius + 0.5)
) return 0;

if (
    distance <=
    this.chunkSize * (this.highDetailRadius + 2)
) return 1;

if (distance <= this.chunkSize * 8) return 2;

        return 3;
    }

    getPriority(x, z, cameraPosition, forward) {
        const centerX = (x + 0.5) * this.chunkSize;
        const centerZ = (z + 0.5) * this.chunkSize;

        const dx = centerX - cameraPosition.x;
        const dz = centerZ - cameraPosition.z;

        const distance = Math.hypot(dx, dz);

        const length = Math.max(distance, 1);

        const directionDot = (
            dx / length * forward.x +
            dz / length * forward.z
        );

        // Lower scores are generated first.
        return distance -
            Math.max(0, directionDot) *
            this.chunkSize * 4;
    }

    update(cameraPosition, forward = null) {
        if (!this.enabled || !this.terrain.ready) return;

        const center = this.getCoordinates(cameraPosition);

        const direction = forward ?? {
            x: 0,
            z: 1
        };

        const required = [];

        for (
            let x = Math.max(
                this.minChunkX,
                center.x - this.renderRadius
            );
            x <= Math.min(
                this.maxChunkX,
                center.x + this.renderRadius
            );
            x++
        ) {
            for (
                let z = Math.max(
                    this.minChunkZ,
                    center.z - this.renderRadius
                );
                z <= Math.min(
                    this.maxChunkZ,
                    center.z + this.renderRadius
                );
                z++
            ) {
                const dx = x - center.x;
                const dz = z - center.z;

                if (
                    dx * dx + dz * dz >
                    this.renderRadius * this.renderRadius
                ) continue;

                required.push({
                    x,
                    z,
                    priority: this.getPriority(
                        x,
                        z,
                        cameraPosition,
                        direction
                    ),
                    lod: this.getLOD(
                        x,
                        z,
                        cameraPosition
                    )
                });
            }
        }

        required.sort(
            (a, b) => a.priority - b.priority
        );

        let scheduled = 0;

        for (const item of required) {
            const chunk = this.getChunk(item.x, item.z);

            if (!chunk) {
                if (scheduled >= this.maxChunksPerUpdate) {
                    continue;
                }

                this.createChunk(
                    item.x,
                    item.z,
                    item.lod
                );

                scheduled++;
                continue;
            }

            if (chunk.lod !== item.lod) {
                if (scheduled >= this.maxChunksPerUpdate) {
                    continue;
                }

                this.scheduleMesh(chunk, item.lod);
                scheduled++;
            }
        }

        const unloadRadius = this.renderRadius + 1;

        for (const [key, chunk] of this.chunks) {
            const dx = chunk.x - center.x;
            const dz = chunk.z - center.z;

            if (
                dx * dx + dz * dz >
                unloadRadius * unloadRadius
            ) {
                chunk.dispose();
                this.chunks.delete(key);

                this.meshQueue = this.meshQueue.filter(
                    task => task.key !== key
                );

                this.stats.unloaded++;
                this.stats.loaded--;
            }
        }

        this.stats.pendingMeshes = this.meshQueue.length;

        if (!this.worker) {
            this.processFallbackQueue();
        } else {
            this.pumpWorker();
        }
    }

    getStats() {
        return {
            ...this.stats,
            currentChunks: this.chunks.size,
            chunkSize: this.chunkSize,
            renderRadius: this.renderRadius,
            worldSize: this.terrain.worldSize,
            workerActive: !!this.worker,
            workerReady: this.workerReady
        };
    }

    dispose() {
        this.enabled = false;

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }

        for (const chunk of this.chunks.values()) {
            chunk.dispose();
        }

        this.chunks.clear();
        this.meshQueue.length = 0;

        this.material.dispose();

        this.stats.loaded = 0;
        this.stats.pendingMeshes = 0;
    }

failWorker(reason) {
    console.error(
        "[WorldManager] Worker failure:",
        reason
    );

    this.stats.workerErrors++;

    if (this.workerInitTimer) {
        clearTimeout(this.workerInitTimer);
        this.workerInitTimer = null;
    }

    const failedTask = this.currentTask;
    this.currentTask = null;

    if (this.worker) {
        this.worker.terminate();
        this.worker = null;
    }

    this.workerReady = false;
    this.workerBusy = false;

    // Retry the outstanding task synchronously.
    if (failedTask) {
        const chunk = this.chunks.get(failedTask.key);

        if (
            chunk &&
            !chunk.disposed &&
            chunk.revision === failedTask.revision
        ) {
            this.meshQueue.unshift(failedTask);
        }
    }

    this.stats.pendingMeshes = this.meshQueue.length;
    this.processFallbackQueue();
}
}

