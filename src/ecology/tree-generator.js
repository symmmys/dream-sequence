function generateCanopy(tree, ageFactor, thicknessFactor = ageFactor) {

    const species = tree.species;
    const genome = tree.genome;

    const canopy = species.canopy;

    const height =
        species.trunkLength *
        ageFactor *
        genome.maxHeight;

    const growth = Math.max(0.04, ageFactor);

    const centerY = tree.position.y + height * (canopy.startHeight + canopy.height * 0.5);

    const canopyHeight =
        height * canopy.height;

    const canopyWidth =
        height *
        canopy.width *
        genome.canopyWidth *
        growth;

    const clusters = [];

    const layers = canopy.layers;

    for (let layer = 0; layer < layers; layer++) {

        const t = layers === 1
            ? 0.5
            : layer / (layers - 1);

        const y = centerY +
            (t - 0.5) * canopyHeight;

        let layerRadius;

        if (canopy.shape === "round") {

            // Broad crown: widest around the middle
            layerRadius =
                canopyWidth *
                Math.sqrt(Math.max(0, 1 -
                    Math.pow(2 * t - 1, 2)));

        } else {

            // Conical crown: widest at the bottom
            layerRadius =
                canopyWidth * (1 - t) * 0.95 +
                canopyWidth * 0.05;

        }

        const count = Math.max(
            3,
            Math.round(8 * canopy.density)
        );

        for (let i = 0; i < count; i++) {

            const angle =
                2 * Math.PI * i / count +
                layer * 0.35;

            const radius =
                layerRadius *
                (0.65 + Math.random() * 0.35);

            const position = new BABYLON.Vector3(
                tree.position.x +
                    Math.cos(angle) * radius,

                y,

                tree.position.z +
                    Math.sin(angle) * radius
            );

            const leafScale =
                Math.max(0.04, height * 0.055) *
                genome.leafSize *
                growth;

            clusters.push({
                position,
                scale: leafScale
            });
        }
    }

    return clusters;
}

function DirectionRotation(direction) {

    const up = BABYLON.Axis.Y;

    const dir = direction.normalize();

    const dot = BABYLON.Scalar.Clamp(
        BABYLON.Vector3.Dot(up, dir),
        -1,
        1
    );

    if (dot > 0.99999) {
        return BABYLON.Quaternion.Identity();
    }

    if (dot < -0.99999) {
        return BABYLON.Quaternion.RotationAxis(
            BABYLON.Axis.X,
            Math.PI
        );
    }

    const axis = BABYLON.Vector3.Cross(
        up,
        dir
    ).normalize();

    return BABYLON.Quaternion.RotationAxis(
        axis,
        Math.acos(dot)
    );
}



function makeBranchMatrix(
    start,
    direction,
    length,
    baseRadius
) {

    const dir = direction.normalize();

    const rotation = DirectionRotation(dir);

    const center = start.add(
        dir.scale(length / 2)
    );

    // Prototype bottom radius is 0.5
    const radialScale = baseRadius / 0.5;

    const scale = new BABYLON.Vector3(
        radialScale,
        length,
        radialScale
    );

    return BABYLON.Matrix.Compose(
        scale,
        rotation,
        center
    );
}


// Create a coordinate system perpendicular to a direction
function getRadialDirection(direction, phi) {

    const reference =
        Math.abs(direction.y) < 0.95
            ? BABYLON.Axis.Y
            : BABYLON.Axis.X;

    const tangent = BABYLON.Vector3.Cross(
        direction,
        reference
    ).normalize();

    const bitangent = BABYLON.Vector3.Cross(
        direction,
        tangent
    ).normalize();

    return tangent.scale(Math.cos(phi))
        .add(bitangent.scale(Math.sin(phi)))
        .normalize();
}

class TreeGenerator {

