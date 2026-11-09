import assert from 'node:assert/strict';
import test from 'node:test';

import {
    add4,
    ambientToSlice,
    createCanonicalSliceFrame,
    createPerpendicularFrame,
    createSliceFrame,
    dot4,
    norm4,
    normalize4,
    rotate4,
    sliceToAmbient,
    transportPerpendicularFrame
} from '../src/world/fields/geometry/spatial-4d.js';
import {
    createSpatialCorridor,
    cubicBezier,
    cubicBezierTangent,
    sampleRadiusProfile,
    sampleSpatialCorridor,
    sampleSpatialCorridorFrames
} from '../src/world/fields/geometry/spatial-corridor.js';
import {
    createSliceAddress,
    getSliceAddressKey
} from '../src/world/fields/geometry/world-slice.js';
import { WorldTopology } from '../src/world/fields/geometry/world-topology.js';
import {
    calculatePoincareMetricFactor,
    calculatePoincareVisualScale
} from '../src/world/fields/geometry/poincare-visual-scale.js';

function makeCorridor(overrides = {}) {
    return createSpatialCorridor({
        id: 'corridor-a-b',
        source: { sliceId: 'slice-a', position: { x: 0, y: 0, z: 0 } },
        destination: { sliceId: 'slice-b', position: { x: 10, y: 0, z: 0 } },
        centerline: [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 3, y: 2, z: 0, w: 3 },
            { x: 7, y: 2, z: 0, w: 9 },
            { x: 10, y: 0, z: 0, w: 12 }
        ],
        ...overrides
    });
}

function makeTopology() {
    const topology = new WorldTopology();
    topology.registerSlice({ id: 'slice-a', w: 0, seed: 10 });
    topology.registerSlice({ id: 'slice-b', w: 12, seed: 20 });
    return topology;
}

test(
    '4D vector operations preserve orthogonal components and lengths',
    function testVectorOperations() {
        const vector = { x: 1, y: 2, z: 2, w: 4 };
        const rotated = rotate4(vector, 'xw', Math.PI / 2);

        assert.equal(norm4(vector), Math.sqrt(25));
        assert.ok(Math.abs(norm4(rotated) - norm4(vector)) < 1e-12);
        assert.ok(Math.abs(rotated.x + 4) < 1e-12);
        assert.equal(rotated.y, 2);
        assert.equal(rotated.z, 2);
        assert.ok(Math.abs(rotated.w - 1) < 1e-12);
        assert.equal(dot4(vector, { x: 0, y: 1, z: 0, w: 0 }), 2);
        assert.deepEqual(normalize4({ x: 0, y: 0, z: 0, w: 2 }), {
            x: 0, y: 0, z: 0, w: 1
        });
        assert.equal(norm4({ x: 1e308, y: 0, z: 0, w: 0 }), 1e308);
        assert.throws(function rejectOverflowingAddition() {
            add4({ x: 1e308, y: 0, z: 0, w: 0 }, { x: 1e308, y: 0, z: 0, w: 0 });
        }, TypeError);
    });

test('zero vectors and non-finite coordinates are rejected', function testInvalidVectors() {
    assert.throws(function normalizeZeroVector() {
        normalize4({ x: 0, y: 0, z: 0, w: 0 });
    }, RangeError);
    assert.throws(function calculateInvalidNorm() {
        norm4({ x: 0, y: Number.NaN, z: 0, w: 0 });
    }, TypeError);
});

test(
    'canonical slice frames round-trip local coordinates and expose normal offset',
    function testCanonicalFrameRoundTrip() {
        const frame = createCanonicalSliceFrame(5);
        const local = { x: 2, y: -3, z: 4 };
        const ambient = sliceToAmbient(frame, local);
        const recovered = ambientToSlice(frame, { ...ambient, w: 7 });

        assert.deepEqual(ambient, { x: 2, y: -3, z: 4, w: 5 });
        assert.deepEqual(recovered, { position: local, normalOffset: 2 });
    });

