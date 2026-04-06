import {
    add,
    cameraForward,
    cameraRight,
    cameraUp,
    dot,
    gRay,
    mag,
    mul,
    mulParts,
    normalize,
    orbitCamera,
    ray,
    reflect,
    sphericalBasis,
    sub,
    vec3,
} from "./common";
import type {
    BlackHole,
    Camera,
    GeodesicRay,
    INTERSECTION,
    PLANE_INTERSECTION,
    RenderOBJ,
    SchwarzschildRadius,
    SixStates,
    Vector3,
    WorldConfig,
    renderObjects,
} from "./types";

const intersectPlane = (origin: Vector3, direction: Vector3, planeY: number): PLANE_INTERSECTION => {
    if (Math.abs(direction.y) < 1e-9) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const dist = (planeY - origin.y) / direction.y;
    if (dist <= 0) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    return {
        collided: true,
        dist,
        point: add(origin, mul(direction, dist)),
    };
};

const sampleGrid = (point: Vector3, cellSize: number, lineWidth: number, halfSize: number, blackhole: BlackHole): Vector3 | null => {
    const local = sub(point, blackhole.pos);
    if (Math.abs(local.x) > halfSize || Math.abs(local.z) > halfSize) return null;

    const gx = ((local.x % cellSize) + cellSize) % cellSize;
    const gz = ((local.z % cellSize) + cellSize) % cellSize;

    const onLine =
        gx < lineWidth ||
        gx > cellSize - lineWidth ||
        gz < lineWidth ||
        gz > cellSize - lineWidth;

    if (onLine) return vec3(255, 255, 255);
    return null;
};

const gridVertexY = (
    localX: number,
    localZ: number,
    baseY: number,
    maxDrop: number,
    halfSize: number,
): number => {
    const radialDist = Math.sqrt(localX ** 2 + localZ ** 2);
    const edgeT = Math.max(0, 1 - radialDist / halfSize);
    const strength = (Math.exp(4 * edgeT) - 1) / (Math.exp(4) - 1);
    return baseY - maxDrop * strength;
};

const projectPoint = (
    point: Vector3,
    cameraPos: Vector3,
    forward: Vector3,
    right: Vector3,
    up: Vector3,
    wc: WorldConfig,
    focalLength: number,
): { x: number; y: number } | null => {
    const relative = sub(point, cameraPos);
    const depth = dot(relative, forward);
    if (depth <= 0) return null;

    const screenX = wc.screenWidth * 0.5 + focalLength * dot(relative, right) / depth;
    const screenY = wc.screenHeight * 0.5 - focalLength * dot(relative, up) / depth;

    return {
        x: screenX,
        y: screenY,
    };
};

const drawLineToImage = (
    image: ImageData,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: Vector3,
    wc: WorldConfig,
): void => {
    const pixels: ImageDataArray = image.data;
    let ix0 = Math.round(x0);
    let iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);

    const dx = Math.abs(ix1 - ix0);
    const dy = Math.abs(iy1 - iy0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sy = iy0 < iy1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        if (ix0 >= 0 && ix0 < wc.screenWidth && iy0 >= 0 && iy0 < wc.screenHeight) {
            const index = cpuPixelIndex(ix0, iy0, wc.screenWidth);
            pixels[index + 0] = Math.round(color.x);
            pixels[index + 1] = Math.round(color.y);
            pixels[index + 2] = Math.round(color.z);
            pixels[index + 3] = 255;
        }

        if (ix0 === ix1 && iy0 === iy1) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            ix0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            iy0 += sy;
        }
    }
};

