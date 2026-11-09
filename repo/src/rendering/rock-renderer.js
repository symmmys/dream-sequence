import { ThinInstanceRenderer } from "./thin-instance-renderer.js";
class RockRenderer extends ThinInstanceRenderer {

    constructor(scene, shadowGenerator) {

        const mesh = BABYLON.MeshBuilder.CreateSphere(
            "rockPrototype",
            {
                diameter: 1,
                segments: 2
            },
            scene
        );

        const material = new BABYLON.StandardMaterial(
            "rockMaterial",
            scene
        );

        material.diffuseColor =
            new BABYLON.Color3(0.38, 0.36, 0.32);

        material.specularColor =
            new BABYLON.Color3(0.08, 0.08, 0.08);

        mesh.material = material;

        super(
            scene,
            "rocks",
            mesh,
            shadowGenerator
        );

    }

}
export { RockRenderer }
