class CelestialSystem {
    constructor(scene, options = {}) {
        this.scene = scene;

        this.dayLength = options.dayLength ?? 900;
        this.timeScale = 1;
        this.elapsed = options.initialTime ?? 0;

        this.orbitDistance = options.orbitDistance ?? 45000;
        this.skyRadius = options.skyRadius ?? 90000;
        this.sunSize = options.sunSize ?? 1800;
        this.moonSize = options.moonSize ?? 1300;

        this.sunLight = options.sunLight ??
            new BABYLON.DirectionalLight(
                "celestialSunLight",
                new BABYLON.Vector3(0, -1, 0),
                scene
            );

        this.ambientLight = options.ambientLight ??
            new BABYLON.HemisphericLight(
                "celestialAmbientLight",
                new BABYLON.Vector3(0, 1, 0),
                scene
            );

        this.moonLight = new BABYLON.DirectionalLight(
            "celestialMoonLight",
            new BABYLON.Vector3(0, -1, 0),
            scene
        );

        this.sunLight.diffuse =
            new BABYLON.Color3(1.0, 0.94, 0.78);

        this.sunLight.specular =
            new BABYLON.Color3(1.0, 0.95, 0.85);

        this.moonLight.diffuse =
            new BABYLON.Color3(0.48, 0.58, 0.85);

        this.moonLight.specular =
            new BABYLON.Color3(0.35, 0.42, 0.65);

        this.sunDirection = new BABYLON.Vector3();
        this.moonDirection = new BABYLON.Vector3();

        this.daylight = 0;
        this.twilight = 0;
        this.starVisibility = 1;

	// Initialize rendering resources before the first update.
this.createSky();

// Initialize the celestial simulation and shader uniforms.
this.update(0);

console.log("[CelestialSystem] Initialized.");

        console.log("[CelestialSystem] Initialized.");
    }

    // -----------------------------------------
    // ATMOSPHERIC SKY
    // -----------------------------------------

    createSky() {
        BABYLON.Effect.ShadersStore[
            "somniumSkyVertexShader"
        ] = `
            precision highp float;

            attribute vec3 position;

            uniform mat4 world;
            uniform mat4 worldViewProjection;

            varying vec3 vDirection;

            void main(void) {
                vec4 worldDirection =
                    world * vec4(position, 0.0);

                vDirection = normalize(worldDirection.xyz);

                gl_Position =
                    worldViewProjection * vec4(position, 1.0);
            }
        `;

        BABYLON.Effect.ShadersStore[
            "somniumSkyFragmentShader"
        ] = `
            precision highp float;

            varying vec3 vDirection;

            uniform vec3 sunDirection;
            uniform vec3 moonDirection;

            uniform float daylight;
            uniform float twilight;
            uniform float starVisibility;
            uniform float time;

            float hash31(vec3 p) {
                p = fract(p * 0.1031);
                p += dot(p, p.yzx + 33.33);
                return fract(
                    (p.x + p.y) * p.z
                );
            }

            void main(void) {
                vec3 direction = normalize(vDirection);

                float height = clamp(
                    direction.y,
                    -1.0,
                    1.0
                );

                // Daytime atmospheric colors.

                vec3 zenithDay = vec3(
                    0.16, 0.42, 0.78
                );

                vec3 horizonDay = vec3(
                    0.65, 0.79, 0.92
                );

                // Nighttime atmospheric colors.

                vec3 zenithNight = vec3(
                    0.003, 0.006, 0.022
                );

                vec3 horizonNight = vec3(
                    0.018, 0.027, 0.065
                );

                float horizon = pow(
                    1.0 - max(height, 0.0),
                    2.0
                );

                vec3 daySky = mix(
                    zenithDay,
                    horizonDay,
                    horizon
                );

                vec3 nightSky = mix(
                    zenithNight,
                    horizonNight,
                    horizon
                );

                // Blend day and night.

                vec3 sky = mix(
                    nightSky,
                    daySky,
                    daylight
                );

                // Sunrise and sunset palette.

                vec3 sunsetZenith = vec3(
                    0.24, 0.10, 0.25
                );

                vec3 sunsetHorizon = vec3(
                    1.0, 0.24, 0.065
                );

                vec3 sunset = mix(
                    sunsetZenith,
                    sunsetHorizon,
                    pow(horizon, 0.65)
                );

                float sunsetBand = exp(
                    -pow(height * 5.0, 2.0)
                );

                sky = mix(
                    sky,
                    sunset,
                    twilight * sunsetBand
                );

                // Sun disc and atmospheric glow.

                float sunDot = dot(
                    direction,
                    normalize(sunDirection)
                );

                float sunDisc = smoothstep(
                    0.99965,
                    0.99985,
                    sunDot
                );

                float sunGlow = pow(
                    max(sunDot, 0.0),
                    24.0
                );

                vec3 sunColor = mix(
                    vec3(1.0, 0.22, 0.06),
                    vec3(1.0, 0.91, 0.68),
                    daylight
                );

                sky += sunColor *
                    sunGlow *
                    (0.12 + twilight * 0.35);

                sky = mix(
                    sky,
                    sunColor,
                    sunDisc
                );

                // Procedural star field.

                vec3 starCell = floor(
                    direction * 550.0
                );

                float starRandom = hash31(starCell);

                float star = step(
                    0.9985,
                    starRandom
                );

                float starBrightness = mix(
                    0.45,
                    1.0,
                    hash31(starCell + 17.3)
                );

                float twinkle = 0.85 +
                    0.15 * sin(
                        time * 2.0 +
                        starRandom * 40.0
                    );

                float stars = star *
                    starBrightness *
                    twinkle *
                    starVisibility;

                vec3 starColor = mix(
                    vec3(0.55, 0.68, 1.0),
                    vec3(1.0, 0.96, 0.86),
                    starRandom
                );

                sky += starColor * stars;

                // Subtle lunar glow.

float moonDot = dot(
    direction,
    normalize(moonDirection)
);

float moonDisc = smoothstep(
    0.99972,
    0.99988,
    moonDot
);

float moonGlow = pow(
    max(moonDot, 0.0),
    18.0
);

vec3 moonColor = vec3(0.78, 0.83, 0.96);

sky += vec3(0.12, 0.16, 0.30)
    * moonGlow
    * starVisibility
    * 0.3;

sky = mix(
    sky,
    moonColor,
    moonDisc * starVisibility
);
                gl_FragColor = vec4(sky, 1.0);
            }
        `;

        this.skyMesh =
            BABYLON.MeshBuilder.CreateSphere(
                "somniumAtmosphere",
                {
                    diameter: this.skyRadius * 2,
                    segments: 32
                },
                this.scene
            );

        this.skyMaterial =
            new BABYLON.ShaderMaterial(
                "somniumSkyMaterial",
                this.scene,
                {
                    vertex: "somniumSky",
                    fragment: "somniumSky"
                },
                {
                    attributes: ["position"],
                    uniforms: [
                        "world",
                        "worldViewProjection",
                        "sunDirection",
                        "moonDirection",
                        "daylight",
                        "twilight",
                        "starVisibility",
                        "time"
                    ]
                }
            );

        this.skyMaterial.backFaceCulling = false;
        this.skyMaterial.disableDepthWrite = true;
        this.skyMaterial.fogEnabled = false;

        this.skyMaterial.setVector3(
            "sunDirection",
            this.sunDirection
        );

        this.skyMaterial.setVector3(
            "moonDirection",
            this.moonDirection
        );

        this.skyMaterial.setFloat("daylight", 0);
        this.skyMaterial.setFloat("twilight", 0);
        this.skyMaterial.setFloat("starVisibility", 1);
        this.skyMaterial.setFloat("time", 0);

        this.skyMesh.material = this.skyMaterial;
        this.skyMesh.isPickable = false;
        this.skyMesh.infiniteDistance = false;
        this.skyMesh.alwaysSelectAsActiveMesh = true;

        this.skyMesh.renderingGroupId = 0;
    }

	
    // -----------------------------------------
    // VISIBLE SUN
    // -----------------------------------------