test('rotated slice frames remain orthonormal in the XW plane', function testRotatedSliceFrame() {
    const angle = Math.PI / 3;
    const axes = [
        rotate4({ x: 1, y: 0, z: 0, w: 0 }, 'xw', angle),
        { x: 0, y: 1, z: 0, w: 0 },
        { x: 0, y: 0, z: 1, w: 0 }
    ];
    const normal = rotate4({ x: 0, y: 0, z: 0, w: 1 }, 'xw', angle);
    const frame = createSliceFrame({
        origin: { x: 0, y: 0, z: 0, w: 3 },
        axes,
        normal
    });
    const local = { x: 8, y: -2, z: 1 };
    const ambient = sliceToAmbient(frame, local);

    assert.deepEqual(ambientToSlice(frame, ambient), {
        position: local,
        normalOffset: 0
    });
});

test(
    '4D perpendicular frames are orthonormal and orthogonal to the tangent',
    function testPerpendicularFrame() {
        const tangent = normalize4({ x: 1, y: 2, z: -1, w: 3 });
        const axes = createPerpendicularFrame(tangent);

        assert.equal(axes.length, 3);
        for (let index = 0; index < axes.length; index++) {
            assert.ok(Math.abs(dot4(axes[index], tangent)) < 1e-10);
            for (let other = 0; other < axes.length; other++) {
                const expected = index === other ? 1 : 0;
                assert.ok(Math.abs(dot4(axes[index], axes[other]) - expected) < 1e-10);
            }
        }
        assert.equal(transportPerpendicularFrame(axes, tangent).length, 3);

        let transported = createPerpendicularFrame({ x: 1, y: 0, z: 0, w: 0 });
        const turns = [
            { x: 0, y: 1, z: 0, w: 0 },
            { x: 0, y: 0, z: 1, w: 0 },
            { x: 0, y: 0, z: 0, w: 1 },
            { x: -1, y: 0, z: 0, w: 0 }
        ];
        for (const direction of turns) {
            transported = transportPerpendicularFrame(transported, direction);
            assert.equal(transported.length, 3);
            for (let axis = 0; axis < 3; axis++) {
                assert.ok(Math.abs(dot4(transported[axis], direction)) < 1e-10);
            }
        }
    });

test(
    'cubic corridor interpolation returns exact endpoints and stable midpoint',
    function testCorridorInterpolation() {
        const corridor = makeCorridor();
        assert.deepEqual(cubicBezier(corridor.centerline, 0), corridor.centerline[0]);
        assert.deepEqual(cubicBezier(corridor.centerline, 1), corridor.centerline[3]);
        assert.deepEqual(cubicBezier(corridor.centerline, 0.5), {
            x: 5,
            y: 1.5,
            z: 0,
            w: 6
        });
        assert.ok(Math.abs(norm4(cubicBezierTangent(corridor.centerline, 0.4)) - 1) < 1e-12);
    });

test(
    'stationary Bezier endpoints use a one-sided corridor tangent',
    function testStationaryEndpointTangent() {
        const points = [
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 0, y: 0, z: 0, w: 0 },
            { x: 2, y: 0, z: 0, w: 2 },
            { x: 4, y: 0, z: 0, w: 4 }
        ];
        const tangent = cubicBezierTangent(points, 0);

        assert.ok(Math.abs(tangent.x - Math.SQRT1_2) < 1e-8);
        assert.ok(Math.abs(tangent.w - Math.SQRT1_2) < 1e-8);
    });

test(
    'corridor frame sampling is deterministic, orthogonal, and smoothly transported',
    function testCorridorFrameSampling() {
        const corridor = makeCorridor();
        const first = sampleSpatialCorridorFrames(corridor, 32);
        const second = sampleSpatialCorridorFrames(corridor, 32);

        assert.deepEqual(first, second);
        assert.equal(first.length, 33);
        for (let index = 0; index < first.length; index++) {
            const sample = first[index];
            for (let axis = 0; axis < 3; axis++) {
                assert.ok(Math.abs(dot4(sample.axes[axis], sample.tangent)) < 1e-9);
                for (let other = 0; other < 3; other++) {
                    const expected = axis === other ? 1 : 0;
                    assert.ok(Math.abs(dot4(sample.axes[axis], sample.axes[other]) - expected) < 1e-9);
                }
            }
            if (index > 0) {
                for (let axis = 0; axis < 3; axis++) {
                    assert.ok(dot4(first[index - 1].axes[axis], sample.axes[axis]) > 0.5);
                }
            }
        }
    });

