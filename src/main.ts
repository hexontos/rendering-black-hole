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

// stars or objects circling Blackhole
type Sphere = {
    pos: Vector3
}

type Ray = {
    // cartesian
    pos: Vector3;
    dir: Vector3;
    // polar coords
    r: number;
    phi: number;
    // seed velocities
    dr: number;
    dphi: number;
}

type GeodesicRay = Ray & {
    // store conserved quantities
    E: number;
    L: number;
}

type Camera = {
    pos: Vector3;
    fixedView: Vector3; // centered to Blackhole
    angle: number;
    distance: number;
}

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

///////////////
// FUNCTIONS //
///////////////

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
}

////////////////////
// CREATE OBJECTS //
////////////////////

const vec3 = (x: number, y: number, z: number) => ({x, y, z} satisfies Vector3);
const ray = (pos: Vector3, dir: Vector3): Ray => {
    {
        const r = Math.hypot(pos.x, pos.y);
        const phi = Math.atan2(pos.y, pos.x);
        const dr = dir.x * Math.cos(phi) + dir.y * Math.sin(phi); // m / s
        const dphi = (-dir.x * Math.sin(phi) + dir.y * Math.cos(phi)) / r;
        return {
            pos,
            dir,
            r,
            phi,
            dr,
            dphi,
        }
    }
};

const gRay = (ray: Ray, blackHole: BlackHole): GeodesicRay => {
    const L: number = ray.r ** 2 * ray.dphi;
    const f: number = 1.0 - blackHole.schwarzschildRadius / ray.r;
    const dt_dλ: number = Math.sqrt(ray.dr**2 / f**2 + (ray.dphi**2) / f);
    const E: number = f * dt_dλ;
    return {
        ...ray,
        E,
        L
    }
}

///////////////
// CONSTANTS //
///////////////

const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const ctx = getCanvasContext(canvas);

const worldConf = {
    screenWidth: canvas.width,
    screenHeight: canvas.height,
    simWidth: 100000000000.0, // in meters (half-height)
    simHeight: 75000000000.0, // in meters (half-width)
    c: 2.99792458e8, // photon speed
    g: 6.67430e-11, // gravity force
    solarMass: 1.989e30, // kg
    sagittariusAMass: 4.3e6 * 1.989e30,
    worldCenter: vec3(0.0, 0.0, 0.0),
    screenCenter: vec3(canvas.width * 0.5, canvas.height * 0.5, 0.0),
} satisfies WorldConfig;

const SCREEN_HEIGHT: number = worldConf.screenHeight;
const SCREEN_WIDTH: number  = worldConf.screenWidth;
const SIM_HEIGHT: number = worldConf.simHeight;
const SIM_WIDTH: number = worldConf.simWidth;
const C: number = worldConf.c;
const G: number  = worldConf.g;
const SOLAR_MASS = worldConf.solarMass;
const SAGITTARIUS_A_MASS = worldConf.sagittariusAMass;
const WORLD_CENTER = worldConf.worldCenter;
const SCREEN_CENTER = worldConf.screenCenter;
const SCALE_X = SCREEN_WIDTH / (SIM_WIDTH * 2.0);
const SCALE_Y = SCREEN_HEIGHT / (SIM_HEIGHT * 2.0);
const SCALE = Math.min(SCALE_X, SCALE_Y);

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: 2.0 * G * SAGITTARIUS_A_MASS / (C**2),
    gravity: G * SAGITTARIUS_A_MASS,
} satisfies BlackHole;
