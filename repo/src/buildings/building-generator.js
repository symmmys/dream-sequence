
class BuildingGenerator {
    constructor(options = {}) {
        this.defaultWallHeight = options.wallHeight ?? 3.2;
        this.defaultWallThickness = options.wallThickness ?? 0.18;
    }

    createBox(output, kind, position, dimensions, rotation = 0, material = "wall") {
        if (
            dimensions.x <= 0 ||
            dimensions.y <= 0 ||
            dimensions.z <= 0
        ) return;

        output.push({
            kind,
            position,
            dimensions,
            rotation,
            material
        });
    }

    getRoomEdges(room) {
        const b = room.bounds;

        return [
            {
                side: "north",
                x1: b.minX, z1: b.minZ,
                x2: b.maxX, z2: b.minZ
            },
            {
                side: "south",
                x1: b.minX, z1: b.maxZ,
                x2: b.maxX, z2: b.maxZ
            },
            {
                side: "west",
                x1: b.minX, z1: b.minZ,
                x2: b.minX, z2: b.maxZ
            },
            {
                side: "east",
                x1: b.maxX, z1: b.minZ,
                x2: b.maxX, z2: b.maxZ
            }
        ];
    }

    edgeKey(edge, floor) {
        const a = `${edge.x1},${edge.z1}`;
        const b = `${edge.x2},${edge.z2}`;

        return [
            floor,
            ...[a, b].sort()
        ].join(":");
    }

    generateWall(output, edge, openings, floorY, height, thickness) {
        const horizontal = edge.side === "north" ||
            edge.side === "south";

        const length = horizontal
            ? Math.abs(edge.x2 - edge.x1)
            : Math.abs(edge.z2 - edge.z1);

        const centerX = (edge.x1 + edge.x2) * 0.5;
        const centerZ = (edge.z1 + edge.z2) * 0.5;

        const wallRotation = horizontal ? 0 : Math.PI / 2;

        const centerY = floorY + height * 0.5;

        const validOpenings = openings
            .filter(o => o.side === edge.side)
            .map(o => ({
                ...o,
                center: o.offset * length
            }))
            .filter(o =>
                o.center - o.width * 0.5 >= 0 &&
                o.center + o.width * 0.5 <= length
            )
            .sort((a, b) => a.center - b.center);

        let cursor = 0;

        const addSegment = (start, end) => {
            if (end - start <= 0.01) return;

            const middle = (start + end) * 0.5;
            const along = middle - length * 0.5;

            this.createBox(
                output,
                "walls",
                {
                    x: centerX + (horizontal ? along : 0),
                    y: centerY,
                    z: centerZ + (horizontal ? 0 : along)
                },
                {
                    x: horizontal ? end - start : thickness,
                    y: height,
                    z: horizontal ? thickness : end - start
                },
                0,
                "wall"
            );
        };

        for (const opening of validOpenings) {
            const start = opening.center - opening.width * 0.5;
            const end = opening.center + opening.width * 0.5;

            // Full-height wall before the opening.
            addSegment(cursor, start);

            const along = opening.center - length * 0.5;
            const x = centerX + (horizontal ? along : 0);
            const z = centerZ + (horizontal ? 0 : along);

            // Windows retain their sill and lintel.
            if (opening.type === "window") {
                if (opening.sill > 0) {
                    this.createBox(
                        output,
                        "walls",
                        { x, y: floorY + opening.sill * 0.5, z },
                        {
                            x: horizontal ? opening.width : thickness,
                            y: opening.sill,
                            z: horizontal ? thickness : opening.width
                        }
                    );
                }

                const top = opening.sill + opening.height;
                const remaining = height - top;

                if (remaining > 0) {
                    this.createBox(
                        output,
                        "walls",
                        {
                            x,
                            y: floorY + top + remaining * 0.5,
                            z
                        },
                        {
                            x: horizontal ? opening.width : thickness,
                            y: remaining,
                            z: horizontal ? thickness : opening.width
                        }
                    );
                }

                this.createBox(
                    output,
                    "glazing",
                    {
                        x,
                        y: floorY + opening.sill + opening.height * 0.5,
                        z
                    },
                    {
                        x: horizontal ? opening.width * 0.88 : 0.035,
                        y: opening.height * 0.88,
                        z: horizontal ? 0.035 : opening.width * 0.88
                    },
                    0,
                    "glass"
                );
            } else {
                // Door frame components.
                const frame = 0.075;

                for (const side of [-1, 1]) {
                    this.createBox(
                        output,
                        "trim",
                        {
                            x: x + (horizontal ? side * (opening.width * 0.5 - frame * 0.5) : 0),
                            y: floorY + opening.height * 0.5,
                            z: z + (horizontal ? 0 : side * (opening.width * 0.5 - frame * 0.5))
                        },
                        {
                            x: horizontal ? frame : thickness * 0.75,
                            y: opening.height,
                            z: horizontal ? thickness * 0.75 : frame
                        },
                        0,
                        "wood"
                    );
                }

                this.createBox(
                    output,
                    "trim",
                    { x, y: floorY + opening.height, z },
                    {
                        x: horizontal ? opening.width : thickness * 0.75,
                        y: frame,
                        z: horizontal ? thickness * 0.75 : opening.width
                    },
                    0,
                    "wood"
                );

                // Door leaf is a separate component.
                this.createBox(
                    output,
                    "doors",
                    {
                        x,
                        y: floorY + opening.height * 0.5,
                        z
                    },
                    {
                        x: horizontal ? opening.width * 0.94 : 0.07,
                        y: opening.height * 0.94,
                        z: horizontal ? 0.07 : opening.width * 0.94
                    },
                    0,
                    "wood"
                );
            }

            cursor = end;
        }

        addSegment(cursor, length);
    }

