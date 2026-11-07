class PlayerCharacter {
    constructor(scene, spatialTransform, options = {}) {
        this.scene = scene;
        this.transform = spatialTransform;

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

        this.root = new BABYLON.TransformNode(
            "somniumPlayer",
            scene
        );

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
        this.head.position.y = 1.95;

        this.material = new BABYLON.StandardMaterial(
            "playerMaterial",
            scene
        );

        this.material.diffuseColor =
            new BABYLON.Color3(0.18, 0.48, 0.78);

        this.body.material = this.material;

        this.head.material = new BABYLON.StandardMaterial(
            "playerHeadMaterial",
            scene
        );

        this.head.material.diffuseColor =
            new BABYLON.Color3(0.82, 0.69, 0.55);

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
    }
}

export { PlayerCharacter };
