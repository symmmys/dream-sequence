/** One chunk graph for ordinary 3D chunks and explicit 4D corridor chunks. */

import { createSliceAddress, getSliceAddressKey } from './fields/geometry/world-slice.js';
import { CorridorChunk } from './corridor-chunk.js';
import { ambientToSlice, dot4, subtract4 } from './fields/geometry/spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { evaluateAnomalyInfluence, evaluateChunkReachability } from './fields/geometry/anomaly-influence-field.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { evaluateOpticalAnomalyCoupling } from './fields/geometry/optical-contracts.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

class SpatialChunkGraph {
    constructor(topology) {
        if (!topology || typeof topology.getCorridor !== 'function') {
            throw new TypeError('SpatialChunkGraph requires a WorldTopology.');
        }
        this.topology = topology;
        this.slices = new Map();
        this.loadedChunks = new Map();
        this.corridors = new Map();
        this.edges = new Map();
        this.disposed = false;
    }

    registerSlice(slice, options = {}) {
        this.assertActive();
        const record = typeof slice === 'string' ? this.topology.getSlice(slice) : slice;
        if (!record || typeof record.id !== 'string') throw new TypeError('A registered world slice is required.');
        this.topology.getSlice(record.id);
        const chunkSize = options.chunkSize ?? 32;
        if (!Number.isFinite(chunkSize) || chunkSize <= 0) throw new RangeError('Chunk size must be positive.');
        const current = this.slices.get(record.id);
        if (current && current.chunkSize !== chunkSize) throw new Error(`Chunk size already registered for ${record.id}.`);
        this.slices.set(record.id, { sliceId: record.id, chunkSize });
        return { ...this.slices.get(record.id) };
    }

    hasSlice(sliceId) {
        return this.slices.has(sliceId);
    }

