
export class HeightmapTerrain {
    constructor(options = {}) {
        this.url = options.url ??
            "./assets/0_somnium_map_topographic.png";

        this.worldSize = options.worldSize ?? 1000000;

        this.minHeight = options.minHeight ?? -2000;
        this.maxHeight = options.maxHeight ?? 1000;

        this.heightChannel = options.heightChannel ?? "average";

        this.min = {
            x: -this.worldSize / 2,
            y: this.minHeight,
            z: -this.worldSize / 2
        };

        this.max = {
            x: this.worldSize / 2,
            y: this.maxHeight,
            z: this.worldSize / 2
        };

        this.width = 0;
        this.height = 0;
        this.pixels = null;
        this.ready = false;

        this.diagnostics = null;
    }

    async load() {
        const image = new Image();

        image.crossOrigin = "anonymous";

        await new Promise((resolve, reject) => {
            image.onload = resolve;

            image.onerror = () => reject(
                new Error(
                    `Unable to load heightmap: ${this.url}`
                )
            );

            image.src = this.url;
        });

        const canvas = document.createElement("canvas");

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext(
            "2d",
            { willReadFrequently: true }
        );

        if (!context) {
            throw new Error(
                "Unable to initialize heightmap canvas."
            );
        }

        context.drawImage(image, 0, 0);

        this.width = canvas.width;
        this.height = canvas.height;

        this.pixels = context.getImageData(
            0,
            0,
            this.width,
            this.height
        ).data;

        this.ready = true;

        this.diagnostics = this.getDiagnostics(32);

        console.log(
            "[HeightmapTerrain] Loaded:",
            this.getDiagnostics()
        );

        return this;
    }

    getNormalizedCoordinates(x, z) {
        return {
            u: (x - this.min.x) / this.worldSize,
            v: (z - this.min.z) / this.worldSize
        };
    }

    getPixelValue(x, z) {
        x = Math.max(
            0,
            Math.min(this.width - 1, x)
        );

        z = Math.max(
            0,
            Math.min(this.height - 1, z)
        );

        const index = (
            Math.floor(z) * this.width +
            Math.floor(x)
        ) * 4;

        const r = this.pixels[index];
        const g = this.pixels[index + 1];
        const b = this.pixels[index + 2];

        switch (this.heightChannel) {
            case "red":
                return r / 255;

            case "green":
                return g / 255;

            case "blue":
                return b / 255;

            case "luminance":
                return (
                    0.2126 * r +
                    0.7152 * g +
                    0.0722 * b
                ) / 255;

            case "average":
            default:
                return (r + g + b) / 765;
        }
    }

    getHeightPixel(x, z) {
        return this.getPixelValue(x, z);
    }

    sampleHeight(x, z) {
        if (!this.ready) {
            throw new Error("Heightmap not loaded.");
        }

        if (
            x < this.min.x ||
            x > this.max.x ||
            z < this.min.z ||
            z > this.max.z
        ) {
            return null;
        }

        const { u, v } =
            this.getNormalizedCoordinates(x, z);

        const px = u * (this.width - 1);
        const pz = v * (this.height - 1);

        const x0 = Math.floor(px);
        const z0 = Math.floor(pz);

        const x1 = Math.min(
            x0 + 1,
            this.width - 1
        );

        const z1 = Math.min(
            z0 + 1,
            this.height - 1
        );

        const tx = px - x0;
        const tz = pz - z0;

        const a = BABYLON.Scalar.Lerp(
            this.getPixelValue(x0, z0),
            this.getPixelValue(x1, z0),
            tx
        );

        const b = BABYLON.Scalar.Lerp(
            this.getPixelValue(x0, z1),
            this.getPixelValue(x1, z1),
            tx
        );

        return BABYLON.Scalar.Lerp(
            this.minHeight,
            this.maxHeight,
            BABYLON.Scalar.Lerp(a, b, tz)
        );
    }

    sampleAt(x, z) {
        const y = this.sampleHeight(x, z);

        if (y === null) return null;

        return new BABYLON.Vector3(x, y, z);
    }

    sample() {
        return this.sampleAt(
            BABYLON.Scalar.RandomRange(
                this.min.x,
                this.max.x
            ),
            BABYLON.Scalar.RandomRange(
                this.min.z,
                this.max.z
            )
        );
    }

    sampleNear(center, radius) {
        const angle = Math.random() * Math.PI * 2;

        const distance =
            radius * Math.sqrt(Math.random());

        return this.sampleAt(
            center.x + Math.cos(angle) * distance,
            center.z + Math.sin(angle) * distance
        );
    }

    sampleSlopeAt(x, z, spacing = 4) {
        const left = this.sampleHeight(x - spacing, z);
        const right = this.sampleHeight(x + spacing, z);

        const back = this.sampleHeight(x, z - spacing);
        const front = this.sampleHeight(x, z + spacing);

        if (
            [left, right, back, front].some(
                value => value === null
            )
        ) {
            return null;
        }

        const dx = (right - left) / (2 * spacing);
        const dz = (front - back) / (2 * spacing);

        const magnitude = Math.hypot(dx, dz);

        const angle = Math.atan(magnitude);

        return {
            gradientX: dx,
            gradientZ: dz,
            magnitude,
            angle,
            degrees: angle * 180 / Math.PI,

            normal: new BABYLON.Vector3(
                -dx, 1, -dz
            ).normalize()
        };
    }

    sampleProfileAt(x, z, spacing = 4) {
        const position = this.sampleAt(x, z);

        if (!position) return null;

        const slope = this.sampleSlopeAt(
            x, z, spacing
        );

        if (!slope) return null;

        return {
            position,

            elevation: BABYLON.Scalar.Clamp(
                (position.y - this.minHeight) /
                (this.maxHeight - this.minHeight),
                0, 1
            ),

            slope: slope.magnitude,
            slopeDegrees: slope.degrees,
            normal: slope.normal
        };
    }

    getDiagnostics(gridSize = 32) {
        if (!this.ready) {
            return {
                ready: false
            };
        }

        let minimum = Infinity;
        let maximum = -Infinity;
        let sum = 0;
        let count = 0;

        const samples = [];

        for (let z = 0; z <= gridSize; z++) {
            for (let x = 0; x <= gridSize; x++) {
                const wx = this.min.x +
                    (x / gridSize) * this.worldSize;

                const wz = this.min.z +
                    (z / gridSize) * this.worldSize;

                const height = this.sampleHeight(wx, wz);

                minimum = Math.min(minimum, height);
                maximum = Math.max(maximum, height);

                sum += height;
                count++;

                if (
                    x === 0 ||
                    x === Math.floor(gridSize / 2) ||
                    x === gridSize
                ) {
                    if (
                        z === 0 ||
                        z === Math.floor(gridSize / 2) ||
                        z === gridSize
                    ) {
                        samples.push({
                            x: wx,
                            z: wz,
                            height
                        });
                    }
                }
            }
        }

        return {
            ready: true,

            imageWidth: this.width,
            imageHeight: this.height,

            worldSize: this.worldSize,

            heightChannel: this.heightChannel,

            configuredHeightRange: {
                min: this.minHeight,
                max: this.maxHeight
            },

            sampledHeightRange: {
                min: minimum,
                max: maximum,
                variation: maximum - minimum
            },

            averageHeight: sum / count,

            sampleCount: count,
            samples
        };
    }

    dispose() {
        this.pixels = null;
        this.ready = false;
    }
}

