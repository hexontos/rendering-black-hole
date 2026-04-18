import {
    add,
    cameraForward,
    cameraRight,
    cameraUp,
    cross,
    dot,
    mag,
    mul,
    normalize,
    orbitCamera,
    sub,
    vec3,
} from "./common";
import type {
    BlackHole,
    Camera,
    Disc,
    INTERSECTION,
    PLANE_INTERSECTION,
    RenderOBJ,
    Vector3,
    WorldConfig,
    renderObjects,
} from "./types";

type OrbitalPlane = {
    radialAxis: Vector3;
    tangentialAxis: Vector3;
};

type PlanarGeodesicRay = {
    r: number;
    phi: number;
    dr: number;
    dphi: number;
    E: number;
};

type FourStates = [number, number, number, number];

type TraceResult = {
    hit: boolean;
    color: Vector3;
};

type ColorIntersection =
    | {
        collided: true;
        dist: number;
        point: Vector3;
        color: Vector3;
    }
    | {
        collided: false;
        dist: number;
    };

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

const intersectDisc = (origin: Vector3, direction: Vector3, disc: Disc, blackhole: BlackHole): PLANE_INTERSECTION => {
    if (!disc.visible) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const discPlane = intersectPlane(origin, direction, disc.pos.y);

    if (discPlane.collided) {
        const local = sub(discPlane.point, disc.pos);
        const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
        const innerEdgeBias = blackhole.schwarzschildRadius * 0.1;

        if (
            radialDist >= disc.innerRadius + innerEdgeBias &&
            radialDist <= disc.outerRadius
        ) {
            return discPlane;
        }
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const sampleDisc = (point: Vector3, disc: Disc): Vector3 => {
    const local = sub(point, disc.pos);
    const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
    const radialT = Math.max(0, Math.min(1, (radialDist - disc.innerRadius) / (disc.outerRadius - disc.innerRadius)));
    const innerT = 1 - radialT;
    const radialColor = vec3(
        disc.nearColor.r + (disc.farColor.r - disc.nearColor.r) * radialT,
        disc.nearColor.g + (disc.farColor.g - disc.nearColor.g) * radialT,
        disc.nearColor.b + (disc.farColor.b - disc.nearColor.b) * radialT,
    );

    return vec3(
        radialColor.x + disc.radialBoost.r * innerT,
        radialColor.y + disc.radialBoost.g * innerT,
        radialColor.z + disc.radialBoost.b * innerT,
    );
};

const blackholeShadowRadius = (blackhole: BlackHole): number => {
    return 0.5 * Math.sqrt(27.0) * blackhole.schwarzschildRadius;
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

        if (distToClosestPointOnRay > 0 && distFromClosestPointToSphere < object.radius) {
            currentIntersection = {
                collided: true,
                dist: distToIntersection,
                point,
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
            object: closestObject,
        };
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const trace = (origin: Vector3, direction: Vector3, worldObjects: renderObjects): Vector3 | null => {
    const hit = intersection(
        origin,
        direction,
        [{ ...worldObjects.blackhole, radius: blackholeShadowRadius(worldObjects.blackhole) }, ...worldObjects.spheres],
    );
    const discHit = intersectDisc(origin, direction, worldObjects.disc, worldObjects.blackhole);

    if (discHit.collided && (!hit.collided || discHit.dist < hit.dist)) {
        return sampleDisc(discHit.point, worldObjects.disc);
    }

    if (hit.collided) {
        return vec3(hit.object.emission.r, hit.object.emission.g, hit.object.emission.b);
    }

    return null;
};

const cpuRenderGravityGrid = (
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
): void => {
    const grid = worldObjects.grid;
    if (!grid.visible) return;

    const baseY = grid.pos.y;
    const halfSize = grid.halfSize;
    const cellSize = grid.cellSize;
    const maxDrop = grid.maxDrop;
    const gridSteps = Math.round((2 * halfSize) / cellSize);
    const lineColor = vec3(grid.lineColor.r, grid.lineColor.g, grid.lineColor.b);

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
                grid.pos.x + localX,
                gridVertexY(localX, localZ, baseY, maxDrop, halfSize),
                grid.pos.z + localZ,
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

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpColor = (a: Vector3, b: Vector3, t: number): Vector3 => {
    return vec3(
        lerp(a.x, b.x, t),
        lerp(a.y, b.y, t),
        lerp(a.z, b.z, t),
    );
};

const hash21 = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
};

const hash22 = (x: number, y: number): Vector3 => {
    return vec3(
        hash21(x + 17.0, y + 59.4),
        hash21(x + 63.1, y + 12.8),
        0,
    );
};

const cameraRayDirection = (
    x: number,
    y: number,
    screenWidth: number,
    screenHeight: number,
    focalLength: number,
    forward: Vector3,
    right: Vector3,
    up: Vector3,
): Vector3 => {
    const screenX = x - screenWidth * 0.5;
    const screenY = y - screenHeight * 0.5;

    return normalize(
        add(
            add(mul(right, screenX), mul(up, -screenY)),
            mul(forward, focalLength),
        ),
    );
};

const sampleGradientBackground = (u: number, v: number, worldObjects: renderObjects): Vector3 => {
    const topLeft = vec3(worldObjects.background.gradient.topLeft.r, worldObjects.background.gradient.topLeft.g, worldObjects.background.gradient.topLeft.b);
    const topRight = vec3(worldObjects.background.gradient.topRight.r, worldObjects.background.gradient.topRight.g, worldObjects.background.gradient.topRight.b);
    const bottomLeft = vec3(worldObjects.background.gradient.bottomLeft.r, worldObjects.background.gradient.bottomLeft.g, worldObjects.background.gradient.bottomLeft.b);
    const bottomRight = vec3(worldObjects.background.gradient.bottomRight.r, worldObjects.background.gradient.bottomRight.g, worldObjects.background.gradient.bottomRight.b);

    const top = lerpColor(topLeft, topRight, u);
    const bottom = lerpColor(bottomLeft, bottomRight, u);
    return lerpColor(top, bottom, v);
};

const sampleStarField = (direction: Vector3, worldObjects: renderObjects): Vector3 => {
    const background = worldObjects.background;
    const skyUv = vec3(
        Math.atan2(direction.z, direction.x) / (2.0 * Math.PI) + 0.5,
        Math.acos(Math.max(-1, Math.min(1, direction.y))) / Math.PI,
        0,
    );
    const milkyWayNormal = normalize(background.stars.milkyWayNormal);
    const milkyWayWidth = Math.max(background.stars.milkyWayWidth, 1e-4);
    const planeDist = Math.abs(dot(direction, milkyWayNormal));
    const milkyWayBand = Math.exp(-((planeDist / milkyWayWidth) ** 2));
    const milkyWayNoise = 0.55 + 0.45 * hash21(skyUv.x * 220.0, skyUv.y * 110.0);
    const milkyWayStrength = milkyWayBand * milkyWayNoise * (background.stars.milkyWayVisible ? background.stars.milkyWayIntensity : 0);
    const milkyWayCoreStrength = milkyWayStrength * (0.45 + 1.25 * milkyWayBand);

    let color = vec3(background.stars.baseColor.r, background.stars.baseColor.g, background.stars.baseColor.b);
    color = add(
        color,
        mul(
            vec3(background.stars.milkyWayColor.r, background.stars.milkyWayColor.g, background.stars.milkyWayColor.b),
            milkyWayStrength,
        ),
    );

    const primaryUvX = skyUv.x * 720.0;
    const primaryUvY = skyUv.y * 360.0;
    const primaryBaseX = Math.floor(primaryUvX);
    const primaryBaseY = Math.floor(primaryUvY);

    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const cellX = primaryBaseX + ox;
            const cellY = primaryBaseY + oy;
            const localX = primaryUvX - cellX - 0.5;
            const localY = primaryUvY - cellY - 0.5;
            const primarySeed = hash21(cellX, cellY);

            if (primarySeed > 1.0 - Math.min(0.28, background.stars.densityPrimary + milkyWayCoreStrength * 0.085)) {
                const offset = hash22(cellX, cellY);
                const starDist = Math.hypot(localX - (offset.x - 0.5) * 0.7, localY - (offset.y - 0.5) * 0.7);
                const glow = Math.max(0.0, Math.min(1.0, (0.14 - starDist) / 0.14));
                const tintSeed = hash21(cellX + 19.7, cellY + 73.1);
                let starColor = vec3(255, 255, 255);

                if (tintSeed > 0.9975) {
                    starColor = vec3(255, 148, 107);
                } else if (tintSeed > 0.985) {
                    starColor = vec3(255, 230, 158);
                }

                color = add(
                    color,
                    mul(starColor, glow * (0.8 + 1.35 * hash21(cellX + 101.3, cellY + 7.7) + milkyWayCoreStrength * 3.2)),
                );
            }
        }
    }

    const secondaryUvX = skyUv.x * 1200.0;
    const secondaryUvY = skyUv.y * 600.0;
    const secondaryBaseX = Math.floor(secondaryUvX);
    const secondaryBaseY = Math.floor(secondaryUvY);

    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const cellX = secondaryBaseX + ox;
            const cellY = secondaryBaseY + oy;
            const localX = secondaryUvX - cellX - 0.5;
            const localY = secondaryUvY - cellY - 0.5;
            const secondarySeed = hash21(cellX + 211.0, cellY + 503.0);

            if (secondarySeed > 1.0 - Math.min(0.22, background.stars.densitySecondary + milkyWayCoreStrength * 0.05)) {
                const offset = vec3(hash21(cellX + 5.2, cellY + 91.7), hash21(cellX + 29.6, cellY + 13.4), 0);
                const starDist = Math.hypot(localX - (offset.x - 0.5) * 0.5, localY - (offset.y - 0.5) * 0.5);
                const glow = Math.max(0.0, Math.min(1.0, (0.06 - starDist) / 0.06));
                color = add(color, mul(vec3(255, 255, 255), glow * (0.4 + milkyWayCoreStrength * 0.9)));
            }
        }
    }

    const brightUvX = skyUv.x * 520.0;
    const brightUvY = skyUv.y * 260.0;
    const brightBaseX = Math.floor(brightUvX);
    const brightBaseY = Math.floor(brightUvY);

    for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
            const cellX = brightBaseX + ox;
            const cellY = brightBaseY + oy;
            const localX = brightUvX - cellX - 0.5;
            const localY = brightUvY - cellY - 0.5;
            const brightSeed = hash21(cellX + 401.0, cellY + 887.0);

            if (brightSeed > 1.0 - Math.min(0.12, milkyWayCoreStrength * 0.16)) {
                const offset = vec3(hash21(cellX + 13.0, cellY + 37.0), hash21(cellX + 71.0, cellY + 19.0), 0);
                const starDist = Math.hypot(localX - (offset.x - 0.5) * 0.65, localY - (offset.y - 0.5) * 0.65);
                const glow = Math.max(0.0, Math.min(1.0, (0.18 - starDist) / 0.18));
                const tintSeed = hash21(cellX + 97.0, cellY + 31.0);
                let starColor = vec3(255, 255, 255);

                if (tintSeed > 0.9985) {
                    starColor = vec3(255, 153, 115);
                } else if (tintSeed > 0.992) {
                    starColor = vec3(255, 230, 173);
                }

                color = add(color, mul(starColor, glow * (1.25 + milkyWayCoreStrength * 5.5)));
            }
        }
    }

    return vec3(
        Math.min(255, color.x),
        Math.min(255, color.y),
        Math.min(255, color.z),
    );
};

