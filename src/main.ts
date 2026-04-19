import gpuPipelineShaderSource from "./gpuPipeline.wgsl";
import { cameraForward, cameraRight, cameraUp, orbitCamera, rgb, vec3 } from "./common";
import { cpuPipeline } from "./cpuPipeline";
import { createHintPanel } from "./hintPanel";
import {
    handleCameraKeyArrows,
    handleCameraZoomKeys,
    handleGeodesicToggleKey,
    handleCameraMouseDrag,
    handleSceneToggleKeys,
    handleCameraWheelZoom,
    installConsoleCommands,
} from "./input";
import type { BlackHole, Camera, Disc, Grid, MouseDrag, WorldConfig, renderObjects } from "./types";

type AppMode = "main" | "sim2d" | "rayRender3d";
type RenderPipeline = "cpu" | "gpu";
type CameraSpin = "off" | "right" | "left";
type MainSimulationReloadState = {
    discVisible: boolean;
    gridVisible: boolean;
    backgroundMode: renderObjects["background"]["mode"];
    milkyWayVisible: boolean;
    useRungeKutta: boolean;
    cpuRunGeodesic: boolean;
    gpuRunGeodesic: boolean;
    cameraSpin: CameraSpin;
    spheres: renderObjects["spheres"];
    hiddenSpheres: renderObjects["spheres"] | null;
};

const APP_MODE_NAME = "blackhole.appMode";
const RENDER_PIPELINE_NAME = "blackhole.renderPipeline";
const CANVAS_DISPLAY_MODE_NAME = "blackhole.canvasDisplayMode";
const OVERLAY_VISIBILITY_NAME = "blackhole.overlayVisibility";
const MAIN_SIMULATION_STATE_NAME = "blackhole.mainSimulationState";
const HINT_PANEL_SKIP_NEXT_EXPAND_NAME = "blackhole.hintPanelSkipNextExpand";

const readAndClearStorageValue = (storage: Storage, name: string): string | null => {
    const value = storage.getItem(name);
    storage.removeItem(name);
    return value;
};

const readAppMode = (): AppMode => {
    const appMode = localStorage.getItem(APP_MODE_NAME);

    if (appMode === "sim2d" || appMode === "rayRender3d" || appMode === "main") {
        return appMode;
    }

    return "main";
};

const readRenderPipeline = (): RenderPipeline => {
    const renderPipeline = readAndClearStorageValue(localStorage, RENDER_PIPELINE_NAME);

    if (renderPipeline === "cpu" || renderPipeline === "gpu") {
        return renderPipeline;
    }

    return "gpu";
};

const skipHintPanelStartupExpandOnNextLoad = (): void => {
    sessionStorage.setItem(HINT_PANEL_SKIP_NEXT_EXPAND_NAME, "skip");
};

const reloadWithAppMode = (mode: AppMode): void => {
    skipHintPanelStartupExpandOnNextLoad();
    localStorage.setItem(APP_MODE_NAME, mode);
    window.location.reload();
};

const readMainSimulationReloadState = (): MainSimulationReloadState | null => {
    const storedState = readAndClearStorageValue(sessionStorage, MAIN_SIMULATION_STATE_NAME);
    if (storedState == null) return null;

    try {
        return JSON.parse(storedState) as MainSimulationReloadState;
    } catch {
        return null;
    }
};

const readOverlayVisibility = (): boolean => {
    const storedOverlayVisibility = readAndClearStorageValue(sessionStorage, OVERLAY_VISIBILITY_NAME);

    return storedOverlayVisibility !== "hidden";
};

const prepareOverlayReloadVisibility = (visible: boolean): void => {
    if (!visible) {
        sessionStorage.setItem(OVERLAY_VISIBILITY_NAME, "hidden");
        return;
    }

    sessionStorage.removeItem(OVERLAY_VISIBILITY_NAME);
};

const shouldExpandHintPanelInitially = (): boolean => {
    const skipNextExpand = readAndClearStorageValue(sessionStorage, HINT_PANEL_SKIP_NEXT_EXPAND_NAME);
    return skipNextExpand !== "skip";
};