const intersectDisc = (origin: Vector3, direction: Vector3, blackhole: BlackHole): PLANE_INTERSECTION => {
    const discPlane = intersectPlane(origin, direction, blackhole.pos.y);

    if (discPlane.collided) {
        const local = sub(discPlane.point, blackhole.pos);
        const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
        const innerRadius = 1.5 * blackhole.schwarzschildRadius;
        const outerRadius = 2.6 * blackhole.schwarzschildRadius;

        if (radialDist >= innerRadius && radialDist <= outerRadius) {
            return discPlane;
        }
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const sampleDisc = (origin: Vector3, point: Vector3, blackhole: BlackHole): Vector3 => {
    const local = sub(point, blackhole.pos);
    const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
    const innerRadius = 1.5 * blackhole.schwarzschildRadius;
    const outerRadius = 2.6 * blackhole.schwarzschildRadius;
    const cameraAxis = normalize(vec3(origin.x - blackhole.pos.x, 0, origin.z - blackhole.pos.z));
    const axisCoord = dot(local, cameraAxis);
    const axisT = Math.max(0, Math.min(1, 0.5 - 0.5 * axisCoord / outerRadius));
    const radialT = Math.max(0, Math.min(1, (radialDist - innerRadius) / (outerRadius - innerRadius)));

    return vec3(
        255,
        85 + 120 * axisT + 45 * radialT,
        0 + 8 * axisT + 18 * radialT,
    );
};

const traceBackgroundGrid = (_origin: Vector3, _direction: Vector3): Vector3 | null => {
    return null;
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

const trace = (origin: Vector3, direction: Vector3, worldObjects: renderObjects, steps: number): Vector3 | null => {
    const blackhole = worldObjects.blackhole;
    const hit = intersection(origin, direction, [worldObjects.blackhole, ...worldObjects.spheres]);
    const discHit = intersectDisc(origin, direction, blackhole);

    if (discHit.collided && (!hit.collided || discHit.dist < hit.dist)) {
        return sampleDisc(origin, discHit.point, blackhole);
    }

    if (hit.collided && steps > 0) {
        const reflectedOrigin = hit.point;
        const reflectedDirection = reflect(direction, hit.normal);
        const reflectedColor = trace(
            reflectedOrigin,
            reflectedDirection,
            {
                blackhole: worldObjects.blackhole,
                spheres: worldObjects.spheres.filter((o) => o !== hit.object),
            },
            steps - 1,
        );
        return add(
            vec3(hit.object.emission.r, hit.object.emission.g, hit.object.emission.b),
            reflectedColor == null
                ? vec3(0, 0, 0)
                : mulParts(
                    reflectedColor,
                    vec3(hit.object.reflectivity.r, hit.object.reflectivity.g, hit.object.reflectivity.b),
                ),
        );
    }

    return traceBackgroundGrid(origin, direction);
};

const cpuRenderGravityGrid = (
    image: ImageData,
    camera: Camera,
    wc: WorldConfig,
): void => {
    const blackhole = camera.target;
    const baseY = blackhole.pos.y - 0.7 * blackhole.schwarzschildRadius;
    const halfSize = 3.5 * blackhole.schwarzschildRadius;
    const cellSize = 0.35 * blackhole.schwarzschildRadius;
    const maxDrop = 1.8 * blackhole.schwarzschildRadius;
    const gridSteps = Math.round((2 * halfSize) / cellSize);
    const lineColor = vec3(255, 255, 255);

    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);

    const projected: ({ x: number; y: number } | null)[][] = [];

    for (let z = 0; z <= gridSteps; z++) {
        const row: ({ x: number; y: number } | null)[] = [];
        for (let x = 0; x <= gridSteps; x++) {
            const localX = -halfSize + x * cellSize;
            const localZ = -halfSize + z * cellSize;
            const point = vec3(
                blackhole.pos.x + localX,
                gridVertexY(localX, localZ, baseY, maxDrop, halfSize),
                blackhole.pos.z + localZ,
            );

            row.push(projectPoint(point, cameraPos, forward, right, up, wc, camera.focalLength));
        }
        projected.push(row);
    }

    for (let z = 0; z <= gridSteps; z++) {
        const row = projected[z];
        if (row == null) continue;
        const nextRow = projected[z + 1];

        for (let x = 0; x <= gridSteps; x++) {
            const current = row[x];
            if (current == null) continue;

            if (x < gridSteps) {
                const horizontal = row[x + 1];
                if (horizontal != null) {
                    drawLineToImage(image, current.x, current.y, horizontal.x, horizontal.y, lineColor, wc);
                }
            }

            if (z < gridSteps && nextRow != null) {
                const vertical = nextRow[x];
                if (vertical != null) {
                    drawLineToImage(image, current.x, current.y, vertical.x, vertical.y, lineColor, wc);
                }
            }
        }
    }
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
            const topLeft = vec3(255, 48, 48);
            const topRight = vec3(255, 220, 0);
            const bottomLeft = vec3(24, 12, 120);
            const bottomRight = vec3(160, 0, 255);

            pixels[i + 0] = Math.round(
                topLeft.x * (1 - u) * (1 - v) +
                topRight.x * u * (1 - v) +
                bottomLeft.x * (1 - u) * v +
                bottomRight.x * u * v,
            );
            pixels[i + 1] = Math.round(
                topLeft.y * (1 - u) * (1 - v) +
                topRight.y * u * (1 - v) +
                bottomLeft.y * (1 - u) * v +
                bottomRight.y * u * v,
            );
            pixels[i + 2] = Math.round(
                topLeft.z * (1 - u) * (1 - v) +
                topRight.z * u * (1 - v) +
                bottomLeft.z * (1 - u) * v +
                bottomRight.z * u * v,
            );
            pixels[i + 3] = 255;
        }
    }
};

