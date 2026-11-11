/**
 * Three-dimensional presentation of travel between the two ends of a 4D
 * slice-transition anomaly. All positions and scales in this module are
 * display-space only; canonical anomaly coordinates are never modified.
 */

import { PortalPreviewRenderer } from '../world/fields/geometry/portal-preview-renderer.js';

const PASSAGE_RENDER_LAYER = 0x40000000;
const DEFAULTS = Object.freeze({
    mouthSeparation: 80,
    cameraInset: 8,
    mouthSeparationAxis: null,
    mouthSeparationCurve: null,
    entryAngularScaleStart: 1,
    entryAngularScaleEnd: 1,
    exitAngularScaleStart: 1,
    exitAngularScaleEnd: 1,
    resolution: 512
});

class AnomalyPassagePresentation {
    constructor(scene, pair, options = {}) {
        if (!scene || !pair?.corridor || !pair.sourcePortal || !pair.destinationPortal) {
            throw new TypeError('Anomaly passage presentation requires a scene and complete portal pair.');
        }
        const radii = pair.corridor.view?.interiorBoundaryRadii;
        if (!radii || !Number.isFinite(radii.source) || radii.source <= 0 ||
            !Number.isFinite(radii.destination) || radii.destination <= 0) {
            throw new TypeError(`Anomaly ${pair.corridor.id} requires positive source and destination mouth radii.`);
        }
        this.scene = scene;
        this.pair = pair;
        this.radii = { source: radii.source, destination: radii.destination };
        this.config = normalizeConfig({ ...pair.corridor.view?.passagePresentation, ...options });
        this.active = false;
        this.frame = null;
        this.previousClearColor = null;
        this.lastState = null;
        this.entry = this.createMouthRenderer('entry', Math.max(radii.source, radii.destination));
        this.exit = this.createMouthRenderer('exit', Math.max(radii.source, radii.destination));
    }

    createMouthRenderer(name, radius) {
        const renderer = new PortalPreviewRenderer(this.scene, {
            namePrefix: `anomalyPassage_${this.pair.corridor.id}_${name}`,
            position: { x: 0, y: 0, z: 0 },
            width: radius * 2,
            height: radius * 2,
            resolution: this.config.resolution,
            apertureShape: 'circle',
            previewSurface: 'spherical',
            maxApertureScale: 4,
            camera: { layerMask: 0 }
        });
        renderer.surface.layerMask = PASSAGE_RENDER_LAYER;
        renderer.surface.isPickable = false;
        renderer.setHomePose();
        renderer.surface.metadata = {
            ...(renderer.surface.metadata || {}),
            anomalyPassageMouth: name,
            anomalyId: this.pair.corridor.id,
            displaySpaceOnly: true,
            renderOnly: true
        };
        renderer.setVisible(false);
        return renderer;
    }

