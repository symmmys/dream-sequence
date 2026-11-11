
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

        this.baseWheelPrecision = options.wheelPrecision ?? 5;
        this.wheelZoomMultiplier = 1;
        this.setWheelZoomMultiplier(options.wheelZoomMultiplier ?? 1);
        this.camera.panningSensibility = 40;
        this.camera.angularSensibilityX = 1000;
        this.camera.angularSensibilityY = 1000;

        this.camera.inertia = 0.8;
        this.camera.detachControl();
    }

    setWheelZoomMultiplier(multiplier) {
        const supported = [1, 10, 100];
        if (!supported.includes(multiplier)) {
            throw new RangeError(`Unsupported wheel zoom multiplier: ${multiplier}. Choose 1, 10, or 100.`);
        }
        this.wheelZoomMultiplier = multiplier;
        // Babylon's wheelPrecision is a divisor: lower values zoom faster.
        // Keep the original feel at 1x and scale it linearly for the presets.
        this.camera.wheelPrecision = this.baseWheelPrecision / multiplier;
        const wheelInput = this.camera.inputs?.attached?.mousewheel;
        if (wheelInput) wheelInput.wheelPrecision = this.baseWheelPrecision / multiplier;
        return this.wheelZoomMultiplier;
    }

    getWheelZoomMultiplier() { return this.wheelZoomMultiplier; }

    cycleWheelZoomMultiplier(direction = 1) {
        const presets = [1, 10, 100];
        const current = presets.indexOf(this.wheelZoomMultiplier);
        const next = (current + (direction < 0 ? presets.length - 1 : 1)) % presets.length;
        return this.setWheelZoomMultiplier(presets[next]);
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

