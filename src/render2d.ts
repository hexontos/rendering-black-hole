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

const screenToWorld = (p: Vector2): Vector2 => {
    return vec2(
        (p.x - SCREEN_CENTER.x) / SCALE,
        (SCREEN_CENTER.y - p.y) / SCALE
    );
};

class BlackHole {
    public pos: Vector2;
    public mass: number
    public schwarzschildRadius: SchwarzschildRadius
    public gravity: number

    public r: number
    public color: string

    constructor(pos: Vector2, mass: number = SAGITTARIUS_A_MASS) {
        this.pos = pos;
        this.mass = mass;
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

type FourStates = [number, number, number, number];

class GeodesicIntegrator {
    private k1: FourStates = [0, 0, 0, 0];
    private k2: FourStates = [0, 0, 0, 0];
    private k3: FourStates = [0, 0, 0, 0];
    private k4: FourStates = [0, 0, 0, 0];
    private temp: FourStates = [0, 0, 0, 0];
    private y: FourStates = [0, 0, 0, 0];

    private addState(a: FourStates, b: FourStates, factor: number, out: FourStates): void {
        out[0] = a[0] + b[0] * factor;
        out[1] = a[1] + b[1] * factor;
        out[2] = a[2] + b[2] * factor;
        out[3] = a[3] + b[3] * factor;
    }

    private geodesicRHS(state: { r: number; dr: number; dphi: number; E: number }, rhs: FourStates, rs: SchwarzschildRadius): void {
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

    step(ray: Ray, dλ: number, rs: SchwarzschildRadius): void {
        this.y[0] = ray.r;
        this.y[1] = ray.phi;
        this.y[2] = ray.dr;
        this.y[3] = ray.dphi;

        this.geodesicRHS({ r: ray.r, dr: ray.dr, dphi: ray.dphi, E: ray.E }, this.k1, rs);
        this.addState(this.y, this.k1, dλ/2.0, this.temp);

        this.geodesicRHS({ r: this.temp[0], dr: this.temp[2], dphi: this.temp[3], E: ray.E }, this.k2, rs);
        this.addState(this.y, this.k2, dλ/2.0, this.temp);

        this.geodesicRHS({ r: this.temp[0], dr: this.temp[2], dphi: this.temp[3], E: ray.E }, this.k3, rs);
        this.addState(this.y, this.k3, dλ, this.temp);

        this.geodesicRHS({ r: this.temp[0], dr: this.temp[2], dphi: this.temp[3], E: ray.E }, this.k4, rs);

        ray.r    += (dλ / 6.0) * (this.k1[0] + 2*this.k2[0] + 2*this.k3[0] + this.k4[0]);
        ray.phi  += (dλ / 6.0) * (this.k1[1] + 2*this.k2[1] + 2*this.k3[1] + this.k4[1]);
        ray.dr   += (dλ / 6.0) * (this.k1[2] + 2*this.k2[2] + 2*this.k3[2] + this.k4[2]);
        ray.dphi += (dλ / 6.0) * (this.k1[3] + 2*this.k2[3] + 2*this.k3[3] + this.k4[3]);
    }
}

class Ray {
    // cartesian
    pos: Vector2;
    dir: Vector2;
    origin: Vector2;
    localPos: Vector2;
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
    active: boolean = true;

    constructor(position: Vector2, direction: Vector2, primaryBlackHole: BlackHole) {
        // cartesian
        this.pos = position;
        this.dir = direction;
        this.origin = vec2(primaryBlackHole.pos.x, primaryBlackHole.pos.y);
        this.localPos = vec2(this.pos.x - this.origin.x, this.pos.y - this.origin.y);
        // polar coords
        this.r = Math.hypot(this.localPos.x, this.localPos.y);
        this.phi = Math.atan2(this.localPos.y, this.localPos.x);
        // seed velocities
        this.dr = this.dir.x * Math.cos(this.phi) + this.dir.y * Math.sin(this.phi); // m / s
        this.dphi = (-this.dir.x * Math.sin(this.phi) + this.dir.y * Math.cos(this.phi)) / this.r;
        // store conserved quantities
        this.L = this.r * this.r * this.dphi;
        const f: number = 1.0 - primaryBlackHole.schwarzschildRadius / this.r;
        const dt_dλ: number = Math.sqrt((this.dr**2) / (f**2) + ((this.r**2) * (this.dphi**2)) / f);
        this.E = f * dt_dλ;

        
        this.trail.push(vec2(this.pos.x, this.pos.y));
    }

    step(b: BlackHole, integrator: GeodesicIntegrator, subSteps: number = 1) {
        const dλ: number = 1.0 / subSteps;
        const rs: number = b.schwarzschildRadius;

        if (!this.active) return;
        if (this.isInside(b)) {
            this.active = false;
            return;
        }

        for (let i = 0; i < subSteps; i++) {
            integrator.step(this, dλ, rs);

            // convert back to cartesian (local -> world)
            this.localPos = vec2(this.r * Math.cos(this.phi), this.r * Math.sin(this.phi));
            this.pos = vec2(this.origin.x + this.localPos.x, this.origin.y + this.localPos.y);

            // record the trail
            this.trail.push(vec2(this.pos.x, this.pos.y));

            if (this.isInside(b)) {
                this.active = false;
                break;
            }
        }
    }

    isInside(blackHole: BlackHole): boolean {
        const dx = this.pos.x - blackHole.pos.x;
        const dy = this.pos.y - blackHole.pos.y;
        const dist = Math.hypot(dx, dy);
        return dist <= blackHole.schwarzschildRadius;
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
class Simulation {
    private rays: Ray[] = [];
    private integrator: GeodesicIntegrator = new GeodesicIntegrator();
    private blackHoles: BlackHole[];
    private raySubSteps: number;
    private fps: number;
    private interval: number;
    private lastTime: number = 0;
    private frameCount: number = 0;
    private halted: boolean = false;
    private frameSafetyLimit: number = 5000;
    private haltWarned: boolean = false;

    constructor(blackHoles: BlackHole[], raySubSteps: number, fps: number) {
        this.blackHoles = blackHoles;
        this.raySubSteps = raySubSteps;
        this.fps = fps;
        this.interval = 1000 / fps;
    }

    addRay(ray: Ray): void {
        this.rays.push(ray);
    }

    addRays(rays: Ray[]): void {
        for (const ray of rays) {
            this.rays.push(ray);
        }
    }

    clearRays(): void {
        this.rays = [];
    }

    setBlackHoles(holes: BlackHole[]): void {
        this.blackHoles = holes;
    }

    getPrimaryBlackHole(): BlackHole | null {
        return this.blackHoles[0] ?? null;
    }

    resetTiming(): void {
        this.lastTime = 0;
        this.frameCount = 0;
        this.halted = false;
        this.haltWarned = false;
    }

    private updateRays(): void {
        const primary = this.blackHoles[0];
        if (!primary) return;
        const subStepsPer = this.raySubSteps;
        const others = this.blackHoles.slice(1);

        for (const ray of this.rays) {
            if (!ray.active) continue;
            ray.step(primary, this.integrator, subStepsPer);
            if (!ray.active) continue;
            for (const hole of others) {
                if (ray.isInside(hole)) {
                    ray.active = false;
                    break;
                }
            }
        }
    }

    private drawScene(ctx: CanvasRenderingContext2D): void {
        ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        for (const hole of this.blackHoles) {
            hole.draw(ctx);
        }
        for (const ray of this.rays) {
            ray.draw(ctx);
        }

        if (DEBUG) {
            this.frameCount += 1;
            ctx.fillStyle = "#00ff88";
            ctx.fillText(`frame ${this.frameCount}`, 10, 20);
            ctx.fillText(`canvas ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`, 10, 36);
            const c = worldToScreen(WORLD_CENTER);
            ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
        }
    }

    start(): void {
        const tick = (timestamp: number) => {
            if (!this.lastTime) this.lastTime = timestamp;
            const deltaTime = timestamp - this.lastTime;
            if (deltaTime < this.interval) {
                requestAnimationFrame(tick);
                return;
            }

            if (this.frameCount >= this.frameSafetyLimit) {
                this.halted = true;
                if (!this.haltWarned) {
                    console.warn("Simulation halted: frame safety limit reached.");
                    this.haltWarned = true;
                }
            }
            if (this.halted) {
                requestAnimationFrame(tick);
                return;
            }

            this.lastTime = timestamp - (deltaTime % this.interval);
            this.updateRays();
            this.drawScene(ctx);
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }
}

const RAY_COUNT: number = 13;
const RAY_SPACING = SIM_HEIGHT / 9;
const LEFT_EDGE = -SIM_WIDTH;
const TOP_EDGE = SIM_HEIGHT;
const COMPACT_RAY_COUNT: number = 15;
const COMPACT_ANGLE_SPREAD = 0.01; // radians
const COMPACT_ORIGIN = vec2(LEFT_EDGE, SIM_HEIGHT * 0.1);

const buildSideRays = (primary: BlackHole): Ray[] => {
    const rays: Ray[] = [];
    const half = Math.floor(RAY_COUNT / 2);
    for (let i = -half; i <= half; i++) {
        rays.push(new Ray(pos2(LEFT_EDGE, i * RAY_SPACING), vec2(C, 0), primary));
    }
    return rays;
};

const buildCornerRays = (primary: BlackHole): Ray[] => {
    const rays: Ray[] = [];
    const start = Math.PI * 1.5;
    const end = Math.PI * 2.0;
    for (let i = 0; i < RAY_COUNT; i++) {
        const t = RAY_COUNT === 1 ? 0.0 : i / (RAY_COUNT - 1);
        const angle = start + (end - start) * t;
        const dir = vec2(C * Math.cos(angle), C * Math.sin(angle));
        rays.push(new Ray(pos2(LEFT_EDGE, TOP_EDGE), dir, primary));
    }
    return rays;
};

const buildCompactedRays = (primary: BlackHole): Ray[] => {
    const rays: Ray[] = [];
    const start = -COMPACT_ANGLE_SPREAD * 0.5;
    const end = COMPACT_ANGLE_SPREAD * 0.5;
    for (let i = 0; i < COMPACT_RAY_COUNT; i++) {
        const t = COMPACT_RAY_COUNT === 1 ? 0.0 : i / (COMPACT_RAY_COUNT - 1);
        const angle = start + (end - start) * t;
        const dir = vec2(C * Math.cos(angle), C * Math.sin(angle));
        rays.push(new Ray(pos2(COMPACT_ORIGIN.x, COMPACT_ORIGIN.y * 4.385), dir, primary));
    }
    return rays;
};

const resetSimulation = (): void => {
    sim.setBlackHoles([b]);
    sim.clearRays();
    sim.addRays(buildSideRays(b));
    sim.resetTiming();
};

const newPosBlackhole = (posOrList: Vector2 | Vector2[]): Vector2[] => {
    const list = Array.isArray(posOrList) ? posOrList : [posOrList];
    if (list.length === 0) {
        resetSimulation();
        return [];
    }
    const worldList = list.map((p) => screenToWorld(vec2(p.x, p.y)));
    const holes = worldList.map((p) => new BlackHole(vec2(p.x, p.y)));
    const primary = holes[0] ?? b;
    sim.setBlackHoles(holes);
    sim.clearRays();
    sim.addRays(buildSideRays(primary));
    sim.resetTiming();
    console.log("Black holes (world meters):", worldList);
    return worldList;
};

const initRayFromCorner = (): void => {
    const primary = sim.getPrimaryBlackHole() ?? b;
    sim.clearRays();
    sim.addRays(buildCornerRays(primary));
    sim.resetTiming();
};

const initRayFromSide = (): void => {
    const primary = sim.getPrimaryBlackHole() ?? b;
    sim.clearRays();
    sim.addRays(buildSideRays(primary));
    sim.resetTiming();
};

const initCompactedRay = (): void => {
    const primary = sim.getPrimaryBlackHole() ?? b;
    sim.clearRays();
    sim.addRays(buildCompactedRays(primary));
    sim.resetTiming();
};

const help = (): void => {
    console.log("Commands:");
    console.log("- reset(): restore center black hole and side rays");
    console.log("- newPosBlackhole({x, y}) or newPosBlackhole([{x, y}, ...]) (screen pixels)");
    console.log("- initRayFromSide(): side rays like default");
    console.log("- initRayFromCorner(): corner rays (3/2π to 2π)");
    console.log("- initCompactedRay(): tight bundle from a single origin");
};

(window as any).reset = resetSimulation;
(window as any).newPosBlackhole = newPosBlackhole;
(window as any).initRayFromCorner = initRayFromCorner;
(window as any).initRayFromSide = initRayFromSide;
(window as any).initCompactedRay = initCompactedRay;
(window as any).help = help;

const sim = new Simulation([b], 1, 60);
sim.addRays(buildSideRays(b));
sim.start();
