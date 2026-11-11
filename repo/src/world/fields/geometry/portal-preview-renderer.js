/** Owns an isolated render-target view of one remote slice. */

class PortalPreviewRenderer {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.namePrefix = options.namePrefix ?? 'geometryPortalPreview';
        this.visible = false;
        this.ownedMeshes = [];
        this.apertureShape = options.apertureShape ?? 'plane';
        this.previewSurface = options.previewSurface ?? 'flat';
        if (!['flat', 'spherical'].includes(this.previewSurface)) {
            throw new RangeError(`Unsupported portal preview surface: ${this.previewSurface}`);
        }
        if (this.previewSurface === 'spherical' &&
            !['circle', 'ellipse'].includes(this.apertureShape)) {
            throw new RangeError('Spherical portal previews require a circular or elliptical aperture.');
        }
        this.apertureScale = 1;
        this.maxApertureScale = options.maxApertureScale ?? 4;
        if (!Number.isFinite(this.maxApertureScale) || this.maxApertureScale < 1 || this.maxApertureScale > 16) {
            throw new RangeError('Portal maximum aperture scale must be finite and between 1 and 16.');
        }
        this.baseWidth = options.width ?? 4.6;
        this.baseHeight = options.height ?? 5.4;
        this.camera = this.createCamera(options.camera ?? {});
        this.texture = this.createRenderTarget(options.resolution ?? 512, this.baseWidth / this.baseHeight);
        this.previewVisibilityRestore = new Map();
        this.previewBeforeRenderObserver = this.texture.onBeforeRenderObservable?.add?.(() => this.preparePreviewMeshes()) ?? null;
        this.previewAfterRenderObserver = this.texture.onAfterRenderObservable?.add?.(() => this.restorePreviewMeshes()) ?? null;
        this.surface = this.createSurface(
            options.position ?? { x: 0, y: 2.5, z: 14.2 }, this.baseWidth, this.baseHeight
        );
        this.material = this.createMaterial();
        this.surface.material = this.material;
        this.surface.isPickable = false;
        this.surface.metadata = { ...(this.surface.metadata || {}), geometryPortal: true, renderOnly: true };
        this.setVisible(false);
    }

    createCamera(options) {
        const camera = new BABYLON.FreeCamera(
            `${this.namePrefix}Camera`,
            new BABYLON.Vector3(options.x ?? 0, options.y ?? 34, options.z ?? -58),
            this.scene
        );
        camera.setTarget(new BABYLON.Vector3(options.targetX ?? 0, options.targetY ?? 0, options.targetZ ?? 0));
        camera.minZ = 0.1;
        camera.maxZ = options.maxZ ?? 100000;
        camera.fov = options.fov ?? 0.95;
        camera.inputs.clear();
        camera.layerMask = options.layerMask ?? 0x20000000;
        return camera;
    }

    createRenderTarget(resolution, aspectRatio = 1) {
        const size = normalizeRenderTargetSize(resolution, aspectRatio);
        const target = new BABYLON.RenderTargetTexture(
            `${this.namePrefix}RenderTarget`,
            size,
            this.scene,
            false,
            true
        );
        target.activeCamera = this.camera;
        target.renderList = [];
        // Portal previews are part of the live view, not a periodic postcard.
        target.refreshRate = 1;
        target.gammaSpace = true;
        target.clearColor = new BABYLON.Color4(0.025, 0.04, 0.09, 1);
        return target;
    }

    createSurface(position, width, height) {
        let surface;
        if (this.apertureShape === 'circle' || this.apertureShape === 'ellipse') {
            if (this.previewSurface === 'spherical') {
                // A complete closed sphere replaces the old spherical-cap
                // approximation. Project the live destination frame onto its
                // front hemisphere, while retaining both hemispheres in the
                // actual geometry so the opening has genuine 3D volume.
                surface = BABYLON.MeshBuilder.CreateSphere(
                    `${this.namePrefix}Surface`,
                    { diameter: 2, segments: 64, sideOrientation: BABYLON.Mesh.DOUBLESIDE, updatable: true },
                    this.scene
                );
                applySphericalProjectionUvs(surface);
                surface.scaling.set(width * 0.5, height * 0.5, Math.min(width, height) * 0.5);
                surface.metadata = {
                    ...(surface.metadata || {}),
                    portalSphere: true,
                    portalSphereProjection: 'front-orthographic'
                };
            } else {
                surface = BABYLON.MeshBuilder.CreateDisc(
                    `${this.namePrefix}Surface`,
                    { radius: 1, tessellation: 96, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                    this.scene
                );
                surface.scaling.set(width * 0.5, height * 0.5, 1);
            }
        } else {
            surface = BABYLON.MeshBuilder.CreatePlane(
                `${this.namePrefix}Surface`,
                { width, height, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                this.scene
            );
        }
        surface.position.set(position.x, position.y, position.z);
        return surface;
    }

    createMaterial() {
        const material = new BABYLON.StandardMaterial(`${this.namePrefix}Material`, this.scene);
        material.diffuseTexture = this.texture;
        material.emissiveTexture = this.texture;
        material.emissiveColor = BABYLON.Color3.White();
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.fogEnabled = false;
        material.specularColor = BABYLON.Color3.Black();
        return material;
    }

    setHomePose() {
        this.homePose = capturePose(this.surface, this.rim);
        this.baseSurfaceScaling = cloneVector(this.surface.scaling);
        this.baseRimScaling = this.rim ? cloneVector(this.rim.scaling) : null;
    }

    setCameraPose(position, target, up = { x: 0, y: 1, z: 0 }, fov = null) {
        if (!position || !target || !up) throw new TypeError('Portal camera pose is incomplete.');
        this.camera.position.set(position.x, position.y, position.z);
        this.camera.upVector.set(up.x, up.y, up.z);
        this.camera.setTarget(new BABYLON.Vector3(target.x, target.y, target.z));
        if (Number.isFinite(fov) && fov > 0 && fov < Math.PI) this.camera.fov = fov;
        this.lastCameraPose = {
            position: cloneVector(position), target: cloneVector(target), up: cloneVector(up)
        };
    }

    setApertureScale(scale) {
        if (!Number.isFinite(scale)) throw new TypeError('Aperture scale must be finite.');
        this.apertureScale = Math.max(0, Math.min(this.maxApertureScale, scale));
        if (this.baseSurfaceScaling) {
            this.surface.scaling.set(
                this.baseSurfaceScaling.x * this.apertureScale,
                this.baseSurfaceScaling.y * this.apertureScale,
                this.baseSurfaceScaling.z * (this.previewSurface === 'spherical' ? this.apertureScale : 1)
            );
        }
        if (this.rim && this.baseRimScaling) {
            this.rim.scaling.set(
                this.baseRimScaling.x * this.apertureScale,
                this.baseRimScaling.y * this.apertureScale,
                this.baseRimScaling.z
            );
        }
        this.surface.isVisible = this.visible && this.apertureScale > 1e-3;
        if (this.rim) this.rim.isVisible = this.visible && this.apertureScale > 1e-3;
        this.syncRenderTargetVisibility();
    }

    syncRenderTargetVisibility() {
        const shouldRender = this.visible && this.apertureScale > 1e-3;
        const targets = this.scene.customRenderTargets;
        const index = targets.indexOf(this.texture);
        if (shouldRender && index < 0) targets.push(this.texture);
        if (!shouldRender && index >= 0) targets.splice(index, 1);
    }

    setPose(position, direction = { x: 0, y: 0, z: 1 }) {
        const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
        const normal = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
        const pitch = -Math.asin(Math.max(-1, Math.min(1, normal.y)));
        const yaw = Math.atan2(normal.x, normal.z);
        this.surface.rotationQuaternion = null;
        this.surface.position.set(position.x, position.y, position.z);
        this.surface.rotation.set(pitch, yaw, 0);
        if (this.rim) {
            this.rim.rotationQuaternion = null;
            this.rim.position.set(
                position.x - normal.x * 0.035,
                position.y - normal.y * 0.035,
                position.z - normal.z * 0.035
            );
            this.rim.rotation.set(pitch, yaw, 0);
        }
    }

    resetPose() {
        if (this.homePose) restorePose(this, this.homePose);
    }

    setRenderList(meshes) {
        const renderList = meshes.filter(isRenderableMesh);
        if (sameMeshes(renderList, this.ownedMeshes)) return;
        this.ownedMeshes = renderList;
        this.texture.renderList = renderList;
    }

    /** Reveal only context-hidden Plane objects for this isolated render pass. */
    preparePreviewMeshes() {
        this.restorePreviewMeshes();
        for (const mesh of this.ownedMeshes) {
            if (!mesh || mesh.isDisposed?.() || mesh.isEnabled?.() === false || mesh.isVisible !== false) continue;
            if (mesh.metadata?.planeObjectPreviewEligible !== true) continue;
            this.previewVisibilityRestore.set(mesh, false);
            mesh.isVisible = true;
        }
    }

    /** Restore the main-scene visibility state immediately after the render pass. */
    restorePreviewMeshes() {
        for (const [mesh, previousVisibility] of this.previewVisibilityRestore) {
            if (!mesh || mesh.isDisposed?.()) continue;
            mesh.isVisible = previousVisibility;
        }
        this.previewVisibilityRestore.clear();
    }

    setVisible(visible) {
        this.visible = Boolean(visible);
        this.surface.isVisible = this.visible && this.apertureScale > 1e-3;
        if (this.rim) this.rim.isVisible = this.visible && this.apertureScale > 1e-3;
        this.syncRenderTargetVisibility();
    }

    getInfo() {
        return {
            visible: this.visible,
            renderOnly: true,
            renderListSize: this.ownedMeshes.length,
            apertureShape: this.apertureShape,
            previewSurface: this.previewSurface,
            previewGeometry: this.previewSurface === 'spherical' ? 'closed-sphere' : 'flat-disc',
            apertureScale: this.apertureScale,
            cameraPose: this.lastCameraPose ?? null,
            resolution: this.texture.getSize()
        };
    }

    dispose() {
        this.setVisible(false);
        this.restorePreviewMeshes();
        if (this.previewBeforeRenderObserver) this.texture.onBeforeRenderObservable?.remove?.(this.previewBeforeRenderObserver);
        if (this.previewAfterRenderObserver) this.texture.onAfterRenderObservable?.remove?.(this.previewAfterRenderObserver);
        this.rim?.dispose(false, false);
        this.surface.dispose(false, false);
        this.material.dispose(false, true);
        this.texture.dispose();
        this.camera.dispose();
        this.ownedMeshes = [];
    }
}


/**
 * Projects the live 2D portal frame onto a complete sphere using local XY
 * coordinates. This keeps the destination image camera-like on the visible
 * hemisphere instead of wrapping the image as an equirectangular planet map.
 * The sphere itself remains a closed 3D surface on both hemispheres.
 */
function applySphericalProjectionUvs(surface) {
    if (!surface || typeof BABYLON === 'undefined' ||
        typeof surface.getVerticesData !== 'function' ||
        typeof surface.updateVerticesData !== 'function') {
        throw new TypeError('Spherical portal projection requires an updatable Babylon sphere mesh.');
    }
    const positionKind = BABYLON.VertexBuffer.PositionKind;
    const uvKind = BABYLON.VertexBuffer.UVKind;
    const positions = surface.getVerticesData(positionKind);
    const uvs = surface.getVerticesData(uvKind);
    if (!positions?.length || !uvs?.length || positions.length % 3 !== 0 ||
        uvs.length !== positions.length / 3 * 2) {
        throw new TypeError('Spherical portal mesh is missing compatible position/UV geometry.');
    }
    for (let vertex = 0, uv = 0; vertex < positions.length; vertex += 3, uv += 2) {
        uvs[uv] = clamp01(0.5 + positions[vertex] * 0.5);
        uvs[uv + 1] = clamp01(0.5 - positions[vertex + 1] * 0.5);
    }
    surface.updateVerticesData(uvKind, uvs, true);
    return { uvs };
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

/**
 * Curves a unit disc into a concave spherical cap without changing its UVs.
 * The render-target image therefore remains a normal camera projection while
 * the physical preview surface recedes toward the centre of the opening.
 */
function applySphericalCapGeometry(surface, sagittaRatio = 0.38) {
    if (!surface || typeof BABYLON === 'undefined' ||
        typeof surface.getVerticesData !== 'function' ||
        typeof surface.getIndices !== 'function' ||
        typeof surface.updateVerticesData !== 'function') {
        throw new TypeError('Spherical portal surface requires an updatable Babylon disc mesh.');
    }
    if (!Number.isFinite(sagittaRatio) || sagittaRatio <= 0 || sagittaRatio >= 1) {
        throw new RangeError('Spherical portal sagitta ratio must be between 0 and 1.');
    }
    const positionKind = BABYLON.VertexBuffer.PositionKind;
    const normalKind = BABYLON.VertexBuffer.NormalKind;
    const positions = surface.getVerticesData(positionKind);
    const indices = surface.getIndices();
    if (!positions?.length || !indices?.length || positions.length % 3 !== 0) {
        throw new TypeError('Spherical portal disc is missing indexed position geometry.');
    }
    const sagitta = sagittaRatio;
    const sphereRadius = (1 + sagitta * sagitta) / (2 * sagitta);
    for (let index = 0; index < positions.length; index += 3) {
        const x = positions[index];
        const y = positions[index + 1];
        const radialSquared = Math.min(1, x * x + y * y);
        const sphereRoot = Math.sqrt(Math.max(0, sphereRadius * sphereRadius - radialSquared));
        // Rim lies at z=0; the centre recedes by `sagitta` away from the
        // observer, producing a concave bowl rather than a convex dome.
        positions[index + 2] = sphereRadius - sagitta - sphereRoot;
    }
    const normals = new Float32Array(positions.length);
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    surface.updateVerticesData(positionKind, positions, true);
    surface.updateVerticesData(normalKind, normals, true);
    surface.refreshBoundingInfo?.();
    return { positions, normals, sagittaRatio };
}

function normalizeRenderTargetSize(resolution, aspectRatio) {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
        throw new RangeError('Portal aspect ratio must be positive and finite.');
    }
    if (typeof resolution === 'number') {
        if (!Number.isSafeInteger(resolution) || resolution < 16) {
            throw new RangeError('Portal render resolution must be an integer of at least 16 pixels.');
        }
        return {
            width: resolution,
            height: Math.max(16, Math.round(resolution / aspectRatio))
        };
    }
    if (!resolution || !Number.isSafeInteger(resolution.width) ||
        !Number.isSafeInteger(resolution.height) || resolution.width < 16 || resolution.height < 16) {
        throw new RangeError('Portal render resolution requires integer width and height of at least 16 pixels.');
    }
    return { width: resolution.width, height: resolution.height };
}

function isRenderableMesh(mesh) {
    return Boolean(mesh && !mesh.isDisposed());
}

function capturePose(surface, rim) {
    return {
        surfacePosition: cloneVector(surface.position),
        surfaceRotation: cloneVector(surface.rotation),
        surfaceRotationQuaternion: surface.rotationQuaternion ? cloneQuaternion(surface.rotationQuaternion) : null,
        rimPosition: rim ? cloneVector(rim.position) : null,
        rimRotation: rim ? cloneVector(rim.rotation) : null,
        rimRotationQuaternion: rim?.rotationQuaternion ? cloneQuaternion(rim.rotationQuaternion) : null
    };
}

function restorePose(renderer, pose) {
    renderer.surface.position.set(pose.surfacePosition.x, pose.surfacePosition.y, pose.surfacePosition.z);
    renderer.surface.rotation.set(pose.surfaceRotation.x, pose.surfaceRotation.y, pose.surfaceRotation.z);
    renderer.surface.rotationQuaternion = pose.surfaceRotationQuaternion
        ? new BABYLON.Quaternion(pose.surfaceRotationQuaternion.x, pose.surfaceRotationQuaternion.y, pose.surfaceRotationQuaternion.z, pose.surfaceRotationQuaternion.w)
        : null;
    if (renderer.rim && pose.rimPosition) {
        renderer.rim.position.set(pose.rimPosition.x, pose.rimPosition.y, pose.rimPosition.z);
        renderer.rim.rotation.set(pose.rimRotation.x, pose.rimRotation.y, pose.rimRotation.z);
        renderer.rim.rotationQuaternion = pose.rimRotationQuaternion
            ? new BABYLON.Quaternion(pose.rimRotationQuaternion.x, pose.rimRotationQuaternion.y, pose.rimRotationQuaternion.z, pose.rimRotationQuaternion.w)
            : null;
    }
}

function cloneVector(value) {
    return { x: value.x, y: value.y, z: value.z };
}

function cloneQuaternion(value) {
    return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function sameMeshes(left, right) {
    return left.length === right.length && left.every(function sameMesh(mesh, index) {
        return mesh === right[index];
    });
}

export { PortalPreviewRenderer, applySphericalCapGeometry, applySphericalProjectionUvs };
