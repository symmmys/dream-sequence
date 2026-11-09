
class RainSystem {

    constructor(scene) {

        this.scene = scene;

        this.active = false;

        this.particles = new BABYLON.ParticleSystem(
            "rainParticles",
            2000,
            scene
        );


        // Generate a tiny procedural particle texture.

        const texture = new BABYLON.DynamicTexture(
            "rainTexture",
            {
                width: 8,
                height: 16
            },
            scene,
            false
        );

        const context = texture.getContext();

        context.clearRect(0, 0, 8, 16);

        context.fillStyle = "#c5e5ff";

        context.fillRect(3, 0, 2, 16);

        texture.update();

        this.particles.particleTexture = texture;


        this.particles.emitter =
            BABYLON.Vector3.Zero();

        this.particles.minEmitBox =
            new BABYLON.Vector3(-25, 0, -25);

        this.particles.maxEmitBox =
            new BABYLON.Vector3(25, 0, 25);


        this.particles.color1 =
            new BABYLON.Color4(0.65, 0.8, 1, 0.65);

        this.particles.color2 =
            new BABYLON.Color4(0.8, 0.9, 1, 0.8);

        this.particles.colorDead =
            new BABYLON.Color4(0.5, 0.65, 0.8, 0);


        this.particles.minSize = 0.08;

        this.particles.maxSize = 0.14;

        this.particles.minLifeTime = 0.5;

        this.particles.maxLifeTime = 1.2;


        this.particles.emitRate = 1200;

        this.particles.minEmitPower = 20;

        this.particles.maxEmitPower = 35;

        this.particles.updateSpeed = 0.015;


        this.particles.direction1 =
            new BABYLON.Vector3(-1, -30, -1);

        this.particles.direction2 =
            new BABYLON.Vector3(1, -30, 1);


        this.particles.gravity =
            new BABYLON.Vector3(0, -9.81, 0);


        this.particles.blendMode =
            BABYLON.ParticleSystem.BLENDMODE_STANDARD;


        this.particles.minAngularSpeed = 0;

        this.particles.maxAngularSpeed = 0;

    }


    start(position, intensity = 1) {

        this.particles.emitter.copyFrom(position);

        this.particles.emitRate =
            1200 * BABYLON.Scalar.Clamp(
                intensity,
                0.2,
                2
            );

        if (!this.active) {

            this.particles.start();

            this.active = true;

        }

    }


    stop() {

        if (!this.active) return;

        this.particles.stop();

        this.active = false;

    }


    update() {

        // Babylon.js updates the particle system
        // automatically during scene rendering.

    }


    dispose() {

        this.particles.dispose();

    }

}

export { RainSystem };

