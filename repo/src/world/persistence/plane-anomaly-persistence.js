import { createAnomalyDefinition, createDefaultAnomalyDefinitions } from '../fields/geometry/anomaly-definition.js';
import { createDemoPlaneDefinitions, createPlaneDefinition, createPlaneObjectDefinition } from '../fields/geometry/plane-registry.js';

// Separate database: anomaly topology belongs to Planes, not saved Worlds.
const DATABASE_NAME = 'somnium-planes';
const DATABASE_VERSION = 2;
const PLANE_STORE = 'planes';
const ANOMALY_STORE = 'anomalies';
const BOOTSTRAP_STORE = 'bootstrap';
const DEMO_BOOTSTRAP_KEY = 'geometry-demo-v1';
const DEMO_OBJECT_BOOTSTRAP_KEY = 'geometry-demo-plane-objects-v1';

class PlaneAnomalyPersistence {
    constructor(options = {}) {
        this.indexedDB = options.indexedDB ?? globalThis.indexedDB;
        this.database = null;
        this.opening = null;
    }

    async open() {
        if (this.database) return this.database;
        if (this.opening) return this.opening;
        if (!this.indexedDB) throw new Error('IndexedDB is unavailable in this browser.');
        this.opening = new Promise((resolve, reject) => {
            const request = this.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = event => {
                const db = request.result;
                if (!db.objectStoreNames.contains(PLANE_STORE)) db.createObjectStore(PLANE_STORE, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(ANOMALY_STORE)) db.createObjectStore(ANOMALY_STORE, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(BOOTSTRAP_STORE)) db.createObjectStore(BOOTSTRAP_STORE, { keyPath: 'key' });
                // v1 Plane records lacked container and object authoring data.
                // Upgrade them in-place without touching anomaly IDs or records.
                if (event.oldVersion < 2 && db.objectStoreNames.contains(PLANE_STORE)) {
                    const store = request.transaction.objectStore(PLANE_STORE);
                    const cursorRequest = store.openCursor();
                    cursorRequest.onsuccess = () => {
                        const cursor = cursorRequest.result;
                        if (!cursor) return;
                        try { cursor.update(createPlaneDefinition(cursor.value)); }
                        catch (error) { console.error('[PlaneAnomalyPersistence] Plane migration skipped an invalid record:', error); }
                        cursor.continue();
                    };
                }
            };
            request.onsuccess = () => {
                this.database = request.result;
                this.database.onversionchange = () => { this.database.close(); this.database = null; };
                resolve(this.database);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => console.warn('[PlaneAnomalyPersistence] Database open is blocked.');
        });
        try { return await this.opening; }
        finally { this.opening = null; }
    }

    async transaction(storeNames, mode, operation) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, mode);
            let result;
            try { result = operation(tx); }
            catch (error) { tx.abort(); reject(error); return; }
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('Plane/anomaly transaction aborted.'));
        });
    }

    async bootstrapDemo(topology) {
        const planes = createDemoPlaneDefinitions(topology);
        const anomalies = createDefaultAnomalyDefinitions(topology).map(record => createAnomalyDefinition(record));
        let insertedPlanes = 0;
        let insertedAnomalies = 0;
        let alreadyBootstrapped = false;
        await this.transaction([PLANE_STORE, ANOMALY_STORE, BOOTSTRAP_STORE], 'readwrite', tx => {
            const markerStore = tx.objectStore(BOOTSTRAP_STORE);
            const markerRequest = markerStore.get(DEMO_BOOTSTRAP_KEY);
            markerRequest.onsuccess = () => {
                if (markerRequest.result) { alreadyBootstrapped = true; return; }
                const planeStore = tx.objectStore(PLANE_STORE);
                const anomalyStore = tx.objectStore(ANOMALY_STORE);
                let remaining = planes.length + anomalies.length;
                const finish = () => {
                    remaining -= 1;
                    if (remaining === 0) markerStore.add({ key: DEMO_BOOTSTRAP_KEY, completedAt: new Date().toISOString() });
                };
                for (const plane of planes) {
                    const request = planeStore.get(plane.id);
                    request.onsuccess = () => {
                        if (!request.result) { planeStore.add(plane); insertedPlanes += 1; }
                        finish();
                    };
                }
                for (const anomaly of anomalies) {
                    const request = anomalyStore.get(anomaly.id);
                    request.onsuccess = () => {
                        if (!request.result) { anomalyStore.add(anomaly); insertedAnomalies += 1; }
                        finish();
                    };
                }
            };
        });
        return { alreadyBootstrapped, insertedPlanes, insertedAnomalies };
    }

    /** Additively migrate the legacy demo room contents into Plane-local records once. */
    async bootstrapDemoPlaneObjects() {
        const defaults = new Map([
            ['geometry-demo-room', [
                { id: 'demo-sphere', type: 'sphere', name: 'Amber Sphere', position: { x: -15, y: 1.25, z: -9 }, dimensions: { x: 2.4, y: 2.4, z: 2.4 }, material: { color: '#e59c42' } },
                { id: 'demo-cube', type: 'box', name: 'Violet Cube', position: { x: -5, y: 1.1, z: 2 }, dimensions: { x: 2.1, y: 2.1, z: 2.1 }, material: { color: '#9e78e8' } },
                { id: 'demo-cylinder', type: 'cylinder', name: 'Green Cylinder', position: { x: 6, y: 1.1, z: -9 }, dimensions: { x: 1.8, y: 2.2, z: 1.8 }, material: { color: '#6ec58d' } },
                { id: 'demo-torus', type: 'torus', name: 'Blue Torus', position: { x: 15, y: 2.1, z: 7 }, dimensions: { x: 2.7, y: 2.7, z: 2.7 }, material: { color: '#55a7dc' }, parameters: { thickness: 0.17 } },
                { id: 'demo-title-label', type: 'label', name: 'Room Title', text: 'SOMNIUM  |  POINCARE TEST CHAMBER', position: { x: 0, y: 10.5, z: -1 }, material: { color: '#ffffff' }, parameters: { width: 14 } },
                { id: 'demo-sphere-label', type: 'label', name: 'Sphere Label', text: '01  SPHERE  |  AMBER', position: { x: -15, y: 4.1, z: -9 }, parameters: { width: 7 } },
                { id: 'demo-cube-label', type: 'label', name: 'Cube Label', text: '02  CUBE  |  VIOLET', position: { x: -5, y: 3.9, z: 2 }, parameters: { width: 7 } },
                { id: 'demo-cylinder-label', type: 'label', name: 'Cylinder Label', text: '03  CYLINDER  |  GREEN', position: { x: 6, y: 4, z: -9 }, parameters: { width: 8 } },
                { id: 'demo-torus-label', type: 'label', name: 'Torus Label', text: '04  TORUS  |  BLUE', position: { x: 15, y: 5, z: 7 }, parameters: { width: 7 } }
            ]],
            ['geometry-demo-4d-chamber', [
                { id: 'demo-hypercube4d', type: 'hypercube4d', name: 'Procedural Tesseract', position: { x: 0, y: 4, z: 0 }, dimensions: { x: 8.4, y: 8.4, z: 8.4 }, material: { color: '#58d7f0' }, parameters: { halfExtent: 4.2, initialAngles: { xw: 0.42, yw: 0.36, zw: 0.32 }, angularSpeeds: { xw: 0.68, yw: 0.49, zw: 0.33 }, viewerW: 0 } }
            ]]
        ]);
        let alreadyBootstrapped = false;
        let migratedObjects = 0;
        let migratedPlanes = 0;
        await this.transaction([PLANE_STORE, BOOTSTRAP_STORE], 'readwrite', tx => {
            const markerStore = tx.objectStore(BOOTSTRAP_STORE);
            const markerRequest = markerStore.get(DEMO_OBJECT_BOOTSTRAP_KEY);
            markerRequest.onsuccess = () => {
                if (markerRequest.result) { alreadyBootstrapped = true; return; }
                const planeStore = tx.objectStore(PLANE_STORE);
                let remaining = defaults.size;
                const finish = () => {
                    remaining -= 1;
                    if (remaining === 0) markerStore.add({ key: DEMO_OBJECT_BOOTSTRAP_KEY, completedAt: new Date().toISOString() });
                };
                for (const [planeId, objects] of defaults) {
                    const request = planeStore.get(planeId);
                    request.onsuccess = () => {
                        if (request.result) {
                            const plane = createPlaneDefinition(request.result);
                            const ids = new Set(plane.objects.map(object => object.id));
                            const additions = objects.filter(object => !ids.has(object.id)).map(createPlaneObjectDefinition);
                            if (additions.length) {
                                plane.objects.push(...additions);
                                planeStore.put(plane);
                                migratedObjects += additions.length;
                                migratedPlanes += 1;
                            }
                        }
                        finish();
                    };
                }
            };
        });
        return { alreadyBootstrapped, migratedPlanes, migratedObjects };
    }

    async savePlane(input) {
        const record = createPlaneDefinition(input);
        await this.transaction([PLANE_STORE], 'readwrite', tx => tx.objectStore(PLANE_STORE).put(record));
        return record;
    }

    async saveAnomaly(input) {
        const record = createAnomalyDefinition(input);
        await this.transaction([ANOMALY_STORE], 'readwrite', tx => tx.objectStore(ANOMALY_STORE).put(record));
        return cloneJson(record);
    }

    async listPlanes() { return (await this.#getAll(PLANE_STORE)).map(createPlaneDefinition); }
    async listAnomalies() { return this.#getAll(ANOMALY_STORE); }
    async getPlane(id) { const record = await this.#get(PLANE_STORE, id); return record ? createPlaneDefinition(record) : null; }
    async getAnomaly(id) { return this.#get(ANOMALY_STORE, id); }

    async deleteAnomaly(id) {
        await this.transaction([ANOMALY_STORE], 'readwrite', tx => tx.objectStore(ANOMALY_STORE).delete(id));
    }

    async #getAll(storeName) {
        const db = await this.open();
        return requestResult(db, storeName, 'getAll');
    }

    async #get(storeName, id) {
        const db = await this.open();
        return requestResult(db, storeName, 'get', id);
    }

    close() {
        this.database?.close();
        this.database = null;
    }
}

function requestResult(db, storeName, method, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = value === undefined ? tx.objectStore(storeName)[method]() : tx.objectStore(storeName)[method](value);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
    });
}

function cloneJson(value) {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError('Plane data must be JSON-serializable.');
    return JSON.parse(serialized);
}

export {
    DATABASE_NAME as PLANE_ANOMALY_DATABASE_NAME,
    DATABASE_VERSION as PLANE_ANOMALY_DATABASE_VERSION,
    PLANE_STORE as PLANE_OBJECT_STORE,
    ANOMALY_STORE as ANOMALY_OBJECT_STORE,
    PlaneAnomalyPersistence
};