    createSun() {
        this.sunMesh =
            BABYLON.MeshBuilder.CreateSphere(
                "visibleSun",
                {
                    diameter: this.sunSize,
                    segments: 24
                },
                this.scene
            );

        this.sunMaterial =
            new BABYLON.StandardMaterial(
                "visibleSunMaterial",
                this.scene
            );

        this.sunMaterial.diffuseColor =
            new BABYLON.Color3(1, 0.85, 0.45);

        this.sunMaterial.emissiveColor =
            new BABYLON.Color3(1, 0.72, 0.28);

        this.sunMaterial.specularColor =
            BABYLON.Color3.Black();

        this.sunMaterial.disableLighting = true;

        this.sunMesh.material = this.sunMaterial;
        this.sunMesh.isPickable = false;
        this.sunMesh.renderingGroupId = 1;
    }

    // -----------------------------------------
    // VISIBLE MOON
    // -----------------------------------------

    createMoon() {
        this.moonMesh =
            BABYLON.MeshBuilder.CreateSphere(
                "visibleMoon",
                {
                    diameter: this.moonSize,
                    segments: 24
                },
                this.scene
            );

        this.moonMaterial =
            new BABYLON.StandardMaterial(
                "visibleMoonMaterial",
                this.scene
            );

        this.moonMaterial.diffuseColor =
            new BABYLON.Color3(0.72, 0.78, 0.92);

        this.moonMaterial.emissiveColor =
            new BABYLON.Color3(0.16, 0.19, 0.28);

        this.moonMaterial.specularColor =
            new BABYLON.Color3(0.2, 0.2, 0.25);

        this.moonMaterial.disableLighting = true;

        this.moonMesh.material = this.moonMaterial;
        this.moonMesh.isPickable = false;
        this.moonMesh.renderingGroupId = 1;
    }

    // -----------------------------------------
    // TRANSITION FUNCTIONS
    // -----------------------------------------

    smoothstep(min, max, value) {
        const t = BABYLON.Scalar.Clamp(
            (value - min) / (max - min),
            0,
            1
        );

        return t * t * (3 - 2 * t);
    }

