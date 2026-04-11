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
    Disc,
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

const intersectDisc = (origin: Vector3, direction: Vector3, disc: Disc): PLANE_INTERSECTION => {
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

        if (
            radialDist >= disc.innerRadius &&
            radialDist <= disc.outerRadius &&
            !discNoiseHole(discPlane.point, disc)
        ) {
            return discPlane;
        }
    }

    return {
        collided: false,
        dist: Infinity,
    };
};

const sampleDisc = (_origin: Vector3, point: Vector3, disc: Disc): Vector3 => {
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

const discNoiseHole = (point: Vector3, disc: Disc): boolean => {
    if (!disc.noiseVisible) return false;

    const local = sub(point, disc.pos);
    const radialDist = Math.sqrt(local.x ** 2 + local.z ** 2);
    const radialT = Math.max(0, Math.min(1, (radialDist - disc.innerRadius) / (disc.outerRadius - disc.innerRadius)));
    const innerT = 1 - radialT;
    const scale = disc.outerRadius * 0.55;
    const noiseX = local.x / Math.max(scale, 1e-9);
    const noiseZ = local.z / Math.max(scale, 1e-9);
    const cellX = Math.floor(noiseX * 42);
    const cellZ = Math.floor(noiseZ * 42);
    const seed = hash21(cellX + 313, cellZ + 191);

    if (seed <= 1 - disc.noiseDensity) return false;

    const localX = noiseX * 42 - cellX - 0.5;
    const localZ = noiseZ * 42 - cellZ - 0.5;
    const offsetX = (hash21(cellX + 17, cellZ + 59) - 0.5) * 0.65;
    const offsetZ = (hash21(cellX + 63, cellZ + 12) - 0.5) * 0.65;
    const dist = Math.hypot(localX - offsetX, localZ - offsetZ);
    const radius = 0.08 + innerT * 0.1;

    return dist < radius;
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
    const discHit = intersectDisc(origin, direction, worldObjects.disc);

    if (discHit.collided && (!hit.collided || discHit.dist < hit.dist)) {
        return sampleDisc(origin, discHit.point, worldObjects.disc);
    }

    if (hit.collided && steps > 0) {
        const reflectedOrigin = hit.point;
        const reflectedDirection = reflect(direction, hit.normal);
        const reflectedColor = trace(
            reflectedOrigin,
            reflectedDirection,
            {
                background: worldObjects.background,
                blackhole: worldObjects.blackhole,
                disc: worldObjects.disc,
                renderGeodesic: worldObjects.renderGeodesic,
                grid: worldObjects.grid,
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
    worldObjects: renderObjects,
    wc: WorldConfig,
): void => {
    const blackhole = camera.target;
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

const hash21 = (x: number, y: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
};

const cpuRenderBackground = (
    image: ImageData,
    camera: Camera,
    worldObjects: renderObjects,
    wc: WorldConfig,
): void => {
    const SCREEN_WIDTH = wc.screenWidth;
    const SCREEN_HEIGHT = wc.screenHeight;
    const background = worldObjects.background;
    const pixels: ImageDataArray = image.data;
    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);
    const milkyWayNormal = normalize(background.stars.milkyWayNormal);

    for (let y = 0; y < SCREEN_HEIGHT; y++) {
        const v = y / Math.max(SCREEN_HEIGHT - 1, 1);
        for (let x = 0; x < SCREEN_WIDTH; x++) {
            const u = x / Math.max(SCREEN_WIDTH - 1, 1);
            const i = cpuPixelIndex(x, y, SCREEN_WIDTH);

            if (background.mode === "empty") {
                pixels[i + 0] = background.empty.color.r;
                pixels[i + 1] = background.empty.color.g;
                pixels[i + 2] = background.empty.color.b;
                pixels[i + 3] = 255;
                continue;
            }

            if (background.mode === "gradient") {
                const topLeft = vec3(background.gradient.topLeft.r, background.gradient.topLeft.g, background.gradient.topLeft.b);
                const topRight = vec3(background.gradient.topRight.r, background.gradient.topRight.g, background.gradient.topRight.b);
                const bottomLeft = vec3(background.gradient.bottomLeft.r, background.gradient.bottomLeft.g, background.gradient.bottomLeft.b);
                const bottomRight = vec3(background.gradient.bottomRight.r, background.gradient.bottomRight.g, background.gradient.bottomRight.b);

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
                continue;
            }

            let color = vec3(
                background.stars.baseColor.r,
                background.stars.baseColor.g,
                background.stars.baseColor.b,
            );
            const screenX = x - SCREEN_WIDTH * 0.5;
            const screenY = y - SCREEN_HEIGHT * 0.5;
            const rayDirection = normalize(add(add(mul(right, screenX), mul(up, -screenY)), mul(forward, camera.focalLength)));
            const planeDist = Math.abs(dot(rayDirection, milkyWayNormal));
            const milkyWayBand = background.stars.milkyWayVisible
                ? Math.exp(-((planeDist / Math.max(background.stars.milkyWayWidth, 1e-4)) ** 2))
                : 0;
            const milkyWayNoise = 0.55 + 0.45 * hash21(u * 220, v * 110);
            const milkyWayStrength = milkyWayBand * milkyWayNoise * background.stars.milkyWayIntensity;
            const milkyWayCoreStrength = milkyWayStrength * (0.45 + 1.25 * milkyWayBand);

            color = add(color, mul(vec3(
                background.stars.milkyWayColor.r,
                background.stars.milkyWayColor.g,
                background.stars.milkyWayColor.b,
            ), milkyWayStrength));

            const primaryUvX = u * 720;
            const primaryUvY = v * 360;
            const primaryBaseX = Math.floor(primaryUvX);
            const primaryBaseY = Math.floor(primaryUvY);

            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const cellX = primaryBaseX + ox;
                    const cellY = primaryBaseY + oy;
                    const localX = primaryUvX - cellX - 0.5;
                    const localY = primaryUvY - cellY - 0.5;
                    const primarySeed = hash21(cellX, cellY);

                    if (primarySeed > 1 - Math.min(0.28, background.stars.densityPrimary + milkyWayCoreStrength * 0.085)) {
                        const offsetX = (hash21(cellX + 17, cellY + 59) - 0.5) * 0.7;
                        const offsetY = (hash21(cellX + 63, cellY + 12) - 0.5) * 0.7;
                        const starDist = Math.hypot(localX - offsetX, localY - offsetY);
                        const glow = Math.max(0, Math.min(1, (0.14 - starDist) / 0.14));
                        const tintSeed = hash21(cellX + 19.7, cellY + 73.1);
                        let starColor = vec3(255, 255, 255);

                        if (tintSeed > 0.9975) {
                            starColor = vec3(255, 148, 107);
                        } else if (tintSeed > 0.985) {
                            starColor = vec3(255, 230, 158);
                        }

                        color = add(color, mul(starColor, glow * (0.8 + 1.35 * hash21(cellX + 101.3, cellY + 7.7) + milkyWayCoreStrength * 3.2)));
                    }
                }
            }

            const secondaryUvX = u * 1200;
            const secondaryUvY = v * 600;
            const secondaryBaseX = Math.floor(secondaryUvX);
            const secondaryBaseY = Math.floor(secondaryUvY);

            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const cellX = secondaryBaseX + ox;
                    const cellY = secondaryBaseY + oy;
                    const localX = secondaryUvX - cellX - 0.5;
                    const localY = secondaryUvY - cellY - 0.5;
                    const secondarySeed = hash21(cellX + 211, cellY + 503);

                    if (secondarySeed > 1 - Math.min(0.22, background.stars.densitySecondary + milkyWayCoreStrength * 0.05)) {
                        const offsetX = (hash21(cellX + 5.2, cellY + 91.7) - 0.5) * 0.5;
                        const offsetY = (hash21(cellX + 29.6, cellY + 13.4) - 0.5) * 0.5;
                        const starDist = Math.hypot(localX - offsetX, localY - offsetY);
                        const glow = Math.max(0, Math.min(1, (0.06 - starDist) / 0.06));
                        color = add(color, mul(vec3(255, 255, 255), glow * (0.4 + milkyWayCoreStrength * 0.9)));
                    }
                }
            }

            const milkyWayBrightUvX = u * 520;
            const milkyWayBrightUvY = v * 260;
            const milkyWayBrightBaseX = Math.floor(milkyWayBrightUvX);
            const milkyWayBrightBaseY = Math.floor(milkyWayBrightUvY);

            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    const cellX = milkyWayBrightBaseX + ox;
                    const cellY = milkyWayBrightBaseY + oy;
                    const localX = milkyWayBrightUvX - cellX - 0.5;
                    const localY = milkyWayBrightUvY - cellY - 0.5;
                    const brightSeed = hash21(cellX + 401, cellY + 887);

                    if (brightSeed > 1 - Math.min(0.12, milkyWayCoreStrength * 0.16)) {
                        const offsetX = (hash21(cellX + 13, cellY + 37) - 0.5) * 0.65;
                        const offsetY = (hash21(cellX + 71, cellY + 19) - 0.5) * 0.65;
                        const starDist = Math.hypot(localX - offsetX, localY - offsetY);
                        const glow = Math.max(0, Math.min(1, (0.18 - starDist) / 0.18));
                        const tintSeed = hash21(cellX + 97, cellY + 31);
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

            pixels[i + 0] = Math.min(255, Math.round(color.x));
            pixels[i + 1] = Math.min(255, Math.round(color.y));
            pixels[i + 2] = Math.min(255, Math.round(color.z));
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

const fastGeodesicStep = (ray: GeodesicRay, dλ: number, schwarzschildRadius: SchwarzschildRadius): void => {
    const rhs: SixStates = [0, 0, 0, 0, 0, 0];

    computeGeodesicDerivatives(
        { r: ray.r, theta: ray.theta, dr: ray.dr, dtheta: ray.dtheta, dphi: ray.dphi, E: ray.E },
        schwarzschildRadius,
        rhs,
    );

    ray.r += dλ * rhs[0];
    ray.theta += dλ * rhs[1];
    ray.phi += dλ * rhs[2];
    ray.dr += dλ * rhs[3];
    ray.dtheta += dλ * rhs[4];
    ray.dphi += dλ * rhs[5];
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
        radialDist > disc.outerRadius ||
        discNoiseHole(point, disc)
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

const traceGeodesic = (
    rayOrigin: Vector3,
    rayDirection: Vector3,
    worldObjects: renderObjects,
    steps: number,
    colorOrigin: Vector3 = rayOrigin,
): Vector3 | null => {
    const blackhole = worldObjects.blackhole;
    const captureRadius = blackhole.schwarzschildRadius * 1.035;
    const localOrigin = sub(rayOrigin, blackhole.pos);
    const baseRay = ray(localOrigin, rayDirection);
    const geodesicRay = gRay(baseRay, blackhole);

    const dλ = worldObjects.renderGeodesic.dλ;
    const maxGeodesicSteps = worldObjects.renderGeodesic.maxSteps;
    const escapeRadius = worldObjects.renderGeodesic.escapeRadiusMultiplier * blackhole.schwarzschildRadius;
    let previousWorldPoint = rayOrigin;

    for (let stepIndex = 0; stepIndex < maxGeodesicSteps; stepIndex++) {
        if (worldObjects.renderGeodesic.useRungeKutta) {
            fourthOrderRungeKutta(geodesicRay, dλ, blackhole.schwarzschildRadius);
        } else {
            fastGeodesicStep(geodesicRay, dλ, blackhole.schwarzschildRadius);
        }

        if (!Number.isFinite(geodesicRay.r) || !Number.isFinite(geodesicRay.theta) || !Number.isFinite(geodesicRay.phi) || !Number.isFinite(geodesicRay.dr) || !Number.isFinite(geodesicRay.dtheta) || !Number.isFinite(geodesicRay.dphi)) {
            return vec3(0, 0, 0);
        }

        if (geodesicRay.r <= captureRadius) {
            return vec3(0, 0, 0);
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
            return sampleDisc(colorOrigin, discHit.point, worldObjects.disc);
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
                background: worldObjects.background,
                blackhole: worldObjects.blackhole,
                disc: worldObjects.disc,
                renderGeodesic: worldObjects.renderGeodesic,
                grid: worldObjects.grid,
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

        if (geodesicRay.r <= captureRadius) {
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
    cpuRenderBackground(image, camera, worldObjects, wc);
    cpuRenderGravityGrid(image, camera, worldObjects, wc);
    cpuRenderRayTracing(ctx, image, camera, worldObjects, wc, runGeodesic);
    ctx.putImageData(image, 0, 0);
}
