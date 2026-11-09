class MainMenu {
    constructor(gameManager, onDnD = null, onGeometryDemo = null, onGeometryGridToggle = null, onGeometryCameraToggle = null) {
        this.gameManager = gameManager;
        this.onDnD = onDnD;
        this.onGeometryDemo = onGeometryDemo;
        this.onGeometryGridToggle = onGeometryGridToggle;
        this.onGeometryCameraToggle = onGeometryCameraToggle;
        this.container = null;
        this.listeners = [];
        this.unsubscribe = gameManager.onModeChanged(this.update.bind(this));
        this.create();
        this.update(gameManager.mode);
    }

    create() {
        this.container = document.createElement('div');
        this.container.id = 'somnium-game-ui';
        Object.assign(this.container.style, {
            position: 'fixed', inset: '0', zIndex: '1000',
            pointerEvents: 'none', fontFamily: 'Arial, sans-serif', color: 'white'
        });
        this.container.innerHTML = this.getMarkup();
        document.body.appendChild(this.container);
        this.menu = this.container.querySelector('#somnium-menu');
        this.pausePanel = this.container.querySelector('#somnium-pause');
        this.hud = this.container.querySelector('#somnium-hud');
        this.geometryHud = this.container.querySelector('#somnium-geometry-hud');
        this.geometryViewLabel = this.container.querySelector('#somnium-geometry-view-label');
        this.geometrySliceLabel = this.container.querySelector('#somnium-geometry-slice-label');
        this.geometryControls = this.container.querySelector('#somnium-geometry-controls');
        this.geometryCameraMode = 'follow';
        this.geometryVisible = false;
        this.geometryCameraButton = this.container.querySelector('#somnium-demo-camera');
        this.bindButton('#somnium-play-character', this.startThirdPerson);
        this.bindButton('#somnium-play-flight', this.startFlight);
        this.bindButton('#somnium-play-editor', this.startEditor);
        this.bindButton('#somnium-play-dnd', this.startDnD);
        this.bindButton('#somnium-play-geometry', this.startGeometryDemo);
        this.bindButton('#somnium-switch', this.togglePerspective);
        this.bindButton('#somnium-pause-button', this.pause);
        this.bindButton('#somnium-demo-grid', this.toggleGeometryGrid);
        this.bindButton('#somnium-demo-camera', this.toggleGeometryCamera);
        this.bindButton('#somnium-demo-pause', this.pause);
        this.bindButton('#somnium-resume', this.resume);
        this.bindButton('#somnium-return', this.returnToMenu);
    }

    getMarkup() {
        return `
            <style>
                #somnium-game-ui button { color:#fff; background:#172b3c; border:1px solid #536d82; padding:12px 18px; cursor:pointer; border-radius:5px; font-size:13px; }
                #somnium-game-ui button:hover { background:#294a63; }
                .somnium-overlay { position:absolute; inset:0; display:none; justify-content:center; align-items:center; background:rgba(5,12,20,.94); pointer-events:auto; text-align:center; }
                .somnium-panel { width:min(760px,90%); }
                .somnium-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:28px; }
                .somnium-options button { min-height:106px; }
                .somnium-options small { display:block; margin-top:9px; color:#b5c5d3; }
                #somnium-hud,#somnium-geometry-hud { position:absolute; top:18px; right:18px; display:none; gap:8px; pointer-events:auto; align-items:center; }
                #somnium-geometry-hud span { color:#b5ddec; font:12px monospace; background:rgba(5,12,20,.75); padding:9px 12px; border-radius:5px; }
                #somnium-geometry-controls { position:absolute; left:18px; bottom:18px; color:#d8e7f2; font:12px/1.6 monospace; background:rgba(5,12,20,.72); padding:10px 13px; border-radius:5px; pointer-events:none; }
                @media(max-width:520px) { .somnium-options { grid-template-columns:1fr; } }
            </style>
            <div id="somnium-menu" class="somnium-overlay">
                <div class="somnium-panel">
                    <h1 style="font-size:64px;letter-spacing:12px;font-weight:300">SOMNIUM</h1>
                    <p style="color:#9aabbc;letter-spacing:3px">CHOOSE YOUR PERSPECTIVE</p>
                    <div class="somnium-options">
                        <button id="somnium-play-character"><strong>THIRD-PERSON</strong><small>Explore the main world</small></button>
                        <button id="somnium-play-geometry"><strong>4D GEOMETRY DEMO</strong><small>Explore a rotating hypercube and linked anomaly chambers</small></button>
                        <button id="somnium-play-dnd"><strong>D&amp;D MODE</strong><small>Build tactical battlefields and play encounters</small></button>
                        <button id="somnium-play-flight"><strong>FLIGHT SIMULATOR</strong><small>Explore freely from above</small></button>
                        <button id="somnium-play-editor"><strong>BUILDING EDITOR</strong><small>Design and position architecture</small></button>
                    </div>
                </div>
            </div>
            <div id="somnium-pause" class="somnium-overlay">
                <div class="somnium-panel"><h1>PAUSED</h1><button id="somnium-resume">RESUME</button><button id="somnium-return">MAIN MENU</button></div>
            </div>
            <div id="somnium-hud"><button id="somnium-switch">SWITCH VIEW (V)</button><button id="somnium-pause-button">PAUSE (ESC)</button></div>
            <div id="somnium-geometry-hud"><span id="somnium-geometry-view-label">4D HYPERCUBE CHAMBER · LIVE 3D W-SLICE</span><span id="somnium-geometry-slice-label">W 0.00 · 12 VERTICES · 8 FACES</span><button id="somnium-demo-camera">FREE CAMERA (C)</button><button id="somnium-demo-grid">METRIC GRID (G)</button><button id="somnium-demo-pause">PAUSE (ESC)</button></div>
            <div id="somnium-geometry-controls" style="display:none">FOLLOW: WASD move · mouse drag look · Space jump<br>FREE CAMERA: WASD move · R/F vertical · E/Q W axis locked outside anomalies<br>ANOMALY: WASD X/Z · R/F Y · E/Q W (four independent axes)<br>Mouse drag look · wheel speed · Shift faster · C follow/free · G grid</div>
        `;
    }

    bindButton(selector, method) {
        const button = this.container.querySelector(selector);
        const handler = method.bind(this);
        button.addEventListener('click', handler);
        this.listeners.push({ button, handler });
    }

    startThirdPerson() { this.gameManager.startThirdPerson(); }
    startFlight() { this.gameManager.startFlight(); }
    startEditor() { this.gameManager.startEditor(); }
    startDnD() { this.onDnD?.(); }
    startGeometryDemo() { this.onGeometryDemo?.(); }
    togglePerspective() { this.gameManager.togglePerspective(); }
    pause() { this.gameManager.pause(); }
    resume() { this.gameManager.resume(); }
    returnToMenu() { this.gameManager.returnToMenu(); }
    toggleGeometryGrid() { this.onGeometryGridToggle?.(); }
    toggleGeometryCamera() {
        const mode = this.onGeometryCameraToggle?.();
        if (mode) this.setGeometryCameraMode(mode);
    }

    setGeometryViewLabel(label) {
        if (this.geometryViewLabel) this.geometryViewLabel.textContent = label;
    }

    setGeometrySliceLabel(label) {
        if (this.geometrySliceLabel) this.geometrySliceLabel.textContent = label;
    }

    setGeometryCameraMode(mode) {
        this.geometryCameraMode = mode;
        if (this.geometryCameraButton) {
            this.geometryCameraButton.textContent = mode === 'free' ? 'FOLLOW PLAYER (C)' : 'FREE CAMERA (C)';
        }
        if (this.geometryControls) {
            this.geometryControls.style.display = this.geometryVisible && mode === 'free' ? 'block' : 'none';
        }
    }

    update(mode) {
        this.menu.style.display = mode === 'menu' ? 'flex' : 'none';
        this.pausePanel.style.display = mode === 'paused' ? 'flex' : 'none';
        this.hud.style.display = mode === 'flight' || mode === 'thirdPerson' ? 'flex' : 'none';
        this.geometryHud.style.display = mode === 'geometryDemo' ? 'flex' : 'none';
        this.geometryVisible = mode === 'geometryDemo';
        if (this.geometryControls) {
            this.geometryControls.style.display = this.geometryVisible && this.geometryCameraMode === 'free' ? 'block' : 'none';
        }
    }

    dispose() {
        this.unsubscribe?.();
        for (const listener of this.listeners) {
            listener.button.removeEventListener('click', listener.handler);
        }
        this.listeners.length = 0;
        this.container?.remove();
    }
}

export { MainMenu };
