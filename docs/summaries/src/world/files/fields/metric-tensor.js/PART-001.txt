
class MetricTensor {

    constructor(values = null) {

        this.values = values
            ? Array.from(values)
            : [
                1, 0, 0,
                0, 1, 0,
                0, 0, 1
            ];

        this.validate();

    }

    validate() {

        if (this.values.length !== 9) {
            throw new Error("MetricTensor requires 9 values.");
        }

        if (!this.values.every(Number.isFinite)) {
            throw new Error("Metric contains non-finite values.");
        }

        const m = this.values;
        const tolerance = 1e-10;

        if (
            Math.abs(m[1] - m[3]) > tolerance ||
            Math.abs(m[2] - m[6]) > tolerance ||
            Math.abs(m[5] - m[7]) > tolerance
        ) {
            throw new Error("Metric must be symmetric.");
        }

        this.cholesky();

    }

    cholesky() {

        const m = this.values;

        const L = new Array(9).fill(0);

        for (let i = 0; i < 3; i++) {

            for (let j = 0; j <= i; j++) {

                let sum = m[i * 3 + j];

                for (let k = 0; k < j; k++) {

                    sum -=
                        L[i * 3 + k] *
                        L[j * 3 + k];

                }

                if (i === j) {

                    if (sum <= 0 || !Number.isFinite(sum)) {
                        throw new Error(
                            "Metric must be positive definite."
                        );
                    }

                    L[i * 3 + j] = Math.sqrt(sum);

                } else {

                    L[i * 3 + j] =
                        sum / L[j * 3 + j];

                }

            }

        }

        return L;

    }

    determinant() {

        const L = this.cholesky();

        const d =
            L[0] * L[4] * L[8];

        return d * d;

    }

    quadraticForm(vector) {

        const m = this.values;

        const x = [vector.x, vector.y, vector.z];

        let result = 0;

        for (let i = 0; i < 3; i++) {

            for (let j = 0; j < 3; j++) {

                result +=
                    x[i] * m[i * 3 + j] * x[j];

            }

        }

        return result;

    }

    norm(vector) {

        return Math.sqrt(
            Math.max(0, this.quadraticForm(vector))
        );

    }

    static identity() {

        return new MetricTensor();

    }

    static interpolate(a, b, t) {

        const A = a.cholesky();
        const B = b.cholesky();

        const L = new Array(9).fill(0);

        for (let i = 0; i < 9; i++) {

            L[i] =
                A[i] + (B[i] - A[i]) * t;

        }

        const values = new Array(9).fill(0);

        // G = L * transpose(L)

        for (let i = 0; i < 3; i++) {

            for (let j = 0; j < 3; j++) {

                for (let k = 0; k < 3; k++) {

                    values[i * 3 + j] +=
                        L[i * 3 + k] *
                        L[j * 3 + k];

                }

            }

        }

        return new MetricTensor(values);

    }

}

export { MetricTensor };

