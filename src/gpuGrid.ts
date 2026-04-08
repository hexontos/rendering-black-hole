import { cameraForward, cameraRight, cameraUp, dot, orbitCamera, sub, vec3 } from "./common";
import type { Camera, renderObjects } from "./types";

// NOTE: for simplicity create grid in CPU realm and render it in GPU

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

const projectGridPointToClip = (
    point: { x: number; y: number; z: number },
    cameraPos: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    right: { x: number; y: number; z: number },
    up: { x: number; y: number; z: number },
    screenWidth: number,
    screenHeight: number,
    focalLength: number,
): { x: number; y: number } | null => {
    const relative = sub(point, cameraPos);
    const depth = dot(relative, forward);

    if (depth <= 0) return null;

    const screenX = screenWidth * 0.5 + focalLength * dot(relative, right) / depth;
    const screenY = screenHeight * 0.5 - focalLength * dot(relative, up) / depth;

    return {
        x: screenX / screenWidth * 2 - 1,
        y: 1 - screenY / screenHeight * 2,
    };
};

export const gpuGridVertices = (
    camera: Camera,
    worldObjects: renderObjects,
    screenWidth: number,
    screenHeight: number,
): Float32Array => {
    const grid = worldObjects.grid;
    if (!grid.visible) return new Float32Array();

    const baseY = grid.pos.y;
    const halfSize = grid.halfSize;
    const cellSize = grid.cellSize;
    const maxDrop = grid.maxDrop;
    const gridSteps = Math.round((2 * halfSize) / cellSize);

    const cameraPos = orbitCamera(camera);
    const forward = cameraForward(cameraPos, camera);
    const right = cameraRight(forward);
    const up = cameraUp(forward, right);
    const projected: ({ x: number; y: number } | null)[][] = [];
    const lineVertices: number[] = [];

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

            row.push(projectGridPointToClip(
                point,
                cameraPos,
                forward,
                right,
                up,
                screenWidth,
                screenHeight,
                camera.focalLength,
            ));
        }
        projected.push(row);
    }

    for (let z = 0; z <= gridSteps; z++) {
        const row = projected[z];
        const nextRow = projected[z + 1];
        if (row == null) continue;

        for (let x = 0; x <= gridSteps; x++) {
            const current = row[x];
            if (current == null) continue;

            if (x < gridSteps) {
                const horizontal = row[x + 1];
                if (horizontal != null) {
                    lineVertices.push(current.x, current.y, horizontal.x, horizontal.y);
                }
            }

            if (z < gridSteps && nextRow != null) {
                const vertical = nextRow[x];
                if (vertical != null) {
                    lineVertices.push(current.x, current.y, vertical.x, vertical.y);
                }
            }
        }
    }

    return new Float32Array(lineVertices);
};
