
const ACTION_OPTIONS = [
    ["attack", "Attack"],
    ["cast-spell", "Cast a Spell"],
    ["dash", "Dash"],
    ["disengage", "Disengage"],
    ["dodge", "Dodge"],
    ["help", "Help"],
    ["hide", "Hide"],
    ["ready", "Ready"],
    ["search", "Search"],
    ["use-object", "Use an Object"],
    ["grapple", "Grapple"],
    ["shove", "Shove"],
    ["improvise", "Improvise"]
];

const BONUS_OPTIONS = [
    ["bonus-spell", "Cast a Bonus Action Spell"],
    ["two-weapon-fighting", "Two-Weapon Fighting"],
    ["class-feature", "Use a Class Feature"],
    ["bonus-ability", "Use an Ability"]
];

const DEFAULT_COLORS = {
    movement: "#25d9a0",
    dash: "#e9a33c"
};

const ALTITUDE_MIN = 0;
const ALTITUDE_MAX = 1000;

function findOptionByValue(options, value) {
    for (const option of options) {
        if (option[0] === value) return option;
    }
    return null;
}

class DnDTacticalUI {

    constructor(mode) {
        this.mode = mode;
        this.visible = false;
        this.activeTab = "battle";
        this.colors = {
            ...DEFAULT_COLORS,
            ...this.loadColors()
        };

        this.createInterface();
    }
    loadColors() {
        try {
            return JSON.parse(
                localStorage.getItem("somnium-dnd-colors") || "{}"
            );
        } catch {
            return {};
        }
    }

    saveColors() {
        localStorage.setItem(
            "somnium-dnd-colors",
            JSON.stringify(this.colors)
        );

        this.mode.setMovementColors(this.colors);
    }

    createInterface() {
        this.createFloatingButtons();
        this.createPanelShell();
        this.createPanelHeader();
        this.createTabNavigation();
        this.buildTabContents();
        this.mountPanel();
        this.bindKeyboard();
        this.refresh();
    }

    createFloatingButtons() {
        this.createMenuToggleButton();
        this.createFocusButton();
    }

    createMenuToggleButton() {
        this.toggleButton = this.createButton(
            "☰ D&D MENU",
            this.handleToggleMenu.bind(this)
        );
        Object.assign(this.toggleButton.style, {
            position: "fixed",
            top: "15px",
            left: "15px",
            zIndex: "2100",
            width: "125px",
            background: "#193b55"
        });
        document.body.appendChild(this.toggleButton);
    }

    createFocusButton() {
        this.focusButton = this.createButton(
            "◎ FOCUS ACTIVE",
            this.handleFocusActiveCharacter.bind(this)
        );
        Object.assign(this.focusButton.style, {
            position: "fixed",
            top: "15px",
            right: "15px",
            zIndex: "10003",
            width: "auto",
            minWidth: "150px",
            margin: "0",
            background: "#72551b",
            boxShadow: "0 2px 8px rgba(0,0,0,0.45)"
        });
        this.focusButton.title = "Center and zoom the camera on the active character";
        this.focusButton.setAttribute("aria-label", "Focus camera on active character");
        document.body.appendChild(this.focusButton);
    }

    createPanelShell() {
        this.panel = document.createElement("div");
        Object.assign(this.panel.style, {
            position: "fixed",
            top: "58px",
            left: "15px",
            zIndex: "10002",
            width: "340px",
            maxWidth: "calc(100vw - 30px)",
            maxHeight: "calc(100vh - 75px)",
            overflowY: "auto",
            boxSizing: "border-box",
            padding: "13px",
            color: "#eaf4fa",
            background: "rgba(8,20,34,0.97)",
            border: "1px solid #54758d",
            borderRadius: "9px",
            fontFamily: "Arial, sans-serif",
            fontSize: "13px",
            display: "none",
            visibility: "visible",
            pointerEvents: "auto"
        });
    }

    createPanelHeader() {
        const heading = this.element("h2", "TACTICAL MODE");
        heading.style.color = "#9dd8ed";
        this.panel.appendChild(heading);
        this.status = this.appendPanelText("div");
        this.battleStatus = this.appendPanelText("p");
        this.message = this.appendPanelText("p");
        this.message.style.color = "#9dd8ed";
    }

    appendPanelText(tag) {
        const element = this.element(tag);
        this.panel.appendChild(element);
        return element;
    }