    generate(building) {
        building.validate();

        const output = [];

        const edges = new Map();

        for (const room of building.rooms) {
            const floorY = room.floor * room.wallHeight;
            const b = room.bounds;

            this.createBox(
                output,
                "floors",
                {
                    x: (b.minX + b.maxX) * 0.5,
                    y: floorY - room.floorThickness * 0.5,
                    z: (b.minZ + b.maxZ) * 0.5
                },
                {
                    x: b.maxX - b.minX,
                    y: room.floorThickness,
                    z: b.maxZ - b.minZ
                },
                0,
                "floor"
            );

            this.createBox(
                output,
                "ceilings",
                {
                    x: (b.minX + b.maxX) * 0.5,
                    y: floorY + room.wallHeight,
                    z: (b.minZ + b.maxZ) * 0.5
                },
                {
                    x: b.maxX - b.minX,
                    y: 0.12,
                    z: b.maxZ - b.minZ
                },
                0,
                "ceiling"
            );

            for (const edge of this.getRoomEdges(room)) {
                const key = this.edgeKey(edge, room.floor);

                if (!edges.has(key)) {
                    edges.set(key, {
                        edge,
                        openings: [],
                        floorY,
                        height: room.wallHeight,
                        thickness: room.wallThickness
                    });
                }

		edges.get(key).openings.push(
    ...(room.openings ?? [])
        .filter(o => o.side === edge.side)
        .map(o => ({
            ...o,
            side: edges.get(key).edge.side
        }))
);

            }
        }

        for (const item of edges.values()) {
            this.generateWall(
                output,
                item.edge,
                item.openings,
                item.floorY,
                item.height,
                item.thickness
            );
        }

        // Explicitly placed modular objects.
        const components = [
            ...building.components,
            ...building.furniture,
            ...building.fixtures
        ];

        for (const component of components) {
            const kind = component.kind === "furniture"
                ? "furniture"
                : component.kind === "fixture"
                    ? "fixtures"
                    : component.kind;

            this.createBox(
                output,
                kind,
                component.position,
                component.dimensions,
                component.rotation,
                component.material
            );
        }

        return output;
    }
}

export { BuildingGenerator };

