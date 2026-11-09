
class ThinInstanceRenderer {
    constructor(scene, name, mesh, shadowGenerator) {
        this.scene = scene;
        this.mesh = mesh;
        this.matrices = [];
        this.buffer = null;

        this.localMatrix = BABYLON.Matrix.Identity();

        this.mesh.position.y = -10000;
        this.mesh.computeWorldMatrix(true);

        this.inverseMeshWorld =
            this.mesh.getWorldMatrix().clone();

        this.inverseMeshWorld.invert();

        this.mesh.isPickable = false;

        if (shadowGenerator) {
            shadowGenerator.addShadowCaster(
                this.mesh,
                true
            );
        }
    }

    clear() {
        this.matrices.length = 0;
    }

    addMatrix(matrix) {
        this.matrices.push(matrix);
    }

    addMatrices(matrices) {
        this.matrices.push(...matrices);
    }

    add(
        position,
        scale,
        rotation = BABYLON.Quaternion.Identity()
    ) {
        const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(scale, scale, scale),
            rotation,
            position
        );

        this.matrices.push(matrix);
    }

    update() {
        const geometryRenderer =
            this.scene.metadata?.geometryRenderer;

        const capacity = this.matrices.length * 16;

        // Retain buffer capacity between updates.
        if (
            !this.buffer ||
            this.buffer.length < capacity
        ) {
            this.buffer = new Float32Array(
                Math.max(1024, capacity)
            );
        }

        let writeIndex = 0;

        for (
            let i = 0;
            i < this.matrices.length;
            i++
        ) {
            const sourceMatrix = this.matrices[i];

            if (!sourceMatrix || !sourceMatrix.m) {
                continue;
            }

            // Validate directly without allocating an array.
            const values = sourceMatrix.m;
            let valid = true;

            for (let j = 0; j < 16; j++) {
                if (!Number.isFinite(values[j])) {
                    valid = false;
                    break;
                }
            }

            if (!valid) continue;

            const transformedMatrix =
                geometryRenderer
                    ? geometryRenderer.transformInstanceMatrix(
                        sourceMatrix
                    )
                    : sourceMatrix;

            if (!transformedMatrix) continue;

            transformedMatrix.multiplyToRef(
                this.inverseMeshWorld,
                this.localMatrix
            );

            this.localMatrix.copyToArray(
                this.buffer,
                writeIndex * 16
            );

            writeIndex++;
        }

        const requiredSize = writeIndex * 16;

        this.mesh.thinInstanceSetBuffer(
            "matrix",
            this.buffer.subarray(0, requiredSize),
            16,
            true
        );

        this.mesh.thinInstanceRefreshBoundingInfo(true);
    }
}

export { ThinInstanceRenderer };

