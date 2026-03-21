const canvas = document.getElementById("blackhole-canvas") as HTMLCanvasElement;
const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
if (context === null) {
    throw new Error("Context from canvas was not loaded.");
}
const ctx = context as CanvasRenderingContext2D;


const SCREEN_HEIGHT: number = canvas.height;
const SCREEN_WIDTH: number  = canvas.width;
const SIM_HEIGHT: number = 75000000000.0; // in meters (half-height)
const SIM_WIDTH: number = 100000000000.0; // in meters (half-width)
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

const WORLD_CENTER = vec2(0.0, 0.0);
const SCREEN_CENTER = vec2(SCREEN_WIDTH * 0.5, SCREEN_HEIGHT * 0.5);
const SCALE_X = SCREEN_WIDTH / (SIM_WIDTH * 2.0);
const SCALE_Y = SCREEN_HEIGHT / (SIM_HEIGHT * 2.0);
const SCALE = Math.min(SCALE_X, SCALE_Y);
const DEBUG = true;

const worldToScreen = (p: Vector2): Vector2 => {
    return vec2(
        SCREEN_CENTER.x + p.x * SCALE,
        SCREEN_CENTER.y - p.y * SCALE
    );
};

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
        this.schwarzschildRadius = 2.0 * G * this.mass / (C**2);
        this.gravity = G * this.mass;

        this.r = this.schwarzschildRadius; // meters
        this.color = "red";

    }

    draw(ctx: CanvasRenderingContext2D) {
        const p = worldToScreen(this.pos);
        const radiusPx = Math.max(2.0, this.r * SCALE);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2, false);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.stroke();
    }
}
const b = new BlackHole(WORLD_CENTER);

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
    size: number = 2;

    constructor(position: Vector2, direction: Vector2) {
        // cartesian
        this.pos = position;
        this.dir = direction;
        // polar coords
        this.r = Math.hypot(this.pos.x, this.pos.y);
        this.phi = Math.atan2(this.pos.y, this.pos.x);
        // seed velocities
        this.dr = this.dir.x * Math.cos(this.phi) + this.dir.y * Math.sin(this.phi); // m / s
        this.dphi = (-this.dir.x * Math.sin(this.phi) + this.dir.y * Math.cos(this.phi)) / this.r;
        // store conserved quantities
        this.L = this.r * this.r * this.dphi;
        const f: number = 1.0 - b.schwarzschildRadius / this.r;
        const dt_dλ: number = Math.sqrt((this.dr**2) / (f**2) + ((this.r**2) * (this.dphi**2)) / f);
        this.E = f * dt_dλ;
        // start trail
        this.trail.push(vec2(this.pos.x, this.pos.y));
    }

    step(b: BlackHole, subSteps: number = 1) {
        const dλ: number = 1.0 / subSteps;
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

        type GeodesicState = { r: number; dr: number; dphi: number; E: number };

        const geodesicRHS = (state: GeodesicState, rhs: fourStates, rs: SchwarzschildRadius): void => { // compute light bending
            const r: number = state.r;
            const dr: number = state.dr;
            const dphi: number = state.dphi;
            const E: number = state.E
            
            
            const f: number = 1.0 - rs / r;

            rhs[0] = dr; // dr/dλ = dr
            rhs[1] = dphi; // dφ/dλ = dphi
            
            // d²r/dλ² from Schwarzschild null geodesic:
            const dt_dλ: number = E / f;
            rhs[2] = -(rs / (2*r**2)) * f * (dt_dλ**2)
                + (rs / (2*r**2*f)) * (dr**2)
                + (r - rs) * (dphi**2);

            // d²φ/dλ² = -2*(dr * dphi) / r
            rhs[3] = -2.0 * dr * dphi / r;
        }

        const rk4Step = (dλ: number, rs: SchwarzschildRadius): void => {
            const y: fourStates = [this.r, this.phi, this.dr, this.dphi];
            const k1: fourStates = [0, 0, 0, 0];
            const temp: fourStates = [0, 0, 0, 0];

            geodesicRHS({ r: this.r, dr: this.dr, dphi: this.dphi, E: this.E }, k1, rs);
            RungeKutta4(y, k1, dλ/2.0, temp);
            
            const k2: fourStates = [0, 0, 0, 0];
            geodesicRHS({ r: temp[0], dr: temp[2], dphi: temp[3], E: this.E }, k2, rs);
            RungeKutta4(y, k2, dλ/2.0, temp);

            const k3: fourStates = [0, 0, 0, 0];
            geodesicRHS({ r: temp[0], dr: temp[2], dphi: temp[3], E: this.E }, k3, rs);
            RungeKutta4(y, k3, dλ, temp);

            const k4: fourStates = [0, 0, 0, 0];
            geodesicRHS({ r: temp[0], dr: temp[2], dphi: temp[3], E: this.E }, k4, rs);

            this.r += (dλ / 6.0) * (k1[0] + 2*k2[0] + 2*k3[0] + k4[0]);
            this.phi  += (dλ / 6.0) * (k1[1] + 2*k2[1] + 2*k3[1] + k4[1]);
            this.dr   += (dλ / 6.0) * (k1[2] + 2*k2[2] + 2*k3[2] + k4[2]);
            this.dphi += (dλ / 6.0) * (k1[3] + 2*k2[3] + 2*k3[3] + k4[3]);
        }

        for (let i = 0; i < subSteps; i++) {
            rk4Step(dλ, rs);

            // convert back to cartesian
            this.pos = vec2(this.r * Math.cos(this.phi), this.r * Math.sin(this.phi));

            // record the trail
            this.trail.push(vec2(this.pos.x, this.pos.y));
        }
    }


    draw(ctx: CanvasRenderingContext2D) {
        const stepLightIncrement: number = 1 / this.trail.length;
        var stepLight: number = stepLightIncrement;
        if (this.trail.length >= 2) {
            ctx.lineWidth = this.size;
            ctx.lineCap = "round";
            for (let i = 1; i < this.trail.length; i++) {
                const p0 = worldToScreen(this.trail[i - 1]!);
                const p1 = worldToScreen(this.trail[i]!);
                const alpha = Math.max(stepLight, 0.05);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(p1.x, p1.y);
                ctx.stroke();
                stepLight += stepLightIncrement;
            }
        }
    }
}
// init Rays
const projectedLight: Ray[] = [];
const ArrayDistance = SIM_HEIGHT / 8.0;
for (var i: number = -4; i <= 4; i++) {
    projectedLight.push(new Ray(pos2(-SIM_WIDTH, i * ArrayDistance), vec2(C, 0)))
}


let lastTime: number = 0;
let frameCount: number = 0;
const RAY_SUBSTEPS = 8;
const fps: number = 60;
const interval: number = 1000 / fps;

function animate(timestamp: number) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    if (deltaTime < interval) {
        requestAnimationFrame(animate);
        return;
    }

    lastTime = timestamp - (deltaTime % interval);

    // Clear the canvas
    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    b.draw(ctx);
    
    // light projectiles
    for (const l of projectedLight) {
        l.step(b, RAY_SUBSTEPS);
        l.draw(ctx);
    }

    if (DEBUG) {
        frameCount += 1;
        ctx.fillStyle = "#00ff88";
        ctx.fillText(`frame ${frameCount}`, 10, 20);
        ctx.fillText(`canvas ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`, 10, 36);
        const c = worldToScreen(WORLD_CENTER);
        ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
    }

    requestAnimationFrame(animate);
}


// Start the animation
requestAnimationFrame(animate);
