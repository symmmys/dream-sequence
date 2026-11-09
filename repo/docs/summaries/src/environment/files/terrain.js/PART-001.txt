class TerrainSampler {

    constructor(scene, ground) {

        this.scene = scene;
        this.ground = ground;

        ground.isPickable = true;
        ground.computeWorldMatrix(true);

        const bounds = ground.getBoundingInfo().boundingBox;

        this.min = bounds.minimumWorld.clone();
        this.max = bounds.maximumWorld.clone();
    }


    sample() {

        const x = BABYLON.Scalar.RandomRange(
            this.min.x,
            this.max.x
        );

        const z = BABYLON.Scalar.RandomRange(
            this.min.z,
            this.max.z
        );

        const origin = new BABYLON.Vector3(
            x,
            this.max.y + 100,
            z
        );

        const ray = new BABYLON.Ray(
            origin,
            new BABYLON.Vector3(0, -1, 0),
            this.max.y - this.min.y + 200
        );

        const hit = this.scene.pickWithRay(
            ray,
            mesh => mesh === this.ground,
            true
        );

        if (!hit || !hit.hit || !hit.pickedPoint) {
            return null;
        }

        return hit.pickedPoint.clone();
    }


	
sampleNear(center, radius) {

    const angle = Math.random() * Math.PI * 2;

    // Uniform distribution over a circular area
    const distance = radius * Math.sqrt(Math.random());

    const x = center.x + Math.cos(angle) * distance;
    const z = center.z + Math.sin(angle) * distance;

    return this.sampleAt(x, z);
}


sampleAt(x, z) {

    if (
        x < this.min.x || x > this.max.x ||
        z < this.min.z || z > this.max.z
    ) {
        return null;
    }

    const origin = new BABYLON.Vector3(
        x,
        this.max.y + 100,
        z
    );

    const ray = new BABYLON.Ray(
        origin,
        new BABYLON.Vector3(0, -1, 0),
        this.max.y - this.min.y + 200
    );

    const hit = this.scene.pickWithRay(
        ray,
        mesh => mesh === this.ground,
        true
    );

    if (!hit || !hit.hit || !hit.pickedPoint) {
        return null;
    }

    return hit.pickedPoint.clone();
}


sampleSlopeAt(x, z, spacing = 4) {

    const left = this.sampleAt(
        x - spacing,
        z
    );

    const right = this.sampleAt(
        x + spacing,
        z
    );

    const back = this.sampleAt(
        x,
        z - spacing
    );

    const front = this.sampleAt(
        x,
        z + spacing
    );

    if (!left || !right || !back || !front) {
        return null;
    }

    const dx = (
        right.y - left.y
    ) / (spacing * 2);

    const dz = (
        front.y - back.y
    ) / (spacing * 2);

    const magnitude = Math.sqrt(
        dx * dx + dz * dz
    );

    const angle = Math.atan(magnitude);

    return {

        gradientX: dx,

        gradientZ: dz,

        magnitude,

        angle,

        degrees: angle * 180 / Math.PI,

        normal: new BABYLON.Vector3(
            -dx,
            1,
            -dz
        ).normalize()

    };

}


sampleProfileAt(x, z, spacing = 4) {

    const position = this.sampleAt(x, z);

    if (!position) return null;

    const slope = this.sampleSlopeAt(
        x,
        z,
        spacing
    );

    if (!slope) return null;

    const elevation = BABYLON.Scalar.Clamp(

        (position.y - this.min.y) /
        Math.max(1, this.max.y - this.min.y),

        0,
        1

    );

    return {

        position,

        elevation,

        slope: slope.magnitude,

        slopeDegrees: slope.degrees,

        normal: slope.normal

    };

}



}
export { TerrainSampler }
