const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
if (ctx === null) {
    throw new Error("Context from canvas was not loaded.");
}


const HEIGHT = canvas.height;
const WIDTH = canvas.width;
const LIGHT_SPEED = 1; // 1 pixel

class Light {
    x: number = 10;
    y: number = 10;
    size: number = 10
    vector: [number, number] = [1, 0];
    trail: [number, number][] = []; // array of tuples

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    getPosBasedOnSize(): [number, number, number] {   
        // canvas draw rect from corner, therefore this function usecase to account for it
        return [this.x - (this.size / 2), this.y - (this.size / 2), this.size];
    }

    move() {
        this.x += this.vector[0];
        this.y += this.vector[1];
        this.trail.push([this.x, this.y]);
    }



}

const BlackHole = {
    x: canvas.width * 0.8,
    y: canvas.height * 0.5,
    g: 9.8, // gravity
    r: 70, // radius
    color: "red"
};
const b = BlackHole;

ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2, false);
ctx.fillStyle = b.color;
ctx.fill();
ctx.stroke();


// project light
const projectedLight: Light[] = []; 
for (var i: number = 1; i < HEIGHT / 100; i++) {
    projectedLight.push(new Light(100, i * 100))
}


let lastTime: number = 0;
const fps: number = 60;
const interval: number = 1000 / fps;

function animate(timestamp: number) {
    const deltaTime = timestamp - lastTime;

    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2, false);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.stroke();

    if (deltaTime > interval) {
        // Clear the canvas
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        
        // light projectiles
        ctx.fillStyle = "white"
        for (const l of projectedLight) {
            const [x, y, s] = l.getPosBasedOnSize();
            ctx.fillRect(x, y, s, s);
            
            // Update pos
            l.x += l.size * l.vector[0];
            l.y += l.size * l.vector[1];
        }
    }
    
    lastTime = timestamp - (deltaTime % interval);
    requestAnimationFrame(animate);
}

// Start the animation
requestAnimationFrame(animate);
