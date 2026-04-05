struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
};

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2f, 3>(
        vec2f(-1.0, -3.0),
        vec2f(-1.0, 1.0),
        vec2f(3.0, 1.0),
    );

    var output: VertexOutput;
    let position = positions[vertexIndex];
    output.position = vec4f(position, 0.0, 1.0);
    output.uv = position * 0.5 + vec2f(0.5, 0.5);
    return output;
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

fn lerpColor(start: vec3f, finish: vec3f, t: f32) -> vec3f {
    return vec3f(
        lerp(start.x, finish.x, t),
        lerp(start.y, finish.y, t),
        lerp(start.z, finish.z, t),
    );
}

@fragment
fn fsMain(input: VertexOutput) -> @location(0) vec4f {
    let topLeft = vec3f(1.0, 48.0 / 255.0, 48.0 / 255.0);
    let topRight = vec3f(1.0, 220.0 / 255.0, 0.0);
    let bottomLeft = vec3f(0.0, 140.0 / 255.0, 1.0);
    let bottomRight = vec3f(160.0 / 255.0, 0.0, 1.0);

    let u = input.uv.x;
    let v = input.uv.y;

    let top = lerpColor(topLeft, topRight, u);
    let bottom = lerpColor(bottomLeft, bottomRight, u);
    let color = lerpColor(bottom, top, v);

    return vec4f(color, 1.0);
}
