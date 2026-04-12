struct SceneUniforms {
    cameraPos: vec4f,
    cameraForward: vec4f,
    cameraRight: vec4f,
    cameraUp: vec4f,
    screen: vec4f,
    blackhole: vec4f,
    discPos: vec4f,
    discParams: vec4f,
    discNearColor: vec4f,
    discFarColor: vec4f,
    discRadialBoost: vec4f,
    gridLineColor: vec4f,
    backgroundParams: vec4f,
    backgroundStarsColor: vec4f,
    backgroundEmptyColor: vec4f,
    backgroundGradientTopLeft: vec4f,
    backgroundGradientTopRight: vec4f,
    backgroundGradientBottomLeft: vec4f,
    backgroundGradientBottomRight: vec4f,
    backgroundMilkyWayParams: vec4f,
    backgroundMilkyWayColor: vec4f,
    geodesicParams: vec4f,
    geodesicComputationParams: vec4f,
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

struct OrbitalPlane {
    radialAxis: vec3f,
    tangentialAxis: vec3f,
};

struct PlanarGeodesicRay {
    r: f32,
    phi: f32,
    dr: f32,
    dphi: f32,
    E: f32,
};

struct Intersection {
    collided: bool,
    dist: f32,
    point: vec3f,
    color: vec3f,
};

struct TraceResult {
    hit: bool,
    color: vec3f,
};

const PI: f32 = 3.141592653589793;

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
    return Intersection(false, 1e30, vec3f(0.0), vec3f(0.0));
}

