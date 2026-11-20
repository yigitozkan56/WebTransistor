use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use wgpu::util::DeviceExt;

/// Six-state GPU NodeVoltageBuffer constants matching `GpuNodeVoltage` in `src/engine/gpuSolver.ts`:
/// - `0` = GND / LOW
/// - `1` = VCC / HIGH
/// - `2` = Floating / Z
/// - `3` = WEAK_LOW (PULL_DOWN)
/// - `4` = WEAK_HIGH (PULL_UP)
/// - `5` = ERR (Short-circuit contention)
pub const GPU_VOLTAGE_LOW: u32 = 0;
pub const GPU_VOLTAGE_HIGH: u32 = 1;
pub const GPU_VOLTAGE_Z: u32 = 2;
pub const GPU_VOLTAGE_WEAK_LOW: u32 = 3;
pub const GPU_VOLTAGE_WEAK_HIGH: u32 = 4;
pub const GPU_VOLTAGE_ERR: u32 = 5;

/// WGSL Compute Shader for the Two-Pass Parallel Transistor Solver (Vulkan / DirectX 12 via `wgpu`).
pub const WGSL_TWO_PASS_SOLVER_SHADER: &str = r#"
struct SolverParams {
    transistor_count: u32,
    node_count: u32,
    _pad0: u32,
    _pad1: u32,
};

@group(0) @binding(0) var<uniform> params: SolverParams;
@group(0) @binding(1) var<storage, read> transistors: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> node_voltages: array<u32>;
@group(0) @binding(3) var<storage, read> node_static_mask: array<u32>;
@group(0) @binding(4) var<storage, read_write> node_accum: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> tx_state: array<u32>;

fn node_drive_mask(node_id: u32) -> u32 {
    let s_mask = node_static_mask[node_id];
    if ((s_mask & 3u) != 0u) {
        return s_mask & 3u;
    }
    let v = node_voltages[node_id];
    if (v == 0u) {
        return 16u; // Propagated strong LOW through series chain
    }
    if (v == 1u) {
        return 32u; // Propagated strong HIGH through series chain
    }
    if (v == 3u) {
        return 4u;  // WEAK_LOW
    }
    if (v == 4u) {
        return 8u;  // WEAK_HIGH
    }
    if (v == 5u) {
        return 3u;  // ERR contention
    }
    return s_mask & 12u;
}

@compute @workgroup_size(256)
fn pass1_transistor_eval(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tx_idx = gid.x;
    if (tx_idx >= params.transistor_count) {
        return;
    }

    let tx = transistors[tx_idx];
    let gate_id = tx.x;
    let drain_id = tx.y;
    let source_id = tx.z;
    let tx_type = tx.w; // 0u = NMOS, 1u = PMOS

    let gate_v = node_voltages[gate_id];
    let nmos_on = (tx_type == 0u) && (gate_v == 1u || gate_v == 4u);
    let pmos_on = (tx_type == 1u) && (gate_v == 0u || gate_v == 3u);
    let conducts = nmos_on || pmos_on;

    tx_state[tx_idx] = select(0u, 1u, conducts);

    if (conducts) {
        let src_mask = node_drive_mask(source_id);
        let drn_mask = node_drive_mask(drain_id);
        if (src_mask != 0u) {
            atomicOr(&node_accum[drain_id], src_mask);
        }
        if (drn_mask != 0u) {
            atomicOr(&node_accum[source_id], drn_mask);
        }
    }
}

