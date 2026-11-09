class Environment {

    constructor(lightDirection) {

        this.sunDirection = lightDirection
            .negate()
            .normalize();

        // Environmental lighting configuration
        this.baseLight = 1.0;

        this.minimumLight = 0.12;

        // How strongly surrounding trees reduce light
        this.shadingStrength = 0.85;

        // Spatial grid for efficient canopy sampling
        this.canopyCellSize = 10;

        this.canopyGrid = new Map();
    }


    getCellKey(x, z) {

        const cx = Math.floor(x / this.canopyCellSize);
        const cz = Math.floor(z / this.canopyCellSize);

        return `${cx},${cz}`;
    }


    rebuildCanopyGrid(trees) {

        this.canopyGrid.clear();

        for (const tree of trees) {

            if (!tree.alive) continue;

            const age = tree.ageFactor;

            if (age < 0.1) continue;

            const height =
                tree.species.trunkLength *
                age *
                tree.genome.maxHeight;

            const radius =
                height *
                tree.species.canopy.width *
                tree.genome.canopyWidth;

            const key = this.getCellKey(
                tree.position.x,
                tree.position.z
            );

            if (!this.canopyGrid.has(key)) {
                this.canopyGrid.set(key, []);
            }

            this.canopyGrid.get(key).push({
                x: tree.position.x,
                z: tree.position.z,
                radius,
                height
            });

        }

    }

sampleLight(position) {

    const key = this.getCellKey(
        position.x,
        position.z
    );

    const cell = this.canopyGrid.get(key) || [];

    let shade = 0;

    for (const canopy of cell) {

        // Ignore canopies that are below the sample
        if (canopy.height <= position.y) continue;

        const dx = position.x - canopy.x;
        const dz = position.z - canopy.z;

        const distanceSquared =
            dx * dx + dz * dz;

        const radiusSquared =
            canopy.radius * canopy.radius;

        if (distanceSquared < radiusSquared) {

            const influence =
                1 - Math.sqrt(
                    distanceSquared / radiusSquared
                );

            shade += influence *
                this.shadingStrength *
                Math.min(1, canopy.height / 5);

        }

    }

    // Start with generous available light
    const intensity = BABYLON.Scalar.Clamp(
        1.0 - shade * 0.35,
        0.15,
        1.0
    );

    return {
        direction: this.sunDirection,
        intensity
    };

}

}
export { Environment }
