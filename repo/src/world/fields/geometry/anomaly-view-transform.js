import { ambientToSlice } from './spatial-4d.js?v=somnium-20261108-phase16d-anomaly-aperture-views-2';

/**
 * Maps a viewer pose through an anomaly's endpoint slice frames.
 *
 * This is a view transport, not a player handoff or an optical ray trace. The
 * camera's eye offset and tangent basis are expressed in the viewer slice's
 * authoritative coordinates, transferred to the remote aperture's matching
 * tangent basis, then projected by the remote slice's own SpatialTransform.
 * That makes the remote view respond to camera translation, orbit, and chart
 * geometry instead of remaining a fixed postcard.
 */

const VECTOR_EPSILON = 1e-9;
const DEFAULT_DIRECTION_SAMPLE_RENDER_UNITS = 8;
const DEFAULT_REMOTE_TARGET_DISTANCE = 12;
const DEFAULT_APERTURE_RADIUS = 1;

function mapAnomalyCameraPose(options = {}) {
    const camera = options.camera;
    const viewerWorld = options.viewerWorld;
    const remoteWorld = options.remoteWorld;
    const anomaly = options.anomaly;
    if (!camera?.position || !viewerWorld?.slice?.frame || !remoteWorld?.slice?.frame ||
        typeof viewerWorld.transform?.renderToWorld !== 'function' ||
        typeof remoteWorld.transform?.worldToRender !== 'function') {
        return null;
    }

    const viewerEndpoint = endpointForSlice(anomaly, viewerWorld.slice.id);
    const remoteEndpoint = endpointForSlice(anomaly, remoteWorld.slice.id);
    if (!viewerEndpoint || !remoteEndpoint) return null;

    const eyeRender = readVector3(camera.position, 'camera position');
    const forwardRender = readForward(camera);
    const upRender = readUp(camera);
    const sampleDistance = positiveOption(
        options.directionSampleRenderUnits,
        DEFAULT_DIRECTION_SAMPLE_RENDER_UNITS
    );
    const targetDistance = positiveOption(
        options.remoteTargetDistance,
        DEFAULT_REMOTE_TARGET_DISTANCE
    );

    try {
        const eyeLocal = viewerWorld.transform.renderToWorld(eyeRender);
        const forwardSampleLocal = viewerWorld.transform.renderToWorld(
            add3(eyeRender, scale3(forwardRender, sampleDistance))
        );
        const upSampleLocal = viewerWorld.transform.renderToWorld(
            add3(eyeRender, scale3(upRender, sampleDistance))
        );
        const forwardLocal = normalize3(subtract3(forwardSampleLocal, eyeLocal));
        let upLocal = normalize3(subtract3(upSampleLocal, eyeLocal));
        upLocal = normalize3(subtract3(
            upLocal,
            scale3(forwardLocal, dot3(upLocal, forwardLocal))
        ));

        // The endpoint frames provide a natural 3D tangent-frame isometry:
        // local x/y/z components at one mouth become x/y/z at the other mouth.
        // This is deliberately independent of player traversal and ray optics.
        const eyeOffset = subtract3(eyeLocal, viewerEndpoint.position);
        const remoteEyeLocal = add3(remoteEndpoint.position, eyeOffset);
        const remoteTargetLocal = add3(remoteEyeLocal, scale3(forwardLocal, targetDistance));
        const remoteUpPointLocal = add3(remoteEyeLocal, upLocal);

        const safeEye = constrainWorld(remoteWorld.transform, remoteEyeLocal);
        const safeTarget = constrainWorld(remoteWorld.transform, remoteTargetLocal);
        const safeUpPoint = constrainWorld(remoteWorld.transform, remoteUpPointLocal);
        const remoteEyeRender = readVector3(
            remoteWorld.transform.worldToRender(safeEye),
            'mapped camera position'
        );
        const remoteTargetRender = readVector3(
            remoteWorld.transform.worldToRender(safeTarget),
            'mapped camera target'
        );
        const remoteUpRenderPoint = readVector3(
            remoteWorld.transform.worldToRender(safeUpPoint),
            'mapped camera up point'
        );
        const mappedUp = normalize3(subtract3(remoteUpRenderPoint, remoteEyeRender));

        return {
            position: remoteEyeRender,
            target: remoteTargetRender,
            up: mappedUp,
            viewerLocalPosition: eyeLocal,
            remoteLocalPosition: safeEye,
            viewerEndpoint: { ...viewerEndpoint.position },
            remoteEndpoint: { ...remoteEndpoint.position },
            direction: forwardLocal
        };
    } catch (error) {
        // A finite chart may not contain the virtual camera or its look target.
        // This disables the preview for that frame without hiding unrelated
        // projection failures or silently changing the authoritative geometry.
        if (error instanceof RangeError) return null;
        throw error;
    }
}

