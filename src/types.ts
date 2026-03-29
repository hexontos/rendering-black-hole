export type Byte = number & { readonly __brand: unique symbol };

export type Vector2 = {
    x: number;
    y: number;
};

export type Vector3 = {
    x: number;
    y: number;
    z: number;
};

export type RGB = {
    r: Byte;
    g: Byte;
    b: Byte;
};

export type SchwarzschildRadius = number;

export type BlackHole = {
    pos: Vector3;
    mass: number;
    schwarzschildRadius: SchwarzschildRadius;
    gravity: number;
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
    screenCenter: Vector2;
};
