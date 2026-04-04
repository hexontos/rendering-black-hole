//import { assert } from "node:console";

//type Byte = number & { readonly __brand: unique symbol };

export type RGB = {
    r: number;
    g: number;
    b: number;
};

export type Vector3 = { // go back to list, its mind dumbingly easier to manipulate with it <--------- NOTE
    x: number;
    y: number;
    z: number;
};

export type SchwarzschildRadius = number;

// stars or other scene objects circling the black hole.
export type Sphere = {
    pos: Vector3;
    radius: number;
    emission: RGB;
    reflectivity: RGB;
    roughness: number;
};

export type BlackHole = Sphere & {
    mass: number;
    schwarzschildRadius: SchwarzschildRadius;
    gravity: number;
};

export type RenderOBJ = Sphere | BlackHole;

export type renderObjects = {
    b: BlackHole;
    spheres: Sphere[];
};

export type Ray = {
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

export type GeodesicRay = Ray & {
    // Conserved quantities (in Schwarzschild spacetime)
    E: number;
    L: number;
};

export type Camera = {
    target: BlackHole;
    radius: number;
    yaw: number;
    pitch: number;
    focalLength: number;
};

export type WorldConfig = {
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
