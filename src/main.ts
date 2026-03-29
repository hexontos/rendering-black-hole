async function getCanvasContext(
    canvas: HTMLCanvasElement,
): Promise<GPUCanvasContext> {
    let context = null;

    if (navigator.gpu) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
            context = canvas.getContext("webgpu");
            if (!context) throw new Error("No gpu, no going brrrrrr");
        }
    }
    if (!context) throw new Error("No gpu, no going brrrrrr");
    return context;

    //const context = canvas.getContext("2d");
    //if (!context) {
    //    throw new Error("Failed to get 2D canvas context.");
    //}
    //return context;
}

async function init(): Promise<void> {
    const canvas = document.getElementById("blackhole-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Canvas element #blackhole-canvas was not found.");
    }

    const context = await getCanvasContext(canvas);
    console.log("Renderer context:", context);
}

void init();
