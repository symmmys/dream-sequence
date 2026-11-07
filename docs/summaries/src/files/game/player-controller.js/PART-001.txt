class PlayerController {
    constructor(character, terrain, canvas, options = {}) {
        this.character = character;
        this.terrain = terrain;
        this.canvas = canvas;

        this.walkSpeed = options.walkSpeed ?? 180;
        this.runSpeed = options.runSpeed ?? 360;
        this.turnSpeed = options.turnSpeed ?? 2.2;

        this.keys = new Set();

        this.enabled = true;
        this.disposed = false;

        this.mouseSensitivity = 0.004;
        this.dragging = false;
        this.previousMouseX = 0;

        this.onKeyDown = event => {
            this.keys.add(event.code);

            if (
                ["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft"]
                    .includes(event.code)
            ) {
                event.preventDefault();
            }
        };

        this.onKeyUp = event => {
            this.keys.delete(event.code);
        };

        this.onBlur = () => {
            this.keys.clear();
            this.dragging = false;
        };

        this.onPointerDown = event => {
            if (event.button !== 0) return;

            this.dragging = true;
            this.previousMouseX = event.clientX;
        };

        this.onPointerMove = event => {
            if (!this.dragging || !this.enabled) return;

            const dx = event.clientX - this.previousMouseX;

            this.previousMouseX = event.clientX;

            this.character.yaw +=
                dx * this.mouseSensitivity;
        };

        this.onPointerUp = () => {
            this.dragging = false;
        };

        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.onBlur);

        canvas.addEventListener(
            "pointerdown",
            this.onPointerDown
        );

        window.addEventListener(
            "pointermove",
            this.onPointerMove
        );

        window.addEventListener(
            "pointerup",
            this.onPointerUp
        );
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.keys.clear();
        this.dragging = false;
    }

    update(deltaSeconds) {
        if (!this.enabled || this.disposed) return;

        const dt = Math.min(deltaSeconds, 0.05);

        if (dt <= 0) return;

        const forward =
            (this.keys.has("KeyW") ? 1 : 0) -
            (this.keys.has("KeyS") ? 1 : 0);

        const turn =
            (this.keys.has("KeyA") ? 1 : 0) -
            (this.keys.has("KeyD") ? 1 : 0);

        this.character.yaw +=
            turn * this.turnSpeed * dt;

        const speed = this.keys.has("ShiftLeft")
            ? this.runSpeed
            : this.walkSpeed;

        const yaw = this.character.yaw;

        const dx = Math.sin(yaw) * forward * speed * dt;
        const dz = Math.cos(yaw) * forward * speed * dt;

        if (dx === 0 && dz === 0) {
            return;
        }

        const current = this.character.worldPosition;

        const nextX = current.x + dx;
        const nextZ = current.z + dz;

        // Respect the authoritative world bounds.
        if (
            nextX < this.terrain.min.x ||
            nextX > this.terrain.max.x ||
            nextZ < this.terrain.min.z ||
            nextZ > this.terrain.max.z
        ) {
            return;
        }

        const sample = this.terrain.sampleAt(
            nextX,
            nextZ
        );

        if (!sample) return;

        // Initial terrain-following implementation.
        // Steep-slope collision will be added separately.
        this.character.setWorldPosition({
            x: nextX,
            y: sample.y,
            z: nextZ
        });
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        window.removeEventListener(
            "keydown",
            this.onKeyDown
        );

        window.removeEventListener(
            "keyup",
            this.onKeyUp
        );

        window.removeEventListener(
            "blur",
            this.onBlur
        );

        this.canvas.removeEventListener(
            "pointerdown",
            this.onPointerDown
        );

        window.removeEventListener(
            "pointermove",
            this.onPointerMove
        );

        window.removeEventListener(
            "pointerup",
            this.onPointerUp
        );

        this.keys.clear();
    }
}

export { PlayerController };
