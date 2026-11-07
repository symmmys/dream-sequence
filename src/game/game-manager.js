
class GameManager {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.canvas = options.canvas;

        this.flightCamera = options.flightCamera;
        this.thirdPersonCamera = null;
        this.editorCamera = null;

        this.playerController = null;
        this.characterCameraController = null;

        this.mode = "menu";
        this.resumeMode = "flight";

        this.callbacks = new Set();
        this.disposed = false;

        if (!this.flightCamera) {
            throw new Error("Flight camera is required.");
        }

        this.flightCamera.detachControl();

        this.onKeyDown = event => {
            if (event.repeat) return;

            if (event.code === "KeyV") {
                if (
                    this.mode === "flight" ||
                    this.mode === "thirdPerson"
                ) {
                    this.togglePerspective();
                }
            }

            if (event.code === "Escape") {
                if (this.mode === "editor") {
                    this.exitEditor();
                } else if (
                    this.mode === "flight" ||
                    this.mode === "thirdPerson"
                ) {
                    this.pause();
                } else if (this.mode === "paused") {
                    this.resume();
                }
            }
        };

        window.addEventListener("keydown", this.onKeyDown);
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

    setMode(mode) {
        const valid = [
            "menu",
            "flight",
            "thirdPerson",
            "paused",
            "editor",
		"dnd"
        ];

        if (!valid.includes(mode)) {
            throw new Error(`Invalid game mode: ${mode}`);
        }

        if (
            mode === "thirdPerson" &&
            (!this.thirdPersonCamera || !this.playerController)
        ) {
            throw new Error("Third-person systems are not registered.");
        }

        if (mode === "editor" && !this.editorCamera) {
            throw new Error("Editor camera is not registered.");
        }

        if (this.mode === mode) return;

        const previous = this.mode;

        if (
            previous === "flight" ||
            previous === "thirdPerson"
        ) {
            this.resumeMode = previous;
        }

        this.mode = mode;
        this.applyMode();

        for (const callback of this.callbacks) {
            callback(mode, previous);
        }
    }

    applyMode() {
        this.flightCamera.detachControl();
        this.thirdPersonCamera?.detachControl();
        this.editorCamera?.detachControl();

        this.playerController?.setEnabled(false);
        this.characterCameraController?.setEnabled(false);

        if (this.mode === "flight") {
            this.scene.activeCamera = this.flightCamera;
            this.flightCamera.attachControl(this.canvas, true);
        }

	if (this.mode === "dnd") {
	    this.scene.activeCamera = this.flightCamera;
	}

        if (this.mode === "thirdPerson") {
            this.scene.activeCamera = this.thirdPersonCamera;
            this.playerController.setEnabled(true);
            this.characterCameraController.setEnabled(true);
        }

        if (this.mode === "editor") {
            this.scene.activeCamera = this.editorCamera;
            this.editorCamera.attachControl(this.canvas, true);
        }

        if (this.mode === "menu" || this.mode === "paused") {
            this.scene.activeCamera = this.flightCamera;
        }
    }

    startFlight() {
        this.setMode("flight");
    }

    startThirdPerson() {
        this.setMode("thirdPerson");
    }

    startEditor() {
        this.setMode("editor");
    }

	startDnD() {
	    this.setMode("dnd");
	}

    exitEditor() {
        if (this.mode !== "editor") return;

        this.setMode(this.resumeMode);
    }

    togglePerspective() {
        if (this.mode === "flight") {
            this.startThirdPerson();
        } else if (this.mode === "thirdPerson") {
            this.startFlight();
        }
    }

    pause() {
        if (
            this.mode !== "flight" &&
            this.mode !== "thirdPerson"
        ) return;

        this.resumeMode = this.mode;
        this.setMode("paused");
    }

    resume() {
        if (this.mode === "paused") {
            this.setMode(this.resumeMode);
        }
    }

    returnToMenu() {
        this.setMode("menu");
    }

    onModeChanged(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    getState() {
        return {
            mode: this.mode,
            resumeMode: this.resumeMode
        };
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        window.removeEventListener("keydown", this.onKeyDown);

        this.flightCamera.detachControl();
        this.thirdPersonCamera?.detachControl();
        this.editorCamera?.detachControl();

        this.callbacks.clear();
    }
}

export { GameManager };

