import type {
    Camera,
    GradientBackground,
    MouseDrag,
    Sphere,
    Vector3,
    RGB,
    renderObjects,
} from "./types";
// TO DO: add comands to get values from object in currect positions (like  the camera)
export type DemoName = "sim2d" | "rayRender3d";

type ConsoleCommandContext = {
    worldObjects?: renderObjects;
    requestRender: () => void;
    runDemo: (demoName: DemoName) => void;
    runBlackholeSimulation: () => void;
};

type GeodesicToggleState = {
    useRungeKutta: boolean;
};

type SceneShortcutActions = {
    toggleRenderPipeline: () => void;
    toggleCanvasSize: () => void;
    toggleSpheres: () => void;
    toggleGeodesicEnabled: () => void;
    toggleOverlayVisibility: () => void;
};

const cycleBackgroundShortcut = (worldObjects: renderObjects): void => {
    const background = worldObjects.background;

    if (background.mode !== "stars") {
        background.mode = "stars";
        background.stars.milkyWayVisible = true;
        return;
    }

    if (background.stars.milkyWayVisible) {
        background.stars.milkyWayVisible = false;
        return;
    }

    background.mode = "empty";
    background.stars.milkyWayVisible = false;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
};

const isFiniteNumber = (value: unknown): value is number => {
    return typeof value === "number" && Number.isFinite(value);
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

const mainSimulationOnly = (commandName: string): void => {
    console.error(`${commandName}() is only available in the main black hole simulation.`);
};

const mainWorldObjects = (context: ConsoleCommandContext, commandName: string): renderObjects | null => {
    if (context.worldObjects == null) {
        mainSimulationOnly(commandName);
        return null;
    }

    return context.worldObjects;
};

const printHelp = (mainSimulationCommandsAvailable: boolean): void => {
    const mainSimulationSection = !mainSimulationCommandsAvailable
        ? "Main-simulation scene commands are unavailable while a demo is running."
        : `- setGradientBackground(background): replace the full colorful background object and activate it
- setSpheres(sphere): append one sphere
- setSpheres([sphere, ...]): replace the whole sphere list

Gradient background shape:
{ topLeft: { r, g, b }, topRight: { r, g, b }, bottomLeft: { r, g, b }, bottomRight: { r, g, b } }

Sphere shape:
{ pos: { x, y, z }, radius, emission: { r, g, b } }

Examples:
runDemo("sim2d")
runDemo("rayRender3d")
runBlackholeSimulation()
setGradientBackground({ topLeft: { r: 255, g: 48, b: 48 }, topRight: { r: 255, g: 220, b: 0 }, bottomLeft: { r: 24, g: 12, b: 120 }, bottomRight: { r: 160, g: 0, b: 255 } })
setSpheres({ pos: { x: -100, y: 0, z: 0 }, radius: 10, emission: { r: 255, g: 160, b: 0 } })
setSpheres([{ pos: { x: -100, y: 0, z: 0 }, radius: 10, emission: { r: 255, g: 160, b: 0 } }])`;

    console.log(
`Black hole simulation console commands:
- help(): show this list
- runDemo("sim2d"): switch to the 2D geodesic demo
- runDemo("rayRender3d"): switch to the 3D straight-ray demo
- runBlackholeSimulation(): switch back to the main black hole simulation

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

    target.setGradientBackground = (gradientBackground: unknown) => {
        const worldObjects = mainWorldObjects(context, "setGradientBackground");
        if (worldObjects == null) return;
        if (!isGradientBackground(gradientBackground)) {
            console.error("setGradientBackground() expects a full gradient background object.");
            return;
        }

        worldObjects.background.gradient = gradientBackground;
        worldObjects.background.mode = "gradient";
        context.requestRender();
    };

    target.setSpheres = (nextSpheres: unknown) => {
        const worldObjects = mainWorldObjects(context, "setSpheres");
        if (worldObjects == null) return;

        if (Array.isArray(nextSpheres)) {
            if (!nextSpheres.every(isSphere)) {
                console.error("setSpheres([...]) expects an array of full sphere objects.");
                return;
            }

            worldObjects.spheres = nextSpheres;
            context.requestRender();
            return;
        }

        if (!isSphere(nextSpheres)) {
            console.error("setSpheres(sphere) expects one full sphere object, or an array of full sphere objects.");
            return;
        }

        worldObjects.spheres.push(nextSpheres);
        context.requestRender();
    };
};

export const handleCameraKeyArrows = (event: KeyboardEvent, camera: Camera, step: number = 0.05): boolean => {
    const pitchLimit = Math.PI * 0.5 - 0.01;

    switch (event.key) {
        case "ArrowLeft":
            camera.yaw += step;
            event.preventDefault();
            return true;
        case "ArrowRight":
            camera.yaw -= step;
            event.preventDefault();
            return true;
        case "ArrowUp":
            camera.pitch += step;
            camera.pitch = Math.min(camera.pitch, pitchLimit);
            event.preventDefault();
            return true;
        case "ArrowDown":
            camera.pitch -= step;
            camera.pitch = Math.max(camera.pitch, -pitchLimit);
            event.preventDefault();
            return true;
        default:
            return false;
    }
};

export const handleGeodesicToggleKey = (event: KeyboardEvent, geodesicToggleState: GeodesicToggleState): boolean => {
    if (event.key !== "2") return false;

    geodesicToggleState.useRungeKutta = !geodesicToggleState.useRungeKutta;
    event.preventDefault();
    return true;
};

export const handleSceneToggleKeys = (
    event: KeyboardEvent,
    worldObjects: renderObjects,
    actions: SceneShortcutActions,
): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    switch (event.key) {
        case "1":
            actions.toggleCanvasSize();
            event.preventDefault();
            return true;
        case "3":
            actions.toggleGeodesicEnabled();
            event.preventDefault();
            return true;
        case "4":
            cycleBackgroundShortcut(worldObjects);
            event.preventDefault();
            return true;
        case "5":
            worldObjects.grid.visible = !worldObjects.grid.visible;
            event.preventDefault();
            return true;
        case "6":
            worldObjects.disc.visible = !worldObjects.disc.visible;
            event.preventDefault();
            return true;
        case "7":
            actions.toggleSpheres();
            event.preventDefault();
            return true;
        case "9":
            actions.toggleOverlayVisibility();
            event.preventDefault();
            return true;
        case "0":
            actions.toggleRenderPipeline();
            event.preventDefault();
            return true;
        default:
            return false;
    }
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

export const handleCameraZoomKeys = (
    event: KeyboardEvent,
    camera: Camera,
    minRadius: number,
    maxRadius: number,
    zoomStep: number = 1.1,
): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;

    if (event.key === "+" || event.key === "=") {
        camera.radius = Math.max(camera.radius / zoomStep, minRadius);
        event.preventDefault();
        return true;
    }

    if (event.key === "-" || event.key === "_") {
        camera.radius = Math.min(camera.radius * zoomStep, maxRadius);
        event.preventDefault();
        return true;
    }

    return false;
};