@compute @workgroup_size(256)
fn pass2_voltage_resolve(@builtin(global_invocation_id) gid: vec3<u32>) {
    let node_id = gid.x;
    if (node_id >= params.node_count) {
        return;
    }

    let accum_mask = atomicExchange(&node_accum[node_id], 0u);
    let mask = node_static_mask[node_id] | accum_mask;

    let strong = mask & 3u;
    if (strong == 3u) {
        node_voltages[node_id] = 5u; // ERR (VCC vs GND short circuit)
        return;
    }
    if (strong == 1u) {
        node_voltages[node_id] = 0u; // GND / LOW
        return;
    }
    if (strong == 2u) {
        node_voltages[node_id] = 1u; // VCC / HIGH
        return;
    }

    let chain = (mask >> 4u) & 3u;
    if (chain == 1u) {
        node_voltages[node_id] = 0u; // Series chain LOW
        return;
    }
    if (chain == 2u) {
        node_voltages[node_id] = 1u; // Series chain HIGH
        return;
    }

    let weak = (mask >> 2u) & 3u;
    if (weak == 1u) {
        node_voltages[node_id] = 3u; // WEAK_LOW
        return;
    }
    if (weak == 2u) {
        node_voltages[node_id] = 4u; // WEAK_HIGH
        return;
    }

    node_voltages[node_id] = 2u; // Floating / Z
}
"#;

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
struct SolverParamsUniform {
    tx_count: u32,
    node_count: u32,
    _pad0: u32,
    _pad1: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HardwareInfo {
    pub backend: String,
    pub adapter_name: String,
    pub is_native_exe: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GpuInitResult {
    pub backend: String,
    pub adapter_name: String,
    pub transistor_count: usize,
    pub node_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GpuStepResult {
    pub node_voltages: Vec<u32>,
    pub tx_states: Vec<u32>,
    pub tick_count: u64,
    pub has_short_circuit: bool,
    pub tps: u64,
}

struct WgpuContext {
    device: wgpu::Device,
    queue: wgpu::Queue,
    adapter_name: String,
    backend_label: String,
    bind_group_layout: wgpu::BindGroupLayout,
    pass1_pipeline: wgpu::ComputePipeline,
    pass2_pipeline: wgpu::ComputePipeline,
}

#[allow(dead_code)]
struct GpuBuffers {
    params_buf: wgpu::Buffer,
    transistor_buf: wgpu::Buffer,
    voltage_buf: wgpu::Buffer,
    static_mask_buf: wgpu::Buffer,
    accum_mask_buf: wgpu::Buffer,
    tx_state_buf: wgpu::Buffer,
    voltage_staging_buf: wgpu::Buffer,
    tx_state_staging_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
}

pub struct NativeParallelSolver {
    wgpu_ctx: Option<WgpuContext>,
    gpu_buffers: Option<GpuBuffers>,
    /// Flat array of `[gate_id, drain_id, source_id, tx_type]` per transistor (stride 4)
    transistors: Vec<u32>,
    static_masks: Vec<u32>,
    node_voltages: Vec<u32>,
    tx_states: Vec<u32>,
    tick_count: u64,
    last_tps: u64,
}

impl Default for NativeParallelSolver {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeParallelSolver {
    pub fn new() -> Self {
        let wgpu_ctx = Self::try_init_wgpu();
        Self {
            wgpu_ctx,
            gpu_buffers: None,
            transistors: Vec::new(),
            static_masks: Vec::new(),
            node_voltages: Vec::new(),
            tx_states: Vec::new(),
            tick_count: 0,
            last_tps: 0,
        }
    }

    fn try_init_wgpu() -> Option<WgpuContext> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::VULKAN | wgpu::Backends::DX12 | wgpu::Backends::PRIMARY,
            ..Default::default()
        });

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }))?;

        let info = adapter.get_info();
        let adapter_name = format!("{} ({:?})", info.name, info.backend);
        let backend_label = "Native Vulkan/DX12 (wgpu)".to_string();

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("PureSilicon wgpu Compute Device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))
        .ok()?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("PureSilicon Two-Pass Parallel Transistor Solver WGSL"),
            source: wgpu::ShaderSource::Wgsl(WGSL_TWO_PASS_SOLVER_SHADER.into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("PureSilicon Solver BindGroupLayout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("PureSilicon Solver PipelineLayout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pass1_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Pass 1: Transistor Evaluation Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("pass1_transistor_eval"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });

        let pass2_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Pass 2: Voltage Resolution Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("pass2_voltage_resolve"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });

        Some(WgpuContext {
            device,
            queue,
            adapter_name,
            backend_label,
            bind_group_layout,
            pass1_pipeline,
            pass2_pipeline,
        })
    }

    pub fn hardware_info(&self) -> HardwareInfo {
        if let Some(ctx) = &self.wgpu_ctx {
            HardwareInfo {
                backend: ctx.backend_label.clone(),
                adapter_name: ctx.adapter_name.clone(),
                is_native_exe: true,
            }
        } else {
            HardwareInfo {
                backend: "Native Vulkan/DX12 (wgpu)".to_string(),
                adapter_name: "Rayon Atomic Parallel CPU Fallback".to_string(),
                is_native_exe: true,
            }
        }
    }

    pub fn init_circuit(
        &mut self,
        transistors: Vec<u32>,
        static_masks: Vec<u32>,
        initial_voltages: Vec<u32>,
    ) -> Result<GpuInitResult, String> {
        if transistors.len() % 4 != 0 {
            return Err(format!(
                "Transistor buffer length ({}) must be a multiple of 4 [gate, drain, source, type]",
                transistors.len()
            ));
        }

        let tx_count = transistors.len() / 4;
        let node_count = static_masks.len().max(initial_voltages.len());

        let mut normalized_static = static_masks;
        normalized_static.resize(node_count, 0);

        let mut normalized_voltages = initial_voltages;
        if normalized_voltages.len() < node_count {
            normalized_voltages.resize(node_count, GPU_VOLTAGE_Z);
            for i in 0..node_count {
                if normalized_voltages[i] == GPU_VOLTAGE_Z && normalized_static[i] != 0 {
                    normalized_voltages[i] = Self::resolve_drive_mask_cpu(normalized_static[i]);
                }
            }
        }

        self.transistors = transistors;
        self.static_masks = normalized_static;
        self.node_voltages = normalized_voltages;
        self.tx_states = vec![0u32; tx_count];
        self.tick_count = 0;

        if let Some(ctx) = &self.wgpu_ctx {
            let safe_tx_data: &[u32] = if self.transistors.is_empty() {
                &[0, 0, 0, 0]
            } else {
                &self.transistors
            };
            let safe_node_voltages: &[u32] = if self.node_voltages.is_empty() {
                &[GPU_VOLTAGE_Z]
            } else {
                &self.node_voltages
            };
            let safe_static_masks: &[u32] = if self.static_masks.is_empty() {
                &[0]
            } else {
                &self.static_masks
            };
            let safe_accum = vec![0u32; node_count.max(1)];
            let safe_tx_states = vec![0u32; tx_count.max(1)];

            let params = SolverParamsUniform {
                tx_count: tx_count as u32,
                node_count: node_count as u32,
                _pad0: 0,
                _pad1: 0,
            };

            let params_buf = ctx
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("SolverParams Buffer"),
                    contents: bytemuck::bytes_of(&params),
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                });

            let transistor_buf =
                ctx.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("Transistor Topology Buffer"),
                        contents: bytemuck::cast_slice(safe_tx_data),
                        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    });

            let voltage_buf = ctx
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Node Voltage Buffer"),
                    contents: bytemuck::cast_slice(safe_node_voltages),
                    usage: wgpu::BufferUsages::STORAGE
                        | wgpu::BufferUsages::COPY_SRC
                        | wgpu::BufferUsages::COPY_DST,
                });

            let static_mask_buf =
                ctx.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("Node Static Mask Buffer"),
                        contents: bytemuck::cast_slice(safe_static_masks),
                        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    });

            let accum_mask_buf =
                ctx.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("Node Atomic Accumulator Buffer"),
                        contents: bytemuck::cast_slice(&safe_accum),
                        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
                    });

            let tx_state_buf = ctx
                .device
                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("Transistor State Buffer"),
                    contents: bytemuck::cast_slice(&safe_tx_states),
                    usage: wgpu::BufferUsages::STORAGE
                        | wgpu::BufferUsages::COPY_SRC
                        | wgpu::BufferUsages::COPY_DST,
                });

            let voltage_staging_buf = ctx.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Voltage Readback Staging Buffer"),
                size: (safe_node_voltages.len() * std::mem::size_of::<u32>()) as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });

            let tx_state_staging_buf = ctx.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("TxState Readback Staging Buffer"),
                size: (safe_tx_states.len() * std::mem::size_of::<u32>()) as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            });

            let bind_group = ctx.device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("PureSilicon Solver BindGroup"),
                layout: &ctx.bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: params_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: transistor_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: voltage_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: static_mask_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: accum_mask_buf.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: tx_state_buf.as_entire_binding(),
                    },
                ],
            });

            self.gpu_buffers = Some(GpuBuffers {
                params_buf,
                transistor_buf,
                voltage_buf,
                static_mask_buf,
                accum_mask_buf,
                tx_state_buf,
                voltage_staging_buf,
                tx_state_staging_buf,
                bind_group,
            });
        }

        let hw = self.hardware_info();
        Ok(GpuInitResult {
            backend: hw.backend,
            adapter_name: hw.adapter_name,
            transistor_count: tx_count,
            node_count,
        })
    }

    pub fn step_batch(&mut self, ticks: u32) -> Result<GpuStepResult, String> {
        let step_ticks = ticks.max(1);
        let start = Instant::now();

        let tx_count = self.transistors.len() / 4;
        let node_count = self.node_voltages.len();

        if tx_count > 0 && node_count > 0 {
            if self.wgpu_ctx.is_some() && self.gpu_buffers.is_some() {
                self.step_batch_wgpu(step_ticks)?;
            } else {
                self.step_batch_cpu_parallel(step_ticks);
            }
        }

        self.tick_count += step_ticks as u64;
        let elapsed_secs = start.elapsed().as_secs_f64();
        let tps = if elapsed_secs > 1e-9 {
            ((step_ticks as f64) / elapsed_secs).round() as u64
        } else {
            self.last_tps
        };
        self.last_tps = tps;

        let has_short_circuit = self.node_voltages.iter().any(|&v| v == GPU_VOLTAGE_ERR);

        Ok(GpuStepResult {
            node_voltages: self.node_voltages.clone(),
            tx_states: self.tx_states.clone(),
            tick_count: self.tick_count,
            has_short_circuit,
            tps,
        })
    }

    fn step_batch_wgpu(&mut self, ticks: u32) -> Result<(), String> {
        let ctx = self.wgpu_ctx.as_ref().ok_or("wgpu context not initialized")?;
        let bufs = self.gpu_buffers.as_ref().ok_or("GPU buffers not initialized")?;

        let tx_count = (self.transistors.len() / 4) as u32;
        let node_count = self.node_voltages.len() as u32;
        let tx_workgroups = tx_count.div_ceil(256).max(1);
        let node_workgroups = node_count.div_ceil(256).max(1);

        let mut encoder = ctx
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("PureSilicon Batch Step CommandEncoder"),
            });

        for _ in 0..ticks {
            {
                let mut cpass1 = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                    label: Some("Pass 1: Transistor Evaluation"),
                    timestamp_writes: None,
                });
                cpass1.set_pipeline(&ctx.pass1_pipeline);
                cpass1.set_bind_group(0, &bufs.bind_group, &[]);
                cpass1.dispatch_workgroups(tx_workgroups, 1, 1);
            }
            {
                let mut cpass2 = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                    label: Some("Pass 2: Voltage Resolution"),
                    timestamp_writes: None,
                });
                cpass2.set_pipeline(&ctx.pass2_pipeline);
                cpass2.set_bind_group(0, &bufs.bind_group, &[]);
                cpass2.dispatch_workgroups(node_workgroups, 1, 1);
            }
        }

        let node_len = self.node_voltages.len();
        let tx_len = self.tx_states.len();
        let voltage_bytes = (node_len * std::mem::size_of::<u32>()) as u64;
        let tx_state_bytes = (tx_len * std::mem::size_of::<u32>()) as u64;

        encoder.copy_buffer_to_buffer(
            &bufs.voltage_buf,
            0,
            &bufs.voltage_staging_buf,
            0,
            voltage_bytes,
        );
        encoder.copy_buffer_to_buffer(
            &bufs.tx_state_buf,
            0,
            &bufs.tx_state_staging_buf,
            0,
            tx_state_bytes,
        );

        ctx.queue.submit(Some(encoder.finish()));

        let v_slice = bufs.voltage_staging_buf.slice(..);
        let t_slice = bufs.tx_state_staging_buf.slice(..);
        v_slice.map_async(wgpu::MapMode::Read, |_| {});
        t_slice.map_async(wgpu::MapMode::Read, |_| {});
        ctx.device.poll(wgpu::Maintain::Wait);

        {
            let v_data = v_slice.get_mapped_range();
            let v_u32: &[u32] = bytemuck::cast_slice(&v_data);
            self.node_voltages.copy_from_slice(&v_u32[..node_len]);
        }
        {
            let t_data = t_slice.get_mapped_range();
            let t_u32: &[u32] = bytemuck::cast_slice(&t_data);
            self.tx_states.copy_from_slice(&t_u32[..tx_len]);
        }

        bufs.voltage_staging_buf.unmap();
        bufs.tx_state_staging_buf.unmap();

        Ok(())
    }

    /// Lock-free Multi-Threaded Atomic Two-Pass Parallel Transistor Solver (Rayon CPU fallback).
    pub fn step_batch_cpu_parallel(&mut self, ticks: u32) {
        let tx_count = self.transistors.len() / 4;
        let node_count = self.node_voltages.len();
        if tx_count == 0 || node_count == 0 {
            return;
        }

        let accum: Vec<AtomicU32> = (0..node_count).map(|_| AtomicU32::new(0)).collect();

        for _ in 0..ticks {
            let voltages = &self.node_voltages;
            let static_masks = &self.static_masks;
            let transistors = &self.transistors;

            // Pass 1: Parallel Transistor Gate Evaluation & Atomic Source/Drain Drive Propagation
            self.tx_states
                .par_iter_mut()
                .enumerate()
                .for_each(|(tx_idx, state_out)| {
                    let base = tx_idx * 4;
                    let gate_id = transistors[base] as usize;
                    let drain_id = transistors[base + 1] as usize;
                    let source_id = transistors[base + 2] as usize;
                    let tx_type = transistors[base + 3];

                    if gate_id >= node_count || drain_id >= node_count || source_id >= node_count {
                        *state_out = 0;
                        return;
                    }

                    let gate_v = voltages[gate_id];
                    let conducts = if tx_type == 0 {
                        gate_v == GPU_VOLTAGE_HIGH || gate_v == GPU_VOLTAGE_WEAK_HIGH
                    } else {
                        gate_v == GPU_VOLTAGE_LOW || gate_v == GPU_VOLTAGE_WEAK_LOW
                    };

                    if conducts {
                        *state_out = 1;
                        let src_mask =
                            Self::compute_node_drive_mask_cpu(source_id, static_masks, voltages);
                        let drn_mask =
                            Self::compute_node_drive_mask_cpu(drain_id, static_masks, voltages);
                        if src_mask != 0 {
                            accum[drain_id].fetch_or(src_mask, Ordering::Relaxed);
                        }
                        if drn_mask != 0 {
                            accum[source_id].fetch_or(drn_mask, Ordering::Relaxed);
                        }
                    } else {
                        *state_out = 0;
                    }
                });

            // Pass 2: Parallel Node Voltage Resolution & Contention (ERR) Detection
            self.node_voltages
                .par_iter_mut()
                .enumerate()
                .for_each(|(node_id, v_out)| {
                    let dynamic_mask = accum[node_id].swap(0, Ordering::Relaxed);
                    let combined = static_masks[node_id] | dynamic_mask;
                    *v_out = Self::resolve_drive_mask_cpu(combined);
                });
        }
    }

    #[inline]
    pub fn compute_node_drive_mask_cpu(
        node_id: usize,
        static_masks: &[u32],
        voltages: &[u32],
    ) -> u32 {
        let s_mask = static_masks[node_id];
        if (s_mask & 3) != 0 {
            return s_mask & 3;
        }
        match voltages[node_id] {
            GPU_VOLTAGE_LOW => 16,      // Propagated strong LOW through series chain
            GPU_VOLTAGE_HIGH => 32,     // Propagated strong HIGH through series chain
            GPU_VOLTAGE_WEAK_LOW => 4,  // WEAK_LOW
            GPU_VOLTAGE_WEAK_HIGH => 8, // WEAK_HIGH
            GPU_VOLTAGE_ERR => 3,       // ERR contention
            _ => s_mask & 12,
        }
    }

    #[inline]
    pub fn resolve_drive_mask_cpu(mask: u32) -> u32 {
        let strong = mask & 3;
        if strong == 3 {
            return GPU_VOLTAGE_ERR;
        }
        if strong == 1 {
            return GPU_VOLTAGE_LOW;
        }
        if strong == 2 {
            return GPU_VOLTAGE_HIGH;
        }

        let chain = (mask >> 4) & 3;
        if chain == 1 {
            return GPU_VOLTAGE_LOW;
        }
        if chain == 2 {
            return GPU_VOLTAGE_HIGH;
        }

        let weak = (mask >> 2) & 3;
        if weak == 1 {
            return GPU_VOLTAGE_WEAK_LOW;
        }
        if weak == 2 {
            return GPU_VOLTAGE_WEAK_HIGH;
        }

        GPU_VOLTAGE_Z
    }
}

