import gpuPipelineShaderSource from "./gpuPipeline.wgsl";
import { cameraForward, cameraRight, cameraUp, orbitCamera, rgb, vec3 } from "./common";
import { cpuPipeline } from "./cpuPipeline";
import { gpuGridVertices } from "./gpuGrid";
import { handleCameraKeyArrows, handleCameraMouseDrag, handleCameraWheelZoom } from "./input";
import type { BackgroundMode, BlackHole, Camera, Disc, Grid, MouseDrag, WorldConfig, renderObjects } from "./types";

const canvasElement = document.getElementById("blackhole-canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("Canvas element #blackhole-canvas was not found....");

const canvas = canvasElement;

const worldConf = {
    screenWidth: canvas.width,
    screenHeight: canvas.height,
    simWidth: 100000000000.0, // meters, half-width
    simHeight: 75000000000.0, // meters, half-height
    c: 2.99792458e8, // photon speed
    g: 6.67430e-11, // gravitational constant
    solarMass: 1.989e30, // kg
    sagittariusAMass: 4.3e6 * 1.989e30,
    worldCenter: vec3(0.0, 0.0, 0.0),
    screenCenter: vec3(canvas.width * 0.5, canvas.height * 0.5, 0.0),
} satisfies WorldConfig;

const SCREEN_HEIGHT = worldConf.screenHeight;
const SCREEN_WIDTH = worldConf.screenWidth;
const C = worldConf.c;
const G = worldConf.g;
const SAGITTARIUS_A_MASS = worldConf.sagittariusAMass;
const WORLD_CENTER = worldConf.worldCenter;
const SCHWARZSCHILD_RADIUS = 2.0 * G * SAGITTARIUS_A_MASS / (C ** 2);
const EVENT_HORIZON_RADIUS = SCHWARZSCHILD_RADIUS;
const CAMERA_RADIUS = 8 * SCHWARZSCHILD_RADIUS;

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: SCHWARZSCHILD_RADIUS,
    gravity: G * SAGITTARIUS_A_MASS,
    radius: EVENT_HORIZON_RADIUS,
    emission: rgb(0, 0, 0),
    reflectivity: rgb(0, 0, 0),
    roughness: 0,
} satisfies BlackHole;

const camera = {
    target: blackHole,
    radius: CAMERA_RADIUS,
    yaw: 0,
    pitch: 0,
    focalLength: 700,
} satisfies Camera;

const disc = {
    pos: blackHole.pos,
    innerRadius: 1.8 * SCHWARZSCHILD_RADIUS,
    outerRadius: 2.7 * SCHWARZSCHILD_RADIUS,
    visible: true,
    nearColor: rgb(255, 102, 0),
    farColor: rgb(255, 208, 18),
    radialBoost: rgb(28, 6, 0),
} satisfies Disc;

const grid = {
    pos: vec3(
        blackHole.pos.x,
        blackHole.pos.y - 2.4 * SCHWARZSCHILD_RADIUS,
        blackHole.pos.z,
    ),
    halfSize: 3.5 * SCHWARZSCHILD_RADIUS,
    cellSize: 0.35 * SCHWARZSCHILD_RADIUS,
    maxDrop: 2.5 * SCHWARZSCHILD_RADIUS,
    lineColor: rgb(255, 255, 255),
} satisfies Grid;

const background = {
    mode: "stars",
    stars: {
        densityPrimary: 0.023,
        densitySecondary: 0.011,
        baseColor: rgb(3, 4, 8),
    },
    gradient: {
        topLeft: rgb(255, 48, 48),
        topRight: rgb(255, 220, 0),
        bottomLeft: rgb(24, 12, 120),
        bottomRight: rgb(160, 0, 255),
    },
    empty: {
        color: rgb(0, 0, 0),
    },
} satisfies renderObjects["background"];

const worldObjects: renderObjects = {
    background,
    blackhole: blackHole,
    disc,
    grid,
    spheres: [
        {
            pos: vec3(-6.5 * SCHWARZSCHILD_RADIUS, 0, 4*SCHWARZSCHILD_RADIUS),
            radius: 1.2 * SCHWARZSCHILD_RADIUS,
            emission: rgb(196, 0, 0),
            reflectivity: rgb(0.25, 1, 0.76), // normalized 0..1 per channel
            roughness: 3,
        },
        {
            pos: vec3(-10.5 * SCHWARZSCHILD_RADIUS, 0, 7*SCHWARZSCHILD_RADIUS),
            radius: 1.7 * SCHWARZSCHILD_RADIUS,
            emission: rgb(115, 0, 255),
            reflectivity: rgb(0, 0, 0),
            roughness: 0,
        },
        {
            pos: vec3(-9 * SCHWARZSCHILD_RADIUS, 0, -14*SCHWARZSCHILD_RADIUS),
            radius: 1.7 * SCHWARZSCHILD_RADIUS,
            emission: rgb(232, 213, 255),
            reflectivity: rgb(1, 0, 1),
            roughness: 10,
        },
    ],
};

