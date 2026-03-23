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