const backgroundUvFromDirection = (direction: Vector3): { u: number; v: number } => {
    return {
        u: Math.atan2(direction.z, direction.x) / (2.0 * Math.PI) + 0.5,
        v: Math.acos(Math.max(-1, Math.min(1, direction.y))) / Math.PI,
    };
};

const sampleBackground = (u: number, v: number, direction: Vector3, worldObjects: renderObjects): Vector3 => {
    if (worldObjects.background.mode === "empty") {
        return vec3(
            worldObjects.background.empty.color.r,
            worldObjects.background.empty.color.g,
            worldObjects.background.empty.color.b,
        );
    }

    if (worldObjects.background.mode === "gradient") {
        return sampleGradientBackground(u, v, worldObjects);
    }

    return sampleStarField(direction, worldObjects);
};

const emptyColorIntersection = (): ColorIntersection => {
    return {
        collided: false,
        dist: Infinity,
    };
};

const gridSurfaceDelta = (point: Vector3, worldObjects: renderObjects): number => {
    const local = sub(point, worldObjects.grid.pos);
    return point.y - gridVertexY(local.x, local.z, worldObjects.grid.pos.y, worldObjects.grid.maxDrop, worldObjects.grid.halfSize);
};

const rayBoxIntersection = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    boxMin: Vector3,
    boxMax: Vector3,
): { min: number; max: number } => {
    let tMin = 0;
    let tMax = Infinity;

    if (Math.abs(rayDirection.x) < 1e-6) {
        if (rayOrigin.x < boxMin.x || rayOrigin.x > boxMax.x) {
            return { min: 1, max: -1 };
        }
    } else {
        const invDx = 1 / rayDirection.x;
        const tx0 = (boxMin.x - rayOrigin.x) * invDx;
        const tx1 = (boxMax.x - rayOrigin.x) * invDx;
        tMin = Math.max(tMin, Math.min(tx0, tx1));
        tMax = Math.min(tMax, Math.max(tx0, tx1));
    }

    if (Math.abs(rayDirection.y) < 1e-6) {
        if (rayOrigin.y < boxMin.y || rayOrigin.y > boxMax.y) {
            return { min: 1, max: -1 };
        }
    } else {
        const invDy = 1 / rayDirection.y;
        const ty0 = (boxMin.y - rayOrigin.y) * invDy;
        const ty1 = (boxMax.y - rayOrigin.y) * invDy;
        tMin = Math.max(tMin, Math.min(ty0, ty1));
        tMax = Math.min(tMax, Math.max(ty0, ty1));
    }

    if (Math.abs(rayDirection.z) < 1e-6) {
        if (rayOrigin.z < boxMin.z || rayOrigin.z > boxMax.z) {
            return { min: 1, max: -1 };
        }
    } else {
        const invDz = 1 / rayDirection.z;
        const tz0 = (boxMin.z - rayOrigin.z) * invDz;
        const tz1 = (boxMax.z - rayOrigin.z) * invDz;
        tMin = Math.max(tMin, Math.min(tz0, tz1));
        tMax = Math.min(tMax, Math.max(tz0, tz1));
    }

    if (tMax < tMin) {
        return { min: 1, max: -1 };
    }

    return { min: tMin, max: tMax };
};

