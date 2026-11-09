
class EditorCamera {
    constructor(scene, spatialTransform, options = {}) {
        this.scene = scene;
        this.transform = spatialTransform;

        this.camera = new BABYLON.ArcRotateCamera(
            "BuildingEditorCamera",
            -Math.PI / 2,
            Math.PI / 3,
            options.radius ?? 80,
            BABYLON.Vector3.Zero(),
            scene
        );

        this.camera.minZ = 0.01;
        this.camera.maxZ = 1e9;

        // Permit extremely close and distant inspection.
        this.camera.lowerRadiusLimit = 0.1;
        this.camera.upperRadiusLimit = Number.MAX_VALUE;

        this.camera.wheelPrecision = 5;
        this.camera.panningSensibility = 40;
        this.camera.angularSensibilityX = 1000;
        this.camera.angularSensibilityY = 1000;

        this.camera.inertia = 0.8;
        this.camera.detachControl();
    }

    focus(position, radius) {
        const rendered = this.transform.worldToRender(
            position
        );

        this.camera.setTarget(
            new BABYLON.Vector3(
                rendered.x,
                rendered.y,
                rendered.z
            )
        );

        if (Number.isFinite(radius)) {
            this.camera.radius = Math.max(0.1, radius);
        }
    }

    attach(canvas) {
        this.camera.attachControl(canvas, true);
    }

    detach() {
        this.camera.detachControl();
    }

    dispose() {
        this.detach();
        this.camera.dispose();
    }
}

export { EditorCamera };