const computeGeodesicDerivatives = (
    state: { r: number; theta: number; dr: number; dtheta: number; dphi: number; E: number },
    schwarzschildRadius: SchwarzschildRadius,
    rhs: SixStates,
): void => {
    const r = state.r;
    const theta = state.theta;
    const dr = state.dr;
    const dtheta = state.dtheta;
    const dphi = state.dphi;
    const E = state.E;

    const f = 1.0 - schwarzschildRadius / r;
    const dtDλ = E / f;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sinThetaSafe = Math.abs(sinTheta) < 1e-9 ? (sinTheta >= 0 ? 1e-9 : -1e-9) : sinTheta;

    rhs[0] = dr;
    rhs[1] = dtheta;
    rhs[2] = dphi;
    rhs[3] = -(schwarzschildRadius / (2 * r ** 2)) * f * (dtDλ ** 2)
        + (schwarzschildRadius / (2 * r ** 2 * f)) * (dr ** 2)
        + r * (dtheta ** 2 + sinTheta * sinTheta * dphi ** 2);
    rhs[4] = -(2.0 / r) * dr * dtheta
        + sinTheta * cosTheta * dphi ** 2;
    rhs[5] = -(2.0 / r) * dr * dphi
        - 2.0 * cosTheta / sinThetaSafe * dtheta * dphi;
};

const fourthOrderRungeKutta = (ray: GeodesicRay, dλ: number, schwarzschildRadius: SchwarzschildRadius): void => {

    const y: SixStates = [ray.r, ray.theta, ray.phi, ray.dr, ray.dtheta, ray.dphi];
    const k1: SixStates = [0, 0, 0, 0, 0, 0];
    const k2: SixStates = [0, 0, 0, 0, 0, 0];
    const k3: SixStates = [0, 0, 0, 0, 0, 0];
    const k4: SixStates = [0, 0, 0, 0, 0, 0];
    const temp: SixStates = [0, 0, 0, 0, 0, 0];

    computeGeodesicDerivatives({ r: y[0], theta: y[1], dr: y[3], dtheta: y[4], dphi: y[5], E: ray.E }, schwarzschildRadius, k1);

    temp[0] = y[0] + k1[0] * dλ * 0.5;
    temp[1] = y[1] + k1[1] * dλ * 0.5;
    temp[2] = y[2] + k1[2] * dλ * 0.5;
    temp[3] = y[3] + k1[3] * dλ * 0.5;
    temp[4] = y[4] + k1[4] * dλ * 0.5;
    temp[5] = y[5] + k1[5] * dλ * 0.5;
    computeGeodesicDerivatives({ r: temp[0], theta: temp[1], dr: temp[3], dtheta: temp[4], dphi: temp[5], E: ray.E }, schwarzschildRadius, k2);

    temp[0] = y[0] + k2[0] * dλ * 0.5;
    temp[1] = y[1] + k2[1] * dλ * 0.5;
    temp[2] = y[2] + k2[2] * dλ * 0.5;
    temp[3] = y[3] + k2[3] * dλ * 0.5;
    temp[4] = y[4] + k2[4] * dλ * 0.5;
    temp[5] = y[5] + k2[5] * dλ * 0.5;
    computeGeodesicDerivatives({ r: temp[0], theta: temp[1], dr: temp[3], dtheta: temp[4], dphi: temp[5], E: ray.E }, schwarzschildRadius, k3);

    temp[0] = y[0] + k3[0] * dλ;
    temp[1] = y[1] + k3[1] * dλ;
    temp[2] = y[2] + k3[2] * dλ;
    temp[3] = y[3] + k3[3] * dλ;
    temp[4] = y[4] + k3[4] * dλ;
    temp[5] = y[5] + k3[5] * dλ;
    computeGeodesicDerivatives({ r: temp[0], theta: temp[1], dr: temp[3], dtheta: temp[4], dphi: temp[5], E: ray.E }, schwarzschildRadius, k4);

    ray.r += (dλ / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    ray.theta += (dλ / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    ray.phi += (dλ / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    ray.dr += (dλ / 6.0) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
    ray.dtheta += (dλ / 6.0) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]);
    ray.dphi += (dλ / 6.0) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5]);
};

