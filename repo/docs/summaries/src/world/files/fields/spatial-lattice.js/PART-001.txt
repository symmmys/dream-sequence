
class SpatialLattice {

    constructor({
        origin = { x: 0, y: 0, z: 0 },
        dimensions = { x: 16, y: 16, z: 16 },
        cellSize = 10,
        defaultValue = null,
        interpolate = null
    } = {}) {

        if (
            !Number.isFinite(cellSize) ||
            cellSize <= 0
        ) {
            throw new Error("Invalid lattice cell size.");
        }

        this.origin = { ...origin };

        this.dimensions = { ...dimensions };

        this.cellSize = cellSize;

        this.defaultValue = defaultValue;

        this.interpolate = interpolate ||
            SpatialLattice.interpolateValues;

        this.values = new Map();

    }

    getKey(x, y, z) {

        return `${x},${y},${z}`;

    }

    set(x, y, z, value) {

        this.validateCoordinates(x, y, z);

        this.values.set(
            this.getKey(x, y, z),
            value
        );

    }

    get(x, y, z) {

        return this.values.get(
            this.getKey(x, y, z)
        ) ?? this.defaultValue;

    }

    validateCoordinates(x, y, z) {

        const d = this.dimensions;

        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            !Number.isInteger(z) ||
            x < 0 || y < 0 || z < 0 ||
            x >= d.x || y >= d.y || z >= d.z
        ) {

            throw new RangeError(
                "Lattice coordinates out of bounds."
            );

        }

    }

    worldToGrid(position) {

        return {

            x: (position.x - this.origin.x) / this.cellSize,

            y: (position.y - this.origin.y) / this.cellSize,

            z: (position.z - this.origin.z) / this.cellSize

        };

    }

    sample(position) {

        const p = this.worldToGrid(position);

        const x0 = Math.floor(p.x);
        const y0 = Math.floor(p.y);
        const z0 = Math.floor(p.z);

        const tx = p.x - x0;
        const ty = p.y - y0;
        const tz = p.z - z0;

        const d = this.dimensions;

        if (
            p.x < 0 || p.y < 0 || p.z < 0 ||
            p.x > d.x - 1 ||
            p.y > d.y - 1 ||
            p.z > d.z - 1
        ) {
            return this.defaultValue;
        }

        const x1 = Math.min(x0 + 1, d.x - 1);
        const y1 = Math.min(y0 + 1, d.y - 1);
        const z1 = Math.min(z0 + 1, d.z - 1);

        const samples = [

            [this.get(x0, y0, z0), (1-tx)*(1-ty)*(1-tz)],
            [this.get(x1, y0, z0), tx*(1-ty)*(1-tz)],
            [this.get(x0, y1, z0), (1-tx)*ty*(1-tz)],
            [this.get(x1, y1, z0), tx*ty*(1-tz)],

            [this.get(x0, y0, z1), (1-tx)*(1-ty)*tz],
            [this.get(x1, y0, z1), tx*(1-ty)*tz],
            [this.get(x0, y1, z1), (1-tx)*ty*tz],
            [this.get(x1, y1, z1), tx*ty*tz]

        ];

        return this.interpolate(samples);

    }

    static interpolateValues(samples) {

	if (samples.some(([value]) => value == null)) {
		return null;
	}
        const first = samples[0][0];

        if (first === null || first === undefined) {
            return null;
        }

        if (typeof first === "number") {

            return samples.reduce(
                (sum, [value, weight]) =>
                    sum + value * weight,
                0
            );

        }

        if (Array.isArray(first)) {

            return first.map((_, i) =>

                samples.reduce(
                    (sum, [value, weight]) =>
                        sum + value[i] * weight,
                    0
                )

            );

        }

        if (
            typeof first === "object" &&
            "x" in first &&
            "y" in first &&
            "z" in first
        ) {

            const result = {
                x: 0,
                y: 0,
                z: 0
            };

            for (const [value, weight] of samples) {

                if (!value) continue;

                result.x += value.x * weight;
                result.y += value.y * weight;
                result.z += value.z * weight;

            }

            return result;

        }

        return first;

    }

}

export { SpatialLattice };

