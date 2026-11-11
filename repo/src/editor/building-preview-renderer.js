/**
 * BuildingPreviewRenderer
 *
 * Draws a filled, translucent construction preview plus a bright outline.
 * Preview meshes are temporary; committed geometry is submitted by the
 * authoritative BuildingRenderer through the normal thin-instance pipeline.
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
        this.solids = [];
        this.buildingId = null;
        this.color = new BABYLON.Color3(0.15, 1.0, 0.75);
        this.material = new BABYLON.StandardMaterial("building-preview-solid-material", scene);
        this.material.diffuseColor = new BABYLON.Color3(0.08, 0.48, 0.58);
        this.material.emissiveColor = new BABYLON.Color3(0.04, 0.22, 0.28);
        this.material.alpha = 0.46;
        this.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        this.material.backFaceCulling = false;
    }

    createComponentMatrix(component, building) {
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
        ) return null;

        const angle = building.rotation ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const buildingScale = building.scale ?? { x: 1, y: 1, z: 1 };
        const localX = p.x * buildingScale.x;
        const localY = p.y * buildingScale.y;
        const localZ = p.z * buildingScale.z;
        const worldPosition = new BABYLON.Vector3(
            building.position.x + localX * cos - localZ * sin,
            building.position.y + localY,
            building.position.z + localX * sin + localZ * cos
        );
        const rotation = BABYLON.Quaternion.RotationAxis(
            BABYLON.Axis.Y,
            angle + (component.rotation ?? 0)
        );
        const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(
                d.x * buildingScale.x,
                d.y * buildingScale.y,
                d.z * buildingScale.z
            ),
            rotation,
            worldPosition
        );
        return this.geometryRenderer.transformInstanceMatrix(matrix);
    }

    createComponentLines(component, building) {
        return this.createComponentLinesFromMatrix(this.createComponentMatrix(component, building));
    }

    createComponentLinesFromMatrix(projected) {
        if (!projected) return null;
        const corners = [];
        for (let i = 0; i < 8; i++) {
            const local = new BABYLON.Vector3(
                (i & 1) ? 0.5 : -0.5,
                (i & 2) ? 0.5 : -0.5,
                (i & 4) ? 0.5 : -0.5
            );
            corners.push(BABYLON.Vector3.TransformCoordinates(local, projected));
        }
        const edges = [
            [0, 1], [0, 2], [0, 4],
            [1, 3], [1, 5], [2, 3],
            [2, 6], [3, 7], [4, 5],
            [4, 6], [5, 7], [6, 7]
        ];
        return edges.map(([a, b]) => [corners[a], corners[b]]);
    }

    createComponentSolid(component, building) {
        const projected = this.createComponentMatrix(component, building);
        if (!projected) return null;
        const mesh = BABYLON.MeshBuilder.CreateBox(
            "building-preview-solid",
            { size: 1 },
            this.scene
        );
        const scaling = new BABYLON.Vector3();
        const rotation = new BABYLON.Quaternion();
        const position = new BABYLON.Vector3();
        if (!projected.decompose(scaling, rotation, position)) {
            mesh.dispose();
            return null;
        }
        mesh.position.copyFrom(position);
        mesh.scaling.copyFrom(scaling);
        mesh.rotationQuaternion = rotation;
        mesh.material = this.material;
        mesh.isPickable = false;
        mesh.renderingGroupId = 2;
        mesh.alwaysSelectAsActiveMesh = true;
        return mesh;
    }

    show(building) {
        this.clear();
        if (!building?.generatedGeometry) {
            throw new Error("Building has no generated geometry to preview.");
        }
        this.buildingId = building.id;
        for (const component of building.generatedGeometry) {
            const solid = this.createComponentSolid(component, building);
            if (solid) this.solids.push(solid);

            const edges = this.createComponentLines(component, building);
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
        for (const mesh of this.lines) mesh.dispose();
        for (const mesh of this.solids) mesh.dispose();
        this.lines.length = 0;
        this.solids.length = 0;
        this.buildingId = null;
    }

    commit(building) {
        if (building && building.id !== this.buildingId) {
            throw new Error("Cannot commit a different preview building.");
        }
        this.clear();
    }

    dispose() {
        this.clear();
        this.material.dispose();
    }
}

export { BuildingPreviewRenderer };
