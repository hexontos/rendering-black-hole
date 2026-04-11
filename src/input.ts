import type {
    BackgroundMode,
    Camera,
    GradientBackground,
    MouseDrag,
    Sphere,
    StarsBackground,
    Vector3,
    RGB,
    renderObjects,
} from "./types";

export type DemoName = "sim2d" | "rayRender3d";

type ConsoleCommandContext = {
    worldObjects?: renderObjects;
    requestRender: () => void;
    setCpuGeodesic: (enabled: boolean) => void;
    setGpuGeodesic: (enabled: boolean) => void;
    runCpu: () => void;
    runGpu: () => void;
    runDemo: (demoName: DemoName) => void;
    runBlackholeSimulation: () => void;
};

type GeodesicToggleState = {
    useRungeKutta: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === "number" && Number.isFinite(value);
};

const isBoolean = (value: unknown): value is boolean => {
    return typeof value === "boolean";
};

const isBackgroundMode = (value: unknown): value is BackgroundMode => {
    return value === "stars" || value === "gradient" || value === "empty";
};

const isRgb = (value: unknown): value is RGB => {
    if (!isRecord(value)) return false;

    return isFiniteNumber(value.r) && isFiniteNumber(value.g) && isFiniteNumber(value.b);
};

const isVector3 = (value: unknown): value is Vector3 => {
    if (!isRecord(value)) return false;

    return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
};

const isSphere = (value: unknown): value is Sphere => {
    if (!isRecord(value)) return false;

    return (
        isVector3(value.pos) &&
        isFiniteNumber(value.radius) &&
        isRgb(value.emission)
    );
};

const isGradientBackground = (value: unknown): value is GradientBackground => {
    if (!isRecord(value)) return false;

    return (
        isRgb(value.topLeft) &&
        isRgb(value.topRight) &&
        isRgb(value.bottomLeft) &&
        isRgb(value.bottomRight)
    );
};

const isStarsBackground = (value: unknown): value is StarsBackground => {
    if (!isRecord(value)) return false;

    return (
        isFiniteNumber(value.densityPrimary) &&
        isFiniteNumber(value.densitySecondary) &&
        isRgb(value.baseColor) &&
        isBoolean(value.milkyWayVisible) &&
        isVector3(value.milkyWayNormal) &&
        isFiniteNumber(value.milkyWayWidth) &&
        isFiniteNumber(value.milkyWayIntensity) &&
        isRgb(value.milkyWayColor)
    );
};

const mainSimulationOnly = (commandName: string): boolean => {
    console.error(`${commandName}() is only available in the main black hole simulation.`);
    return false;
};

const printHelp = (mainSimulationCommandsAvailable: boolean): void => {
    const mainSimulationSection = !mainSimulationCommandsAvailable
        ? "Main-simulation scene commands are unavailable while a demo is running."
        : `- setBackgroundMode("stars" | "gradient" | "empty"): switch active background
- setGradientBackground(background): replace the full colorful background object and activate it
- setStarsBackground(background): replace the full star background object and activate it
- setDiscVisible(boolean): show or hide the disc
- setDiscNoiseVisible(boolean): enable or disable disc holes/noise
- setSpheres(sphere): append one sphere
- setSpheres([sphere, ...]): replace the whole sphere list
- setGridVisible(boolean): show or hide the gravity grid
- setCpuGeodesic(boolean): enable or disable CPU Geodesic rendering
- setGpuGeodesic(boolean): enable or disable GPU Geodesic rendering

Gradient background shape:
{ topLeft: { r, g, b }, topRight: { r, g, b }, bottomLeft: { r, g, b }, bottomRight: { r, g, b } }

Stars background shape:
{ densityPrimary, densitySecondary, baseColor: { r, g, b }, milkyWayVisible, milkyWayNormal: { x, y, z }, milkyWayWidth, milkyWayIntensity, milkyWayColor: { r, g, b } }

Sphere shape:
{ pos: { x, y, z }, radius, emission: { r, g, b } }

Examples:
runDemo("sim2d")
runDemo("rayRender3d")
runBlackholeSimulation()
runCpu()
runGpu()
setBackgroundMode("gradient")
setGradientBackground({ topLeft: { r: 255, g: 48, b: 48 }, topRight: { r: 255, g: 220, b: 0 }, bottomLeft: { r: 24, g: 12, b: 120 }, bottomRight: { r: 160, g: 0, b: 255 } })
setStarsBackground({ densityPrimary: 0.023, densitySecondary: 0.011, baseColor: { r: 3, g: 4, b: 8 }, milkyWayVisible: true, milkyWayNormal: { x: 0.26, y: 0.9, z: -0.34 }, milkyWayWidth: 0.17, milkyWayIntensity: 0.42, milkyWayColor: { r: 128, g: 112, b: 84 } })
setSpheres({ pos: { x: -100, y: 0, z: 0 }, radius: 10, emission: { r: 255, g: 160, b: 0 } })
setSpheres([{ pos: { x: -100, y: 0, z: 0 }, radius: 10, emission: { r: 255, g: 160, b: 0 } }])
setDiscVisible(false)
setDiscNoiseVisible(true)
setGridVisible(false)
setCpuGeodesic(false)
setGpuGeodesic(false)`;

    console.log(
`Black hole simulation console commands:
- help(): show this list
- runDemo("sim2d"): switch to the 2D geodesic demo
- runDemo("rayRender3d"): switch to the 3D straight-ray demo
- runBlackholeSimulation(): switch back to the main black hole simulation
- runCpu(): switch main simulation render pipeline to CPU
- runGpu(): switch main simulation render pipeline to GPU

${mainSimulationSection}`,
    );
};

