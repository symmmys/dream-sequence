import { createHypercubeSlice, createHypercubeVertices } from '../world/fields/geometry/hypercube-4d.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { SpatialTransform } from '../world/fields/geometry/spatial-transform.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';
import { getPlaneNormalOffsetAtW, planeIntersectsWSlice } from '../world/fields/geometry/w-slice-range.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1';

const CUSTOM_PLANE_LAYER = 0x40000000;

const DEFAULT_COLORS = Object.freeze({
    box: '#9e78e8', sphere: '#e59c42', cylinder: '#6ec58d',
    torus: '#55a7dc', label: '#e7edf5', hypercube4d: '#58d7f0'
});

/**
 * Renders objects authored in a Plane's local XYZ chart.
 *
 * Each Plane resolves to its own SpatialTransform when it is registered in
 * the runtime Plane graph. Stored object positions never become
 * render-space coordinates: every mesh and gizmo conversion goes through the
 * resolved Plane transform.
 */
class PlaneObjectRenderer {
    constructor(scene, fallbackTransform) {
        if (!scene || !fallbackTransform?.worldToRender || !fallbackTransform?.renderToWorld) {
            throw new TypeError('PlaneObjectRenderer requires a scene and bidirectional spatial transform.');
        }
        this.scene = scene;
        this.fallbackTransform = fallbackTransform;
        this.geometryDemo = null;
        this.records = new Map();
        this.planeDefinitions = new Map();
        this.customTransforms = new Map();
        this.viewerW = null;
        this.viewerWByPlane = new Map();
        this.editorWCoordinate = null;
        this.demoActive = false;
        this.editorActive = false;
        this.editorPlaneId = null;
    }

    setGeometryDemo(geometryDemo) {
        this.geometryDemo = geometryDemo ?? null;
        for (const record of this.records.values()) {
            record.context = this.resolveContext(record.planeId);
            this.updateRecord(record);
        }
        this.setDemoActive(Boolean(this.geometryDemo?.active));
    }

    setEditorContext(active, planeId = null) {
        this.editorActive = Boolean(active);
        this.editorPlaneId = this.editorActive ? (planeId || null) : null;
        for (const record of this.records.values()) this.updateRecordVisibility(record);
    }

    /** Set the absolute ambient-W slice used to inspect every registered Plane. */
    setEditorWCoordinate(coordinate) {
        const next = coordinate == null ? NaN : Number(coordinate);
        this.editorWCoordinate = Number.isFinite(next) ? next : null;
        this.viewerWByPlane.clear();
        if (this.editorWCoordinate != null) {
            for (const [planeId, plane] of this.planeDefinitions) {
                this.viewerWByPlane.set(planeId, getPlaneNormalOffsetAtW(plane, this.editorWCoordinate));
            }
        }
        for (const record of this.records.values()) {
            if (record.object?.type === 'hypercube4d') this.updateRecord(record);
            else this.updateRecordVisibility(record);
        }
        return this.editorWCoordinate;
    }

    isPlaneInEditorWSlice(planeId) {
        if (!Number.isFinite(this.editorWCoordinate)) return planeId === this.editorPlaneId;
        const definition = this.planeDefinitions.get(planeId);
        return definition ? planeIntersectsWSlice(definition, this.editorWCoordinate) : planeId === this.editorPlaneId;
    }

    getViewerWForPlane(planeId, fallback = 0) {
        if (this.viewerWByPlane.has(planeId)) return this.viewerWByPlane.get(planeId);
        return Number.isFinite(this.viewerW) ? this.viewerW : (Number.isFinite(fallback) ? fallback : 0);
    }

    setDemoActive(active) {
        this.demoActive = Boolean(active);
        for (const record of this.records.values()) this.updateRecordVisibility(record);
    }

    syncPlanes(planes) {
        const desired = new Set();
        const planeIds = new Set();
        for (const plane of planes ?? []) {
            if (!plane?.id) continue;
            planeIds.add(plane.id);
            const previousDefinition = this.planeDefinitions.get(plane.id);
            this.planeDefinitions.set(plane.id, clone(plane));
            if (previousDefinition && JSON.stringify(previousDefinition.frame) !== JSON.stringify(plane.frame)) this.customTransforms.delete(plane.id);
            if (previousDefinition && previousDefinition.geometry !== plane.geometry) this.customTransforms.delete(plane.id);
            for (const object of plane.objects ?? []) {
                const key = recordKey(plane.id, object.id);
                desired.add(key);
                const existing = this.records.get(key);
                const rebuildGeometry = existing && (
                    (object.type === 'torus' && object.parameters?.thickness !== existing.geometryParameters?.thickness)
                );
                if (!existing || existing.object.type !== object.type || rebuildGeometry) {
                    this.disposeRecord(existing);
                    this.records.set(key, this.createRecord(plane.id, object));
                } else {
                    existing.object = clone(object);
                    existing.context = this.resolveContext(plane.id);
                    this.updateRecord(existing);
                }
            }
        }
        for (const [key, record] of this.records) {
            if (!desired.has(key)) {
                this.disposeRecord(record);
                this.records.delete(key);
            }
        }
        for (const id of this.planeDefinitions.keys()) {
            if (!planeIds.has(id)) this.planeDefinitions.delete(id);
        }
        if (Number.isFinite(this.editorWCoordinate)) {
            this.viewerWByPlane.clear();
            for (const [planeId, plane] of this.planeDefinitions) {
                this.viewerWByPlane.set(planeId, getPlaneNormalOffsetAtW(plane, this.editorWCoordinate));
            }
            for (const record of this.records.values()) {
                if (record.object?.type === 'hypercube4d') this.updateRecord(record);
            }
        }
    }

