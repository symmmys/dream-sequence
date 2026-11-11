import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalSliceFrame, createSliceFrame } from '../src/world/fields/geometry/spatial-4d.js';
import {
    calculateAnomalyApertureScale,
    euclidean4DApertureSectionRadius,
    mapAnomalyCameraPose,
    resolveAnomalyViewCenterNormalOffset
} from '../src/world/fields/geometry/anomaly-view-transform.js';
import { createAnomalyViewConfig } from '../src/world/fields/geometry/spatial-anomaly.js';

function createTransform(scale = 1) {
    return {
        renderToWorld(position) {
            return { x: position.x / scale, y: position.y / scale, z: position.z / scale };
        },
        worldToRender(position) {
            return { x: position.x * scale, y: position.y * scale, z: position.z * scale };
        }
    };
}

function createWorld(id, scale = 1, frame = createCanonicalSliceFrame()) {
    return { slice: { id, frame }, transform: createTransform(scale) };
}

function createCamera(position, forward, up = { x: 0, y: 1, z: 0 }) {
    return {
        position,
        upVector: up,
        fov: 0.82,
        getForwardRay() { return { direction: forward }; }
    };
}

function createAnomaly(sourceId = 'source', destinationId = 'destination') {
    return {
        source: { sliceId: sourceId, position: { x: 10, y: 2, z: 0 } },
        destination: { sliceId: destinationId, position: { x: -6, y: 4, z: 12 } }
    };
}

test('endpoint-frame view transport maps camera translation and direction into the remote slice', function liveViewTransport() {
    const source = createWorld('source', 2);
    const destination = createWorld('destination', 5);
    const camera = createCamera({ x: 14, y: 6, z: -8 }, { x: 0, y: 0, z: 1 });
    const pose = mapAnomalyCameraPose({
        camera, viewerWorld: source, remoteWorld: destination, anomaly: createAnomaly()
    });

    assert.deepEqual(pose.viewerLocalPosition, { x: 7, y: 3, z: -4 });
    assert.deepEqual(pose.remoteLocalPosition, { x: -9, y: 5, z: 8 });
    assert.deepEqual(pose.position, { x: -45, y: 25, z: 40 });
    assert.deepEqual(pose.direction, { x: 0, y: 0, z: 1 });
    assert.ok(pose.target.z > pose.position.z);
});

test('viewer camera mapping uses the displayed portal mouth while retaining the canonical remote endpoint', function presentationEndpointViewMapping() {
    const source = createWorld('source', 2);
    const destination = createWorld('destination', 5);
    const pose = mapAnomalyCameraPose({
        camera: createCamera({ x: 14, y: 6, z: -8 }, { x: 0, y: 0, z: 1 }),
        viewerWorld: source,
        remoteWorld: destination,
        anomaly: createAnomaly(),
        viewerEndpoint: { sliceId: 'source', position: { x: 260, y: 35, z: -2 } }
    });
    assert.deepEqual(pose.viewerEndpoint, { x: 260, y: 35, z: -2 });
    assert.deepEqual(pose.remoteLocalPosition, { x: -259, y: -28, z: 10 });
});

test('remote camera pose follows viewer orbit and lateral movement instead of using a fixed postcard', function poseTracksViewer() {
    const source = createWorld('source');
    const destination = createWorld('destination');
    const anomaly = createAnomaly();
    const first = mapAnomalyCameraPose({
        camera: createCamera({ x: 10, y: 2, z: -10 }, { x: 0, y: 0, z: 1 }),
        viewerWorld: source, remoteWorld: destination, anomaly
    });
    const second = mapAnomalyCameraPose({
        camera: createCamera({ x: 13, y: 2, z: -10 }, { x: 1, y: 0, z: 0 }),
        viewerWorld: source, remoteWorld: destination, anomaly
    });

    assert.notDeepEqual(first.position, second.position);
    assert.notDeepEqual(first.target, second.target);
    assert.deepEqual(second.direction, { x: 1, y: 0, z: 0 });
});


