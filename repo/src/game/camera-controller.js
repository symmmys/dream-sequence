/**
 * Character-follow camera shared by the main world and anomaly-connected
 * geometry demo. Camera distance is expressed in render units so a change of
 * spatial chart (for example Euclidean -> Poincare) does not collapse zoom.
 */

class CharacterCameraController {
    constructor(scene, camera, character, spatialTransform, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.character = character;
        this.transform = spatialTransform;

        const initialHorizontalDistance = options.distance ?? 24;
        this.height = options.height ?? 8;
        this.targetHeight = options.targetHeight ?? 1.3;
        const initialVerticalOffset = this.height - this.targetHeight;
        this.distance = Math.hypot(initialHorizontalDistance, initialVerticalOffset);
        this.minDistance = options.minDistance ?? 2.5;
        this.maxDistance = options.maxDistance ?? 1200;
        this.zoomSensitivity = options.zoomSensitivity ?? 0.001;
        this.smoothing = options.smoothing ?? 8;
        this.orbitYaw = options.orbitYaw ?? 0;
        this.orbitPitch = options.orbitPitch ?? Math.atan2(
            initialVerticalOffset,
            Math.max(initialHorizontalDistance, 1e-9)
        );
        this.orbitSensitivity = options.orbitSensitivity ?? 0.005;
        this.orbitButton = options.orbitButton ?? 2;
        this.enabled = false;
        this.disposed = false;
        this.renderAnchor = null;
        this.orbitDragging = false;
        this.previousOrbitPointer = { x: 0, y: 0 };

        this.onWheel = this.handleWheel.bind(this);
        this.onOrbitPointerDown = this.handleOrbitPointerDown.bind(this);
        this.onOrbitPointerMove = this.handleOrbitPointerMove.bind(this);
        this.onOrbitPointerUp = this.handleOrbitPointerUp.bind(this);
        this.onBlur = this.handleBlur.bind(this);
        this.onContextMenu = this.handleContextMenu.bind(this);

        this.canvas = scene.getEngine().getRenderingCanvas();
        this.window = typeof window !== 'undefined' ? window : null;
        if (this.canvas) {
            this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
            this.canvas.addEventListener('pointerdown', this.onOrbitPointerDown);
            this.canvas.addEventListener('contextmenu', this.onContextMenu);
        }
        this.window?.addEventListener('pointermove', this.onOrbitPointerMove);
        this.window?.addEventListener('pointerup', this.onOrbitPointerUp);
        this.window?.addEventListener('blur', this.onBlur);
    }

    handleWheel(event) {
        if (!this.enabled || this.disposed) return;
        event.preventDefault();
        this.distance = BABYLON.Scalar.Clamp(
            this.distance * Math.exp(event.deltaY * this.zoomSensitivity),
            this.minDistance,
            this.maxDistance
        );
    }

    handleOrbitPointerDown(event) {
        if (!this.enabled || this.disposed || this.mode === 'free' || event.button !== this.orbitButton) return;
        this.orbitDragging = true;
        this.previousOrbitPointer = { x: event.clientX, y: event.clientY };
        event.preventDefault();
    }

    handleOrbitPointerMove(event) {
        if (!this.orbitDragging || !this.enabled || this.disposed || this.mode === 'free') return;
        const deltaX = event.clientX - this.previousOrbitPointer.x;
        const deltaY = event.clientY - this.previousOrbitPointer.y;
        this.orbitYaw += deltaX * this.orbitSensitivity;
        // Deliberately unbounded: dragging can orbit through the poles and
        // continue around the character without arbitrary pitch cutoffs.
        this.orbitPitch -= deltaY * this.orbitSensitivity;
        this.previousOrbitPointer = { x: event.clientX, y: event.clientY };
    }

    handleOrbitPointerUp() {
        this.orbitDragging = false;
    }

    handleBlur() {
        this.orbitDragging = false;
    }

    handleContextMenu(event) {
        if (this.enabled && !this.disposed && event.button === this.orbitButton) {
            event.preventDefault();
        }
    }

    setSpatialContext(transform, layerMask) {
        this.transform = transform;
        if (Number.isSafeInteger(layerMask)) this.camera.layerMask = layerMask;
    }

    setRenderAnchor(position, yaw, target = null) {
        this.renderAnchor = { position: { ...position }, yaw, target: target ? { ...target } : null };
    }

    clearRenderAnchor() {
        this.renderAnchor = null;
    }