const gridIntersectionAtPoint = (
    point: Vector3,
    dist: number,
    worldObjects: renderObjects,
): ColorIntersection => {
    const local = sub(point, worldObjects.grid.pos);
    const halfSize = worldObjects.grid.halfSize;
    const cellSize = worldObjects.grid.cellSize;
    const radialDist = Math.hypot(local.x, local.z);

    if (Math.abs(local.x) > halfSize || Math.abs(local.z) > halfSize) {
        return emptyColorIntersection();
    }

    const gx = local.x - Math.floor(local.x / cellSize) * cellSize;
    const gz = local.z - Math.floor(local.z / cellSize) * cellSize;
    const lineWidth = cellSize * 0.1;
    const radialLimit = Math.max(0, halfSize - lineWidth);

    if (radialDist > radialLimit) {
        return emptyColorIntersection();
    }

    const onLine =
        gx < lineWidth ||
        gx > cellSize - lineWidth ||
        gz < lineWidth ||
        gz > cellSize - lineWidth;

    if (!onLine) {
        return emptyColorIntersection();
    }

    return {
        collided: true,
        dist,
        point,
        color: vec3(
            worldObjects.grid.lineColor.r,
            worldObjects.grid.lineColor.g,
            worldObjects.grid.lineColor.b,
        ),
    };
};

