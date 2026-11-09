/** Builds a local 3D view of an authoritative four-dimensional corridor. */

import { normalize4, transportPerpendicularFrame } from './spatial-4d.js';
import { sampleSpatialCorridorFrames } from './spatial-corridor.js';

class CorridorRenderer {
    constructor(scene, corridor, spatialTransform, options = {}) {
        this.scene = scene;
        this.corridor = corridor;
        this.spatialTransform = spatialTransform;
        this.options = {
            segments: options.segments ?? 48,
            radialSegments: options.radialSegments ?? 12,
            wToZScale: options.wToZScale ?? 0.28,
            displayScale: options.displayScale ?? 0.7,
            opacity: options.opacity ?? 0.22,
            anchorT: options.anchorT ?? 0
        };
        this.validateOptions();
        this.frameSamples = sampleSpatialCorridorFrames(corridor, this.options.segments);
        const anchor = this.getFrameSample(this.options.anchorT);
        this.startPosition = this.spatialTransform.worldToRender(
            this.options.anchorT < 0.5 ? corridor.source.position : corridor.destination.position
        );
        this.firstMapped = map4To3(anchor.position, this.options.wToZScale);
        this.mesh = this.createMesh();
        this.material = createCorridorMaterial(
            scene,
            `geometryCorridorMaterial_${corridor.id}_${this.options.anchorT < 0.5 ? 'source' : 'destination'}`,
            this.options.opacity
        );
        this.mesh.material = this.material;
        this.mesh.isPickable = false;
        this.mesh.metadata = {
            ...(this.mesh.metadata || {}),
            corridorId: corridor.id,
            geometryProxy: true,
            renderOnly: true
        };
    }

    validateOptions() {
        const { segments, radialSegments, wToZScale, displayScale, opacity, anchorT } = this.options;
        if (!Number.isSafeInteger(segments) || segments < 2 || segments > 4096 ||
            !Number.isSafeInteger(radialSegments) || radialSegments < 3 ||
            !Number.isFinite(wToZScale) || !Number.isFinite(displayScale) || displayScale <= 0 ||
            !Number.isFinite(opacity) || opacity <= 0 || opacity > 1 ||
            !Number.isFinite(anchorT) || anchorT < 0 || anchorT > 1) {
            throw new RangeError('Invalid corridor rendering configuration.');
        }
    }

    createMesh() {
        const samples = this.frameSamples.map(this.mapSample.bind(this));
        const buffers = createTubeBuffers(samples, this.options.radialSegments);
        const mesh = new BABYLON.Mesh(
            `corridorProxy_${this.corridor.id}_${this.options.anchorT < 0.5 ? 'source' : 'destination'}`,
            this.scene
        );
        const data = new BABYLON.VertexData();
        data.positions = buffers.positions;
        data.normals = buffers.normals;
        data.colors = buffers.colors;
        data.indices = buffers.indices;
        data.applyToMesh(mesh, true);
        return mesh;
    }

    mapSample(sample) {
        const mapped = map4To3(sample.position, this.options.wToZScale);
        const scale = this.options.displayScale;
        const axes = sample.axes.map(mapAxis.bind(null, this.options.wToZScale));
        return {
            center: new BABYLON.Vector3(
                this.startPosition.x + (mapped.x - this.firstMapped.x) * scale,
                this.startPosition.y + (mapped.y - this.firstMapped.y) * scale,
                this.startPosition.z + (mapped.z - this.firstMapped.z) * scale
            ),
            tangent: mapAxis(this.options.wToZScale, sample.tangent),
            axes,
            axes4D: sample.axes,
            radius: sample.radius * scale
        };
    }

    getFrameSample(t) {
        const scaled = t * this.options.segments;
        const lower = Math.min(this.options.segments, Math.floor(scaled));
        const upper = Math.min(this.options.segments, lower + 1);
        const blend = scaled - lower;
        const left = this.frameSamples[lower];
        const right = this.frameSamples[upper];
        const tangent = normalize4(interpolate4(left.tangent, right.tangent, blend));
        return {
            position: interpolate4(left.position, right.position, blend),
            tangent,
            axes: transportPerpendicularFrame(left.axes, tangent),
            radius: left.radius + (right.radius - left.radius) * blend
        };
    }

