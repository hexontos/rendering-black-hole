///////////
// TYPES //
///////////

//import { assert } from "node:console";

//type Byte = number & { readonly __brand: unique symbol };

type RGB = {
    r: number;
    g: number;
    b: number;
};

type Vector3 = { // go back to list, its mind dumbingly easier to manipulate with it <--------- NOTE
    x: number;
    y: number;
    z: number;
};

type SchwarzschildRadius = number;

// stars or other scene objects circling the black hole.
type Sphere = {
    pos: Vector3;
    radius: number;
    emission: RGB;
    reflectivity: RGB;
    roughness: number;
};

type BlackHole = Sphere & {
    mass: number;
    schwarzschildRadius: SchwarzschildRadius;
    gravity: number;
};

type RenderOBJ = Sphere | BlackHole
type renderObjects = {
    b: BlackHole;
    spheres: Sphere[];
}

type Ray = {
    // cartesian state.
    pos: Vector3;
    dir: Vector3;
    // polar state
    r: number;
    phi: number;
    // seed velocities
    dr: number;
    dphi: number;
};

type GeodesicRay = Ray & {
    // Conserved quantities (in Schwarzschild spacetime)
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

const rgb = (r: number, g: number, b: number) => ({r, g, b} satisfies RGB);

const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);

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

const cameraOffset = 
const camera = {
    pos: blackHole.pos * 2,
    fixedView: blackHole.pos,
    angle: 0,
    distance: 0.5,
} satisfies Camera;

const worldObjects: renderObjects = {b: blackHole, spheres: []};

const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

// each pixel in canvas
for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
    for (let i: number = 0; i < SCREEN_WIDTH; i++) {
        const x: number = i - SCREEN_WIDTH * 0.5;
        const y: number = j - SCREEN_HEIGHT * 0.5;


    }
}

const cpuPixelIndex = (x: number, y: number): number => (y * SCREEN_WIDTH + x) * 4;

const cpuRenderRadientBG = (ctx: CanvasRenderingContext2D, image: ImageData, wc: WorldConfig): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;

    const pixels: ImageDataArray = image.data;

    const cpuPixelIndex = (x: number, y: number): number => (y * SCREEN_WIDTH + x) * 4;

    for (let y = 0; y < SCREEN_HEIGHT; y++) {
        const v = y / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const u = x / Math.max(SCREEN_WIDTH - 1, 1);
            const i = cpuPixelIndex(x, y);

            pixels[i + 0] = Math.round(255 * u);
            pixels[i + 1] = Math.round(255 * v);
            pixels[i + 2] = Math.round(255 * (1.0 - u));
            pixels[i + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);
}

const cpuRenderRayTracing = (ctx: CanvasRenderingContext2D, image: ImageData, worldObjects: renderObjects, wc: WorldConfig) => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const pixels: ImageDataArray = image.data;
    const samples = 4;

    for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
        for (let i: number = 0; i < SCREEN_WIDTH; i++) {
            let x: number = i - SCREEN_WIDTH * 0.5;
            let y: number = j - SCREEN_HEIGHT * 0.5;

            let pixel: RGB = rgb(0, 0, 0)

            // blackhole


            // spheres
            for (let i: number = 0; i < samples; i++) {
                //pixel = add(pixel, trace([0, 0, 0], rayDirection, worldObjects, 4));
            };
        }
    }
}

function cpuPipeline(worldObjects: renderObjects) {
    cpuRenderRadientBG(ctx, image, SCREEN_WIDTH, SCREEN_HEIGHT);
    cpuRenderRayTracing()
}