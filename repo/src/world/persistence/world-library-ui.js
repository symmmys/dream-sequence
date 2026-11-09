
class WorldLibraryUI {
    constructor(persistence, callbacks = {}) {
        this.persistence = persistence;
        this.callbacks = callbacks;
        this.currentWorldId = null;
        this.container = null;
        this.create();
    }

    create() {
        this.container = document.createElement("div");

        Object.assign(this.container.style, {
            position: "fixed",
            inset: "0",
            zIndex: "2000",
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.82)",
            color: "white",
            fontFamily: "Arial, sans-serif"
        });

        this.container.innerHTML = `
            <section style="
                width:min(620px,90vw);
                max-height:85vh;
                overflow:auto;
                padding:28px;
                border-radius:14px;
                background:#18202b;
                box-shadow:0 20px 80px #000;
            ">
                <h2>SOMNIUM WORLDS</h2>

                <p style="color:#aab5c4">
                    Create and manage persistent worlds.
                </p>

                <div style="display:flex;gap:8px">
                    <input
                        id="world-name"
                        placeholder="New world name"
                        style="flex:1;padding:12px"
                    />

                    <button id="world-create">
                        CREATE
                    </button>
                </div>

                <hr style="margin:22px 0">

                <div id="world-list"></div>

                <hr style="margin:22px 0">

                <div style="display:flex;gap:8px">
                    <button id="world-save">
                        SAVE CURRENT WORLD
                    </button>

                    <button id="world-close">
                        CLOSE
                    </button>
                </div>

                <p
                    id="world-status"
                    style="color:#aab5c4;font-size:12px"
                ></p>
            </section>
        `;

        document.body.appendChild(this.container);


	this.launcher = document.createElement("button");

this.launcher.textContent = "WORLD LIBRARY";

Object.assign(this.launcher.style, {
    position: "fixed",
    top: "76px",
    right: "18px",
    zIndex: "1500",
    padding: "12px 18px",
    background: "#263b50",
    color: "white",
    border: "1px solid #71869b",
    borderRadius: "6px",
    cursor: "pointer"
});

this.launcher.onclick = () => this.open();

document.body.appendChild(this.launcher);

        this.list = this.container.querySelector("#world-list");
        this.nameInput = this.container.querySelector("#world-name");
        this.status = this.container.querySelector("#world-status");

        this.container.querySelector("#world-create").onclick =
            () => this.createWorld();

        this.container.querySelector("#world-save").onclick =
            () => this.saveCurrent();

        this.container.querySelector("#world-close").onclick =
            () => this.close();
    }

    setStatus(message) {
        this.status.textContent = message;
    }

    open() {
        this.container.style.display = "flex";
        this.refresh();
    }

    close() {
        this.container.style.display = "none";
    }

    async refresh() {
        try {
            const worlds = await this.persistence.listWorlds();

            this.list.replaceChildren();

            if (worlds.length === 0) {
                const empty = document.createElement("p");
                empty.textContent = "No saved worlds yet.";
                this.list.appendChild(empty);
                return;
            }

            for (const world of worlds) {
                const row = document.createElement("div");

                Object.assign(row.style, {
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px 0",
                    borderBottom: "1px solid #354252"
                });

                const information = document.createElement("div");
                information.style.flex = "1";

                const title = document.createElement("strong");
                title.textContent = world.name;

                const details = document.createElement("small");
                details.style.display = "block";
                details.style.color = "#aab5c4";
                details.textContent =
                    `Seed: ${world.worldSeed} · Revision: ${world.revision}`;

                information.append(title, details);

                const load = document.createElement("button");
                load.textContent = "LOAD";
                load.onclick = () => this.loadWorld(world.id);

                const rename = document.createElement("button");
                rename.textContent = "RENAME";
                rename.onclick = () => this.renameWorld(world);

                const remove = document.createElement("button");
                remove.textContent = "DELETE";
                remove.onclick = () => this.deleteWorld(world);

                row.append(information, load, rename, remove);
                this.list.appendChild(row);
            }
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async createWorld() {
        try {
            const name = this.nameInput.value.trim();

            const world = await this.persistence.createWorld(
                name,
                {
                    worldSeed: Math.floor(
                        Math.random() * 2147483647
                    )
                }
            );

            this.currentWorldId = world.metadata.id;

            if (this.callbacks.onLoad) {
                await this.callbacks.onLoad(world);
            }

            this.nameInput.value = "";
            this.setStatus(`Created ${name}.`);
            await this.refresh();
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async loadWorld(id) {
        try {
            const world = await this.persistence.loadWorld(id);

            if (this.callbacks.onLoad) {
                await this.callbacks.onLoad(world);
            }

            this.currentWorldId = id;
            this.setStatus(`Loaded ${world.metadata.name}.`);
            await this.refresh();
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async saveCurrent() {
        try {
            if (!this.currentWorldId) {
                throw new Error("Select or create a world first.");
            }

            const world = await this.persistence.loadWorld(
                this.currentWorldId
            );

            if (this.callbacks.onCapture) {
                await this.callbacks.onCapture(world);
            }

            await this.persistence.saveWorld(world);

            this.setStatus(
                `Saved ${world.metadata.name} successfully.`
            );

            await this.refresh();
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async renameWorld(world) {
        const name = prompt(
            "Enter a new world name:",
            world.name
        );

        if (name === null) return;

        try {
            await this.persistence.renameWorld(
                world.id,
                name
            );

            await this.refresh();
        } catch (error) {
            this.setStatus(error.message);
        }
    }

    async deleteWorld(world) {
        if (!confirm(`Delete "${world.name}" permanently?`)) {
            return;
        }

        try {
            await this.persistence.deleteWorld(world.id);

            if (this.currentWorldId === world.id) {
                this.currentWorldId = null;
            }

            this.setStatus(`Deleted ${world.name}.`);
            await this.refresh();
        } catch (error) {
            this.setStatus(error.message);
        }
    }

dispose() {
    this.launcher?.remove();
    this.container?.remove();

    this.launcher = null;
    this.container = null;
}

}

export { WorldLibraryUI };