export const installConsoleCommands = (context: ConsoleCommandContext): void => {
    const mainSimulationCommandsAvailable = context.worldObjects != null;
    const target = window as unknown as Window & Record<string, unknown>;

    target.help = () => {
        printHelp(mainSimulationCommandsAvailable);
    };

    target.runDemo = (demoName: unknown) => {
        if (demoName !== "sim2d" && demoName !== "rayRender3d") {
            console.error('runDemo() expects "sim2d" or "rayRender3d".');
            return;
        }

        context.runDemo(demoName);
    };

    target.runBlackholeSimulation = () => {
        context.runBlackholeSimulation();
    };

    target.runCpu = () => {
        context.runCpu();
    };

    target.runGpu = () => {
        context.runGpu();
    };

    target.setBackgroundMode = (mode: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setBackgroundMode");
        if (!isBackgroundMode(mode)) {
            console.error('setBackgroundMode() expects "stars", "gradient", or "empty".');
            return;
        }

        context.worldObjects.background.mode = mode;
        console.log(`Background mode set to "${mode}".`);
        context.requestRender();
    };

    target.setGradientBackground = (gradientBackground: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setGradientBackground");
        if (!isGradientBackground(gradientBackground)) {
            console.error("setGradientBackground() expects a full gradient background object.");
            return;
        }

        context.worldObjects.background.gradient = gradientBackground;
        context.worldObjects.background.mode = "gradient";
        console.log("Gradient background updated and activated.");
        context.requestRender();
    };

    target.setStarsBackground = (starsBackground: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setStarsBackground");
        if (!isStarsBackground(starsBackground)) {
            console.error("setStarsBackground() expects a full stars background object.");
            return;
        }

        context.worldObjects.background.stars = starsBackground;
        context.worldObjects.background.mode = "stars";
        console.log("Stars background updated and activated.");
        context.requestRender();
    };

    target.setDiscVisible = (visible: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setDiscVisible");
        if (!isBoolean(visible)) {
            console.error("setDiscVisible() expects a boolean.");
            return;
        }

        context.worldObjects.disc.visible = visible;
        console.log(`Disc visibility set to ${visible}.`);
        context.requestRender();
    };

    target.setDiscNoiseVisible = (visible: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setDiscNoiseVisible");
        if (!isBoolean(visible)) {
            console.error("setDiscNoiseVisible() expects a boolean.");
            return;
        }

        context.worldObjects.disc.noiseVisible = visible;
        console.log(`Disc noise visibility set to ${visible}.`);
        context.requestRender();
    };

    target.setSpheres = (nextSpheres: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setSpheres");

        if (Array.isArray(nextSpheres)) {
            if (!nextSpheres.every(isSphere)) {
                console.error("setSpheres([...]) expects an array of full sphere objects.");
                return;
            }

            context.worldObjects.spheres = nextSpheres;
            console.log(`Sphere list replaced with ${nextSpheres.length} sphere(s).`);
            context.requestRender();
            return;
        }

        if (!isSphere(nextSpheres)) {
            console.error("setSpheres(sphere) expects one full sphere object, or an array of full sphere objects.");
            return;
        }

        context.worldObjects.spheres.push(nextSpheres);
        console.log(`Sphere appended. Total spheres: ${context.worldObjects.spheres.length}.`);
        context.requestRender();
    };

    target.setGridVisible = (visible: unknown) => {
        if (context.worldObjects == null) return mainSimulationOnly("setGridVisible");
        if (!isBoolean(visible)) {
            console.error("setGridVisible() expects a boolean.");
            return;
        }

        context.worldObjects.grid.visible = visible;
        console.log(`Grid visibility set to ${visible}.`);
        context.requestRender();
    };

    target.setCpuGeodesic = (enabled: unknown) => {
        if (!isBoolean(enabled)) {
            console.error("setCpuGeodesic() expects a boolean.");
            return;
        }

        context.setCpuGeodesic(enabled);
        console.log(`CPU geodesic rendering set to ${enabled}.`);
        context.requestRender();
    };

    target.setGpuGeodesic = (enabled: unknown) => {
        if (!isBoolean(enabled)) {
            console.error("setGpuGeodesic() expects a boolean.");
            return;
        }

        context.setGpuGeodesic(enabled);
        console.log(`GPU geodesic rendering set to ${enabled}.`);
        context.requestRender();
    };
};

