/**
 * HyperbolicCameraController
 *
 * Converts ordinary Babylon.js camera input into
 * hyperbolically distance-limited geodesic movement.
 *
 * Authoritative world coordinates remain unchanged.
 */

class HyperbolicCameraController {
    constructor(camera, spatialTransform, options = {}) {
        if (!camera || !spatialTransform) {
            throw new Error(
                "HyperbolicCameraController requires a camera and SpatialTransform."
            );
        }

        this.camera = camera;
        this.transform = spatialTransform;
        this.projection = spatialTransform.projection;
        this.metric = spatialTransform.metric;

        this.enabled = options.enabled ?? true;

        this.maxHyperbolicSpeed =
            options.maxHyperbolicSpeed ?? 2.5;

        this.boundaryMargin =
            options.boundaryMargin ?? 1e-7;

        this.maxDeltaSeconds =
            options.maxDeltaSeconds ?? 0.05;

        this.statistics = {
            updates: 0,
            geodesicMoves: 0,
            boundaryCorrections: 0,
            limitedMoves: 0
        };

        this.previousPosition = this.getBallPosition();

        this.constrainCamera();

        this.previousPosition = this.getBallPosition();

        console.log(
            "[HyperbolicCameraController] Initialized:",
            this.getInfo()
        );
    }

    // -----------------------------------------
    // POSITION CONVERSION
    // -----------------------------------------

    getBallPosition() {
        const scale = this.transform.renderScale;

        return {
            x: this.camera.position.x / scale,
            y: this.camera.position.y / scale,
            z: this.camera.position.z / scale
        };
    }

    setBallPosition(position) {
        const scale = this.transform.renderScale;

        this.camera.position.set(
            position.x * scale,
            position.y * scale,
            position.z * scale
        );
    }

    // -----------------------------------------
    // OPEN BALL PROTECTION
    // -----------------------------------------

    constrainPosition(position) {
        const radius = this.projection.radius;

        const maximumRadius =
            radius * (1 - this.boundaryMargin);

        const distance = Math.hypot(
            position.x,
            position.y,
            position.z
        );

        if (distance < maximumRadius) {
            return {
                x: position.x,
                y: position.y,
                z: position.z
            };
        }

        const factor =
            maximumRadius / Math.max(distance, 1e-15);

        this.statistics.boundaryCorrections++;

        return {
            x: position.x * factor,
            y: position.y * factor,
            z: position.z * factor
        };
    }

    constrainCamera() {
        const position = this.constrainPosition(
            this.getBallPosition()
        );

        this.setBallPosition(position);

        return position;
    }

    // -----------------------------------------
    // GEODESIC CAMERA MOVEMENT
    // -----------------------------------------

    update(deltaSeconds) {
        if (!this.enabled) {
            return;
        }

        if (!Number.isFinite(deltaSeconds) ||
            deltaSeconds <= 0) {
            return;
        }

        const elapsed = Math.min(
            deltaSeconds,
            this.maxDeltaSeconds
        );

        const start = this.previousPosition;

        // Babylon.js has already processed ordinary
        // keyboard and mouse camera input.
        const target = this.constrainPosition(
            this.getBallPosition()
        );

        let distance;

        try {
            distance = this.metric.distance(
                start,
                target
            );
        } catch (error) {
            this.setBallPosition(start);
            return;
        }

        if (!Number.isFinite(distance)) {
            this.setBallPosition(start);
            return;
        }

        if (distance < 1e-10) {
            this.setBallPosition(target);
            this.previousPosition = target;
            return;
        }

        // Limit movement by hyperbolic distance.
        const maximumStep =
            this.maxHyperbolicSpeed * elapsed;

        const fraction = Math.min(
            1,
            maximumStep / distance
        );

        if (fraction < 1) {
            this.statistics.limitedMoves++;
        }

        // Analytic Poincare geodesic interpolation.
        const nextPosition =
            this.metric.interpolateGeodesic(
                start,
                target,
                fraction
            );

        const safePosition =
            this.constrainPosition(nextPosition);

        this.setBallPosition(safePosition);

        this.previousPosition = safePosition;

        this.statistics.updates++;
        this.statistics.geodesicMoves++;
    }

    // -----------------------------------------
    // AUTHORITATIVE WORLD POSITION
    // -----------------------------------------

    getWorldPosition() {
        this.constrainCamera();

        return this.transform.renderToWorld({
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        });
    }

    // -----------------------------------------
    // TELEPORT / POSITION SYNCHRONIZATION
    // -----------------------------------------

    synchronize() {
        this.constrainCamera();
        this.previousPosition = this.getBallPosition();
    }

    // -----------------------------------------
    // CONFIGURATION
    // -----------------------------------------

    setEnabled(enabled) {
        this.enabled = !!enabled;

        this.synchronize();
    }

    getInfo() {
        return {
            enabled: this.enabled,
            geometry: "poincare",
            movement: "hyperbolic-geodesic",
            maxHyperbolicSpeed: this.maxHyperbolicSpeed,
            boundaryMargin: this.boundaryMargin,
            boundaryReachable: false,
            statistics: { ...this.statistics }
        };
    }

    getStats() {
        return this.getInfo();
    }

    // -----------------------------------------
    // DISPOSAL
    // -----------------------------------------

    dispose() {
        this.enabled = false;
        this.camera = null;
        this.previousPosition = null;
    }
}

export { HyperbolicCameraController };
