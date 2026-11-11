/** Ambient-W extent helpers for the editor's universe-wide slice inspector. */

const DEFAULT_AXES = Object.freeze([
    Object.freeze({ x: 1, y: 0, z: 0, w: 0 }),
    Object.freeze({ x: 0, y: 1, z: 0, w: 0 }),
    Object.freeze({ x: 0, y: 0, z: 1, w: 0 })
]);
const DEFAULT_NORMAL = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const DEFAULT_DIMENSIONS = Object.freeze({ w: 10, x: 100, y: 60, z: 100 });
const DEFAULT_UNIVERSE_W_POINTS = Object.freeze([0, 75, 80]);
const UNIVERSE_SLICE_PADDING = 10;
const EPSILON = 1e-8;

/**
 * Return the ambient-W interval occupied by a Plane's complete 4D container.
 * The extent includes W components of all three in-plane axes as well as the
 * Plane normal, so rotated 4D frames are represented instead of assuming the
 * Plane is always aligned with ambient W.
 */
function getPlaneAmbientWBounds(plane) {
    const frame = plane?.frame ?? null;
    const origin = frame?.origin ?? { w: Number(plane?.w) || 0 };
    const center = Number.isFinite(Number(origin.w)) ? Number(origin.w) : 0;
    const dimensions = plane?.container?.dimensions ?? DEFAULT_DIMENSIONS;
    const axes = Array.isArray(frame?.axes) && frame.axes.length >= 3 ? frame.axes : DEFAULT_AXES;
    const normal = frame?.normal ?? DEFAULT_NORMAL;
    const extent =
        Math.abs(Number(axes[0]?.w) || 0) * Math.max(0, Number(dimensions.x ?? DEFAULT_DIMENSIONS.x)) / 2 +
        Math.abs(Number(axes[1]?.w) || 0) * Math.max(0, Number(dimensions.y ?? DEFAULT_DIMENSIONS.y)) / 2 +
        Math.abs(Number(axes[2]?.w) || 0) * Math.max(0, Number(dimensions.z ?? DEFAULT_DIMENSIONS.z)) / 2 +
        Math.abs(Number(normal.w) || 0) * Math.max(0, Number(dimensions.w ?? DEFAULT_DIMENSIONS.w)) / 2;
    return { min: center - extent, max: center + extent, center, extent };
}

/**
 * Compute the editor's universe-wide ambient-W inspection range.
 * Runtime slices provide the game's live graph extent; saved and unsaved Plane
 * definitions extend it. A small margin lets the user inspect just beyond the
 * outermost Plane rather than stopping on its boundary.
 */
function getUniverseWSliceBounds(planes = [], runtimeWorlds = null) {
    let minimum = Math.min(...DEFAULT_UNIVERSE_W_POINTS);
    let maximum = Math.max(...DEFAULT_UNIVERSE_W_POINTS);
    const include = bounds => {
        if (!Number.isFinite(bounds?.min) || !Number.isFinite(bounds?.max)) return;
        minimum = Math.min(minimum, bounds.min, bounds.max);
        maximum = Math.max(maximum, bounds.min, bounds.max);
    };

    for (const plane of planes ?? []) include(getPlaneAmbientWBounds(plane));

    const worlds = runtimeWorlds instanceof Map
        ? runtimeWorlds.values()
        : Array.isArray(runtimeWorlds) ? runtimeWorlds : [];
    for (const world of worlds) {
        const frame = world?.slice?.frame;
        const center = Number.isFinite(Number(frame?.origin?.w)) ? Number(frame.origin.w) : Number(world?.slice?.w) || 0;
        const normalW = Math.abs(Number(frame?.normal?.w ?? 1)) || 0;
        const bounds = world?.wBounds;
        if (Number.isFinite(bounds?.min) && Number.isFinite(bounds?.max)) {
            const offsets = [bounds.min * normalW, bounds.max * normalW];
            include({ min: center + Math.min(...offsets), max: center + Math.max(...offsets) });
        } else {
            include({ min: center, max: center });
        }
    }

    const padding = Math.max(UNIVERSE_SLICE_PADDING, (maximum - minimum) * 0.05);
    return {
        min: Math.floor(minimum - padding),
        max: Math.ceil(maximum + padding)
    };
}

/** Convert an ambient-W selection to a Plane-local normal offset. */
function getPlaneNormalOffsetAtW(plane, coordinate) {
    const center = getPlaneAmbientWBounds(plane).center;
    const normalW = Number(plane?.frame?.normal?.w ?? 1);
    if (!Number.isFinite(coordinate) || !Number.isFinite(normalW) || Math.abs(normalW) < EPSILON) return 0;
    return (coordinate - center) / normalW;
}

/** Whether a Plane's 4D container intersects the requested ambient-W slice. */
function planeIntersectsWSlice(plane, coordinate, epsilon = EPSILON) {
    if (!Number.isFinite(coordinate)) return true;
    const bounds = getPlaneAmbientWBounds(plane);
    return coordinate >= bounds.min - epsilon && coordinate <= bounds.max + epsilon;
}

export {
    getPlaneAmbientWBounds,
    getPlaneNormalOffsetAtW,
    getUniverseWSliceBounds,
    planeIntersectsWSlice
};
