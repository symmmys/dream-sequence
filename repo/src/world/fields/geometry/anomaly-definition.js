/** Persistent editor-facing anomaly records. Runtime resources are never stored here. */

import { createSpatialAnomaly } from './spatial-anomaly.js';

const ANOMALY_DEFINITION_SCHEMA_VERSION = 1;
const QUATERNION_AXES = ['x', 'y', 'z', 'w'];

function createAnomalyDefinition(options = {}) {
    if ((options.schemaVersion ?? ANOMALY_DEFINITION_SCHEMA_VERSION) !== ANOMALY_DEFINITION_SCHEMA_VERSION) {
        throw new RangeError(`Unsupported anomaly definition schema: ${options.schemaVersion}`);
    }
    const runtime = createSpatialAnomaly(options.runtime ?? options);
    const definition = {
        schemaVersion: ANOMALY_DEFINITION_SCHEMA_VERSION,
        id: requireId(options.id ?? runtime.id, 'Anomaly id'),
        name: requireName(options.name ?? `Anomaly ${options.id ?? runtime.id}`),
        enabled: options.enabled ?? true,
        revision: options.revision ?? runtime.revision ?? 1,
        source: createEndpointDefinition(options.source ?? runtime.source, 'source'),
        destination: createEndpointDefinition(options.destination ?? runtime.destination, 'destination'),
        connection: cloneJson(options.connection ?? {
            visible: runtime.visible,
            traversable: runtime.traversable,
            bidirectional: runtime.bidirectional
        }),
        endpointConfiguration: {
            source: cloneJson(options.endpointConfiguration?.source ?? {}),
            destination: cloneJson(options.endpointConfiguration?.destination ?? {}),
            ...(options.endpointConfiguration?.placementStatus !== undefined
                ? { placementStatus: options.endpointConfiguration.placementStatus }
                : {})
        },
        runtime
    };
    if (definition.id !== runtime.id) throw new RangeError('Persistent anomaly ID must match its runtime anomaly ID.');
    if (typeof definition.enabled !== 'boolean') throw new TypeError('Anomaly enabled must be boolean.');
    if (definition.endpointConfiguration.placementStatus !== undefined &&
        !['unplaced', 'placed'].includes(definition.endpointConfiguration.placementStatus)) {
        throw new RangeError('Anomaly placementStatus must be unplaced or placed.');
    }
    for (const endpointName of ['source', 'destination']) {
        const placed = definition.endpointConfiguration[endpointName].placed;
        if (placed !== undefined && typeof placed !== 'boolean') {
            throw new TypeError(`Anomaly ${endpointName} placed flag must be boolean.`);
        }
    }
    if (!Number.isSafeInteger(definition.revision) || definition.revision < 1) throw new RangeError('Anomaly revision must be a positive safe integer.');
    return definition;
}

function createAnomalyDefinitionFromRuntime(runtimeAnomaly, options = {}) {
    const runtime = createSpatialAnomaly(runtimeAnomaly);
    return createAnomalyDefinition({
        ...options,
        id: runtime.id,
        runtime,
        source: { ...runtime.source, planeId: runtime.source.sliceId },
        destination: { ...runtime.destination, planeId: runtime.destination.sliceId }
    });
}

function createEndpointDefinition(endpoint, label) {
    if (!endpoint || typeof endpoint !== 'object') throw new TypeError(`Anomaly ${label} endpoint is required.`);
    const planeId = requireId(endpoint.planeId ?? endpoint.sliceId, `${label} Plane id`);
    const position = endpoint.position;
    if (!position || !['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) {
        throw new TypeError(`Anomaly ${label} position requires finite x/y/z coordinates.`);
    }
    const orientation = normalizeQuaternion(endpoint.orientation ?? { x: 0, y: 0, z: 0, w: 1 }, label);
    return {
        planeId,
        sliceId: planeId,
        position: { x: position.x, y: position.y, z: position.z },
        orientation
    };
}

function normalizeQuaternion(value, label) {
    if (!value || !QUATERNION_AXES.every(axis => Number.isFinite(value[axis]))) {
        throw new TypeError(`Anomaly ${label} orientation requires finite quaternion x/y/z/w values.`);
    }
    const length = Math.hypot(value.x, value.y, value.z, value.w);
    if (length < 1e-12) throw new RangeError(`Anomaly ${label} orientation cannot be a zero quaternion.`);
    return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
}

function cloneJson(value) {
    let serialized;
    try { serialized = JSON.stringify(value); }
    catch { throw new TypeError('Anomaly configuration must be JSON-serializable.'); }
    if (serialized === undefined) throw new TypeError('Anomaly configuration must be JSON-serializable.');
    return JSON.parse(serialized);
}

function requireId(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function requireName(value) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError('Anomaly name must be a non-empty string.');
    return value.trim();
}

function createDefaultAnomalyDefinitions(topology) {
    if (!topology || typeof topology.toJSON !== 'function') throw new TypeError('Default anomaly creation requires a WorldTopology.');
    const names = new Map([
        ['geometry-demo-corridor', 'Poincaré Room ↔ Main World'],
        ['geometry-demo-4d-corridor', '4D Room ↔ Poincaré Room'],
        ['geometry-demo-4d-main-world-corridor', '4D Room ↔ Main World']
    ]);
    const records = topology.toJSON().corridors.map(runtime => createAnomalyDefinitionFromRuntime(runtime, {
        name: names.get(runtime.id) ?? runtime.id
    }));
    const ids = new Set();
    for (const record of records) {
        if (ids.has(record.id)) throw new Error(`Duplicate default anomaly ID: ${record.id}`);
        ids.add(record.id);
    }
    return records;
}

export {
    ANOMALY_DEFINITION_SCHEMA_VERSION,
    createAnomalyDefinition,
    createAnomalyDefinitionFromRuntime,
    createDefaultAnomalyDefinitions
};
