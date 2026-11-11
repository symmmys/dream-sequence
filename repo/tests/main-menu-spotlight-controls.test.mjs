import assert from 'node:assert/strict';
import test from 'node:test';
import { MainMenu } from '../src/ui/main-menu.js';

function fakeButton() {
    return {
        textContent: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    };
}

test('geometry HUD exposes clickable spotlight controls with matching L and P hotkeys', function hudMarkup() {
    const markup = MainMenu.prototype.getMarkup.call({});
    assert.match(markup, /id="somnium-demo-spotlight-edit"[^>]*>EDIT LIGHT \(L\)/);
    assert.match(markup, /id="somnium-demo-test-ray"[^>]*>TEST RAY: ON \(P\)/);
    assert.match(markup, /id="somnium-spotlight-controls"/);
});

test('spotlight edit HUD state follows keyboard and button toggles', function editState() {
    const menu = Object.assign(Object.create(MainMenu.prototype), {
        geometrySpotlightEditorButton: fakeButton(),
        geometrySpotlightControls: { style: {} },
        geometryControls: { style: {} },
        geometryVisible: true,
        geometryCameraMode: 'follow'
    });
    menu.setSpotlightEditorState(true);
    assert.equal(menu.geometrySpotlightEditorButton.textContent, 'STOP EDITING LIGHT (L)');
    assert.equal(menu.geometrySpotlightEditorButton.attributes['aria-pressed'], 'true');
    assert.equal(menu.geometrySpotlightControls.style.display, 'block');
    menu.setSpotlightEditorState(false);
    assert.equal(menu.geometrySpotlightEditorButton.textContent, 'EDIT LIGHT (L)');
    assert.equal(menu.geometrySpotlightEditorButton.attributes['aria-pressed'], 'false');
    assert.equal(menu.geometrySpotlightControls.style.display, 'none');
});

test('test-ray HUD state follows keyboard and button toggles', function rayState() {
    const menu = Object.assign(Object.create(MainMenu.prototype), {
        geometrySpotlightPowerButton: fakeButton()
    });
    menu.setSpotlightTestRayState(false);
    assert.equal(menu.geometrySpotlightPowerButton.textContent, 'TEST RAY: OFF (P)');
    assert.equal(menu.geometrySpotlightPowerButton.attributes['aria-pressed'], 'false');
    menu.setSpotlightTestRayState(true);
    assert.equal(menu.geometrySpotlightPowerButton.textContent, 'TEST RAY: ON (P)');
    assert.equal(menu.geometrySpotlightPowerButton.attributes['aria-pressed'], 'true');
});

test('spotlight HUD buttons invoke their application callbacks and mirror returned state', function callbackWiring() {
    const menu = Object.assign(Object.create(MainMenu.prototype), {
        onGeometrySpotlightEditorToggle: () => true,
        onGeometrySpotlightPowerToggle: () => false,
        geometrySpotlightEditorButton: fakeButton(),
        geometrySpotlightPowerButton: fakeButton(),
        geometrySpotlightControls: { style: {} },
        geometryControls: { style: {} },
        geometryVisible: true,
        geometryCameraMode: 'follow'
    });
    menu.toggleGeometrySpotlightEditor();
    menu.toggleGeometrySpotlightPower();
    assert.equal(menu.geometrySpotlightEditorButton.textContent, 'STOP EDITING LIGHT (L)');
    assert.equal(menu.geometrySpotlightPowerButton.textContent, 'TEST RAY: OFF (P)');
});


test('geometry HUD exposes the W movement override and a hotkey-toggleable W readout', function wDimensionHudMarkup() {
    const markup = MainMenu.prototype.getMarkup.call({});
    assert.match(markup, /id="somnium-demo-w-movement"[^>]*>E\/Q W MOVEMENT: OFF/);
    assert.match(markup, /id="somnium-w-dimension-readout"/);
    assert.match(markup, /H show\/hide/);
});

test('W movement button mirrors the enabled override state', function wMovementButtonState() {
    const button = fakeButton();
    const menu = Object.assign(Object.create(MainMenu.prototype), {
        onGeometryWMovementToggle: () => true,
        geometryWMovementButton: button
    });
    menu.toggleGeometryWMovement();
    assert.equal(button.textContent, 'E/Q W MOVEMENT: ON');
    assert.equal(button.attributes['aria-pressed'], 'true');
});

test('W readout displays the current coordinate and anomaly freedom and can be hidden', function wReadoutState() {
    const readout = { textContent: '', style: {} };
    const menu = Object.assign(Object.create(MainMenu.prototype), { geometryWReadout: readout, geometryWReadoutVisible: true });
    menu.setGeometryWState({ coordinate: 2.125, freedomPercent: 38, movementEnabled: true, inTransit: true });
    assert.match(readout.textContent, /W COORD 2\.13/);
    assert.match(readout.textContent, /FREEDOM 38%/);
    assert.match(readout.textContent, /IN PASSAGE: E\/Q TO TRAVERSE/);
    assert.match(readout.textContent, /OVERRIDE ON/);
    menu.setGeometryWReadoutVisible(false);
    assert.equal(readout.style.display, 'none');
});
