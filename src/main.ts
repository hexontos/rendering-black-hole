import computeShader from "./compute.wgsl";

///////////
// TYPES //
///////////

type Byte = number & { readonly __brand: unique symbol };

type Vector3 = {
    x: number;
    y: number;
    z: number;
};

type RGB = {
    r: Byte;
    g: Byte;
    b: Byte;
};

type SchwarzschildRadius = number;

type BlackHole = {
    pos: Vector3;
    mass: number;
    schwarzschildRadius: SchwarzschildRadius;
    gravity: number;
};

type Sphere = {
    pos: Vector3;
};

type Ray = {
    pos: Vector3;
    dir: Vector3;
    r: number;
    phi: number;
    dr: number;
    dphi: number;
};

type GeodesicRay = Ray & {
    E: number;
    L: number;
};

type Camera = {
    pos: Vector3;
    fixedView: Vector3;
    angle: number;
    distance: number;
};

type WorldConfig = {
    screenWidth: number;
    screenHeight: number;
    simWidth: number;
    simHeight: number;
    c: number;
    g: number;
    solarMass: number;
    sagittariusAMass: number;
    worldCenter: Vector3;
    screenCenter: Vector3;
};

////////////////////
// CREATE OBJECTS //
////////////////////

const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);

const ray = (pos: Vector3, dir: Vector3): Ray => {
    const r = Math.hypot(pos.x, pos.y);
    const phi = Math.atan2(pos.y, pos.x);

    if (r === 0) {
        throw new Error("Cannot initialize a ray at the origin.");
    }

    const dr = dir.x * Math.cos(phi) + dir.y * Math.sin(phi);
    const dphi = (-dir.x * Math.sin(phi) + dir.y * Math.cos(phi)) / r;

    return {
        pos,
        dir,
        r,
        phi,
        dr,
        dphi,
    };
};

const gRay = (sourceRay: Ray, blackHole: BlackHole): GeodesicRay => {
    const L = sourceRay.r ** 2 * sourceRay.dphi;
    const f = 1.0 - blackHole.schwarzschildRadius / sourceRay.r;
    const dtDlambda = Math.sqrt(
        (sourceRay.dr ** 2) / (f ** 2) + ((sourceRay.r ** 2) * (sourceRay.dphi ** 2)) / f,
    );
    const E = f * dtDlambda;

    return {
        ...sourceRay,
        E,
        L,
    };
};

///////////////
// CONSTANTS //
///////////////

const canvasElement = document.getElementById("blackhole-canvas");
if (!(canvasElement instanceof HTMLCanvasElement)) {
    throw new Error("Canvas element #blackhole-canvas was not found.");
}
const canvas = canvasElement;

const worldConf = {
    screenWidth: canvas.width,
    screenHeight: canvas.height,
    simWidth: 100000000000.0,
    simHeight: 75000000000.0,
    c: 2.99792458e8,
    g: 6.67430e-11,
    solarMass: 1.989e30,
    sagittariusAMass: 4.3e6 * 1.989e30,
    worldCenter: vec3(0.0, 0.0, 0.0),
    screenCenter: vec3(canvas.width * 0.5, canvas.height * 0.5, 0.0),
} satisfies WorldConfig;

const C = worldConf.c;
const G = worldConf.g;
const SAGITTARIUS_A_MASS = worldConf.sagittariusAMass;
const WORLD_CENTER = worldConf.worldCenter;

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: 2.0 * G * SAGITTARIUS_A_MASS / (C ** 2),
    gravity: G * SAGITTARIUS_A_MASS,
} satisfies BlackHole;

/////////////
// WEBGPU  //
/////////////

async function initWebGpu(target: HTMLCanvasElement): Promise<void> {
    if (!navigator.gpu) {
        throw new Error("WebGPU is not supported in this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No WebGPU adapter was found.");
    }

    const device = await adapter.requestDevice();
    const context = target.getContext("webgpu");
    if (!context) {
        throw new Error("Failed to create WebGPU canvas context.");
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format,
        alphaMode: "opaque",
    });

    const shaderModule = device.createShaderModule({
        code: computeShader,
    });

    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "vsMain",
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fsMain",
            targets: [{ format }],
        },
        primitive: {
            topology: "triangle-list",
        },
    });

    renderGradient(device, context, pipeline);
}

function renderGradient(
    device: GPUDevice,
    context: GPUCanvasContext,
    pipeline: GPURenderPipeline,
): void {
    const encoder = device.createCommandEncoder();
    const view = context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store",
            },
        ],
    });

    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();

    device.queue.submit([encoder.finish()]);
}

async function init(): Promise<void> {
    await initWebGpu(canvas);
    console.log("WebGPU gradient ready.");
    console.log("Black hole config:", blackHole);
}

void init();
