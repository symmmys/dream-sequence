import { DirectionRotation } from "../ecology/tree-generator.js";

class SurfaceDepositRenderer {

    constructor(scene, speciesName, color) {

        this.scene = scene;

        this.speciesName = speciesName;

        this.mesh = BABYLON.MeshBuilder.CreateCylinder(
            "surface_" + speciesName,
            {
                height: 1,
                diameter: 2,
                tessellation: 16
            },
            scene
        );

        this.mesh.position.y = -10000;

        this.mesh.computeWorldMatrix(true);

        this.inverseMeshWorld =
            this.mesh.getWorldMatrix().clone();

        this.inverseMeshWorld.invert();


        const material = new BABYLON.StandardMaterial(
            "surfaceMaterial_" + speciesName,
            scene
        );

        material.diffuseColor = color.clone();

        material.specularColor =
            new BABYLON.Color3(0, 0, 0);

        material.roughness = 1;

        this.mesh.material = material;

        this.mesh.receiveShadows = true;

        this.matrices = [];

        this.buffer = null;

    }


    clear() {

        this.matrices.length = 0;

    }


addPatch(
    position,
    radiusX,
    radiusZ,
    rotation = 0,
    thickness = 0.04,
    normal = BABYLON.Axis.Y
) {
        const scale = new BABYLON.Vector3(
            radiusX,
            thickness,
            radiusZ
        );

const up = normal.normalize();

const yaw = BABYLON.Quaternion.RotationAxis(
    up,
    rotation
);

	const align = DirectionRotation(normal);


const quaternion = align.multiply(yaw);

	const center = position.add(
		normal.normalize().scale(thickness * 0.5)
	);

        const matrix = BABYLON.Matrix.Compose(
            scale,
            quaternion,
            center
        );

        this.matrices.push(matrix);

    }


    update() {

        const requiredSize =
            this.matrices.length * 16;

        if (
            !this.buffer ||
            this.buffer.length < requiredSize
        ) {

            this.buffer = new Float32Array(
                Math.max(
                    requiredSize,
                    this.buffer
                        ? this.buffer.length * 2
                        : 1024
                )
            );

        }


        for (
            let i = 0;
            i < this.matrices.length;
            i++
        ) {

            const localMatrix =
                this.matrices[i].multiply(
                    this.inverseMeshWorld
                );

            localMatrix.copyToArray(
                this.buffer,
                i * 16
            );

        }


        this.mesh.thinInstanceSetBuffer(
            "matrix",
            this.buffer.subarray(
                0,
                requiredSize
            ),
            16,
            true
        );

        this.mesh.thinInstanceRefreshBoundingInfo(true);

    }

}
export { SurfaceDepositRenderer }