fn blackholeShadowRadius(schwarzschildRadius: f32) -> f32 {
    return 0.5 * sqrt(27.0) * schwarzschildRadius;
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

fn sampleGradientBackground(uv: vec2f) -> vec3f {
    let topLeft = scene.backgroundGradientTopLeft.xyz;
    let topRight = scene.backgroundGradientTopRight.xyz;
    let bottomLeft = scene.backgroundGradientBottomLeft.xyz;
    let bottomRight = scene.backgroundGradientBottomRight.xyz;

    let top = lerpColor(topLeft, topRight, uv.x);
    let bottom = lerpColor(bottomLeft, bottomRight, uv.x);
    return lerpColor(top, bottom, uv.y);
}

fn hash21(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn hash22(p: vec2f) -> vec2f {
    return vec2f(
        hash21(p + vec2f(17.0, 59.4)),
        hash21(p + vec2f(63.1, 12.8)),
    );
}

fn sampleStarField(direction: vec3f) -> vec3f {
    let skyUv = vec2f(
        atan2(direction.z, direction.x) / (2.0 * PI) + 0.5,
        acos(clamp(direction.y, -1.0, 1.0)) / PI,
    );

    var color = scene.backgroundStarsColor.xyz;
    let milkyWayNormal = normalize(scene.backgroundMilkyWayParams.xyz);
    let milkyWayWidth = max(scene.backgroundMilkyWayParams.w, 1e-4);
    let planeDist = abs(dot(direction, milkyWayNormal));
    let milkyWayBand = exp(-pow(planeDist / milkyWayWidth, 2.0));
    let milkyWayNoise = 0.55 + 0.45 * hash21(skyUv * vec2f(220.0, 110.0));
    let milkyWayStrength = milkyWayBand * milkyWayNoise * scene.backgroundMilkyWayColor.w;
    let milkyWayCoreStrength = milkyWayStrength * (0.45 + 1.25 * milkyWayBand);

    color = color + scene.backgroundMilkyWayColor.xyz * milkyWayStrength;

    let primaryUv = skyUv * vec2f(720.0, 360.0);
    let primaryBaseCell = floor(primaryUv);

    for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
        for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
            let primaryCell = primaryBaseCell + vec2f(f32(ox), f32(oy));
            let primaryLocal = primaryUv - primaryCell - vec2f(0.5);
            let primarySeed = hash21(primaryCell);

            if (primarySeed > 1.0 - clamp(scene.backgroundParams.y + milkyWayCoreStrength * 0.085, 0.0, 0.28)) {
                let starOffset = (hash22(primaryCell) - vec2f(0.5)) * 0.7;
                let starDist = length(primaryLocal - starOffset);
                let glow = smoothstep(0.14, 0.0, starDist);
                let tintSeed = hash21(primaryCell + vec2f(19.7, 73.1));
                var starColor = vec3f(1.0, 1.0, 1.0);

                if (tintSeed > 0.9975) {
                    starColor = vec3f(1.0, 0.58, 0.42);
                } else if (tintSeed > 0.985) {
                    starColor = vec3f(1.0, 0.9, 0.62);
                }

                color = color + starColor * glow * (0.8 + 1.35 * hash21(primaryCell + vec2f(101.3, 7.7)) + milkyWayCoreStrength * 3.2);
            }
        }
    }

    let secondaryUv = skyUv * vec2f(1200.0, 600.0);
    let secondaryBaseCell = floor(secondaryUv);

    for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
        for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
            let secondaryCell = secondaryBaseCell + vec2f(f32(ox), f32(oy));
            let secondaryLocal = secondaryUv - secondaryCell - vec2f(0.5);
            let secondarySeed = hash21(secondaryCell + vec2f(211.0, 503.0));

            if (secondarySeed > 1.0 - clamp(scene.backgroundParams.z + milkyWayCoreStrength * 0.05, 0.0, 0.22)) {
                let starOffset = (hash22(secondaryCell + vec2f(5.2, 91.7)) - vec2f(0.5)) * 0.5;
                let starDist = length(secondaryLocal - starOffset);
                let glow = smoothstep(0.06, 0.0, starDist);
                color = color + vec3f(1.0, 1.0, 1.0) * glow * (0.4 + milkyWayCoreStrength * 0.9);
            }
        }
    }

    let milkyWayBrightUv = skyUv * vec2f(520.0, 260.0);
    let milkyWayBrightBaseCell = floor(milkyWayBrightUv);

    for (var oy: i32 = -1; oy <= 1; oy = oy + 1) {
        for (var ox: i32 = -1; ox <= 1; ox = ox + 1) {
            let brightCell = milkyWayBrightBaseCell + vec2f(f32(ox), f32(oy));
            let brightLocal = milkyWayBrightUv - brightCell - vec2f(0.5);
            let brightSeed = hash21(brightCell + vec2f(401.0, 887.0));

            if (brightSeed > 1.0 - clamp(milkyWayCoreStrength * 0.16, 0.0, 0.12)) {
                let starOffset = (hash22(brightCell + vec2f(13.0, 37.0)) - vec2f(0.5)) * 0.65;
                let starDist = length(brightLocal - starOffset);
                let glow = smoothstep(0.18, 0.0, starDist);
                let tintSeed = hash21(brightCell + vec2f(97.0, 31.0));
                var starColor = vec3f(1.0, 1.0, 1.0);

                if (tintSeed > 0.9985) {
                    starColor = vec3f(1.0, 0.6, 0.45);
                } else if (tintSeed > 0.992) {
                    starColor = vec3f(1.0, 0.9, 0.68);
                }

                color = color + starColor * glow * (1.25 + milkyWayCoreStrength * 5.5);
            }
        }
    }

    return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn sampleBackground(uv: vec2f, direction: vec3f) -> vec3f {
    let backgroundMode = scene.backgroundParams.x;

    if (backgroundMode < 0.5) {
        return scene.backgroundEmptyColor.xyz;
    }

    if (backgroundMode < 1.5) {
        return sampleGradientBackground(uv);
    }

    return sampleStarField(direction);
}

fn buildOrbitalPlane(localOrigin: vec3f, direction: vec3f) -> OrbitalPlane {
    let radialAxis = normalize(localOrigin);
    let planeNormalCandidate = cross(localOrigin, direction);
    let fallbackAxis = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(radialAxis.y) > 0.9);
    let planeNormal = normalize(
        select(
            planeNormalCandidate,
            cross(radialAxis, fallbackAxis),
            length(planeNormalCandidate) < 1e-6,
        ),
    );
    let tangentialAxis = normalize(cross(planeNormal, radialAxis));

    return OrbitalPlane(radialAxis, tangentialAxis);
}

