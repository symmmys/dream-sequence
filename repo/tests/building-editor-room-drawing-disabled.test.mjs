import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/editor/building-editor.js', import.meta.url), 'utf8');

test('legacy drag-to-draw room workflow is absent from the Building Editor', () => {
    assert.doesNotMatch(source, /data-mode=["']room["']/);
    assert.doesNotMatch(source, /DRAW ROOM/);
    assert.doesNotMatch(source, /createRoomFromPoints/);
    assert.match(source, /pointerDown\(\)\s*\{[\s\S]*?this\.startPoint = null;/);
    assert.match(source, /\["door", "window", "furniture", "floor-plan"\]\.includes\(mode\)/);
});