    getDisplaySample(t) {
        if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('Corridor sample must be in [0, 1].');
        const sample = this.getFrameSample(t);
        const mapped = this.mapSample(sample);
        return {
            position: mapped.center,
            tangent: mapped.tangent,
            axes: createDisplayAxes(mapped),
            crossSectionAxes: mapped.axes.map(function toPlainAxis(axis) {
                return { x: axis.x, y: axis.y, z: axis.z };
            }),
            tangent4D: sample.tangent,
            axes4D: sample.axes,
            spatialPosition4D: sample.position,
            radius: mapped.radius
        };
    }

    dispose() {
        this.mesh.dispose();
        this.material.dispose();
    }
}

function createTubeBuffers(samples, radialSegments) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    for (let row = 0; row < samples.length; row++) {
        const frame = createDisplayFrame(samples[row]);
        writeTubeRing(samples[row], frame, radialSegments, row, samples.length, positions, normals, colors);
        if (row > 0) writeTubeIndices(row, radialSegments, indices);
    }
    return { positions, normals, colors, indices };
}

function createDisplayAxes(sample) {
    const tangent = normalize3(sample.tangent);
    let first = orthogonalize3(sample.axes[0], tangent);
    if (length3(first) < 1e-5) first = orthogonalize3(leastAlignedAxis(tangent), tangent);
    first.normalize();
    let second = orthogonalize3(sample.axes[1], tangent);
    second = second.subtract(first.scale(BABYLON.Vector3.Dot(second, first)));
    if (length3(second) < 1e-5) second = BABYLON.Vector3.Cross(tangent, first);
    second.normalize();
    return [first, second];
}

function leastAlignedAxis(tangent) {
    const axes = [
        new BABYLON.Vector3(1, 0, 0),
        new BABYLON.Vector3(0, 1, 0),
        new BABYLON.Vector3(0, 0, 1)
    ];
    axes.sort(function compareAlignment(left, right) {
        return Math.abs(BABYLON.Vector3.Dot(left, tangent)) -
            Math.abs(BABYLON.Vector3.Dot(right, tangent));
    });
    return axes[0];
}

function createDisplayFrame(sample) {
    const [first, second] = createDisplayAxes(sample);
    return { first, second };
}

function writeTubeRing(sample, frame, radialSegments, row, rowCount, positions, normals, colors) {
    for (let column = 0; column <= radialSegments; column++) {
        const angle = column / radialSegments * Math.PI * 2;
        const normal = frame.first.scale(Math.cos(angle)).add(frame.second.scale(Math.sin(angle))).normalize();
        const point = sample.center.add(normal.scale(sample.radius));
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        const blend = row / (rowCount - 1);
        colors.push(0.22 + 0.18 * blend, 0.5 + 0.22 * (1 - blend), 0.96, 0.82);
    }
}

function writeTubeIndices(row, radialSegments, indices) {
    const previousStart = (row - 1) * (radialSegments + 1);
    const currentStart = row * (radialSegments + 1);
    for (let column = 0; column < radialSegments; column++) {
        const a = previousStart + column;
        const b = currentStart + column;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
}

function interpolate4(left, right, amount) {
    return {
        x: left.x + (right.x - left.x) * amount,
        y: left.y + (right.y - left.y) * amount,
        z: left.z + (right.z - left.z) * amount,
        w: left.w + (right.w - left.w) * amount
    };
}

function mapAxis(wToZScale, vector) { return map4To3(vector, wToZScale); }

function map4To3(vector, wToZScale) {
    return new BABYLON.Vector3(vector.x, vector.y, vector.z + vector.w * wToZScale);
}

function orthogonalize3(vector, tangent) {
    return vector.subtract(tangent.scale(BABYLON.Vector3.Dot(vector, tangent)));
}

function normalize3(vector) {
    const result = new BABYLON.Vector3(vector.x, vector.y, vector.z);
    return result.lengthSquared() > 1e-12 ? result.normalize() : new BABYLON.Vector3(0, 0, 1);
}

function length3(vector) { return Math.hypot(vector.x, vector.y, vector.z); }

function createCorridorMaterial(scene, name, opacity) {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.useVertexColors = true;
    material.diffuseColor = BABYLON.Color3.White();
    material.emissiveColor = new BABYLON.Color3(0.08, 0.12, 0.3);
    material.alpha = opacity;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    material.disableLighting = true;
    return material;
}

export { CorridorRenderer };
