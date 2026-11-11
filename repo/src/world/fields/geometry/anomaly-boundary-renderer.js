/** Renders slice intersections of open 4D anomaly boundary surfaces. */

import { ambientToSlice } from './spatial-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const BOUNDARY_FACE_DEFINITIONS = Object.freeze([
    { id: 'x-min', axis: 'x', side: -1, uAxis: 'y', vAxis: 'z', normalMultiplier: -1 },
    { id: 'x-max', axis: 'x', side: 1, uAxis: 'y', vAxis: 'z', normalMultiplier: 1 },
    { id: 'y-min', axis: 'y', side: -1, uAxis: 'x', vAxis: 'z', normalMultiplier: 1 },
    { id: 'y-max', axis: 'y', side: 1, uAxis: 'x', vAxis: 'z', normalMultiplier: -1 },
    { id: 'z-min', axis: 'z', side: -1, uAxis: 'x', vAxis: 'y', normalMultiplier: -1 },
    { id: 'z-max', axis: 'z', side: 1, uAxis: 'x', vAxis: 'y', normalMultiplier: 1 }
]);
const AXES = Object.freeze(['x', 'y', 'z', 'w']);
const EPSILON = 1e-7;

/**
 * Builds the active 3D-slice intersection of an open 4D box.
 * The two W-facing end cells are intentionally omitted; the six remaining
 * cubic 3D cells intersect a W-aligned 3D slice as six rectangular panels.
 */
function buildAnomalyBoundaryGeometry(options = {}) {
    const anomaly = options.anomaly;
    const slice = options.slice;
    const transform = options.spatialTransform;
    const viewerW = options.viewerW;
    const gridSegments = options.gridSegments ?? 6;
    if (!anomaly?.region?.min || !anomaly?.region?.max || !slice?.frame ||
        typeof transform?.worldToRender !== 'function') {
        throw new TypeError('Anomaly boundary geometry requires an anomaly, slice frame, and spatial transform.');
    }
    if (!Number.isFinite(viewerW)) throw new TypeError('Anomaly boundary viewer W must be finite.');
    if (!Number.isSafeInteger(gridSegments) || gridSegments < 1 || gridSegments > 64) {
        throw new RangeError('Anomaly boundary gridSegments must be an integer from 1 to 64.');
    }
    validateRegion(anomaly.region);

    if (!isWAlignedSlice(slice.frame)) {
        return { supported: false, visible: false, reason: 'slice-not-w-aligned', faces: [], lines: [] };
    }
    if (viewerW < anomaly.region.min.w - EPSILON || viewerW > anomaly.region.max.w + EPSILON) {
        return { supported: true, visible: false, reason: 'outside-w-span', faces: [], lines: [] };
    }

    const presentationOffset = getPresentationOffset(anomaly, slice.id, options.presentationEndpoint);
    const verticesPerFace = (gridSegments + 1) ** 2;
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];
    const faces = [];

    for (const definition of BOUNDARY_FACE_DEFINITIONS) {
        const vertexStart = positions.length / 3;
        const faceGrid = [];
        for (let vIndex = 0; vIndex <= gridSegments; vIndex++) {
            const vAmount = vIndex / gridSegments;
            const row = [];
            for (let uIndex = 0; uIndex <= gridSegments; uIndex++) {
                const uAmount = uIndex / gridSegments;
                const ambient = {
                    x: 0, y: 0, z: 0, w: viewerW,
                    [definition.axis]: anomaly.region[definition.side < 0 ? 'min' : 'max'][definition.axis],
                    [definition.uAxis]: interpolate(
                        anomaly.region.min[definition.uAxis], anomaly.region.max[definition.uAxis], uAmount
                    ),
                    [definition.vAxis]: interpolate(
                        anomaly.region.min[definition.vAxis], anomaly.region.max[definition.vAxis], vAmount
                    )
                };
                const local = ambientToSlice(slice.frame, ambient).position;
                local.x += presentationOffset.x;
                local.y += presentationOffset.y;
                local.z += presentationOffset.z;
                if (typeof transform.containsMetricDomainPosition === 'function' &&
                    !transform.containsMetricDomainPosition(local)) {
                    return {
                        supported: true, visible: false, reason: 'chart-domain-boundary',
                        faces: [], lines: []
                    };
                }
                const render = transform.worldToRender(local);
                if (!isFinitePoint3(render)) {
                    return {
                        supported: true, visible: false, reason: 'invalid-render-position',
                        faces: [], lines: []
                    };
                }
                row.push({ x: render.x, y: render.y, z: render.z });
                positions.push(render.x, render.y, render.z);
            }
            faceGrid.push(row);
        }

        appendGridIndices(vertexStart, gridSegments, indices);
        appendFaceNormals(faceGrid, definition.normalMultiplier, normals);
        appendGridLines(faceGrid, lines);
        faces.push({
            id: definition.id,
            axis: definition.axis,
            side: definition.side,
            vertexStart,
            vertexCount: verticesPerFace
        });
    }

    return {
        supported: true,
        visible: true,
        reason: null,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
        lines,
        faces
    };
}


