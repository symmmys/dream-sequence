/** Runtime occupancy for one traversable four-dimensional corridor chunk. */

class CorridorChunk {
    constructor(corridor) {
        if (!corridor || typeof corridor.id !== 'string' || !corridor.id) {
            throw new TypeError('CorridorChunk requires a valid corridor.');
        }
        this.id = corridor.id;
        this.kind = 'corridor';
        this.corridor = corridor;
        this.revision = corridor.revision ?? 1;
        this.occupants = new Map();
        this.disposed = false;
    }

    enter(entity, state = {}) {
        this.assertActive();
        if (!entity || (typeof entity !== 'object' && typeof entity !== 'function')) {
            throw new TypeError('Corridor occupants must be spatial entities.');
        }
        if (!this.corridor.traversable) {
            throw new Error(`Corridor is not traversable: ${this.id}`);
        }
        this.occupants.set(entity, {
            direction: state.direction ?? 1,
            progress: state.progress ?? 0,
            position4D: state.position4D ? { ...state.position4D } : null
        });
        return this.getOccupant(entity);
    }

    updateOccupant(entity, progress, position4D) {
        this.assertActive();
        const occupant = this.occupants.get(entity);
        if (!occupant) throw new Error(`Entity is not in corridor ${this.id}.`);
        if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
            throw new RangeError('Corridor progress must be between zero and one.');
        }
        occupant.progress = progress;
        occupant.position4D = position4D ? { ...position4D } : null;
        return this.getOccupant(entity);
    }

    leave(entity) {
        return this.occupants.delete(entity);
    }

    getOccupant(entity) {
        const occupant = this.occupants.get(entity);
        return occupant ? { ...occupant, position4D: occupant.position4D && { ...occupant.position4D } } : null;
    }

    getOccupants() {
        return Array.from(this.occupants, ([entity, state]) => ({
            entity,
            ...state,
            position4D: state.position4D && { ...state.position4D }
        }));
    }

    getStats() {
        return {
            id: this.id,
            kind: this.kind,
            traversable: this.corridor.traversable,
            bidirectional: this.corridor.bidirectional,
            occupants: this.occupants.size,
            revision: this.revision
        };
    }

    assertActive() {
        if (this.disposed) throw new Error(`Corridor chunk has been disposed: ${this.id}`);
    }

    dispose() {
        if (this.disposed) return;
        this.occupants.clear();
        this.disposed = true;
    }
}

export { CorridorChunk };
