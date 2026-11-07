
class FloorPlanBuilder {
    constructor(options = {}) {
        this.wallHeight = options.wallHeight ?? 4;
        this.wallThickness = options.wallThickness ?? 0.35;
        this.doorHeight = options.doorHeight ?? 2.1;
        this.windowHeight = options.windowHeight ?? 1.2;
        this.windowSill = options.windowSill ?? 0.9;
        this.minimumSegmentPixels =
            options.minimumSegmentPixels ?? 5;
    }

    setWallHeight(value) {
        if (
            !Number.isFinite(value) ||
            value < 2.4 ||
            value > 1000
        ) {
            throw new Error(
                "Wall height must be between 2.4 and 1000."
            );
        }

        this.wallHeight = value;
        return value;
    }

    setWallThickness(value) {
        if (
            !Number.isFinite(value) ||
            value < 0.1 ||
            value > 1000
        ) {
            throw new Error(
                "Wall thickness must be between 0.1 and 1000."
            );
        }

        this.wallThickness = value;
        return value;
    }

    classify(r, g, b, a) {
        if (a < 128) return null;

        if (r < 75 && g < 75 && b < 75) {
            return "wall";
        }

        if (r > 150 && g < 110 && b < 110) {
            return "door";
        }

        if (g > 130 && r < 120 && b < 130) {
            return "window";
        }

        return null;
    }

    extractSegments(imageData) {
        const { data, width, height } = imageData;

        if (
            !data ||
            !Number.isInteger(width) ||
            !Number.isInteger(height) ||
            width <= 0 ||
            height <= 0 ||
            data.length < width * height * 4
        ) {
            throw new Error("Invalid floor-plan image data.");
        }

        const active = new Map();
        const completed = [];

        for (let y = 0; y < height; y++) {
            const current = new Set();
            let x = 0;

            while (x < width) {
                const index = (y * width + x) * 4;

                const kind = this.classify(
                    data[index],
                    data[index + 1],
                    data[index + 2],
                    data[index + 3]
                );

                if (!kind) {
                    x++;
                    continue;
                }

                const start = x;

                while (x < width) {
                    const i = (y * width + x) * 4;

                    if (
                        this.classify(
                            data[i],
                            data[i + 1],
                            data[i + 2],
                            data[i + 3]
                        ) !== kind
                    ) {
                        break;
                    }

                    x++;
                }

                const end = x - 1;
                const key = `${kind}:${start}:${end}`;

                current.add(key);

                const previous = active.get(key);

                if (previous) {
                    previous.maxY = y;
                } else {
                    active.set(key, {
                        kind,
                        minX: start,
                        maxX: end,
                        minY: y,
                        maxY: y
                    });
                }
            }

            for (const [key, segment] of active) {
                if (!current.has(key)) {
                    completed.push(segment);
                    active.delete(key);
                }
            }
        }

        completed.push(...active.values());

        return completed.filter(segment => {
            const w = segment.maxX - segment.minX + 1;
            const h = segment.maxY - segment.minY + 1;

            return Math.max(w, h) >= this.minimumSegmentPixels;
        });
    }

    build(building, imageData, options = {}) {
        if (
            !building ||
            typeof building.addComponent !== "function" ||
            !Array.isArray(building.components)
        ) {
            throw new Error("Invalid building model.");
        }

        const width = options.width ?? 20;
        const depth = options.depth ?? 20;
        const floorIndex = options.floor ?? 0;

        if (
            !Number.isFinite(width) ||
            !Number.isFinite(depth) ||
            width <= 0 ||
            depth <= 0 ||
            !Number.isInteger(floorIndex) ||
            floorIndex < 0
        ) {
            throw new Error("Invalid floor dimensions.");
        }

        const segments = this.extractSegments(imageData);

        if (!segments.length) {
            throw new Error(
                "No architectural lines detected."
            );
        }

        const scaleX = width / imageData.width;
        const scaleZ = depth / imageData.height;

        const floorY = floorIndex * this.wallHeight;
        const prefix = `floor-plan-${floorIndex}-`;

        const generated = [];

        const counts = {
            walls: 0,
            doors: 0,
            windows: 0,
            floors: 0
        };

        const add = (
            kind,
            type,
            position,
            dimensions,
            material
        ) => {
            generated.push({
                kind,
                type: prefix + type,
                position,
                dimensions,
                material
            });
        };

        add(
            "floors",
            "floor",
            { x: 0, y: floorY - 0.075, z: 0 },
            { x: width, y: 0.15, z: depth },
            "floor"
        );

        counts.floors++;

        for (const segment of segments) {
            const pixelWidth =
                segment.maxX - segment.minX + 1;

            const pixelHeight =
                segment.maxY - segment.minY + 1;

            const horizontal = pixelWidth >= pixelHeight;

            const centerPixelX =
                (segment.minX + segment.maxX + 1) * 0.5;

            const centerPixelY =
                (segment.minY + segment.maxY + 1) * 0.5;

            const x =
                (centerPixelX / imageData.width - 0.5) * width;

            const z =
                (centerPixelY / imageData.height - 0.5) * depth;

            const length = horizontal
                ? pixelWidth * scaleX
                : pixelHeight * scaleZ;

            const detectedThickness = Math.max(
                0.08,
                Math.min(
                    0.35,
                    horizontal
                        ? pixelHeight * scaleZ
                        : pixelWidth * scaleX
                )
            );

            const thickness = segment.kind === "wall"
                ? this.wallThickness
                : detectedThickness;

            const dimensions = horizontal
                ? { x: length, z: thickness }
                : { x: thickness, z: length };

            if (segment.kind === "wall") {
                add(
                    "walls",
                    "wall",
                    {
                        x,
                        y: floorY + this.wallHeight * 0.5,
                        z
                    },
                    {
                        ...dimensions,
                        y: this.wallHeight
                    },
                    "wall"
                );

                counts.walls++;
                continue;
            }

            if (segment.kind === "door") {
                add(
                    "doors",
                    "door",
                    {
                        x,
                        y: floorY + this.doorHeight * 0.5,
                        z
                    },
                    {
                        ...dimensions,
                        y: this.doorHeight
                    },
                    "wood"
                );

                counts.doors++;
                continue;
            }

            if (segment.kind === "window") {
                const windowDepth = Math.max(
                    0.035,
                    detectedThickness * 0.25
                );

                add(
                    "glazing",
                    "window",
                    {
                        x,
                        y: floorY + this.windowSill +
                            this.windowHeight * 0.5,
                        z
                    },
                    horizontal
                        ? {
                            x: length,
                            y: this.windowHeight,
                            z: windowDepth
                        }
                        : {
                            x: windowDepth,
                            y: this.windowHeight,
                            z: length
                        },
                    "glass"
                );

                counts.windows++;
            }
        }

        const legacyTypes = new Set([
            "floor-plan-floor",
            "floor-plan-wall",
            "floor-plan-door",
            "floor-plan-window"
        ]);

        building.components = building.components.filter(
            component =>
                !legacyTypes.has(component.type) &&
                !component.type?.startsWith(prefix)
        );

        for (const component of generated) {
            building.addComponent(component);
        }

        return {
            ...counts,
            floor: floorIndex,
            totalSegments: segments.length,
            wallHeight: this.wallHeight,
            wallThickness: this.wallThickness,
            generatedComponents: generated.length
        };
    }
}

export { FloorPlanBuilder };