    getAddress(sliceId, position) {
        const slice = this.requireSlice(sliceId);
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
            throw new TypeError('Chunk lookup requires a finite x/z position.');
        }
        return createSliceAddress(
            sliceId,
            Math.floor(position.x / slice.chunkSize),
            Math.floor(position.z / slice.chunkSize)
        );
    }

    registerChunk(address, chunk = null) {
        this.assertActive();
        const key = getSliceAddressKey(address);
        const normalized = createSliceAddress(address.sliceId, address.chunkX, address.chunkZ);
        this.requireSlice(normalized.sliceId);
        if (chunk) this.loadedChunks.set(key, chunk);
        this.refreshLoadedChunkNeighbors();
        return this.describeWorldChunk(normalized, key);
    }

    getChunk(address) {
        this.assertActive();
        const normalized = createSliceAddress(address.sliceId, address.chunkX, address.chunkZ);
        this.requireSlice(normalized.sliceId);
        return this.describeWorldChunk(normalized, getSliceAddressKey(normalized));
    }

    setChunkLoaded(address, chunk) {
        this.assertActive();
        const key = getSliceAddressKey(address);
        this.requireSlice(address.sliceId);
        if (chunk) this.loadedChunks.set(key, chunk);
        else this.loadedChunks.delete(key);
        this.refreshLoadedChunkNeighbors();
    }

    registerCorridor(corridorId) {
        this.assertActive();
        const corridor = typeof corridorId === 'string'
            ? this.topology.getCorridor(corridorId)
            : corridorId;
        if (!corridor || typeof corridor.id !== 'string') throw new TypeError('A valid corridor is required.');
        if (this.corridors.has(corridor.id)) throw new Error(`Corridor chunk already exists: ${corridor.id}`);

        const sourceAddress = this.getAddress(corridor.source.sliceId, corridor.source.position);
        const destinationAddress = this.getAddress(corridor.destination.sliceId, corridor.destination.position);
        const chunk = new CorridorChunk(corridor);
        const nodeKey = this.getCorridorKey(corridor.id);
        const sourceKey = getSliceAddressKey(sourceAddress);
        const destinationKey = getSliceAddressKey(destinationAddress);
        const link = {
            id: corridor.id,
            nodeKey,
            chunk,
            sourceAddress,
            destinationAddress,
            sourceKey,
            destinationKey
        };
        this.corridors.set(corridor.id, link);

        if (corridor.traversable) {
            this.addEdge(sourceKey, nodeKey, corridor.id, 1);
            this.addEdge(nodeKey, destinationKey, corridor.id, 1);
            if (corridor.bidirectional) {
                this.addEdge(destinationKey, nodeKey, corridor.id, -1);
                this.addEdge(nodeKey, sourceKey, corridor.id, -1);
            }
        }
        this.refreshLoadedChunkNeighbors();
        return chunk;
    }

    removeCorridor(corridorId) {
        const link = this.corridors.get(corridorId);
        if (!link) return false;
        this.removeEdges(link.nodeKey, corridorId);
        this.removeEdges(link.sourceKey, corridorId);
        this.removeEdges(link.destinationKey, corridorId);
        link.chunk.dispose();
        this.corridors.delete(corridorId);
        this.refreshLoadedChunkNeighbors();
        return true;
    }

    getCorridorChunk(corridorId) {
        return this.corridors.get(corridorId)?.chunk ?? null;
    }

    getNeighbors(address) {
        this.assertActive();
        if (typeof address === 'string' && address.startsWith('corridor:')) {
            return (this.edges.get(address) ?? []).map(function describeEdge(edge) {
                return this.describeNode(edge.to, edge);
            }, this);
        }
        const normalized = typeof address === 'string'
            ? parseAddressKey(address)
            : createSliceAddress(address.sliceId, address.chunkX, address.chunkZ);
        this.requireSlice(normalized.sliceId);
        const result = [
            { chunkX: normalized.chunkX, chunkZ: normalized.chunkZ - 1 },
            { chunkX: normalized.chunkX, chunkZ: normalized.chunkZ + 1 },
            { chunkX: normalized.chunkX + 1, chunkZ: normalized.chunkZ },
            { chunkX: normalized.chunkX - 1, chunkZ: normalized.chunkZ }
        ].map(function toNeighbor(coordinates) {
            const neighborAddress = createSliceAddress(normalized.sliceId, coordinates.chunkX, coordinates.chunkZ);
            return this.describeWorldChunk(neighborAddress, getSliceAddressKey(neighborAddress));
        }, this);
        for (const edge of this.edges.get(getSliceAddressKey(normalized)) ?? []) {
            result.push(this.describeNode(edge.to, edge));
        }
        return result;
    }

    /**
     * Evaluates same-slice and cross-slice chunk reachability through one
     * parameterized spatial/W-distance predicate. Different slices still need
     * an explicit traversable topology edge.
     */
    getReachability(sourceAddress, targetAddress, options = {}) {
        this.assertActive();
        const source = typeof sourceAddress === 'string' ? parseAddressKey(sourceAddress) :
            createSliceAddress(sourceAddress.sliceId, sourceAddress.chunkX, sourceAddress.chunkZ);
        const target = typeof targetAddress === 'string' ? parseAddressKey(targetAddress) :
            createSliceAddress(targetAddress.sliceId, targetAddress.chunkX, targetAddress.chunkZ);
        const maxChunkDistance = options.maxChunkDistance ?? 1;
        if (!Number.isFinite(maxChunkDistance) || maxChunkDistance < 0) {
            throw new RangeError('Maximum chunk distance must be non-negative and finite.');
        }

        if (source.sliceId === target.sliceId) {
            const spatialDistance = Math.abs(target.chunkX - source.chunkX) +
                Math.abs(target.chunkZ - source.chunkZ);
            const result = evaluateChunkReachability({
                spatialDistance, spatialReach: maxChunkDistance, wDistance: 0, wReach: 0
            });
            return { ...result, kind: 'same-slice', sourceAddress: source, targetAddress: target,
                anomalyId: null, freedom: 1 };
        }

        if (!options.position4D) {
            return unreachableResult('missing-ambient-position', source, target);
        }
        const position4D = options.position4D;
        const connection = this.topology.getTraversableNeighbors(source.sliceId).find((neighbor) =>
            neighbor.sliceId === target.sliceId &&
            (!options.corridorId || neighbor.corridorId === options.corridorId)
        );
        if (!connection) return unreachableResult('no-explicit-topology-edge', source, target);

        const anomaly = this.topology.getCorridor(connection.corridorId);
        if (anomaly.type !== 'slice-transition') {
            return unreachableResult('unsupported-cross-slice-reachability', source, target, anomaly.id);
        }
        const sourceSlice = this.topology.getSlice(source.sliceId);
        const targetSlice = this.topology.getSlice(target.sliceId);
        const projected = ambientToSlice(targetSlice.frame, position4D).position;
        const projectedAddress = this.getAddress(target.sliceId, projected);
        const spatialDistance = Math.abs(target.chunkX - projectedAddress.chunkX) +
            Math.abs(target.chunkZ - projectedAddress.chunkZ);
        const wDistance = Math.abs(dot4(subtract4(targetSlice.frame.origin, position4D), sourceSlice.frame.normal));
        const influence = evaluateAnomalyInfluence(anomaly, position4D, options);
        const result = evaluateChunkReachability({
            spatialDistance, spatialReach: maxChunkDistance, wDistance, wReach: influence.wReach
        });
        return {
            ...result,
            kind: 'cross-slice',
            sourceAddress: source,
            targetAddress: target,
            projectedAddress,
            projectedPosition: projected,
            anomalyId: anomaly.id,
            freedom: influence.freedom,
            influenceDistance: influence.distance,
            maxWReach: anomaly.influence.maxWReach
        };
    }

    /**
     * Optical cross-slice reachability uses explicit optical permissions and
     * the independent optical W-coupling field. It never consults traversable
     * flags or player influence modifiers.
     */
    getOpticalReachability(sourceAddress, targetAddress, options = {}) {
        this.assertActive();
        const source = typeof sourceAddress === 'string' ? parseAddressKey(sourceAddress) :
            createSliceAddress(sourceAddress.sliceId, sourceAddress.chunkX, sourceAddress.chunkZ);
        const target = typeof targetAddress === 'string' ? parseAddressKey(targetAddress) :
            createSliceAddress(targetAddress.sliceId, targetAddress.chunkX, targetAddress.chunkZ);
        const maxChunkDistance = options.maxChunkDistance ?? 1;
        if (!Number.isFinite(maxChunkDistance) || maxChunkDistance < 0) {
            throw new RangeError('Maximum optical chunk distance must be non-negative and finite.');
        }
        if (source.sliceId === target.sliceId) {
            const spatialDistance = Math.abs(target.chunkX - source.chunkX) +
                Math.abs(target.chunkZ - source.chunkZ);
            return {
                ...evaluateChunkReachability({
                    spatialDistance, spatialReach: maxChunkDistance, wDistance: 0, wReach: 0
                }),
                kind: 'same-slice', sourceAddress: source, targetAddress: target,
                anomalyId: null, opticalCoupling: 1
            };
        }
        if (!options.position4D) return unreachableResult('missing-ambient-position', source, target);
        const connection = this.topology.getOpticallyConnectedNeighbors(source.sliceId).find((neighbor) =>
            neighbor.sliceId === target.sliceId &&
            (!options.corridorId || neighbor.corridorId === options.corridorId)
        );
        if (!connection) return unreachableResult('no-optical-topology-edge', source, target);

        const anomaly = this.topology.getCorridor(connection.corridorId);
        const sourceSlice = this.topology.getSlice(source.sliceId);
        const targetSlice = this.topology.getSlice(target.sliceId);
        const projected = ambientToSlice(targetSlice.frame, options.position4D).position;
        const projectedAddress = this.getAddress(target.sliceId, projected);
        const spatialDistance = Math.abs(target.chunkX - projectedAddress.chunkX) +
            Math.abs(target.chunkZ - projectedAddress.chunkZ);
        const wDistance = Math.abs(dot4(
            subtract4(targetSlice.frame.origin, options.position4D), sourceSlice.frame.normal
        ));
        const influence = evaluateOpticalAnomalyCoupling(
            anomaly, options.couplingPosition4D ?? options.position4D
        );
        const result = evaluateChunkReachability({
            spatialDistance, spatialReach: maxChunkDistance,
            wDistance, wReach: influence.opticalWReach
        });
        return {
            ...result,
            kind: 'optical-cross-slice',
            sourceAddress: source,
            targetAddress: target,
            projectedAddress,
            projectedPosition: projected,
            anomalyId: anomaly.id,
            opticalCoupling: influence.coupling,
            opticalWReach: influence.opticalWReach,
            maxWOpticalReach: anomaly.optics.maxWOpticalReach
        };
    }

    /** Returns explicitly connected target-slice chunk candidates reachable by light. */
    getOpticallyReachableChunkCandidates(sourceSliceId, position4D, options = {}) {
        this.assertActive();
        const sourceSlice = this.topology.getSlice(sourceSliceId);
        const sourceLocal = ambientToSlice(sourceSlice.frame, position4D).position;
        const sourceAddress = this.getAddress(sourceSliceId, sourceLocal);
        const maxChunkDistance = options.maxChunkDistance ?? 1;
        const candidates = new Map();
        for (const neighbor of this.topology.getOpticallyConnectedNeighbors(sourceSliceId)) {
            if (options.targetSliceId && neighbor.sliceId !== options.targetSliceId) continue;
            const targetSlice = this.topology.getSlice(neighbor.sliceId);
            const projected = ambientToSlice(targetSlice.frame, position4D).position;
            const projectedAddress = this.getAddress(neighbor.sliceId, projected);
            for (let offsetX = -Math.ceil(maxChunkDistance); offsetX <= Math.ceil(maxChunkDistance); offsetX++) {
                for (let offsetZ = -Math.ceil(maxChunkDistance); offsetZ <= Math.ceil(maxChunkDistance); offsetZ++) {
                    const address = createSliceAddress(
                        neighbor.sliceId, projectedAddress.chunkX + offsetX,
                        projectedAddress.chunkZ + offsetZ
                    );
                    const reachability = this.getOpticalReachability(sourceAddress, address, {
                        ...options, position4D, maxChunkDistance, corridorId: neighbor.corridorId
                    });
                    if (reachability.reachable) {
                        candidates.set(getSliceAddressKey(address), { address, reachability });
                    }
                }
            }
        }
        return Array.from(candidates.values());
    }

    /** Returns the target-slice chunks currently reachable from an ambient point. */
    getReachableChunkCandidates(sourceSliceId, position4D, options = {}) {
        this.assertActive();
        const sourceSlice = this.topology.getSlice(sourceSliceId);
        const sourceLocal = ambientToSlice(sourceSlice.frame, position4D).position;
        const sourceAddress = this.getAddress(sourceSliceId, sourceLocal);
        const maxChunkDistance = options.maxChunkDistance ?? 1;
        const candidates = new Map();

        for (const neighbor of this.topology.getTraversableNeighbors(sourceSliceId)) {
            if (options.targetSliceId && neighbor.sliceId !== options.targetSliceId) continue;
            const targetSlice = this.topology.getSlice(neighbor.sliceId);
            const projected = ambientToSlice(targetSlice.frame, position4D).position;
            const projectedAddress = this.getAddress(neighbor.sliceId, projected);
            for (let offsetX = -Math.ceil(maxChunkDistance); offsetX <= Math.ceil(maxChunkDistance); offsetX++) {
                for (let offsetZ = -Math.ceil(maxChunkDistance); offsetZ <= Math.ceil(maxChunkDistance); offsetZ++) {
                    const address = createSliceAddress(
                        neighbor.sliceId, projectedAddress.chunkX + offsetX, projectedAddress.chunkZ + offsetZ
                    );
                    const reachability = this.getReachability(sourceAddress, address, {
                        ...options, position4D, maxChunkDistance, corridorId: neighbor.corridorId
                    });
                    if (reachability.reachable) {
                        candidates.set(getSliceAddressKey(address), { address, reachability });
                    }
                }
            }
        }
        return Array.from(candidates.values());
    }

    getReachableAdjacentWorldChunks(address, position4D, options = {}) {
        const local = this.getNeighbors(address).filter((node) => node.kind === 'world');
        const remote = this.getReachableChunkCandidates(address.sliceId, position4D, options)
            .map(({ address: candidate }) => this.getChunk(candidate));
        return deduplicateNodes([...local, ...remote]);
    }

    getAdjacentWorldChunks(address) {
        const neighbors = this.getNeighbors(address);
        const result = neighbors.filter(function isLocalChunk(node) {
            return node.kind === 'world';
        });
        for (const corridorNode of neighbors.filter(function isCorridor(node) {
            return node.kind === 'corridor';
        })) {
            for (const destination of this.getNeighbors(corridorNode.key)) {
                if (destination.kind !== 'world' || sameAddress(destination.address, address)) continue;
                result.push({ ...destination, viaCorridorId: corridorNode.id });
            }
        }
        return deduplicateNodes(result);
    }

    getNeighborsOfCorridor(corridorId) {
        return this.getNeighbors(this.getCorridorKey(corridorId));
    }

    getRoute(fromAddress, toAddress, maxNodes = 4096) {
        const start = getSliceAddressKey(fromAddress);
        const goal = getSliceAddressKey(toAddress);
        if (fromAddress.sliceId !== toAddress.sliceId &&
            !this.hasSliceRoute(fromAddress.sliceId, toAddress.sliceId)) return null;
        const queue = [start];
        const previous = new Map([[start, null]]);
        while (queue.length && previous.size <= maxNodes) {
            const current = queue.shift();
            if (current === goal) break;
            for (const node of this.getNeighbors(current)) {
                const next = node.key;
                if (previous.has(next)) continue;
                previous.set(next, current);
                queue.push(next);
            }
        }
        if (!previous.has(goal)) return null;
        const route = [];
        for (let key = goal; key !== null; key = previous.get(key)) route.unshift(this.describeNode(key));
        return route;
    }

    hasSliceRoute(fromSliceId, toSliceId) {
        if (fromSliceId === toSliceId) return true;
        const visited = new Set([fromSliceId]);
        const queue = [fromSliceId];
        while (queue.length) {
            const current = queue.shift();
            for (const neighbor of this.topology.getTraversableNeighbors(current)) {
                if (neighbor.sliceId === toSliceId) return true;
                if (visited.has(neighbor.sliceId)) continue;
                visited.add(neighbor.sliceId);
                queue.push(neighbor.sliceId);
            }
        }
        return false;
    }

    getStats() {
        let occupantCount = 0;
        for (const link of this.corridors.values()) occupantCount += link.chunk.occupants.size;
        return {
            slices: this.slices.size,
            loadedWorldChunks: this.loadedChunks.size,
            corridorChunks: this.corridors.size,
            corridorOccupants: occupantCount
        };
    }

    describeWorldChunk(address, key) {
        const chunk = this.loadedChunks.get(key) ?? null;
        return { key, id: key, kind: 'world', address: { ...address }, loaded: Boolean(chunk), chunk };
    }

    describeNode(key, edge = null) {
        const link = Array.from(this.corridors.values()).find(function findCorridor(entry) {
            return entry.nodeKey === key;
        });
        if (link) {
            return {
                key, id: link.id, kind: 'corridor', chunk: link.chunk,
                traversable: link.chunk.corridor.traversable,
                direction: edge?.direction ?? 0,
                corridorId: link.id
            };
        }
        const address = parseAddressKey(key);
        return this.describeWorldChunk(address, key);
    }

    addEdge(from, to, corridorId, direction) {
        const list = this.edges.get(from) ?? [];
        list.push({ to, corridorId, direction });
        this.edges.set(from, list);
    }

    removeEdges(key, corridorId) {
        const list = (this.edges.get(key) ?? []).filter(function keepOtherEdge(edge) {
            return edge.corridorId !== corridorId;
        });
        if (list.length) this.edges.set(key, list);
        else this.edges.delete(key);
    }

    refreshLoadedChunkNeighbors() {
        for (const chunk of this.loadedChunks.values()) {
            if (typeof chunk.setSpatialNeighbors !== 'function') continue;
            chunk.setSpatialNeighbors(
                this.getNeighbors(chunk.address),
                this.getAdjacentWorldChunks(chunk.address)
            );
        }
    }

    getCorridorKey(corridorId) { return `corridor:${corridorId}`; }

    requireSlice(sliceId) {
        const slice = this.slices.get(sliceId);
        if (!slice) throw new Error(`Chunk graph has no registered slice: ${sliceId}`);
        return slice;
    }

    assertActive() {
        if (this.disposed) throw new Error('SpatialChunkGraph has been disposed.');
    }

    dispose() {
        if (this.disposed) return;
        for (const link of this.corridors.values()) link.chunk.dispose();
        this.corridors.clear();
        this.edges.clear();
        this.loadedChunks.clear();
        this.slices.clear();
        this.disposed = true;
    }
}

function unreachableResult(reason, sourceAddress, targetAddress, anomalyId = null) {
    return {
        reachable: false, spatialReachable: false, wReachable: false,
        spatialDistance: Infinity, spatialReach: 0, wDistance: Infinity, wReach: 0,
        kind: 'cross-slice', reason, sourceAddress, targetAddress, anomalyId, freedom: 0
    };
}

function parseAddressKey(key) {
    const [sliceId, chunkX, chunkZ] = JSON.parse(key);
    return createSliceAddress(sliceId, chunkX, chunkZ);
}

function sameAddress(left, right) {
    return left.sliceId === right.sliceId && left.chunkX === right.chunkX && left.chunkZ === right.chunkZ;
}

function deduplicateNodes(nodes) {
    const unique = new Map();
    for (const node of nodes) unique.set(node.key, node);
    return Array.from(unique.values());
}

export { SpatialChunkGraph };
