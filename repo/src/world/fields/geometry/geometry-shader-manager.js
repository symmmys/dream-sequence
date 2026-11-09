
/**
 * GeometryShaderManager
 *
 * GPU-side spatial projection for Babylon.js.
 *
 * Initial implementation:
 * - Three-dimensional Poincare projection.
 * - Configurable curvature.
 * - Configurable world bounds.
 * - Basic diffuse lighting.
 * - Independent shader material management.
 *
 * Initial limitation:
 * - Ordinary meshes only.
 * - Thin instances require a separate shader path.
 */

class GeometryShaderManager {

    constructor(scene, spatialTransform, options = {}) {

        if (!scene || !spatialTransform) {
            throw new Error(
                "GeometryShaderManager requires a scene and SpatialTransform."
            );
        }

        this.scene = scene;
        this.transform = spatialTransform;

        this.enabled = options.enabled ?? true;

        this.materials = new Set();
        this.originalMaterials = new WeakMap();

        this.renderScale =
            options.renderScale ??
            spatialTransform.renderScale;

        this.initializeShaders();

        console.log(
            "[GeometryShaderManager] Initialized."
        );
    }

    // -----------------------------------------
    // SHADER REGISTRATION
    // -----------------------------------------

    initializeShaders() {

        BABYLON.Effect.ShadersStore[
            "somniumPoincareVertexShader"
        ] = this.getVertexShader();

        BABYLON.Effect.ShadersStore[
            "somniumPoincareFragmentShader"
        ] = this.getFragmentShader();
    }

    // -----------------------------------------
    // VERTEX SHADER
    // -----------------------------------------

    getVertexShader() {

        return `
            precision highp float;

            attribute vec3 position;
            attribute vec3 normal;

            uniform mat4 world;
	    uniform mat4 viewProjection;

            uniform vec3 worldCenter;
            uniform vec3 worldHalfBounds;

            uniform float ballRadius;
            uniform float characteristicLength;
            uniform float renderScale;
            uniform float boundaryEpsilon;

            varying vec3 vNormal;
            varying vec3 vWorldPosition;

            float safeTanh(float value) {

                float x = clamp(value, 0.0, 20.0);

                float e = exp(2.0 * x);

                return (e - 1.0) / (e + 1.0);
            }

            vec3 poincareProject(vec3 worldPosition) {

                vec3 delta =
                    worldPosition - worldCenter;

                float distanceFromCenter =
                    length(delta);

                if (distanceFromCenter < 0.000001) {
                    return vec3(0.0);
                }

                vec3 direction =
                    delta / distanceFromCenter;

                vec3 safeDirection =
                    max(abs(direction), vec3(0.000001));

                vec3 boundaryDistances =
                    worldHalfBounds / safeDirection;

                float boundaryDistance =
                    min(
                        boundaryDistances.x,
                        min(
                            boundaryDistances.y,
                            boundaryDistances.z
                        )
                    );

                float u =
                    distanceFromCenter /
                    boundaryDistance;

                u = clamp(
                    u,
                    0.0,
                    1.0 - boundaryEpsilon
                );

                float hyperbolicDistance =
                    characteristicLength *
                    u / (1.0 - u);

                float projectedRadius =
                    ballRadius *
                    safeTanh(
                        hyperbolicDistance /
                        (2.0 * ballRadius)
                    );

                return direction * projectedRadius;
            }

	void main(void) {

    vec4 worldPosition =
        world * vec4(position, 1.0);

    vec3 projectedPosition =
        poincareProject(worldPosition.xyz);

    vWorldPosition =
        projectedPosition * renderScale;

    vNormal =
        normalize(mat3(world) * normal);

    gl_Position =
        viewProjection *
        vec4(vWorldPosition, 1.0);
}

        `;
    }

    // -----------------------------------------
    // FRAGMENT SHADER
    // -----------------------------------------

    getFragmentShader() {

        return `
            precision highp float;

            uniform vec4 baseColor;
            uniform vec3 lightDirection;
            uniform float ambientStrength;

            varying vec3 vNormal;
            varying vec3 vWorldPosition;

            void main(void) {

                vec3 normal =
                    normalize(vNormal);

                float diffuse =
                    max(
                        dot(normal, normalize(-lightDirection)),
                        0.0
                    );

                float illumination =
                    ambientStrength +
                    (1.0 - ambientStrength) * diffuse;

                vec3 color =
                    baseColor.rgb * illumination;

                gl_FragColor =
                    vec4(color, baseColor.a);
            }
        `;
    }

