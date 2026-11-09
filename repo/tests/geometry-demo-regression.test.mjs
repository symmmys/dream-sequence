import assert from 'node:assert/strict';
import test from 'node:test';
import { CharacterCameraController } from '../src/game/camera-controller.js';
import { SpatialTransform } from '../src/world/fields/geometry/spatial-transform.js';

test('third-person camera boom stays inside its open render-space projection bounds', function cameraBounds() {
    const transform = new SpatialTransform({
        geometry: 'poincare',
        renderScale: 100,
        bounds: {
            minX: -10, maxX: 10,
            minY: -10, maxY: 10,
            minZ: -10, maxZ: 10,
            characteristicLength: 1
        }
    });
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const scene = { getEngine() { return { getRenderingCanvas() { return canvas; } }; } };
    const player = { worldPosition: { x: -9.9, y: 0, z: 0 }, yaw: Math.PI / 2 };
    const controller = new CharacterCameraController(scene, {}, player, transform, {
        distance: 8,
        height: 5
    });

    const desiredRenderPosition = controller.getDesiredPosition();
    const renderRadius = transform.projection.radius * transform.renderScale;
    assert.ok(Math.hypot(
        desiredRenderPosition.x, desiredRenderPosition.y, desiredRenderPosition.z
    ) < renderRadius);
    assert.doesNotThrow(function invertCameraPosition() {
        transform.renderToWorld(desiredRenderPosition);
    });
    assert.throws(function rejectOutOfBoundsWorldData() {
        transform.projection.worldToBall({ x: -11, y: 0, z: 0 });
    }, /outside world bounds/);
    controller.dispose();
});


test('follow camera boom distance is applied after projection in render space', function renderSpaceCameraBoom() {
    const transform = {
        worldToRender(position) {
            return { x: position.x * 0.05, y: position.y * 0.05, z: position.z * 0.05 };
        },
        getVisualScale() { return 1; }
    };
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const scene = { getEngine() { return { getRenderingCanvas() { return canvas; } }; } };
    const player = { worldPosition: { x: 1000, y: 0, z: 500 }, yaw: 0 };
    const controller = new CharacterCameraController(scene, {}, player, transform, {
        distance: 20,
        height: 1.3
    });

    const target = controller.getTargetPosition();
    const desired = controller.getDesiredPosition();
    assert.ok(Math.abs(Math.hypot(
        desired.x - target.x, desired.y - target.y, desired.z - target.z
    ) - 20) < 1e-9);
    assert.deepEqual(target, { x: 50, y: 1.3, z: 25 });
    controller.dispose();
});

test('third-person camera leaves positions unchanged when a transform has no finite bounds', function unboundedCamera() {
    const canvas = { addEventListener() {}, removeEventListener() {} };
    const scene = { getEngine() { return { getRenderingCanvas() { return canvas; } }; } };
    const transform = { worldToRender(position) { return { ...position }; } };
    const player = { worldPosition: { x: 3, y: 2, z: 1 }, yaw: 0 };
    const controller = new CharacterCameraController(scene, {}, player, transform, {
        distance: 4,
        height: 2
    });

    assert.deepEqual(controller.getDesiredPosition(), { x: 3, y: 4, z: -3 });
    controller.dispose();
});