    update(options = {}) {
        const {
            camera, startWorld, targetWorld, progress,
            exitCameraPose = null, presentationDirection = null
        } = options;
        if (!camera || !startWorld || !targetWorld || !Number.isFinite(progress)) {
            throw new TypeError('Anomaly passage update requires a camera, endpoint worlds, and finite progress.');
        }
        const t = clamp(progress, 0, 1);
        // The display-space translation is applied to the live camera below.
        // Recover the unmodified pose when update() is called more than once
        // without an intervening camera-controller tick; otherwise the virtual
        // traversal offset would accumulate on every render frame.
        const baseCameraPosition = this.getBaseCameraPosition(camera);
        const currentForward = cameraForward(camera);
        const passageDirection = presentationDirection
            ? normalize3(requireVector(presentationDirection, 'presentationDirection'))
            : currentForward;
        if (!this.active) this.activate(camera, baseCameraPosition, passageDirection);
        const eased = smootherstep(t);
        const startIsSource = startWorld.slice.id === this.pair.sourceSliceId;
        const layout = calculateAnomalyPassageLayout({
            anchor: this.frame.anchor,
            axis: this.frame.axis,
            cameraPosition: baseCameraPosition,
            entryRadius: startIsSource ? this.radii.source : this.radii.destination,
            exitRadius: startIsSource ? this.radii.destination : this.radii.source,
            cameraInset: this.config.cameraInset,
            progress: t,
            mouthSeparation: this.config.mouthSeparation,
            mouthSeparationCurve: this.config.mouthSeparationCurve,
            entryAngularScaleStart: this.config.entryAngularScaleStart,
            entryAngularScaleEnd: this.config.entryAngularScaleEnd,
            exitAngularScaleStart: this.config.exitAngularScaleStart,
            exitAngularScaleEnd: this.config.exitAngularScaleEnd
        });
        const entryRadius = startIsSource ? this.radii.source : this.radii.destination;
        const exitRadius = startIsSource ? this.radii.destination : this.radii.source;
        const entryMeshes = startIsSource
            ? this.pair.destinationPortal.ownedMeshes
            : this.pair.sourcePortal.ownedMeshes;
        const exitMeshes = startIsSource
            ? this.pair.sourcePortal.ownedMeshes
            : this.pair.destinationPortal.ownedMeshes;

        this.entry.setRenderList(entryMeshes ?? []);
        this.exit.setRenderList(exitMeshes ?? []);
        this.entry.camera.layerMask = startWorld.layerMask;
        this.exit.camera.layerMask = targetWorld.layerMask;
        // From inside the passage, the entrance is behind the player. Its
        // render camera therefore looks back out into the source world rather
        // than continuing to look down the passage toward the destination.
        const entryForward = scale3(currentForward, -1);
        this.entry.setCameraPose(
            baseCameraPosition,
            add3(baseCameraPosition, scale3(entryForward, 100)),
            vector(camera.upVector ?? { x: 0, y: 1, z: 0 }),
            camera.fov
        );
        if (exitCameraPose?.position && exitCameraPose?.target) {
            this.exit.setCameraPose(
                exitCameraPose.position,
                exitCameraPose.target,
                exitCameraPose.up ?? { x: 0, y: 1, z: 0 },
                camera.fov
            );
        } else {
            this.exit.setCameraPose(
                baseCameraPosition,
                add3(baseCameraPosition, scale3(currentForward, 100)),
                vector(camera.upVector ?? { x: 0, y: 1, z: 0 }),
                camera.fov
            );
        }

        // The spherical projection's local +Z axis is its image/projection
        // direction. Face the entrance toward the player inside the passage
        // (+forward), and face the exit back toward the player (-forward).
        // These are ordinary 3D rotations: neither sphere is camera-billboarded.
        this.entry.setPose(layout.entry.position, this.frame.axis);
        this.exit.setPose(layout.exit.position, scale3(this.frame.axis, -1));
        const maxRadius = Math.max(this.radii.source, this.radii.destination);
        this.entry.setApertureScale(layout.entry.scale * entryRadius / maxRadius);
        this.exit.setApertureScale(layout.exit.scale * exitRadius / maxRadius);

        const baseCameraTarget = add3(baseCameraPosition, scale3(currentForward, 100));
        const displayCameraPosition = layout.cameraPosition;
        const displayCameraTarget = add3(baseCameraTarget, layout.cameraOffset);
        camera.position.set(displayCameraPosition.x, displayCameraPosition.y, displayCameraPosition.z);
        camera.setTarget?.(new BABYLON.Vector3(
            displayCameraTarget.x, displayCameraTarget.y, displayCameraTarget.z
        ));
        this.lastCameraPose = {
            basePosition: baseCameraPosition, baseTarget: baseCameraTarget,
            appliedPosition: { ...displayCameraPosition }, appliedTarget: { ...displayCameraTarget }
        };
        this.entry.setVisible(true);
        this.exit.setVisible(true);

        camera.layerMask = PASSAGE_RENDER_LAYER;
        this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        this.lastState = {
            active: true,
            anomalyId: this.pair.corridor.id,
            progress: t,
            easedProgress: eased,
            direction: startIsSource ? 1 : -1,
            startSliceId: startWorld.slice.id,
            destinationSliceId: targetWorld.slice.id,
            separation: layout.separation,
            axis: { ...this.frame.axis },
            entry: {
                position: { ...layout.entry.position },
                physicalRadius: entryRadius,
                scale: layout.entry.scale * entryRadius / maxRadius,
                apparentAngularRadius: layout.entry.apparentAngularRadius,
                cameraDistance: layout.entry.cameraDistance,
            },
            exit: {
                position: { ...layout.exit.position },
                physicalRadius: exitRadius,
                scale: layout.exit.scale * exitRadius / maxRadius,
                apparentAngularRadius: layout.exit.apparentAngularRadius,
                cameraDistance: layout.exit.cameraDistance,
            },
            renderLayer: PASSAGE_RENDER_LAYER
        };
        return this.lastState;
    }

    getBaseCameraPosition(camera) {
        const current = vector(camera.position);
        if (this.active && this.lastCameraPose &&
            isSamePoint(current, this.lastCameraPose.appliedPosition)) {
            return { ...this.lastCameraPose.basePosition };
        }
        return current;
    }

