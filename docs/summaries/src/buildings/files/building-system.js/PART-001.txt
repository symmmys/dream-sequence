
import { BuildingModel } from "./building-model.js";
import { BuildingGenerator } from "./building-generator.js";
import { BuildingRenderer } from "./building-renderer.js";

class BuildingSystem {
    constructor(scene, geometryRenderer, options = {}) {
        this.scene = scene;
        this.geometryRenderer = geometryRenderer;

        this.generator = new BuildingGenerator();

        this.renderer = new BuildingRenderer(
            scene,
            options.spatialTransform ?? null
        );

        this.buildings = new Map();
        this.disposed = false;
        this.terrain = options.terrain ?? null;
    }

    createBuilding(options = {}) {
        const building = new BuildingModel(options);

        building.validate();

        this.buildings.set(building.id, building);
        this.rebuild(building);

        return building;
    }

    addBuilding(building) {
        if (!(building instanceof BuildingModel)) {
            building = BuildingModel.deserialize(building);
        }

        building.validate();
        this.buildings.set(building.id, building);
        this.rebuild(building);

        return building;
    }

    removeBuilding(id) {
        const removed = this.buildings.delete(id);

        if (removed) this.refresh();

        return removed;
    }

    getBuilding(id) {
        return this.buildings.get(id) ?? null;
    }

    rebuild(building) {
        building.validate();

        building.generatedGeometry =
            this.generator.generate(building);

        this.refresh();
    }

    refresh() {
        if (this.disposed) return;

        this.renderer.update(
            Array.from(this.buildings.values())
        );
    }

    createRoom(buildingId, options = {}) {
        const building = this.getBuilding(buildingId);

        if (!building) {
            throw new Error("Building not found.");
        }

        const room = building.addRoom(options);

        this.rebuild(building);

        return room;
    }

    addOpening(buildingId, roomId, options = {}) {
        const building = this.getBuilding(buildingId);

        if (!building) {
            throw new Error("Building not found.");
        }

        const opening = building.addOpening(
            roomId,
            options
        );

        this.rebuild(building);

        return opening;
    }

    addFurniture(buildingId, options = {}) {
        const building = this.getBuilding(buildingId);

        if (!building) {
            throw new Error("Building not found.");
        }

        const furniture = building.addFurniture(options);

        this.rebuild(building);

        return furniture;
    }

    captureWorld(world) {
        if (!world?.entities) {
            throw new Error("Invalid world state.");
        }

        const other = world.entities.manual.filter(
            entity => entity.type !== "building"
        );

        const committed = Array.from(
            this.buildings.values()
        ).filter(
            building =>
                building.metadata?.editorPreview !== true
        );

        world.entities.manual = [
            ...other,
            ...committed.map(
                building => building.serialize()
            )
        ];

        return world;
    }

    restoreWorld(world) {
        if (
            !world?.entities ||
            !Array.isArray(world.entities.manual)
        ) {
            throw new Error(
                "Invalid world entity collection."
            );
        }

        this.buildings.clear();

        for (const entity of world.entities.manual) {
            if (entity.type === "building") {
                this.addBuilding(entity);
            }
        }

        this.refresh();
    }

    getStats() {
        const buildings = Array.from(
            this.buildings.values()
        );

        return {
            buildings: buildings.length,
            provisional: buildings.filter(
                building =>
                    building.metadata?.editorPreview === true
            ).length,
            committed: buildings.filter(
                building =>
                    building.metadata?.editorPreview !== true
            ).length,
            rooms: buildings.reduce(
                (sum, building) =>
                    sum + building.rooms.length,
                0
            ),
            instances: this.renderer.getStats()
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;
        this.buildings.clear();
        this.renderer.dispose();
    }
}

export { BuildingSystem };

