
/**
 * FloorPlanHeightControl
 *
 * Controls architectural wall height and thickness.
 * FloorPlanBuilder remains the authoritative owner.
 */
class FloorPlanHeightControl {
    constructor(container, builder, onCommit = null) {
        if (!container || !builder) {
            throw new Error(
                "Wall controls require a container and builder."
            );
        }

        this.container = container;
        this.builder = builder;
        this.onCommit = onCommit;

        this.element = document.createElement("section");

        Object.assign(this.element.style, {
            display: "grid",
            gap: "9px",
            margin: "12px 0",
            padding: "12px",
            background: "rgba(255,255,255,0.07)",
            borderRadius: "6px"
        });

        this.element.innerHTML = `
            <strong>ARCHITECTURAL WALLS</strong>

            <label>
                Wall height
                <output data-value="height"></output>
                <input data-setting="height"
                    type="range"
                    min="2.4"
                    max="1000"
                    step="0.1">
                <input data-number="height"
                    type="number"
                    min="2.4"
                    max="1000"
                    step="0.1">
            </label>

            <label>
                Wall thickness
                <output data-value="thickness"></output>
                <input data-setting="thickness"
                    type="range"
                    min="0.1"
                    max="1000"
                    step="0.1">
                <input data-number="thickness"
                    type="number"
                    min="0.1"
                    max="1000"
                    step="0.1">
            </label>

            <small>
                Thickness controls the horizontal depth
                of generated walls.
            </small>
        `;

        const buildButton =
            container.querySelector("#build-floor");

        if (buildButton) {
            buildButton.after(this.element);
        } else {
            container.appendChild(this.element);
        }

        this.controls = {
            height: {
                slider: this.element.querySelector(
                    '[data-setting="height"]'
                ),
                number: this.element.querySelector(
                    '[data-number="height"]'
                ),
                output: this.element.querySelector(
                    '[data-value="height"]'
                ),
                setter: value =>
                    builder.setWallHeight(value),
                initial: builder.wallHeight
            },
            thickness: {
                slider: this.element.querySelector(
                    '[data-setting="thickness"]'
                ),
                number: this.element.querySelector(
                    '[data-number="thickness"]'
                ),
                output: this.element.querySelector(
                    '[data-value="thickness"]'
                ),
                setter: value =>
                    builder.setWallThickness(value),
                initial: builder.wallThickness
            }
        };

        for (const [name, control] of Object.entries(
            this.controls
        )) {
            control.slider.value = control.initial;
            control.number.value = control.initial;

            control.slider.addEventListener(
                "input",
                () => {
                    control.number.value =
                        control.slider.value;

                    this.updateLabel(name);
                }
            );

            control.number.addEventListener(
                "change",
                () => {
                    control.slider.value =
                        control.number.value;

                    this.commit(name);
                }
            );

            control.slider.addEventListener(
                "change",
                () => this.commit(name)
            );

            this.updateLabel(name);
        }
    }

    updateLabel(name) {
        const control = this.controls[name];

        control.output.textContent =
            `${Number(control.slider.value).toFixed(1)} units`;
    }

    commit(name) {
        const control = this.controls[name];

        try {
            const value = Number(control.number.value);

            if (!Number.isFinite(value)) {
                throw new Error("Invalid wall dimension.");
            }

            control.setter(value);

            control.slider.value = value;
            control.number.value = value;

            this.updateLabel(name);
            this.onCommit?.(name, value);

        } catch (error) {
            console.error(
                "[FloorPlanHeightControl]",
                error
            );

            control.slider.value =
                String(control.initial = (
                    name === "height"
                        ? this.builder.wallHeight
                        : this.builder.wallThickness
                ));

            control.number.value = control.slider.value;

            this.updateLabel(name);
        }
    }

    dispose() {
        this.element.remove();
    }
}

export { FloorPlanHeightControl };