const traceGrid = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    worldObjects: renderObjects,
): ColorIntersection => {
    if (!worldObjects.grid.visible) {
        return emptyColorIntersection();
    }

    const halfSize = worldObjects.grid.halfSize;
    const topY = worldObjects.grid.pos.y;
    const bottomY = topY - worldObjects.grid.maxDrop;
    const boxMin = vec3(worldObjects.grid.pos.x - halfSize, bottomY, worldObjects.grid.pos.z - halfSize);
    const boxMax = vec3(worldObjects.grid.pos.x + halfSize, topY, worldObjects.grid.pos.z + halfSize);
    const tRange = rayBoxIntersection(rayOrigin, rayDirection, boxMin, boxMax);

    if (tRange.max < tRange.min) {
        return emptyColorIntersection();
    }

    const marchSteps = 48;
    let previousT = tRange.min;
    let previousPoint = add(rayOrigin, mul(rayDirection, previousT));
    let previousDelta = gridSurfaceDelta(previousPoint, worldObjects);

    for (let stepIndex = 1; stepIndex <= marchSteps; stepIndex++) {
        const t = lerp(tRange.min, tRange.max, stepIndex / marchSteps);
        const point = add(rayOrigin, mul(rayDirection, t));
        const delta = gridSurfaceDelta(point, worldObjects);
        const crossed =
            (previousDelta > 0 && delta <= 0) ||
            (previousDelta < 0 && delta >= 0);

        if (crossed) {
            let tLow = previousT;
            let tHigh = t;
            let deltaLow = previousDelta;

            for (let refineIndex = 0; refineIndex < 6; refineIndex++) {
                const tMid = 0.5 * (tLow + tHigh);
                const pointMid = add(rayOrigin, mul(rayDirection, tMid));
                const deltaMid = gridSurfaceDelta(pointMid, worldObjects);
                const sameSide =
                    (deltaLow > 0 && deltaMid > 0) ||
                    (deltaLow < 0 && deltaMid < 0);

                if (sameSide) {
                    tLow = tMid;
                    deltaLow = deltaMid;
                } else {
                    tHigh = tMid;
                }
            }

            const hitT = 0.5 * (tLow + tHigh);
            const hitPoint = add(rayOrigin, mul(rayDirection, hitT));
            return gridIntersectionAtPoint(hitPoint, hitT, worldObjects);
        }

        previousT = t;
        previousPoint = point;
        previousDelta = delta;
    }

    return emptyColorIntersection();
};