    createTabNavigation() {
        this.tabBar = document.createElement("div");
        Object.assign(this.tabBar.style, {
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "4px",
            margin: "12px 0"
        });
        this.panel.appendChild(this.tabBar);
        this.tabContents = {};
        this.appendTab("battle", "Battle");
        this.appendTab("characters", "Characters");
        this.appendTab("battlefield", "Grid");
        this.appendTab("settings", "Settings");
    }

    appendTab(id, label) {
        const button = this.createButton(label, this.handleTabButtonClick.bind(this));
        button.dataset.tabId = id;
        button.style.padding = "8px 3px";
        button.style.fontSize = "11px";
        this.tabBar.appendChild(button);
        const content = document.createElement("div");
        this.tabContents[id] = content;
        this.panel.appendChild(content);
    }

    buildTabContents() {
        this.buildBattleTab();
        this.buildCharactersTab();
        this.buildBattlefieldTab();
        this.buildSettingsTab();
    }

    mountPanel() {
        document.body.appendChild(this.panel);
        this.setVisible(false);
        this.selectTab("battle");
    }

    bindKeyboard() {
        this.onKeyDown = this.handleKeyDown.bind(this);
        window.addEventListener("keydown", this.onKeyDown);
    }

    handleToggleMenu() {
        this.toggle();
    }

    handleTabButtonClick(event) {
        this.selectTab(event.currentTarget.dataset.tabId);
    }

    handleKeyDown(event) {
        if (
            event.target instanceof HTMLElement &&
            ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
        ) return;

        if (event.code === "Escape") this.setVisible(false);
        if (event.code === "KeyM") this.toggle();
    }

    element(tag, content = "") {
        const element = document.createElement(tag);
        element.textContent = content;
        return element;
    }

    createButton(label, callback) {
        const button = this.element("button", label);

        Object.assign(button.style, {
            display: "block",
            width: "100%",
            margin: "5px 0",
            padding: "9px",
            color: "white",
            background: "#193b55",
            border: "1px solid #54758d",
            borderRadius: "4px",
            cursor: "pointer"
        });

        button.addEventListener("click", callback);

        return button;
    }

    addSection(parent, label) {
        const heading = this.element("h3", label);

        Object.assign(heading.style, {
            marginTop: "15px",
            paddingBottom: "5px",
            color: "#9dd8ed",
            borderBottom: "1px solid #54758d"
        });

        parent.appendChild(heading);
    }

    selectTab(id) {
        this.activeTab = id;

        for (const [key, content] of
            Object.entries(this.tabContents)) {
            content.style.display =
                key === id ? "block" : "none";
        }

        for (const button of this.tabBar.children) {
            const selected =
                button.textContent.toLowerCase() ===
                (id === "battlefield" ? "grid" : id);

            button.style.background = selected
                ? "#72551b"
                : "#193b55";
        }
    }

    createInput(parent, label, type = "text") {
        const wrapper = document.createElement("div");

        wrapper.style.margin = "8px 0";

        const caption = this.element("label", label);
        caption.style.display = "block";
        caption.style.marginBottom = "4px";

        const input = document.createElement("input");
        input.type = type;

        Object.assign(input.style, {
            width: "100%",
            boxSizing: "border-box",
            padding: "8px",
            color: "white",
            background: "#193b55",
            border: "1px solid #54758d",
            borderRadius: "4px"
        });

        wrapper.appendChild(caption);
        wrapper.appendChild(input);
        parent.appendChild(wrapper);

        return input;
    }

    createSelect(parent, label, options) {
        const wrapper = document.createElement("div");

        wrapper.style.margin = "8px 0";

        const caption = this.element("label", label);
        caption.style.display = "block";
        caption.style.marginBottom = "4px";

        const select = document.createElement("select");

        Object.assign(select.style, {
            width: "100%",
            padding: "9px",
            color: "white",
            background: "#193b55",
            border: "1px solid #54758d",
            borderRadius: "4px"
        });

        for (const [value, labelText] of options) {
            const option = this.element("option", labelText);
            option.value = value;
            select.appendChild(option);
        }

        wrapper.appendChild(caption);
        wrapper.appendChild(select);
        parent.appendChild(wrapper);

        return select;
    }

