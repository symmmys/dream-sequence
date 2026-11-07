
const CloudSpecies = {
    cumulus: {
        scale: 220,
        recursionDepth: 1,
        branchCount: 5,
        scaleDecay: 0.68,
        horizontalSpread: 1.05,
        verticalSpread: 0.24,
        irregularity: 0.30,
        width: 1.65,
        height: 0.75,
        depth: 1.45,
        moistureCapacity: 100,
        absorptionRate: 16,
        rainDuration: 1.5,
        color: new BABYLON.Color3(
            0.98, 0.99, 1.0
        )
    },

    towering: {
        scale: 440,
        recursionDepth: 2,
        branchCount: 4,
        scaleDecay: 0.70,
        horizontalSpread: 0.85,
        verticalSpread: 0.65,
        irregularity: 0.42,
        width: 1.45,
        height: 1.65,
        depth: 1.35,
        moistureCapacity: 150,
        absorptionRate: 24,
        rainDuration: 2.5,
        color: new BABYLON.Color3(
            0.91, 0.94, 0.98
        )
    },

    cumulonimbus: {
        scale: 820,
        recursionDepth: 2,
        branchCount: 5,
        scaleDecay: 0.72,
        horizontalSpread: 0.78,
        verticalSpread: 1.05,
        irregularity: 0.48,
        width: 1.35,
        height: 2.45,
        depth: 1.35,
        moistureCapacity: 200,
        absorptionRate: 36,
        rainDuration: 5.0,
        color: new BABYLON.Color3(
            0.63, 0.69, 0.79
        )
    }
};

export { CloudSpecies };