    syncPlane(plane) {
        if (!plane?.id) throw new TypeError('syncPlane requires a Plane definition with an ID.');
        const previous = this.planeDefinitions.get(plane.id);
        this.planeDefinitions.set(plane.id, clone(plane));
        if (!previous || JSON.stringify(previous.frame) !== JSON.stringify(plane.frame) || previous.geometry !== plane.geometry) this.customTransforms.delete(plane.id);
        const allPlanes = [...this.planeDefinitions.values()];
        this.syncPlanes(allPlanes);
    }

    setPlaneDefinition(plane) {
        if (!plane?.id) throw new TypeError('setPlaneDefinition requires a Plane definition with an ID.');
        const previous = this.planeDefinitions.get(plane.id);
        this.planeDefinitions.set(plane.id, clone(plane));
        if (!previous || JSON.stringify(previous.frame) !== JSON.stringify(plane.frame) || previous.geometry !== plane.geometry) this.customTransforms.delete(plane.id);
        if (Number.isFinite(this.editorWCoordinate)) {
            this.viewerWByPlane.set(plane.id, getPlaneNormalOffsetAtW(plane, this.editorWCoordinate));
        }
        for (const record of this.records.values()) {
            if (record.planeId !== plane.id) continue;
            record.context = this.resolveContext(plane.id);
            this.updateRecord(record);
        }
    }

    resolveContext(planeId, geometry = null) {
        const plane = this.planeDefinitions.get(planeId) ?? null;
        try {
            const world = this.geometryDemo?.getWorld?.(planeId);
            if (world?.transform) {
                return {
                    transform: world.transform,
                    layerMask: world.layerMask ?? 0x0FFFFFFF,
                    geometry: world.transform.geometryName,
                    runtimeWorld: true,
                    world
                };
            }
        } catch {}
        const context = this.resolveCustomTransform(planeId, geometry ?? plane?.geometry ?? this.fallbackTransform.geometryName, plane?.frame);
        return {
            transform: context.transform,
            layerMask: CUSTOM_PLANE_LAYER,
            geometry: context.transform.geometryName,
            runtimeWorld: false,
            world: null,
            frameProjectionSupported: context.frameProjectionSupported
        };
    }

    resolveCustomTransform(planeId, geometry, frame) {
        const key = JSON.stringify({ geometry, frame: frame ?? null });
        const cached = this.customTransforms.get(planeId);
        if (cached?.key === key) return cached;
        let chartTransform = this.fallbackTransform;
        if (geometry !== this.fallbackTransform.geometryName) {
            const renderScale = geometry === 'euclidean' ? 1 : (this.fallbackTransform.renderScale || 24);
            chartTransform = new SpatialTransform({
                geometry,
                renderScale,
                enabled: true,
                bounds: this.fallbackTransform.projection?.bounds,
                visualScaleGamma: this.fallbackTransform.visualScaleOptions?.gamma,
                maxVisualScale: this.fallbackTransform.visualScaleOptions?.maxScale
            });
        }
        const frameTransform = createPlaneFrameTransform(chartTransform, frame);
        const result = { key, transform: frameTransform.transform, frameProjectionSupported: frameTransform.supported };
        this.customTransforms.set(planeId, result);
        return result;
    }

    /** Convert a Plane-local XYZ position to Babylon render coordinates. */
    localToRender(planeId, position) {
        const transform = this.resolveContext(planeId).transform;
        return projectPlaneLocalPosition(transform, position);
    }

    /** Convert a Babylon render-space gizmo position back to Plane-local XYZ. */
    renderToLocal(planeId, position) {
        const transform = this.resolveContext(planeId).transform;
        return unprojectPlaneRenderPosition(transform, position);
    }

    createRecord(planeId, object) {
        const record = {
            planeId,
            object: clone(object),
            context: this.resolveContext(planeId),
            meshes: [],
            basePositions: [],
            indices: [],
            material: null,
            geometryParameters: null
        };
        if (object.type === 'hypercube4d') this.createHypercubeRecord(record);
        else this.createPrimitiveRecord(record);
        this.updateRecord(record);
        return record;
    }

