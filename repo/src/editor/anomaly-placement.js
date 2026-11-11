/** Pure helpers for editing persistent anomaly mouth placement. */

const ENDPOINTS = Object.freeze(['source', 'destination']);
const AXES = Object.freeze(['x', 'y', 'z']);

function quaternionFromEulerDegrees(yaw = 0, pitch = 0, roll = 0) {
    for (const [label, value] of Object.entries({ yaw, pitch, roll })) {
        if (!Number.isFinite(value)) throw new TypeError(`Anomaly ${label} must be finite.`);
    }
    // Match Babylon.js RotationYawPitchRoll(yaw, pitch, roll):
    // yaw about Y, pitch about X, roll about Z.
    const halfYaw = yaw * Math.PI / 360;
    const halfPitch = pitch * Math.PI / 360;
    const halfRoll = roll * Math.PI / 360;
    const cy = Math.cos(halfYaw), sy = Math.sin(halfYaw);
    const cp = Math.cos(halfPitch), sp = Math.sin(halfPitch);
    const cr = Math.cos(halfRoll), sr = Math.sin(halfRoll);
    return normalizeQuaternion({
        x: cy * sp * cr + sy * cp * sr,
        y: sy * cp * cr - cy * sp * sr,
        z: cy * cp * sr - sy * sp * cr,
        w: cy * cp * cr + sy * sp * sr
    });
}

function normalizeQuaternion(q) {
    if (!q || !['x', 'y', 'z', 'w'].every(key => Number.isFinite(q[key]))) {
        throw new TypeError('Anomaly orientation requires finite quaternion x/y/z/w values.');
    }
    const length = Math.hypot(q.x, q.y, q.z, q.w);
    if (length < 1e-12) throw new RangeError('Anomaly orientation cannot be a zero quaternion.');
    return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function eulerDegreesFromQuaternion(input) {
    const q = normalizeQuaternion(input);
    const sinPitch = 2 * (q.w * q.x - q.y * q.z);
    const pitch = Math.abs(sinPitch) >= 1
        ? Math.sign(sinPitch) * Math.PI / 2
        : Math.asin(sinPitch);
    const yaw = Math.atan2(
        2 * (q.w * q.y + q.z * q.x),
        1 - 2 * (q.x * q.x + q.y * q.y)
    );
    const roll = Math.atan2(
        2 * (q.w * q.z + q.x * q.y),
        1 - 2 * (q.x * q.x + q.z * q.z)
    );
    return { yaw: yaw * 180 / Math.PI, pitch: pitch * 180 / Math.PI, roll: roll * 180 / Math.PI };
}

function updateAnomalyEndpoint(record, endpointName, patch) {
    if (!ENDPOINTS.includes(endpointName)) throw new RangeError(`Unknown anomaly endpoint: ${endpointName}`);
    const next = clone(record);
    const current = next[endpointName];
    const planeId = patch.planeId ?? current.planeId;
    if (typeof planeId !== 'string' || !planeId.trim()) throw new TypeError('Endpoint Plane id must be a non-empty string.');
    const position = { ...current.position, ...(patch.position ?? {}) };
    if (!AXES.every(axis => Number.isFinite(position[axis]))) throw new TypeError('Endpoint position requires finite x/y/z coordinates.');
    const orientation = patch.orientation ? normalizeQuaternion(patch.orientation) : normalizeQuaternion(current.orientation);
    next[endpointName] = { planeId, sliceId: planeId, position, orientation };
    next.runtime[endpointName] = {
        ...next.runtime[endpointName],
        sliceId: planeId,
        position: { ...position }
    };
    next.endpointConfiguration ??= { source: {}, destination: {} };
    next.endpointConfiguration[endpointName] = {
        ...(next.endpointConfiguration[endpointName] ?? {}),
        planeId,
        orientation: { ...orientation },
        position: { ...position }
    };
    next.endpointConfiguration.placementStatus = next.endpointConfiguration.placementStatus === 'unplaced'
        ? (ENDPOINTS.every(name => next.endpointConfiguration[name]?.placed === true) ? 'placed' : 'unplaced')
        : 'placed';
    if (ENDPOINTS.every(name => next.endpointConfiguration[name]?.placed === true)) {
        next.endpointConfiguration.placementStatus = 'placed';
    }
    return next;
}

function markAnomalyEndpointPlaced(record, endpointName, patch) {
    const next = updateAnomalyEndpoint(record, endpointName, patch);
    next.endpointConfiguration[endpointName].placed = true;
    next.endpointConfiguration.placementStatus = ENDPOINTS.every(name =>
        next.endpointConfiguration[name]?.placed === true
    ) ? 'placed' : 'unplaced';
    next.enabled = next.endpointConfiguration.placementStatus === 'placed' ? next.enabled : false;
    next.revision = (next.revision ?? 0) + 1;
    next.runtime.revision = next.revision;
    return next;
}

function alignAnomalyEndpoints(record) {
    const next = clone(record);
    const aligned = {
        planeId: next.destination.planeId,
        position: { ...next.source.position },
        orientation: { ...next.source.orientation }
    };
    return updateAnomalyEndpoint(next, 'destination', aligned);
}

function updateAnomalyConnection(record, patch) {
    const next = clone(record);
    next.connection = { ...next.connection, ...clone(patch) };
    for (const key of ['visible', 'traversable', 'bidirectional']) {
        if (key in patch) {
            if (typeof patch[key] !== 'boolean') throw new TypeError(`Anomaly ${key} must be boolean.`);
            next.runtime[key] = patch[key];
        }
    }
    next.revision = (next.revision ?? 0) + 1;
    next.runtime.revision = next.revision;
    return next;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export {
    quaternionFromEulerDegrees,
    eulerDegreesFromQuaternion,
    normalizeQuaternion,
    updateAnomalyEndpoint,
    markAnomalyEndpointPlaced,
    alignAnomalyEndpoints,
    updateAnomalyConnection
};