const cpuRenderBackground = (
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const pixels: ImageDataArray = image.data;
    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);

    for (let y = 0; y < SCREEN_HEIGHT; y++) {
        const v = y / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const u = x / Math.max(SCREEN_WIDTH - 1, 1);
            const i = cpuPixelIndex(x, y, SCREEN_WIDTH);
            const rayDirection = cameraRayDirection(x, y, SCREEN_WIDTH, SCREEN_HEIGHT, camera.focalLength, forward, right, up);
            const color = sampleBackground(u, v, rayDirection, worldObjects);

            pixels[i + 0] = Math.round(color.x);
            pixels[i + 1] = Math.round(color.y);
            pixels[i + 2] = Math.round(color.z);
            pixels[i + 3] = 255;
        }
    }
};

const buildOrbitalPlane = (localOrigin: Vector3, direction: Vector3): OrbitalPlane => {
    const radialAxis = normalize(localOrigin);
    const planeNormalCandidate = cross(localOrigin, direction);
    const fallbackAxis = Math.abs(radialAxis.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0);
    const planeNormal = normalize(mag(planeNormalCandidate) < 1e-6 ? cross(radialAxis, fallbackAxis) : planeNormalCandidate);
    const tangentialAxis = normalize(cross(planeNormal, radialAxis));

    return {
        radialAxis,
        tangentialAxis,
    };
};

const planarGeodesicRay = (
    localOrigin: Vector3,
    direction: Vector3,
    orbitalPlane: OrbitalPlane,
    schwarzschildRadius: number,
    captureRadius: number,
): PlanarGeodesicRay => {
    const r = mag(localOrigin);
    const dr = dot(direction, orbitalPlane.radialAxis);
    const dphi = dot(direction, orbitalPlane.tangentialAxis) / Math.max(r, 1e-9);
    const rEval = Math.max(r, captureRadius);
    const f = 1.0 - schwarzschildRadius / rEval;
    const dtDλ = Math.sqrt(
        (dr * dr) / (f * f) +
        ((rEval * rEval) * (dphi * dphi)) / f,
    );

    return { r, phi: 0, dr, dphi, E: f * dtDλ };
};

const computePlanarGeodesicDerivatives = (
    ray: PlanarGeodesicRay,
    schwarzschildRadius: number,
    captureRadius: number,
): FourStates => {
    const r = Math.max(ray.r, captureRadius);
    const f = 1.0 - schwarzschildRadius / r;
    const dtDλ = ray.E / f;

    return [
        ray.dr,
        ray.dphi,
        -(schwarzschildRadius / (2.0 * r * r)) * f * (dtDλ * dtDλ)
            + (schwarzschildRadius / (2.0 * r * r * f)) * (ray.dr * ray.dr)
            + (r - schwarzschildRadius) * (ray.dphi * ray.dphi),
        -2.0 * ray.dr * ray.dphi / r,
    ];
};