fn planarGeodesicRay(
    localOrigin: vec3f,
    direction: vec3f,
    orbitalPlane: OrbitalPlane,
    schwarzschildRadius: f32,
    captureRadius: f32,
) -> PlanarGeodesicRay {
    let r = length(localOrigin);
    let dr = dot(direction, orbitalPlane.radialAxis);
    let dphi = dot(direction, orbitalPlane.tangentialAxis) / max(r, 1e-9);
    let rEval = max(r, captureRadius);
    let f = 1.0 - schwarzschildRadius / rEval;
    let dtDλ = sqrt(
        (dr * dr) / (f * f) +
        ((rEval * rEval) * (dphi * dphi)) / f,
    );
    return PlanarGeodesicRay(r, 0.0, dr, dphi, f * dtDλ);
}

fn computePlanarGeodesicDerivatives(
    ray: PlanarGeodesicRay,
    schwarzschildRadius: f32,
    captureRadius: f32,
) -> array<f32, 4> {
    var rhs: array<f32, 4>;
    let r = max(ray.r, captureRadius);
    let dr = ray.dr;
    let dphi = ray.dphi;
    let E = ray.E;
    let f = 1.0 - schwarzschildRadius / r;
    let dtDλ = E / f;

    rhs[0] = dr;
    rhs[1] = dphi;
    rhs[2] = -(schwarzschildRadius / (2.0 * r * r)) * f * (dtDλ * dtDλ)
        + (schwarzschildRadius / (2.0 * r * r * f)) * (dr * dr)
        + (r - schwarzschildRadius) * (dphi * dphi);
    rhs[3] = -2.0 * dr * dphi / r;

    return rhs;
}

fn planarRayWithStep(ray: PlanarGeodesicRay, k: array<f32, 4>, factor: f32) -> PlanarGeodesicRay {
    return PlanarGeodesicRay(
        ray.r + k[0] * factor,
        ray.phi + k[1] * factor,
        ray.dr + k[2] * factor,
        ray.dphi + k[3] * factor,
        ray.E,
    );
}

fn fourthOrderRungeKuttaPlanar(
    ray: PlanarGeodesicRay,
    dλ: f32,
    schwarzschildRadius: f32,
    captureRadius: f32,
) -> PlanarGeodesicRay {
    let k1 = computePlanarGeodesicDerivatives(ray, schwarzschildRadius, captureRadius);
    let k2 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k1, dλ * 0.5), schwarzschildRadius, captureRadius);
    let k3 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k2, dλ * 0.5), schwarzschildRadius, captureRadius);
    let k4 = computePlanarGeodesicDerivatives(planarRayWithStep(ray, k3, dλ), schwarzschildRadius, captureRadius);

    return PlanarGeodesicRay(
        ray.r + (dλ / 6.0) * (k1[0] + 2.0 * k2[0] + 2.0 * k3[0] + k4[0]),
        ray.phi + (dλ / 6.0) * (k1[1] + 2.0 * k2[1] + 2.0 * k3[1] + k4[1]),
        ray.dr + (dλ / 6.0) * (k1[2] + 2.0 * k2[2] + 2.0 * k3[2] + k4[2]),
        ray.dphi + (dλ / 6.0) * (k1[3] + 2.0 * k2[3] + 2.0 * k3[3] + k4[3]),
        ray.E,
    );
}

fn fastGeodesicStepPlanar(
    ray: PlanarGeodesicRay,
    dλ: f32,
    schwarzschildRadius: f32,
    captureRadius: f32,
) -> PlanarGeodesicRay {
    let rhs = computePlanarGeodesicDerivatives(ray, schwarzschildRadius, captureRadius);

    return PlanarGeodesicRay(
        ray.r + dλ * rhs[0],
        ray.phi + dλ * rhs[1],
        ray.dr + dλ * rhs[2],
        ray.dphi + dλ * rhs[3],
        ray.E,
    );
}

