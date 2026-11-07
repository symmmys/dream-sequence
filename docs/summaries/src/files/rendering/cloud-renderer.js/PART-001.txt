import { ThinInstanceRenderer } from "./thin-instance-renderer.js";

class CloudRenderer extends ThinInstanceRenderer {
    constructor(scene) {
        const mesh = BABYLON.MeshBuilder.CreateSphere(
            "cloudPrototype",
            {
                diameter: 1,
                segments: 10
            },
            scene
        );

        const material = new BABYLON.StandardMaterial(
            "cloudMaterial",
            scene
        );

        material.diffuseColor =
            BABYLON.Color3.White();

        material.emissiveColor =
            new BABYLON.Color3(
                0.035,
                0.035,
                0.045
            );

        material.specularColor =
            BABYLON.Color3.Black();

        material.useVertexColor = true;
        material.useVertexAlpha = false;

        material.backFaceCulling = false;

        mesh.material = material;
        mesh.isPickable = false;

        super(scene, "clouds", mesh, null);

        this.instanceColors = [];

        this.cloudCount = 0;
    }

    clear() {
        super.clear();

        this.instanceColors.length = 0;
        this.cloudCount = 0;
    }

    getCloudColor(
        speciesName,
        moistureRatio = 0,
        relativeHeight = 0.5
    ) {
        const moisture = BABYLON.Scalar.Clamp(
            moistureRatio,
            0,
            1
        );

        let color;

        switch (speciesName) {
            case "cumulonimbus":
                color = BABYLON.Color3.Lerp(
                    new BABYLON.Color3(
                        0.24, 0.29, 0.39
                    ),
                    new BABYLON.Color3(
                        0.89, 0.92, 0.98
                    ),
                    BABYLON.Scalar.Clamp(
                        relativeHeight,
                        0,
                        1
                    )
                );
                break;

            case "towering":
                color = new BABYLON.Color3(
                    0.82, 0.87, 0.95
                );
                break;

            default:
                color = new BABYLON.Color3(
                    0.98, 0.99, 1.0
                );
                break;
        }

        // Saturated clouds become darker.
        const brightness =
            1.0 - moisture * 0.30;

        color.scaleInPlace(brightness);

        return color;
    }

    addMatrix(
        matrix,
        speciesName = "cumulus",
        moistureRatio = 0,
        relativeHeight = 0.5
    ) {
        super.addMatrix(matrix);

        const color = this.getCloudColor(
            speciesName,
            moistureRatio,
            relativeHeight
        );

        this.instanceColors.push(
            color.r,
            color.g,
            color.b,
            1.0
        );

        this.cloudCount++;
    }

    addCloud(
        matrices,
        moistureRatio = 0,
        speciesName = "cumulus",
        cloudPosition = null
    ) {
        for (const matrix of matrices) {
            const position = matrix.getTranslation();

            const relativeHeight = cloudPosition
                ? BABYLON.Scalar.Clamp(
                    (position.y - cloudPosition.y) /
                    Math.max(1, 1500),
                    0,
                    1
                )
                : 0.5;

            this.addMatrix(
                matrix,
                speciesName,
                moistureRatio,
                relativeHeight
            );
        }
    }

    addMatrices(matrices) {
        this.addCloud(matrices);
    }

    update() {
        // Transform and upload instance matrices.
        super.update();

        const expectedColorLength =
            this.matrices.length * 4;

        if (this.instanceColors.length !== expectedColorLength) {
            console.warn(
                "[CloudRenderer] Instance color buffer mismatch:",
                {
                    matrices: this.matrices.length,
                    colors: this.instanceColors.length / 4
                }
            );

            return;
        }

        const colors = new Float32Array(
            this.instanceColors
        );

        this.mesh.thinInstanceSetBuffer(
            "color",
            colors,
            4,
            true
        );

        this.mesh.thinInstanceRefreshBoundingInfo(true);
    }
}

export { CloudRenderer };
