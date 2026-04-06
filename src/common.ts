import type { BlackHole, Camera, GeodesicRay, MouseDrag, RGB, Ray, Vector3 } from "./types";

export const handleCameraKeyArrows = (event: KeyboardEvent, camera: Camera, step: number = 0.1): void => {
    const pitchLimit = Math.PI * 0.5 - 0.01;

    if (event.key === "ArrowLeft") {
        camera.yaw -= step;
        event.preventDefault();
    };

    if (event.key === "ArrowRight") {
        camera.yaw += step;
        event.preventDefault();
    };

    if (event.key === "ArrowUp") {
        camera.pitch += step;
        camera.pitch = Math.min(camera.pitch, pitchLimit);
        event.preventDefault();
    }

    if (event.key === "ArrowDown") {
        camera.pitch -= step;
        camera.pitch = Math.max(camera.pitch, -pitchLimit);
        event.preventDefault();
    }
}

export const handleCameraMouseDrag = (
    event: MouseEvent,
    camera: Camera,
    mouseDrag: MouseDrag,
    sensitivity: number = 0.005,
): void => {
    if (!mouseDrag.active) return;

    const dx = event.clientX - mouseDrag.lastX;
    const dy = event.clientY - mouseDrag.lastY;

    mouseDrag.lastX = event.clientX;
    mouseDrag.lastY = event.clientY;

    camera.yaw += dx * sensitivity;
    camera.pitch -= dy * sensitivity;

    const pitchLimit = Math.PI * 0.5 - 0.01;
    camera.pitch = Math.max(-pitchLimit, Math.min(camera.pitch, pitchLimit));
};

export const handleCameraWheelZoom = (
    event: WheelEvent,
    camera: Camera,
    minRadius: number,
    maxRadius: number,
    zoomStep: number = 1.1,
): void => {
    if (event.deltaY > 0) {
        camera.radius = Math.min(camera.radius * zoomStep, maxRadius);
    } else if (event.deltaY < 0) {
        camera.radius = Math.max(camera.radius / zoomStep, minRadius);
    }

    event.preventDefault();
};

export const rgb = (r: number, g: number, b: number) => ({ r, g, b } satisfies RGB);

export const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);

export const sphericalBasis = (theta: number, phi: number): { eR: Vector3; eTheta: Vector3; ePhi: Vector3 } => {
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    return {
        eR: vec3(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi),
        eTheta: vec3(cosTheta * cosPhi, -sinTheta, cosTheta * sinPhi),
        ePhi: vec3(-sinPhi, 0, cosPhi),
    };
};

export const cross = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
};

export const mulParts = (a: Vector3, b: Vector3): Vector3 => {
    return vec3(a.x * b.x, a.y * b.y, a.z * b.z);
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

export const reflect = (direction: Vector3, normal: Vector3): Vector3 => {
    return sub(direction, mul(normal, dot(direction, normal) * 2));
};

export const ray = (pos: Vector3, dir: Vector3): Ray => {
    const r = mag(pos);
    if (r === 0) throw new Error("Cannot initialize a ray at the origin....");
    const theta = Math.acos(Math.max(-1, Math.min(1, pos.y / r)));
    const phi = Math.atan2(pos.z, pos.x);
    const sinTheta = Math.max(Math.sin(theta), 1e-9);
    const { eR, eTheta, ePhi } = sphericalBasis(theta, phi);
    const dr = dot(dir, eR);
    const dtheta = dot(dir, eTheta) / r;
    const dphi = dot(dir, ePhi) / (r * sinTheta);

    return {
        pos,
        dir,
        r,
        theta,
        phi,
        dr,
        dtheta,
        dphi,
    };
};

export const gRay = (ray: Ray, blackHole: BlackHole): GeodesicRay => {
    const sinTheta = Math.max(Math.sin(ray.theta), 1e-9);
    const L = ray.r ** 2 * Math.sqrt(ray.dtheta ** 2 + sinTheta ** 2 * ray.dphi ** 2);
    const f = 1.0 - blackHole.schwarzschildRadius / ray.r;
    const dtDλ = Math.sqrt(
        (ray.dr ** 2) / (f ** 2)
        + ((ray.r ** 2) * (ray.dtheta ** 2 + sinTheta ** 2 * ray.dphi ** 2)) / f,
    );
    const E = f * dtDλ;

    return {
        ...ray,
        E,
        L,
    };
};