    getTargetPosition() {
        if (this.renderAnchor) {
            return this.renderAnchor.target
                ? { ...this.renderAnchor.target }
                : { ...this.renderAnchor.position, y: this.renderAnchor.position.y + this.targetHeight };
        }

        const playerWorld = this.character.worldPosition;
        const playerRender = this.transform.worldToRender(playerWorld);
        const visualScale = this.transform.getVisualScale?.(playerWorld) ??
            this.character.root?.scaling?.y ?? 1;
        const focusOffset = this.targetHeight * Math.max(1e-6, visualScale);
        return {
            x: playerRender.x,
            y: playerRender.y + focusOffset,
            z: playerRender.z
        };
    }

    getCameraYaw() {
        const anchoredYaw = this.renderAnchor?.yaw;
        const baseYaw = Number.isFinite(anchoredYaw) ? anchoredYaw : (this.character?.yaw ?? 0);
        return baseYaw + this.orbitYaw;
    }

    getCameraAnchorPosition() {
        if (this.renderAnchor) return { ...this.renderAnchor.position };
        return this.transform.worldToRender(this.character.worldPosition);
    }

    getDesiredPosition() {
        const target = this.getTargetPosition();
        const anchor = this.renderAnchor ? this.getCameraAnchorPosition() : target;
        const yaw = this.getCameraYaw();
        const horizontalDistance = this.distance * Math.cos(this.orbitPitch);
        const verticalDistance = this.distance * Math.sin(this.orbitPitch) +
            (this.renderAnchor ? this.targetHeight : 0);
        const desired = {
            x: anchor.x - Math.sin(yaw) * horizontalDistance,
            y: anchor.y + verticalDistance,
            z: anchor.z - Math.cos(yaw) * horizontalDistance
        };
        // A camera is still a point in the active render chart. Keep it inside
        // an open Poincare ball without changing the character's world pose.
        return this.transform.constrainRenderPosition?.(desired) ?? desired;
    }

    applyCameraPose(position, target) {
        const yaw = this.getCameraYaw();
        const pitch = this.orbitPitch;
        // This tangent up-vector remains continuous as pitch passes over either
        // pole, avoiding an artificial camera-angle clamp or sudden roll flip.
        const up = new BABYLON.Vector3(
            Math.sin(yaw) * Math.sin(pitch),
            Math.cos(pitch),
            Math.cos(yaw) * Math.sin(pitch)
        );
        if (this.camera.upVector?.copyFrom) this.camera.upVector.copyFrom(up);
        else this.camera.upVector = up;
        this.camera.setTarget(new BABYLON.Vector3(target.x, target.y, target.z));
    }

    update(deltaSeconds) {
        if (!this.enabled || this.disposed) return;
        const desired = this.getDesiredPosition();
        const target = this.getTargetPosition();
        const alpha = 1 - Math.exp(-this.smoothing * Math.max(0, deltaSeconds));
        const desiredVector = new BABYLON.Vector3(desired.x, desired.y, desired.z);
        BABYLON.Vector3.LerpToRef(this.camera.position, desiredVector, alpha, this.camera.position);
        this.applyCameraPose(this.camera.position, target);
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled) && !this.disposed;
        if (!this.enabled) {
            this.orbitDragging = false;
            return;
        }
        const desired = this.getDesiredPosition();
        this.camera.position.set(desired.x, desired.y, desired.z);
        this.applyCameraPose(this.camera.position, this.getTargetPosition());
    }

    setDistance(distance) {
        this.distance = BABYLON.Scalar.Clamp(distance, this.minDistance, this.maxDistance);
    }

    getZoomInfo() {
        return {
            distance: this.distance,
            minDistance: this.minDistance,
            maxDistance: this.maxDistance,
            orbitYaw: this.orbitYaw,
            orbitPitch: this.orbitPitch
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.enabled = false;
        this.orbitDragging = false;
        if (this.canvas) {
            this.canvas.removeEventListener('wheel', this.onWheel);
            this.canvas.removeEventListener('pointerdown', this.onOrbitPointerDown);
            this.canvas.removeEventListener('contextmenu', this.onContextMenu);
        }
        this.window?.removeEventListener('pointermove', this.onOrbitPointerMove);
        this.window?.removeEventListener('pointerup', this.onOrbitPointerUp);
        this.window?.removeEventListener('blur', this.onBlur);
        this.renderAnchor = null;
        this.camera = null;
        this.character = null;
    }
}

export { CharacterCameraController };