    // -----------------------------------------
    // MATERIAL CREATION
    // -----------------------------------------

    createMaterial(name, options = {}) {

        const material =
            new BABYLON.ShaderMaterial(
                name,
                this.scene,
                {
                    vertex: "somniumPoincare",
                    fragment: "somniumPoincare"
                },
                {
                    attributes: [
                        "position",
                        "normal"
                    ],

                    uniforms: [
                        "world",
                        "worldViewProjection",
                        "worldCenter",
                        "worldHalfBounds",
                        "ballRadius",
                        "characteristicLength",
                        "renderScale",
                        "boundaryEpsilon",
                        "baseColor",
                        "lightDirection",
                        "ambientStrength"
                    ]
                }
            );

        const projection =
            this.transform.projection;

        const bounds = projection.bounds;

        material.setVector3(
            "worldCenter",
            new BABYLON.Vector3(
                projection.center.x,
                projection.center.y,
                projection.center.z
            )
        );

        material.setVector3(
            "worldHalfBounds",
            new BABYLON.Vector3(
                (bounds.maxX - bounds.minX) / 2,
                (bounds.maxY - bounds.minY) / 2,
                (bounds.maxZ - bounds.minZ) / 2
            )
        );

        material.setFloat(
            "ballRadius",
            projection.radius
        );

        material.setFloat(
            "characteristicLength",
            projection.characteristicLength
        );

        material.setFloat(
            "renderScale",
            this.renderScale
        );

        material.setFloat(
            "boundaryEpsilon",
            projection.boundaryEpsilon
        );

        material.setColor4(
            "baseColor",
            options.color ??
                new BABYLON.Color3(0.35, 0.55, 0.3),
            options.alpha ?? 1
        );

        material.setVector3(
            "lightDirection",
            options.lightDirection ??
                new BABYLON.Vector3(-0.5, -1, -0.3).normalize()
        );

        material.setFloat(
            "ambientStrength",
            options.ambientStrength ?? 0.3
        );

        material.backFaceCulling =
            options.backFaceCulling ?? true;

material.onBindObservable.add(mesh => {

    const camera = this.scene.activeCamera;

    if (!camera) return;

    const world = mesh.getWorldMatrix();

    const viewProjection =
        camera.getViewMatrix().multiply(
            camera.getProjectionMatrix()
        );

    material.setMatrix("world", world);

    material.setMatrix(
        "viewProjection",
        viewProjection
    );
});
        this.materials.add(material);

        return material;
    }

    // -----------------------------------------
    // APPLY TO MESH
    // -----------------------------------------

    apply(mesh, options = {}) {

        if (!this.enabled || !mesh) {
            return false;
        }

        if (
            mesh.metadata?.spatiallyTransformed
        ) {
            throw new Error(
                "Cannot apply GPU projection to a CPU-projected mesh."
            );
        }

        if (
            mesh.metadata?.geometryShaderApplied
        ) {
            return false;
        }

        if (!this.originalMaterials.has(mesh)) {

            this.originalMaterials.set(
                mesh,
                mesh.material
            );
        }

        const material =
            this.createMaterial(
                options.name ??
                    `poincare-${mesh.name}`,
                options
            );

        mesh.material = material;

        mesh.metadata = {
            ...(mesh.metadata || {}),
            geometryShaderApplied: true
        };

        return true;
    }

    // -----------------------------------------
    // RESTORE ORIGINAL MATERIAL
    // -----------------------------------------

    restore(mesh) {

        if (!mesh) return false;

        if (!this.originalMaterials.has(mesh)) {
            return false;
        }

        mesh.material =
            this.originalMaterials.get(mesh);

        this.originalMaterials.delete(mesh);

        if (mesh.metadata) {
            delete mesh.metadata.geometryShaderApplied;
        }

        return true;
    }

    // -----------------------------------------
    // CONFIGURATION
    // -----------------------------------------

    setEnabled(enabled) {

        this.enabled = !!enabled;
    }

    // -----------------------------------------
    // DIAGNOSTICS
    // -----------------------------------------

    getStats() {

        return {
            enabled: this.enabled,
            geometry: this.transform.geometryName,
            activeMaterials: this.materials.size,
            renderScale: this.renderScale
        };
    }

    // -----------------------------------------
    // DISPOSAL
    // -----------------------------------------

    dispose() {

        for (const material of this.materials) {
            material.dispose();
        }

        this.materials.clear();

        console.log(
            "[GeometryShaderManager] Disposed."
        );
    }
}

export { GeometryShaderManager };