export const handleCameraKeyArrows = (event: KeyboardEvent, camera: Camera, step: number = 0.1): boolean => {
    const pitchLimit = Math.PI * 0.5 - 0.01;

    if (event.key === "ArrowLeft") {
        camera.yaw += step;
        event.preventDefault();
        return true;
    };

    if (event.key === "ArrowRight") {
        camera.yaw -= step;
        event.preventDefault();
        return true;
    };

    if (event.key === "ArrowUp") {
        camera.pitch += step;
        camera.pitch = Math.min(camera.pitch, pitchLimit);
        event.preventDefault();
        return true;
    }

    if (event.key === "ArrowDown") {
        camera.pitch -= step;
        camera.pitch = Math.max(camera.pitch, -pitchLimit);
        event.preventDefault();
        return true;
    }

    return false;
}

export const handleGeodesicToggleKey = (event: KeyboardEvent, geodesicToggleState: GeodesicToggleState): boolean => {
    if (event.key.toLowerCase() !== "q") return false;

    geodesicToggleState.useRungeKutta = !geodesicToggleState.useRungeKutta;
    console.log(`Geodesic computation set to ${geodesicToggleState.useRungeKutta ? "Runge-Kutta" : "Fast"}.`);
    event.preventDefault();
    return true;
};

export const handleCameraMouseDrag = (
    event: MouseEvent,
    camera: Camera,
    mouseDrag: MouseDrag,
    sensitivity: number = 0.005,
): boolean => {
    if (!mouseDrag.active) return false;

    const dx = event.clientX - mouseDrag.lastX;
    const dy = event.clientY - mouseDrag.lastY;

    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;

    camera.yaw -= dx * sensitivity;
    camera.pitch -= dy * sensitivity;

    const pitchLimit = Math.PI * 0.5 - 0.01;
    camera.pitch = Math.max(-pitchLimit, Math.min(camera.pitch, pitchLimit));
    return true;
};

export const handleCameraWheelZoom = (
    event: WheelEvent,
    camera: Camera,
    minRadius: number,
    maxRadius: number,
    zoomStep: number = 1.1,
): boolean => {
    if (event.deltaY > 0) {
        camera.radius = Math.min(camera.radius * zoomStep, maxRadius);
    } else if (event.deltaY < 0) {
        camera.radius = Math.max(camera.radius / zoomStep, minRadius);
    } else {
        return false;
    }

    event.preventDefault();
    return true;
};