    constructor(species, environment, genome) {

        this.species = species;
        this.environment = environment;
        this.genome = genome;
	this.currentAgeFactor = 0;

        this.matrices = [];
	this.foliage = [];
    }


generate(
    position,
    ageFactor = 1,
    thicknessFactor = 1,
    detailLevel = 2
) {

	this.matrices = [];
	this.foliage = [];
	this.currentAgeFactor = ageFactor;


const growth = ageFactor * ageFactor *
    (3 - 2 * ageFactor);

const s = this.species;
const g = this.genome;

// Height
const trunkLength =
    s.trunkLength * growth * g.maxHeight;

// Thickness
const trunkRadius =
    s.trunkRadius *
    Math.sqrt(Math.max(ageFactor, 0.001)) *
    g.trunkThickness;

// Branch dimensions
const branchLength =
    s.branchLength * growth * g.maxHeight;

const branchRadius =
    s.branchRadius *
    Math.sqrt(Math.max(ageFactor, 0.001)) *
    g.branchThickness;
//generate the trunk
this.matrices.push(
    makeBranchMatrix(
        position,
        BABYLON.Axis.Y,
        trunkLength,
        trunkRadius
    )
);
        const trunkEnd = position.add(
            BABYLON.Axis.Y.scale(trunkLength)
        );
	const canopyScale =
    growth *
    this.genome.canopyWidth *
    this.genome.leafSize;

	// Simplified distant canopy
if (detailLevel === 0 && ageFactor >= 0.2) {

    this.foliage.push({

        position: trunkEnd.clone(),

        scale: Math.max(
            0.2,
            canopyScale * 2.0
        )

    });

}


if (ageFactor < 0.2) {

    this.foliage.push({
        position: trunkEnd.clone(),
        scale: Math.max(0.08, canopyScale * 1.2)
    });

}

        // Branch complexity increases with age
let maxDepth =
    ageFactor < 0.2 ? 0 :
    ageFactor < 0.5 ? 1 :
    s.maxDepth;

// Distance-based geometry reduction
if (detailLevel === 1) {

    maxDepth = Math.min(maxDepth, 1);

} else if (detailLevel === 0) {

    maxDepth = 0;

}
        this.growBranch(
            trunkEnd,
            BABYLON.Axis.Y,
            branchLength,
            branchRadius,
            0,
            maxDepth
        );

        return this.matrices;
    }


    growBranch(
        start,
        parentDirection,
        length,
        radius,
        depth,
        maxDepth
    ) {

        if (depth >= maxDepth) {
            return;
        }

        const s = this.species;
        const g = this.genome;

        const branchCount = Math.max(
            1,
            Math.round(s.branchCount * g.branchDensity)
        );

        for (let i = 0; i < branchCount; i++) {

            const phi =
                2 * Math.PI * i / branchCount;

            const radial = getRadialDirection(
                parentDirection,
                phi
            );

            const angle =
                s.branchAngle * g.branchAngle;

            const intrinsicDirection =
                parentDirection.scale(
                    Math.cos(angle)
                ).add(
                    radial.scale(
                        Math.sin(angle)
                    )
                ).normalize();

            const light =
                this.environment.sampleLight(start);

            const direction = BABYLON.Vector3.Lerp(
                intrinsicDirection,
                light.direction,
                s.lightSensitivity *
                g.lightSensitivity *
                light.intensity
            ).normalize();

this.matrices.push(
    makeBranchMatrix(
        start,
        direction,
        length,
        radius
    )
);
            const end = start.add(
                direction.scale(length)
            );

		const ageFactor = this.currentAgeFactor;

let foliageScale =
    (0.25 + ageFactor * 0.75) *
    this.genome.leafSize *
    this.genome.canopyWidth;

if (s.branching === "radial") {

    // Oak: broad, substantial foliage clusters
    foliageScale *= 1.5;

} else if (s.branching === "whorled") {

    // Pine: smaller, more compact clusters
    foliageScale *= 1.15;

}

if ( depth === maxDepth - 1 ) {

    this.foliage.push({
        position: end.clone(),
        scale: foliageScale
    });

}

if (s.branching === "whorled") {

    const leader = BABYLON.Vector3.Lerp(
        parentDirection,
        light.direction,
        s.lightSensitivity *
        g.lightSensitivity *
        light.intensity
    ).normalize();

    // Keep the visual leader branch
    this.matrices.push(
        makeBranchMatrix(
            end,
            leader,
            length * s.lengthDecay,
            radius * s.radiusDecay
        )
    );

    // Do not recursively grow another leader branch.
}

// Continue normal branch growth
this.growBranch(
    end,
    direction,
    length * s.lengthDecay,
    radius * s.radiusDecay,
    depth + 1,
    maxDepth
);
        }
    }

}
export { TreeGenerator , DirectionRotation }