    restoreCameraPoseForControllerUpdate(camera) {
        if (!camera || !this.active || !this.lastCameraPose) return false;
        if (!isSamePoint(camera.position, this.lastCameraPose.appliedPosition)) {
            // An external controller has already supplied a new base pose.
            // Do not overwrite its position; simply discard the old mapping.
            this.lastCameraPose = null;
            return false;
        }
        const base = this.lastCameraPose.basePosition;
        const forward = cameraForward(camera);
        const target = add3(base, scale3(forward, 100));
        camera.position.set(base.x, base.y, base.z);
        camera.setTarget?.(new BABYLON.Vector3(target.x, target.y, target.z));
        this.lastCameraPose = null;
        return true;
    }

    activate(camera, baseCameraPosition = vector(camera.position), passageDirection = cameraForward(camera)) {
        const overrideAxis = this.config.mouthSeparationAxis;
        const axis = overrideAxis ? normalize3(overrideAxis) : normalize3(passageDirection);
        this.frame = {
            anchor: { ...baseCameraPosition },
            axis
        };
        this.previousClearColor = cloneColor(this.scene.clearColor);
        this.active = true;
    }

    deactivate(camera = null, restoreLayerMask = null) {
        if (!this.active && !this.entry.visible && !this.exit.visible) return;
        this.entry.setVisible(false);
        this.exit.setVisible(false);
        if (this.previousClearColor) this.scene.clearColor = cloneColor(this.previousClearColor);
        if (camera && this.lastCameraPose && isSamePoint(camera.position, this.lastCameraPose.appliedPosition)) {
            const base = this.lastCameraPose.basePosition;
            // Preserve a camera orbit/rotation performed after the last render
            // update rather than restoring a stale target from that update.
            const forward = cameraForward(camera);
            const target = add3(base, scale3(forward, 100));
            camera.position.set(base.x, base.y, base.z);
            camera.setTarget?.(new BABYLON.Vector3(target.x, target.y, target.z));
        }
        if (camera && Number.isSafeInteger(restoreLayerMask)) camera.layerMask = restoreLayerMask;
        this.active = false;
        this.frame = null;
        this.previousClearColor = null;
        this.lastState = null;
        this.lastCameraPose = null;
    }

    getInfo() {
        return {
            ...(this.lastState ?? { active: false, anomalyId: this.pair.corridor.id }),
            entryRenderer: this.entry.getInfo(),
            exitRenderer: this.exit.getInfo(),
            configuration: { ...this.config }
        };
    }

    dispose(camera = null, restoreLayerMask = null) {
        this.deactivate(camera, restoreLayerMask);
        this.entry.dispose();
        this.exit.dispose();
    }
}

function calculateAnomalyPassageLayout(options = {}) {
    const progress = clampFinite(options.progress ?? 0, 0, 1, 'progress');
    const anchor = requireVector(options.anchor, 'anchor');
    const cameraPosition = requireVector(options.cameraPosition ?? anchor, 'cameraPosition');
    const axis = normalize3(requireVector(options.axis, 'axis'));
    const fixedSeparation = positiveFinite(options.mouthSeparation ?? DEFAULTS.mouthSeparation, 'mouthSeparation');
    const inset = positiveFinite(options.cameraInset ?? DEFAULTS.cameraInset, 'cameraInset');
    const curve = options.mouthSeparationCurve ?? null;
    let separation = fixedSeparation;
    if (curve !== null) {
        if (!Array.isArray(curve) || curve.length !== 2 ||
            !curve.every((value) => Number.isFinite(value) && value > inset * 2)) {
            throw new RangeError('mouthSeparationCurve must contain two distances greater than twice cameraInset.');
        }
        separation = lerp(curve[0], curve[1], smootherstep(progress));
    }
    if (separation <= inset * 2) {
        throw new RangeError('mouthSeparation must exceed twice cameraInset.');
    }
    const entryStart = scaleValue(options.entryAngularScaleStart ?? DEFAULTS.entryAngularScaleStart, 'entryAngularScaleStart');
    const entryEnd = scaleValue(options.entryAngularScaleEnd ?? DEFAULTS.entryAngularScaleEnd, 'entryAngularScaleEnd');
    const exitStart = scaleValue(options.exitAngularScaleStart ?? DEFAULTS.exitAngularScaleStart, 'exitAngularScaleStart');
    const exitEnd = scaleValue(options.exitAngularScaleEnd ?? DEFAULTS.exitAngularScaleEnd, 'exitAngularScaleEnd');
    const entryRadius = positiveFinite(options.entryRadius ?? 1, 'entryRadius');
    const exitRadius = positiveFinite(options.exitRadius ?? 1, 'exitRadius');
    const eased = smootherstep(progress);
    // Keep the entrance behind the player and the exit ahead. The camera
    // starts one inset beyond the entrance and advances toward the exit,
    // finishing one inset before it. The axis is a display-space proxy for W.
    const entryPosition = subtract3(anchor, scale3(axis, inset));
    const exitPosition = add3(anchor, scale3(axis, separation - inset));
    const cameraOffset = scale3(axis, progress * (separation - inset * 2));
    const displayCameraPosition = add3(cameraPosition, cameraOffset);
    const entryDistance = distance3(displayCameraPosition, entryPosition);
    const exitDistance = distance3(displayCameraPosition, exitPosition);
    const entryScale = lerp(entryStart, entryEnd, eased);
    const exitScale = lerp(exitStart, exitEnd, eased);
    return {
        progress,
        easedProgress: eased,
        separation,
        cameraOffset,
        cameraPosition: displayCameraPosition,
        entry: {
            position: entryPosition,
            scale: entryScale,
            cameraDistance: entryDistance,
            apparentAngularRadius: apparentAngularRadius(entryRadius * entryScale, entryDistance)
        },
        exit: {
            position: exitPosition,
            scale: exitScale,
            cameraDistance: exitDistance,
            apparentAngularRadius: apparentAngularRadius(exitRadius * exitScale, exitDistance)
        }
    };
}

