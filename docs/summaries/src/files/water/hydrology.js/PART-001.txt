
class Hydrology {

    constructor(terrain, waterSystem, cellSize = 20) {

        this.terrain = terrain;
        this.waterSystem = waterSystem;

        this.cellSize = cellSize;

        this.cells = new Map();

        this.defaultMoisture = 0.35;

        this.evaporationRate = 0.015;

        this.rainfallRetention = 1.0;
	this.geologicalField = null;

    }


    getCellCoordinates(x, z) {

        return {

            x: Math.floor(x / this.cellSize),

            z: Math.floor(z / this.cellSize)

        };

    }


    getCellKey(x, z) {

        return `${x},${z}`;

    }


	getCell(x, z) {
    const coordinates = this.getCellCoordinates(x, z);

    const key = this.getCellKey(
        coordinates.x,
        coordinates.z
    );

    if (!this.cells.has(key)) {
        const worldX = (coordinates.x + 0.5) * this.cellSize;
        const worldZ = (coordinates.z + 0.5) * this.cellSize;

        const soil = this.geologicalField
            ? this.geologicalField.sample(worldX, worldZ)
            : null;

        const capacity = soil
            ? 0.25 + soil.moistureCapacity * 0.75
            : 0.75;

        this.cells.set(key, {
            moisture: this.defaultMoisture * capacity,
            capacity,
            infiltration: soil?.infiltration ?? 0.65,
            drainage: soil?.drainage ?? 0.5,
            fertility: soil?.fertility ?? 0.5,
            soilType: soil?.surfaceSoil ?? "loam",
            rainfall: 0,
            evaporation: 0
        });
    }

    return this.cells.get(key);
}

sampleSoil(position) {
    if (!this.geologicalField || !position) {
        return null;
    }

    return this.geologicalField.sample(
        position.x,
        position.z
    );
}


sampleMoisture(position) {
    if (this.waterSystem.isUnderwater(position)) {
        return 1.0;
    }

    const cell = this.getCell(
        position.x,
        position.z
    );

    return BABYLON.Scalar.Clamp(
        cell.moisture / Math.max(cell.capacity, 0.001),
        0,
        1
    );
}


    addRain(position, radius, amount) {

        const minX = Math.floor(
            (position.x - radius) / this.cellSize
        );

        const maxX = Math.floor(
            (position.x + radius) / this.cellSize
        );

        const minZ = Math.floor(
            (position.z - radius) / this.cellSize
        );

        const maxZ = Math.floor(
            (position.z + radius) / this.cellSize
        );


        for (let x = minX; x <= maxX; x++) {

            for (let z = minZ; z <= maxZ; z++) {

                const worldX =
                    (x + 0.5) * this.cellSize;

                const worldZ =
                    (z + 0.5) * this.cellSize;

                const dx = worldX - position.x;
                const dz = worldZ - position.z;

                const distance = Math.sqrt(
                    dx * dx + dz * dz
                );

                if (distance > radius) continue;


                const terrainPosition =
                    this.terrain.sampleAt(
                        worldX,
                        worldZ
                    );

                if (!terrainPosition) continue;


                // Rain falling into the ocean
                // does not increase soil moisture.

                if (
                    this.waterSystem.isUnderwater(
                        terrainPosition
                    )
                ) {
                    continue;
                }


                const falloff =
                    1 - distance / radius;

                const cell = this.getCell(
                    worldX,
                    worldZ
                );

const depositedWater =
    amount *
    falloff *
    this.rainfallRetention *
    cell.infiltration;

const availableCapacity = Math.max(
    0,
    cell.capacity - cell.moisture
);

const storedWater = Math.min(
    depositedWater,
    availableCapacity
);

cell.moisture += storedWater;

// Water that cannot infiltrate or be stored
// becomes runoff rather than disappearing
// into the soil moisture reservoir.
const runoff = depositedWater - storedWater;

cell.rainfall += storedWater;
cell.runoff = (cell.runoff ?? 0) + runoff;
                cell.rainfall += depositedWater;

            }

        }

    }


update(deltaYears) {
    for (const cell of this.cells.values()) {
        const evaporation =
            this.evaporationRate *
            (0.35 + cell.drainage * 0.65) *
            deltaYears;

        const drainage =
            cell.drainage *
            0.025 *
            deltaYears;

        cell.moisture = Math.max(
            0,
            cell.moisture - evaporation - drainage
        );

        cell.evaporation += evaporation;

        cell.rainfall = Math.max(
            0,
            cell.rainfall - deltaYears * 0.1
        );

        cell.runoff = Math.max(
            0,
            (cell.runoff ?? 0) - deltaYears * 0.1
        );
    }
}

    getStatistics() {

        let totalMoisture = 0;

        let count = 0;

        for (const cell of this.cells.values()) {

            totalMoisture += cell.moisture;

            count++;

        }

        return {

            cells: count,

            averageMoisture:
                count > 0
                    ? totalMoisture / count
                    : this.defaultMoisture

        };

    }

}

export { Hydrology };