    createPrimitiveRecord(record) {
        const object = record.object;
        let mesh;
        switch (object.type) {
            case 'box': mesh = BABYLON.MeshBuilder.CreateBox(`planeObject_${object.id}`, { size: 1 }, this.scene); break;
            case 'sphere': mesh = BABYLON.MeshBuilder.CreateSphere(`planeObject_${object.id}`, { diameter: 1, segments: 20 }, this.scene); break;
            case 'cylinder': mesh = BABYLON.MeshBuilder.CreateCylinder(`planeObject_${object.id}`, { height: 1, diameter: 1, tessellation: 24 }, this.scene); break;
            case 'torus': mesh = BABYLON.MeshBuilder.CreateTorus(`planeObject_${object.id}`, { diameter: 1, thickness: object.parameters?.thickness ?? 0.16, tessellation: 32 }, this.scene); break;
            // Labels use display-space width and sit at the projected anchor.
            // Unlike physical primitives, their text remains a readable screen-facing annotation.
            case 'label': mesh = BABYLON.MeshBuilder.CreatePlane(`planeObject_${object.id}`, { width: 1, height: 0.16, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene); break;
            default: throw new RangeError(`Plane object renderer does not support ${object.type}.`);
        }
        record.basePositions = Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind) ?? []);
        record.indices = Array.from(mesh.getIndices() ?? []);
        record.geometryParameters = { thickness: object.parameters?.thickness };
        record.material = new BABYLON.StandardMaterial(`planeObjectMaterial_${object.id}`, this.scene);
        record.material.diffuseColor = BABYLON.Color3.FromHexString(object.material?.color ?? DEFAULT_COLORS[object.type] ?? '#c5d5e2');
        record.material.emissiveColor = object.type === 'label' ? BABYLON.Color3.White() : BABYLON.Color3.Black();
        record.material.specularColor = new BABYLON.Color3(0.12, 0.14, 0.18);
        record.material.backFaceCulling = false;
        if (object.type === 'label') {
            const texture = new BABYLON.DynamicTexture(`planeObjectTexture_${object.id}`, { width: 1024, height: 160 }, this.scene, false);
            texture.hasAlpha = true;
            texture.drawText(String(object.text ?? object.name), null, null, 'bold 46px Arial', '#ffffff', 'rgba(7, 15, 28, 0.88)', true);
            record.material.diffuseTexture = texture;
            record.material.opacityTexture = texture;
            record.material.useAlphaFromDiffuseTexture = true;
            record.material.disableLighting = true;
            record.material.zOffset = -2;
        } else {
            record.material.roughness = 0.86;
        }
        mesh.material = record.material;
        mesh.isPickable = true;
        mesh.layerMask = record.context.layerMask;
        mesh.metadata = { planeObject: true, planeId: record.planeId, sliceId: record.planeId, planeObjectId: object.id, planeObjectType: object.type };
        record.meshes = [mesh];
    }

    createHypercubeRecord(record) {
        const object = record.object;
        const params = object.parameters ?? {};
        const halfExtent = params.halfExtent ?? Math.max(0.1, object.dimensions?.x / 2 ?? 4.2);
        const angles = params.initialAngles ?? { xw: 0.42, yw: 0.36, zw: 0.32 };
        const viewerW = this.getViewerWForPlane(record.planeId, params.viewerW);
        const section = createHypercubeSlice(createHypercubeVertices(halfExtent), angles, viewerW);
        const surface = new BABYLON.Mesh(`planeObject_${object.id}_surface`, this.scene);
        const positions = [];
        for (const point of section.vertices) positions.push(point.x, point.y, point.z);
        const indices = [];
        for (const face of section.faces) {
            for (let index = 1; index < face.length - 1; index++) indices.push(face[0], face[index], face[index + 1]);
        }
        if (positions.length && indices.length) {
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            const data = new BABYLON.VertexData();
            data.positions = positions;
            data.indices = indices;
            data.normals = Array.from(normals);
            data.applyToMesh(surface, true);
        }
        const material = new BABYLON.StandardMaterial(`planeObjectMaterial_${object.id}`, this.scene);
        material.diffuseColor = BABYLON.Color3.FromHexString(object.material?.color ?? DEFAULT_COLORS.hypercube4d);
        material.emissiveColor = material.diffuseColor.scale(0.48);
        material.alpha = 0.24;
        material.backFaceCulling = false;
        surface.material = material;
        surface.isPickable = true;
        surface.metadata = { planeObject: true, planeId: record.planeId, planeObjectId: object.id, planeObjectType: object.type };
        const edgeLines = section.edges.map(([a, b]) => [
            new BABYLON.Vector3(...vector3Array(section.vertices[a])),
            new BABYLON.Vector3(...vector3Array(section.vertices[b]))
        ]);
        const edges = BABYLON.MeshBuilder.CreateLineSystem(`planeObject_${object.id}_edges`, { lines: edgeLines }, this.scene);
        edges.color = BABYLON.Color3.FromHexString(object.material?.color ?? DEFAULT_COLORS.hypercube4d);
        edges.isPickable = false;
        edges.metadata = { planeObject: true, planeId: record.planeId, sliceId: record.planeId, planeObjectId: object.id, planeObjectType: object.type };
        const hit = BABYLON.MeshBuilder.CreateBox(`planeObject_${object.id}_hit`, { size: 1 }, this.scene);
        const hitMaterial = new BABYLON.StandardMaterial(`planeObject_${object.id}_hitMaterial`, this.scene);
        hitMaterial.alpha = 0.001;
        hitMaterial.disableLighting = true;
        hit.material = hitMaterial;
        hit.isPickable = true;
        hit.metadata = { planeObject: true, planeId: record.planeId, sliceId: record.planeId, planeObjectId: object.id, planeObjectType: object.type };
        record.meshes = [surface, edges, hit];
        record.material = material;
        record.hitMaterial = hitMaterial;
        record.section = section;
    }

    updateRecord(record) {
        if (!record || !record.meshes.length) return;
        record.context = this.resolveContext(record.planeId, record.context?.geometry);
        const { transform, layerMask } = record.context;
        const object = record.object;
        if (object.type === 'hypercube4d') {
            const color = object.material?.color ?? DEFAULT_COLORS.hypercube4d;
            record.material.diffuseColor = BABYLON.Color3.FromHexString(color);
            record.material.emissiveColor = record.material.diffuseColor.scale(0.9);
            this.updateHypercubeRecord(record);
            return;
        }
        const mesh = record.meshes[0];
        const color = object.material?.color ?? DEFAULT_COLORS[object.type] ?? '#c5d5e2';
        if (record.material) {
            record.material.diffuseColor = BABYLON.Color3.FromHexString(color);
            record.material.emissiveColor = record.material.diffuseColor.scale(object.type === 'label' ? 0.0 : 0.28);
        }
        if (object.type === 'label') {
            this.updateLabelRecord(record);
            return;
        }
        const position = object.position;
        const dimensions = object.dimensions;
        const rotation = object.rotation ?? { x: 0, y: 0, z: 0 };
        const rotationMatrix = BABYLON.Quaternion.FromEulerAngles(
            degreesToRadians(rotation.x), degreesToRadians(rotation.y), degreesToRadians(rotation.z)
        ).toRotationMatrix(BABYLON.Matrix.Identity());
        const anchor = projectPlaneLocalPosition(transform, position);
        const visualScale = getPlaneVisualScale(transform, position);
        const projected = new Float32Array(record.basePositions.length);
        for (let index = 0; index < record.basePositions.length; index += 3) {
            const local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(
                record.basePositions[index] * dimensions.x,
                record.basePositions[index + 1] * dimensions.y,
                record.basePositions[index + 2] * dimensions.z
            ), rotationMatrix);
            const localPosition = { x: position.x + local.x, y: position.y + local.y, z: position.z + local.z };
            const point = projectPlaneLocalPosition(transform, localPosition);
            projected[index] = anchor.x + (point.x - anchor.x) * visualScale;
            projected[index + 1] = anchor.y + (point.y - anchor.y) * visualScale;
            projected[index + 2] = anchor.z + (point.z - anchor.z) * visualScale;
        }
        mesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, projected, true, 3);
        if (record.indices.length) {
            const normals = new Float32Array(projected.length);
            BABYLON.VertexData.ComputeNormals(projected, record.indices, normals);
            mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true, 3);
        }
        mesh.position.setAll(0);
        mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        mesh.scaling.setAll(1);
        mesh.layerMask = layerMask;
        mesh.refreshBoundingInfo();
        this.updateRecordVisibility(record);
    }

    updateLabelRecord(record) {
        const object = record.object;
        const mesh = record.meshes[0];
        const transform = record.context.transform;
        const render = projectPlaneLocalPosition(transform, object.position);
        const visualScale = getPlaneVisualScale(transform, object.position);
        const width = object.parameters?.width ?? 8;
        const dimensions = object.dimensions;
        mesh.position.set(render.x, render.y, render.z);
        mesh.scaling.set(
            width * dimensions.x * visualScale,
            width * 0.16 * dimensions.y * visualScale,
            Math.max(0.01, dimensions.z * visualScale)
        );
        if (object.parameters?.billboard !== false) {
            mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            mesh.rotationQuaternion = null;
        } else {
            mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_NONE ?? 0;
            const localRotation = BABYLON.Quaternion.FromEulerAngles(
                degreesToRadians(object.rotation?.x ?? 0),
                degreesToRadians(object.rotation?.y ?? 0),
                degreesToRadians(object.rotation?.z ?? 0)
            );
            mesh.rotationQuaternion = getRenderTangentFrame(transform, object.position).rotation.multiply(localRotation);
        }
        if (record.material?.diffuseTexture?.drawText) {
            record.material.diffuseTexture.clear();
            record.material.diffuseTexture.drawText(String(object.text ?? object.name), null, null, 'bold 46px Arial', '#ffffff', 'rgba(7, 15, 28, 0.88)', true);
        }
        mesh.layerMask = record.context.layerMask;
        mesh.refreshBoundingInfo();
        this.updateRecordVisibility(record);
    }

    setViewerW(value, planeId = this.editorPlaneId) {
        const next = value == null ? NaN : Number(value);
        const normalized = Number.isFinite(next) ? next : null;
        if (planeId) {
            if (normalized == null) this.viewerWByPlane.delete(planeId);
            else this.viewerWByPlane.set(planeId, normalized);
            for (const record of this.records.values()) {
                if (record.planeId === planeId && record.object?.type === 'hypercube4d') this.updateRecord(record);
            }
            return normalized;
        }
        this.viewerW = normalized;
        for (const record of this.records.values()) {
            if (record.object?.type === 'hypercube4d') this.updateRecord(record);
        }
        return this.viewerW;
    }

    updateHypercubeRecord(record) {
        const object = record.object;
        const transform = record.context.transform;
        const params = object.parameters ?? {};
        const halfExtent = params.halfExtent ?? Math.max(0.1, object.dimensions?.x / 2 ?? 4.2);
        const angles = params.initialAngles ?? { xw: 0.42, yw: 0.36, zw: 0.32 };
        const viewerW = this.getViewerWForPlane(record.planeId, params.viewerW);
        const section = createHypercubeSlice(createHypercubeVertices(halfExtent), angles, viewerW);
        const rotation = BABYLON.Quaternion.FromEulerAngles(
            degreesToRadians(object.rotation?.x ?? 0),
            degreesToRadians(object.rotation?.y ?? 0),
            degreesToRadians(object.rotation?.z ?? 0)
        );
        const rotationMatrix = rotation.toRotationMatrix(BABYLON.Matrix.Identity());
        const anchor = projectPlaneLocalPosition(transform, object.position);
        const visualScale = getPlaneVisualScale(transform, object.position);
        const transformPoint = point => {
            const local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(
                point.x * (object.dimensions.x / (2 * halfExtent)),
                point.y * (object.dimensions.y / (2 * halfExtent)),
                point.z * (object.dimensions.z / (2 * halfExtent))
            ), rotationMatrix);
            const localPosition = {
                x: object.position.x + local.x,
                y: object.position.y + local.y,
                z: object.position.z + local.z
            };
            const world = projectPlaneLocalPosition(transform, localPosition);
            return new BABYLON.Vector3(
                anchor.x + (world.x - anchor.x) * visualScale,
                anchor.y + (world.y - anchor.y) * visualScale,
                anchor.z + (world.z - anchor.z) * visualScale
            );
        };
        const points = section.vertices.map(transformPoint);
        const surface = record.meshes[0];
        if (points.length && section.faces.length) {
            const positions = points.flatMap(point => [point.x, point.y, point.z]);
            const indices = [];
            for (const face of section.faces) {
                for (let index = 1; index < face.length - 1; index++) indices.push(face[0], face[index], face[index + 1]);
            }
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            surface.setVerticesData(BABYLON.VertexBuffer.PositionKind, new Float32Array(positions), true, 3);
            surface.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, true, 3);
            surface.setIndices(indices);
        } else {
            surface.setVerticesData(BABYLON.VertexBuffer.PositionKind, new Float32Array(0), true, 3);
            surface.setIndices([]);
        }
        surface.refreshBoundingInfo();
        const edgeLines = section.edges.map(([a, b]) => [points[a], points[b]]);
        const oldEdges = record.meshes[1];
        oldEdges.dispose(false, false);
        const edges = BABYLON.MeshBuilder.CreateLineSystem(`planeObject_${object.id}_edges`, { lines: edgeLines }, this.scene);
        edges.color = BABYLON.Color3.FromHexString(object.material?.color ?? DEFAULT_COLORS.hypercube4d);
        edges.isPickable = false;
        edges.layerMask = record.context.layerMask;
        edges.metadata = { planeObject: true, planeId: record.planeId, sliceId: record.planeId, planeObjectId: object.id, planeObjectType: object.type };
        record.meshes[1] = edges;
        const hit = record.meshes[2];
        hit.position.copyFrom(anchor);
        hit.rotationQuaternion = rotation;
        hit.scaling.set(object.dimensions.x, object.dimensions.y, object.dimensions.z);
        hit.layerMask = record.context.layerMask;
        hit.refreshBoundingInfo();
        hit.isPickable = true;
        for (const mesh of [surface, edges, hit]) mesh.layerMask = record.context.layerMask;
        this.updateRecordVisibility(record);
    }

    updateRecordVisibility(record) {
        const objectVisible = record.object.visible !== false;
        const customRuntimePlane = record.context.world?.isUserDefinedPlane === true;
        const customPlaneIsCurrent = this.demoActive && this.geometryDemo?.currentSliceId === record.planeId;
        // In the Plane Editor, render every Plane whose 4D container
        // intersects the currently selected ambient-W slice. Outside the
        // editor, retain the established runtime/current-Plane visibility.
        const contextVisible = this.editorActive
            ? this.isPlaneInEditorWSlice(record.planeId)
            : customRuntimePlane ? customPlaneIsCurrent : record.context.runtimeWorld;
        // The original demo tesseract is rendered by the dedicated animated 4D
        // renderer. Additional user-authored hypercubes must remain visible.
        const duplicateTesseract = record.object.type === 'hypercube4d' &&
            record.object.id === 'demo-hypercube4d' && this.demoActive && !customRuntimePlane;
        const visible = objectVisible && contextVisible && !duplicateTesseract;
        for (const mesh of record.meshes) {
            mesh.metadata = {
                ...(mesh.metadata ?? {}),
                planeObject: true,
                planeId: record.planeId,
                sliceId: record.planeId,
                planeObjectPreviewEligible: objectVisible && !duplicateTesseract,
                planeObjectId: record.object.id,
                planeObjectType: record.object.type
            };
            mesh.isVisible = visible;
            mesh.isPickable = visible && (mesh.metadata?.planeObjectType !== 'hypercube4d' || mesh === record.meshes[0] || mesh === record.meshes[2]);
        }
        if (record.object.type === 'hypercube4d' && record.meshes[2]?.material) {
            record.meshes[2].material.alpha = this.editorActive && this.editorPlaneId === record.planeId && record.meshes[2].renderOutline ? 0.04 : 0.001;
        }
    }

    getRecord(planeId, objectId) { return this.records.get(recordKey(planeId, objectId)) ?? null; }

    getRenderPose(planeId, object) {
        const context = this.resolveContext(planeId);
        const transform = context.transform;
        const render = projectPlaneLocalPosition(transform, object.position);
        const localRotation = BABYLON.Quaternion.FromEulerAngles(
            degreesToRadians(object.rotation?.x ?? 0),
            degreesToRadians(object.rotation?.y ?? 0),
            degreesToRadians(object.rotation?.z ?? 0)
        );
        if (object.type === 'label') {
            const visualScale = getPlaneVisualScale(transform, object.position);
            const width = object.parameters?.width ?? 8;
            const frame = getRenderTangentFrame(transform, object.position);
            return {
                position: new BABYLON.Vector3(render.x, render.y, render.z),
                rotation: frame.rotation.multiply(localRotation),
                scale: new BABYLON.Vector3(
                    width * object.dimensions.x * visualScale,
                    width * 0.16 * object.dimensions.y * visualScale,
                    Math.max(0.01, object.dimensions.z * visualScale)
                )
            };
        }
        const frame = getRenderTangentFrame(transform, object.position);
        const localRotationMatrix = localRotation.toRotationMatrix(BABYLON.Matrix.Identity());
        const factors = getObjectRenderScaleFactors(frame.jacobian, localRotationMatrix, getPlaneVisualScale(transform, object.position));
        return {
            position: new BABYLON.Vector3(render.x, render.y, render.z),
            rotation: frame.rotation.multiply(localRotation),
            scale: new BABYLON.Vector3(
                object.dimensions.x * factors.x,
                object.dimensions.y * factors.y,
                object.dimensions.z * factors.z
            )
        };
    }

    renderRotationToLocal(planeId, object, renderRotation) {
        const frame = getRenderTangentFrame(this.resolveContext(planeId).transform, object.position);
        const inverseFrame = frame.rotation.clone();
        inverseFrame.invert();
        return inverseFrame.multiply(renderRotation).normalize();
    }

    renderScaleToLocal(planeId, object, renderScale) {
        const transform = this.resolveContext(planeId).transform;
        let factors;
        if (object.type === 'label') {
            const visualScale = getPlaneVisualScale(transform, object.position);
            const width = object.parameters?.width ?? 8;
            factors = { x: width * visualScale, y: width * 0.16 * visualScale, z: visualScale };
        } else {
            const frame = getRenderTangentFrame(transform, object.position);
            const rotation = BABYLON.Quaternion.FromEulerAngles(
                degreesToRadians(object.rotation?.x ?? 0),
                degreesToRadians(object.rotation?.y ?? 0),
                degreesToRadians(object.rotation?.z ?? 0)
            ).toRotationMatrix(BABYLON.Matrix.Identity());
            factors = getObjectRenderScaleFactors(frame.jacobian, rotation, getPlaneVisualScale(transform, object.position));
        }
        return {
            x: Math.max(0.01, renderScale.x / Math.max(1e-6, factors.x)),
            y: Math.max(0.01, renderScale.y / Math.max(1e-6, factors.y)),
            z: Math.max(0.01, renderScale.z / Math.max(1e-6, factors.z))
        };
    }

    setSelected(planeId, objectId) {
        for (const record of this.records.values()) {
            const selected = record.planeId === planeId && record.object.id === objectId;
            for (const mesh of record.meshes) {
                if (mesh.metadata?.planeObjectType === 'hypercube4d') continue;
                mesh.renderOutline = selected;
                mesh.outlineColor = BABYLON.Color3.FromHexString('#f3d36b');
                mesh.outlineWidth = 0.06;
            }
            if (record.object.type === 'hypercube4d') {
                const hit = record.meshes[2];
                if (hit) hit.renderOutline = selected;
                if (hit?.material) hit.material.alpha = selected ? 0.04 : 0.001;
                this.updateRecordVisibility(record);
            }
        }
    }

    disposeRecord(record) {
        if (!record) return;
        for (const mesh of record.meshes ?? []) mesh.dispose(false, false);
        record.meshes = [];
        record.material?.dispose?.(false, true);
        record.hitMaterial?.dispose?.(false, true);
    }

    dispose() {
        for (const record of this.records.values()) this.disposeRecord(record);
        this.records.clear();
        this.planeDefinitions.clear();
        this.customTransforms.clear();
    }
}