/**
 * Builds a constant-W section of a tapered 4D cylinder.
 *
 * The tube axis must be parallel to ambient W for the current W-aligned
 * renderer. Its transverse 3D section is a ball; the visible boundary in a
 * 3D W-slice is therefore a sphere. The sphere radius is smoothly interpolated
 * between the anomaly's source and destination endpoint radii.
 */
function buildAnomalyCylinderGeometry(options = {}) {
    const anomaly = options.anomaly;
    const slice = options.slice;
    const transform = options.spatialTransform;
    const viewerW = options.viewerW;
    if (!anomaly?.region?.min || !anomaly.region.max || !slice?.frame ||
        typeof transform?.worldToRender !== 'function') {
        throw new TypeError('Anomaly cylinder geometry requires an anomaly, slice frame, and spatial transform.');
    }
    if (!Number.isFinite(viewerW)) throw new TypeError('Anomaly cylinder viewer W must be finite.');
    validateRegion(anomaly.region);
    if (!isWAlignedSlice(slice.frame)) {
        return { supported: false, visible: false, reason: 'slice-not-w-aligned', faces: [], lines: [] };
    }
    if (viewerW < anomaly.region.min.w - EPSILON || viewerW > anomaly.region.max.w + EPSILON) {
        return { supported: true, visible: false, reason: 'outside-w-span', faces: [], lines: [] };
    }

    const source = options.sourceAmbient;
    const destination = options.destinationAmbient;
    if (!isFinitePoint4(source) || !isFinitePoint4(destination)) {
        throw new TypeError('A tapered anomaly cylinder requires finite ambient source and destination endpoints.');
    }
    const wSpan = destination.w - source.w;
    if (Math.abs(wSpan) <= EPSILON) {
        return { supported: false, visible: false, reason: 'zero-w-span', faces: [], lines: [] };
    }
    const spatialAxisLength = Math.hypot(
        destination.x - source.x, destination.y - source.y, destination.z - source.z
    );
    if (spatialAxisLength > 1e-5) {
        return { supported: false, visible: false, reason: 'cylinder-axis-not-w-aligned', faces: [], lines: [] };
    }

    const radii = anomaly.view?.interiorBoundaryRadii;
    if (!radii || !Number.isFinite(radii.source) || radii.source <= 0 ||
        !Number.isFinite(radii.destination) || radii.destination <= 0) {
        throw new TypeError(`Anomaly ${anomaly.id} requires positive source and destination cylinder radii.`);
    }
    const rawProgress = clamp((viewerW - source.w) / wSpan, 0, 1);
    const progress = smootherstep(rawProgress);
    const radius = interpolate(radii.source, radii.destination, progress);
    const center = {
        x: interpolate(source.x, destination.x, rawProgress),
        y: interpolate(source.y, destination.y, rawProgress),
        z: interpolate(source.z, destination.z, rawProgress),
        w: viewerW
    };
    const latitudeSegments = options.latitudeSegments ?? 10;
    const longitudeSegments = options.longitudeSegments ?? 24;
    if (!Number.isSafeInteger(latitudeSegments) || latitudeSegments < 4 || latitudeSegments > 64 ||
        !Number.isSafeInteger(longitudeSegments) || longitudeSegments < 8 || longitudeSegments > 128) {
        throw new RangeError('Anomaly cylinder segments are outside supported limits.');
    }

    const presentationOffset = getPresentationOffset(anomaly, slice.id, options.presentationEndpoint);
    const grid = [];
    const positions = [];
    const normals = [];
    const indices = [];
    const lines = [];
    for (let latitude = 0; latitude <= latitudeSegments; latitude++) {
        const theta = Math.PI * latitude / latitudeSegments;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const row = [];
        for (let longitude = 0; longitude <= longitudeSegments; longitude++) {
            const phi = 2 * Math.PI * longitude / longitudeSegments;
            const ambient = {
                x: center.x + radius * sinTheta * Math.cos(phi),
                y: center.y + radius * cosTheta,
                z: center.z + radius * sinTheta * Math.sin(phi),
                w: viewerW
            };
            const local = ambientToSlice(slice.frame, ambient).position;
            local.x += presentationOffset.x;
            local.y += presentationOffset.y;
            local.z += presentationOffset.z;
            if (typeof transform.containsMetricDomainPosition === 'function' &&
                !transform.containsMetricDomainPosition(local)) {
                return {
                    supported: true, visible: false, reason: 'chart-domain-boundary',
                    faces: [], lines: [], sectionRadius: radius, progress
                };
            }
            const render = transform.worldToRender(local);
            if (!isFinitePoint3(render)) {
                return {
                    supported: true, visible: false, reason: 'invalid-render-position',
                    faces: [], lines: [], sectionRadius: radius, progress
                };
            }
            const point = { x: render.x, y: render.y, z: render.z };
            row.push(point);
            positions.push(point.x, point.y, point.z);
        }
        grid.push(row);
    }

    appendGridIndices(0, longitudeSegments, indices, latitudeSegments);
    appendFaceNormals(grid, 1, normals);
    appendSphereGridLines(grid, lines);
    return {
        supported: true,
        visible: true,
        reason: null,
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
        lines,
        faces: [{ id: 'tapered-cylinder-wall', axis: 'w', side: 0, vertexStart: 0,
            vertexCount: (latitudeSegments + 1) * (longitudeSegments + 1) }],
        boundaryType: 'open-4d-cylinder',
        sectionRadius: radius,
        progress,
        centerAmbient: center,
        latitudeSegments,
        longitudeSegments
    };
}

