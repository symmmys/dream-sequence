/** Converts editor-persisted Plane/anomaly definitions into validated runtime anomalies. */

import { createSpatialAnomaly } from './spatial-anomaly.js';
import { sliceToAmbient } from './spatial-4d.js';

const DEFAULT_REGION_PADDING = Object.freeze({ x: 7, y: 8, z: 7, w: 6 });

function createRuntimeAnomalyFromDefinition(definition, topology, options = {}) {
    if (!definition || typeof definition !== 'object') throw new TypeError('A persistent anomaly definition is required.');
    if (!topology || typeof topology.getSlice !== 'function') throw new TypeError('Runtime anomaly conversion requires a WorldTopology.');
    const runtime = clone(definition.runtime ?? {});
    const sourcePlaneId = definition.source?.planeId ?? definition.source?.sliceId;
    const destinationPlaneId = definition.destination?.planeId ?? definition.destination?.sliceId;
    const sourceSlice = topology.getSlice(sourcePlaneId);
    const destinationSlice = topology.getSlice(destinationPlaneId);
    const source = {
        ...runtime.source,
        sliceId: sourcePlaneId,
        position: clone(definition.source.position),
        orientation: normalizeQuaternion(definition.source.orientation)
    };
    const destination = {
        ...runtime.destination,
        sliceId: destinationPlaneId,
        position: clone(definition.destination.position),
        orientation: normalizeQuaternion(definition.destination.orientation)
    };
    const sourceAmbient = sliceToAmbient(sourceSlice.frame, source.position);
    const destinationAmbient = sliceToAmbient(destinationSlice.frame, destination.position);
    const padding = { ...DEFAULT_REGION_PADDING, ...(options.regionPadding ?? {}) };
    const region = { min: {}, max: {} };
    for (const axis of ['x', 'y', 'z', 'w']) {
        region.min[axis] = Math.min(sourceAmbient[axis], destinationAmbient[axis]) - padding[axis];
        region.max[axis] = Math.max(sourceAmbient[axis], destinationAmbient[axis]) + padding[axis];
    }
    const connection = definition.connection ?? {};
    const enabled = definition.enabled === true &&
        definition.endpointConfiguration?.placementStatus !== 'unplaced';
    const nextRevision = Math.max(
        Number.isSafeInteger(definition.revision) ? definition.revision : 1,
        Number.isSafeInteger(runtime.revision) ? runtime.revision : 1
    );
    return createSpatialAnomaly({
        ...runtime,
        id: definition.id,
        revision: nextRevision,
        source,
        destination,
        region,
        visible: enabled && (connection.visible ?? runtime.visible ?? true),
        traversable: enabled && (connection.traversable ?? runtime.traversable ?? false),
        bidirectional: connection.bidirectional ?? runtime.bidirectional ?? true,
        optics: {
            ...(runtime.optics ?? {}),
            enabled: enabled && (runtime.optics?.enabled ?? true),
            bidirectional: connection.bidirectional ?? runtime.optics?.bidirectional ?? true
        }
    });
}

function normalizeQuaternion(value = { x: 0, y: 0, z: 0, w: 1 }) {
    if (!['x', 'y', 'z', 'w'].every(axis => Number.isFinite(value?.[axis]))) {
        throw new TypeError('Runtime anomaly endpoint orientation requires finite quaternion values.');
    }
    const length = Math.hypot(value.x, value.y, value.z, value.w);
    if (length < 1e-12) throw new RangeError('Runtime anomaly endpoint orientation cannot be zero.');
    return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export { DEFAULT_REGION_PADDING, createRuntimeAnomalyFromDefinition };