/**
 * Maps coordinates in a Plane's saved local XYZ frame into its runtime chart.
 * The W component remains part of the runtime WorldSlice frame; this renderer
 * projects each active 3D cross-section into Babylon's scene.
 */
function createPlaneFrameTransform(chartTransform, frame) {
    const origin = {
        x: Number.isFinite(frame?.origin?.x) ? frame.origin.x : 0,
        y: Number.isFinite(frame?.origin?.y) ? frame.origin.y : 0,
        z: Number.isFinite(frame?.origin?.z) ? frame.origin.z : 0
    };
    const axes = Array.isArray(frame?.axes) && frame.axes.length >= 3 ? frame.axes : [
        { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }
    ];
    const basis = [
        axes[0].x ?? 0, axes[1].x ?? 0, axes[2].x ?? 0,
        axes[0].y ?? 0, axes[1].y ?? 0, axes[2].y ?? 0,
        axes[0].z ?? 0, axes[1].z ?? 0, axes[2].z ?? 0
    ];
    const inverse = invertMatrix3(basis);
    const supported = Boolean(inverse);
    const safeBasis = supported ? basis : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const safeInverse = supported ? inverse : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const toAmbient = position => {
        const offset = multiplyMatrix3Vector(safeBasis, position);
        return { x: origin.x + offset.x, y: origin.y + offset.y, z: origin.z + offset.z };
    };
    const fromAmbient = position => multiplyMatrix3Vector(safeInverse, {
        x: position.x - origin.x, y: position.y - origin.y, z: position.z - origin.z
    });
    return {
        supported,
        transform: {
            geometryName: chartTransform.geometryName,
            worldToRender(position) { return chartTransform.worldToRender(toAmbient(position)); },
            renderToWorld(position) { return fromAmbient(chartTransform.renderToWorld(position)); },
            constrainRenderPosition(position, options) {
                return chartTransform.constrainRenderPosition?.(position, options) ?? { ...position };
            },
            getVisualScale(position, options) { return chartTransform.getVisualScale?.(toAmbient(position), options) ?? 1; },
            constrainWorldPosition(position, options) {
                if (typeof chartTransform.constrainWorldPosition !== 'function') return { ...position };
                return fromAmbient(chartTransform.constrainWorldPosition(toAmbient(position), options));
            },
            getJacobian(position, options) {
                const ambient = toAmbient(position);
                const chartJacobian = chartTransform.getJacobian?.(ambient, options);
                if (!Array.isArray(chartJacobian) || chartJacobian.length !== 9) return safeBasis.slice();
                return multiplyMatrix3(chartJacobian, safeBasis);
            },
            containsMetricDomainPosition(position, options) {
                return chartTransform.containsMetricDomainPosition?.(toAmbient(position), options) ?? true;
            },
            getInfo() {
                const info = chartTransform.getInfo?.() ?? {};
                return { ...info, geometry: chartTransform.geometryName, planeFrame: { origin: { ...origin }, axes: axes.map(axis => ({ ...axis })) }, frameProjectionSupported: supported };
            }
        }
    };
}

