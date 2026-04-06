struct SceneUniforms {
    cameraPos: vec4f,
    cameraForward: vec4f,
    cameraRight: vec4f,
    cameraUp: vec4f,
    screen: vec4f,
    blackhole: vec4f,
};

struct Sphere {
    posRadius: vec4f,
    emission: vec4f,
};

struct VSOut {
    @builtin(position) position : vec4f,
    @location(0) uv : vec2f,
};

struct GridVSOut {
    @builtin(position) position : vec4f,
};

struct SphericalBasis {
    eR: vec3f,
    eTheta: vec3f,
    ePhi: vec3f,
};

struct GeodesicRay {
    r: f32,
    theta: f32,
    phi: f32,
    dr: f32,
    dtheta: f32,
    dphi: f32,
    E: f32,
};

struct Intersection {
    collided: bool,
    dist: f32,
    point: vec3f,
    normal: vec3f,
    color: vec3f,
    kind: u32,
};

struct TraceResult {
    hit: bool,
    color: vec3f,
};

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<storage, read> spheres: array<Sphere>;

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -3.0),
        vec2f(-1.0,  1.0),
        vec2f( 3.0,  1.0),
    );

    var out : VSOut;
    let pos = positions[vertexIndex];
    out.position = vec4f(pos, 0.0, 1.0);
    out.uv = pos * 0.5 + vec2f(0.5, 0.5);
    return out;
}

@vertex
fn gridVsMain(@location(0) position: vec2f) -> GridVSOut {
    var out: GridVSOut;
    out.position = vec4f(position, 0.0, 1.0);
    return out;
}

fn emptyIntersection() -> Intersection {
    return Intersection(false, 1e30, vec3f(0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0), 0u);
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

fn lerpColor(a: vec3f, b: vec3f, t: f32) -> vec3f {
    return vec3f(
        lerp(a.x, b.x, t),
        lerp(a.y, b.y, t),
        lerp(a.z, b.z, t),
    );
}

fn traceBackgroundGrid(uv: vec2f) -> vec3f {
    let topLeft = vec3f(1.0, 48.0 / 255.0, 48.0 / 255.0);
    let topRight = vec3f(1.0, 220.0 / 255.0, 0.0);
    let bottomLeft = vec3f(24.0 / 255.0, 12.0 / 255.0, 120.0 / 255.0);
    let bottomRight = vec3f(160.0 / 255.0, 0.0, 1.0);

    let top = lerpColor(topLeft, topRight, uv.x);
    let bottom = lerpColor(bottomLeft, bottomRight, uv.x);
    return lerpColor(top, bottom, uv.y);
}

fn sphericalBasis(theta: f32, phi: f32) -> SphericalBasis {
    let sinTheta = sin(theta);
    let cosTheta = cos(theta);
    let sinPhi = sin(phi);
    let cosPhi = cos(phi);

    return SphericalBasis(
        vec3f(sinTheta * cosPhi, cosTheta, sinTheta * sinPhi),
        vec3f(cosTheta * cosPhi, -sinTheta, cosTheta * sinPhi),
        vec3f(-sinPhi, 0.0, cosPhi),
    );
}

fn ray(pos: vec3f, dir: vec3f) -> GeodesicRay {
    let r = length(pos);
    let theta = acos(clamp(pos.y / max(r, 1e-9), -1.0, 1.0));
    let phi = atan2(pos.z, pos.x);
    let sinTheta = max(sin(theta), 1e-9);
    let basis = sphericalBasis(theta, phi);
    let dr = dot(dir, basis.eR);
    let dtheta = dot(dir, basis.eTheta) / max(r, 1e-9);
    let dphi = dot(dir, basis.ePhi) / max(r * sinTheta, 1e-9);

    return GeodesicRay(r, theta, phi, dr, dtheta, dphi, 0.0);
}

fn gRay(ray: GeodesicRay, schwarzschildRadius: f32) -> GeodesicRay {
    let f = 1.0 - schwarzschildRadius / max(ray.r, schwarzschildRadius + 1.0);
    let sinTheta = max(sin(ray.theta), 1e-9);
    let dtDλ = sqrt(
        (ray.dr * ray.dr) / (f * f) +
        ((ray.r * ray.r) * (ray.dtheta * ray.dtheta + sinTheta * sinTheta * ray.dphi * ray.dphi)) / f
    );

    return GeodesicRay(ray.r, ray.theta, ray.phi, ray.dr, ray.dtheta, ray.dphi, f * dtDλ);
}

fn computeGeodesicDerivatives(ray: GeodesicRay, schwarzschildRadius: f32) -> array<f32, 6> {
    var rhs: array<f32, 6>;
    let r = ray.r;
    let theta = ray.theta;
    let dr = ray.dr;
    let dtheta = ray.dtheta;
    let dphi = ray.dphi;
    let E = ray.E;

    let f = 1.0 - schwarzschildRadius / r;
    let dtDλ = E / f;
    let sinTheta = sin(theta);
    let cosTheta = cos(theta);
    let sinThetaSafe = select(sinTheta, 1e-9, abs(sinTheta) < 1e-9);

    rhs[0] = dr;
    rhs[1] = dtheta;
    rhs[2] = dphi;
    rhs[3] = -(schwarzschildRadius / (2.0 * r * r)) * f * (dtDλ * dtDλ)
        + (schwarzschildRadius / (2.0 * r * r * f)) * (dr * dr)
        + r * (dtheta * dtheta + sinTheta * sinTheta * dphi * dphi);
    rhs[4] = -(2.0 / r) * dr * dtheta
        + sinTheta * cosTheta * dphi * dphi;
    rhs[5] = -(2.0 / r) * dr * dphi
        - 2.0 * cosTheta / sinThetaSafe * dtheta * dphi;

    return rhs;
}

fn rayWithStep(ray: GeodesicRay, k: array<f32, 6>, factor: f32) -> GeodesicRay {
    return GeodesicRay(
        ray.r + k[0] * factor,
        ray.theta + k[1] * factor,
        ray.phi + k[2] * factor,
        ray.dr + k[3] * factor,
        ray.dtheta + k[4] * factor,
        ray.dphi + k[5] * factor,
        ray.E,
    );
}

fn fourthOrderRungeKutta(ray: GeodesicRay, dλ: f32, schwarzschildRadius: f32) -> GeodesicRay {
    let k1 = computeGeodesicDerivatives(ray, schwarzschildRadius);
    let k2 = computeGeodesicDerivatives(rayWithStep(ray, k1, dλ * 0.5), schwarzschildRadius);
    let k3 = computeGeodesicDerivatives(rayWithStep(ray, k2, dλ * 0.5), schwarzschildRadius);
    let k4 = computeGeodesicDerivatives(rayWithStep(ray, k3, dλ), schwarzschildRadius);

    return GeodesicRay(
        ray.r + (dλ / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]),
        ray.theta + (dλ / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]),
        ray.phi + (dλ / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]),
        ray.dr + (dλ / 6.0) * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3]),
        ray.dtheta + (dλ / 6.0) * (k1[4] + 2.0 * k2[4] + 2.0 * k3[4] + k4[4]),
        ray.dphi + (dλ / 6.0) * (k1[5] + 2.0 * k2[5] + 2.0 * k3[5] + k4[5]),
        ray.E,
    );
}