fn worldPointPlanar(ray: PlanarGeodesicRay, orbitalPlane: OrbitalPlane, blackholePos: vec3f) -> vec3f {
    let radialComponent = orbitalPlane.radialAxis * (ray.r * cos(ray.phi));
    let tangentialComponent = orbitalPlane.tangentialAxis * (ray.r * sin(ray.phi));
    return blackholePos + radialComponent + tangentialComponent;
}

fn segmentSphereIntersection(
    segmentStart: vec3f,
    segmentEnd: vec3f,
    center: vec3f,
    radius: f32,
    color: vec3f,
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

    return Intersection(true, dist, segmentStart + direction * dist, color);
}

fn sampleDisc(point: vec3f) -> vec3f {
    let local = point - scene.discPos.xyz;
    let radialDist = length(vec2f(local.x, local.z));
    let innerRadius = scene.discParams.x;
    let outerRadius = scene.discParams.y;
    let radialT = clamp((radialDist - innerRadius) / (outerRadius - innerRadius), 0.0, 1.0);
    let innerT = 1.0 - radialT;
    let radialColor = lerpColor(scene.discNearColor.xyz, scene.discFarColor.xyz, radialT);
    return clamp(radialColor + scene.discRadialBoost.xyz * innerT, vec3f(0.0), vec3f(1.0));
}

fn discIntersectionAtPoint(point: vec3f, dist: f32) -> Intersection {
    let local = point - scene.discPos.xyz;
    let radialDist = length(vec2f(local.x, local.z));
    let innerRadius = scene.discParams.x;
    let outerRadius = scene.discParams.y;
    let innerEdgeBias = scene.blackhole.w * 0.1;

    if (
        radialDist < innerRadius + innerEdgeBias ||
        radialDist > outerRadius
    ) {
        return emptyIntersection();
    }

    return Intersection(true, dist, point, sampleDisc(point));
}

fn segmentDiscIntersection(segmentStart: vec3f, segmentEnd: vec3f) -> Intersection {
    if (scene.discParams.z < 0.5) {
        return emptyIntersection();
    }

    let segment = segmentEnd - segmentStart;

    if (abs(segment.y) < 1e-9) {
        return emptyIntersection();
    }

    let t = (scene.discPos.y - segmentStart.y) / segment.y;
    if (t < 0.0 || t > 1.0) {
        return emptyIntersection();
    }

    return discIntersectionAtPoint(segmentStart + segment * t, length(segment) * t);
}

fn raySphereIntersection(rayOrigin: vec3f, rayDirection: vec3f, center: vec3f, radius: f32, color: vec3f) -> Intersection {
    let oc = rayOrigin - center;
    let b = 2.0 * dot(oc, rayDirection);
    let c = dot(oc, oc) - radius * radius;
    let discriminant = b * b - 4.0 * c;

    if (discriminant < 0.0) {
        return emptyIntersection();
    }

    let sqrtDiscriminant = sqrt(discriminant);
    let t1 = (-b - sqrtDiscriminant) * 0.5;
    let t2 = (-b + sqrtDiscriminant) * 0.5;
    var dist = 1e30;

    if (t1 >= 0.0) {
        dist = t1;
    } else if (t2 >= 0.0) {
        dist = t2;
    }

    if (dist == 1e30) {
        return emptyIntersection();
    }

    return Intersection(true, dist, rayOrigin + rayDirection * dist, color);
}