function multiplyMatrix3Vector(matrix, vector) {
    return {
        x: matrix[0] * vector.x + matrix[1] * vector.y + matrix[2] * vector.z,
        y: matrix[3] * vector.x + matrix[4] * vector.y + matrix[5] * vector.z,
        z: matrix[6] * vector.x + matrix[7] * vector.y + matrix[8] * vector.z
    };
}

function multiplyMatrix3(left, right) {
    const result = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
        for (let k = 0; k < 3; k++) result[row * 3 + column] += left[row * 3 + k] * right[k * 3 + column];
    }
    return result;
}

function invertMatrix3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return null;
    const scale = 1 / determinant;
    return [
        (e * i - f * h) * scale, (c * h - b * i) * scale, (b * f - c * e) * scale,
        (f * g - d * i) * scale, (a * i - c * g) * scale, (c * d - a * f) * scale,
        (d * h - e * g) * scale, (b * g - a * h) * scale, (a * e - b * d) * scale
    ];
}

function getRenderTangentFrame(transform, position) {
    let jacobian = null;
    try { jacobian = transform.getJacobian?.(position) ?? null; } catch {}
    if (!Array.isArray(jacobian) || jacobian.length !== 9 || !jacobian.every(Number.isFinite)) {
        jacobian = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    const apply = vector => ({
        x: jacobian[0] * vector.x + jacobian[1] * vector.y + jacobian[2] * vector.z,
        y: jacobian[3] * vector.x + jacobian[4] * vector.y + jacobian[5] * vector.z,
        z: jacobian[6] * vector.x + jacobian[7] * vector.y + jacobian[8] * vector.z
    });
    const rawX = apply({ x: 1, y: 0, z: 0 });
    const rawY = apply({ x: 0, y: 1, z: 0 });
    const rawZ = apply({ x: 0, y: 0, z: 1 });
    const x = normalizeVector(rawX, { x: 1, y: 0, z: 0 });
    const yProjected = subtractVector(rawY, scaleVector(x, dotVector(rawY, x)));
    const y = normalizeVector(yProjected, orthogonalFallback(x));
    let z = normalizeVector(crossVector(x, y), { x: 0, y: 0, z: 1 });
    if (dotVector(z, rawZ) < 0) z = scaleVector(z, -1);
    // Recompute Y to keep a right-handed orthonormal basis for the quaternion.
    const yOrthonormal = normalizeVector(crossVector(z, x), y);
    const matrix = BABYLON.Matrix.Identity();
    BABYLON.Matrix.FromXYZAxesToRef(
        new BABYLON.Vector3(x.x, x.y, x.z),
        new BABYLON.Vector3(yOrthonormal.x, yOrthonormal.y, yOrthonormal.z),
        new BABYLON.Vector3(z.x, z.y, z.z),
        matrix
    );
    return { jacobian, rotation: BABYLON.Quaternion.FromRotationMatrix(matrix) };
}

function getObjectRenderScaleFactors(jacobian, rotationMatrix, visualScale = 1) {
    const apply = vector => ({
        x: jacobian[0] * vector.x + jacobian[1] * vector.y + jacobian[2] * vector.z,
        y: jacobian[3] * vector.x + jacobian[4] * vector.y + jacobian[5] * vector.z,
        z: jacobian[6] * vector.x + jacobian[7] * vector.y + jacobian[8] * vector.z
    });
    const axis = (x, y, z) => BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(x, y, z), rotationMatrix);
    const magnitude = vector => Math.max(1e-6, Math.hypot(vector.x, vector.y, vector.z) * visualScale);
    return {
        x: magnitude(apply(axis(1, 0, 0))),
        y: magnitude(apply(axis(0, 1, 0))),
        z: magnitude(apply(axis(0, 0, 1)))
    };
}