test('destination preview camera progressively approaches the remote endpoint while preserving screen-up clearance', function destinationApproachMapping() {
    const source = createWorld('source');
    const destination = createWorld('destination');
    const anomaly = createAnomaly();
    const camera = createCamera({ x: 14, y: 6, z: -8 }, { x: 0, y: 0, z: 1 });
    const initial = mapAnomalyCameraPose({
        camera, viewerWorld: source, remoteWorld: destination, anomaly, approachProgress: 0
    });
    const halfway = mapAnomalyCameraPose({
        camera, viewerWorld: source, remoteWorld: destination, anomaly, approachProgress: 0.5
    });
    const atMouth = mapAnomalyCameraPose({
        camera, viewerWorld: source, remoteWorld: destination, anomaly, approachProgress: 1
    });

    assert.deepEqual(initial.remoteLocalPosition, { x: -2, y: 8, z: 4 });
    assert.deepEqual(halfway.remoteLocalPosition, { x: -4, y: 8, z: 8 });
    assert.deepEqual(atMouth.remoteLocalPosition, { x: -6, y: 8, z: 12 });
    assert.equal(initial.approachEase, 0);
    assert.equal(halfway.approachEase, 0.5);
    assert.equal(atMouth.approachEase, 1);
    assert.deepEqual(atMouth.remoteEyeOffset, { x: 0, y: 4, z: 0 });
});

test('view transport is reversible between the two endpoint slices', function reverseTransport() {
    const source = createWorld('source');
    const destination = createWorld('destination');
    const anomaly = createAnomaly();
    const camera = createCamera({ x: 7, y: 3, z: 4 }, { x: 0, y: 0, z: -1 });
    const forward = mapAnomalyCameraPose({
        camera, viewerWorld: source, remoteWorld: destination, anomaly
    });
    const reverseCamera = createCamera(forward.position, { x: 0, y: 0, z: -1 });
    const reverse = mapAnomalyCameraPose({
        camera: reverseCamera, viewerWorld: destination, remoteWorld: source, anomaly
    });

    assert.ok(Math.abs(reverse.remoteLocalPosition.x - 7) < 1e-9);
    assert.ok(Math.abs(reverse.remoteLocalPosition.y - 3) < 1e-9);
    assert.ok(Math.abs(reverse.remoteLocalPosition.z - 4) < 1e-9);
});

test('view transport returns null when a virtual camera falls outside a finite destination chart', function chartBoundary() {
    const source = createWorld('source');
    const destination = createWorld('destination');
    destination.transform.constrainWorldPosition = (position) => {
        if (position.x < -1 || position.x > 1) throw new RangeError('outside chart');
        return position;
    };
    const anomaly = createAnomaly();
    const result = mapAnomalyCameraPose({
        camera: createCamera({ x: 100, y: 2, z: -10 }, { x: 0, y: 0, z: 1 }),
        viewerWorld: source, remoteWorld: destination, anomaly
    });
    assert.equal(result, null);
});

test('rotated slice frames remain valid inputs to the endpoint-frame view mapping', function rotatedFrames() {
    const sourceFrame = createCanonicalSliceFrame(75);
    const destinationFrame = createSliceFrame({
        origin: { x: 0, y: 0, z: 0, w: 80 },
        axes: [
            { x: 0, y: 1, z: 0, w: 0 },
            { x: -1, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 }
        ],
        normal: { x: 0, y: 0, z: 0, w: 1 }
    });
    const pose = mapAnomalyCameraPose({
        camera: createCamera({ x: 10, y: 2, z: 0 }, { x: 0, y: 0, z: 1 }),
        viewerWorld: createWorld('source', 1, sourceFrame),
        remoteWorld: createWorld('destination', 1, destinationFrame),
        anomaly: createAnomaly()
    });
    assert.ok(Number.isFinite(pose.position.x));
    assert.ok(Number.isFinite(pose.target.z));
});

test('a 4D spherical aperture shrinks with slice-normal offset and vanishes outside its radius', function apertureCrossSection() {
    assert.equal(euclidean4DApertureSectionRadius(4, 0), 4);
    assert.equal(euclidean4DApertureSectionRadius(4, 2), Math.sqrt(12));
    assert.equal(euclidean4DApertureSectionRadius(4, 4), 0);
    assert.equal(euclidean4DApertureSectionRadius(4, 5), 0);
});

