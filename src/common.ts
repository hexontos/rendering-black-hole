import type { Camera, RGB, Vector3 } from "./types";

export const rgb = (r: number, g: number, b: number) => ({ r, g, b } satisfies RGB);

export const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);

export const cross = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
};

export const dot = (a: Vector3, b: Vector3): number => {
    return a.x * b.x + a.y * b.y + a.z * b.z;
};

export const mag = (a: Vector3): number => {
    const ret = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2)
    if (ret === 0) return 1;
    return ret;
};

export const mul = (a: Vector3, b: number): Vector3 => {
    return vec3(a.x * b, a.y * b, a.z * b);
};

export const sub = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
};

export const add = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
};

export const normalize = (vector: Vector3): Vector3 => {
    const { x, y, z } = vector;
    const magV = 1 / mag(vector);
    return vec3(x*magV, y*magV, z*magV);
};

export const orbitCamera = (camera: Camera): Vector3 => {
    const center = camera.target.pos;

    return vec3(
          center.x + camera.radius * Math.cos(camera.pitch) * Math.cos(camera.yaw),
          center.y + camera.radius * Math.sin(camera.pitch),
          center.z + camera.radius * Math.cos(camera.pitch) * Math.sin(camera.yaw),
      );
};

export const cameraForward = (cPos: Vector3, camera: Camera): Vector3 => {
    return normalize(sub(camera.target.pos, cPos));
};

export const cameraUp = (forward: Vector3, right: Vector3): Vector3 => {
    return normalize(cross(forward, right));
};

export const cameraRight = (forward: Vector3): Vector3 => {
    const worldUp = vec3(0, 1, 0);
    return normalize(cross(worldUp, forward));
};
