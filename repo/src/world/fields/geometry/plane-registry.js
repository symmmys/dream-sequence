/** Stable Plane identities and versioned, serializable Plane authoring data. */

const PLANE_REGISTRY_SCHEMA_VERSION = 1;
const PLANE_DEFINITION_SCHEMA_VERSION = 2;
const DEFAULT_CONTAINER_DIMENSIONS = Object.freeze({ w: 10, x: 100, y: 60, z: 100 });
const PRIMITIVE_OBJECT_TYPES = new Set(['box', 'sphere', 'cylinder', 'torus', 'label', 'hypercube4d']);

class PlaneRegistry {
    #planes = new Map();

    constructor(planes = []) {
        for (const plane of planes) this.register(plane);
    }

    register(input) {
        const plane = createPlaneDefinition(input);
        if (this.#planes.has(plane.id)) throw new Error(`Plane already registered: ${plane.id}`);
        this.#planes.set(plane.id, plane);
        return cloneRecord(plane);
    }

    upsert(input) {
        const plane = createPlaneDefinition(input);
        this.#planes.set(plane.id, plane);
        return cloneRecord(plane);
    }

    unregister(planeId, options = {}) {
        if (!this.#planes.has(planeId)) return false;
        if (options.isReferenced?.(planeId)) {
            throw new Error(`Cannot unregister Plane ${planeId}: anomaly endpoints still reference it.`);
        }
        return this.#planes.delete(planeId);
    }

    has(planeId) { return this.#planes.has(planeId); }

    get(planeId) {
        const plane = this.#planes.get(planeId);
        return plane ? cloneRecord(plane) : null;
    }

    require(planeId) {
        const plane = this.get(planeId);
        if (!plane) throw new Error(`Unknown Plane: ${planeId}`);
        return plane;
    }

    list() {
        return Array.from(this.#planes.values(), cloneRecord)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    toJSON() {
        return { schemaVersion: PLANE_REGISTRY_SCHEMA_VERSION, planes: this.list() };
    }

    static fromJSON(data) {
        if (!data || data.schemaVersion !== PLANE_REGISTRY_SCHEMA_VERSION || !Array.isArray(data.planes)) {
            throw new TypeError('Invalid Plane registry data.');
        }
        // createPlaneDefinition upgrades older v1 Plane records as they enter the registry.
        return new PlaneRegistry(data.planes);
    }
}

/**
 * Normalize legacy v1 Plane records into the v2 authoring schema.
 * The existing frame remains the authoritative ambient 4D coordinate frame;
 * object positions are local XYZ coordinates and container W thickness is
 * centered on frame.origin.w (or the legacy w field).
 */
function createPlaneDefinition(input = {}) {
    if (input.schemaVersion !== undefined && input.schemaVersion > PLANE_DEFINITION_SCHEMA_VERSION) {
        throw new RangeError(`Unsupported Plane definition schema version: ${input.schemaVersion}`);
    }
    const id = requireText(input.id, 'Plane id');
    const displayName = requireText(input.displayName ?? input.name, 'Plane display name');
    const geometry = requireText(input.geometry ?? 'unknown', 'Plane geometry');
    const frame = input.frame ? cloneRecord(input.frame) : null;
    const legacyW = Number.isFinite(input.w) ? input.w : null;
    const frameW = Number.isFinite(frame?.origin?.w) ? frame.origin.w : legacyW ?? 0;
    const containerInput = input.container ?? {};
    const dimensions = normalizeDimensions(containerInput.dimensions ?? DEFAULT_CONTAINER_DIMENSIONS);
    const boundaryInput = containerInput.boundary ?? {};
    if (input.objects !== undefined && !Array.isArray(input.objects)) {
        throw new TypeError('Plane objects must be an array.');
    }
    const objects = (input.objects ?? []).map(createPlaneObjectDefinition);
    const definition = {
        schemaVersion: PLANE_DEFINITION_SCHEMA_VERSION,
        id,
        displayName,
        geometry,
        seed: Number.isSafeInteger(input.seed) ? input.seed : null,
        // Explicit ambient W placement is convenient for editor controls; the
        // frame remains authoritative for its full orientation and XYZ origin.
        w: frameW,
        frame,
        // Keep W thickness in the Plane container, while frame.origin.w defines
        // its center in ambient 4D space. XYZ dimensions use Plane-local units.
        container: {
            type: requireText(containerInput.type ?? 'box', 'Plane container type'),
            dimensions,
            boundary: {
                visible: boundaryInput.visible === true,
                color: normalizeColor(boundaryInput.color ?? '#8aa4c8'),
                opacity: normalizeUnit(boundaryInput.opacity ?? 0.35, 'container boundary opacity')
            },
            backgroundColor: normalizeColor(containerInput.backgroundColor ?? '#101827'),
            backgroundOpacity: normalizeUnit(containerInput.backgroundOpacity ?? 1, 'container background opacity')
        },
        objects,
        source: input.source ?? 'project',
        metadata: cloneRecord(input.metadata ?? {})
    };
    return definition;
}

function createPlaneObjectDefinition(input = {}) {
    const id = requireText(input.id, 'Plane object id');
    const type = requireText(input.type, 'Plane object type');
    if (!PRIMITIVE_OBJECT_TYPES.has(type)) throw new RangeError(`Unsupported Plane object type: ${type}`);
    const position = normalizeVector3(input.position ?? {}, 'object position');
    const rotation = normalizeVector3(input.rotation ?? {}, 'object rotation', 0);
    const dimensions = normalizeDimensions3(input.dimensions ?? input.scale ?? { x: 1, y: 1, z: 1 });
    const material = cloneRecord(input.material ?? {});
    if (material.color !== undefined) material.color = normalizeColor(material.color);
    const record = {
        schemaVersion: 1,
        id,
        type,
        name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : id,
        position,
        rotation,
        dimensions,
        visible: input.visible !== false,
        material,
        parameters: cloneRecord(input.parameters ?? {})
    };
    if (type === 'label') {
        record.text = String(input.text ?? '');
        record.parameters.width = positiveNumber(record.parameters.width ?? 8, 'label width');
        record.parameters.billboard = record.parameters.billboard !== false;
    }
    if (type === 'hypercube4d') {
        record.parameters.halfExtent = positiveNumber(record.parameters.halfExtent ?? 1, 'hypercube halfExtent');
    }
    return record;
}

function normalizeDimensions(input) {
    const dimensions = {};
    for (const axis of ['w', 'x', 'y', 'z']) {
        dimensions[axis] = positiveNumber(input[axis] ?? DEFAULT_CONTAINER_DIMENSIONS[axis], `container ${axis} dimension`);
    }
    return dimensions;
}

function normalizeDimensions3(input) {
    const dimensions = {};
    for (const axis of ['x', 'y', 'z']) {
        dimensions[axis] = positiveNumber(input[axis] ?? 1, `object ${axis} dimension`);
    }
    return dimensions;
}

function normalizeVector3(input, label, fallback = 0) {
    const vector = {};
    for (const axis of ['x', 'y', 'z']) {
        const value = input[axis] ?? fallback;
        if (!Number.isFinite(value)) throw new TypeError(`${label} ${axis} must be finite.`);
        vector[axis] = value;
    }
    return vector;
}

function positiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
    return value;
}

function normalizeUnit(value, label) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1.`);
    return value;
}

function normalizeColor(value) {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new TypeError('Plane colors must be six-digit hexadecimal colors.');
    }
    return value.toLowerCase();
}

function createDemoPlaneDefinitions(topology) {
    if (!topology || typeof topology.toJSON !== 'function') {
        throw new TypeError('Demo Plane definitions require a WorldTopology.');
    }
    const displayNames = new Map([
        ['geometry-demo-room', 'Poincaré Room'],
        ['geometry-demo-4d-chamber', '4D Room'],
        ['somnium-main', 'Main World']
    ]);
    return topology.toJSON().slices.map(slice => createPlaneDefinition({
        id: slice.id,
        displayName: displayNames.get(slice.id) ?? slice.id,
        geometry: slice.geometry,
        seed: slice.seed,
        frame: slice.frame,
        w: slice.w,
        source: 'built-in-demo'
    }));
}

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function cloneRecord(value) { return JSON.parse(JSON.stringify(value)); }

export {
    PLANE_REGISTRY_SCHEMA_VERSION,
    PLANE_DEFINITION_SCHEMA_VERSION,
    DEFAULT_CONTAINER_DIMENSIONS,
    PlaneRegistry,
    createPlaneDefinition,
    createPlaneObjectDefinition,
    createDemoPlaneDefinitions
};
