const RockSpecies = {

    granite: {
        scale: 3.0,
        recursionDepth: 3,
        branchCount: 4,
        scaleDecay: 0.58,
        displacement: 0.75,
        irregularity: 0.55,

        // Geological properties
        hardness: 0.98,
        cohesion: 0.95,
        erosionRate: 0.001,
        fragmentation: 0.15,
        soilContribution: 0.15,

        verticalScale: 1.0,

        color: new BABYLON.Color3(0.38, 0.36, 0.32)
    },

    limestone: {
        scale: 4.0,
        recursionDepth: 3,
        branchCount: 5,
        scaleDecay: 0.62,
        displacement: 0.8,
        irregularity: 0.65,

        hardness: 0.65,
        cohesion: 0.65,
        erosionRate: 0.008,
        fragmentation: 0.45,
        soilContribution: 0.35,

        verticalScale: 0.9,

        color: new BABYLON.Color3(0.62, 0.59, 0.49)
    },

    sand: {
        scale: 2.0,
        recursionDepth: 2,
        branchCount: 5,
        scaleDecay: 0.55,
        displacement: 0.65,
        irregularity: 0.25,

        hardness: 0.08,
        cohesion: 0.12,
        erosionRate: 0.035,
        fragmentation: 0.8,
        soilContribution: 0.05,

        verticalScale: 0.22,

        color: new BABYLON.Color3(0.76, 0.65, 0.43)
    },

    clay: {
        scale: 2.5,
        recursionDepth: 2,
        branchCount: 4,
        scaleDecay: 0.60,
        displacement: 0.55,
        irregularity: 0.30,

        hardness: 0.28,
        cohesion: 0.45,
        erosionRate: 0.018,
        fragmentation: 0.55,
        soilContribution: 0.5,

        verticalScale: 0.35,

        color: new BABYLON.Color3(0.48, 0.25, 0.17)
    },

    fertileSoil: {
        scale: 2.0,
        recursionDepth: 2,
        branchCount: 5,
        scaleDecay: 0.52,
        displacement: 0.45,
        irregularity: 0.35,

        hardness: 0.05,
        cohesion: 0.15,
        erosionRate: 0.04,
        fragmentation: 0.9,
        soilContribution: 1.0,

        verticalScale: 0.18,

        color: new BABYLON.Color3(0.22, 0.16, 0.10)
    },

    anomaly: {
        scale: 3.0,
        recursionDepth: 4,
        branchCount: 3,
        scaleDecay: 0.72,
        displacement: 1.15,
        irregularity: 1.0,

        hardness: 0.85,
        cohesion: 0.35,
        erosionRate: 0.004,
        fragmentation: 0.95,
        soilContribution: 0.0,

        verticalScale: 1.4,

        color: new BABYLON.Color3(0.22, 0.12, 0.48)
    },

basalt: {
    scale: 3.4,
    recursionDepth: 3,
    branchCount: 4,
    scaleDecay: 0.58,
    displacement: 0.78,
    irregularity: 0.70,
    hardness: 0.96,
    cohesion: 0.94,
    erosionRate: 0.0015,
    fragmentation: 0.20,
    soilContribution: 0.15,
    verticalScale: 1.25,
    color: new BABYLON.Color3(0.24, 0.23, 0.22)
},

sandstone: {
    scale: 3.2,
    recursionDepth: 3,
    branchCount: 4,
    scaleDecay: 0.62,
    displacement: 0.72,
    irregularity: 0.60,
    hardness: 0.45,
    cohesion: 0.40,
    erosionRate: 0.009,
    fragmentation: 0.50,
    soilContribution: 0.35,
    verticalScale: 0.85,
    color: new BABYLON.Color3(0.65, 0.43, 0.29)
},

coal: {
    scale: 3.0,
    recursionDepth: 3,
    branchCount: 4,
    scaleDecay: 0.58,
    displacement: 0.65,
    irregularity: 0.35,

    hardness: 0.35,
    cohesion: 0.55,
    erosionRate: 0.012,
    fragmentation: 0.4,
    soilContribution: 0.2,

    verticalScale: 0.8,

    color: new BABYLON.Color3(
        0.075,
        0.065,
        0.055
    )
}


};
export { RockSpecies }
