/** Owns an isolated render-target view of one remote slice. */

class PortalPreviewRenderer {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.visible = false;
        this.ownedMeshes = [];
        this.apertureShape = options.apertureShape ?? 'plane';
        this.apertureScale = 1;
        this.baseWidth = options.width ?? 4.6;
        this.baseHeight = options.height ?? 5.4;
        this.camera = this.createCamera(options.camera ?? {});
        this.texture = this.createRenderTarget(options.resolution ?? 512, this.baseWidth / this.baseHeight);
        this.surface = this.createSurface(
            options.position ?? { x: 0, y: 2.5, z: 14.2 }, this.baseWidth, this.baseHeight
        );
        this.material = this.createMaterial();
        this.surface.material = this.material;
        this.surface.isPickable = false;
        this.surface.metadata = { geometryPortal: true, renderOnly: true };
        this.setVisible(false);
    }

    createCamera(options) {
        const camera = new BABYLON.FreeCamera(
            'geometryPortalPreviewCamera',
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
            'geometryPortalRenderTarget',
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
            surface = BABYLON.MeshBuilder.CreateDisc(
                'geometryPortalSurface',
                { radius: 1, tessellation: 96, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                this.scene
            );
            surface.scaling.set(width * 0.5, height * 0.5, 1);
        } else {
            surface = BABYLON.MeshBuilder.CreatePlane(
                'geometryPortalSurface',
                { width, height, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
                this.scene
            );
        }
        surface.position.set(position.x, position.y, position.z);
        return surface;
    }

    createMaterial() {
        const material = new BABYLON.StandardMaterial('geometryPortalMaterial', this.scene);
        material.diffuseTexture = this.texture;
        material.emissiveTexture = this.texture;
        material.emissiveColor = BABYLON.Color3.White();
        material.disableLighting = true;
        material.backFaceCulling = false;
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
        this.apertureScale = Math.max(0, Math.min(1, scale));
        if (this.baseSurfaceScaling) {
            this.surface.scaling.set(
                this.baseSurfaceScaling.x * this.apertureScale,
                this.baseSurfaceScaling.y * this.apertureScale,
                this.baseSurfaceScaling.z
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
        this.surface.position.set(position.x, position.y, position.z);
        this.surface.rotation.set(pitch, yaw, 0);
        if (this.rim) {
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
            apertureScale: this.apertureScale,
            cameraPose: this.lastCameraPose ?? null,
            resolution: this.texture.getSize()
        };
    }

    dispose() {
        this.setVisible(false);
        this.rim?.dispose(false, false);
        this.surface.dispose(false, false);
        this.material.dispose(false, true);
        this.texture.dispose();
        this.camera.dispose();
        this.ownedMeshes = [];
    }
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
        rimPosition: rim ? cloneVector(rim.position) : null,
        rimRotation: rim ? cloneVector(rim.rotation) : null
    };
}

function restorePose(renderer, pose) {
    renderer.surface.position.set(pose.surfacePosition.x, pose.surfacePosition.y, pose.surfacePosition.z);
    renderer.surface.rotation.set(pose.surfaceRotation.x, pose.surfaceRotation.y, pose.surfaceRotation.z);
    if (renderer.rim && pose.rimPosition) {
        renderer.rim.position.set(pose.rimPosition.x, pose.rimPosition.y, pose.rimPosition.z);
        renderer.rim.rotation.set(pose.rimRotation.x, pose.rimRotation.y, pose.rimRotation.z);
    }
}

function cloneVector(value) {
    return { x: value.x, y: value.y, z: value.z };
}

function sameMeshes(left, right) {
    return left.length === right.length && left.every(function sameMesh(mesh, index) {
        return mesh === right[index];
    });
}

export { PortalPreviewRenderer };
