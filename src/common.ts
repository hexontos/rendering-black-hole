import type { RGB, Vector3 } from "./types";

export const rgb = (r: number, g: number, b: number) => ({ r, g, b } satisfies RGB);

export const vec3 = (x: number, y: number, z: number) => ({ x, y, z } satisfies Vector3);
