///////////
// TYPES //
///////////

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

type RenderOBJ = Sphere | BlackHole;

type renderObjects = {
    b: BlackHole;
    spheres: Sphere[];
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
    target: BlackHole;
    radius: number;
    yaw: number;
    pitch: number;
    focalLength: number;
};

type INTERSECTION =
    | {
        collided: true;
        point: Vector3;
        dist: number;
        normal: Vector3;
        object: RenderOBJ;
    }
    | {
        collided: false;
        dist: number;
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

const rgb = (r: number, g: number, b: number) => ({ r, g, b } satisfies RGB);

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

/////////////////////////
// CPU PIPELINE RENDER //
/////////////////////////

const cross = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
};

const orbitCamera = (camera: Camera): Vector3 => {
    // for now only x&z axis
    const center = camera.target.pos;

    return vec3(
        center.x + camera.radius * Math.cos(camera.yaw),
        center.y,
        center.z + camera.radius * Math.sin(camera.yaw)
    );
};

const cameraForward = (cPos: Vector3, camera: Camera): Vector3 => {
    return normalize(sub(camera.target.pos, cPos));
};

const cameraUp = (forward: Vector3, right: Vector3): Vector3 => {
    return normalize(cross(forward, right));
};

const cameraRight = (forward: Vector3): Vector3 => {
    const worldUp = vec3(0, 1, 0);
    return normalize(cross(worldUp, forward));
};

const reflect = (direction: Vector3, normal: Vector3): Vector3 => {
    return sub(direction, mul(normal, dot(direction, normal) * 2));
};

const mulParts = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x * b.x, a.y * b.y, a.z * b.z);
};

const dot = (a: Vector3, b: Vector3): number => {
    return a.x * b.x + a.y * b.y + a.z * b.z;
};

const mag = (a: Vector3): number => {
    const ret = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2)
    if (ret === 0) return 1;
    return ret;
};

const mul = (a: Vector3, b: number): Vector3 => {
    return vec3(a.x * b, a.y * b, a.z * b);
};

const sub = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
};

const add = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
};

const normalize = (vector: Vector3): Vector3 => {
    const { x, y, z } = vector;
    const magV = 1 / mag(vector);
    return vec3(x*magV, y*magV, z*magV);
};

const intersection = (origin: Vector3, direction: Vector3, objects: RenderOBJ[]): INTERSECTION => {
    let minDist: number = Infinity;
    let closestIntersection: Extract<INTERSECTION, { collided: true }> | undefined;
    let collided: boolean = false;
    let closestObject: RenderOBJ | undefined;

    for (const object of objects) {
        let currentIntersection: INTERSECTION;

        const sphereRay = sub(object.pos, origin);
        const distSphereRay = mag(sphereRay);
        const distToClosestPointOnRay = dot(sphereRay, direction);
        const distFromClosestPointToSphere = Math.sqrt(
            Math.max(0, distSphereRay ** 2 - distToClosestPointOnRay ** 2),
        );

        const distToIntersection = distToClosestPointOnRay - Math.sqrt(
            Math.abs(object.radius ** 2 - distFromClosestPointToSphere ** 2),
        );
        const point = add(origin, mul(direction, distToIntersection));
        let normal = normalize(sub(point, object.pos));

        // calc roughness
        normal = normalize(add(normal, mul(vec3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), object.roughness)));

        if (distToClosestPointOnRay > 0 && distFromClosestPointToSphere < object.radius) {
            currentIntersection = {
                collided: true,
                dist: distToIntersection,
                point,
                normal,
                object,
            };
        } else {
            currentIntersection = {
                collided: false,
                dist: Infinity,
            };
        }

        if (currentIntersection.collided && currentIntersection.dist < minDist) {
            closestIntersection = currentIntersection;
            closestObject = object;
            minDist = currentIntersection.dist;
        }

        collided = collided || currentIntersection.collided;
    }

    if (collided && closestIntersection != null && closestObject != null) {
        return {
            collided: true,
            point: closestIntersection.point,
            dist: closestIntersection.dist,
            normal: closestIntersection.normal,
            object: closestObject,
        };
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const trace = (origin: Vector3, direction: Vector3, renderObjects: RenderOBJ[], steps: number): Vector3 => {
    const hit = intersection(origin, direction, renderObjects);

    if (hit.collided && steps > 0) {
        const reflectedOrigin = hit.point;
        const reflectedDirection = reflect(direction, hit.normal);
        return add(
            vec3(hit.object.emission.r, hit.object.emission.g, hit.object.emission.b),
            mulParts(
                trace(reflectedOrigin, reflectedDirection, renderObjects.filter((o) => o !== hit.object), steps - 1),
                vec3(hit.object.reflectivity.r, hit.object.reflectivity.g, hit.object.reflectivity.b),
            ),
        );
    }

    return vec3(0, 0, 0);
};

const cpuPixelIndex = (x: number, y: number, screenWidth: number): number => (y * screenWidth + x) * 4;

const cpuRenderRadientBG = (image: ImageData, wc: WorldConfig): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;

    const pixels: ImageDataArray = image.data;

    for (let y = 0; y < SCREEN_HEIGHT; y++) {
        const v = y / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const u = x / Math.max(SCREEN_WIDTH - 1, 1);
            const i = cpuPixelIndex(x, y, SCREEN_WIDTH);

            pixels[i + 0] = Math.round(255 * u);
            pixels[i + 1] = Math.round(255 * v);
            pixels[i + 2] = Math.round(255 * (1.0 - u));
            pixels[i + 3] = 255;
        }
    }
};

