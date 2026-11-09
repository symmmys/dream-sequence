class SpatialGrid {

    constructor(cellSize = 2.5) {

        this.cellSize = cellSize;
        this.cells = new Map();

    }

    getKey(x, z) {

        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);

        return `${cx},${cz}`;
    }

    insert(tree) {

        const key = this.getKey(
            tree.position.x,
            tree.position.z
        );

        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }

        this.cells.get(key).push(tree);

    }

    isAvailable(position, minSpacing) {

        const cx = Math.floor(
            position.x / this.cellSize
        );

        const cz = Math.floor(
            position.z / this.cellSize
        );

        const searchRadius = Math.ceil(
            minSpacing / this.cellSize
        );

        const minSpacingSquared =
            minSpacing * minSpacing;

        for (
            let x = cx - searchRadius;
            x <= cx + searchRadius;
            x++
        ) {

            for (
                let z = cz - searchRadius;
                z <= cz + searchRadius;
                z++
            ) {

                const key = `${x},${z}`;
                const cell = this.cells.get(key);

                if (!cell) continue;

                for (const tree of cell) {

                    if (!tree.alive) continue;

                    const dx =
                        position.x - tree.position.x;

                    const dz =
                        position.z - tree.position.z;

                    if (
                        dx * dx + dz * dz <
                        minSpacingSquared
                    ) {
                        return false;
                    }

                }

            }

        }

        return true;

    }

}
export { SpatialGrid }
