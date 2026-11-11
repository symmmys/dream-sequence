/** Explicit cross-slice visibility and traversal graph. */

import { sliceToAmbient, subtract4, norm4, dot4 } from './spatial-4d.js';
import { createSpatialAnomaly, containsAmbientPoint, BEZIER_CORRIDOR_ANOMALY, SLICE_TRANSITION_ANOMALY } from './spatial-anomaly.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { createWorldSlice } from './world-slice.js';
import { resolveAnomalyInfluence } from './anomaly-influence-field.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const WORLD_TOPOLOGY_SCHEMA_VERSION = 1;
const DEFAULT_ENDPOINT_TOLERANCE = 1e-7;

class WorldTopology {
    #slices = new Map();
    #corridors = new Map();
    #endpointTolerance;

    constructor(options = {}) {
        this.#endpointTolerance = options.endpointTolerance ?? DEFAULT_ENDPOINT_TOLERANCE;
        if (!Number.isFinite(this.#endpointTolerance) || this.#endpointTolerance <= 0) {
            throw new RangeError('Endpoint tolerance must be a positive finite number.');
        }
    }

    registerSlice(input) {
        const slice = createWorldSlice(input);
        if (this.#slices.has(slice.id)) throw new Error(`Slice already exists: ${slice.id}`);
        this.#slices.set(slice.id, cloneRecord(slice));
        return cloneRecord(slice);
    }

    unregisterSlice(sliceId) {
        this.#requireSlice(sliceId);
        if (this.#findCorridors(sliceId).length) {
            throw new Error('Remove connected corridors before unregistering a slice.');
        }
        this.#slices.delete(sliceId);
    }

    registerCorridor(input) {
        let corridor = createSpatialAnomaly(input);
        if (this.#corridors.has(corridor.id)) {
            throw new Error(`Corridor already exists: ${corridor.id}`);
        }
        this.#validateEndpoints(corridor);
        corridor = this.#resolveInfluence(corridor);
        this.#corridors.set(corridor.id, cloneRecord(corridor));
        return cloneRecord(corridor);
    }

    updateCorridor(input) {
        let corridor = createSpatialAnomaly(input);
        const current = this.#corridors.get(corridor.id);
        if (!current) throw new Error(`Unknown corridor: ${corridor.id}`);
        if (corridor.revision <= current.revision) {
            throw new RangeError('Updated corridor revision must increase.');
        }
        this.#validateEndpoints(corridor);
        corridor = this.#resolveInfluence(corridor);
        this.#corridors.set(corridor.id, cloneRecord(corridor));
        return cloneRecord(corridor);
    }

    removeCorridor(corridorId) {
        if (!this.#corridors.delete(corridorId)) throw new Error(`Unknown corridor: ${corridorId}`);
    }

    getSlice(sliceId) {
        return cloneRecord(this.#requireSlice(sliceId));
    }

    getCorridor(corridorId) {
        const corridor = this.#corridors.get(corridorId);
        if (!corridor) throw new Error(`Unknown corridor: ${corridorId}`);
        return cloneRecord(corridor);
    }

    // Preview visibility never grants simulation or traversal permission.
    getVisibleDestinations(sliceId) {
        this.#requireSlice(sliceId);
        return this.#findCorridors(sliceId)
            .filter(function isVisible(link) {
                return link.corridor.visible;
            })
            .map(function toVisibleDestination(link) {
                return { corridorId: link.corridor.id, sliceId: link.toSliceId, renderOnly: true };
            });
    }

    // One-way links permit travel only from their declared source.
    getTraversableNeighbors(sliceId) {
        this.#requireSlice(sliceId);
        return this.#findCorridors(sliceId)
            .filter(function isTraversable(link) {
                return link.corridor.traversable && (
                    link.fromSource || link.corridor.bidirectional
                );
            })
            .map(function toTraversableNeighbor(link) {
                return { corridorId: link.corridor.id, sliceId: link.toSliceId };
            });
    }

    hasTraversableConnection(fromSliceId, toSliceId) {
        return this.getTraversableNeighbors(fromSliceId).some(function matchesDestination(link) {
            return link.sliceId === toSliceId;
        });
    }

    // Optical topology is deliberately independent from player traversal.
    // An anomaly may transmit light without being physically traversable.
    getOpticallyConnectedNeighbors(sliceId) {
        this.#requireSlice(sliceId);
        return this.#findCorridors(sliceId)
            .filter(function isOpticallyConnected(link) {
                const optics = link.corridor.optics;
                return link.corridor.type === SLICE_TRANSITION_ANOMALY &&
                    optics?.enabled === true && (link.fromSource || optics.bidirectional === true);
            })
            .map(function describeOpticalNeighbor(link) {
                return {
                    corridorId: link.corridor.id,
                    sliceId: link.toSliceId,
                    entrySide: link.fromSource ? 'source' : 'destination',
                    fromSource: link.fromSource
                };
            });
    }

    hasOpticalConnection(fromSliceId, toSliceId) {
        return this.getOpticallyConnectedNeighbors(fromSliceId).some(function matchesOpticalDestination(link) {
            return link.sliceId === toSliceId;
        });
    }

    toJSON() {
        return {
            schemaVersion: WORLD_TOPOLOGY_SCHEMA_VERSION,
            slices: Array.from(this.#slices.values(), cloneRecord),
            corridors: Array.from(this.#corridors.values(), cloneRecord)
        };
    }

    static fromJSON(data) {
        if (!data || data.schemaVersion !== WORLD_TOPOLOGY_SCHEMA_VERSION) {
            throw new RangeError(
                `Unsupported WorldTopology schema version: ${data?.schemaVersion}`
            );
        }
        if (!Array.isArray(data.slices) || !Array.isArray(data.corridors)) {
            throw new TypeError('WorldTopology data requires slice and corridor arrays.');
        }
        const topology = new WorldTopology();
        for (const slice of data.slices) topology.registerSlice(slice);
        for (const corridor of data.corridors) topology.registerCorridor(corridor);
        return topology;
    }

    #requireSlice(sliceId) {
        const slice = this.#slices.get(sliceId);
        if (!slice) throw new Error(`Unknown slice: ${sliceId}`);
        return slice;
    }

    #findCorridors(sliceId) {
        const links = [];
        for (const corridor of this.#corridors.values()) {
            if (corridor.source.sliceId === sliceId) {
                links.push({
                    corridor,
                    fromSource: true,
                    toSliceId: corridor.destination.sliceId
                });
            } else if (corridor.destination.sliceId === sliceId) {
                links.push({
                    corridor,
                    fromSource: false,
                    toSliceId: corridor.source.sliceId
                });
            }
        }
        return links;
    }

    #resolveInfluence(corridor) {
        if (corridor.type !== SLICE_TRANSITION_ANOMALY) return corridor;
        const source = this.#requireSlice(corridor.source.sliceId);
        const destination = this.#requireSlice(corridor.destination.sliceId);
        const sourceAmbient = sliceToAmbient(source.frame, corridor.source.position);
        const destinationAmbient = sliceToAmbient(destination.frame, corridor.destination.position);
        return resolveAnomalyInfluence(corridor, sourceAmbient, destinationAmbient, source.frame.normal);
    }

    #validateEndpoints(corridor) {
        const source = this.#requireSlice(corridor.source.sliceId);
        const destination = this.#requireSlice(corridor.destination.sliceId);
        const sourcePoint = sliceToAmbient(source.frame, corridor.source.position);
        const destinationPoint = sliceToAmbient(destination.frame, corridor.destination.position);
        if (corridor.type === BEZIER_CORRIDOR_ANOMALY) {
            const sourceError = norm4(subtract4(corridor.centerline[0], sourcePoint));
            const destinationError = norm4(subtract4(corridor.centerline[3], destinationPoint));
            if (sourceError > this.#endpointTolerance || destinationError > this.#endpointTolerance) {
                throw new RangeError('Corridor centreline endpoints must match their slice endpoints.');
            }
            return;
        }

        if (corridor.type !== SLICE_TRANSITION_ANOMALY) {
            throw new RangeError(`Unsupported topology anomaly type: ${corridor.type}`);
        }
        if (!containsAmbientPoint(corridor.region, sourcePoint, this.#endpointTolerance) ||
            !containsAmbientPoint(corridor.region, destinationPoint, this.#endpointTolerance)) {
            throw new RangeError('Slice-transition anomaly bounds must contain both slice endpoints.');
        }
        const normalAlignment = Math.abs(
            source.frame.normal.x * destination.frame.normal.x +
            source.frame.normal.y * destination.frame.normal.y +
            source.frame.normal.z * destination.frame.normal.z +
            source.frame.normal.w * destination.frame.normal.w
        );
        if (normalAlignment < 1 - 1e-7) {
            throw new RangeError('Slice-transition anomalies require parallel or anti-parallel slice normals.');
        }
        const separation = Math.abs(dot4(
            subtract4(destination.frame.origin, source.frame.origin),
            source.frame.normal
        ));
        if (separation <= this.#endpointTolerance) {
            throw new RangeError('Slice-transition anomalies must connect distinct 3D slice planes.');
        }
    }
}

function cloneRecord(record) {
    return JSON.parse(JSON.stringify(record));
}

export { WORLD_TOPOLOGY_SCHEMA_VERSION, WorldTopology };