const segmentSphereIntersection = (
    segmentStart: Vector3,
    segmentEnd: Vector3,
    objects: RenderOBJ[],
): INTERSECTION => {
    const segment = sub(segmentEnd, segmentStart);
    const segmentLength = mag(segment);

    if (segmentLength === 0) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const direction = mul(segment, 1 / segmentLength);
    let minDist = Infinity;
    let closestIntersection: Extract<INTERSECTION, { collided: true }> | undefined;
    let closestObject: RenderOBJ | undefined;

    for (const object of objects) {
        const oc = sub(segmentStart, object.pos);
        const b = 2 * dot(oc, direction);
        const c = dot(oc, oc) - object.radius ** 2;
        const discriminant = b ** 2 - 4 * c;

        if (discriminant < 0) continue;

        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDiscriminant) * 0.5;
        const t2 = (-b + sqrtDiscriminant) * 0.5;

        let dist = Infinity;
        if (t1 >= 0 && t1 <= segmentLength) {
            dist = t1;
        } else if (t2 >= 0 && t2 <= segmentLength) {
            dist = t2;
        }

        if (dist === Infinity || dist >= minDist) continue;

        const point = add(segmentStart, mul(direction, dist));
        let normal = normalize(sub(point, object.pos));
        normal = normalize(add(normal, mul(vec3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), object.roughness)));

        closestIntersection = {
            collided: true,
            dist,
            point,
            normal,
            object,
        };
        closestObject = object;
        minDist = dist;
    }

    if (closestIntersection != null && closestObject != null) {
        return {
            collided: true,
            dist: closestIntersection.dist,
            point: closestIntersection.point,
            normal: closestIntersection.normal,
            object: closestObject,
        };
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const segmentDiscIntersection = (
    segmentStart: Vector3,
    segmentEnd: Vector3,
    blackhole: BlackHole,
): PLANE_INTERSECTION => {
    const segment = sub(segmentEnd, segmentStart);

    if (Math.abs(segment.y) < 1e-9) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const t = (blackhole.pos.y - segmentStart.y) / segment.y;
    if (t < 0 || t > 1) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const point = add(segmentStart, mul(segment, t));
    const local = sub(point, blackhole.pos);
    const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
    const innerRadius = 1.5 * blackhole.schwarzschildRadius;
    const outerRadius = 2.6 * blackhole.schwarzschildRadius;

    if (radialDist < innerRadius || radialDist > outerRadius) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    return {
        collided: true,
        dist: mag(segment) * t,
        point,
    };
};

const traceGeodesic = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    worldObjects: renderObjects,
    steps: number,
    colorOrigin: Vector3 = rayOrigin,
): Vector3 | null => {
    const blackhole = worldObjects.blackhole;
    const localOrigin = sub(rayOrigin, blackhole.pos);
    const baseRay = ray(localOrigin, rayDirection);
    const geodesicRay = gRay(baseRay, blackhole);

    const dλ = 5e7; // 1e7
    const maxGeodesicSteps = 10000;
    const escapeRadius = 30 * blackhole.schwarzschildRadius; // 1e14
    let previousWorldPoint = rayOrigin;

    for (let stepIndex = 0; stepIndex < maxGeodesicSteps; stepIndex++) {
        fourthOrderRungeKutta(geodesicRay, dλ, blackhole.schwarzschildRadius);

        if (!Number.isFinite(geodesicRay.r) || !Number.isFinite(geodesicRay.theta) || !Number.isFinite(geodesicRay.phi) || !Number.isFinite(geodesicRay.dr) || !Number.isFinite(geodesicRay.dtheta) || !Number.isFinite(geodesicRay.dphi)) {
            return null;
        }

        const sinTheta = Math.sin(geodesicRay.theta);
        const cosTheta = Math.cos(geodesicRay.theta);
        const sinPhi = Math.sin(geodesicRay.phi);
        const cosPhi = Math.cos(geodesicRay.phi);
        const currentWorldPoint = vec3(
            blackhole.pos.x + geodesicRay.r * sinTheta * cosPhi,
            blackhole.pos.y + geodesicRay.r * cosTheta,
            blackhole.pos.z + geodesicRay.r * sinTheta * sinPhi,
        );

        const { eR, eTheta, ePhi } = sphericalBasis(geodesicRay.theta, geodesicRay.phi);
        const currentDirection = normalize(add(
            add(
                mul(eR, geodesicRay.dr),
                mul(eTheta, geodesicRay.r * geodesicRay.dtheta),
            ),
            mul(ePhi, geodesicRay.r * Math.max(Math.sin(geodesicRay.theta), 1e-9) * geodesicRay.dphi),
        ));

        const objectHit = segmentSphereIntersection(previousWorldPoint, currentWorldPoint, [worldObjects.blackhole, ...worldObjects.spheres]);
        const discHit = segmentDiscIntersection(previousWorldPoint, currentWorldPoint, blackhole);

        if (discHit.collided && (!objectHit.collided || discHit.dist < objectHit.dist)) {
            return sampleDisc(colorOrigin, discHit.point, blackhole);
        }

        if (objectHit.collided) {
            if (objectHit.object === worldObjects.blackhole) {
                return vec3(0, 0, 0);
            }

            if (steps <= 0) {
                return vec3(objectHit.object.emission.r, objectHit.object.emission.g, objectHit.object.emission.b);
            }

            const reflectedDirection = reflect(currentDirection, objectHit.normal);
            const reflectedWorldObjects = {
                blackhole: worldObjects.blackhole,
                spheres: worldObjects.spheres.filter((object) => object !== objectHit.object),
            } satisfies renderObjects;
            const reflectedColor = traceGeodesic(objectHit.point, reflectedDirection, reflectedWorldObjects, steps - 1, colorOrigin);

            return add(
                vec3(objectHit.object.emission.r, objectHit.object.emission.g, objectHit.object.emission.b),
                reflectedColor == null
                    ? vec3(0, 0, 0)
                    : mulParts(
                        reflectedColor,
                        vec3(objectHit.object.reflectivity.r, objectHit.object.reflectivity.g, objectHit.object.reflectivity.b),
                    ),
            );
        }

        if (geodesicRay.r <= blackhole.schwarzschildRadius) {
            return vec3(0, 0, 0);
        }

        if (geodesicRay.r >= escapeRadius && stepIndex > 8) {
            return null;
        }

        previousWorldPoint = currentWorldPoint;
    }

    return null;
};