fn worldPoint(ray: GeodesicRay, blackholePos: vec3f) -> vec3f {
    let sinTheta = sin(ray.theta);
    let cosTheta = cos(ray.theta);
    let sinPhi = sin(ray.phi);
    let cosPhi = cos(ray.phi);

    return vec3f(
        blackholePos.x + ray.r * sinTheta * cosPhi,
        blackholePos.y + ray.r * cosTheta,
        blackholePos.z + ray.r * sinTheta * sinPhi,
    );
}

fn worldDirection(ray: GeodesicRay) -> vec3f {
    let basis = sphericalBasis(ray.theta, ray.phi);
    return normalize(
        basis.eR * ray.dr +
        basis.eTheta * (ray.r * ray.dtheta) +
        basis.ePhi * (ray.r * max(sin(ray.theta), 1e-9) * ray.dphi)
    );
}

fn segmentSphereIntersection(
    segmentStart: vec3f,
    segmentEnd: vec3f,
    center: vec3f,
    radius: f32,
    color: vec3f,
    kind: u32,
) -> Intersection {
    let segment = segmentEnd - segmentStart;
    let segmentLength = length(segment);

    if (segmentLength == 0.0) {
        return emptyIntersection();
    }

    let direction = segment / segmentLength;
    let oc = segmentStart - center;
    let b = 2.0 * dot(oc, direction);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - 4.0 * c;

    if (discriminant < 0.0) {
        return emptyIntersection();
    }

    let sqrtDiscriminant = sqrt(discriminant);
    let t1 = (-b - sqrtDiscriminant) * 0.5;
    let t2 = (-b + sqrtDiscriminant) * 0.5;
    var dist = 1e30;

    if (t1 >= 0.0 && t1 <= segmentLength) {
        dist = t1;
    } else if (t2 >= 0.0 && t2 <= segmentLength) {
        dist = t2;
    }

    if (dist == 1e30) {
        return emptyIntersection();
    }

    let point = segmentStart + direction * dist;
    let normal = normalize(point - center);
    return Intersection(true, dist, point, normal, color, kind);
}

fn sampleDisc(origin: vec3f, point: vec3f, blackholePos: vec3f, schwarzschildRadius: f32) -> vec3f {
    let local = point - blackholePos;
    let radialDist = length(vec2f(local.x, local.z));
    let innerRadius = 1.5 * schwarzschildRadius;
    let outerRadius = 2.6 * schwarzschildRadius;
    let cameraAxis = normalize(vec3f(origin.x - blackholePos.x, 0.0, origin.z - blackholePos.z));
    let axisCoord = dot(local, cameraAxis);
    let axisT = clamp(0.5 - 0.5 * axisCoord / outerRadius, 0.0, 1.0);
    let radialT = clamp((radialDist - innerRadius) / (outerRadius - innerRadius), 0.0, 1.0);

    return vec3f(
        1.0,
        (85.0 + 120.0 * axisT + 45.0 * radialT) / 255.0,
        (0.0 + 8.0 * axisT + 18.0 * radialT) / 255.0,
    );
}