    createTextarea(parent, placeholder, rows = 3) {
        const textarea = document.createElement("textarea");

        textarea.placeholder = placeholder;
        textarea.rows = rows;

        Object.assign(textarea.style, {
            width: "100%",
            boxSizing: "border-box",
            padding: "9px",
            margin: "7px 0",
            color: "white",
            background: "#193b55",
            border: "1px solid #54758d",
            borderRadius: "4px",
            fontFamily: "monospace",
            resize: "vertical"
        });

        parent.appendChild(textarea);

        return textarea;
    }

    buildBattlefieldTab() {
        const parent = this.tabContents.battlefield;
        this.buildGridOriginControls(parent);
        this.buildGridDimensionControls(parent);
        this.buildCameraControls(parent);
    }

    buildGridOriginControls(parent) {
        this.addSection(parent, "BATTLEFIELD GRID");
        this.gridX = this.createInput(parent, "World X origin", "number");
        this.gridZ = this.createInput(parent, "World Z origin", "number");
        this.gridX.value = String(this.mode.gridOrigin.x);
        this.gridZ.value = String(this.mode.gridOrigin.z);
        parent.appendChild(this.createButton(
            "APPLY GRID ORIGIN",
            this.handleApplyGridOrigin.bind(this)
        ));
    }

    buildGridDimensionControls(parent) {
        this.addSection(parent, "GRID DIMENSIONS");
        this.gridRowsInput = this.createGridDimensionInput(parent, "Rows (2–300)", this.mode.gridRows);
        this.gridColumnsInput = this.createGridDimensionInput(parent, "Columns (2–300)", this.mode.gridColumns);
        this.cellSizeInput = this.createInput(parent, "Cell size (world units; square cells)", "number");
        this.configureNumericInput(this.cellSizeInput, 0.5, 1000, 0.5, this.mode.cellSize);
        parent.appendChild(this.createButton(
            "APPLY GRID SETTINGS",
            this.handleApplyGridConfiguration.bind(this)
        ));
        this.gridInfo = this.element("div");
        Object.assign(this.gridInfo.style, {
            marginTop: "10px",
            padding: "9px",
            background: "rgba(40,80,110,0.3)",
            borderRadius: "5px",
            lineHeight: "1.7",
            whiteSpace: "pre-line"
        });
        parent.appendChild(this.gridInfo);
    }

    createGridDimensionInput(parent, label, value) {
        const input = this.createInput(parent, label, "number");
        this.configureNumericInput(input, 2, 300, 1, value);
        return input;
    }

    configureNumericInput(input, min, max, step, value) {
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
    }

    buildCameraControls(parent) {
        this.addSection(parent, "CAMERA");
        parent.appendChild(this.createButton(
            "ZOOM TO ACTIVE CHARACTER",
            this.handleFocusActiveCharacter.bind(this)
        ));
        parent.appendChild(this.createButton(
            "CENTER ON SELECTED CHARACTER",
            this.handleCenterSelectedCharacter.bind(this)
        ));
    }

    handleApplyGridOrigin() {
        this.run(this.applyGridOrigin.bind(this));
    }