test('corridor radius profile interpolates deterministically', function testRadiusProfile() {
    const profile = [
        { t: 0, radius: 2 },
        { t: 0.5, radius: 4 },
        { t: 1, radius: 1 }
    ];
    const corridor = makeCorridor({ radiusProfile: profile });

    assert.equal(sampleRadiusProfile(corridor.radiusProfile, 0.25), 3);
    assert.equal(sampleSpatialCorridor(corridor, 0.75).radius, 2.5);
    assert.throws(function rejectUnsortedProfile() {
        makeCorridor({ radiusProfile: [
            { t: 0, radius: 1 },
            { t: 0.8, radius: 1 },
            { t: 0.7, radius: 1 },
            { t: 1, radius: 1 }
        ] });
    }, RangeError);
});

test(
    'slice addresses include slice identity and accept negative chunk coordinates',
    function testSliceAddress() {
        const address = createSliceAddress(' slice-a ', -4, 12);
        assert.deepEqual(address, {
            schemaVersion: 1,
            sliceId: 'slice-a',
            chunkX: -4,
            chunkZ: 12
        });
        assert.notEqual(
            getSliceAddressKey(address),
            getSliceAddressKey(createSliceAddress('slice-b', -4, 12))
        );
        assert.throws(function rejectFractionalChunk() {
            createSliceAddress('slice-a', 1.5, 0);
        }, TypeError);
    });

test(
    'numeric proximity in w does not create cross-slice adjacency',
    function testNoImplicitAdjacency() {
        const topology = new WorldTopology();
        topology.registerSlice({ id: 'near-zero', w: 0 });
        topology.registerSlice({ id: 'near-one', w: 1 });

        assert.deepEqual(topology.getVisibleDestinations('near-zero'), []);
        assert.deepEqual(topology.getTraversableNeighbors('near-zero'), []);
        assert.equal(topology.hasTraversableConnection('near-zero', 'near-one'), false);
    });

test(
    'visible portals expose preview destinations without enabling traversal',
    function testVisibilityIsNotTraversal() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor({ visible: true, traversable: false }));

        assert.deepEqual(topology.getVisibleDestinations('slice-a'), [
            { corridorId: 'corridor-a-b', sliceId: 'slice-b', renderOnly: true }
        ]);
        assert.deepEqual(topology.getTraversableNeighbors('slice-a'), []);
        assert.equal(topology.hasTraversableConnection('slice-a', 'slice-b'), false);
    });

test(
    'traversable corridors can be hidden independently of preview visibility',
    function testHiddenTraversableCorridor() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor({ visible: false, traversable: true }));

        assert.deepEqual(topology.getVisibleDestinations('slice-a'), []);
        assert.equal(topology.getTraversableNeighbors('slice-a').length, 1);
    }
);

test(
    'traversable corridors create explicit bidirectional topology edges',
    function testExplicitTraversalEdge() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor({ traversable: true }));

        assert.deepEqual(topology.getTraversableNeighbors('slice-a'), [
            { corridorId: 'corridor-a-b', sliceId: 'slice-b' }
        ]);
        assert.deepEqual(topology.getTraversableNeighbors('slice-b'), [
            { corridorId: 'corridor-a-b', sliceId: 'slice-a' }
        ]);
        assert.equal(topology.hasTraversableConnection('slice-a', 'slice-b'), true);
    });

test(
    'visibility is independent of one-way traversal permissions',
    function testUnidirectionalCorridor() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor({
            visible: true,
            traversable: true,
            bidirectional: false
        }));

        assert.equal(topology.getVisibleDestinations('slice-a').length, 1);
        assert.deepEqual(topology.getVisibleDestinations('slice-b'), [
            { corridorId: 'corridor-a-b', sliceId: 'slice-a', renderOnly: true }
        ]);
        assert.equal(topology.getTraversableNeighbors('slice-a').length, 1);
        assert.deepEqual(topology.getTraversableNeighbors('slice-b'), []);
    });