fn rayDiscIntersection(rayOrigin: vec3f, rayDirection: vec3f) -> Intersection {
    if (scene.discParams.z < 0.5) {
        return emptyIntersection();
    }

    if (abs(rayDirection.y) < 1e-9) {
        return emptyIntersection();
    }

    let t = (scene.discPos.y - rayOrigin.y) / rayDirection.y;
    if (t <= 0.0) {
        return emptyIntersection();
    }

    return discIntersectionAtPoint(rayOrigin + rayDirection * t, t);
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

fn traceStraight(rayOrigin: vec3f, rayDirection: vec3f) -> TraceResult {
    let blackholePos = scene.blackhole.xyz;
    let schwarzschildRadius = scene.blackhole.w;
    let shadowRadius = blackholeShadowRadius(schwarzschildRadius);
    let sphereCount = u32(scene.screen.w);

    var hit = emptyIntersection();
    hit = closestIntersection(hit, raySphereIntersection(rayOrigin, rayDirection, blackholePos, shadowRadius, vec3f(0.0)));
    for (var sphereIndex: u32 = 0u; sphereIndex < sphereCount; sphereIndex = sphereIndex + 1u) {
        let sphere = spheres[sphereIndex];
        hit = closestIntersection(
            hit,
            raySphereIntersection(
                rayOrigin,
                rayDirection,
                sphere.posRadius.xyz,
                sphere.posRadius.w,
                sphere.emission.xyz,
            ),
        );
    }
    hit = closestIntersection(hit, rayDiscIntersection(rayOrigin, rayDirection));

    if (!hit.collided) {
        return TraceResult(false, vec3f(0.0));
    }

    return TraceResult(true, hit.color);
}

fn traceGeodesic(rayOrigin: vec3f, rayDirection: vec3f) -> TraceResult {
    let blackholePos = scene.blackhole.xyz;
    let schwarzschildRadius = scene.blackhole.w;
    let captureRadius = schwarzschildRadius * 1.035;
    let sphereCount = u32(scene.screen.w);
    let localOrigin = rayOrigin - blackholePos;
    let orbitalPlane = buildOrbitalPlane(localOrigin, rayDirection);
    var geodesicRay = planarGeodesicRay(localOrigin, rayDirection, orbitalPlane, schwarzschildRadius, captureRadius);

    let dλ: f32 = scene.geodesicParams.x;
    let maxGeodesicSteps: u32 = u32(scene.geodesicParams.y);
    let escapeRadius: f32 = scene.geodesicParams.z * schwarzschildRadius;
    let useRungeKutta = scene.geodesicComputationParams.x > 0.5;
    var previousWorldPoint = rayOrigin;

    for (var stepIndex: u32 = 0u; stepIndex < maxGeodesicSteps; stepIndex = stepIndex + 1u) {
        if (geodesicRay.r <= captureRadius) {
            return TraceResult(true, vec3f(0.0));
        }

        if (useRungeKutta) {
            geodesicRay = fourthOrderRungeKuttaPlanar(geodesicRay, dλ, schwarzschildRadius, captureRadius);
        } else {
            geodesicRay = fastGeodesicStepPlanar(geodesicRay, dλ, schwarzschildRadius, captureRadius);
        }

        if (geodesicRay.r <= captureRadius) {
            return TraceResult(true, vec3f(0.0));
        }

        let currentWorldPoint = worldPointPlanar(geodesicRay, orbitalPlane, blackholePos);

        var hit = emptyIntersection();
        hit = closestIntersection(hit, segmentSphereIntersection(previousWorldPoint, currentWorldPoint, blackholePos, captureRadius, vec3f(0.0)));
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
                ),
            );
        }
        hit = closestIntersection(hit, segmentDiscIntersection(previousWorldPoint, currentWorldPoint));

        if (hit.collided) {
            return TraceResult(true, hit.color);
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
    return vec4f(sampleBackground(in.uv, cameraRayDirection(in.uv)), 1.0);
}

fn cameraRayDirection(uv: vec2f) -> vec3f {
    let width = scene.screen.x;
    let height = scene.screen.y;
    let focalLength = scene.screen.z;

    let x = uv.x * width - width * 0.5;
    let y = uv.y * height - height * 0.5;

    return normalize(
        scene.cameraRight.xyz * x +
        scene.cameraUp.xyz * (-y) +
        scene.cameraForward.xyz * focalLength
    );
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4f {
    let rayDirection = cameraRayDirection(in.uv);

    let useGeodesic = scene.geodesicParams.w > 0.5;
    var result = TraceResult(false, vec3f(0.0));

    if (useGeodesic) {
        result = traceGeodesic(scene.cameraPos.xyz, rayDirection);
    } else {
        result = traceStraight(scene.cameraPos.xyz, rayDirection);
    }

    if (!result.hit) {
        discard;
    }
    return vec4f(result.color, 1.0);
}

@fragment
fn gridFsMain() -> @location(0) vec4f {
    return vec4f(scene.gridLineColor.xyz, 1.0);
}