test('GeometryDemoWorld updates the remote camera while keeping tapered-cylinder mouth geometry stable', async function demoIntegration() {
    const { GeometryDemoWorld } = await import('../src/demo/geometry-demo-world.js');
    const sourceFrame = createCanonicalSliceFrame(75);
    const destinationFrame = createCanonicalSliceFrame(80);
    const source = createWorld('source', 1, sourceFrame);
    const destination = createWorld('destination', 1, destinationFrame);
    const updates = [];
    const sourcePortal = {
        setCameraPose(...args) { updates.push({ kind: 'camera', args }); },
        setApertureScale(value) { updates.push({ kind: 'aperture', value }); },
        setVisible() {}, resetPose() {}, rim: { isVisible: false }
    };
    const destinationPortal = {
        setCameraPose() {}, setApertureScale() {}, setVisible() {}, resetPose() {},
        rim: { isVisible: false }
    };
    const anomaly = {
        type: 'slice-transition',
        source: { sliceId: 'source', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'destination', position: { x: 10, y: 0, z: 0 } },
        optics: { apertureRadius: 4 },
        view: { enabled: true, mapping: 'endpoint-frame', crossSection: 'euclidean-4d-ball' }
    };
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        camera: createCamera({ x: -2, y: 1, z: -8 }, { x: 0, y: 0, z: 1 }),
        portalPairs: [{
            corridor: anomaly, sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal, destinationPortal
        }],
        sourceWorld: source,
        destinationWorld: destination,
        destination: { slice: { id: 'destination' } },
        cameraController: {
            mode: 'follow',
            getViewSliceId() { return 'source'; },
            getFreeTransitState() { return null; }
        },
        traversalController: {
            getActiveController() { return null; },
            getAmbientPlayerPosition() { return { x: -2, y: 1, z: -8, w: 77 }; }
        },
        getWorld(id) { return id === 'source' ? source : destination; }
    });

    GeometryDemoWorld.prototype.updatePortalPreview.call(world);
    assert.equal(updates[0].kind, 'camera');
    assert.equal(updates[1].kind, 'aperture');
    assert.ok(Math.abs(updates[1].value - Math.sqrt(12) / 4) < 1e-10);

    const firstCameraPosition = updates[0].args[0];
    world.camera.position = { x: 3, y: 1, z: -8 };
    world.camera.getForwardRay = () => ({ direction: { x: 1, y: 0, z: 0 } });
    GeometryDemoWorld.prototype.updatePortalPreview.call(world);
    assert.equal(updates[2].kind, 'camera');
    assert.notDeepEqual(updates[2].args[0], firstCameraPosition);
    assert.equal(updates[3].kind, 'aperture');

    const transitAnomaly = {
        ...anomaly,
        id: 'approach-demo-anomaly',
        view: {
            enabled: true, mapping: 'endpoint-frame', apertureShape: 'circle',
            previewSurface: 'spherical', crossSection: 'euclidean-4d-ball',
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2.8, destination: 7 }
        }
    };
    const transitUpdates = [];
    const transitPortal = {
        setCameraPose(...args) { transitUpdates.push({ kind: 'camera', args }); },
        setApertureScale(value) { transitUpdates.push({ kind: 'aperture', value }); },
        setVisible() {}, resetPose() {}, rim: { isVisible: false }
    };
    world.portalPairs = [{
        corridor: transitAnomaly, sourceSliceId: 'source', destinationSliceId: 'destination',
        sourcePortal: transitPortal, destinationPortal
    }];
    world.traversalController.getActiveController = () => ({
        state: 'transit', type: 'slice-transition', corridor: transitAnomaly,
        startWorld: source, target: destination, direction: 1, progress: 0.5
    });
    GeometryDemoWorld.prototype.updatePortalPreview.call(world);
    assert.equal(transitUpdates[0].kind, 'camera');
    assert.equal(transitUpdates[1].kind, 'aperture');
    const expectedMidSphereScale = (2.8 * 0.08 + (7 - 2.8 * 0.08) * Math.pow(0.5, 0.55)) / 2.8;
    assert.ok(Math.abs(transitUpdates[1].value - expectedMidSphereScale) < 1e-12);
    assert.equal(world.destinationApproachState.progress, 0.5);
    assert.equal(world.destinationApproachState.cameraConvergence, 0.5);
    assert.equal(world.destinationApproachState.apertureScale, transitUpdates[1].value);
});