const planarRayWithStep = (ray: PlanarGeodesicRay, k: FourStates, factor: number): PlanarGeodesicRay => {
    return {
        r: ray.r + k[0] * factor,
        phi: ray.phi + k[1] * factor,
        dr: ray.dr + k[2] * factor,
        dphi: ray.dphi + k[3] * factor,
        E: ray.E,
    };
};

const fourthOrderRungeKuttaPlanar = (
    ray: PlanarGeodesicRay,
    dλ: number,
    schwarzschildRadius: number,
    captureRadius: number,
): PlanarGeodesicRay => {
    const k1 = computePlanarGeodesicDerivatives(ray, schwarzschildRadius, captureRadius);
    const k2 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k1, dλ * 0.5), schwarzschildRadius, captureRadius);
    const k3 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k2, dλ * 0.5), schwarzschildRadius, captureRadius);
    const k4 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k3, dλ), schwarzschildRadius, captureRadius);

    return {
        r: ray.r + (dλ / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]),
        phi: ray.phi + (dλ / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]),
        dr: ray.dr + (dλ / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]),
        dphi: ray.dphi + (dλ / 6.0) * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3]),
        E: ray.E,
    };
};

const fastGeodesicStepPlanar = (
    ray: PlanarGeodesicRay,
    dλ: number,
    schwarzschildRadius: number,
    captureRadius: number,
): PlanarGeodesicRay => {
    const rhs = computePlanarGeodesicDerivatives(ray, schwarzschildRadius, captureRadius);

    return {
        r: ray.r + dλ * rhs[0],
        phi: ray.phi + dλ * rhs[1],
        dr: ray.dr + dλ * rhs[2],
        dphi: ray.dphi + dλ * rhs[3],
        E: ray.E,
    };
};

const worldPointPlanar = (ray: PlanarGeodesicRay, orbitalPlane: OrbitalPlane, blackholePos: Vector3): Vector3 => {
    return add(
        blackholePos,
        add(
            mul(orbitalPlane.radialAxis, ray.r * Math.cos(ray.phi)),
            mul(orbitalPlane.tangentialAxis, ray.r * Math.sin(ray.phi)),
        ),
    );
};