    applyGridOrigin() {
        const x = Number(this.gridX.value);
        const z = Number(this.gridZ.value);
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) {
            throw new Error("World coordinates must be safe integers.");
        }
        if (!this.mode.setGridOrigin(x, z)) {
            throw new Error("Unable to reposition battlefield.");
        }
    }

    handleApplyGridConfiguration() {
        this.run(this.applyGridConfiguration.bind(this));
    }

    handleCenterSelectedCharacter() {
        this.mode.centerCameraOnSelectedCharacter();
    }

    buildBattleTab() {
        const parent = this.tabContents.battle;
        this.buildEncounterControls(parent);
        this.buildInitiativeControls(parent);
        this.buildMovementControls(parent);
        this.buildActionControls(parent);
        this.buildBonusActionControls(parent);
        this.buildSpeechControls(parent);
        this.buildBattleHistoryControls(parent);
    }

    buildEncounterControls(parent) {
        this.addSection(parent, "ENCOUNTER MANAGEMENT");
        this.startBattleButton = this.createButton("START BATTLE", this.handleStartBattle.bind(this));
        this.advanceButton = this.createButton("ADVANCE INITIATIVE", this.handleAdvanceTurn.bind(this));
        this.endBattleButton = this.createButton("END BATTLE", this.handleEndBattle.bind(this));
        this.endBattleButton.style.background = "#713b40";
        parent.append(this.startBattleButton, this.advanceButton, this.endBattleButton);
    }

    buildInitiativeControls(parent) {
        this.addSection(parent, "INITIATIVE ORDER");
        this.initiativeList = this.element("div");
        parent.appendChild(this.initiativeList);
    }

    buildMovementControls(parent) {
        this.addSection(parent, "MOVEMENT (SEPARATE FROM ACTIONS)");
        this.previewButton = this.createButton(
            "ENABLE MOVEMENT PREVIEW",
            this.handleToggleMovementPreview.bind(this)
        );
        parent.appendChild(this.previewButton);
        this.movementHelp = this.element(
            "p",
            "Green: remaining movement. Amber: additional movement available by using Dash (your action)."
        );
        this.movementHelp.style.color = "#b7cbd8";
        parent.appendChild(this.movementHelp);
    }

    buildActionControls(parent) {
        this.addSection(parent, "ACTION");
        this.actionSelect = this.createSelect(parent, "Available actions", ACTION_OPTIONS);
        this.actionButton = this.createButton("USE ACTION", this.handleUseAction.bind(this));
        parent.appendChild(this.actionButton);
    }

    buildBonusActionControls(parent) {
        this.addSection(parent, "BONUS ACTION");
        this.bonusSelect = this.createSelect(parent, "Available bonus actions", BONUS_OPTIONS);
        this.bonusButton = this.createButton("USE BONUS ACTION", this.handleUseBonusAction.bind(this));
        parent.appendChild(this.bonusButton);
    }

    buildSpeechControls(parent) {
        this.addSection(parent, "CHARACTER SPEECH");
        this.speechInput = this.createTextarea(parent, "Enter character dialogue...");
        parent.appendChild(this.createButton("RECORD SPEECH", this.handleRecordSpeech.bind(this)));
    }

    buildBattleHistoryControls(parent) {
        this.addSection(parent, "BATTLE HISTORY");
        this.historyList = this.element("div");
        parent.appendChild(this.historyList);
    }

    handleStartBattle() {
        this.run(this.mode.startBattle.bind(this.mode));
    }

    handleAdvanceTurn() {
        this.run(this.mode.advanceTurn.bind(this.mode));
    }

    handleEndBattle() {
        this.run(this.mode.endBattle.bind(this.mode));
    }

    handleToggleMovementPreview() {
        this.mode.setMovementPreview(!this.mode.movementPreview);
        this.refresh();
    }

    handleUseAction() {
        this.run(this.executeSelectedAction.bind(this));
    }

    executeSelectedAction() {
        const character = this.requireActiveCharacter();
        const selected = findOptionByValue(ACTION_OPTIONS, this.actionSelect.value);
        if (!selected) throw new Error("Select a valid action.");
        this.mode.performAction(character, selected[1]);
    }

    handleUseBonusAction() {
        this.run(this.executeSelectedBonusAction.bind(this));
    }

    executeSelectedBonusAction() {
        const character = this.requireActiveCharacter();
        const selected = findOptionByValue(BONUS_OPTIONS, this.bonusSelect.value);
        if (!selected) throw new Error("Select a valid bonus action.");
        this.mode.performBonusAction(character, selected[1]);
    }

    requireActiveCharacter() {
        const character = this.mode.getActiveCharacter();
        if (!character) throw new Error("There is no active character.");
        return character;
    }

    handleRecordSpeech() {
        this.run(this.recordCharacterSpeech.bind(this));
    }

    recordCharacterSpeech() {
        const character = this.requireActiveCharacter();
        const speech = this.speechInput.value.trim();
        if (!speech) throw new Error("Enter dialogue before recording.");
        this.mode.speakAsCharacter(character, speech);
        this.speechInput.value = "";
    }

    buildCharactersTab() {
        const parent = this.tabContents.characters;
        this.buildCharacterCreationForm(parent);
        this.buildAltitudeControls(parent);
        this.buildCharacterRoster(parent);
        this.buildSelectedCharacterDetails(parent);
    }

    buildCharacterCreationForm(parent) {
        this.addSection(parent, "CREATE CHARACTER");
        this.characterName = this.createInput(parent, "Character name");
        this.characterRace = this.createInput(parent, "Race");
        this.characterClass = this.createInput(parent, "Class");
        this.characterLevel = this.createInput(parent, "Level", "number");
        this.characterHP = this.createInput(parent, "Hit points", "number");
        this.characterAC = this.createInput(parent, "Armor class", "number");
        this.characterInitiative = this.createInput(parent, "Initiative bonus", "number");
        this.characterMovement = this.createInput(parent, "Movement allowance", "number");
        this.characterAltitude = this.createInput(parent, "Starting altitude above ground", "number");
        this.configureCharacterDefaults();
        parent.appendChild(this.createButton(
            "CREATE CHARACTER",
            this.handleCreateCharacter.bind(this)
        ));
    }

    configureCharacterDefaults() {
        this.characterLevel.value = "1";
        this.characterHP.value = "12";
        this.characterAC.value = "10";
        this.characterInitiative.value = "0";
        this.characterMovement.value = "30";
        this.configureNumericInput(this.characterAltitude, ALTITUDE_MIN, ALTITUDE_MAX, 0.5, 0);
    }

    handleCreateCharacter() {
        this.run(this.createCharacterFromForm.bind(this));
    }

    createCharacterFromForm() {
        const values = this.readCharacterForm();
        const row = Math.floor(this.mode.gridRows / 2);
        const col = Math.floor(this.mode.gridColumns / 2);
        const character = this.mode.addCharacter(values.name, row, col);
        this.applyCharacterForm(character, values);
        this.mode.setCharacterAltitude(character, values.altitude);
        this.mode.saveCharacters();
        this.mode.refreshUI();
        this.characterName.value = "";
    }

    readCharacterForm() {
        const values = {
            name: this.characterName.value.trim(),
            level: Number(this.characterLevel.value),
            hitPoints: Number(this.characterHP.value),
            armorClass: Number(this.characterAC.value),
            initiative: Number(this.characterInitiative.value),
            movement: Number(this.characterMovement.value),
            altitude: Number(this.characterAltitude.value)
        };
        this.validateCharacterForm(values);
        return values;
    }

    validateCharacterForm(values) {
        if (!values.name) throw new Error("Enter a character name.");
        if (
            !Number.isInteger(values.level) || values.level < 1 ||
            !Number.isFinite(values.hitPoints) || values.hitPoints < 1 ||
            !Number.isFinite(values.armorClass) || values.armorClass < 0 ||
            !Number.isFinite(values.initiative) ||
            !Number.isFinite(values.movement) || values.movement < 0 ||
            !Number.isFinite(values.altitude) ||
            values.altitude < ALTITUDE_MIN || values.altitude > ALTITUDE_MAX
        ) throw new Error("Check the character statistics and altitude.");
    }

    applyCharacterForm(character, values) {
        character.race = this.characterRace.value.trim() || "Unknown";
        character.className = this.characterClass.value.trim() || "Adventurer";
        character.level = values.level;
        character.hitPoints = values.hitPoints;
        character.maxHitPoints = values.hitPoints;
        character.armorClass = values.armorClass;
        character.initiative = values.initiative;
        character.movement = values.movement;
    }

    buildAltitudeControls(parent) {
        this.addSection(parent, "FLIGHT & ALTITUDE");
        this.selectedAltitudeInput = this.createInput(
            parent,
            "Selected character altitude above ground (world units)",
            "number"
        );
        this.configureNumericInput(this.selectedAltitudeInput, ALTITUDE_MIN, ALTITUDE_MAX, 0.5, 0);
        parent.appendChild(this.createButton(
            "APPLY ALTITUDE TO SELECTED CHARACTER",
            this.handleApplySelectedAltitude.bind(this)
        ));
        this.altitudeHelp = this.element(
            "p",
            "Altitude is measured vertically above the sampled terrain surface. Set 0 to place a character on the ground."
        );
        this.altitudeHelp.style.color = "#b7cbd8";
        parent.appendChild(this.altitudeHelp);
    }

    handleApplySelectedAltitude() {
        this.run(this.applySelectedAltitude.bind(this));
    }

    applySelectedAltitude() {
        const character = this.mode.selectedCharacter;
        if (!character) throw new Error("Select a character first.");
        this.mode.setCharacterAltitude(
            character,
            Number(this.selectedAltitudeInput.value)
        );
    }

    buildCharacterRoster(parent) {
        this.addSection(parent, "CHARACTER ROSTER");
        this.characterList = this.element("div");
        parent.appendChild(this.characterList);
    }

    buildSelectedCharacterDetails(parent) {
        this.addSection(parent, "SELECTED CHARACTER");
        this.characterDetails = this.element("div");
        parent.appendChild(this.characterDetails);
    }

    buildSettingsTab() {
        const parent = this.tabContents.settings;
        this.buildMovementColorSettings(parent);
        this.buildInterfaceSettings(parent);
        this.buildControlHelp(parent);
    }

    buildMovementColorSettings(parent) {
        this.addSection(parent, "MOVEMENT COLORS");
        this.movementColor = this.createInput(parent, "Normal movement", "color");
        this.dashColor = this.createInput(parent, "Extended / Dash movement", "color");
        this.movementColor.value = this.colors.movement;
        this.dashColor.value = this.colors.dash;
        parent.appendChild(this.createButton(
            "SAVE MOVEMENT COLORS",
            this.handleSaveMovementColors.bind(this)
        ));
    }

    buildInterfaceSettings(parent) {
        this.addSection(parent, "INTERFACE");
        parent.appendChild(this.createButton("HIDE TACTICAL MENU", this.handleHideMenu.bind(this)));
        parent.appendChild(this.createButton("SHOW TACTICAL MENU", this.handleShowMenu.bind(this)));
    }

    buildControlHelp(parent) {
        this.addSection(parent, "CONTROLS");
        const controls = [
            "M — Toggle tactical menu",
            "ESC — Hide tactical menu",
            "Arrow Left — Previous character",
            "Arrow Right — Next character",
            "Mouse wheel — Zoom camera",
            "Left mouse drag — Camera interaction"
        ];
        for (const description of controls) {
            const item = this.element("p", description);
            item.style.color = "#b7cbd8";
            parent.appendChild(item);
        }
    }

    handleSaveMovementColors() {
        this.colors.movement = this.movementColor.value;
        this.colors.dash = this.dashColor.value;
        this.saveColors();
        this.showMessage("Movement colors saved.");
    }

    handleHideMenu() {
        this.setVisible(false);
    }

    handleShowMenu() {
        this.setVisible(true);
    }

    handleFocusActiveCharacter() {
        this.run(this.zoomToActiveCharacter.bind(this));
    }

    zoomToActiveCharacter() {
        return this.mode.zoomToActiveCharacter();
    }

    applyGridConfiguration() {
        const rows = Number(this.gridRowsInput.value);
        const columns = Number(this.gridColumnsInput.value);
        const cellSize = Number(this.cellSizeInput.value);

        this.mode.setGridConfiguration(rows, columns, cellSize);
    }

    run(callback) {
        try {
            const result = callback();

            if (result && typeof result.then === "function") {
                result.then(
                    this.handleRunSuccess.bind(this),
                    this.handleRunFailure.bind(this)
                );
            } else {
                this.refresh();
            }

            return result;
        } catch (error) {
            this.showMessage(error.message);
            console.error("[DnD UI]", error);
            return null;
        }
    }

    handleRunSuccess() {
        this.refresh();
    }

    handleRunFailure(error) {
        this.showMessage(error.message);
        console.error("[DnD UI]", error);
    }

    createTextRow(parent, label, value) {
        const row = this.element("div");

        Object.assign(row.style, {
            display: "flex",
            justifyContent: "space-between",
            gap: "8px",
            padding: "5px 2px",
            borderBottom: "1px solid rgba(120,160,185,0.2)"
        });

        const left = this.element("span", label);
        const right = this.element(
            "span",
            String(value ?? "—")
        );

        right.style.color = "#9dd8ed";

        row.appendChild(left);
        row.appendChild(right);
        parent.appendChild(row);

        return row;
    }

    refreshInitiative() {
        const list = this.initiativeList;
        list.replaceChildren();

        const battle = this.mode.activeBattle;

        if (!battle?.active) {
            list.textContent = "No active encounter.";
            return;
        }

        for (let index = 0; index < battle.turnOrder.length; index++) {
            this.appendInitiativeEntry(list, battle.turnOrder[index], index, battle);
        }
    }

    appendInitiativeEntry(list, characterId, index, battle) {
        const character = this.mode.characters.get(characterId);
        if (!character) return;
        const active = index === battle.currentTurn;
        const item = this.createButton(
            `${active ? "▶ " : ""}${character.name}`,
            this.handleCharacterSelect.bind(this)
        );
        item.dataset.characterId = characterId;
        item.style.textAlign = "left";
        item.style.background = active ? "#72551b" : "#193b55";
        item.style.color = active ? "#fff0b5" : "#d6e6ef";
        list.appendChild(item);
    }

    handleCharacterSelect(event) {
        const characterId = event.currentTarget.dataset.characterId;
        this.mode.selectCharacter(characterId);
        this.refresh();
    }

    handleRemoveCharacter(event) {
        const characterId = event.currentTarget.dataset.characterId;
        this.run(this.mode.removeCharacter.bind(this.mode, characterId));
    }

    refreshCharacters() {
        const list = this.characterList;
        list.replaceChildren();

        for (const character of this.mode.characters.values()) {
            this.appendCharacterRosterRow(list, character);
        }

        if (!this.mode.characters.size) {
            list.textContent = "No characters created.";
        }

        this.refreshCharacterDetails();
    }

    appendCharacterRosterRow(list, character) {
        const item = document.createElement("div");
        Object.assign(item.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "5px",
            padding: "7px",
            margin: "4px 0",
            background: character.id === this.mode.selectedCharacter?.id ? "#72551b" : "#193b55",
            borderRadius: "4px"
        });
        const select = this.createButton(character.name, this.handleCharacterSelect.bind(this));
        select.dataset.characterId = character.id;
        select.style.flex = "1";
        const remove = this.createButton("×", this.handleRemoveCharacter.bind(this));
        remove.dataset.characterId = character.id;
        remove.style.width = "40px";
        remove.style.background = "#713b40";
        item.append(select, remove);
        list.appendChild(item);
    }

    refreshCharacterDetails() {
        const parent = this.characterDetails;
        parent.replaceChildren();
        const character = this.mode.selectedCharacter;
        if (!character) {
            parent.textContent = "Select a character to view details.";
            return;
        }
        this.appendCharacterSummary(parent, character);
        this.appendCharacterAbilityScores(parent, character);
    }

    appendCharacterSummary(parent, character) {
        this.createTextRow(parent, "Name", character.name);
        this.createTextRow(parent, "Race", character.race);
        this.createTextRow(parent, "Class", character.className);
        this.createTextRow(parent, "Level", character.level);
        this.createTextRow(parent, "Hit points", `${character.hitPoints}/${character.maxHitPoints}`);
        this.createTextRow(parent, "Armor class", character.armorClass);
        this.createTextRow(parent, "Initiative", character.initiative);
        this.createTextRow(parent, "Movement", character.movement);
        this.createTextRow(parent, "Altitude above ground", `${character.position.altitude ?? 0} world units`);
        this.createTextRow(parent, "Grid row", character.position.row);
        this.createTextRow(parent, "Grid column", character.position.col);
    }

    appendCharacterAbilityScores(parent, character) {
        this.addSection(parent, "ABILITY SCORES");
        for (const [ability, score] of Object.entries(character.stats)) {
            this.appendAbilityScore(parent, character, ability, score);
        }
    }

    appendAbilityScore(parent, character, ability, score) {
        const modifier = character.getModifier(ability);
        const sign = modifier >= 0 ? "+" : "";
        this.createTextRow(parent, ability.toUpperCase(), `${score} (${sign}${modifier})`);
    }

    refreshHistory() {
        const parent = this.historyList;
        parent.replaceChildren();
        const battle = this.mode.activeBattle;
        if (!battle || !battle.actions.length) {
            parent.textContent = "No recorded battle events.";
            return;
        }
        const events = battle.actions.slice(-30).reverse();
        for (const event of events) this.appendHistoryEntry(parent, event);
    }

    appendHistoryEntry(parent, event) {
        const character = this.mode.characters.get(event.characterId);
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        const entry = this.createHistoryEntry();
        const heading = this.element("div", `${timestamp} — ${character?.name || "System"}`);
        heading.style.color = "#9dd8ed";
        entry.append(heading, this.element("div", this.describeHistoryEvent(event)));
        parent.appendChild(entry);
    }

    createHistoryEntry() {
        const entry = this.element("div");
        Object.assign(entry.style, {
            padding: "7px",
            margin: "4px 0",
            background: "#193b55",
            borderRadius: "4px",
            overflowWrap: "anywhere"
        });
        return entry;
    }

    describeHistoryEvent(event) {
        if (event.type === "move") return "Movement";
        if (event.type === "action") return `Action: ${event.data.description || "Other"}`;
        if (event.type === "bonus-action") return `Bonus: ${event.data.description || "Other"}`;
        if (event.type === "speech") return `Speech: ${event.data.text}`;
        if (event.type === "other") return `Custom: ${event.data.payload?.type || "Action"}`;
        return event.type;
    }

    refreshBattleStatus() {
        const battle = this.mode.activeBattle;
        const character = this.mode.getActiveCharacter();

        if (!battle?.active) {
            this.battleStatus.textContent =
                "Encounter inactive. Create characters and start a battle.";
            return;
        }

        const resources = battle.currentResources;

        const allowance = (character?.movement ?? 0) * (resources?.dashUsed ? 2 : 1);
        this.battleStatus.textContent = [
            `ROUND ${battle.round}`,
            `ACTIVE: ${character?.name || "Unknown"}`,
            `MOVEMENT: ${resources?.movementUsed || 0}/${allowance}`,
            `ACTION: ${resources?.actionUsed ? "USED" : "AVAILABLE"}`,
            `BONUS: ${resources?.bonusActionUsed ? "USED" : "AVAILABLE"}`,
            `DASH: ${resources?.dashUsed ? "USED" : "AVAILABLE"}`
        ].join("  |  ");
    }

    refresh() {
        if (!this.panel || !this.mode) return;
        this.refreshRegistrationStatus();
        this.refreshBattleControls();
        this.refreshBattleStatus();
        this.refreshInitiative();
        this.refreshCharacters();
        this.refreshHistory();
        this.refreshGridInformation();
        this.refreshAltitudeControl();
    }

    refreshRegistrationStatus() {
        this.status.textContent = `${this.mode.characters.size} characters registered`;
    }

    refreshBattleControls() {
        const battle = this.mode.activeBattle;
        const active = Boolean(battle?.active);
        const resources = battle?.currentResources;
        this.setButtonDisabled(this.startBattleButton, active || !this.mode.characters.size);
        this.setButtonDisabled(this.advanceButton, !active);
        this.setButtonDisabled(this.endBattleButton, !active);
        this.setButtonDisabled(this.actionButton, !active || Boolean(resources?.actionUsed));
        this.setButtonDisabled(this.bonusButton, !active || Boolean(resources?.bonusActionUsed));
        this.previewButton.disabled = !active;
        this.previewButton.style.opacity = active ? "1" : "0.45";
    }

    setButtonDisabled(button, disabled) {
        button.disabled = disabled;
        button.style.opacity = disabled ? "0.45" : "1";
    }

    refreshGridInformation() {
        this.gridInfo.textContent = [
            `Dimensions: ${this.mode.gridRows} rows × ${this.mode.gridColumns} columns`,
            `Cell size: ${this.mode.cellSize} world units`,
            `Total width: ${this.mode.gridColumns * this.mode.cellSize}`,
            `Total depth: ${this.mode.gridRows * this.mode.cellSize}`,
            `Origin: ${this.mode.gridOrigin.x}, ${this.mode.gridOrigin.z}`
        ].join("\n");
        this.gridRowsInput.value = String(this.mode.gridRows);
        this.gridColumnsInput.value = String(this.mode.gridColumns);
        this.cellSizeInput.value = String(this.mode.cellSize);
        this.refreshMovementPreviewLabel();
    }

    refreshMovementPreviewLabel() {
        this.previewButton.textContent = this.mode.movementPreview
            ? "DISABLE MOVEMENT PREVIEW"
            : "ENABLE MOVEMENT PREVIEW";
    }

    refreshAltitudeControl() {
        const selected = this.mode.selectedCharacter;
        this.selectedAltitudeInput.value = String(selected?.position.altitude ?? 0);
        this.selectedAltitudeInput.disabled = !selected;
    }

    showMessage(message) {
        if (!this.message) return;

        this.message.textContent = String(message);

        this.message.style.color = "#ffd27d";
    }

    toggle() {
        this.setVisible(!this.visible);
    }

    setVisible(visible) {
        this.visible = Boolean(visible);

        if (this.panel) {
            this.panel.style.display =
                this.visible ? "block" : "none";
        }

        if (this.toggleButton) {
            this.toggleButton.textContent =
                this.visible ? "× HIDE MENU" : "☰ D&D MENU";
        }
    }

    dispose() {
        if (this.disposed) return;

        this.disposed = true;

        window.removeEventListener(
            "keydown",
            this.onKeyDown
        );

        this.toggleButton?.remove();
        this.focusButton?.remove();
        this.panel?.remove();

        this.panel = null;
        this.toggleButton = null;
        this.focusButton = null;

        this.tabContents = {};
        this.tabBar = null;
    }
}

export { DnDTacticalUI };

