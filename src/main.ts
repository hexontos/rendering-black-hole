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

type SchwarzschildRadius = number;

// except Ray and BlackHole, use struct / function programming (for 3d use purely)

class BlackHole {
    public pos: Vector2;
    public mass: number
    public schwarzschildRadius: SchwarzschildRadius
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

        type fourStates = [number, number, number, number];

        // integrate (r,φ,dr,dφ)
        const RungeKutta4 = (a: fourStates, b: fourStates, factor: number, out: fourStates): void => {
            out[0] = a[0] + b[0] * factor;
            out[1] = a[1] + b[1] * factor;
            out[2] = a[2] + b[2] * factor;
            out[3] = a[3] + b[3] * factor;
        }

        const updateCurrentValues = (ray: Ray, update: fourStates): void => {
            ray.r = update[0];
            ray.phi = update[1];
            ray.dr = update[2];
            ray.dphi = update[3];
        }

        const geodesicRHS = (ray: Ray, rhs: fourStates, rs: SchwarzschildRadius): void => { // compute light bending
            const r: number = ray.r;
            const dr: number = ray.dr;
            const dphi: number = ray.dr;
            const E: number = ray.E
            
            
            const f: number = 1.0 - rs / r;

            rhs[0] = dr; // dr/dλ = dr
            rhs[1] = dphi; // dφ/dλ = dphi
            
            // d²r/dλ² from Schwarzschild null geodesic:
            const dt_dλ: number = E / f;
            rhs[2] = -(rs / (2*r**2)) * f * (dt_dλ**2) + (rs / (2*r**2*f)) * (dr**2) + (r - rs) * (dphi**2);

            // d²φ/dλ² = -2*(dr * dphi) / r
            rhs[3] = -2.0 * dr * dphi / r;
        }

        // DO ME
        const rk4Step = (dλ: number, rs: SchwarzschildRadius): void => {
            const y: fourStates = [this.r, this.phi, this.dr, this.dphi];
            const k1: fourStates = [0, 0, 0, 0];
            const temp: fourStates = [0, 0, 0, 0];

            geodesicRHS(this, k1, rs);
            RungeKutta4(y, k1, dλ/2.0, temp);
            
            const r2 = new Ray(this.pos, this.dir);
            updateCurrentValues(r2, temp);
            const k2: fourStates = [0, 0, 0, 0];
            geodesicRHS(r2, k2, rs);
            RungeKutta4(y, k2, dλ/2.0, temp);

            const r3 = new Ray(this.pos, this.dir);
            updateCurrentValues(r3, temp);
            const k3: fourStates = [0, 0, 0, 0];
            geodesicRHS(r3, k3, rs);
            RungeKutta4(y, k3, dλ/2.0, temp);

            const r4 = new Ray(this.pos, this.dir);
            updateCurrentValues(r4, temp);
            const k4: fourStates = [0, 0, 0, 0];
            geodesicRHS(r4, k4, rs);

            this.r += (dλ / 6.0) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]);
            this.phi  += (dλ / 6.0) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]);
            this.dr   += (dλ / 6.0) * (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]);
            this.dphi += (dλ / 6.0) * (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]);
        }

        rk4Step(dλ, rs);

        // record the trail
        this.trail.push(this.pos);
    }


    draw(ctx: CanvasRenderingContext2D) {
        const stepLightIncrement: number = 1 / this.trail.length;
        var stepLight: number = stepLightIncrement;
        for (const l of this.trail) {
            const x = l.x - (this.size / 2);
            const y = l.y - (this.size / 2);
            const s = this.size

            ctx.fillStyle = `rgba(255, 255, 255, ${stepLight})`;
            stepLight += stepLightIncrement;
            ctx.strokeRect(x, y, x+s, y+s);
        }
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
                l.draw(ctx);
            }
        }
    
    lastTime = timestamp - (deltaTime % interval);
    requestAnimationFrame(animate);
}


// Start the animation
requestAnimationFrame(animate);
