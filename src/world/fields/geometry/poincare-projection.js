
/**
 * PoincareProjection
 *
 * Maps Somnium's finite 3D world into an open
 * three-dimensional Poincare ball.
 *
 * All three spatial dimensions participate
 * in the transformation.
 *
 * The world boundary approaches the ball
 * boundary asymptotically.
 */

class PoincareProjection {

    constructor(options = {}) {

        this.bounds = {
            minX: options.minX ?? -500000,
            maxX: options.maxX ?? 500000,

            minY: options.minY ?? -2000,
            maxY: options.maxY ?? 1000,

            minZ: options.minZ ?? -500000,
            maxZ: options.maxZ ?? 500000
        };

        this.curvature = options.curvature ?? -1;

        if (
            !Number.isFinite(this.curvature) ||
            this.curvature >= 0
        ) {
            throw new Error(
                "Poincare curvature must be negative."
            );
        }

        this.k = -this.curvature;

        this.radius = 1 / Math.sqrt(this.k);

	this.characteristicLength =
options.characteristicLength ?? 100000;

        this.boundaryEpsilon =
            options.boundaryEpsilon ?? 1e-9;

        if (
            !Number.isFinite(this.characteristicLength) ||
            this.characteristicLength <= 0
        ) {
            throw new Error(
                "Invalid characteristic length."
            );
        }

        if (
            !Number.isFinite(this.boundaryEpsilon) ||
            this.boundaryEpsilon <= 0 ||
            this.boundaryEpsilon >= 0.01
        ) {
            throw new Error(
                "Invalid boundary epsilon."
            );
        }

        this.center = {
            x: (this.bounds.minX + this.bounds.maxX) / 2,
            y: (this.bounds.minY + this.bounds.maxY) / 2,
            z: (this.bounds.minZ + this.bounds.maxZ) / 2
        };

        this.validateBounds();
    }

    // -----------------------------------------
    // VALIDATION
    // -----------------------------------------

    validateBounds() {

        const values = Object.values(this.bounds);

        if (
            !values.every(Number.isFinite) ||
            this.bounds.minX >= this.bounds.maxX ||
            this.bounds.minY >= this.bounds.maxY ||
            this.bounds.minZ >= this.bounds.maxZ
        ) {
            throw new Error(
                "Invalid three-dimensional world bounds."
            );
        }
    }

    validatePosition(position) {

        if (
            !position ||
            !Number.isFinite(position.x) ||
            !Number.isFinite(position.y) ||
            !Number.isFinite(position.z)
        ) {
            throw new TypeError(
                "Invalid three-dimensional position."
            );
        }
    }

    // -----------------------------------------
    // WORLD BOUNDARY DISTANCE
    // -----------------------------------------

    getBoundaryDistance(direction) {

        const b = this.bounds;

        const distances = [];

        if (direction.x > 0) {
            distances.push(
                (b.maxX - this.center.x) / direction.x
            );
        } else if (direction.x < 0) {
            distances.push(
                (b.minX - this.center.x) / direction.x
            );
        }

        if (direction.y > 0) {
            distances.push(
                (b.maxY - this.center.y) / direction.y
            );
        } else if (direction.y < 0) {
            distances.push(
                (b.minY - this.center.y) / direction.y
            );
        }

        if (direction.z > 0) {
            distances.push(
                (b.maxZ - this.center.z) / direction.z
            );
        } else if (direction.z < 0) {
            distances.push(
                (b.minZ - this.center.z) / direction.z
            );
        }

        return Math.min(...distances);
    }

    // -----------------------------------------
    // WORLD TO POINCARE BALL
    // -----------------------------------------

    worldToBall(position) {

        this.validatePosition(position);

        const dx = position.x - this.center.x;
        const dy = position.y - this.center.y;
        const dz = position.z - this.center.z;

        const distance = Math.hypot(dx, dy, dz);

        if (distance === 0) {
            return { x: 0, y: 0, z: 0 };
        }

        const direction = {
            x: dx / distance,
            y: dy / distance,
            z: dz / distance
        };

        const boundaryDistance =
            this.getBoundaryDistance(direction);

        const normalizedRadius =
            distance / boundaryDistance;

        if (
            normalizedRadius < 0 ||
            normalizedRadius > 1 + 1e-10
        ) {
            throw new RangeError(
                "Position lies outside world bounds."
            );
        }

        // Clamp exact boundary positions slightly inward.
        // The mathematical boundary remains unreachable.

        const u = Math.min(
            normalizedRadius,
            1 - this.boundaryEpsilon
        );

        // Compactify the finite world.

        const hyperbolicDistance =
            this.characteristicLength *
            u / (1 - u);

        // Hyperbolic radial projection.

const projectedRadius = Math.min(
    this.radius * Math.tanh(
        hyperbolicDistance / (2 * this.radius)
    ),
    this.radius * (1 - this.boundaryEpsilon)
);
	
        return {
            x: direction.x * projectedRadius,
            y: direction.y * projectedRadius,
            z: direction.z * projectedRadius
        };
    }

    // -----------------------------------------
    // POINCARE BALL TO WORLD
    // -----------------------------------------

    ballToWorld(position) {

        this.validatePosition(position);

        const radius = Math.hypot(
            position.x,
            position.y,
            position.z
        );

        if (radius >= this.radius) {
            throw new RangeError(
                "Position is outside the open Poincare ball."
            );
        }

        if (radius === 0) {
            return { ...this.center };
        }

        const direction = {
            x: position.x / radius,
            y: position.y / radius,
            z: position.z / radius
        };

        const ratio = radius / this.radius;

        const hyperbolicDistance =
            2 * this.radius * Math.atanh(ratio);

        const u =
            hyperbolicDistance /
            (
                this.characteristicLength +
                hyperbolicDistance
            );

        const boundaryDistance =
            this.getBoundaryDistance(direction);

        const worldDistance =
            u * boundaryDistance;

        return {
            x: this.center.x +
                direction.x * worldDistance,

            y: this.center.y +
                direction.y * worldDistance,

            z: this.center.z +
                direction.z * worldDistance
        };
    }

    // -----------------------------------------
    // PROJECTION INFORMATION
    // -----------------------------------------

    getInfo() {

        return {
            geometry: "poincare-3d",

            dimensions: 3,

            curvature: this.curvature,

            radius: this.radius,

            center: { ...this.center },

            bounds: { ...this.bounds },

            characteristicLength:
                this.characteristicLength,

            boundaryReachable: false
        };
    }
}

export { PoincareProjection };

