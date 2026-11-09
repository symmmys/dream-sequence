
function createId(prefix = "building") {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

class BuildingModel {
    constructor(options = {}) {
        this.id = options.id ?? createId();

        this.name = options.name ?? "New Building";
        this.type = options.type ?? "residential";

        this.position = {
            x: options.position?.x ?? 0,
            y: options.position?.y ?? 0,
            z: options.position?.z ?? 0
        };

        this.rotation = options.rotation ?? 0;

        this.rooms = clone(options.rooms ?? []);
        this.furniture = clone(options.furniture ?? []);
        this.fixtures = clone(options.fixtures ?? []);

        // Independently placed architectural elements.
        this.components = clone(options.components ?? []);

        this.metadata = {
            version: 1,
            createdAt: options.metadata?.createdAt ??
                new Date().toISOString()
        };
    }

    addRoom(options = {}) {
        const room = {
            id: createId("room"),
            name: options.name ?? "Room",
            floor: options.floor ?? 0,

            bounds: {
                minX: options.minX ?? 0,
                maxX: options.maxX ?? 8,
                minZ: options.minZ ?? 0,
                maxZ: options.maxZ ?? 8
            },

            wallHeight: options.wallHeight ?? 3.2,
            wallThickness: options.wallThickness ?? 0.18,

            floorThickness: options.floorThickness ?? 0.15,

            openings: clone(options.openings ?? [])
        };

        this.rooms.push(room);
        return room;
    }

    addOpening(roomId, options = {}) {
        const room = this.rooms.find(r => r.id === roomId);

        if (!room) {
            throw new Error("Room not found.");
        }

        const opening = {
            id: createId("opening"),
            type: options.type ?? "door",
            side: options.side ?? "north",
            offset: options.offset ?? 0.5,
            width: options.width ?? 0.9,
            height: options.height ?? 2.1,
            sill: options.sill ?? 0
        };

        room.openings.push(opening);
        return opening;
    }

    addComponent(options = {}) {
        const component = {
            id: createId("component"),
            kind: options.kind ?? "furniture",
            type: options.type ?? "custom",

            position: {
                x: options.position?.x ?? 0,
                y: options.position?.y ?? 0,
                z: options.position?.z ?? 0
            },

            dimensions: {
                x: options.dimensions?.x ?? 1,
                y: options.dimensions?.y ?? 1,
                z: options.dimensions?.z ?? 1
            },

            rotation: options.rotation ?? 0,
            material: options.material ?? "wood"
        };

        this.components.push(component);
        return component;
    }

    addFurniture(options = {}) {
        return this.addComponent({
            ...options,
            kind: "furniture"
        });
    }

    validate() {
        if (!this.id || !Array.isArray(this.rooms)) {
            throw new Error("Invalid building.");
        }

        for (const room of this.rooms) {
            const b = room.bounds;

            if (
                !b ||
                ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) ||
                b.maxX <= b.minX ||
                b.maxZ <= b.minZ ||
                !Number.isFinite(room.floor) ||
                !Number.isFinite(room.wallHeight) ||
                room.wallHeight <= 0
            ) {
                throw new Error(`Invalid room: ${room.id}`);
            }

            for (const opening of room.openings ?? []) {
                if (
                    !["north", "south", "east", "west"].includes(opening.side) ||
                    !["door", "window"].includes(opening.type) ||
                    !Number.isFinite(opening.offset) ||
                    opening.offset < 0 ||
                    opening.offset > 1 ||
                    !Number.isFinite(opening.width) ||
                    opening.width <= 0 ||
                    !Number.isFinite(opening.height) ||
                    opening.height <= 0 ||
                    !Number.isFinite(opening.sill) ||
                    opening.sill < 0 ||
                    opening.sill + opening.height > room.wallHeight
                ) {
                    throw new Error(`Invalid opening in room ${room.id}`);
                }
            }
        }

        return true;
    }

    serialize() {
        this.validate();

        return {
            id: this.id,
            type: "building",
            version: 1,
            name: this.name,
            buildingType: this.type,
            position: clone(this.position),
            rotation: this.rotation,
            rooms: clone(this.rooms),
            furniture: clone(this.furniture),
            fixtures: clone(this.fixtures),
            components: clone(this.components),
            metadata: clone(this.metadata)
        };
    }

    static deserialize(data) {
        if (!data || data.type !== "building" ||
            ![1].includes(data.version)) {
            throw new Error("Unsupported building record.");
        }

        const building = new BuildingModel({
            id: data.id,
            name: data.name,
            type: data.buildingType,
            position: data.position,
            rotation: data.rotation,
            rooms: data.rooms,
            furniture: data.furniture,
            fixtures: data.fixtures,
            components: data.components,
            metadata: data.metadata
        });

        building.validate();
        return building;
    }
}

export { BuildingModel, createId };