const toneMap = (value: number): number => 255 * (1 - Math.exp(-value * 0.02));
const toByte = (value: number): number => Math.max(0, Math.min(255, Math.round(toneMap(value))));

const cpuRenderRayTracing = (
    _ctx: CanvasRenderingContext2D,
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
    runGeodesic: boolean,
): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const pixels: ImageDataArray = image.data;
    const samples = runGeodesic ? 1 : 4; // for computing randomness like roughness material in spheres

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

            let pixel: Vector3 = vec3(0, 0, 0);
            let hitSamples = 0;
            
            for (let n: number = 0; n < samples; n++) {
                const sample = runGeodesic
                    ? traceGeodesic(rayOrigin, rayDirection, worldObjects, samples)
                    : trace(rayOrigin, rayDirection, worldObjects, samples);

                if (sample != null) {
                    pixel = add(pixel, sample);
                    hitSamples += 1;
                }
            };

            if (hitSamples === 0) continue;

            pixel = mul(pixel, 1/hitSamples);
            const index = cpuPixelIndex(i, j, SCREEN_WIDTH);
            pixels[index + 0] = toByte(pixel.x);
            pixels[index + 1] = toByte(pixel.y);
            pixels[index + 2] = toByte(pixel.z);
            pixels[index + 3] = 255;
        }
    }
};

export function cpuPipeline(
    ctx: CanvasRenderingContext2D,
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
    runGeodesic: boolean,
): void {
    cpuRenderRadientBG(image, wc);
    cpuRenderGravityGrid(image, camera, wc);
    cpuRenderRayTracing(ctx, image, camera, worldObjects, wc, runGeodesic);
    ctx.putImageData(image, 0, 0);
}
