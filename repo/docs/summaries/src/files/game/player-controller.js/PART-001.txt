/** Handles third-person character movement and exposes input to spatial traversal. */

class PlayerController {
    constructor(character, terrain, canvas, options = {}) {
        this.character = character;
        this.terrain = terrain;
        this.canvas = canvas;
        this.walkSpeed = options.walkSpeed ?? 4.5;
        this.runSpeed = options.runSpeed ?? 7.5;
        this.turnSpeed = options.turnSpeed ?? 2.2;
        this.jumpSpeed = options.jumpSpeed ?? 7;
        this.gravity = options.gravity ?? 18;
        this.keys = new Set();
        this.enabled = true;
        this.inputEnabled = true;
        this.movementSuspended = false;
        this.disposed = false;
        this.mouseSensitivity = 0.004;
        this.dragging = false;
        this.previousMouseX = 0;
        this.jumpRequested = false;
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
        this.groundHeight = character.worldPosition.y;
        this.onKeyDown = this.handleKeyDown.bind(this);
        this.onKeyUp = this.handleKeyUp.bind(this);
        this.onBlur = this.handleBlur.bind(this);
        this.onPointerDown = this.handlePointerDown.bind(this);
        this.onPointerMove = this.handlePointerMove.bind(this);
        this.onPointerUp = this.handlePointerUp.bind(this);
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('blur', this.onBlur);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
    }

    handleKeyDown(event) {
        if (!this.enabled || !this.inputEnabled || this.disposed) return;
        // Preserve browser/system shortcuts such as Ctrl+R and Cmd+R.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === 'Space' && !this.keys.has('Space')) this.jumpRequested = true;
        this.keys.add(event.code);
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft',
            'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    }

    handleKeyUp(event) { this.keys.delete(event.code); }

    handleBlur() {
        this.keys.clear();
        this.jumpRequested = false;
        this.dragging = false;
    }

    handlePointerDown(event) {
        if (!this.enabled || !this.inputEnabled || event.button !== 0) return;
        this.dragging = true;
        this.previousMouseX = event.clientX;
    }

    handlePointerMove(event) {
        if (!this.dragging || !this.enabled || !this.inputEnabled || this.disposed) return;
        this.character.yaw += (event.clientX - this.previousMouseX) * this.mouseSensitivity;
        this.previousMouseX = event.clientX;
    }

    handlePointerUp() { this.dragging = false; }

    setTerrain(terrain) {
        if (!terrain?.sampleAt || !terrain.min || !terrain.max) {
            throw new TypeError('Player terrain requires bounds and a sampler.');
        }
        this.terrain = terrain;
        const sample = terrain.sampleAt(this.character.worldPosition.x, this.character.worldPosition.z);
        if (sample) this.groundHeight = sample.y;
        this.jumpHeight = 0;
        this.verticalVelocity = 0;
    }

    setMovementSuspended(suspended) {
        this.movementSuspended = Boolean(suspended);
        if (!this.movementSuspended) this.jumpRequested = false;
    }

    setMovementProfile(profile = {}) {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
            throw new TypeError('Movement profile must be an object.');
        }
        const next = {
            walkSpeed: profile.walkSpeed ?? this.walkSpeed,
            runSpeed: profile.runSpeed ?? this.runSpeed,
            turnSpeed: profile.turnSpeed ?? this.turnSpeed
        };
        if (!Number.isFinite(next.walkSpeed) || next.walkSpeed <= 0 ||
            !Number.isFinite(next.runSpeed) || next.runSpeed < next.walkSpeed ||
            !Number.isFinite(next.turnSpeed) || next.turnSpeed < 0) {
            throw new RangeError('Movement profile requires positive walk/run speeds and a non-negative turn speed.');
        }
        this.walkSpeed = next.walkSpeed;
        this.runSpeed = next.runSpeed;
        this.turnSpeed = next.turnSpeed;
        return this.getMovementProfile();
    }

    getMovementProfile() {
        return {
            walkSpeed: this.walkSpeed,
            runSpeed: this.runSpeed,
            turnSpeed: this.turnSpeed
        };
    }

    setInputEnabled(enabled) {
        this.inputEnabled = Boolean(enabled);
        if (!this.inputEnabled) this.handleBlur();
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled) && !this.disposed;
        this.keys.clear();
        this.jumpRequested = false;
        this.dragging = false;
    }

    getMovementInput() {
        if (!this.inputEnabled) {
            return { forward: 0, strafe: 0, vertical: 0, crossSectionW: 0, turn: 0, jump: false, sprint: false };
        }
        return {
            forward: Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')),
            strafe: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
            vertical: Number(this.keys.has('KeyR')) - Number(this.keys.has('KeyF')),
            crossSectionW: Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ')),
            turn: Number(this.keys.has('ArrowLeft')) - Number(this.keys.has('ArrowRight')),
            jump: this.jumpRequested,
            sprint: this.keys.has('ShiftLeft')
        };
    }

    update(deltaSeconds) {
        if (!this.enabled || this.movementSuspended || this.disposed) return;
        const dt = Math.min(Math.max(deltaSeconds, 0), 0.05);
        if (dt <= 0) return;
        const input = this.getMovementInput();
        const turn = Number(this.keys.has('ArrowLeft')) - Number(this.keys.has('ArrowRight'));
        this.character.yaw += turn * this.turnSpeed * dt;
        const speed = input.sprint ? this.runSpeed : this.walkSpeed;
        const magnitude = Math.hypot(input.forward, input.strafe) || 1;
        const forward = input.forward / magnitude;
        const strafe = input.strafe / magnitude;
        const yaw = this.character.yaw;
        const nextX = this.character.worldPosition.x +
            (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * dt;
        const nextZ = this.character.worldPosition.z +
            (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * dt;
        const canMove = (input.forward !== 0 || input.strafe !== 0) && this.isInsideTerrain(nextX, nextZ);
        const sample = this.terrain.sampleAt(
            canMove ? nextX : this.character.worldPosition.x,
            canMove ? nextZ : this.character.worldPosition.z
        );
        if (sample) this.groundHeight = sample.y;
        this.updateJump(dt, input.jump);
        this.character.setWorldPosition({
            x: canMove ? nextX : this.character.worldPosition.x,
            y: this.groundHeight + this.jumpHeight,
            z: canMove ? nextZ : this.character.worldPosition.z
        });
    }

    updateJump(deltaSeconds, jumpRequested) {
        if (jumpRequested && this.jumpHeight <= 0) this.verticalVelocity = this.jumpSpeed;
        this.jumpRequested = false;
        if (this.verticalVelocity === 0 && this.jumpHeight === 0) return;
        this.verticalVelocity -= this.gravity * deltaSeconds;
        this.jumpHeight = Math.max(0, this.jumpHeight + this.verticalVelocity * deltaSeconds);
        if (this.jumpHeight === 0) this.verticalVelocity = 0;
    }

    isInsideTerrain(x, z) {
        return x >= this.terrain.min.x && x <= this.terrain.max.x &&
            z >= this.terrain.min.z && z <= this.terrain.max.z;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('blur', this.onBlur);
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        this.keys.clear();
        this.jumpRequested = false;
    }
}

export { PlayerController };
