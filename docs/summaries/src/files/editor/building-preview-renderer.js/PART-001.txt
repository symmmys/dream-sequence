
/**
 * BuildingPreviewRenderer
 *
 * Draws temporary architectural outlines without modifying
 * authoritative building geometry or shared render materials.
 */
class BuildingPreviewRenderer {
    constructor(scene, geometryRenderer) {
        if (!scene || !geometryRenderer) {
            throw new Error(
                "Preview renderer requires scene and GeometryRenderer."
            );
        }

        this.scene = scene;
        this.geometryRenderer = geometryRenderer;
        this.lines = [];
        this.buildingId = null;

        this.color = new BABYLON.Color3(
            0.15, 1.0, 0.75
        );
    }

    createComponentLines(component, building) {
        const p = component.position;
        const d = component.dimensions;

        if (
            !p || !d ||
            ![
                p.x, p.y, p.z,
                d.x, d.y, d.z,
                building.position.x,
                building.position.y,
                building.position.z
            ].every(Number.isFinite) ||
            d.x <= 0 || d.y <= 0 || d.z <= 0
        ) {
            return null;
        }

        const angle = building.rotation ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const worldPosition = new BABYLON.Vector3(
            building.position.x + p.x * cos - p.z * sin,
            building.position.y + p.y,
            building.position.z + p.x * sin + p.z * cos
        );

        const rotation = BABYLON.Quaternion.RotationAxis(
            BABYLON.Axis.Y,
            angle + (component.rotation ?? 0)
        );

        const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(d.x, d.y, d.z),
            rotation,
            worldPosition
        );

        const projected =
            this.geometryRenderer.transformInstanceMatrix(matrix);

        if (!projected) return null;

        const corners = [];

        for (let i = 0; i < 8; i++) {
            const local = new BABYLON.Vector3(
                (i & 1) ? 0.5 : -0.5,
                (i & 2) ? 0.5 : -0.5,
                (i & 4) ? 0.5 : -0.5
            );

            corners.push(
                BABYLON.Vector3.TransformCoordinates(
                    local,
                    projected
                )
            );
        }

        const edges = [
            [0, 1], [0, 2], [0, 4],
            [1, 3], [1, 5],
            [2, 3], [2, 6],
            [3, 7], [4, 5],
            [4, 6], [5, 7], [6, 7]
        ];

        return edges.map(([a, b]) => [
            corners[a],
            corners[b]
        ]);
    }

    show(building) {
        this.clear();

        if (!building?.generatedGeometry) {
            throw new Error(
                "Building has no generated geometry to preview."
            );
        }

        this.buildingId = building.id;

        for (const component of building.generatedGeometry) {
            const edges = this.createComponentLines(
                component,
                building
            );

            if (!edges) continue;

            const mesh = BABYLON.MeshBuilder.CreateLineSystem(
                "building-preview-outline",
                { lines: edges },
                this.scene
            );

            mesh.color = this.color;
            mesh.alpha = 1;
            mesh.isPickable = false;
            mesh.renderingGroupId = 2;

            mesh.metadata = {
                type: "building-preview-outline",
                buildingId: building.id
            };

            this.lines.push(mesh);
        }

        return this.lines.length;
    }

    clear() {
        for (const mesh of this.lines) {
            mesh.dispose();
        }

        this.lines.length = 0;
        this.buildingId = null;
    }

    commit(building) {
        if (
            building &&
            building.id !== this.buildingId
        ) {
            throw new Error(
                "Cannot commit a different preview building."
            );
        }

        this.clear();
    }

    dispose() {
        this.clear();
    }
}

export { BuildingPreviewRenderer };

