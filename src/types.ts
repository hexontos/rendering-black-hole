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
};

export type BlackHole = Sphere & {
    mass: number;
    schwarzschildRadius: SchwarzschildRadius;
    gravity: number;
};

export type Disc = {
    pos: Vector3;
    innerRadius: number;
    outerRadius: number;
    visible: boolean;
    nearColor: RGB;
    farColor: RGB;
    radialBoost: RGB;
};

export type RenderGeodesic = {
    dλ: number;
    maxSteps: number;
    escapeRadiusMultiplier: number;
    useRungeKutta: boolean;
};

export type Grid = {
    visible: boolean;
    pos: Vector3;
    halfSize: number;
    cellSize: number;
    maxDrop: number;
    lineColor: RGB;
};

export type BackgroundMode = "stars" | "gradient" | "empty";

export type StarsBackground = {
    densityPrimary: number;
    densitySecondary: number;
    baseColor: RGB;
    milkyWayVisible: boolean;
    milkyWayNormal: Vector3;
    milkyWayWidth: number;
    milkyWayIntensity: number;
    milkyWayColor: RGB;
};

export type GradientBackground = {
    topLeft: RGB;
    topRight: RGB;
    bottomLeft: RGB;
    bottomRight: RGB;
};

export type EmptyBackground = {
    color: RGB;
};

export type Background = {
    mode: BackgroundMode;
    stars: StarsBackground;
    gradient: GradientBackground;
    empty: EmptyBackground;
};

export type RenderOBJ = Sphere | BlackHole;

export type renderObjects = {
    background: Background;
    blackhole: BlackHole;
    disc: Disc;
    renderGeodesic: RenderGeodesic;
    grid: Grid;
    spheres: Sphere[];
};

export type Camera = {
    target: BlackHole;
    radius: number;
    yaw: number;
    pitch: number;
    focalLength: number;
};

export type INTERSECTION =
    | {
        collided: true;
        point: Vector3;
        dist: number;
        object: RenderOBJ;
    }
    | {
        collided: false;
        dist: number;
    };

export type PLANE_INTERSECTION =
    | {
        collided: true;
        dist: number;
        point: Vector3;
    }
    | {
        collided: false;
        dist: number;
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

export type MouseDrag = {
    active: boolean;
    lastX: number;
    lastY: number;
};