const worldDirectionPlanar = (ray: PlanarGeodesicRay, orbitalPlane: OrbitalPlane): Vector3 => {
    const cosPhi = Math.cos(ray.phi);
    const sinPhi = Math.sin(ray.phi);
    const radialVelocity = ray.dr * cosPhi - ray.r * ray.dphi * sinPhi;
    const tangentialVelocity = ray.dr * sinPhi + ray.r * ray.dphi * cosPhi;

    return normalize(
        add(
            mul(orbitalPlane.radialAxis, radialVelocity),
            mul(orbitalPlane.tangentialAxis, tangentialVelocity),
        ),
    );
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
        closestIntersection = {
            collided: true,
            dist,
            point,
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
    disc: Disc,
    blackhole: BlackHole,
): PLANE_INTERSECTION => {
    if (!disc.visible) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const segment = sub(segmentEnd, segmentStart);

    if (Math.abs(segment.y) < 1e-9) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const t = (disc.pos.y - segmentStart.y) / segment.y;
    if (t < 0 || t > 1) {
        return {
            collided: false,
            dist: Infinity,
        };
    }

    const point = add(segmentStart, mul(segment, t));
    const local = sub(point, disc.pos);
    const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
    const innerEdgeBias = blackhole.schwarzschildRadius * 0.1;

    if (
        radialDist < disc.innerRadius + innerEdgeBias ||
        radialDist > disc.outerRadius
    ) {
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

const traceStraight = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    worldObjects: renderObjects,
): TraceResult => {
    const color = trace(rayOrigin, rayDirection, worldObjects);

    if (color == null) {
        return {
            hit: false,
            color: vec3(0, 0, 0),
        };
    }

    return {
        hit: true,
        color,
    };
};

const traceGeodesic = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    worldObjects: renderObjects,
): TraceResult => {
    const blackhole = worldObjects.blackhole;
    const captureRadius = blackhole.schwarzschildRadius * 1.035;
    const localOrigin = sub(rayOrigin, blackhole.pos);
    const orbitalPlane = buildOrbitalPlane(localOrigin, rayDirection);
    let geodesicRay = planarGeodesicRay(localOrigin, rayDirection, orbitalPlane, blackhole.schwarzschildRadius, captureRadius);

    const dλ = worldObjects.renderGeodesic.dλ;
    const maxGeodesicSteps = worldObjects.renderGeodesic.maxSteps;
    const escapeRadius = worldObjects.renderGeodesic.escapeRadiusMultiplier * blackhole.schwarzschildRadius;
    let previousWorldPoint = rayOrigin;

    for (let stepIndex = 0; stepIndex < maxGeodesicSteps; stepIndex++) {
        if (geodesicRay.r <= captureRadius) {
            return {
                hit: true,
                color: vec3(0, 0, 0),
            };
        }

        if (worldObjects.renderGeodesic.useRungeKutta) {
            geodesicRay = fourthOrderRungeKuttaPlanar(geodesicRay, dλ, blackhole.schwarzschildRadius, captureRadius);
        } else {
            geodesicRay = fastGeodesicStepPlanar(geodesicRay, dλ, blackhole.schwarzschildRadius, captureRadius);
        }

        if (geodesicRay.r <= captureRadius) {
            return {
                hit: true,
                color: vec3(0, 0, 0),
            };
        }

        const currentWorldPoint = worldPointPlanar(geodesicRay, orbitalPlane, blackhole.pos);

        const objectHit = segmentSphereIntersection(
            previousWorldPoint,
            currentWorldPoint,
            [
                { ...worldObjects.blackhole, radius: captureRadius },
                ...worldObjects.spheres,
            ],
        );
        const discHit = segmentDiscIntersection(previousWorldPoint, currentWorldPoint, worldObjects.disc, worldObjects.blackhole);

        if (discHit.collided && (!objectHit.collided || discHit.dist < objectHit.dist)) {
            return {
                hit: true,
                color: sampleDisc(discHit.point, worldObjects.disc),
            };
        }

        if (objectHit.collided) {
            return {
                hit: true,
                color: vec3(objectHit.object.emission.r, objectHit.object.emission.g, objectHit.object.emission.b),
            };
        }

        if (geodesicRay.r >= escapeRadius && stepIndex > 8) {
            const escapedDirection = worldDirectionPlanar(geodesicRay, orbitalPlane);
            const escapedUv = backgroundUvFromDirection(escapedDirection);
            return {
                hit: false,
                color: sampleBackground(escapedUv.u, escapedUv.v, escapedDirection, worldObjects),
            };
        }

        previousWorldPoint = currentWorldPoint;
    }

    const escapedDirection = worldDirectionPlanar(geodesicRay, orbitalPlane);
    const escapedUv = backgroundUvFromDirection(escapedDirection);
    return {
        hit: false,
        color: sampleBackground(escapedUv.u, escapedUv.v, escapedDirection, worldObjects),
    };
};

const toByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const cpuRenderRayTracing = (
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
    runGeodesic: boolean,
): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const pixels: ImageDataArray = image.data;

    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);

    // each pixel in canvas
    for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
        const screenV = j / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let i: number = 0; i < SCREEN_WIDTH; i++) {
            const screenU = i / Math.max(SCREEN_WIDTH - 1, 1);
            const rayDirection = cameraRayDirection(i, j, SCREEN_WIDTH, SCREEN_HEIGHT, camera.focalLength, forward, right, up);
            const rayOrigin = cameraPos;
            const result = runGeodesic
                ? traceGeodesic(rayOrigin, rayDirection, worldObjects)
                : traceStraight(rayOrigin, rayDirection, worldObjects);
            const gridHit = result.hit ? emptyColorIntersection() : traceGrid(rayOrigin, rayDirection, worldObjects);

            const pixel = result.hit
                ? result.color
                : gridHit.collided
                    ? gridHit.color
                    : runGeodesic
                        ? result.color
                        : sampleBackground(screenU, screenV, rayDirection, worldObjects);

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
    cpuRenderRayTracing(image, camera, worldObjects, wc, runGeodesic);
    ctx.putImageData(image, 0, 0);
}