function resolveAnomalyCylinderRadius(anomaly, sourceAmbient, destinationAmbient, viewerW) {
    if (!anomaly?.view?.interiorBoundaryRadii || !isFinitePoint4(sourceAmbient) ||
        !isFinitePoint4(destinationAmbient) || !Number.isFinite(viewerW)) {
        throw new TypeError('Cylinder radius resolution requires valid anomaly endpoints and viewer W.');
    }
    const span = destinationAmbient.w - sourceAmbient.w;
    if (Math.abs(span) <= EPSILON) throw new RangeError('Cylinder endpoints must differ along W.');
    const progress = smootherstep(clamp((viewerW - sourceAmbient.w) / span, 0, 1));
    return {
        progress,
        radius: interpolate(
            anomaly.view.interiorBoundaryRadii.source,
            anomaly.view.interiorBoundaryRadii.destination,
            progress
        )
    };
}

function appendSphereGridLines(grid, lines) {
    // Latitude rings omit the degenerate pole rows; longitude curves meet at
    // each pole and provide the recognizable longitudinal cylinder structure.
    for (let row = 1; row < grid.length - 1; row++) {
        lines.push(grid[row].map(copyPoint3));
    }
    for (let column = 0; column < grid[0].length - 1; column++) {
        lines.push(grid.map((row) => copyPoint3(row[column])));
    }
}

