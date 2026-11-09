
const SAVE_VERSION = 2;

function compareInitiative(first, second) {
    return getInitiativeScore(second) - getInitiativeScore(first);
}

function getInitiativeScore(character) {
    return character.initiative + character.getModifier("dexterity");
}

function getCharacterId(character) {
    return character.id;
}

function isDashAction(description) {
    return typeof description === "string" &&
        description.trim().toLowerCase() === "dash";
}

function cloneData(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

class DnDBattle {
    constructor(options = {}) {
        this.id = options.id || crypto.randomUUID();
        this.name = options.name || "Untitled Battle";

        this.characterIds = [...(options.characterIds || [])];
        this.turnOrder = [...(options.turnOrder || [])];

        this.currentTurn = options.currentTurn ?? 0;
        this.round = options.round ?? 1;

        this.actions = cloneData(options.actions || []);
        this.active = options.active ?? false;

        this.createdAt = options.createdAt || Date.now();
        this.updatedAt = options.updatedAt || this.createdAt;

        this.turnResources = cloneData(
            options.turnResources || {}
        );

        this.metadata = cloneData(options.metadata || {});
    }

    addCharacter(character) {
        if (!this.characterIds.includes(character.id)) {
            this.characterIds.push(character.id);
        }
    }

    start(characters) {
        const eligibleCharacters = [];
        for (const character of characters) {
            if (this.characterIds.includes(character.id)) {
                eligibleCharacters.push(character);
            }
        }

        eligibleCharacters.sort(compareInitiative);
        this.turnOrder = eligibleCharacters.map(getCharacterId);

        if (!this.turnOrder.length) {
            throw new Error(
                "A battle needs at least one character."
            );
        }

        this.currentTurn = 0;
        this.round = 1;
        this.active = true;

        this.beginCharacterTurn(this.activeCharacterId);

        this.record("battle-start", {
            round: this.round,
            turnOrder: [...this.turnOrder]
        });
    }

    get activeCharacterId() {
        return this.active
            ? this.turnOrder[this.currentTurn] ?? null
            : null;
    }

    get currentResources() {
        return this.turnResources[this.activeCharacterId] || null;
    }

    beginCharacterTurn(characterId) {
        this.turnResources[characterId] = {
            actionUsed: false,
            bonusActionUsed: false,
            dashUsed: false,
            movementUsed: 0,
            speechCount: 0
        };

        this.record("turn-start", {
            characterId,
            round: this.round
        });
    }

    assertActiveCharacter(character) {
        if (!this.active) {
            throw new Error("Battle is not active.");
        }

        if (
            !character ||
            character.id !== this.activeCharacterId
        ) {
            throw new Error(
                "It is not this character's turn."
            );
        }
    }

    record(type, data = {}) {
        const event = {
            id: crypto.randomUUID(),
            index: this.actions.length,
            round: this.round,
            turn: this.currentTurn,
            characterId: this.activeCharacterId,
            timestamp: Date.now(),
            type,
            data: cloneData(data)
        };

        this.actions.push(event);
        this.updatedAt = event.timestamp;

        return event;
    }

    useAction(character, payload = {}) {
        this.assertActiveCharacter(character);

        const resources = this.currentResources;

        if (resources.actionUsed) {
            throw new Error(
                "This character has already used their action."
            );
        }

        resources.actionUsed = true;

        resources.dashUsed = isDashAction(payload.description);

        return this.record("action", {
            characterId: character.id,
            ...cloneData(payload)
        });
    }

    useBonusAction(character, payload = {}) {
        this.assertActiveCharacter(character);

        const resources = this.currentResources;

        if (resources.bonusActionUsed) {
            throw new Error(
                "This character has already used their bonus action."
            );
        }

        resources.bonusActionUsed = true;

        return this.record("bonus-action", {
            characterId: character.id,
            ...cloneData(payload)
        });
    }

    move(character, position, distance) {
        this.assertActiveCharacter(character);

        const resources = this.currentResources;

        if (!Number.isFinite(distance) || distance < 0) {
            throw new Error("Invalid movement distance.");
        }

        const allowance = character.movement *
            (resources.dashUsed ? 2 : 1);

        const remaining = Math.max(
            0,
            allowance - resources.movementUsed
        );

        if (distance > remaining) {
            throw new Error(
                "Movement exceeds remaining allowance."
            );
        }

        const from = { ...character.position };

        character.position = { ...position };
        resources.movementUsed += distance;

        return this.record("move", {
            characterId: character.id,
            from,
            to: { ...position },
            distance,
            remainingMovement:
                allowance - resources.movementUsed,
            dashUsed: resources.dashUsed
        });
    }

    speak(character, text) {
        this.assertActiveCharacter(character);

        if (typeof text !== "string" || !text.trim()) {
            throw new Error("Speech cannot be empty.");
        }

        this.currentResources.speechCount++;

        return this.record("speech", {
            characterId: character.id,
            text: text.trim()
        });
    }

    useOther(character, payload) {
        this.assertActiveCharacter(character);

        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
        ) {
            throw new Error(
                "Other actions require a JSON object."
            );
        }

        return this.record("other", {
            characterId: character.id,
            payload: cloneData(payload)
        });
    }

    advanceTurn() {
        if (!this.active) return;

        this.currentTurn++;

        if (this.currentTurn >= this.turnOrder.length) {
            this.currentTurn = 0;
            this.round++;
        }

        this.beginCharacterTurn(this.activeCharacterId);

        this.record("turn-advance", {
            characterId: this.activeCharacterId,
            round: this.round
        });
    }

    stop() {
        if (!this.active) return;

        this.record("battle-end");
        this.active = false;
    }

    toJSON() {
        return {
            version: SAVE_VERSION,
            id: this.id,
            name: this.name,
            characterIds: [...this.characterIds],
            turnOrder: [...this.turnOrder],
            currentTurn: this.currentTurn,
            round: this.round,
            actions: cloneData(this.actions),
            active: this.active,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            turnResources: cloneData(this.turnResources),
            metadata: cloneData(this.metadata)
        };
    }

    static fromJSON(data) {
        if (!data || typeof data !== "object") {
            throw new Error("Invalid battle save.");
        }

        const battle = new DnDBattle(data);

        if (
            !Number.isInteger(battle.currentTurn) ||
            battle.currentTurn < 0 ||
            (
                battle.turnOrder.length > 0 &&
                battle.currentTurn >= battle.turnOrder.length
            )
        ) {
            throw new Error(
                "Invalid saved initiative position."
            );
        }

        if (
            !Number.isInteger(battle.round) ||
            battle.round < 1
        ) {
            throw new Error("Invalid saved battle round.");
        }

        for (const id of battle.turnOrder) {
            const resources = battle.turnResources[id];

            if (!resources) {
                battle.turnResources[id] = {
                    actionUsed: false,
                    bonusActionUsed: false,
                    dashUsed: false,
                    movementUsed: 0,
                    speechCount: 0
                };
            } else {
                resources.dashUsed ??= false;
            }
        }

        return battle;
    }
}

export { DnDBattle };

