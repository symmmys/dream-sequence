/**
 * Engine-independent primitives for the ambient four-dimensional space.
 * A slice frame contains three tangent axes and one orthogonal normal.
 */

const AXES = ['x', 'y', 'z', 'w'];
const PLANES = ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'];
const FRAME_TOLERANCE = 1e-9;
const ZERO_TOLERANCE = 1e-12;

function createVector4(value) {
    assertVector4(value);
    return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function assertVector4(value) {
    if (!value || !AXES.every(function isFiniteAxis(axis) {
        return Number.isFinite(value[axis]);
    })) {
        throw new TypeError('Expected a finite four-dimensional vector.');
    }
}

function add4(a, b) {
    assertVector4(a);
    assertVector4(b);
    return mapVector4(a, b, function addAxis(left, right) {
        return left + right;
    });
}

function subtract4(a, b) {
    assertVector4(a);
    assertVector4(b);
    return mapVector4(a, b, function subtractAxis(left, right) {
        return left - right;
    });
}

function scale4(vector, factor) {
    assertVector4(vector);
    assertFinite(factor, 'Scale');
    const result = {
        x: vector.x * factor,
        y: vector.y * factor,
        z: vector.z * factor,
        w: vector.w * factor
    };
    assertVector4(result);
    return result;
}

function dot4(a, b) {
    assertVector4(a);
    assertVector4(b);
    const result = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    assertFinite(result, 'Dot product');
    return result;
}

function norm4(vector) {
    assertVector4(vector);
    // Math.hypot scales its inputs to avoid premature square overflow.
    const length = Math.hypot(vector.x, vector.y, vector.z, vector.w);
    if (!Number.isFinite(length)) throw new RangeError('4D vector length exceeds numeric range.');
    return length;
}

function normalize4(vector) {
    const length = norm4(vector);
    if (length <= ZERO_TOLERANCE) {
        throw new RangeError('Cannot normalize a zero-length 4D vector.');
    }
    return scale4(vector, 1 / length);
}

function interpolate4(a, b, t) {
    assertUnitParameter(t);
    return add4(a, scale4(subtract4(b, a), t));
}

function rotate4(vector, plane, angle) {
    assertVector4(vector);
    assertFinite(angle, 'Rotation angle');
    if (!PLANES.includes(plane)) {
        throw new RangeError(`Unsupported 4D rotation plane: ${plane}`);
    }

    const [first, second] = plane.split('');
    const result = { ...vector };
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    result[first] = vector[first] * cosine - vector[second] * sine;
    result[second] = vector[first] * sine + vector[second] * cosine;
    assertVector4(result);
    return result;
}

function createCanonicalSliceFrame(w = 0) {
    assertFinite(w, 'Slice w coordinate');
    return createSliceFrame({
        origin: { x: 0, y: 0, z: 0, w },
        axes: [basis4(0), basis4(1), basis4(2)],
        normal: basis4(3)
    });
}

function createSliceFrame(frame) {
    if (!frame || !Array.isArray(frame.axes) || frame.axes.length !== 3) {
        throw new TypeError('A 3D slice frame requires exactly three tangent axes.');
    }

    const normalized = {
        origin: createVector4(frame.origin),
        axes: frame.axes.map(createVector4),
        normal: normalize4(createVector4(frame.normal))
    };
    validateOrthonormalFrame(normalized);
    return normalized;
}

function validateOrthonormalFrame(frame) {
    const basis = [...frame.axes, frame.normal];
    for (let row = 0; row < basis.length; row++) {
        for (let column = row; column < basis.length; column++) {
            const expected = row === column ? 1 : 0;
            if (Math.abs(dot4(basis[row], basis[column]) - expected) > FRAME_TOLERANCE) {
                throw new RangeError('Slice frame axes must be orthonormal in 4D.');
            }
        }
    }
}

function sliceToAmbient(frame, position) {
    const local = createPosition3(position);
    return frame.axes.reduce(function addFrameAxis(point, axis, index) {
        return add4(point, scale4(axis, local[['x', 'y', 'z'][index]]));
    }, { ...frame.origin });
}

function ambientToSlice(frame, position) {
    assertVector4(position);
    const offset = subtract4(position, frame.origin);
    return {
        position: {
            x: dot4(offset, frame.axes[0]),
            y: dot4(offset, frame.axes[1]),
            z: dot4(offset, frame.axes[2])
        },
        normalOffset: dot4(offset, frame.normal)
    };
}

function createPerpendicularFrame(tangent) {
    const direction = normalize4(tangent);
    const candidates = [0, 1, 2, 3]
        .map(basis4)
        .sort(function leastAlignedFirst(a, b) {
            return Math.abs(dot4(a, direction)) - Math.abs(dot4(b, direction));
        });
    return selectPerpendicularAxes(candidates, direction, []);
}

function transportPerpendicularFrame(previousAxes, tangent) {
    if (!Array.isArray(previousAxes) || previousAxes.length !== 3) {
        throw new TypeError('Frame transport requires three previous axes.');
    }
    const direction = normalize4(tangent);
    // Project old axes into the new tangent's normal space before orthogonalizing.
    const projected = previousAxes.map(function projectAxis(axis) {
        return subtract4(axis, scale4(direction, dot4(axis, direction)));
    });
    // Canonical axes fill dimensions lost at near-90-degree tangent changes.
    projected.push(basis4(0), basis4(1), basis4(2), basis4(3));
    return selectPerpendicularAxes(projected, direction, []);
}

function selectPerpendicularAxes(candidates, direction, selected) {
    for (const candidate of candidates) {
        let residual = subtract4(
            candidate,
            scale4(direction, dot4(candidate, direction))
        );
        for (const axis of selected) {
            residual = subtract4(residual, scale4(axis, dot4(residual, axis)));
        }
        const length = norm4(residual);
        if (length > ZERO_TOLERANCE) selected.push(scale4(residual, 1 / length));
        if (selected.length === 3) break;
    }

    if (selected.length !== 3) {
        throw new RangeError('Unable to construct a stable 4D cross-section frame.');
    }
    return selected;
}

function createPosition3(position) {
    if (!position || !['x', 'y', 'z'].every(function isFiniteAxis(axis) {
        return Number.isFinite(position[axis]);
    })) {
        throw new TypeError('Expected a finite three-dimensional position.');
    }
    return { x: position.x, y: position.y, z: position.z };
}

function basis4(index) {
    return { x: +(index === 0), y: +(index === 1), z: +(index === 2), w: +(index === 3) };
}

function mapVector4(a, b, operation) {
    const result = {
        x: operation(a.x, b.x),
        y: operation(a.y, b.y),
        z: operation(a.z, b.z),
        w: operation(a.w, b.w)
    };
    assertVector4(result);
    return result;
}

function assertFinite(value, label) {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
}

function assertUnitParameter(t) {
    assertFinite(t, 'Interpolation parameter');
    if (t < 0 || t > 1) throw new RangeError('Parameter must be between 0 and 1.');
}

export {
    add4,
    ambientToSlice,
    assertVector4,
    createCanonicalSliceFrame,
    createPerpendicularFrame,
    createPosition3,
    createSliceFrame,
    createVector4,
    dot4,
    interpolate4,
    norm4,
    normalize4,
    rotate4,
    scale4,
    sliceToAmbient,
    subtract4,
    transportPerpendicularFrame
};
