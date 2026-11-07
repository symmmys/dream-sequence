
const DEFAULT_STATS = {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
};

function cloneData(value) {
    if (value === undefined || value === null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value));
}

class DnDCharacter {
    constructor(options = {}) {
        this.id = options.id || crypto.randomUUID();
        this.name = options.name || "Adventurer";
        this.race = options.race || "Unknown";
        this.className = options.className || "Adventurer";
        this.level = options.level || 1;

        this.stats = {
            ...DEFAULT_STATS,
            ...(options.stats || {})
        };

        this.hitPoints = options.hitPoints ?? 12;
        this.maxHitPoints = options.maxHitPoints ?? 12;
        this.armorClass = options.armorClass ?? 10;
        this.initiative = options.initiative ?? 0;
        this.movement = options.movement ?? 30;

        this.position = {
            x: options.position?.x ?? 0,
            y: options.position?.y ?? 0,
            z: options.position?.z ?? 0,
            row: options.position?.row ?? 0,
            col: options.position?.col ?? 0,
            altitude: Math.max(
                0,
                Number.isFinite(options.position?.altitude)
                    ? options.position.altitude
                    : 0
            )
        };

        this.genetics = {
            genome: cloneData(options.genetics?.genome) ?? {},
            ancestry: cloneData(options.genetics?.ancestry) ?? [],
            mutations: cloneData(options.genetics?.mutations) ?? []
        };

        this.materialProperties = {
            density: options.materialProperties?.density ?? 1,
            hardness: options.materialProperties?.hardness ?? 1,
            elasticity: options.materialProperties?.elasticity ?? 1,
            thermalConductivity:
                options.materialProperties?.thermalConductivity ?? 1,
            composition:
                options.materialProperties?.composition ?? "organic"
        };

        this.equipment = cloneData(options.equipment) ?? [];
        this.conditions = cloneData(options.conditions) ?? [];
    }

    getModifier(attribute) {
        const score = this.stats[attribute];

        if (typeof score !== "number") {
            throw new Error(`Unknown attribute: ${attribute}`);
        }

        return Math.floor((score - 10) / 2);
    }

    takeDamage(amount) {
        this.hitPoints = Math.max(
            0,
            this.hitPoints - Math.max(0, amount)
        );
    }

    heal(amount) {
        this.hitPoints = Math.min(
            this.maxHitPoints,
            this.hitPoints + Math.max(0, amount)
        );
    }

    // Explicit serialization avoids calling toJSON recursively.
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            race: this.race,
            className: this.className,
            level: this.level,

            stats: { ...this.stats },

            hitPoints: this.hitPoints,
            maxHitPoints: this.maxHitPoints,
            armorClass: this.armorClass,
            initiative: this.initiative,
            movement: this.movement,

            position: { ...this.position },

            genetics: cloneData(this.genetics),
            materialProperties: cloneData(this.materialProperties),

            equipment: cloneData(this.equipment),
            conditions: cloneData(this.conditions)
        };
    }

    static fromJSON(data) {
        return new DnDCharacter(data);
    }
}

export { DnDCharacter };

