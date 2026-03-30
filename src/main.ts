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

// stars or other scene objects circling the black hole.
type Sphere = {
    pos: Vector3;
};

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

const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);

const ray = (pos: Vector3, dir: Vector3): Ray => {
    const r = Math.hypot(pos.x, pos.y);
    const phi = Math.atan2(pos.y, pos.x);

    if (r === 0) throw new Error("Cannot initialize a ray at the origin.");

    // Convert the Cartesian direction into polar radial/angular components.
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

if (!(canvasElement instanceof HTMLCanvasElement)) throw new Error("Canvas element #blackhole-canvas was not found.");

const canvas = canvasElement;
const context = canvas.getContext("2d");

if (context == null) throw new Error("2D canvas context could not be created.");

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
} satisfies BlackHole;


const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
const pixels = image.data;


const pixelIndex = (x: number, y: number): number => (y * SCREEN_WIDTH + x) * 4;

function renderGradient(): void {
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
        const v = y / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const u = x / Math.max(SCREEN_WIDTH - 1, 1);
            const i = pixelIndex(x, y);

            pixels[i + 0] = Math.round(255 * u);
            pixels[i + 1] = Math.round(255 * v);
            pixels[i + 2] = Math.round(255 * (1.0 - u));
            pixels[i + 3] = 255;
        }
    }

    ctx.putImageData(image, 0, 0);
}

renderGradient();