static GLOBAL_SOLVER: OnceLock<Mutex<NativeParallelSolver>> = OnceLock::new();

fn solver_instance() -> &'static Mutex<NativeParallelSolver> {
    GLOBAL_SOLVER.get_or_init(|| Mutex::new(NativeParallelSolver::new()))
}

#[tauri::command]
pub fn gpu_get_hardware_info() -> HardwareInfo {
    match solver_instance().lock() {
        Ok(guard) => guard.hardware_info(),
        Err(_) => HardwareInfo {
            backend: "Native Vulkan/DX12 (wgpu)".to_string(),
            adapter_name: "PureSilicon Native GPU Adapter".to_string(),
            is_native_exe: true,
        },
    }
}

#[tauri::command]
pub fn gpu_init_circuit(
    transistors: Vec<u32>,
    static_masks: Vec<u32>,
    initial_voltages: Vec<u32>,
) -> Result<GpuInitResult, String> {
    let mut guard = solver_instance()
        .lock()
        .map_err(|_| "Failed to lock NativeParallelSolver mutex".to_string())?;
    guard.init_circuit(transistors, static_masks, initial_voltages)
}

#[tauri::command]
pub fn gpu_step_batch(ticks: u32) -> Result<GpuStepResult, String> {
    let mut guard = solver_instance()
        .lock()
        .map_err(|_| "Failed to lock NativeParallelSolver mutex".to_string())?;
    guard.step_batch(ticks)
}