function normalizeConfig(options = {}) {
    const config = { ...DEFAULTS, ...options };
    positiveFinite(config.mouthSeparation, 'mouthSeparation');
    positiveFinite(config.cameraInset, 'cameraInset');
    if (config.mouthSeparation <= config.cameraInset * 2) {
        throw new RangeError('mouthSeparation must exceed twice cameraInset.');
    }
    if (config.resolution !== 256 && config.resolution !== 512 && config.resolution !== 1024 &&
        config.resolution !== 2048) {
        throw new RangeError('Passage render resolution must be 256, 512, 1024, or 2048.');
    }
    if (config.mouthSeparationAxis !== null) {
        config.mouthSeparationAxis = normalize3(requireVector(config.mouthSeparationAxis, 'mouthSeparationAxis'));
    }
    // Validate optional curve and normalized scale endpoints eagerly.
    calculateAnomalyPassageLayout({
        anchor: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, progress: 0,
        mouthSeparation: config.mouthSeparation,
        cameraInset: config.cameraInset,
        mouthSeparationCurve: config.mouthSeparationCurve,
        entryAngularScaleStart: config.entryAngularScaleStart,
        entryAngularScaleEnd: config.entryAngularScaleEnd,
        exitAngularScaleStart: config.exitAngularScaleStart,
        exitAngularScaleEnd: config.exitAngularScaleEnd
    });
    return config;
}

function smootherstep(value) {
    return value * value * value * (value * (value * 6 - 15) + 10);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function clampFinite(value, min, max, name) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
    return clamp(value, min, max);
}
function positiveFinite(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
    return value;
}
function scaleValue(value, name) {
    if (!Number.isFinite(value) || value < 0 || value > 4) throw new RangeError(`${name} must be between 0 and 4.`);
    return value;
}
function requireVector(value, name) {
    const vector = Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value;
    if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
        throw new TypeError(`${name} must contain three finite components.`);
    }
    return { x: vector.x, y: vector.y, z: vector.z };
}
function normalize3(value) {
    const length = Math.hypot(value.x, value.y, value.z);
    if (length <= 1e-9) throw new RangeError('Passage direction must have non-zero length.');
    return { x: value.x / length, y: value.y / length, z: value.z / length };
}
function cameraForward(camera) {
    const direction = camera.getForwardRay?.().direction ?? camera.forward ?? { x: 0, y: 0, z: 1 };
    return normalize3(vector(direction));
}
function vector(value) { return { x: value.x, y: value.y, z: value.z }; }
function add3(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale3(value, scalar) { return { x: value.x * scalar, y: value.y * scalar, z: value.z * scalar }; }
function lerp(a, b, t) { return a + (b - a) * t; }
function distance3(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function apparentAngularRadius(radius, distance) {
    if (distance <= 1e-9) return Math.PI / 2;
    return Math.asin(clamp(radius / distance, 0, 1));
}
function isSamePoint(point, expected) {
    return Boolean(point && expected && distance3(point, expected) <= 1e-4);
}
function cloneColor(color) {
    if (!color) return new BABYLON.Color4(0, 0, 0, 1);
    return new BABYLON.Color4(color.r, color.g, color.b, color.a ?? 1);
}

export {
    AnomalyPassagePresentation,
    PASSAGE_RENDER_LAYER,
    calculateAnomalyPassageLayout,
    smootherstep
};
