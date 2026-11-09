
export class AdaptiveGraphicsController {
    constructor(engine, camera, world, options = {}) {
        this.engine = engine;
        this.camera = camera;
        this.world = world;

        this.targetFPS = options.targetFPS ?? 55;
        this.minimumFPS = options.minimumFPS ?? 35;

        this.profiles = {
            low: {
                radius: 7,
                detailRadius: 1,
                generationBudget: 3,
                hardwareScale: 1.5
            },

            medium: {
                radius: 14,
                detailRadius: 2,
                generationBudget: 6,
                hardwareScale: 1.0
            },

            high: {
                radius: 18,
                detailRadius: 2,
                generationBudget: 8,
                hardwareScale: 0.85
            }
        };

        this.profileName = this.detectInitialProfile();

        this.fpsHistory = [];
        this.historyLimit = 30;

        this.elapsed = 0;
        this.lowFPSDuration = 0;
        this.highFPSDuration = 0;

        this.setProfile(this.profileName);

        console.log(
            "[Graphics] Initialized:",
            this.getStats()
        );
    }

    detectInitialProfile() {
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 4;

        const mobile =
            /Android|iPhone|iPad|iPod/i.test(
                navigator.userAgent
            );

        if (cores <= 2 || memory <= 2) {
            return "low";
        }

        if (
            cores >= 8 &&
            memory >= 8 &&
            !mobile
        ) {
            return "high";
        }

        return "medium";
    }

    setProfile(name) {
        const profile = this.profiles[name];

        if (!profile) return;

        this.profileName = name;

        this.world.renderRadius = profile.radius;

        this.world.highDetailRadius =
            profile.detailRadius;

        this.world.maxChunksPerUpdate =
            profile.generationBudget;

        this.camera.maxZ =
            this.world.chunkSize *
            (profile.radius + 3) * 2;

        this.engine.setHardwareScalingLevel(
            profile.hardwareScale
        );

        console.log("[Graphics] Profile:", name);
    }

    getAverageFPS() {
        if (!this.fpsHistory.length) {
            return this.engine.getFps();
        }

        return this.fpsHistory.reduce(
            (sum, fps) => sum + fps,
            0
        ) / this.fpsHistory.length;
    }

    update(deltaSeconds) {
        this.elapsed += deltaSeconds;

        if (this.elapsed < 2) return;

        const elapsed = this.elapsed;
        this.elapsed = 0;

        const fps = this.engine.getFps();

        if (Number.isFinite(fps) && fps > 0) {
            this.fpsHistory.push(fps);

            if (this.fpsHistory.length > this.historyLimit) {
                this.fpsHistory.shift();
            }
        }

        const average = this.getAverageFPS();

        if (average < this.minimumFPS) {
            this.lowFPSDuration += elapsed;
            this.highFPSDuration = 0;
        } else if (average > this.targetFPS) {
            this.highFPSDuration += elapsed;
            this.lowFPSDuration = 0;
        } else {
            this.lowFPSDuration = Math.max(
                0,
                this.lowFPSDuration - elapsed
            );

            this.highFPSDuration = 0;
        }

        if (this.lowFPSDuration >= 6) {
            if (this.profileName === "high") {
                this.setProfile("medium");
            } else if (this.profileName === "medium") {
                this.setProfile("low");
            }

            this.lowFPSDuration = 0;
            this.highFPSDuration = 0;
        }

        if (this.highFPSDuration >= 25) {
            if (this.profileName === "low") {
                this.setProfile("medium");
            } else if (this.profileName === "medium") {
                this.setProfile("high");
            }

            this.highFPSDuration = 0;
            this.lowFPSDuration = 0;
        }
    }

    getStats() {
        return {
            profile: this.profileName,
            renderRadius: this.world.renderRadius,
            averageFPS: Math.round(this.getAverageFPS()),
            targetFPS: this.targetFPS,
            minimumFPS: this.minimumFPS
        };
    }

    dispose() {
        this.fpsHistory.length = 0;
    }
}

