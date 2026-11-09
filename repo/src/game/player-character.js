class PlayerCharacter {
    constructor(scene, spatialTransform, options = {}) {
        this.scene = scene;
        this.transform = spatialTransform;
        this.sliceId = options.sliceId ?? 'somnium-main';

        this.worldPosition = {
            x: options.x ?? 0,
            y: 0,
            z: options.z ?? 0
        };

        this.yaw = 0;

        const sample = options.terrain.sampleAt(
            this.worldPosition.x,
            this.worldPosition.z
        );

        if (!sample) {
            throw new Error("Unable to sample initial player terrain.");
        }

        this.worldPosition.y = sample.y;

        this.root = new BABYLON.TransformNode('somniumPlayer', scene);
        this.root.metadata = { sliceId: this.sliceId, playerCharacter: true };

        this.body = BABYLON.MeshBuilder.CreateCapsule(
            "playerBody",
            {
                height: 1.8,
                radius: 0.35,
                tessellation: 12
            },
            scene
        );

        this.body.parent = this.root;
        this.body.metadata = { sliceId: this.sliceId, playerPart: true };
        this.body.position.y = 0.9;

        this.head = BABYLON.MeshBuilder.CreateSphere(
            "playerHead",
            {
                diameter: 0.48,
                segments: 12
            },
            scene
        );

        this.head.parent = this.root;
        this.head.metadata = { sliceId: this.sliceId, playerPart: true };
        this.head.position.y = 1.95;

        this.material = new BABYLON.StandardMaterial(
            "playerMaterial",
            scene
        );

        this.material.diffuseColor =
            new BABYLON.Color3(0.18, 0.48, 0.78);

        this.body.material = this.material;

        this.headMaterial = new BABYLON.StandardMaterial('playerHeadMaterial', scene);
        this.headMaterial.diffuseColor = new BABYLON.Color3(0.82, 0.69, 0.55);
        this.head.material = this.headMaterial;
        this.setLayerMask(options.layerMask ?? 0x0FFFFFFF);

        this.syncRenderPosition();
    }

    syncRenderPosition() {
        const projected = this.transform.worldToRender(
            this.worldPosition
        );

        this.root.position.set(
            projected.x,
            projected.y,
            projected.z
        );

        this.root.rotation.y = this.yaw;
        const scale = this.transform.getVisualScale?.(this.worldPosition) ?? 1;
        this.root.scaling.setAll(scale);
    }

    setSpatialContext(transform, sliceId, layerMask = 0x0FFFFFFF) {
        this.transform = transform;
        this.sliceId = sliceId;
        this.root.metadata = { ...(this.root.metadata || {}), sliceId };
        this.setLayerMask(layerMask);
    }

    setLayerMask(layerMask) {
        this.body.layerMask = layerMask;
        this.head.layerMask = layerMask;
    }

    getRenderPosition() {
        return { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z };
    }

    setRenderPosition(position, yaw = this.yaw) {
        this.root.position.set(position.x, position.y, position.z);
        this.yaw = yaw;
        this.root.rotation.y = yaw;
    }

    setWorldPosition(position) {
        this.worldPosition = {
            x: position.x,
            y: position.y,
            z: position.z
        };

        this.syncRenderPosition();
    }

    dispose() {
        this.root.dispose(false, true);
        this.material.dispose();
        this.headMaterial.dispose();
    }
}

export { PlayerCharacter };