function isFinitePoint4(point) {
    return Boolean(point) && ['x', 'y', 'z', 'w'].every((axis) => Number.isFinite(point[axis]));
}

function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

class AnomalyBoundaryRenderer {
    constructor(scene, anomaly, slice, spatialTransform, options = {}) {
        if (!scene || typeof BABYLON === 'undefined') {
            throw new TypeError('AnomalyBoundaryRenderer requires a Babylon scene.');
        }
        this.scene = scene;
        this.anomaly = anomaly;
        this.slice = slice;
        this.spatialTransform = spatialTransform;
        this.options = {
            gridSegments: options.gridSegments ?? 6,
            opacity: options.opacity ?? 0.105,
            edgeAlpha: options.edgeAlpha ?? 0.78,
            presentationEndpoint: options.presentationEndpoint ?? null,
            sourceAmbient: options.sourceAmbient ?? null,
            destinationAmbient: options.destinationAmbient ?? null,
            layerMask: options.layerMask ?? 0x0FFFFFFF
        };
        validateRendererOptions(this.options);
        this.visibleRequested = false;
        this.sliceVisible = false;
        this.disposed = false;
        this.lastViewerW = null;
        this.lastGeometry = null;
        this.material = createSurfaceMaterial(scene, anomaly.id, this.options.opacity);
        this.mesh = new BABYLON.Mesh(`anomalyBoundary_${anomaly.id}_${slice.id}`, scene);
        this.mesh.material = this.material;
        this.mesh.layerMask = this.options.layerMask;
        this.mesh.isPickable = false;
        this.mesh.alwaysSelectAsActiveMesh = true;
        this.mesh.metadata = {
            ...(this.mesh.metadata || {}),
            anomalyBoundary: true,
            anomalyId: anomaly.id,
            sliceId: slice.id,
            boundaryCellCount: anomaly.view?.interiorBoundary === 'open-4d-cylinder' ? 0 : 6,
            boundarySurfaceCount: anomaly.view?.interiorBoundary === 'open-4d-cylinder' ? 1 : 6,
            boundaryType: anomaly.view?.interiorBoundary ?? 'open-4d-hypercube',
            omittedEndCaps: 2,
            renderOnly: true
        };

        this.edgeMesh = null;
        const endpointW = resolveEndpointW(anomaly, slice);
        this.update(endpointW, true);
        if (this.edgeMesh) {
            this.edgeMesh.metadata = {
                ...(this.edgeMesh.metadata || {}),
                anomalyBoundary: true,
                anomalyId: anomaly.id,
                sliceId: slice.id,
                boundaryEdges: true,
                renderOnly: true
            };
        }
        this.setVisible(false);
    }

    update(viewerW, force = false) {
        if (this.disposed) return false;
        if (!Number.isFinite(viewerW)) throw new TypeError('Anomaly boundary viewer W must be finite.');
        if (!force && this.lastViewerW !== null && Math.abs(viewerW - this.lastViewerW) < 1e-3) {
            return this.sliceVisible;
        }
        const geometryBuilder = this.anomaly.view?.interiorBoundary === 'open-4d-cylinder'
            ? buildAnomalyCylinderGeometry : buildAnomalyBoundaryGeometry;
        const geometry = geometryBuilder({
            anomaly: this.anomaly,
            slice: this.slice,
            spatialTransform: this.spatialTransform,
            viewerW,
            gridSegments: this.options.gridSegments,
            presentationEndpoint: this.options.presentationEndpoint,
            sourceAmbient: this.options.sourceAmbient,
            destinationAmbient: this.options.destinationAmbient
        });
        this.lastViewerW = viewerW;
        this.lastGeometry = geometry;
        this.sliceVisible = Boolean(geometry.visible);
        if (geometry.visible) this.applyGeometry(geometry);
        this.applyVisibility();
        return this.sliceVisible;
    }

