const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
if (ctx === null) {
    throw new Error("Context from canvas was not loaded.");
}

ctx.fillStyle = "red";
ctx.fillRect(100, 100, 10, 10);