const reloadWithRenderPipeline = (renderPipeline: RenderPipeline, overlayVisible: boolean): void => {
    skipHintPanelStartupExpandOnNextLoad();
    prepareOverlayReloadVisibility(overlayVisible);
    localStorage.setItem(APP_MODE_NAME, "main");
    localStorage.setItem(RENDER_PIPELINE_NAME, renderPipeline);
    window.location.reload();
};

const readCanvasDisplayMode = (): "default" | "fullscreen" => {
    const storedDisplayMode = readAndClearStorageValue(sessionStorage, CANVAS_DISPLAY_MODE_NAME);

    if (storedDisplayMode === "fullscreen") {
        return "fullscreen";
    }

    return "default";
};

const reloadWithCanvasDisplayMode = (
    displayMode: "default" | "fullscreen",
    overlayVisible: boolean,
    renderPipeline: RenderPipeline,
): void => {
    skipHintPanelStartupExpandOnNextLoad();
    prepareOverlayReloadVisibility(overlayVisible);
    if (renderPipeline === "cpu") {
        localStorage.setItem(RENDER_PIPELINE_NAME, "cpu");
    } else {
        localStorage.removeItem(RENDER_PIPELINE_NAME);
    }
    sessionStorage.setItem(CANVAS_DISPLAY_MODE_NAME, displayMode);
    window.location.reload();
};

const canvasElement = document.getElementById("blackhole-canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("Canvas element #blackhole-canvas was not found....");

const canvas = canvasElement;
const DEFAULT_DISPLAY_WIDTH = canvas.width;
const DEFAULT_DISPLAY_HEIGHT = canvas.height;
const CANVAS_DISPLAY_MODE = readCanvasDisplayMode();
const DISPLAY_WIDTH = CANVAS_DISPLAY_MODE === "fullscreen" ? Math.max(1, Math.floor(window.innerWidth)) : DEFAULT_DISPLAY_WIDTH;
const DISPLAY_HEIGHT = CANVAS_DISPLAY_MODE === "fullscreen" ? Math.max(1, Math.floor(window.innerHeight)) : DEFAULT_DISPLAY_HEIGHT;
const RENDER_SCALE = 0.4;

canvas.style.width = `${DISPLAY_WIDTH}px`;
canvas.style.height = `${DISPLAY_HEIGHT}px`;
canvas.width = Math.max(1, Math.round(DISPLAY_WIDTH * RENDER_SCALE));
canvas.height = Math.max(1, Math.round(DISPLAY_HEIGHT * RENDER_SCALE));

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
const CAMERA_RADIUS = 32 * SCHWARZSCHILD_RADIUS;
const MIN_CAMERA_RADIUS_DIVISOR = 1.4;
const MAX_CAMERA_RADIUS_MULTIPLIER = 3.6;
const BASE_GEODESIC_STEP = 5e7 * 1.9;
const BASE_GEODESIC_MAX_STEPS = 2 ** 15;
const BASE_ESCAPE_RADIUS_MULTIPLIER = 35;
const REFERENCE_CAMERA_RADIUS = CAMERA_RADIUS;
const CAMERA_SPIN_STEP = 0.008;

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: SCHWARZSCHILD_RADIUS,
    gravity: G * SAGITTARIUS_A_MASS,
    radius: EVENT_HORIZON_RADIUS,
    emission: rgb(0, 0, 0),
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
    innerRadius: 3 * SCHWARZSCHILD_RADIUS,
    outerRadius: 5.1 * SCHWARZSCHILD_RADIUS,
    visible: true,
    nearColor: rgb(255, 72, 0),
    farColor: rgb(255, 213, 46),
    radialBoost: rgb(28, 6, 0),
} satisfies Disc;

const renderGeodesic = {
    dλ: BASE_GEODESIC_STEP,
    maxSteps: BASE_GEODESIC_MAX_STEPS,
    escapeRadiusMultiplier: BASE_ESCAPE_RADIUS_MULTIPLIER,
    useRungeKutta: false,
} satisfies renderObjects["renderGeodesic"];