    applyGeometry(geometry) {
        if (!this.mesh.getVerticesData?.(BABYLON.VertexBuffer.PositionKind)) {
            const vertexData = new BABYLON.VertexData();
            vertexData.positions = geometry.positions;
            vertexData.normals = geometry.normals;
            vertexData.indices = geometry.indices;
            vertexData.applyToMesh(this.mesh, true);
        } else {
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, geometry.positions, false, false);
            this.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, geometry.normals, false, false);
        }
        const lines = geometry.lines.map(function toBabylonLine(line) {
            return line.map((point) => new BABYLON.Vector3(point.x, point.y, point.z));
        });
        const edgeOptions = this.edgeMesh
            ? { lines, instance: this.edgeMesh }
            : { lines, updatable: true };
        this.edgeMesh = BABYLON.MeshBuilder.CreateLineSystem(
            `anomalyBoundaryEdges_${this.anomaly.id}_${this.slice.id}`,
            edgeOptions,
            this.scene
        );
        this.edgeMesh.color = new BABYLON.Color3(0.28, 0.78, 1);
        this.edgeMesh.alpha = this.options.edgeAlpha;
        this.edgeMesh.layerMask = this.options.layerMask;
        this.edgeMesh.isPickable = false;
        this.edgeMesh.alwaysSelectAsActiveMesh = true;
    }

    setVisible(visible) {
        this.visibleRequested = Boolean(visible);
        this.applyVisibility();
    }

    applyVisibility() {
        if (!this.mesh || !this.edgeMesh) return;
        const visible = !this.disposed && this.visibleRequested && this.sliceVisible;
        this.mesh.isVisible = visible;
        this.edgeMesh.isVisible = visible;
    }

    getInfo() {
        return {
            anomalyId: this.anomaly.id,
            sliceId: this.slice.id,
            visible: Boolean(this.mesh?.isVisible),
            supported: this.lastGeometry?.supported ?? true,
            reason: this.lastGeometry?.reason ?? null,
            boundaryType: this.lastGeometry?.boundaryType ?? this.anomaly.view?.interiorBoundary ?? 'open-4d-hypercube',
            boundaryCellCount: this.lastGeometry?.boundaryType === 'open-4d-cylinder' ? 0 :
                (this.lastGeometry?.faces?.length ?? 0),
            boundarySurfaceCount: this.lastGeometry?.faces?.length ?? 0,
            omittedEndCaps: 2,
            viewerW: this.lastViewerW,
            sectionRadius: this.lastGeometry?.sectionRadius ?? null,
            progress: this.lastGeometry?.progress ?? null
        };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh?.dispose?.();
        this.edgeMesh?.dispose?.();
        this.material?.dispose?.();
        this.mesh = null;
        this.edgeMesh = null;
        this.material = null;
    }
}

function getPresentationOffset(anomaly, sliceId, presentationEndpoint) {
    if (!presentationEndpoint) return { x: 0, y: 0, z: 0 };
    const endpoint = anomaly.source.sliceId === sliceId
        ? anomaly.source : anomaly.destination.sliceId === sliceId ? anomaly.destination : null;
    if (!endpoint) throw new Error(`Anomaly ${anomaly.id} has no endpoint in slice ${sliceId}.`);
    return {
        x: presentationEndpoint.x - endpoint.position.x,
        y: presentationEndpoint.y - endpoint.position.y,
        z: presentationEndpoint.z - endpoint.position.z
    };
}

function resolveEndpointW(anomaly, slice) {
    const endpoint = anomaly.source.sliceId === slice.id
        ? anomaly.source : anomaly.destination.sliceId === slice.id ? anomaly.destination : null;
    if (!endpoint) throw new Error(`Anomaly ${anomaly.id} has no endpoint in slice ${slice.id}.`);
    return slice.frame.origin.w + slice.frame.axes.reduce(
        (sum, axis, index) => sum + axis.w * endpoint.position[['x', 'y', 'z'][index]], 0
    );
}