function dotVector(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function crossVector(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
function subtractVector(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scaleVector(a, factor) { return { x: a.x * factor, y: a.y * factor, z: a.z * factor }; }
function normalizeVector(vector, fallback) {
    const length = Math.hypot(vector.x, vector.y, vector.z);
    return Number.isFinite(length) && length > 1e-9
        ? { x: vector.x / length, y: vector.y / length, z: vector.z / length }
        : { ...fallback };
}
function orthogonalFallback(axis) {
    const seed = Math.abs(axis.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    return normalizeVector(subtractVector(seed, scaleVector(axis, dotVector(seed, axis))), { x: 0, y: 1, z: 0 });
}

function projectPlaneLocalPosition(transform, position) {
    assertPosition3(position);
    const point = { x: position.x, y: position.y, z: position.z };
    let render;
    try {
        render = transform.worldToRender(point);
    } catch (error) {
        // The Plane boundary guide and editable object extents can legitimately
        // reach beyond a finite Poincare chart. Keep strict projection semantics
        // globally, but clamp this presentation-only point to the open chart.
        if (!(error instanceof RangeError) || typeof transform.constrainWorldPosition !== 'function') throw error;
        const constrained = transform.constrainWorldPosition(point, { boundaryMargin: 1e-5 });
        render = transform.worldToRender(constrained);
    }
    assertPosition3(render, 'render position');
    return { x: render.x, y: render.y, z: render.z };
}

function getPlaneVisualScale(transform, position) {
    try { return transform.getVisualScale?.(position) ?? 1; }
    catch (error) {
        if (!(error instanceof RangeError) || typeof transform.constrainWorldPosition !== 'function') throw error;
        const constrained = transform.constrainWorldPosition(position, { boundaryMargin: 1e-5 });
        return transform.getVisualScale?.(constrained) ?? 1;
    }
}

function unprojectPlaneRenderPosition(transform, position) {
    assertPosition3(position, 'render position');
    const local = transform.renderToWorld({ x: position.x, y: position.y, z: position.z });
    assertPosition3(local, 'Plane-local position');
    return { x: local.x, y: local.y, z: local.z };
}

function assertPosition3(position, label = 'Plane-local position') {
    if (!position || !['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) {
        throw new TypeError(`${label} must contain finite XYZ coordinates.`);
    }
}

function recordKey(planeId, objectId) { return `${planeId}::${objectId}`; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function degreesToRadians(value) { return value * Math.PI / 180; }
function vector3Array(point) { return [point.x, point.y, point.z]; }

export {
    PlaneObjectRenderer,
    projectPlaneLocalPosition,
    unprojectPlaneRenderPosition,
    createPlaneFrameTransform,
    DEFAULT_COLORS as PLANE_OBJECT_DEFAULT_COLORS
};
