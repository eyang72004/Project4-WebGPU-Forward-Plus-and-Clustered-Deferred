import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

import { GPUTimer } from '../gpu_timer';


import { benchmarkCollector } from '../benchmark';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution


    gBufferSceneBindGroupLayout: GPUBindGroupLayout;
    gBufferSceneBindGroup: GPUBindGroup;



    fullscreenSceneBindGroupLayout: GPUBindGroupLayout;
    fullscreenSceneBindGroup: GPUBindGroup;


    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;


    screenUniformBuffer: GPUBuffer;


    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;


    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;


    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;



    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;


    gpuTimer: GPUTimer;


    constructor(stage: Stage) {
        super(stage);

        this.gpuTimer = new GPUTimer();

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass



        // Screen resolution used for position reconstruction and cluster lookup in the fullscreen fragment shader
        this.screenUniformBuffer = renderer.device.createBuffer({
            label: "Clustered Deferred screen resolution uniform",
            size: 8, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });



        // G-buffer textures



        this.albedoTexture = renderer.device.createTexture({
            label: "G-buffer albedo texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        // World-space normals require a format that supports negative values
        this.normalTexture = renderer.device.createTexture({
            label: "G-buffer normals",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();




        // Depth is written during the G-buffer pass and read during the fullscreen lighting pass
        this.depthTexture = renderer.device.createTexture({
            label: "G-buffer depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();




        // G-buffer geometry pass bindings




        // Naive vertex shader needs the camera at scene group 0, binding 0
        this.gBufferSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });


        this.gBufferSceneBindGroup = renderer.device.createBindGroup({
            label: "G-buffer scene bind group",
            layout: this.gBufferSceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });


        // Fullscreen lighting pass bindings



        // Matches clustered_deferred_fullscreen.fs.wgsl:
        // 0: camera
        // 1: lights
        // 2: clusters
        // 3: screen resolution
        this.fullscreenSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Clustered Deferred fullscreen scene layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });


        this.fullscreenSceneBindGroup = renderer.device.createBindGroup({
            label: "Clustered Deferred fullscreen scene bind group",
            layout: this.fullscreenSceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.screenUniformBuffer }
                }
            ]
        });




        // Group 1 of fullscreen fragment shader:
        // 0: albedo texture
        // 1: normal texture
        // 2: depth texture
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer texture bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                }
            ]
        });




        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer texture bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.depthTextureView
                }
            ]
        });


        // G-buffer geometry pipeline





        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.gBufferSceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: "rgba8unorm" },
                    { format: "rgba16float" }
                ]
            },
            primitive: {
                topology: "triangle-list",
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            }
        });




        // Fullscreen lighting pipeline





        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Clustered Deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenSceneBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred fullscreen fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            },
            primitive: {
                topology: "triangle-list",
            }
        });
    }







    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations





        renderer.device.queue.writeBuffer(this.screenUniformBuffer, 0, new Float32Array([renderer.canvas.width, renderer.canvas.height]));


        const encoder = renderer.device.createCommandEncoder();


        const measureThisFrame = this.gpuTimer.beginSample();


        const benchmarkSessionId = benchmarkCollector.getSessionId();


        // Pass 1: Light clustering




        // Reuse existing TODO-2 clustering implementation
        this.lights.doLightClustering(encoder, measureThisFrame ? {
            querySet: this.gpuTimer.querySet,
            beginningOfPassWriteIndex: 0
            } : undefined
        );


        // Pass 2: G-buffer geometry rendering


        const gBufferPass = encoder.beginRenderPass({
            label: "Clustered Deferred G-buffer pass",
            colorAttachments: [
                {
                    view: this.albedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });


        gBufferPass.setPipeline(this.gBufferPipeline);

        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferSceneBindGroup);


        // Same geometry iteration as the Naive renderer
        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();




        // Pass 3: Fullscreen lighting


        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const fullscreenPass = encoder.beginRenderPass({
            label: "Clustered Deferred fullscreen lighting pass",
            timestampWrites: measureThisFrame ? {
                querySet: this.gpuTimer.querySet,
                endOfPassWriteIndex: 1
            } : undefined,
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        fullscreenPass.setPipeline(this.fullscreenPipeline);

        fullscreenPass.setBindGroup(0, this.fullscreenSceneBindGroup);

        fullscreenPass.setBindGroup(1, this.gBufferBindGroup);

        // Fullscreen triangle generated by vertex_index
        fullscreenPass.draw(3);


        fullscreenPass.end();

        if (measureThisFrame) {
            this.gpuTimer.resolve(encoder);
        }




        renderer.device.queue.submit([encoder.finish()]);





        if (measureThisFrame) {
            void this.gpuTimer.readMilliseconds().then(milliseconds => {
                if (milliseconds !== null) {
                    // console.log(`Clustered Deferred GPU Time: ${milliseconds.toFixed(3)} ms`);

                    benchmarkCollector.recordForSession(milliseconds, benchmarkSessionId, 'clustered deferred');
                }
            })
            .catch(error => {
                console.error("Error reading Clustered Deferred GPU time:", error);
            });
        }
    }
}
