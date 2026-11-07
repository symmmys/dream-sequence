function hashNoise2D(x, z, seed = 1) {

    let n =
        Math.imul(x | 0, 374761393) +
        Math.imul(z | 0, 668265263) +
        Math.imul(seed | 0, 1442695041);

    n = Math.imul(
        n ^ (n >>> 13),
        1274126177
    );

    n ^= n >>> 16;

    return (n >>> 0) / 4294967295;

}


function smoothNoise2D(x, z, seed = 1) {

    const ix = Math.floor(x);
    const iz = Math.floor(z);

    const fx = x - ix;
    const fz = z - iz;

    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);

    const a = hashNoise2D(ix, iz, seed);
    const b = hashNoise2D(ix + 1, iz, seed);
    const c = hashNoise2D(ix, iz + 1, seed);
    const d = hashNoise2D(ix + 1, iz + 1, seed);

    const ab = BABYLON.Scalar.Lerp(a, b, u);
    const cd = BABYLON.Scalar.Lerp(c, d, u);

    return BABYLON.Scalar.Lerp(ab, cd, v);

}


function fractalNoise2D(
    x,
    z,
    seed,
    octaves = 4
) {

    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let totalAmplitude = 0;

    for (let i = 0; i < octaves; i++) {

        value += smoothNoise2D(
            x * frequency,
            z * frequency,
            seed + i * 1013
        ) * amplitude;

        totalAmplitude += amplitude;

        amplitude *= 0.5;
        frequency *= 2;

    }

    return value / totalAmplitude;

}
export { hashNoise2D, smoothNoise2D, fractalNoise2D };
