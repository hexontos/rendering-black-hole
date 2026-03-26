const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;

if (context == null) {
    throw new Error("something went wrong. guhehi");
}
const ctx = context as CanvasRenderingContext2D;

const SCREEN_HEIGHT: number = canvas.height;
const SCREEN_WIDTH: number  = canvas.width;

type RGB = [number, number, number];

const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
const pixels = image.data;
const pixelIndex = (x: number, y: number): number => (y * SCREEN_WIDTH + x) * 4; // format of pixels is RGBA

const TOP_LEFT: RGB = [255, 48, 48];
const TOP_RIGHT: RGB = [255, 220, 0];
const BOTTOM_LEFT: RGB = [0, 140, 255];
const BOTTOM_RIGHT: RGB = [160, 0, 255];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpColor = (start: RGB, end: RGB, t: number): RGB => [
    Math.round(lerp(start[0], end[0], t)),
    Math.round(lerp(start[1], end[1], t)),
    Math.round(lerp(start[2], end[2], t)),
];

for (let y: number = 0; y < SCREEN_HEIGHT; y++) {
    const v: number = y / Math.max(SCREEN_HEIGHT - 1, 1);
    for (let x: number = 0; x < SCREEN_WIDTH; x++) {
        const u: number = x / Math.max(SCREEN_WIDTH - 1, 1);
        const top: RGB = lerpColor(TOP_LEFT, TOP_RIGHT, u);
        const bottom: RGB = lerpColor(BOTTOM_LEFT, BOTTOM_RIGHT, u);
        const [r, g, b]: RGB = lerpColor(top, bottom, v);

        const i = pixelIndex(x, y);
        pixels[i + 0] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = 255;
    }
}

ctx.putImageData(image, 0, 0);

type POINT = [number, number, number];
type OBJECT = {
    shape: string,
    position: POINT,
    radius: number,
    emission: RGB,
    reflectivity: RGB,
    roughness: number,
}
type Vector3 = [number, number, number];

const objects: OBJECT[] = [
    {
        shape: "sphere",
        position: [0,-14.5,7],
        radius: 5,
        emission: [5550,5550,5550],
        reflectivity: [1,1,1],
        roughness: 3,
    },
    {
        shape: "sphere",
        position: [3,7,7],
        radius: 3,
        emission: [0,0,0],
        reflectivity: [1,1,1],
        roughness: 0,
    },
]

type INTERSECTION = {
    collided: boolean,
    point: POINT,
    dist: number,
    normal: POINT,
    object: OBJECT,
}

const intersection = (origin: POINT, direction: Vector3, objects: OBJECT[]): INTERSECTION => {
    // later upgrade to BVH
}

const trace = (origin, direction, objects, steps): RGB => {
    let interection: INTERSECTION = intersection(origin, direction, objects);
}

const normalize = (vector: Vector3): Vector3 => {
    const [x, y, z]: Vector3 = vector
    // mag op
    let mag = Math.sqrt((x**2 + y**2 + z**2));
    // mul op
    mag = 1/mag;
    return [x * mag, y * mag, z * mag];
}

const focalLength: number = 50;
const samples: number = 10;
// main loop
// we assume fixed camera (and dont need angle)
//  - position: [0,0,0]
//  - forward: [0,0,1]
//  - right: [1,0,0]
//  - up: [0,1,0]
// otherwise we would do something like this direction = normalize(x * right + y * up + focalLength * forward)
for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
    for (let i: number = 0; i < SCREEN_WIDTH; i++) {
        let x: number = i - SCREEN_WIDTH * 0.5;
        let y: number = j - SCREEN_HEIGHT * 0.5;

        // make ray point of creation and screen plane 
        let rayDirection = normalize([x, y, focalLength]) // normalize to 0-1

        let pixel: RGB = [0, 0, 0];
        for (let i: number = 0; i < samples; i++) {
            // add op (a: Vector + b: Vector -> c: Vector)
            const [x, y, z] = trace([0, 0, 0], rayDirection, objects, 4);
            pixel[0] += x;
            pixel[1] += y;
            pixel[2] += z;
        }
    }
}