const toneMap = (value: number): number => 255 * (1 - Math.exp(-value * 0.02));
const toByte = (value: number): number => Math.max(0, Math.min(255, Math.round(toneMap(value))));

const cpuRenderRayTracing = (
    _ctx: CanvasRenderingContext2D,
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const pixels: ImageDataArray = image.data;
    const samples = 4; // for computing randomness like roughness material in spheres

    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);

    // each pixel in canvas
    for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
        for (let i: number = 0; i < SCREEN_WIDTH; i++) {
            const x: number = i - SCREEN_WIDTH * 0.5;
            const y: number = j - SCREEN_HEIGHT * 0.5;

            const rayDirection = normalize(add(add(mul(right, x), mul(up, -y),), mul(forward, camera.focalLength)));
            const rayOrigin = cameraPos;
            const firstHit = intersection(rayOrigin, rayDirection, [worldObjects.b, ...worldObjects.spheres]);

            if (!firstHit.collided) continue;

            let pixel: Vector3 = vec3(0, 0, 0);
            
            // spheres
            for (let n: number = 0; n < samples; n++) {
                pixel = add(pixel, trace(rayOrigin, rayDirection, [worldObjects.b, ...worldObjects.spheres], samples));
                //pixel = add(pixel, trace([0, 0, 0], rayDirection, worldObjects, 4));
            };

            pixel = mul(pixel, 1/samples);
            const index = cpuPixelIndex(i, j, SCREEN_WIDTH);
            pixels[index + 0] = toByte(pixel.x);
            pixels[index + 1] = toByte(pixel.y);
            pixels[index + 2] = toByte(pixel.z);
            pixels[index + 3] = 255;
        }
    }
};

function cpuPipeline(
    ctx: CanvasRenderingContext2D,
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
): void {
    cpuRenderRadientBG(image, wc);
    cpuRenderRayTracing(ctx, image, camera, worldObjects, wc);
    ctx.putImageData(image, 0, 0);
}

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
const SCHWARZSCHILD_RADIUS = 2.0 * G * SAGITTARIUS_A_MASS / (C ** 2);

// Scene distances below are stored in meters.
const EVENT_HORIZON_RADIUS = SCHWARZSCHILD_RADIUS;
const CAMERA_RADIUS = 7 * SCHWARZSCHILD_RADIUS;

const blackHole = {
    pos: WORLD_CENTER,
    mass: SAGITTARIUS_A_MASS,
    schwarzschildRadius: SCHWARZSCHILD_RADIUS,
    gravity: G * SAGITTARIUS_A_MASS,
    radius: EVENT_HORIZON_RADIUS,
    emission: rgb(0, 0, 0),
    reflectivity: rgb(0, 0, 0),
    roughness: 0,
} satisfies BlackHole;


const camera = {
    target: blackHole,
    radius: CAMERA_RADIUS,
    yaw: 0,
    pitch: 0,
    focalLength: 600,
} satisfies Camera;

const worldObjects: renderObjects = {
    b: blackHole,
    spheres: [
        {
            pos: vec3(2.5 * SCHWARZSCHILD_RADIUS, 0, 0),
            radius: 0.65 * SCHWARZSCHILD_RADIUS,
            emission: rgb(255, 255, 140),
            reflectivity: rgb(1, 1, 1), // normalized 0..1 per channel
            roughness: 0,
        },
        {
            pos: vec3(10.5 * SCHWARZSCHILD_RADIUS, 0, 0),
            radius: 0.8 * SCHWARZSCHILD_RADIUS,
            emission: rgb(255, 255, 0),
            reflectivity: rgb(0, 0, 0),
            roughness: 0,
        },
    ],
};

const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);

window.addEventListener("keydown", (event) => {
    handleCameraKeyArrows(event, camera);
});

const FPS = 30;
cpuPipeline(ctx, image, camera, worldObjects, worldConf);
window.setInterval(() => {
    cpuPipeline(ctx, image, camera, worldObjects, worldConf);
}, 1000 / FPS);
