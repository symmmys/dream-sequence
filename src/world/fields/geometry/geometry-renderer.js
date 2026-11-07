
/**
 * GeometryRenderer
 *
 * Applies spatial transformations to Babylon.js
 * mesh geometry.
 *
 * Initial target:
 * - Streamed terrain meshes.
 *
 * Preserves:
 * - Original vertex positions.
 * - Original vertex normals.
 * - Mesh materials.
 * - Vertex colors.
 * - Mesh indices.
 *
 * Simulation coordinates remain unchanged.
 */

class GeometryRenderer {

    constructor(scene, spatialTransform, options = {}) {

        if (!scene || !spatialTransform) {
            throw new Error(
                "GeometryRenderer requires a scene and SpatialTransform."
            );
        }

        this.scene = scene;
        this.transform = spatialTransform;

        this.enabled = options.enabled ?? true;

        this.meshCache = new WeakMap();

        this.statistics = {
            transformedMeshes: 0,
            transformedVertices: 0,
            restoredMeshes: 0
        };

        console.log(
            "[GeometryRenderer] Initialized:",
            this.transform.getInfo()
        );
    }

    // -----------------------------------------
    // MESH TRANSFORMATION
    // -----------------------------------------

    applyMesh(mesh) {

        if (!this.enabled || !mesh) {
            return false;
        }

        if (this.transform.geometryName === "euclidean") {
            return false;
        }

        const cached = this.meshCache.get(mesh);

        if (cached) {
            return false;
        }

        const positions =
            mesh.getVerticesData(
                BABYLON.VertexBuffer.PositionKind
            );

        const indices = mesh.getIndices();

        if (
            !positions ||
            !indices ||
            positions.length === 0
        ) {
            return false;
        }

        // Preserve authoritative mesh geometry.

        const originalPositions =
            new Float32Array(positions);

        const originalNormals =
            mesh.getVerticesData(
                BABYLON.VertexBuffer.NormalKind
            );

        const cache = {
            positions: originalPositions,

            normals: originalNormals
                ? new Float32Array(originalNormals)
                : null
        };

        this.meshCache.set(mesh, cache);

        // Transform every vertex.

        const transformedPositions =
            new Float32Array(positions.length);

        for (
            let i = 0;
            i < positions.length;
            i += 3
        ) {

            const projected =
                this.transform.worldToRender({
                    x: positions[i],
                    y: positions[i + 1],
                    z: positions[i + 2]
                });

            transformedPositions[i] = projected.x;
            transformedPositions[i + 1] = projected.y;
            transformedPositions[i + 2] = projected.z;
        }

        // Recalculate normals in the new geometry.

        const transformedNormals =
            new Float32Array(positions.length);

        BABYLON.VertexData.ComputeNormals(
            transformedPositions,
            indices,
            transformedNormals
        );

        mesh.setVerticesData(
            BABYLON.VertexBuffer.PositionKind,
            transformedPositions,
            true,
            3
        );

        mesh.setVerticesData(
            BABYLON.VertexBuffer.NormalKind,
            transformedNormals,
            true,
            3
        );

        mesh.refreshBoundingInfo();

        mesh.computeWorldMatrix(true);

        mesh.metadata = {
            ...(mesh.metadata || {}),
            spatialGeometry: this.transform.geometryName,
            spatiallyTransformed: true
        };

        this.statistics.transformedMeshes++;

        this.statistics.transformedVertices +=
            positions.length / 3;

        return true;
    }

    // -----------------------------------------
    // RESTORE ORIGINAL GEOMETRY
    // -----------------------------------------

    restoreMesh(mesh) {

        if (!mesh) return false;

        const cache = this.meshCache.get(mesh);

        if (!cache) return false;

        mesh.setVerticesData(
            BABYLON.VertexBuffer.PositionKind,
            cache.positions,
            true,
            3
        );

        if (cache.normals) {

            mesh.setVerticesData(
                BABYLON.VertexBuffer.NormalKind,
                cache.normals,
                true,
                3
            );
        }

        mesh.refreshBoundingInfo();

        mesh.computeWorldMatrix(true);

        if (mesh.metadata) {

            mesh.metadata.spatiallyTransformed = false;

            delete mesh.metadata.spatialGeometry;
        }

        this.meshCache.delete(mesh);

        this.statistics.restoredMeshes++;

        return true;
    }

    // -----------------------------------------
    // RESTORE ALL KNOWN CHUNKS
    // -----------------------------------------

