import {
    ThinInstanceRenderer
} from "../rendering/thin-instance-renderer.js";

const MATERIALS = {
    wall: [0.72, 0.69, 0.62],
    floor: [0.48, 0.34, 0.22],
    ceiling: [0.83, 0.81, 0.75],
    glass: [0.35, 0.70, 0.86],
    wood: [0.34, 0.20, 0.11],
    furniture: [0.48, 0.31, 0.20]
};

const BUCKETS = [
    "walls",
    "floors",
    "ceilings",
    "glazing",
    "trim",
    "doors",
    "furniture",
    "fixtures"
];

/**
 * BuildingRenderer
 *
 * Converts authoritative architectural components into
 * thin-instance rendering batches.
 *
 * IMPORTANT:
 * This class never applies SpatialTransform directly.
 * ThinInstanceRenderer delegates projection to the
 * existing GeometryRenderer.
 */
class BuildingRenderer {
    constructor(scene, spatialTransform = null) {
        if (!scene) {
            throw new Error(
                "BuildingRenderer requires a scene."
            );
        }

        this.scene = scene;

        // Retained for compatibility with existing integration.
        // Projection ownership belongs to GeometryRenderer.
        this.transform = spatialTransform;

        this.buckets = new Map();
        this.disposed = false;

        this.statistics = {
            submittedComponents: 0,
            rejectedComponents: 0,
            renderedInstances: 0
        };

        for (const kind of BUCKETS) {
            this.createBucket(kind);
        }
    }

    createBucket(kind) {
        const mesh = BABYLON.MeshBuilder.CreateBox(
            `building-prototype-${kind}`,
            { size: 1 },
            this.scene
        );

        const material = new BABYLON.StandardMaterial(
            `building-material-${kind}`,
            this.scene
        );

        const colorName =
            kind === "walls" ? "wall" :
            kind === "floors" ? "floor" :
            kind === "ceilings" ? "ceiling" :
            kind === "glazing" ? "glass" :
            kind === "trim" || kind === "doors" ? "wood" :
            "furniture";

        material.diffuseColor = new BABYLON.Color3(
            ...MATERIALS[colorName]
        );

        if (kind === "glazing") {
            material.alpha = 0.42;

            material.transparencyMode =
                BABYLON.Material.MATERIAL_ALPHABLEND;

            material.backFaceCulling = false;

            material.specularColor =
                new BABYLON.Color3(0.8, 0.9, 1);
        }

        mesh.material = material;

        const renderer = new ThinInstanceRenderer(
            this.scene,
            `building-${kind}`,
            mesh
        );

        this.buckets.set(kind, {
            mesh,
            material,
            renderer
        });
    }

    clear() {
        for (const bucket of this.buckets.values()) {
            bucket.renderer.clear();
        }

        this.statistics.submittedComponents = 0;
        this.statistics.rejectedComponents = 0;
        this.statistics.renderedInstances = 0;
    }

    addComponent(component, building) {
        if (
            !component ||
            !building ||
            !component.position ||
            !component.dimensions
        ) {
            this.statistics.rejectedComponents++;
            return false;
        }

        const bucket = this.buckets.get(component.kind);

        if (!bucket) {
            this.statistics.rejectedComponents++;
            return false;
        }

        const buildingScale = building.scale ?? { x: 1, y: 1, z: 1 };
        const values = [
            component.position.x,
            component.position.y,
            component.position.z,
            component.dimensions.x,
            component.dimensions.y,
            component.dimensions.z,
            buildingScale.x, buildingScale.y, buildingScale.z,
            building.position.x,
            building.position.y,
            building.position.z
        ];

        if (
            !values.every(Number.isFinite) ||
            values.slice(3, 6).some(value => value <= 0)
        ) {
            this.statistics.rejectedComponents++;
            return false;
        }

        const angle = building.rotation ?? 0;

        if (!Number.isFinite(angle)) {
            this.statistics.rejectedComponents++;
            return false;
        }

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const local = component.position;
        const scaledLocal = {
            x: local.x * buildingScale.x,
            y: local.y * buildingScale.y,
            z: local.z * buildingScale.z
        };

        const rotated = {
            x: scaledLocal.x * cos - scaledLocal.z * sin,
            y: scaledLocal.y,
            z: scaledLocal.x * sin + scaledLocal.z * cos
        };

        // Authoritative world coordinates.
        // Do not project this position here.
        const world = {
            x: building.position.x + rotated.x,
            y: building.position.y + rotated.y,
            z: building.position.z + rotated.z
        };

        const rotation = BABYLON.Quaternion.RotationAxis(
            BABYLON.Axis.Y,
            angle + (component.rotation ?? 0)
        );

        // Dimensions remain in authoritative units.
        // GeometryRenderer applies the spatial projection.
        const scale = new BABYLON.Vector3(
            component.dimensions.x * buildingScale.x,
            component.dimensions.y * buildingScale.y,
            component.dimensions.z * buildingScale.z
        );

        const matrix = BABYLON.Matrix.Compose(
            scale,
            rotation,
            new BABYLON.Vector3(
                world.x,
                world.y,
                world.z
            )
        );

        bucket.renderer.addMatrix(matrix);

        this.statistics.submittedComponents++;

        return true;
    }

    update(buildings) {
        if (this.disposed) return;

        this.clear();

        for (const building of buildings) {
            if (!Array.isArray(building.generatedGeometry)) {
                continue;
            }

            for (const component of building.generatedGeometry) {
                this.addComponent(component, building);
            }
        }

        for (const bucket of this.buckets.values()) {
            bucket.renderer.update();

            this.statistics.renderedInstances +=
                bucket.renderer.matrices.length;
        }
    }

    getStats() {
        const result = {};

        for (const [kind, bucket] of this.buckets) {
            result[kind] = {
                instances: bucket.renderer.matrices.length
            };
        }

        return {
            buckets: result,
            submittedComponents:
                this.statistics.submittedComponents,
            rejectedComponents:
                this.statistics.rejectedComponents,
            renderedInstances:
                this.statistics.renderedInstances
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        for (const bucket of this.buckets.values()) {
            bucket.renderer.dispose?.();
            bucket.mesh.dispose();
            bucket.material.dispose();
        }

        this.buckets.clear();
    }
}

export { BuildingRenderer };
