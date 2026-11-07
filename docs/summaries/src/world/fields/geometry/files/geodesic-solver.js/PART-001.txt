
class GeodesicSolver {

    constructor(geometry, options = {}) {

        this.geometry = geometry;

        this.iterations =
            options.iterations ?? 80;

        this.relaxation =
            options.relaxation ?? 0.15;

        this.segments =
            options.segments ?? 24;

    }

    solve(start, end) {

        const points = [];

        for (
            let i = 0;
            i <= this.segments;
            i++
        ) {

            const t = i / this.segments;

            points.push({

                x: start.x + (end.x - start.x) * t,

                y: start.y + (end.y - start.y) * t,

                z: start.z + (end.z - start.z) * t

            });

        }

        const step = this.relaxation;

        for (
            let iteration = 0;
            iteration < this.iterations;
            iteration++
        ) {

            for (
                let i = 1;
                i < points.length - 1;
                i++
            ) {

                const previous = points[i - 1];

                const current = points[i];

                const next = points[i + 1];

                const midpoint = {

                    x: (previous.x + next.x) * 0.5,

                    y: (previous.y + next.y) * 0.5,

                    z: (previous.z + next.z) * 0.5

                };

                const candidate = {

                    x: current.x +
                        (midpoint.x - current.x) * step,

                    y: current.y +
                        (midpoint.y - current.y) * step,

                    z: current.z +
                        (midpoint.z - current.z) * step

                };

                // Reject candidates outside bounded geometries.
                if (
                    typeof this.geometry.isInside === "function" &&
                    !this.geometry.isInside(candidate)
                ) {
                    continue;
                }

                points[i] = candidate;

            }

        }

        return {

            points,

            length: this.calculateLength(points)

        };

    }

    calculateLength(points) {

        let length = 0;

        for (
            let i = 0;
            i < points.length - 1;
            i++
        ) {

            length += this.geometry.distance(
                points[i],
                points[i + 1]
            );

        }

        return length;

    }

}

export { GeodesicSolver };

