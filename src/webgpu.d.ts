declare interface Navigator {
    gpu?: GPU;
}

declare interface GPU {
    requestAdapter(): Promise<GPUAdapter | null>;
    getPreferredCanvasFormat(): GPUTextureFormat;
}

declare interface GPUAdapter {
    requestDevice(): Promise<GPUDevice>;
}

declare interface GPUDevice {
    queue: GPUQueue;
    createShaderModule(descriptor: { code: string }): GPUShaderModule;
    createBuffer(descriptor: { size: number; usage: number }): GPUBuffer;
    createRenderPipeline(descriptor: {
        layout: "auto" | GPUPipelineLayout;
        vertex: {
            module: GPUShaderModule;
            entryPoint: string;
            buffers?: Array<{
                arrayStride: number;
                attributes: Array<{
                    shaderLocation: number;
                    offset: number;
                    format: string;
                }>;
            }>;
        };
        fragment: { module: GPUShaderModule; entryPoint: string; targets: Array<{ format: GPUTextureFormat }> };
        primitive?: { topology?: string };
    }): GPURenderPipeline;
    createBindGroup(descriptor: {
        layout: GPUBindGroupLayout;
        entries: Array<{ binding: number; resource: { buffer: GPUBuffer } }>;
    }): GPUBindGroup;
    createCommandEncoder(): GPUCommandEncoder;
}

declare interface GPUQueue {
    writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: ArrayBufferView | ArrayBufferLike): void;
    submit(commandBuffers: GPUCommandBuffer[]): void;
}

declare interface GPUCanvasContext {
    configure(configuration: {
        device: GPUDevice;
        format: GPUTextureFormat;
        alphaMode?: "opaque" | "premultiplied";
    }): void;
    getCurrentTexture(): GPUTexture;
}

declare interface GPUTexture {
    createView(): GPUTextureView;
}

declare interface GPUShaderModule {}
declare interface GPUBuffer {
    readonly size: number;
}
declare interface GPUPipelineLayout {}
declare interface GPUBindGroupLayout {}
declare interface GPUBindGroup {}
declare interface GPUTextureView {}
declare interface GPUCommandBuffer {}

declare interface GPURenderPipeline {
    getBindGroupLayout(index: number): GPUBindGroupLayout;
}

declare interface GPUCommandEncoder {
    beginRenderPass(descriptor: {
        colorAttachments: Array<{
            view: GPUTextureView;
            clearValue: { r: number; g: number; b: number; a: number };
            loadOp: "clear" | "load";
            storeOp: "store" | "discard";
        }>;
    }): GPURenderPassEncoder;
    finish(): GPUCommandBuffer;
}

declare interface GPURenderPassEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    setVertexBuffer(slot: number, buffer: GPUBuffer): void;
    draw(vertexCount: number): void;
    end(): void;
}

declare type GPUTextureFormat = string;

declare const GPUBufferUsage: {
    readonly UNIFORM: number;
    readonly COPY_DST: number;
    readonly STORAGE: number;
    readonly VERTEX: number;
};