test(
    'corridor endpoints must agree with the registered slice frames',
    function testEndpointValidation() {
        const topology = makeTopology();
        assert.throws(function rejectMismatchedEndpoint() {
            topology.registerCorridor(makeCorridor({
                centerline: [
                    { x: 0, y: 0, z: 0, w: 0 },
                    { x: 3, y: 2, z: 0, w: 3 },
                    { x: 7, y: 2, z: 0, w: 9 },
                    { x: 10, y: 0, z: 0, w: 13 }
                ]
            }));
        }, RangeError);
    });

test(
    'topology getters return copies rather than mutable internal records',
    function testTopologyRecordCopies() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor());

        const slice = topology.getSlice('slice-a');
        const corridor = topology.getCorridor('corridor-a-b');
        slice.frame.origin.w = 999;
        corridor.centerline[0].w = 999;

        assert.equal(topology.getSlice('slice-a').frame.origin.w, 0);
        assert.equal(topology.getCorridor('corridor-a-b').centerline[0].w, 0);
    }
);

test(
    'topology updates require increasing revisions and preserve slice references',
    function testTopologyUpdate() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor());

        assert.throws(function rejectStaleRevision() {
            topology.updateCorridor(makeCorridor({ revision: 1, traversable: true }));
        }, RangeError);
        topology.updateCorridor(makeCorridor({ revision: 2, traversable: true }));
        assert.equal(topology.hasTraversableConnection('slice-a', 'slice-b'), true);
        assert.throws(function rejectSliceRemovalWithCorridor() {
            topology.unregisterSlice('slice-a');
        }, Error);
    });

test(
    'topology serializes and restores its versioned domain records',
    function testTopologySerialization() {
        const topology = makeTopology();
        topology.registerCorridor(makeCorridor({ visible: true, traversable: true }));
        const restored = WorldTopology.fromJSON(JSON.parse(JSON.stringify(topology.toJSON())));

        assert.deepEqual(restored.toJSON(), topology.toJSON());
        assert.equal(restored.hasTraversableConnection('slice-a', 'slice-b'), true);
        assert.throws(function rejectUnknownSchema() {
            WorldTopology.fromJSON({ schemaVersion: 99, slices: [], corridors: [] });
        }, RangeError);
    });

test(
    'Poincare metric factor and bounded visual scale match their definitions',
    function testPoincareVisualScale() {
        assert.equal(calculatePoincareMetricFactor(0, 2), 2);
        assert.equal(calculatePoincareMetricFactor(1, 2), 8 / 3);
        assert.equal(calculatePoincareVisualScale(0, 2), 1);

        const samples = [0, 0.5, 1, 1.5, 1.9].map(function calculateScale(radius) {
            return calculatePoincareVisualScale(radius, 2);
        });
        for (let index = 1; index < samples.length; index++) {
            assert.ok(samples[index] >= samples[index - 1]);
        }
        assert.ok(samples.every(function isBounded(scale) {
            return scale >= 1 && scale <= 4;
        }));
        assert.equal(calculatePoincareVisualScale(2, 2, { maxScale: 3, gamma: 10 }), 3);
        assert.throws(function rejectMetricAtBoundary() {
            calculatePoincareMetricFactor(2, 2);
        }, RangeError);
    });


test('corridors default to coordinate length and validate intrinsic metric compression', function corridorMetricScale() {
    const ordinary = makeCorridor();
    const compressed = makeCorridor({ intrinsicLengthScale: 0.32 });
    assert.equal(ordinary.intrinsicLengthScale, 1);
    assert.equal(compressed.intrinsicLengthScale, 0.32);
    for (const invalid of [0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(function rejectInvalidMetricScale() {
            makeCorridor({ intrinsicLengthScale: invalid });
        }, RangeError);
    }
});