test('GeometryDemoWorld delegates active spherical anomaly transit to the dual-mouth presentation', async function dualMouthTransitIntegration() {
    const { GeometryDemoWorld } = await import('../src/demo/geometry-demo-world.js');
    const source = createWorld('source');
    const destination = createWorld('destination');
    source.layerMask = 0x10000000;
    destination.layerMask = 0x0FFFFFFF;
    const anomaly = {
        id: 'dual-mouth-integration',
        type: 'slice-transition',
        source: { sliceId: 'source', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'destination', position: { x: 10, y: 0, z: 0 } },
        optics: { apertureRadius: 4 },
        view: {
            enabled: true, mapping: 'endpoint-frame', previewSurface: 'spherical',
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 4, destination: 7 }
        }
    };
    const visibility = [];
    const portal = (name) => ({
        setVisible(value) { visibility.push({ name, value }); },
        resetPose() {}
    });
    const presentationCalls = [];
    const presentation = {
        update(args) {
            presentationCalls.push(args);
            return {
                entry: { scale: 0.7 }, exit: { scale: 0.8 }, separation: 80
            };
        },
        deactivate() {}
    };
    const camera = createCamera({ x: 1, y: 2, z: -8 }, { x: 0, y: 0, z: 1 });
    const world = Object.create(GeometryDemoWorld.prototype);
    Object.assign(world, {
        active: true,
        camera,
        destination: { slice: { id: 'not-destination' } },
        portalPairs: [{
            corridor: anomaly,
            sourceSliceId: 'source', destinationSliceId: 'destination',
            sourcePortal: portal('source'), destinationPortal: portal('destination'),
            passagePresentation: presentation
        }],
        player: { yaw: Math.PI / 2 },
        cameraController: {
            mode: 'follow',
            getViewSliceId() { return 'source'; },
            getFreeTransitState() { return null; }
        },
        traversalController: {
            getActiveController() {
                return {
                    state: 'transit', type: 'slice-transition', corridor: anomaly,
                    startWorld: source, targetWorld: destination, direction: 1, progress: 0.4
                };
            }
        },
        getWorld(id) { return id === 'source' ? source : destination; }
    });

    GeometryDemoWorld.prototype.updatePortalPreview.call(world);

    assert.equal(presentationCalls.length, 1);
    assert.equal(presentationCalls[0].camera, camera);
    assert.equal(presentationCalls[0].startWorld, source);
    assert.equal(presentationCalls[0].targetWorld, destination);
    assert.equal(presentationCalls[0].progress, 0.4);
    assert.ok(Math.abs(presentationCalls[0].presentationDirection.x - 1) < 1e-12);
    assert.equal(presentationCalls[0].presentationDirection.y, 0);
    assert.ok(Math.abs(presentationCalls[0].presentationDirection.z) < 1e-12,
        'follow mode should arrange the passage along the player travel heading, not an orbiting camera direction');
    assert.equal(world.destinationApproachState.entryScale, 0.7);
    assert.equal(world.destinationApproachState.exitScale, 0.8);
    assert.equal(world.destinationApproachState.mouthSeparation, 80);
    assert.deepEqual(visibility, [
        { name: 'source', value: false },
        { name: 'destination', value: false }
    ]);
});


test('camera transport uses the rotated screen-up axis rather than the world-up reference', function rotatedCameraUp() {
    const previousBabylon = globalThis.BABYLON;
    globalThis.BABYLON = { Axis: { Y: { x: 0, y: 1, z: 0 } } };
    try {
        const camera = createCamera(
            { x: 10, y: 2, z: -10 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 1, z: 0 }
        );
        camera.getDirection = () => ({ x: 1, y: 0, z: 0 });
        const pose = mapAnomalyCameraPose({
            camera,
            viewerWorld: createWorld('source'),
            remoteWorld: createWorld('destination'),
            anomaly: createAnomaly()
        });
        assert.ok(Math.abs(pose.up.x - 1) < 1e-9);
        assert.ok(Math.abs(pose.up.y) < 1e-9);
        assert.ok(Math.abs(pose.up.z) < 1e-9);
    } finally {
        if (previousBabylon === undefined) delete globalThis.BABYLON;
        else globalThis.BABYLON = previousBabylon;
    }
});