    // -----------------------------------------
    // DAY/NIGHT UPDATE
    // -----------------------------------------

    update(deltaSeconds) {
        if (
            !Number.isFinite(deltaSeconds) ||
            deltaSeconds < 0
        ) {
            return;
        }

        this.elapsed +=
            deltaSeconds * this.timeScale;

        const phase =
            (this.elapsed / this.dayLength) *
            Math.PI * 2 +
            Math.PI / 2;

        const horizontal = Math.cos(phase);
        const vertical = Math.sin(phase);

        this.sunDirection.set(
            horizontal,
            vertical,
            0
        ).normalize();

        this.moonDirection.copyFrom(
            this.sunDirection
        ).scaleInPlace(-1);

        // Directional light directions.

        this.sunLight.direction.copyFrom(
            this.sunDirection
        ).scaleInPlace(-1);

        this.moonLight.direction.copyFrom(
            this.moonDirection
        ).scaleInPlace(-1);

        // -------------------------------------
        // LIGHT INTENSITIES
        // -------------------------------------

        this.daylight = this.smoothstep(
            -0.12,
            0.28,
            vertical
        );

        const moonlight = this.smoothstep(
            -0.12,
            0.28,
            -vertical
        );

        this.sunLight.intensity =
            1.5 * this.daylight;

        this.moonLight.intensity =
            0.22 * moonlight;

        this.ambientLight.intensity =
            BABYLON.Scalar.Lerp(
                0.10,
                0.52,
                this.daylight
            );

        // -------------------------------------
        // ATMOSPHERIC TRANSITIONS
        // -------------------------------------

        this.twilight =
            1.0 - this.smoothstep(
                0.015,
                0.28,
                Math.abs(vertical)
            );

        this.starVisibility =
            1.0 - this.smoothstep(
                -0.18,
                0.12,
                vertical
            );

        // -------------------------------------
        // UPDATE SKY AND CELESTIAL POSITIONS
        // -------------------------------------

const camera = this.scene.activeCamera;

if (camera) {
    this.skyMesh.position.copyFrom(camera.position);

    // Keep the sky inside the camera far plane.
    const farPlane = camera.maxZ || 100000;

    const effectiveRadius = Math.min(
        this.skyRadius,
        farPlane * 0.45
    );

    const skyScale =
        effectiveRadius / this.skyRadius;

    this.skyMesh.scaling.setAll(skyScale);
}

        // -------------------------------------
        // UPDATE SKY SHADER
        // -------------------------------------

        this.skyMaterial.setVector3(
            "sunDirection",
            this.sunDirection
        );

        this.skyMaterial.setVector3(
            "moonDirection",
            this.moonDirection
        );

        this.skyMaterial.setFloat(
            "daylight",
            this.daylight
        );

        this.skyMaterial.setFloat(
            "twilight",
            this.twilight
        );

        this.skyMaterial.setFloat(
            "starVisibility",
            this.starVisibility
        );

        this.skyMaterial.setFloat(
            "time",
            this.elapsed
        );

        // Nighttime fallback clear color.

        this.scene.clearColor =
            new BABYLON.Color4(
                0.003,
                0.006,
                0.022,
                1
            );
    }

    // -----------------------------------------
    // TIME CONTROLS
    // -----------------------------------------

    setTimeScale(scale) {
        this.timeScale =
            BABYLON.Scalar.Clamp(scale, 0, 100);
    }

    setDayLength(seconds) {
        this.dayLength = Math.max(60, seconds);
    }

    setTimeOfDay(normalizedTime) {
        this.elapsed =
            BABYLON.Scalar.Clamp(
                normalizedTime,
                0,
                1
            ) * this.dayLength;

        this.update(0);
    }

    getTimeOfDay() {
        return (this.elapsed / this.dayLength) % 1;
    }

    // -----------------------------------------
    // DEBUG INFORMATION
    // -----------------------------------------

    getStats() {
        return {
            timeOfDay: this.getTimeOfDay(),
            dayLength: this.dayLength,
            timeScale: this.timeScale,
            daylight: this.daylight,
            twilight: this.twilight,
            starVisibility: this.starVisibility,
            sunIntensity: this.sunLight.intensity,
            moonIntensity: this.moonLight.intensity,
            sunDirection: this.sunDirection.asArray(),
            moonDirection: this.moonDirection.asArray()
        };
    }

    // -----------------------------------------
    // CLEANUP
    // -----------------------------------------
dispose() {
    if (this.skyMesh) {
        this.skyMesh.dispose();
    }

    if (this.skyMaterial) {
        this.skyMaterial.dispose();
    }

    // Retain compatibility if independent celestial
    // meshes are reintroduced in a future implementation.
    this.sunMesh?.dispose();
    this.moonMesh?.dispose();
    this.sunMaterial?.dispose();
    this.moonMaterial?.dispose();

    this.sunLight?.dispose();
    this.moonLight?.dispose();
    this.ambientLight?.dispose();
}
}

export { CelestialSystem };

