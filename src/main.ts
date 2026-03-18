const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
if (context === null) {
    throw new Error("Context from canvas was not loaded.");
}
const ctx = context as CanvasRenderingContext2D;


const SCREEN_HEIGHT: number = canvas.height;
const SCREEN_WIDTH: number  = canvas.width;
const SIM_HEIGHT: number = 75000000000.0; // in meters
const SIM_WIDTH: number = 100000000000.0; // in meters
const C: number = 2.99792458e8; // photon speed
const G: number  = 6.67430e-11;
const SOLAR_MASS = 1.989e30;  // kg
const SAGITTARIUS_A_MASS = 4.3e6 * SOLAR_MASS;

type Vector2 = {
    x: number;
    y: number;
}
type Position2 = Vector2;
// lambda function
const vec2 = (x: number, y: number) => ({x, y} satisfies Vector2)
const pos2 = vec2

// except Ray and BlackHole, use struct / function programming (for 3d use purely)

class BlackHole {
    public pos: Vector2;
    public mass: number
    public schwarzschildRadius: number
    public gravity: number

    public r: number
    public color: string

    constructor(pos: Vector2) {
        this.pos = pos;
        this.mass = SAGITTARIUS_A_MASS;
        this.schwarzschildRadius = 2.0 * G * this.mass / C**2;
        this.gravity = G * this.mass;

        this.r = 70; // radius
        this.color = "red";

    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.arc(this.pos.x, this.pos.y, this.r, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();;
    }
}
const b = new BlackHole(pos2(0, 0));

class Ray {
    // cartesian
    pos: Vector2;
    dir: Vector2;
    // polar coords
    r: number;
    phi: number;
    dr: number;
    dphi: number;
    // conserved quantities
    E: number;
    L: number;

    // draw
    trail: Position2[] = []; // array of pos history
    size: number = 1;

    constructor(position: Vector2, direction: Vector2) {
        // cartesian
        this.pos = position;
        this.dir = direction;
        // polar coords
        this.r = Math.hypot(this.pos.x, this.pos.y);
        this.phi = Math.atan2(this.pos.y, this.pos.x);
        // seed velocities
        this.dr = this.dir.x * Math.cos(this.phi) + this.dir.y * Math.sin(this.phi); // m / s
        this.dphi = (this.dir.x * Math.sin(this.phi) + this.dir.y * Math.cos(this.phi)) / this.r;
        // store conserved quantities
        this.L = this.r**2 * this.dphi;
        const f: number = 1.0 - b.schwarzschildRadius / this.r;
        const dt_dλ: number = Math.sqrt((this.dr ** 2) / (f**2) + (this.r**2*this.dphi**2) / f);
        this.E = f * dt_dλ;
        // start trail
        this.trail.push(this.pos);
    }

    step(b: BlackHole) {
        const dλ: number = 1.0;
        const rs: number = b.schwarzschildRadius;

        if (this.r <= b.schwarzschildRadius) return; // Robin Stooop it if inside the event horizon

        // integrate (r,φ,dr,dφ)
        function RungeKutta4 (): void {

        }

        function geodesicRHS (): void { // compute light bending

        }

        // DO ME
        function rk4Step (): void {

        }

        // record the trail
        this.trail.push(this.pos);
    }


    draw() {
        const x = this.pos.x - (this.size / 2);
        const y = this.pos.y - (this.size / 2);
        const s = this.size

        const stepLightIncrement: number = 1 / this.trail.length;
        var stepLight: number = stepLightIncrement;
    }
}
// init Rays
const projectedLight: Ray[] = [];
const ArrayDistance = 70
for (var i: number = 1; i < SCREEN_HEIGHT / ArrayDistance; i++) {
    projectedLight.push(new Ray(pos2(100, i * ArrayDistance), vec2(0, 0)))
}


let lastTime: number = 0;
const fps: number = 60;
const interval: number = 1500 / fps;

function animate(timestamp: number) {
    requestAnimationFrame(animate);

    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    b.draw(ctx);

    if (deltaTime > interval) {
        // Clear the canvas

        ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        
        // light projectiles
        for (const l of projectedLight) {
                l.step(b);
                l.draw();
            }
        }
    
    lastTime = timestamp - (deltaTime % interval);
    requestAnimationFrame(animate);
}


// Start the animation
requestAnimationFrame(animate);