const runtimeFlags = globalThis as typeof globalThis & {
    runGeodesic?: boolean;
    renderDisc?: boolean;
    backgroundMode?: string;
};
runtimeFlags.runGeodesic = runtimeFlags.runGeodesic ?? false;
runtimeFlags.renderDisc = runtimeFlags.renderDisc ?? true;
runtimeFlags.backgroundMode = runtimeFlags.backgroundMode ?? worldObjects.background.mode;

const gpuSceneData = new Float32Array(19 * 4);
const GPU_SPHERE_FLOATS = 8;

const fpsOverlay = document.createElement("div");
fpsOverlay.style.position = "fixed";
fpsOverlay.style.top = "8px";
fpsOverlay.style.left = "8px";
fpsOverlay.style.padding = "6px 8px";
fpsOverlay.style.background = "rgba(0, 0, 0, 0.65)";
fpsOverlay.style.color = "#ffffff";
fpsOverlay.style.fontFamily = "monospace";
fpsOverlay.style.fontSize = "12px";
fpsOverlay.style.zIndex = "9999";
fpsOverlay.textContent = "FPS: --";
document.body.appendChild(fpsOverlay);

let fpsFrames = 0;
let fpsLastTime = performance.now();

const reportFrame = (backend: string): void => {
    fpsFrames += 1;
    const now = performance.now();
    const elapsed = now - fpsLastTime;

    if (elapsed >= 1000) {
        const fps = fpsFrames * 1000 / elapsed;
        fpsOverlay.textContent = `FPS: ${fps.toFixed(1)} (${backend})`;
        fpsFrames = 0;
        fpsLastTime = now;
    }
};

const gpuBackgroundModeValue = (mode: string | undefined): number => {
    if (mode === "empty") return 0;
    if (mode === "gradient") return 1;
    return 2;
};

const runtimeBackgroundMode = (mode: string | undefined, fallback: BackgroundMode): BackgroundMode => {
    if (mode === "empty" || mode === "gradient" || mode === "stars") {
        return mode;
    }
    return fallback;
};

const mouseDrag: MouseDrag = {
    active: false,
    lastX: 0,
    lastY: 0,
};

const MIN_CAMERA_RADIUS = CAMERA_RADIUS / 1.2;
const MAX_CAMERA_RADIUS = CAMERA_RADIUS * 2;

window.addEventListener("keydown", (event) => {
    handleCameraKeyArrows(event, camera);
});

canvas.addEventListener("mousedown", (event) => {
    mouseDrag.active = true;
    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;
});

window.addEventListener("mousemove", (event) => {
    handleCameraMouseDrag(event, camera, mouseDrag);
});

