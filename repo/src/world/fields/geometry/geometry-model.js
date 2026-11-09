
class GeometryModel {

    constructor(name) {

        this.name = name;

    }

    metricAt() {

        throw new Error(
            "GeometryModel.metricAt() must be implemented."
        );

    }

    distance(a, b) {

        throw new Error(
            "GeometryModel.distance() must be implemented."
        );

    }

}

export { GeometryModel };

