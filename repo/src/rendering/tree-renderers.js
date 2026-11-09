import { ThinInstanceRenderer } from "./thin-instance-renderer.js";

// Compatibility wrapper for existing tree code.

class TreeRenderer extends ThinInstanceRenderer {

    constructor(scene, name, shadowGenerator) {

        const mesh = BABYLON.MeshBuilder.CreateCylinder(
            name,
            {
                height: 1,
                diameterBottom: 1,
                diameterTop: 0.55,
                tessellation: 8
            },
            scene
        );

        super(
            scene,
            name,
            mesh,
            shadowGenerator
        );

    }

}


// Compatibility wrapper for foliage.

class FoliageRenderer extends ThinInstanceRenderer {

    constructor(scene, name, color, shadowGenerator) {

        const mesh = BABYLON.MeshBuilder.CreateSphere(
            name,
            {
                diameter: 1,
                segments: 2
            },
            scene
        );

        const material = new BABYLON.StandardMaterial(
            name + "Material",
            scene
        );

        material.diffuseColor = color;

        material.specularColor =
            new BABYLON.Color3(0.05, 0.05, 0.05);

        mesh.material = material;

        super(
            scene,
            name,
            mesh,
            shadowGenerator
        );

    }

}
export { TreeRenderer, FoliageRenderer }