canvas.addEventListener("wheel", (event) => {
    handleCameraWheelZoom(event, camera, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
}, { passive: false });

window.addEventListener("mouseup", () => {
    mouseDrag.active = false;
});

const initCpuRenderer = (canvas: HTMLCanvasElement): void => {
    const context = canvas.getContext("2d");

    if (context == null) throw new Error("2D canvas context could not be created....");

    const ctx = context as CanvasRenderingContext2D;
    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const FPS = 30;

    console.log("WebGPU unavailable. Defaulted to CPU pipeline renderer.");
    console.log("CPU geodesic raytracing is OFF by default.");
    console.log("Run `runGeodesic = true` in the console to enable it.");
    console.log("Run `renderDisc = false` in the console to hide the disc.");
    console.log('Run `backgroundMode = "gradient"` or `backgroundMode = "empty"` in the console to switch the background.');

    window.setInterval(() => {
        worldObjects.disc.visible = runtimeFlags.renderDisc ?? true;
        worldObjects.background.mode = runtimeBackgroundMode(runtimeFlags.backgroundMode, worldObjects.background.mode);
        cpuPipeline(ctx, image, camera, worldObjects, worldConf, runtimeFlags.runGeodesic ?? false);
        //console.log("Completed CPU render cycle.");
        reportFrame(runtimeFlags.runGeodesic ?? false ? "CPU geodesic" : "CPU");
    }, 1000 / FPS);
};

const initWebGpuRenderer = async (canvas: HTMLCanvasElement): Promise<boolean> => {
    try {
        if (!navigator.gpu) return false;

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;

        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (!context) return false;

        const format = navigator.gpu.getPreferredCanvasFormat();

        context.configure({
            device,
            format,
            alphaMode: "opaque",
        });

        const shader = device.createShaderModule({
            code: gpuPipelineShaderSource,
        });

        const uniformBuffer = device.createBuffer({
            size: gpuSceneData.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        let sphereBuffer = device.createBuffer({
            size: Math.max(worldObjects.spheres.length * GPU_SPHERE_FLOATS * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        let gridVertexBuffer = device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        const sceneBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });

        const scenePipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [sceneBindGroupLayout],
        });

        const backgroundPipeline = device.createRenderPipeline({
            layout: scenePipelineLayout,
            vertex: {
                module: shader,
                entryPoint: "vsMain",
            },
            fragment: {
                module: shader,
                entryPoint: "backgroundFsMain",
                targets: [{ format }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        const pipeline = device.createRenderPipeline({
            layout: scenePipelineLayout,
            vertex: {
                module: shader,
                entryPoint: "vsMain",
            },
            fragment: {
                module: shader,
                entryPoint: "fsMain",
                targets: [{ format }],
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        const gridPipeline = device.createRenderPipeline({
            layout: scenePipelineLayout,
            vertex: {
                module: shader,
                entryPoint: "gridVsMain",
                buffers: [
                    {
                        arrayStride: 8,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x2",
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: shader,
                entryPoint: "gridFsMain",
                targets: [{ format }],
            },
            primitive: {
                topology: "line-list",
            },
        });

        let bindGroup = device.createBindGroup({
            layout: sceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: uniformBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: sphereBuffer,
                    },
                },
            ],
        });

        const frame = (): void => {
            worldObjects.disc.visible = runtimeFlags.renderDisc ?? true;
            worldObjects.background.mode = runtimeBackgroundMode(runtimeFlags.backgroundMode, worldObjects.background.mode);
            const cameraPos = orbitCamera(camera);
            const forward = cameraForward(cameraPos, camera);
            const right = cameraRight(forward);
            const up = cameraUp(forward, right);
            const sphereData = new Float32Array(Math.max(worldObjects.spheres.length * GPU_SPHERE_FLOATS, 4));
            const gridVertices = gpuGridVertices(camera, worldObjects, SCREEN_WIDTH, SCREEN_HEIGHT);

            for (let sphereIndex = 0; sphereIndex < worldObjects.spheres.length; sphereIndex++) {
                const sphere = worldObjects.spheres[sphereIndex];
                if (sphere == null) continue;
                const base = sphereIndex * GPU_SPHERE_FLOATS;
                sphereData.set([sphere.pos.x, sphere.pos.y, sphere.pos.z, sphere.radius], base);
                sphereData.set([
                    sphere.emission.r / 255,
                    sphere.emission.g / 255,
                    sphere.emission.b / 255,
                    0,
                ], base + 4);
            }

            if (sphereBuffer.size !== sphereData.byteLength) {
                sphereBuffer = device.createBuffer({
                    size: sphereData.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                bindGroup = device.createBindGroup({
                    layout: sceneBindGroupLayout,
                    entries: [
                        {
                            binding: 0,
                            resource: {
                                buffer: uniformBuffer,
                            },
                        },
                        {
                            binding: 1,
                            resource: {
                                buffer: sphereBuffer,
                            },
                        },
                    ],
                });
            }

            if (gridVertexBuffer.size !== gridVertices.byteLength && gridVertices.byteLength > 0) {
                gridVertexBuffer = device.createBuffer({
                    size: gridVertices.byteLength,
                    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                });
            }

            gpuSceneData.set([cameraPos.x, cameraPos.y, cameraPos.z, 0], 0);
            gpuSceneData.set([forward.x, forward.y, forward.z, 0], 4);
            gpuSceneData.set([right.x, right.y, right.z, 0], 8);
            gpuSceneData.set([up.x, up.y, up.z, 0], 12);
            gpuSceneData.set([SCREEN_WIDTH, SCREEN_HEIGHT, camera.focalLength, worldObjects.spheres.length], 16);
            gpuSceneData.set([blackHole.pos.x, blackHole.pos.y, blackHole.pos.z, blackHole.schwarzschildRadius], 20);
            gpuSceneData.set([worldObjects.disc.pos.x, worldObjects.disc.pos.y, worldObjects.disc.pos.z, 0], 24);
            gpuSceneData.set([
                worldObjects.disc.innerRadius,
                worldObjects.disc.outerRadius,
                worldObjects.disc.visible ? 1 : 0,
                0,
            ], 28);
            gpuSceneData.set([
                worldObjects.disc.nearColor.r / 255,
                worldObjects.disc.nearColor.g / 255,
                worldObjects.disc.nearColor.b / 255,
                0,
            ], 32);
            gpuSceneData.set([
                worldObjects.disc.farColor.r / 255,
                worldObjects.disc.farColor.g / 255,
                worldObjects.disc.farColor.b / 255,
                0,
            ], 36);
            gpuSceneData.set([
                worldObjects.disc.radialBoost.r / 255,
                worldObjects.disc.radialBoost.g / 255,
                worldObjects.disc.radialBoost.b / 255,
                0,
            ], 40);
            gpuSceneData.set([
                worldObjects.grid.lineColor.r / 255,
                worldObjects.grid.lineColor.g / 255,
                worldObjects.grid.lineColor.b / 255,
                0,
            ], 44);
            gpuSceneData.set([
                gpuBackgroundModeValue(worldObjects.background.mode),
                worldObjects.background.stars.densityPrimary,
                worldObjects.background.stars.densitySecondary,
                0,
            ], 48);
            gpuSceneData.set([
                worldObjects.background.stars.baseColor.r / 255,
                worldObjects.background.stars.baseColor.g / 255,
                worldObjects.background.stars.baseColor.b / 255,
                0,
            ], 52);
            gpuSceneData.set([
                worldObjects.background.empty.color.r / 255,
                worldObjects.background.empty.color.g / 255,
                worldObjects.background.empty.color.b / 255,
                0,
            ], 56);
            gpuSceneData.set([
                worldObjects.background.gradient.topLeft.r / 255,
                worldObjects.background.gradient.topLeft.g / 255,
                worldObjects.background.gradient.topLeft.b / 255,
                0,
            ], 60);
            gpuSceneData.set([
                worldObjects.background.gradient.topRight.r / 255,
                worldObjects.background.gradient.topRight.g / 255,
                worldObjects.background.gradient.topRight.b / 255,
                0,
            ], 64);
            gpuSceneData.set([
                worldObjects.background.gradient.bottomLeft.r / 255,
                worldObjects.background.gradient.bottomLeft.g / 255,
                worldObjects.background.gradient.bottomLeft.b / 255,
                0,
            ], 68);
            gpuSceneData.set([
                worldObjects.background.gradient.bottomRight.r / 255,
                worldObjects.background.gradient.bottomRight.g / 255,
                worldObjects.background.gradient.bottomRight.b / 255,
                0,
            ], 72);

            device.queue.writeBuffer(uniformBuffer, 0, gpuSceneData);
            device.queue.writeBuffer(sphereBuffer, 0, sphereData);
            if (gridVertices.byteLength > 0) {
                device.queue.writeBuffer(gridVertexBuffer, 0, gridVertices);
            }

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

            pass.setPipeline(backgroundPipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            if (gridVertices.length > 0) {
                pass.setPipeline(gridPipeline);
                pass.setBindGroup(0, bindGroup);
                pass.setVertexBuffer(0, gridVertexBuffer);
                pass.draw(gridVertices.length / 2);
            }
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();

            device.queue.submit([encoder.finish()]);
            reportFrame("GPU");
            requestAnimationFrame(frame);
        };

        console.log("WebGPU renderer active. GPU goes brbrbrbr....");
        console.log('GPU background defaults to stars. Run `backgroundMode = "gradient"` or `backgroundMode = "empty"` in the console to switch it.');
        //console.log("Completed GPU render cycle.");
        requestAnimationFrame(frame);
        return true;
    } catch (error) {
        console.error("WebGPU initialization failed -> falling back to CPU.", error);
        return false;
    }
};

const initRenderer = async (): Promise<void> => {
    const webGpuStarted = await initWebGpuRenderer(canvas);

    if (!webGpuStarted) {
        initCpuRenderer(canvas);
    }
};

void initRenderer();
