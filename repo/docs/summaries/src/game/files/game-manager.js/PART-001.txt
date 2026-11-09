class GameManager {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.canvas = options.canvas;
        this.flightCamera = options.flightCamera;
        this.thirdPersonCamera = null;
        this.editorCamera = null;
        this.playerController = null;
        this.characterCameraController = null;
        this.spatialModes = new Map();
        this.mode = 'menu';
        this.resumeMode = 'flight';
        this.callbacks = new Set();
        this.disposed = false;
        if (!this.flightCamera) throw new Error('Flight camera is required.');
        this.flightCamera.detachControl();
        this.onKeyDown = this.handleKeyDown.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
    }

    registerThirdPerson(camera, controller, cameraController) {
        this.thirdPersonCamera = camera;
        this.playerController = controller;
        this.characterCameraController = cameraController;
        camera.detachControl();
        this.applyMode();
    }

    registerEditor(camera) {
        this.editorCamera = camera;
        camera.detachControl();
    }

    registerMode(name, systems) {
        if (!name || ['menu', 'flight', 'thirdPerson', 'paused', 'editor', 'dnd'].includes(name)) {
            throw new RangeError(`Invalid additional game mode: ${name}`);
        }
        if (!systems?.camera || !systems.playerController || !systems.cameraController) {
            throw new TypeError('Additional modes require a camera and both player controllers.');
        }
        if (this.spatialModes.has(name)) throw new Error(`Game mode already registered: ${name}`);
        this.spatialModes.set(name, systems);
        systems.camera.detachControl?.();
        systems.playerController.setEnabled(false);
        systems.cameraController.setEnabled(false);
    }

    setMode(mode) {
        const builtIn = ['menu', 'flight', 'thirdPerson', 'paused', 'editor', 'dnd'];
        if (!builtIn.includes(mode) && !this.spatialModes.has(mode)) {
            throw new Error(`Invalid game mode: ${mode}`);
        }
        if (mode === 'thirdPerson' && (!this.thirdPersonCamera || !this.playerController)) {
            throw new Error('Third-person systems are not registered.');
        }
        if (mode === 'editor' && !this.editorCamera) throw new Error('Editor camera is not registered.');
        if (this.mode === mode) return;

        const previous = this.mode;
        if (this.isNavigableMode(previous)) this.resumeMode = previous;
        this.mode = mode;
        this.applyMode();
        for (const callback of this.callbacks) callback(mode, previous);
    }

    isNavigableMode(mode) {
        return mode === 'flight' || mode === 'thirdPerson' || this.spatialModes.has(mode);
    }

    applyMode() {
        this.flightCamera.detachControl();
        this.thirdPersonCamera?.detachControl();
        this.editorCamera?.detachControl();
        this.playerController?.setEnabled(false);
        this.characterCameraController?.setEnabled(false);
        for (const systems of this.spatialModes.values()) {
            systems.camera.detachControl?.();
            systems.playerController.setEnabled(false);
            systems.cameraController.setEnabled(false);
        }

        if (this.mode === 'flight') {
            this.scene.activeCamera = this.flightCamera;
            this.flightCamera.attachControl(this.canvas, true);
        } else if (this.mode === 'dnd' || this.mode === 'menu' || this.mode === 'paused') {
            this.scene.activeCamera = this.flightCamera;
        } else if (this.mode === 'thirdPerson') {
            this.scene.activeCamera = this.thirdPersonCamera;
            this.playerController.setEnabled(true);
            this.characterCameraController.setEnabled(true);
        } else if (this.mode === 'editor') {
            this.scene.activeCamera = this.editorCamera;
            this.editorCamera.attachControl(this.canvas, true);
        } else {
            this.activateSpatialMode(this.spatialModes.get(this.mode));
        }
    }

    activateSpatialMode(systems) {
        this.scene.activeCamera = systems.camera;
        systems.playerController.setEnabled(true);
        systems.cameraController.setEnabled(true);
    }

    startFlight() { this.setMode('flight'); }
    startThirdPerson() { this.setMode('thirdPerson'); }
    startEditor() { this.setMode('editor'); }
    startDnD() { this.setMode('dnd'); }
    startGeometryDemo() { this.setMode('geometryDemo'); }

    exitEditor() {
        if (this.mode === 'editor') this.setMode(this.resumeMode);
    }

    togglePerspective() {
        if (this.mode === 'flight') this.startThirdPerson();
        else if (this.mode === 'thirdPerson') this.startFlight();
    }

    pause() {
        if (this.isNavigableMode(this.mode)) {
            this.resumeMode = this.mode;
            this.setMode('paused');
        }
    }

    resume() {
        if (this.mode === 'paused') this.setMode(this.resumeMode);
    }

    returnToMenu() { this.setMode('menu'); }

    onModeChanged(callback) {
        this.callbacks.add(callback);
        return this.removeModeCallback.bind(this, callback);
    }

    removeModeCallback(callback) { this.callbacks.delete(callback); }

    handleKeyDown(event) {
        if (event.repeat) return;
        if (event.code === 'KeyV' && (this.mode === 'flight' || this.mode === 'thirdPerson')) {
            this.togglePerspective();
        }
        if (event.code !== 'Escape') return;
        if (this.mode === 'editor') this.exitEditor();
        else if (this.mode === 'paused') this.resume();
        else this.pause();
    }

    getState() { return { mode: this.mode, resumeMode: this.resumeMode }; }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        window.removeEventListener('keydown', this.onKeyDown);
        this.flightCamera.detachControl();
        this.thirdPersonCamera?.detachControl();
        this.editorCamera?.detachControl();
        for (const systems of this.spatialModes.values()) {
            systems.camera.detachControl?.();
            systems.playerController.setEnabled(false);
            systems.cameraController.setEnabled(false);
        }
        this.spatialModes.clear();
        this.callbacks.clear();
    }
}

export { GameManager };
