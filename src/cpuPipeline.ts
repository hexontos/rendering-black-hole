import { rgb } from "./common";
import type { BlackHole, RenderOBJ, Camera, RGB, WorldConfig, renderObjects, Vector3 } from "./types";

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

    // each pixel in canvas
    for (let j: number = 0; j < SCREEN_HEIGHT; j++) {
        for (let i: number = 0; i < SCREEN_WIDTH; i++) {
            const x: number = i - SCREEN_WIDTH * 0.5;
            const y: number = j - SCREEN_HEIGHT * 0.5;

            const ci = cpuPixelIndex(x, y, SCREEN_WIDTH);
            let pixel: RGB = rgb(pixels[ci + 0] as number, pixels[ci + 1] as number, pixels[ci + 2] as number);

            let rayDirection = normalize(vec3(x, y, camera.focalLength));

            // blackhole


            // spheres
            for (let n: number = 0; n < samples; n++) {
                pixel = add(pixel, trace(vec3(0, 0, 0), worldObjects, ))
                //pixel = add(pixel, trace([0, 0, 0], rayDirection, worldObjects, 4));
            }

            void x;
            void y;
            void pixel;
            void pixels;
            void worldObjects;
        }
    }
};

const trace = (origin: Vector3, direction: Vector3, renderObjects: renderObjects, ) => {

};

export function cpuPipeline(
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
