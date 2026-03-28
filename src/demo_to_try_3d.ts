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
    position: POINT,
    radius: number,
    emission: RGB,
    reflectivity: RGB,
    roughness: number,
}
type SPHERE = OBJECT;
type Vector3 = [number, number, number];

const objects: SPHERE[] = [
    {
        position: [0,-14.5,7],
        radius: 5,
        emission: [5550,5550,5550],
        reflectivity: [1,1,1],
        roughness: 3,
    },
    {
        position: [3,7,7],
        radius: 3,
        emission: [0,0,0],
        reflectivity: [1,1,1],
        roughness: 0,
    },
]

type INFINITY = number & { readonly __infinity: unique symbol };
type INTERSECTION = 
    | {
        collided: true;
        point: POINT;
        dist: number;
        normal: Vector3;
        object?: OBJECT;
    }
    | {
        collided: false;
        dist: INFINITY;
    };
type HIT_INTERSECTION = Extract<INTERSECTION, { collided: true }>;

const INFINITY_DISTANCE = Infinity as INFINITY;

const normalize = (vector: Vector3): Vector3 => {
    const [x, y, z]: Vector3 = vector
    // mag op
    let mag = Math.sqrt((x**2 + y**2 + z**2));
    // mul op
    mag = 1/mag;
    return [x * mag, y * mag, z * mag];
}

type Tuple3<T> = [T, T, T];
type NumericTuple<T extends number> = readonly [T, ...T[]];

const dot = <T extends number, U extends NumericTuple<T>>(a: U, b: U): number => {
    return a.map((v, i) => v * (b[i] as number)).reduce((acc, curr) => acc + curr, 0);
};

const mag = <T extends [number, number, number]>(a: T): number => {
    return Math.sqrt((a.map((v, _) => v**2) as T).reduce((acc, curr) => acc + curr, 0));
}

const mul = <T extends Tuple3<number>>(a: T, b: number): T => {
    return a.map((v, _) => v*b) as T;
}

const add = <T extends Tuple3<number>>(a: T, b: T): T => {
    return a.map((v, i) => v + (b[i] as number)) as T;
}

const sub = <T extends Tuple3<number>>(a: T, b: T): T => {
    return add(a, mul(b, -1)) as T;
}

const intersection = (origin: POINT, direction: Vector3, spheres: SPHERE[]): INTERSECTION => {
    // later upgrade to BVH
    let minDist: number = Infinity;
    let closestIntersection: HIT_INTERSECTION | undefined;
    let collided: boolean = false;
    let closestSphere: SPHERE | undefined;

    for (const sphere of spheres) {
        let intersection: INTERSECTION;

        // we only compute spheres
        const sphereRay: Vector3 = sub(sphere.position, origin);
        const distSphereRay: number = mag(sphereRay);
        const distToClosestPointOnRay: number = dot(sphereRay, direction);
        const distFromClosestPointToSphere: number = Math.sqrt(distSphereRay ** 2 - distToClosestPointOnRay ** 2);

        const distToIntersection: number = distToClosestPointOnRay - Math.sqrt(Math.abs(sphere.radius ** 2 - distFromClosestPointToSphere ** 2))
        const point: POINT = add(origin, mul(direction, distToIntersection));
        let normal: Vector3 = normalize(sub(point, sphere.position));

        // calc rougness
        normal = normalize(add(normal, mul([Math.random()-0.5, Math.random()-0.5, Math.random()-0.5], sphere.roughness)))

        if (distToClosestPointOnRay > 0 && distFromClosestPointToSphere < sphere.radius) {
            intersection = {
                collided: true,
                dist: distToIntersection,
                point: point,
                normal: normal,
            }
        } else {
            intersection = {
                collided: false,
                dist: INFINITY_DISTANCE,
            }
        }

        if (intersection.collided && intersection.dist < minDist) {
            closestIntersection = intersection;
            closestSphere = sphere;

            minDist = intersection.dist
        }

        // once true, always true
        collided = collided || intersection.collided
        
    }

    if (collided && closestIntersection != null && closestSphere != null) {
        return {
            collided: true,
            point: closestIntersection.point,
            dist: closestIntersection.dist,
            normal: closestIntersection.normal,
            object: closestSphere,
        }
    }

    return {
        collided: false,
        dist: INFINITY_DISTANCE,
    }
}

const trace = (origin: POINT, direction: Vector3, spheres: SPHERE[], steps: number): RGB => {
    let interection: INTERSECTION = intersection(origin, direction, spheres);
    return [0, 0, 0];
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