test('4D spherical aperture derives its centre offset from the resolved ambient anomaly centre', function derivedCrossSectionCentre() {
    const viewerWorld = createWorld('source', 1, createCanonicalSliceFrame(75));
    const anomaly = {
        ...createAnomaly(),
        influence: { center: { x: 2, y: 0, z: 4, w: 77.5 } },
        optics: { apertureRadius: 2.8 },
        view: { crossSection: 'euclidean-4d-ball', centerNormalOffset: null }
    };
    assert.equal(resolveAnomalyViewCenterNormalOffset(anomaly, viewerWorld), 2.5);
    const expected = Math.sqrt(2.8 * 2.8 - 2.5 * 2.5) / 2.8;
    assert.ok(Math.abs(calculateAnomalyApertureScale({
        anomaly, viewerWorld, viewerNormalOffset: 0
    }) - expected) < 1e-10);
    assert.equal(calculateAnomalyApertureScale({
        anomaly, viewerWorld, viewerNormalOffset: 2.5,
        viewConfig: { crossSection: 'constant' }
    }), 1);
});


test('complete destination sphere grows faster than the tapered tube cross-section during forward transit', function destinationSphereGrowth() {
    const viewerWorld = createWorld('source', 1, createCanonicalSliceFrame(75));
    const anomaly = {
        ...createAnomaly(),
        view: {
            previewSurface: 'spherical',
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2.8, destination: 7.0 },
            destinationSphereStartScale: 0.08,
            destinationSphereGrowthExponent: 0.55
        }
    };
    const progress = [null, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const scales = progress.map((approachProgress) =>
        calculateAnomalyApertureScale({ anomaly, viewerWorld, approachProgress })
    );
    assert.equal(scales[0], 1, 'non-transit endpoint preview retains its authored size');
    assert.equal(scales[1], 0.08, 'destination sphere begins as a small central opening');
    assert.ok(Math.abs(scales.at(-1) - 2.5) < 1e-12, 'destination sphere reaches the 7-unit exit radius from the 2.8-unit entrance basis');
    assert.ok(scales.slice(2).every((value, index, values) => index === 0 || value > values[index - 1]),
        'sphere grows monotonically');
    const outerRadiusAtHalf = 2.8 + (7 - 2.8) * 0.5;
    const innerSphereScaleAtHalf = scales[4];
    assert.ok(innerSphereScaleAtHalf / scales[1] > outerRadiusAtHalf / 2.8,
        'inner sphere grows by a greater factor than the outer tube radius');
});

test('destination sphere growth is direction-independent and reaches the local tube radius at either endpoint', function reverseDestinationSphereGrowth() {
    const anomaly = {
        view: {
            previewSurface: 'spherical',
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2.8, destination: 7.0 }
        }
    };
    const viewerWorld = createWorld('destination', 1, createCanonicalSliceFrame(80));
    const scales = [0, 0.25, 0.5, 0.75, 1, null].map((approachProgress) =>
        calculateAnomalyApertureScale({ anomaly, viewerWorld, approachProgress })
    );
    assert.equal(scales[0], 0.08);
    assert.ok(scales[1] > scales[0]);
    assert.ok(scales[2] > scales[1]);
    assert.ok(scales[3] > scales[2]);
    assert.ok(scales[4] > scales[3], 'reverse destination sphere also grows while the outer tube narrows');
    assert.ok(Math.abs(scales[4] * 7 - 2.8) < 1e-12, 'reverse sphere reaches the 2.8-unit source mouth from a 7-unit entry basis');
    assert.equal(scales[5], 1, 'non-transit preview returns to its authored endpoint presentation scale');
});

test('flat cylinder previews do not receive the inner-sphere growth animation', function flatCylinderPreviewScale() {
    const anomaly = {
        view: {
            previewSurface: 'flat',
            interiorBoundary: 'open-4d-cylinder',
            interiorBoundaryRadii: { source: 2.8, destination: 7.0 }
        }
    };
    const viewerWorld = createWorld('source', 1, createCanonicalSliceFrame(75));
    assert.equal(calculateAnomalyApertureScale({ anomaly, viewerWorld, approachProgress: 0 }), 1);
    assert.equal(calculateAnomalyApertureScale({ anomaly, viewerWorld, approachProgress: 0.5 }), 1);
});

