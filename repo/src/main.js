
import createScene from "./scene/create-scene.js?v=somnium-20261110-phase18o-active-w-slice-navigation-1";

async function main() {
    console.info("[Main] Build: 2026-11-10-phase18g3-gizmo-attachment-box-preview-2");
    console.log("[Main] Initializing Somnium...");

    const canvas = document.getElementById("renderCanvas");

    if (!canvas) {
        throw new Error("Render canvas not found.");
    }

    const engine = new BABYLON.Engine(
        canvas,
        true,
        {
            useLargeWorldRendering: true
        }
    );

    let scene = null;

    try {
        console.log("[Main] Engine initialized.");

        scene = await createScene(engine, canvas);

        console.log("[Main] Scene initialized.");

        engine.runRenderLoop(() => {
            if (scene && !scene.isDisposed) {
                scene.render();
            }
        });

        const handleResize = () => {
            engine.resize();
        };

        window.addEventListener("resize", handleResize);

        window.addEventListener("beforeunload", () => {
            window.removeEventListener("resize", handleResize);

            scene?.dispose();
            engine.dispose();
        }, { once: true });

    } catch (error) {
        scene?.dispose();
        engine.dispose();
        throw error;
    }
}

main().catch(error => {
    console.error(
        "[Main] Application initialization failed:",
        error
    );
});