    restoreWorld(worldManager) {

        if (!worldManager) return;

        for (const chunk of worldManager.chunks.values()) {

            if (chunk.mesh) {
                this.restoreMesh(chunk.mesh);
            }
        }
    }

    // -----------------------------------------
    // REPROJECT ALL KNOWN CHUNKS
    // -----------------------------------------

    reprojectWorld(worldManager) {

        if (!worldManager) return;

        for (const chunk of worldManager.chunks.values()) {

            if (!chunk.mesh) continue;

            this.restoreMesh(chunk.mesh);

            this.applyMesh(chunk.mesh);
        }
    }

    // -----------------------------------------
    // CONFIGURATION
    // -----------------------------------------

    setEnabled(enabled, worldManager = null) {

        this.enabled = !!enabled;

        if (!worldManager) return;

        if (this.enabled) {
            this.reprojectWorld(worldManager);
        } else {
            this.restoreWorld(worldManager);
        }
    }

    // -----------------------------------------
    // DIAGNOSTICS
    // -----------------------------------------

    getStats() {

        return {
            enabled: this.enabled,

            geometry:
                this.transform.geometryName,

            ...this.statistics
        };
    }

    // -----------------------------------------
    // DISPOSAL
    // -----------------------------------------

    dispose(worldManager = null) {

        if (worldManager) {
            this.restoreWorld(worldManager);
        }

        this.enabled = false;

        console.log(
            "[GeometryRenderer] Disposed:",
            this.getStats()
        );
    }
	

    // -----------------------------------------
    // THIN INSTANCE TRANSFORMATION
    // -----------------------------------------

    transformInstanceMatrix(matrix) {

        if (
            !this.enabled ||
            this.transform.geometryName === "euclidean"
        ) {
            return matrix;
        }

        if (
            !matrix ||
            !matrix.m ||
            !Array.from(matrix.m).every(Number.isFinite)
        ) {
            return null;
        }

        // Extract translation directly from the matrix.

        const translation = matrix.getTranslation();

        if (
            !translation ||
            !Number.isFinite(translation.x) ||
            !Number.isFinite(translation.y) ||
            !Number.isFinite(translation.z)
        ) {
            return null;
        }

        // Reject positions outside the authoritative
        // projection domain.

        let projected;

        try {

            projected =
                this.transform.worldToRender({
                    x: translation.x,
                    y: translation.y,
                    z: translation.z
                });

        } catch (error) {

            return null;
        }

        const scaling = new BABYLON.Vector3();
        const rotation = new BABYLON.Quaternion();
        const decomposedTranslation =
            new BABYLON.Vector3();

        if (
            !matrix.decompose(
                scaling,
                rotation,
                decomposedTranslation
            )
        ) {
            return null;
        }

        // Validate the local transformation Jacobian.

        let J;

        try {

            J = this.transform.getJacobian({
                x: translation.x,
                y: translation.y,
                z: translation.z
            });

        } catch (error) {

            return null;
        }

        if (!J.every(Number.isFinite)) {
            return null;
        }

        // Estimate volume scaling.

        const determinant =
            J[0] * (J[4] * J[8] - J[5] * J[7]) -
            J[1] * (J[3] * J[8] - J[5] * J[6]) +
            J[2] * (J[3] * J[7] - J[4] * J[6]);

        if (!Number.isFinite(determinant)) {
            return null;
        }

        const scaleFactor = Math.cbrt(
            Math.max(Math.abs(determinant), 1e-18)
        );

        const adjustedScale =
            scaling.scale(scaleFactor);

        return BABYLON.Matrix.Compose(
            adjustedScale,
            rotation,
            new BABYLON.Vector3(
                projected.x,
                projected.y,
                projected.z
            )
        );
    }

	
    // -----------------------------------------
    // CAMERA BOUNDARY PROTECTION
    // -----------------------------------------

    constrainCamera(camera) {

        if (
            !camera ||
            this.transform.geometryName !== "poincare"
        ) {
            return;
        }

        const scale = this.transform.renderScale;
        const radius = this.transform.projection.radius;

        const x = camera.position.x / scale;
        const y = camera.position.y / scale;
        const z = camera.position.z / scale;

        const distance = Math.hypot(x, y, z);

        const maximumRadius =
            radius * (1 - 1e-9);

        if (distance >= maximumRadius) {

            const factor =
                maximumRadius / Math.max(distance, 1e-12);

            camera.position.scaleInPlace(factor);
        }
    }

    getWorldCameraPosition(camera) {

        this.constrainCamera(camera);

        return this.transform.renderToWorld({
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        });
    }




}

export { GeometryRenderer };

