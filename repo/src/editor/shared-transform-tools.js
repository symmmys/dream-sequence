/**
 * Reusable Babylon transform controls shared by editor object types.
 *
 * The gizmos use two independent proxy nodes:
 * - poseNode owns position and rotation and always stays at unit scale;
 * - scaleNode owns scale and is only ever attached to the scale gizmo.
 *
 * Keeping non-uniform scale off the rotation-gizmo target avoids Babylon's
 * unsupported rotation/scale decomposition while preserving local rotation.
 */
class SharedTransformTools {
    constructor(scene, options = {}) {
        if (!scene) throw new Error('SharedTransformTools requires a scene.');
        this.scene = scene;
        this.onChange = options.onChange ?? (() => {});
        this.rotationAxes = options.rotationAxes ?? 'y';
        this.poseNode = new BABYLON.TransformNode(`${options.name ?? 'somnium-editor-transform'}-pose`, scene);
        this.scaleNode = new BABYLON.TransformNode(`${options.name ?? 'somnium-editor-transform'}-scale`, scene);
        this.gizmos = new BABYLON.GizmoManager(scene);
        this.gizmos.usePointerToAttachGizmos = false;
        this.gizmos.clearGizmoOnEmptyPointerEvent = false;
        this.gizmos.boundingBoxGizmoEnabled = false;

        // Force creation of all gizmos now. GizmoManager creates these lazily,
        // so subscribing before enabling them (the previous implementation)
        // silently left rotation and scale with no drag listeners.
        this.gizmos.positionGizmoEnabled = true;
        this.gizmos.rotationGizmoEnabled = true;
        this.gizmos.scaleGizmoEnabled = true;
        this.gizmos.positionGizmoEnabled = false;
        this.gizmos.rotationGizmoEnabled = false;
        this.gizmos.scaleGizmoEnabled = false;

        // Buildings default to yaw-only. Plane objects explicitly request
        // 'all', leaving Babylon's three rotation rings enabled.
        if (this.rotationAxes !== 'all') {
            this.gizmos.gizmos.rotationGizmo?.setEnabledRotationAxis?.(this.rotationAxes);
        }

        this.mode = 'translate';
        this.suspend = false;
        this.disposed = false;
        this.hasTarget = false;
        this.observers = [];
        this.boundBehaviors = new Set();
        this.bindGizmoEvents();
        this.setMode(this.mode);
        this.setLayerMask(options.layerMask ?? 0x0FFFFFFF);
        this.gizmos.attachToNode(null);
    }

    /**
     * Gizmo meshes live in Babylon's utility layer, but that layer shares the
     * active camera. Demo Planes use isolated high-bit camera masks, so default
     * utility-layer meshes (0x0FFFFFFF) would disappear even though the selected
     * object's outline remains visible. Match the utility-layer gizmos to the
     * current editor camera's active Plane mask.
     */
    setLayerMask(layerMask = 0x0FFFFFFF) {
        const mask = Number.isInteger(layerMask) && layerMask >= 0
            ? layerMask >>> 0
            : 0x0FFFFFFF;
        const layers = new Set();
        for (const group of Object.values(this.gizmos.gizmos ?? {})) {
            if (!group) continue;
            for (const gizmo of Object.values(group)) {
                const layer = gizmo?.gizmoLayer;
                if (layer?.utilityLayerScene) layers.add(layer);
            }
        }
        // GizmoManager may expose the shared layer directly before all child
        // gizmos have been created; include it when available.
        if (this.gizmos.utilityLayer?.utilityLayerScene) layers.add(this.gizmos.utilityLayer);
        for (const layer of layers) {
            for (const mesh of layer.utilityLayerScene.meshes ?? []) mesh.layerMask = mask;
        }
        this.layerMask = mask;
        return this;
    }

    bindGizmoEvents() {
        const groups = [
            this.gizmos.gizmos.positionGizmo,
            this.gizmos.gizmos.rotationGizmo,
            this.gizmos.gizmos.scaleGizmo
        ];

        for (const group of groups) {
            if (!group) continue;
            const axes = [group.xGizmo, group.yGizmo, group.zGizmo, group.uniformScaleGizmo];
            for (const gizmo of axes) {
                const behavior = gizmo?.dragBehavior;
                if (!behavior || this.boundBehaviors.has(behavior)) continue;
                this.boundBehaviors.add(behavior);
                for (const [eventName, phase] of [['onDragObservable', 'drag'], ['onDragEndObservable', 'end']]) {
                    const observable = behavior[eventName];
                    if (observable?.add) {
                        const observer = observable.add(() => this.emit(phase));
                        this.observers.push({ observable, observer });
                    }
                }
            }
        }
    }

    attach(position, rotation = BABYLON.Quaternion.Identity(), scale = BABYLON.Vector3.One()) {
        this.suspend = true;
        this.poseNode.position.copyFrom(position);
        this.poseNode.rotationQuaternion = rotation.clone();
        this.poseNode.scaling.copyFrom(BABYLON.Vector3.One());

        this.scaleNode.position.copyFrom(position);
        this.scaleNode.rotationQuaternion = rotation.clone();
        this.scaleNode.scaling.copyFrom(scale);

        this.poseNode.setEnabled(true);
        this.scaleNode.setEnabled(true);
        this.hasTarget = true;
        this.gizmos.attachToNode(this.mode === 'scale' ? this.scaleNode : this.poseNode);
        this.suspend = false;
        return this;
    }

    setMode(mode) {
        if (!['translate', 'rotate', 'scale'].includes(mode)) {
            throw new Error(`Unknown transform mode: ${mode}`);
        }
        this.mode = mode;
        this.gizmos.positionGizmoEnabled = mode === 'translate';
        this.gizmos.rotationGizmoEnabled = mode === 'rotate';
        this.gizmos.scaleGizmoEnabled = mode === 'scale';
        this.gizmos.boundingBoxGizmoEnabled = false;

        // Translation/rotation always target a unit-scaled pose proxy. Scaling
        // targets a separate proxy, so non-uniform scale cannot disable rotate.
        this.gizmos.attachToNode(this.hasTarget ? (mode === 'scale' ? this.scaleNode : this.poseNode) : null);
    }

    emit(phase = 'drag') {
        if (this.suspend || this.disposed || !this.hasTarget) return;

        // Keep the scale handle centered and locally oriented after move/rotate.
        this.scaleNode.position.copyFrom(this.poseNode.position);
        if (this.poseNode.rotationQuaternion) {
            this.scaleNode.rotationQuaternion = this.poseNode.rotationQuaternion.clone();
        }

        this.onChange({
            position: this.poseNode.position.clone(),
            rotation: this.poseNode.rotationQuaternion?.clone() ?? BABYLON.Quaternion.FromEulerVector(this.poseNode.rotation),
            scale: this.scaleNode.scaling.clone(),
            mode: this.mode,
            phase
        });
    }

    detach() {
        this.hasTarget = false;
        this.gizmos.attachToNode(null);
        this.poseNode.setEnabled(false);
        this.scaleNode.setEnabled(false);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const { observable, observer } of this.observers) {
            observable.remove?.(observer);
        }
        this.observers.length = 0;
        this.gizmos.dispose();
        this.poseNode.dispose();
        this.scaleNode.dispose();
    }
}

export { SharedTransformTools };
