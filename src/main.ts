import { rgb, vec3 } from "./common";
import { cpuPipeline } from "./cpuPipeline";
import type {
    BlackHole,
    Camera,
    GeodesicRay,
    Ray,
    Vector3,
    WorldConfig,
    renderObjects,
} from "./types";

////////////////////
// Event Listener //
////////////////////


const handleCameraKeyArrows = (event: KeyboardEvent, camera: Camera, step: number = 0.1): void => {
    if (event.key === "ArrowLeft") {
        camera.yaw -= step;
        event.preventDefault();
    };

    if (event.key === "ArrowRight") {
        camera.yaw += step;
        event.preventDefault();
    };
}


/////////////////////
// ARROW FUNCTIONS //
/////////////////////

const ray = (pos: Vector3, dir: Vector3): Ray => {
    const r = Math.hypot(pos.x, pos.y);
    const phi = Math.atan2(pos.y, pos.x);
    if (r === 0) throw new Error("Cannot initialize a ray at the origin....");
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

const gRay = (ray: Ray, blackHole: BlackHole): GeodesicRay => {
    const L = ray.r ** 2 * ray.dphi;
    const f = 1.0 - blackHole.schwarzschildRadius / ray.r;
    const dt_dλ = Math.sqrt((ray.dr ** 2) / (f ** 2) + ((ray.r ** 2) * (ray.dphi ** 2)) / f);
    const E = f * dt_dλ;

    return {
        ...ray,
        E,
        L,
    };
};

///////////////
// CONSTANTS //
///////////////

const canvasElement = document.getElementById("blackhole-canvas");

if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("Canvas element #blackhole-canvas was not found....");

const canvas = canvasElement;
const context = canvas.getContext("2d");

if (context == null) throw new Error("2D canvas context could not be created....");

const ctx = context as CanvasRenderingContext2D;

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

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: 2.0 * G * SAGITTARIUS_A_MASS / (C ** 2),
    gravity: G * SAGITTARIUS_A_MASS,
    radius: 1,
    emission: rgb(0, 0, 0),
    reflectivity: rgb(0, 0, 0),
    roughness: 0,
} satisfies BlackHole;


const camera = {
    target: blackHole,
    radius: 10000000,
    yaw: 0,
    pitch: 0,
    focalLength: 50,
} satisfies Camera;

const worldObjects: renderObjects = { b: blackHole, spheres: [] };

const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

window.addEventListener("keydown", (event) => {
    handleCameraKeyArrows(event, camera);
});

// main loop
while (true) {
    cpuPipeline(ctx, image, worldObjects, worldConf);
}