const grid = {
    visible: true,
    pos: vec3(
        blackHole.pos.x,
        blackHole.pos.y - 3.8 * SCHWARZSCHILD_RADIUS,
        blackHole.pos.z,
    ),
    halfSize: 5 * SCHWARZSCHILD_RADIUS,
    cellSize: 0.35 * SCHWARZSCHILD_RADIUS,
    maxDrop: 2.8 * SCHWARZSCHILD_RADIUS,
    lineColor: rgb(255, 255, 255),
} satisfies Grid;

const background = {
    mode: "stars",
    stars: {
        densityPrimary: 0.023,
        densitySecondary: 0.011,
        baseColor: rgb(3, 4, 8),
        milkyWayVisible: true,
        milkyWayNormal: vec3(0.26, 0.9, -0.34),
        milkyWayWidth: 0.17,
        milkyWayIntensity: 0.42,
        milkyWayColor: rgb(128, 112, 84),
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
    renderGeodesic,
    grid,
    spheres: [
        {
            pos: vec3(-8.5 * SCHWARZSCHILD_RADIUS, 0, 5*SCHWARZSCHILD_RADIUS),
            radius: 0.7 * SCHWARZSCHILD_RADIUS,
            emission: rgb(196, 0, 0),
        },
        {
            pos: vec3(0, 0, 12*SCHWARZSCHILD_RADIUS),
            radius: 2.1 * SCHWARZSCHILD_RADIUS,
            emission: rgb(115, 0, 255),
        },
        {
            pos: vec3(-60 * SCHWARZSCHILD_RADIUS, -3 * SCHWARZSCHILD_RADIUS, -15*SCHWARZSCHILD_RADIUS),
            radius: 3 * SCHWARZSCHILD_RADIUS,
            emission: rgb(232, 213, 255),
        },
    ],
};

const runtimeSettings = {
    cpuRunGeodesic: true,
    gpuRunGeodesic: true,
};
let activeRenderPipeline: RenderPipeline = "gpu";
let cameraSpin: CameraSpin = "off";
let hiddenSpheres: renderObjects["spheres"] | null = null;

const gpuSceneData = new Float32Array(25 * 4);
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
fpsOverlay.style.whiteSpace = "pre";
fpsOverlay.style.zIndex = "9999";
fpsOverlay.textContent = "FPS: --\nFrame: --\nRender: --\nComputation: --";
document.body.appendChild(fpsOverlay);
let overlayVisible = readOverlayVisibility();
const hintPanel = createHintPanel(fpsOverlay, {
    expandInitially: shouldExpandHintPanelInitially(),
});

const FPS_OVERLAY_UPDATE_INTERVAL_MS = 250;
const FPS_FRAME_TIME_SMOOTHING = 0.2;

let fpsLastFrameTime: number | null = null;
let fpsAverageFrameTimeMs: number | null = null;
let fpsLastOverlayUpdateTime = 0;

const reportFrame = (frameTime: number, render: string, computation: string): void => {
    if (fpsLastFrameTime == null) {
        fpsLastFrameTime = frameTime;
        return;
    }

    const frameTimeMs = Math.max(frameTime - fpsLastFrameTime, 1);
    fpsLastFrameTime = frameTime;
    fpsAverageFrameTimeMs = fpsAverageFrameTimeMs == null
        ? frameTimeMs
        : fpsAverageFrameTimeMs + (frameTimeMs - fpsAverageFrameTimeMs) * FPS_FRAME_TIME_SMOOTHING;

    if (frameTime - fpsLastOverlayUpdateTime < FPS_OVERLAY_UPDATE_INTERVAL_MS) return;

    fpsLastOverlayUpdateTime = frameTime;
    const fps = 1000 / fpsAverageFrameTimeMs;
    fpsOverlay.textContent = `FPS: ${fps.toFixed(1)}\nFrame: ${fpsAverageFrameTimeMs.toFixed(1)} ms\nRender: ${render}\nComputation: ${computation}`;
};

const currentComputationLabel = (runGeodesic: boolean): string => {
    if (!runGeodesic) return "Straight rays";
    return worldObjects.renderGeodesic.useRungeKutta ? "Geodesic (Runge-Kutta)" : "Geodesic (Fast)";
};

const gpuBackgroundModeValue = (mode: string | undefined): number => {
    if (mode === "empty") return 0;
    if (mode === "gradient") return 1;
    return 2;
};

const currentWorldObjects = (camera: Camera): renderObjects => {
    const renderGeodesicScale = camera.radius / REFERENCE_CAMERA_RADIUS;

    return {
        ...worldObjects,
        renderGeodesic: {
            ...worldObjects.renderGeodesic,
            dλ: worldObjects.renderGeodesic.dλ * renderGeodesicScale,
            maxSteps: Math.max(1, Math.round(worldObjects.renderGeodesic.maxSteps * renderGeodesicScale)),
            escapeRadiusMultiplier: worldObjects.renderGeodesic.escapeRadiusMultiplier * renderGeodesicScale,
        },
    };
};

const mouseDrag: MouseDrag = {
    active: false,
    lastX: 0,
    lastY: 0,
};

let requestMainRender = (): void => {};

const MIN_CAMERA_RADIUS = CAMERA_RADIUS / MIN_CAMERA_RADIUS_DIVISOR;
const MAX_CAMERA_RADIUS = CAMERA_RADIUS * MAX_CAMERA_RADIUS_MULTIPLIER;

const applyOverlayVisibility = (visible: boolean): void => {
    overlayVisible = visible;
    fpsOverlay.style.display = overlayVisible ? "block" : "none";
    hintPanel.setOverlayVisible(overlayVisible);
};

applyOverlayVisibility(overlayVisible);

const applyMainSimulationReloadState = (mainSimulationReloadState: MainSimulationReloadState | null): void => {
    if (mainSimulationReloadState == null) return;

    worldObjects.disc.visible = mainSimulationReloadState.discVisible;
    worldObjects.grid.visible = mainSimulationReloadState.gridVisible;
    worldObjects.background.mode = mainSimulationReloadState.backgroundMode;
    worldObjects.background.stars.milkyWayVisible = mainSimulationReloadState.milkyWayVisible;
    worldObjects.renderGeodesic.useRungeKutta = mainSimulationReloadState.useRungeKutta;
    worldObjects.spheres = mainSimulationReloadState.spheres;
    runtimeSettings.cpuRunGeodesic = mainSimulationReloadState.cpuRunGeodesic;
    runtimeSettings.gpuRunGeodesic = mainSimulationReloadState.gpuRunGeodesic;
    cameraSpin = mainSimulationReloadState.cameraSpin === "right" || mainSimulationReloadState.cameraSpin === "left"
        ? mainSimulationReloadState.cameraSpin
        : "off";
    hiddenSpheres = mainSimulationReloadState.hiddenSpheres;
};

const persistMainSimulationReloadState = (): void => {
    const mainSimulationReloadState: MainSimulationReloadState = {
        discVisible: worldObjects.disc.visible,
        gridVisible: worldObjects.grid.visible,
        backgroundMode: worldObjects.background.mode,
        milkyWayVisible: worldObjects.background.stars.milkyWayVisible,
        useRungeKutta: worldObjects.renderGeodesic.useRungeKutta,
        cpuRunGeodesic: runtimeSettings.cpuRunGeodesic,
        gpuRunGeodesic: runtimeSettings.gpuRunGeodesic,
        cameraSpin,
        spheres: worldObjects.spheres,
        hiddenSpheres,
    };

    sessionStorage.setItem(MAIN_SIMULATION_STATE_NAME, JSON.stringify(mainSimulationReloadState));
};

const toggleSphereVisibility = (): void => {
    if (hiddenSpheres == null) {
        hiddenSpheres = worldObjects.spheres;
        worldObjects.spheres = [
            {
                pos: vec3(0, 0, 0),
                radius: 0,
                emission: rgb(0, 0, 0),
            },
        ];
        return;
    }

    worldObjects.spheres = hiddenSpheres;
    hiddenSpheres = null;
};

const toggleGeodesicEnabled = (): void => {
    const nextRunGeodesic = !runtimeSettings.cpuRunGeodesic;
    runtimeSettings.cpuRunGeodesic = nextRunGeodesic;
    runtimeSettings.gpuRunGeodesic = nextRunGeodesic;
};

const toggleCanvasDisplayMode = (): void => {
    persistMainSimulationReloadState();
    reloadWithCanvasDisplayMode(
        CANVAS_DISPLAY_MODE === "default" ? "fullscreen" : "default",
        overlayVisible,
        activeRenderPipeline,
    );
};

const toggleRenderPipeline = (): void => {
    persistMainSimulationReloadState();
    reloadWithRenderPipeline(activeRenderPipeline === "gpu" ? "cpu" : "gpu", overlayVisible);
};

const toggleOverlayVisibility = (): void => {
    applyOverlayVisibility(!overlayVisible);
};

const toggleCameraSpin = (): void => {
    if (cameraSpin === "off") {
        cameraSpin = "right";
        return;
    }

    if (cameraSpin === "right") {
        cameraSpin = "left";
        return;
    }

    cameraSpin = "off";
};

const applyCameraSpinStep = (): boolean => {
    if (cameraSpin === "right") {
        camera.yaw -= CAMERA_SPIN_STEP;
        return true;
    }

    if (cameraSpin === "left") {
        camera.yaw += CAMERA_SPIN_STEP;
        return true;
    }

    return false;
};

const installMainInputHandlers = (): void => {
    window.addEventListener("keydown", (event) => {
        const cameraChanged = handleCameraKeyArrows(event, camera);
        const zoomChanged = handleCameraZoomKeys(event, camera, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
        const computationChanged = handleGeodesicToggleKey(event, worldObjects.renderGeodesic);
        const sceneChanged = handleSceneToggleKeys(event, worldObjects, {
            toggleRenderPipeline,
            toggleCanvasSize: toggleCanvasDisplayMode,
            toggleSpheres: toggleSphereVisibility,
            toggleGeodesicEnabled,
            toggleCameraSpin,
            toggleOverlayVisibility,
        });

        if (cameraChanged || zoomChanged || computationChanged || sceneChanged) {
            requestMainRender();
        }
    });

    canvas.addEventListener("mousedown", (event) => {
        mouseDrag.active = true;
        mouseDrag.lastX = event.clientX;
        mouseDrag.lastY = event.clientY;
    });

    window.addEventListener("mousemove", (event) => {
        if (handleCameraMouseDrag(event, camera, mouseDrag)) {
            requestMainRender();
        }
    });

    canvas.addEventListener("wheel", (event) => {
        if (handleCameraWheelZoom(event, camera, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS)) {
            requestMainRender();
        }
    }, { passive: false });

    window.addEventListener("mouseup", () => {
        mouseDrag.active = false;
    });
};

const initCpuRenderer = (canvas: HTMLCanvasElement): void => {
    activeRenderPipeline = "cpu";
    const context = canvas.getContext("2d");

    if (context == null) throw new Error("2D canvas context could not be created....");

    const ctx = context as CanvasRenderingContext2D;
    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    let renderQueued = false;

    console.log("WebGPU unavailable. Defaulted to CPU pipeline renderer.");
    console.log("Run `help()` in the console to see available commands.");
    console.log("Press `2` to toggle between Geodesic (Fast) and Geodesic (Runge-Kutta).");

    const renderFrame = (frameTime: number): void => {
        renderQueued = false;
        cpuPipeline(ctx, image, camera, currentWorldObjects(camera), worldConf, runtimeSettings.cpuRunGeodesic);
        reportFrame(frameTime, "CPU", currentComputationLabel(runtimeSettings.cpuRunGeodesic));
        if (applyCameraSpinStep()) {
            requestMainRender();
        }
    };

    requestMainRender = () => {
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(renderFrame);
    };

    requestMainRender();
};

const initWebGpuRenderer = async (canvas: HTMLCanvasElement): Promise<boolean> => {
    try {
        activeRenderPipeline = "gpu";
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

        let renderQueued = false;

        const frame = (frameTime: number): void => {
            renderQueued = false;
            const renderWorldObjects = currentWorldObjects(camera);
            const cameraPos = orbitCamera(camera);
            const forward = cameraForward(cameraPos, camera);
            const right = cameraRight(forward);
            const up = cameraUp(forward, right);
            const sphereData = new Float32Array(Math.max(renderWorldObjects.spheres.length * GPU_SPHERE_FLOATS, 4));

            for (let sphereIndex = 0; sphereIndex < renderWorldObjects.spheres.length; sphereIndex++) {
                const sphere = renderWorldObjects.spheres[sphereIndex];
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

            gpuSceneData.set([cameraPos.x, cameraPos.y, cameraPos.z, 0], 0);
            gpuSceneData.set([forward.x, forward.y, forward.z, 0], 4);
            gpuSceneData.set([right.x, right.y, right.z, 0], 8);
            gpuSceneData.set([up.x, up.y, up.z, 0], 12);
            gpuSceneData.set([SCREEN_WIDTH, SCREEN_HEIGHT, camera.focalLength, renderWorldObjects.spheres.length], 16);
            gpuSceneData.set([blackHole.pos.x, blackHole.pos.y, blackHole.pos.z, blackHole.schwarzschildRadius], 20);
            gpuSceneData.set([renderWorldObjects.disc.pos.x, renderWorldObjects.disc.pos.y, renderWorldObjects.disc.pos.z, 0], 24);
            gpuSceneData.set([
                renderWorldObjects.disc.innerRadius,
                renderWorldObjects.disc.outerRadius,
                renderWorldObjects.disc.visible ? 1 : 0,
                0,
            ], 28);
            gpuSceneData.set([
                renderWorldObjects.disc.nearColor.r / 255,
                renderWorldObjects.disc.nearColor.g / 255,
                renderWorldObjects.disc.nearColor.b / 255,
                0,
            ], 32);
            gpuSceneData.set([
                renderWorldObjects.disc.farColor.r / 255,
                renderWorldObjects.disc.farColor.g / 255,
                renderWorldObjects.disc.farColor.b / 255,
                0,
            ], 36);
            gpuSceneData.set([
                renderWorldObjects.disc.radialBoost.r / 255,
                renderWorldObjects.disc.radialBoost.g / 255,
                renderWorldObjects.disc.radialBoost.b / 255,
                0,
            ], 40);
            gpuSceneData.set([renderWorldObjects.grid.lineColor.r / 255, renderWorldObjects.grid.lineColor.g / 255, renderWorldObjects.grid.lineColor.b / 255, 0], 44);
            gpuSceneData.set([renderWorldObjects.grid.pos.x, renderWorldObjects.grid.pos.y, renderWorldObjects.grid.pos.z, 0], 48);
            gpuSceneData.set([
                renderWorldObjects.grid.halfSize,
                renderWorldObjects.grid.cellSize,
                renderWorldObjects.grid.maxDrop,
                renderWorldObjects.grid.visible ? 1 : 0,
            ], 52);
            gpuSceneData.set([
                gpuBackgroundModeValue(renderWorldObjects.background.mode),
                renderWorldObjects.background.stars.densityPrimary,
                renderWorldObjects.background.stars.densitySecondary,
                0,
            ], 56);
            gpuSceneData.set([
                renderWorldObjects.background.stars.baseColor.r / 255,
                renderWorldObjects.background.stars.baseColor.g / 255,
                renderWorldObjects.background.stars.baseColor.b / 255,
                0,
            ], 60);
            gpuSceneData.set([
                renderWorldObjects.background.empty.color.r / 255,
                renderWorldObjects.background.empty.color.g / 255,
                renderWorldObjects.background.empty.color.b / 255,
                0,
            ], 64);
            gpuSceneData.set([
                renderWorldObjects.background.gradient.topLeft.r / 255,
                renderWorldObjects.background.gradient.topLeft.g / 255,
                renderWorldObjects.background.gradient.topLeft.b / 255,
                0,
            ], 68);
            gpuSceneData.set([
                renderWorldObjects.background.gradient.topRight.r / 255,
                renderWorldObjects.background.gradient.topRight.g / 255,
                renderWorldObjects.background.gradient.topRight.b / 255,
                0,
            ], 72);
            gpuSceneData.set([
                renderWorldObjects.background.gradient.bottomLeft.r / 255,
                renderWorldObjects.background.gradient.bottomLeft.g / 255,
                renderWorldObjects.background.gradient.bottomLeft.b / 255,
                0,
            ], 76);
            gpuSceneData.set([
                renderWorldObjects.background.gradient.bottomRight.r / 255,
                renderWorldObjects.background.gradient.bottomRight.g / 255,
                renderWorldObjects.background.gradient.bottomRight.b / 255,
                0,
            ], 80);
            gpuSceneData.set([
                renderWorldObjects.background.stars.milkyWayNormal.x,
                renderWorldObjects.background.stars.milkyWayNormal.y,
                renderWorldObjects.background.stars.milkyWayNormal.z,
                renderWorldObjects.background.stars.milkyWayWidth,
            ], 84);
            gpuSceneData.set([
                renderWorldObjects.background.stars.milkyWayColor.r / 255,
                renderWorldObjects.background.stars.milkyWayColor.g / 255,
                renderWorldObjects.background.stars.milkyWayColor.b / 255,
                renderWorldObjects.background.stars.milkyWayVisible ? renderWorldObjects.background.stars.milkyWayIntensity : 0,
            ], 88);
            gpuSceneData.set([
                renderWorldObjects.renderGeodesic.dλ,
                renderWorldObjects.renderGeodesic.maxSteps,
                renderWorldObjects.renderGeodesic.escapeRadiusMultiplier,
                runtimeSettings.gpuRunGeodesic ? 1 : 0,
            ], 92);
            gpuSceneData.set([
                renderWorldObjects.renderGeodesic.useRungeKutta ? 1 : 0,
                0,
                0,
                0,
            ], 96);

            device.queue.writeBuffer(uniformBuffer, 0, gpuSceneData);
            device.queue.writeBuffer(sphereBuffer, 0, sphereData);

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
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();

            device.queue.submit([encoder.finish()]);
            reportFrame(frameTime, "GPU", currentComputationLabel(runtimeSettings.gpuRunGeodesic));
            if (applyCameraSpinStep()) {
                requestMainRender();
            }
        };

        requestMainRender = () => {
            if (renderQueued) return;
            renderQueued = true;
            requestAnimationFrame(frame);
        };

        console.log("WebGPU renderer active. GPU goes brbrbrbr....");
        console.log("Run `help()` in the console to see available commands.");
        console.log("Press `2` to toggle between Geodesic (Fast) and Geodesic (Runge-Kutta).");
        requestMainRender();
        return true;
    } catch (error) {
        console.error("WebGPU initialization failed -> falling back to CPU.", error);
        return false;
    }
};

const installAppConsoleCommands = (mainSimulationWorldObjects?: renderObjects, requestRender: () => void = () => {}): void => {
    installConsoleCommands({
        requestRender,
        runDemo: (demoName) => {
            reloadWithAppMode(demoName);
        },
        runBlackholeSimulation: () => {
            reloadWithAppMode("main");
        },
        ...(mainSimulationWorldObjects == null ? {} : { worldObjects: mainSimulationWorldObjects }),
    });
};

const bootMainSimulation = async (): Promise<void> => {
    applyMainSimulationReloadState(readMainSimulationReloadState());
    installMainInputHandlers();
    installAppConsoleCommands(worldObjects, requestMainRender);

    const renderPipeline = readRenderPipeline();

    if (renderPipeline === "cpu") {
        initCpuRenderer(canvas);
        return;
    }

    const webGpuStarted = await initWebGpuRenderer(canvas);

    if (!webGpuStarted) {
        initCpuRenderer(canvas);
    }
};

const bootDemo = async (appMode: AppMode): Promise<void> => {
    if (appMode === "sim2d") {
        await import("./demo/sim2d");
        installAppConsoleCommands();
        console.log('2D geodesic demo active. Run `runBlackholeSimulation()` to return.');
        return;
    }

    if (appMode === "rayRender3d") {
        await import("./demo/rayRender3d");
        installAppConsoleCommands();
        console.log('3D raytracing demo active. Run `runBlackholeSimulation()` to return.');
    }
};

const bootApp = async (): Promise<void> => {
    const appMode = readAppMode();

    if (appMode !== "main") {
        await bootDemo(appMode);
        return;
    }

    await bootMainSimulation();
};

void bootApp();
