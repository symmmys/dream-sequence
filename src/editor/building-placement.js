
class BuildingPlacement {
    constructor(system, editorCamera) {
        this.system = system;
        this.editorCamera = editorCamera;

        this.activeBuilding = null;
    }

    select(building) {
        this.activeBuilding = building;

        if (building) {
            this.editorCamera.focus(
                building.position
            );
        }
    }

    update(patch = {}) {
        const building = this.activeBuilding;

        if (!building) {
            throw new Error("No building selected.");
        }

        const position = building.position;

        if (Number.isFinite(patch.x)) {
            position.x = patch.x;
        }

        if (Number.isFinite(patch.z)) {
            position.z = patch.z;
        }

        if (Number.isFinite(patch.y)) {
            position.y = patch.y;
        }

        if (Number.isFinite(patch.rotation)) {
            building.rotation = patch.rotation;
        }

        this.system.rebuild(building);

        this.editorCamera.focus(position);
    }

    setHorizontal(x, z) {
        this.update({ x, z });
    }

    setElevation(y) {
        this.update({ y });
    }

    setRotation(rotation) {
        this.update({ rotation });
    }

    getState() {
        if (!this.activeBuilding) return null;

        return {
            position: { ...this.activeBuilding.position },
            rotation: this.activeBuilding.rotation
        };
    }
}

export { BuildingPlacement };

