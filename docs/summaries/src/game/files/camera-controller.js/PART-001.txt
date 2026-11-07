
class CharacterCameraController {
    constructor(
        scene,
        camera,
        character,
        spatialTransform,
        options = {}
    ) {
        this.scene = scene;
        this.camera = camera;
        this.character = character;
        this.transform = spatialTransform;

        // Initial camera framing.
        this.distance = options.distance ?? 24;
        this.height = options.height ?? 8;

        // Zoom constraints.
        this.minDistance = options.minDistance ?? 6;
        this.maxDistance = options.maxDistance ?? 120;
        this.zoomSensitivity = options.zoomSensitivity ?? 0.001;

        // Camera smoothing.
        this.smoothing = options.smoothing ?? 8;

        this.enabled = false;
        this.disposed = false;

        this.onWheel = event => {
            if (!this.enabled || this.disposed) return;

            event.preventDefault();

            // Normalize zoom according to wheel movement.
            const zoomFactor = Math.exp(
                event.deltaY * this.zoomSensitivity
            );

            this.distance = BABYLON.Scalar.Clamp(
                this.distance * zoomFactor,
                this.minDistance,
                this.maxDistance
            );
        };

        this.canvas = scene.getEngine().getRenderingCanvas();

        if (this.canvas) {
            this.canvas.addEventListener(
                "wheel",
                this.onWheel,
                { passive: false }
            );
        }
    }

    // -----------------------------------------
    // CAMERA POSITION
    // -----------------------------------------

    getDesiredPosition() {
        const player = this.character.worldPosition;
        const yaw = this.character.yaw;

        const desiredWorld = {
            x: player.x - Math.sin(yaw) * this.distance,
            y: player.y + this.height,
            z: player.z - Math.cos(yaw) * this.distance
        };

        return this.transform.worldToRender(desiredWorld);
    }

    getTargetPosition() {
        const player = this.character.worldPosition;

        return this.transform.worldToRender({
            x: player.x,
            y: player.y + 1.3,
            z: player.z
        });
    }

    // -----------------------------------------
    // UPDATE
    // -----------------------------------------

    update(deltaSeconds) {
        if (!this.enabled || this.disposed) return;

        const desired = this.getDesiredPosition();
        const target = this.getTargetPosition();

        const alpha = 1 - Math.exp(
            -this.smoothing * Math.max(0, deltaSeconds)
        );

        const desiredVector = new BABYLON.Vector3(
            desired.x,
            desired.y,
            desired.z
        );

        BABYLON.Vector3.LerpToRef(
            this.camera.position,
            desiredVector,
            alpha,
            this.camera.position
        );

        this.camera.setTarget(
            new BABYLON.Vector3(
                target.x,
                target.y,
                target.z
            )
        );
    }

    // -----------------------------------------
    // ENABLE / DISABLE
    // -----------------------------------------

    setEnabled(enabled) {
        this.enabled = !!enabled && !this.disposed;

        if (this.enabled) {
            // Immediately initialize the camera position
            // when entering third-person mode.
            const desired = this.getDesiredPosition();

            this.camera.position.set(
                desired.x,
                desired.y,
                desired.z
            );

            const target = this.getTargetPosition();

            this.camera.setTarget(
                new BABYLON.Vector3(
                    target.x,
                    target.y,
                    target.z
                )
            );
        }
    }

    // -----------------------------------------
    // ZOOM CONFIGURATION
    // -----------------------------------------

    setDistance(distance) {
        this.distance = BABYLON.Scalar.Clamp(
            distance,
            this.minDistance,
            this.maxDistance
        );
    }

    getZoomInfo() {
        return {
            distance: this.distance,
            height: this.height,
            minDistance: this.minDistance,
            maxDistance: this.maxDistance
        };
    }

    // -----------------------------------------
    // CLEANUP
    // -----------------------------------------

    dispose() {
        if (this.disposed) return;

        this.disposed = true;
        this.enabled = false;

        if (this.canvas) {
            this.canvas.removeEventListener(
                "wheel",
                this.onWheel
            );
        }

        this.camera = null;
        this.character = null;
    }
}

export { CharacterCameraController };

