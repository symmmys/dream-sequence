import test from 'node:test';
import assert from 'node:assert/strict';
import { BuildingModel } from '../src/buildings/building-model.js';

test('building scale defaults to identity and survives serialization round-trip', () => {
    const building = new BuildingModel({ name: 'Transform test' });
    assert.deepEqual(building.scale, { x: 1, y: 1, z: 1 });
    building.scale = { x: 2, y: 0.5, z: 3 };
    const restored = BuildingModel.deserialize(building.serialize());
    assert.deepEqual(restored.scale, { x: 2, y: 0.5, z: 3 });
});

test('legacy building records without scale retain identity scale', () => {
    const building = new BuildingModel({ id: 'legacy' });
    const record = building.serialize();
    delete record.scale;
    const restored = BuildingModel.deserialize(record);
    assert.deepEqual(restored.scale, { x: 1, y: 1, z: 1 });
});

test('building scale rejects zero, negative, and non-finite axes', () => {
    const building = new BuildingModel();
    building.scale.x = 0;
    assert.throws(() => building.validate(), /positive finite/);
});