function isWAlignedSlice(frame) {
    if (!frame?.normal || !Array.isArray(frame.axes) || frame.axes.length !== 3) return false;
    if (Math.abs(frame.normal.x) > EPSILON || Math.abs(frame.normal.y) > EPSILON ||
        Math.abs(frame.normal.z) > EPSILON || Math.abs(Math.abs(frame.normal.w) - 1) > EPSILON) return false;
    return frame.axes.every((axis) => Math.abs(axis.w) <= EPSILON);
}

function validateRegion(region) {
    for (const axis of AXES) {
        if (!Number.isFinite(region.min[axis]) || !Number.isFinite(region.max[axis]) ||
            region.max[axis] <= region.min[axis]) {
            throw new TypeError(`Anomaly boundary requires finite, ordered ${axis} bounds.`);
        }
    }
}

function validateRendererOptions(options) {
    if (!Number.isSafeInteger(options.gridSegments) || options.gridSegments < 1 || options.gridSegments > 64 ||
        !Number.isFinite(options.opacity) || options.opacity <= 0 || options.opacity >= 1 ||
        !Number.isFinite(options.edgeAlpha) || options.edgeAlpha < 0 || options.edgeAlpha > 1) {
        throw new RangeError('Invalid anomaly boundary renderer configuration.');
    }
}

function createSurfaceMaterial(scene, anomalyId, opacity) {
    const material = new BABYLON.StandardMaterial(`anomalyBoundaryMaterial_${anomalyId}`, scene);
    material.diffuseColor = new BABYLON.Color3(0.08, 0.38, 0.58);
    material.emissiveColor = new BABYLON.Color3(0.025, 0.16, 0.28);
    material.alpha = opacity;
    material.disableLighting = true;
    material.disableDepthWrite = true;
    material.backFaceCulling = false;
    return material;
}

function appendGridIndices(vertexStart, segments, indices, rowSegments = segments) {
    const stride = segments + 1;
    for (let v = 0; v < rowSegments; v++) {
        for (let u = 0; u < segments; u++) {
            const a = vertexStart + v * stride + u;
            const b = a + 1;
            const c = a + stride + 1;
            const d = a + stride;
            indices.push(a, b, c, a, c, d);
        }
    }
}

function appendFaceNormals(grid, multiplier, normals) {
    for (let v = 0; v < grid.length; v++) {
        for (let u = 0; u < grid[v].length; u++) {
            const beforeU = grid[v][Math.max(0, u - 1)];
            const afterU = grid[v][Math.min(grid[v].length - 1, u + 1)];
            const beforeV = grid[Math.max(0, v - 1)][u];
            const afterV = grid[Math.min(grid.length - 1, v + 1)][u];
            const du = subtract3(afterU, beforeU);
            const dv = subtract3(afterV, beforeV);
            let normal = cross3(du, dv);
            const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
            normal = {
                x: normal.x / length * multiplier,
                y: normal.y / length * multiplier,
                z: normal.z / length * multiplier
            };
            normals.push(normal.x, normal.y, normal.z);
        }
    }
}

function appendGridLines(grid, lines) {
    for (const row of grid) lines.push(row.map(copyPoint3));
    for (let column = 0; column < grid[0].length; column++) {
        lines.push(grid.map((row) => copyPoint3(row[column])));
    }
}

function subtract3(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function cross3(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    };
}
function copyPoint3(point) { return { x: point.x, y: point.y, z: point.z }; }
function isFinitePoint3(point) { return Boolean(point) && [point.x, point.y, point.z].every(Number.isFinite); }
function interpolate(a, b, t) { return a + (b - a) * t; }

export {
    AnomalyBoundaryRenderer,
    BOUNDARY_FACE_DEFINITIONS,
    buildAnomalyBoundaryGeometry,
    buildAnomalyCylinderGeometry,
    resolveAnomalyCylinderRadius,
    isWAlignedSlice
};