test('explicit view centre offset overrides the anomaly-derived 4D centre', function explicitCrossSectionCentre() {
    const viewerWorld = createWorld('source', 1, createCanonicalSliceFrame(75));
    const anomaly = {
        ...createAnomaly(),
        influence: { center: { x: 0, y: 0, z: 0, w: 77.5 } },
        optics: { apertureRadius: 4 },
        view: { crossSection: 'euclidean-4d-ball', centerNormalOffset: 1.25 }
    };
    assert.equal(resolveAnomalyViewCenterNormalOffset(anomaly, viewerWorld, anomaly.view.centerNormalOffset), 1.25);
    const expected = Math.sqrt(16 - 1.25 * 1.25) / 4;
    assert.ok(Math.abs(calculateAnomalyApertureScale({
        anomaly, viewerWorld, viewerNormalOffset: 0
    }) - expected) < 1e-10);
});

test('anomaly view contract validates custom aperture shape and cross-section centre offset', function viewContract() {
    assert.deepEqual(createAnomalyViewConfig({
        apertureShape: 'ellipse', crossSection: 'euclidean-4d-ball', centerNormalOffset: 1.25
    }), {
        enabled: true, mapping: 'endpoint-frame', apertureShape: 'ellipse',
        previewSurface: 'flat', showRim: false,
        crossSection: 'euclidean-4d-ball', interiorBoundary: 'none', centerNormalOffset: 1.25,
        destinationSphereStartScale: 0.08, destinationSphereGrowthExponent: 0.55
    });
    assert.equal(createAnomalyViewConfig({ previewSurface: 'spherical' }).previewSurface, 'spherical');
    assert.equal(createAnomalyViewConfig({ previewSurface: 'flat' }).previewSurface, 'flat');
    assert.equal(createAnomalyViewConfig().showRim, false);
    assert.throws(() => createAnomalyViewConfig({ previewSurface: 'sphere' }), /Unsupported anomaly preview surface/);
    assert.throws(() => createAnomalyViewConfig({ apertureShape: 'rectangle', previewSurface: 'spherical' }), /requires a circular or elliptical/);
    assert.throws(() => createAnomalyViewConfig({ showRim: 'yes' }), /showRim must be boolean/);
    assert.throws(() => createAnomalyViewConfig({ centerNormalOffset: Number.NaN }), /centerNormalOffset/);
    assert.throws(() => createAnomalyViewConfig({ destinationSphereStartScale: 0 }), /destinationSphereStartScale/);
    assert.throws(() => createAnomalyViewConfig({ destinationSphereGrowthExponent: 1.2 }), /destinationSphereGrowthExponent/);
});

test('anomaly view configuration supports explicit open hypercube interior boundaries', function boundaryConfig() {
    assert.equal(createAnomalyViewConfig().interiorBoundary, 'none');
    assert.equal(createAnomalyViewConfig({ interiorBoundary: 'open-4d-hypercube' }).interiorBoundary,
        'open-4d-hypercube');
    assert.throws(() => createAnomalyViewConfig({ interiorBoundary: 'closed-tesseract' }),
        /Unsupported anomaly interior boundary/);
});


test('anomaly view contract validates tapered cylinder radii at both endpoints', function cylinderBoundaryContract() {
    assert.deepEqual(createAnomalyViewConfig({
        interiorBoundary: 'open-4d-cylinder',
        interiorBoundaryRadii: { source: 2.8, destination: 7 }
    }), {
        enabled: true, mapping: 'endpoint-frame', apertureShape: 'circle',
        previewSurface: 'flat', showRim: false,
        crossSection: 'constant', interiorBoundary: 'open-4d-cylinder', centerNormalOffset: null,
        destinationSphereStartScale: 0.08, destinationSphereGrowthExponent: 0.55,
        interiorBoundaryRadii: { source: 2.8, destination: 7 }
    });
    assert.throws(() => createAnomalyViewConfig({
        interiorBoundary: 'open-4d-cylinder', interiorBoundaryRadii: { source: 0, destination: 7 }
    }), /interior boundary radii/);
    assert.throws(() => createAnomalyViewConfig({ interiorBoundary: 'open-4d-cylinder' }),
        /requires source and destination/);
});