fn segmentDiscIntersection(
    segmentStart: vec3f,
    segmentEnd: vec3f,
    origin: vec3f,
    blackholePos: vec3f,
    schwarzschildRadius: f32,
) -> Intersection {
    let segment = segmentEnd - segmentStart;

    if (abs(segment.y) < 1e-9) {
        return emptyIntersection();
    }

    let t = (blackholePos.y - segmentStart.y) / segment.y;
    if (t < 0.0 || t > 1.0) {
        return emptyIntersection();
    }

    let point = segmentStart + segment * t;
    let local = point - blackholePos;
    let radialDist = length(vec2f(local.x, local.z));
    let innerRadius = 1.5 * schwarzschildRadius;
    let outerRadius = 2.6 * schwarzschildRadius;

    if (radialDist < innerRadius || radialDist > outerRadius) {
        return emptyIntersection();
    }

    return Intersection(
        true,
        length(segment) * t,
        point,
        vec3f(0.0, 1.0, 0.0),
        sampleDisc(origin, point, blackholePos, schwarzschildRadius),
        3u,
    );
}

fn closestIntersection(current: Intersection, candidate: Intersection) -> Intersection {
    if (!candidate.collided) {
        return current;
    }
    if (!current.collided || candidate.dist < current.dist) {
        return candidate;
    }
    return current;
}

fn traceGeodesic(rayOrigin: vec3f, rayDirection: vec3f) -> TraceResult {
    let blackholePos = scene.blackhole.xyz;
    let schwarzschildRadius = scene.blackhole.w;
    let sphereCount = u32(scene.screen.w);
    let localOrigin = rayOrigin - blackholePos;
    let baseRay = ray(localOrigin, rayDirection);
    var geodesicRay = gRay(baseRay, schwarzschildRadius);

    let dλ: f32 = 1e8;
    let maxGeodesicSteps: u32 = 4096u;
    let escapeRadius: f32 = 30.0 * schwarzschildRadius;
    var previousWorldPoint = rayOrigin;

    for (var stepIndex: u32 = 0u; stepIndex < maxGeodesicSteps; stepIndex = stepIndex + 1u) {
        geodesicRay = fourthOrderRungeKutta(geodesicRay, dλ, schwarzschildRadius);

        let currentWorldPoint = worldPoint(geodesicRay, blackholePos);
        let _currentDirection = worldDirection(geodesicRay);

        var hit = emptyIntersection();
        hit = closestIntersection(hit, segmentSphereIntersection(previousWorldPoint, currentWorldPoint, blackholePos, schwarzschildRadius, vec3f(0.0), 1u));
        for (var sphereIndex: u32 = 0u; sphereIndex < sphereCount; sphereIndex = sphereIndex + 1u) {
            let sphere = spheres[sphereIndex];
            hit = closestIntersection(
                hit,
                segmentSphereIntersection(
                    previousWorldPoint,
                    currentWorldPoint,
                    sphere.posRadius.xyz,
                    sphere.posRadius.w,
                    sphere.emission.xyz,
                    2u,
                ),
            );
        }
        hit = closestIntersection(hit, segmentDiscIntersection(previousWorldPoint, currentWorldPoint, rayOrigin, blackholePos, schwarzschildRadius));

        if (hit.collided) {
            return TraceResult(true, hit.color);
        }

        if (geodesicRay.r <= schwarzschildRadius) {
            return TraceResult(true, vec3f(0.0));
        }

        if (geodesicRay.r >= escapeRadius && stepIndex > 8u) {
            return TraceResult(false, vec3f(0.0));
        }

        previousWorldPoint = currentWorldPoint;
    }

    return TraceResult(false, vec3f(0.0));
}

@fragment
fn backgroundFsMain(in: VSOut) -> @location(0) vec4f {
    return vec4f(traceBackgroundGrid(in.uv), 1.0);
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
    let width = scene.screen.x;
    let height = scene.screen.y;
    let focalLength = scene.screen.z;

    let x = in.uv.x * width - width * 0.5;
    let y = in.uv.y * height - height * 0.5;

    let rayDirection = normalize(
        scene.cameraRight.xyz * x +
        scene.cameraUp.xyz * (-y) +
        scene.cameraForward.xyz * focalLength
    );

    let result = traceGeodesic(scene.cameraPos.xyz, rayDirection);
    if (!result.hit) {
        discard;
    }
    return vec4f(result.color, 1.0);
}

@fragment
fn gridFsMain() -> @location(0) vec4f {
    return vec4f(1.0, 1.0, 1.0, 1.0);
}