/**
 * Cross-section radius of a 4D Euclidean spherical aperture.
 * A 3D hyperplane offset by d from a 4D sphere's centre intersects it in a
 * 3D ball of radius sqrt(R²-d²); the visible boundary is rendered as a 2D disc.
 */
function resolveAnomalyViewCenterNormalOffset(anomaly, viewerWorld, configuredOffset = null) {
    if (configuredOffset !== null && configuredOffset !== undefined) {
        if (!Number.isFinite(configuredOffset)) {
            throw new TypeError('Configured anomaly view centre offset must be finite.');
        }
        return configuredOffset;
    }
    const center = anomaly?.influence?.center;
    if (!center) return 0;
    const frame = viewerWorld?.slice?.frame;
    if (!frame) throw new TypeError('A viewer slice frame is required to resolve the anomaly centre.');
    return ambientToSlice(frame, center).normalOffset;
}

function calculateAnomalyApertureScale(options = {}) {
    const anomaly = options.anomaly;
    const viewerWorld = options.viewerWorld;
    const viewConfig = options.viewConfig ?? anomaly?.view ?? {};
    if (viewConfig.crossSection !== 'euclidean-4d-ball') return 1;
    const radius = options.apertureRadius ?? anomaly?.optics?.apertureRadius ??
        anomaly?.entryRadius ?? DEFAULT_APERTURE_RADIUS;
    const viewerNormalOffset = options.viewerNormalOffset ?? 0;
    if (!Number.isFinite(viewerNormalOffset)) {
        throw new TypeError('Viewer anomaly-normal offset must be finite.');
    }
    const centerNormalOffset = resolveAnomalyViewCenterNormalOffset(
        anomaly, viewerWorld, viewConfig.centerNormalOffset
    );
    const sectionRadius = euclidean4DApertureSectionRadius(
        radius, viewerNormalOffset - centerNormalOffset
    );
    return sectionRadius / radius;
}

function euclidean4DApertureSectionRadius(radius, normalOffset) {
    if (!Number.isFinite(radius) || radius <= 0) {
        throw new RangeError('Aperture radius must be positive and finite.');
    }
    if (!Number.isFinite(normalOffset)) {
        throw new TypeError('Aperture normal offset must be finite.');
    }
    const squared = radius * radius - normalOffset * normalOffset;
    return squared <= 0 ? 0 : Math.sqrt(squared);
}

function endpointForSlice(anomaly, sliceId) {
    if (anomaly?.source?.sliceId === sliceId) return anomaly.source;
    if (anomaly?.destination?.sliceId === sliceId) return anomaly.destination;
    return null;
}

function constrainWorld(transform, position) {
    return transform.constrainWorldPosition?.(position) ?? position;
}

function readForward(camera) {
    const ray = camera.getForwardRay?.(1);
    if (ray?.direction) return normalize3(readVector3(ray.direction, 'camera forward'));
    if (typeof camera.getDirection === 'function' && globalThis.BABYLON?.Axis?.Z) {
        return normalize3(readVector3(camera.getDirection(globalThis.BABYLON.Axis.Z), 'camera forward'));
    }
    throw new TypeError('Anomaly view transport requires a camera forward direction.');
}

function readUp(camera) {
    // upVector is usually the world-up reference supplied to lookAt(), not the
    // camera's rolled/pitched screen-up axis. Prefer the current camera basis.
    if (typeof camera.getDirection === 'function' && globalThis.BABYLON?.Axis?.Y) {
        return normalize3(readVector3(camera.getDirection(globalThis.BABYLON.Axis.Y), 'camera up'));
    }
    if (camera.upVector) return normalize3(readVector3(camera.upVector, 'camera up'));
    return { x: 0, y: 1, z: 0 };
}

function readVector3(value, label) {
    if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
        throw new TypeError(`${label} must contain finite x/y/z components.`);
    }
    return { x: value.x, y: value.y, z: value.z };
}

function normalize3(value) {
    const length = Math.hypot(value.x, value.y, value.z);
    if (!Number.isFinite(length) || length <= VECTOR_EPSILON) {
        throw new RangeError('Cannot normalize a zero-length anomaly view vector.');
    }
    return scale3(value, 1 / length);
}

function add3(left, right) {
    return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract3(left, right) {
    return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale3(value, amount) {
    return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function dot3(left, right) {
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

function positiveOption(value, fallback) {
    return value === undefined ? fallback : Number.isFinite(value) && value > 0
        ? value : (() => { throw new RangeError('Anomaly view distance must be positive and finite.'); })();
}

export {
    calculateAnomalyApertureScale,
    euclidean4DApertureSectionRadius,
    mapAnomalyCameraPose,
    resolveAnomalyViewCenterNormalOffset
};
