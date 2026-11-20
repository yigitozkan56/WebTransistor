import {
  LogicValue,
  type CircuitDocument,
  type ComputeBackendType,
  type GpuFlatBuffers,
  type SimulationSnapshot,
} from '../types/circuit';
import type { ISimulator } from '../types/ui';
import {
  GPU_VOLTAGE_TO_LOGIC,
  LOGIC_TO_GPU_VOLTAGE,
  Simulator,
} from './simulator';

export { GPU_VOLTAGE_TO_LOGIC, LOGIC_TO_GPU_VOLTAGE };

/**
 * GPU NodeVoltageBuffer encoding used by WGSL and Tauri wgpu compute shaders:
 * - `0u` = GND / LOW
 * - `1u` = VCC / HIGH
 * - `2u` = Floating / Z
 * - `3u` = WEAK_LOW (PULL_DOWN)
 * - `4u` = WEAK_HIGH (PULL_UP)
 * - `5u` = ERR (Short-circuit contention)
 */
export const GpuNodeVoltage = {
  LOW: 0,
  HIGH: 1,
  Z: 2,
  WEAK_LOW: 3,
  WEAK_HIGH: 4,
  ERR: 5,
} as const;

export type GpuNodeVoltage = (typeof GpuNodeVoltage)[keyof typeof GpuNodeVoltage];

/**
 * WebGPU WGSL Two-Pass Parallel Transistor Solver Compute Shader.
 *
 * - Pass 1 (`pass1_transistor_eval`, `@compute @workgroup_size(256)`):
 *   Evaluates 1,000,000+ physical NMOS/PMOS transistors in parallel.
 *   Reads `transistors: array<vec4<u32>>` (`[gate_node_id, drain_node_id, source_node_id, tx_type]`)
 *   and `node_voltages: array<u32>`. Writes conduction state (`0u` or `1u`) to `tx_state[tx_idx]`
 *   and atomically accumulates source/drain drive masks into `node_accum` via `atomicOr`.
 *
 * - Pass 2 (`pass2_voltage_resolve`, `@compute @workgroup_size(256)`):
 *   Resolves each node in parallel by combining `node_static_mask[node_id]` with
 *   `atomicExchange(&node_accum[node_id], 0u)`, resolving short-circuit contentions (`ERR = 5u`),
 *   strong rails (`LOW = 0u`, `HIGH = 1u`), series pass-transistor chains, weak pull resistors
 *   (`WEAK_LOW = 3u`, `WEAK_HIGH = 4u`), or floating high-impedance (`Z = 2u`).
 */
export const WGSL_TWO_PASS_SOLVER_SHADER = /* wgsl */ `
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
`;

/**
 * Helper computing a node's outgoing drive mask in Pass 1 (matches WGSL `node_drive_mask`).
 */
export function computeNodeDriveMask(
  nodeId: number,
  nodeStaticMaskBuffer: Uint32Array,
  nodeVoltageBuffer: Uint32Array,
): number {
  const sMask = nodeStaticMaskBuffer[nodeId];
  if ((sMask & 3) !== 0) {
    return sMask & 3;
  }
  const v = nodeVoltageBuffer[nodeId];
  if (v === 0) return 16; // CHAIN_LOW
  if (v === 1) return 32; // CHAIN_HIGH
  if (v === 3) return 4;  // WEAK_LOW
  if (v === 4) return 8;  // WEAK_HIGH
  if (v === 5) return 3;  // ERR
  return sMask & 12;
}

/**
 * Resolves a combined 6-bit drive mask into a GpuNodeVoltage state in Pass 2 (matches WGSL `pass2_voltage_resolve`).
 */
export function resolveMaskToGpuVoltage(mask: number): GpuNodeVoltage {
  const strong = mask & 3;
  if (strong === 3) return GpuNodeVoltage.ERR;
  if (strong === 1) return GpuNodeVoltage.LOW;
  if (strong === 2) return GpuNodeVoltage.HIGH;

  const chain = (mask >>> 4) & 3;
  if (chain === 1) return GpuNodeVoltage.LOW;
  if (chain === 2) return GpuNodeVoltage.HIGH;

  const weak = (mask >>> 2) & 3;
  if (weak === 1) return GpuNodeVoltage.WEAK_LOW;
  if (weak === 2) return GpuNodeVoltage.WEAK_HIGH;

  return GpuNodeVoltage.Z;
}

/**
 * Executes one deterministic Two-Pass Parallel evaluation (Pass 1 Transistor Eval + Pass 2 Voltage Resolve)
 * directly on flat `Uint32Array` GPU buffers.
 * Returns true if any node resolved to `GpuNodeVoltage.ERR` (5).
 */
export function executeTwoPassParallelStepCpu(
  transistorCount: number,
  nodeCount: number,
  transistorBuffer: Uint32Array,
  nodeVoltageBuffer: Uint32Array,
  nodeStaticMaskBuffer: Uint32Array,
  nodeAccumMaskBuffer: Uint32Array,
  txStateBuffer: Uint32Array,
): boolean {
  // Pass 1: Parallel Transistor Evaluation
  for (let txIdx = 0; txIdx < transistorCount; txIdx++) {
    const base = txIdx << 2;
    const gateId = transistorBuffer[base];
    const drainId = transistorBuffer[base + 1];
    const sourceId = transistorBuffer[base + 2];
    const txType = transistorBuffer[base + 3];

    const gateV = nodeVoltageBuffer[gateId];
    const conducts =
      txType === 0
        ? gateV === 1 || gateV === 4
        : gateV === 0 || gateV === 3;

    if (conducts) {
      txStateBuffer[txIdx] = 1;
      const srcMask = computeNodeDriveMask(sourceId, nodeStaticMaskBuffer, nodeVoltageBuffer);
      const drnMask = computeNodeDriveMask(drainId, nodeStaticMaskBuffer, nodeVoltageBuffer);
      if (srcMask !== 0) {
        nodeAccumMaskBuffer[drainId] |= srcMask;
      }
      if (drnMask !== 0) {
        nodeAccumMaskBuffer[sourceId] |= drnMask;
      }
    } else {
      txStateBuffer[txIdx] = 0;
    }
  }

  // Pass 2: Parallel Node Voltage Resolution
  let hasErr = false;
  for (let nodeId = 0; nodeId < nodeCount; nodeId++) {
    const accum = nodeAccumMaskBuffer[nodeId];
    nodeAccumMaskBuffer[nodeId] = 0;
    const mask = nodeStaticMaskBuffer[nodeId] | accum;
    const resolved = resolveMaskToGpuVoltage(mask);
    nodeVoltageBuffer[nodeId] = resolved;
    if (resolved === 5) {
      hasErr = true;
    }
  }

  return hasErr;
}

// Minimal WebGPU types for strict TypeScript compilation without external @webgpu/types dependency
const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const GPU_MAP_MODE_READ = 0x0001;

interface GpuBufferLike {
  size: number;
  destroy(): void;
  mapAsync(mode: number, offset?: number, size?: number): Promise<void>;
  getMappedRange(offset?: number, size?: number): ArrayBuffer;
  unmap(): void;
}

interface GpuComputePassEncoderLike {
  setPipeline(pipeline: unknown): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void;
  end(): void;
}

interface GpuCommandEncoderLike {
  beginComputePass(): GpuComputePassEncoderLike;
  copyBufferToBuffer(
    source: GpuBufferLike,
    sourceOffset: number,
    destination: GpuBufferLike,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): unknown;
}

interface GpuDeviceLike {
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: {
    layout: 'auto';
    compute: { module: unknown; entryPoint: string };
  }): { getBindGroupLayout(index: number): unknown };
  createBindGroupLayout(descriptor: {
    entries: Array<{
      binding: number;
      visibility: number;
      buffer: { type: 'uniform' | 'storage' | 'read-only-storage' };
    }>;
  }): unknown;
  createPipelineLayout(descriptor: { bindGroupLayouts: unknown[] }): unknown;
  createBuffer(descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
  }): GpuBufferLike;
  createBindGroup(descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: GpuBufferLike } }>;
  }): unknown;
  createCommandEncoder(): GpuCommandEncoderLike;
  queue: {
    writeBuffer(
      buffer: GpuBufferLike,
      bufferOffset: number,
      data: Uint32Array | ArrayBufferView | ArrayBuffer,
      dataOffset?: number,
      size?: number,
    ): void;
    submit(commandBuffers: unknown[]): void;
  };
}

interface GpuAdapterLike {
  info?: { device?: string; description?: string; vendor?: string; architecture?: string };
  requestAdapterInfo?: () => Promise<{ device?: string; description?: string; vendor?: string }>;
  requestDevice(): Promise<GpuDeviceLike>;
}

/**
 * WebGPU Hardware Compute Engine dispatching `WGSL_TWO_PASS_SOLVER_SHADER` (`pass1_transistor_eval`
 * and `pass2_voltage_resolve`) on GPU storage buffers.
 */
export class WebGpuComputeEngine {
  private device: GpuDeviceLike | null = null;
  private adapterName = 'WebGPU Adapter';
  private pass1Pipeline: unknown = null;
  private pass2Pipeline: unknown = null;
  private bindGroupLayout: unknown = null;
  private bindGroup: unknown = null;

  private paramsBuffer: GpuBufferLike | null = null;
  private transistorGpuBuffer: GpuBufferLike | null = null;
  private nodeVoltageGpuBuffer: GpuBufferLike | null = null;
  private nodeStaticMaskGpuBuffer: GpuBufferLike | null = null;
  private nodeAccumGpuBuffer: GpuBufferLike | null = null;
  private txStateGpuBuffer: GpuBufferLike | null = null;
  private readbackVoltageBuffer: GpuBufferLike | null = null;
  private readbackTxStateBuffer: GpuBufferLike | null = null;

  private transistorCount = 0;
  private nodeCount = 0;
  private ready = false;
  private busy = false;

  static isWebGpuSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      (navigator as unknown as { gpu?: unknown }).gpu !== undefined
    );
  }

  async init(): Promise<boolean> {
    if (!WebGpuComputeEngine.isWebGpuSupported()) return false;
    try {
      const navGpu = (
        navigator as unknown as {
          gpu: {
            requestAdapter(opts?: { powerPreference?: string }): Promise<GpuAdapterLike | null>;
          };
        }
      ).gpu;

      const adapter = await navGpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return false;

      if (adapter.info) {
        this.adapterName =
          adapter.info.description ||
          adapter.info.device ||
          adapter.info.vendor ||
          'WebGPU High-Performance GPU';
      } else if (typeof adapter.requestAdapterInfo === 'function') {
        try {
          const info = await adapter.requestAdapterInfo();
          this.adapterName =
            info.description || info.device || info.vendor || 'WebGPU High-Performance GPU';
        } catch {
          this.adapterName = 'WebGPU Compute Adapter';
        }
      }

      const device = await adapter.requestDevice();
      const shaderModule = device.createShaderModule({
        code: WGSL_TWO_PASS_SOLVER_SHADER,
      });

      const COMPUTE_STAGE = 4; // GPUShaderStage.COMPUTE
      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: COMPUTE_STAGE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: COMPUTE_STAGE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: COMPUTE_STAGE, buffer: { type: 'storage' } },
          { binding: 3, visibility: COMPUTE_STAGE, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: COMPUTE_STAGE, buffer: { type: 'storage' } },
          { binding: 5, visibility: COMPUTE_STAGE, buffer: { type: 'storage' } },
        ],
      });

      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      });

      const createPipeline = (
        device as unknown as {
          createComputePipeline(desc: {
            layout: unknown;
            compute: { module: unknown; entryPoint: string };
          }): unknown;
        }
      ).createComputePipeline.bind(device);

      this.pass1Pipeline = createPipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'pass1_transistor_eval',
        },
      });

      this.pass2Pipeline = createPipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: 'pass2_voltage_resolve',
        },
      });

      this.device = device;
      this.bindGroupLayout = bindGroupLayout;
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  isReady(): boolean {
    return this.ready && this.device !== null;
  }

  getAdapterName(): string {
    return this.adapterName;
  }

  uploadCircuit(buffers: GpuFlatBuffers): void {
    if (!this.device || !this.bindGroupLayout) return;

    this.destroyBuffers();

    const txCount = Math.floor(buffers.transistorBuffer.length / 4);
    const nodeCount = buffers.nodeVoltageBuffer.length;
    this.transistorCount = txCount;
    this.nodeCount = nodeCount;

    const txByteLen = Math.max(16, buffers.transistorBuffer.byteLength);
    const nodeByteLen = Math.max(4, buffers.nodeVoltageBuffer.byteLength);
    const txStateByteLen = Math.max(4, txCount * 4);

    this.paramsBuffer = this.device.createBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const paramsData = new Uint32Array([txCount, nodeCount, 0, 0]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);

    this.transistorGpuBuffer = this.device.createBuffer({
      size: txByteLen,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    if (buffers.transistorBuffer.byteLength > 0) {
      this.device.queue.writeBuffer(this.transistorGpuBuffer, 0, buffers.transistorBuffer);
    }

    this.nodeVoltageGpuBuffer = this.device.createBuffer({
      size: nodeByteLen,
      usage:
        GPU_BUFFER_USAGE.STORAGE |
        GPU_BUFFER_USAGE.COPY_DST |
        GPU_BUFFER_USAGE.COPY_SRC,
    });
    if (buffers.nodeVoltageBuffer.byteLength > 0) {
      this.device.queue.writeBuffer(this.nodeVoltageGpuBuffer, 0, buffers.nodeVoltageBuffer);
    }

    this.nodeStaticMaskGpuBuffer = this.device.createBuffer({
      size: nodeByteLen,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    if (buffers.nodeStaticMaskBuffer.byteLength > 0) {
      this.device.queue.writeBuffer(this.nodeStaticMaskGpuBuffer, 0, buffers.nodeStaticMaskBuffer);
    }

    this.nodeAccumGpuBuffer = this.device.createBuffer({
      size: nodeByteLen,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });

    this.txStateGpuBuffer = this.device.createBuffer({
      size: txStateByteLen,
      usage:
        GPU_BUFFER_USAGE.STORAGE |
        GPU_BUFFER_USAGE.COPY_DST |
        GPU_BUFFER_USAGE.COPY_SRC,
    });

    this.readbackVoltageBuffer = this.device.createBuffer({
      size: nodeByteLen,
      usage: GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.MAP_READ,
    });

    this.readbackTxStateBuffer = this.device.createBuffer({
      size: txStateByteLen,
      usage: GPU_BUFFER_USAGE.COPY_DST | GPU_BUFFER_USAGE.MAP_READ,
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.transistorGpuBuffer } },
        { binding: 2, resource: { buffer: this.nodeVoltageGpuBuffer } },
        { binding: 3, resource: { buffer: this.nodeStaticMaskGpuBuffer } },
        { binding: 4, resource: { buffer: this.nodeAccumGpuBuffer } },
        { binding: 5, resource: { buffer: this.txStateGpuBuffer } },
      ],
    });
  }

  updateStaticMasks(nodeStaticMaskBuffer: Uint32Array, nodeVoltageBuffer?: Uint32Array): void {
    if (!this.device || !this.nodeStaticMaskGpuBuffer) return;
    if (nodeStaticMaskBuffer.byteLength > 0) {
      this.device.queue.writeBuffer(this.nodeStaticMaskGpuBuffer, 0, nodeStaticMaskBuffer);
    }
    if (nodeVoltageBuffer && this.nodeVoltageGpuBuffer && nodeVoltageBuffer.byteLength > 0) {
      this.device.queue.writeBuffer(this.nodeVoltageGpuBuffer, 0, nodeVoltageBuffer);
    }
  }

  async stepBatchAsync(
    ticks: number,
  ): Promise<{ nodeVoltages: Uint32Array; txStates: Uint32Array } | null> {
    if (
      !this.device ||
      !this.bindGroup ||
      !this.pass1Pipeline ||
      !this.pass2Pipeline ||
      !this.nodeVoltageGpuBuffer ||
      !this.txStateGpuBuffer ||
      !this.readbackVoltageBuffer ||
      !this.readbackTxStateBuffer ||
      this.busy
    ) {
      return null;
    }

    if (this.transistorCount === 0 || this.nodeCount === 0) {
      return {
        nodeVoltages: new Uint32Array(this.nodeCount),
        txStates: new Uint32Array(this.transistorCount),
      };
    }

    this.busy = true;
    try {
      const txWorkgroups = Math.ceil(this.transistorCount / 256);
      const nodeWorkgroups = Math.ceil(this.nodeCount / 256);
      const encoder = this.device.createCommandEncoder();

      const steps = Math.max(1, Math.min(ticks, 256));
      for (let i = 0; i < steps; i++) {
        const pass1 = encoder.beginComputePass();
        pass1.setPipeline(this.pass1Pipeline);
        pass1.setBindGroup(0, this.bindGroup);
        pass1.dispatchWorkgroups(txWorkgroups);
        pass1.end();

        const pass2 = encoder.beginComputePass();
        pass2.setPipeline(this.pass2Pipeline);
        pass2.setBindGroup(0, this.bindGroup);
        pass2.dispatchWorkgroups(nodeWorkgroups);
        pass2.end();
      }

      const nodeByteLen = this.nodeCount * 4;
      const txByteLen = this.transistorCount * 4;

      encoder.copyBufferToBuffer(
        this.nodeVoltageGpuBuffer,
        0,
        this.readbackVoltageBuffer,
        0,
        nodeByteLen,
      );
      encoder.copyBufferToBuffer(
        this.txStateGpuBuffer,
        0,
        this.readbackTxStateBuffer,
        0,
        txByteLen,
      );

      this.device.queue.submit([encoder.finish()]);

      await Promise.all([
        this.readbackVoltageBuffer.mapAsync(GPU_MAP_MODE_READ, 0, nodeByteLen),
        this.readbackTxStateBuffer.mapAsync(GPU_MAP_MODE_READ, 0, txByteLen),
      ]);

      const nodeVoltages = new Uint32Array(
        this.readbackVoltageBuffer.getMappedRange(0, nodeByteLen).slice(0),
      );
      const txStates = new Uint32Array(
        this.readbackTxStateBuffer.getMappedRange(0, txByteLen).slice(0),
      );

      this.readbackVoltageBuffer.unmap();
      this.readbackTxStateBuffer.unmap();

      return { nodeVoltages, txStates };
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }

  private destroyBuffers(): void {
    this.paramsBuffer?.destroy();
    this.transistorGpuBuffer?.destroy();
    this.nodeVoltageGpuBuffer?.destroy();
    this.nodeStaticMaskGpuBuffer?.destroy();
    this.nodeAccumGpuBuffer?.destroy();
    this.txStateGpuBuffer?.destroy();
    this.readbackVoltageBuffer?.destroy();
    this.readbackTxStateBuffer?.destroy();

    this.paramsBuffer = null;
    this.transistorGpuBuffer = null;
    this.nodeVoltageGpuBuffer = null;
    this.nodeStaticMaskGpuBuffer = null;
    this.nodeAccumGpuBuffer = null;
    this.txStateGpuBuffer = null;
    this.readbackVoltageBuffer = null;
    this.readbackTxStateBuffer = null;
    this.bindGroup = null;
  }

  destroy(): void {
    this.destroyBuffers();
    this.ready = false;
  }
}

export interface TauriHardwareInfo {
  backend?: string;
  adapter_name?: string;
  adapterName?: string;
  is_native_exe?: boolean;
}

export interface TauriGpuStepResult {
  node_voltages?: number[];
  nodeVoltages?: number[];
  tx_states?: number[];
  txStates?: number[];
  tick_count?: number;
  tickCount?: number;
  has_short_circuit?: boolean;
  hasShortCircuit?: boolean;
  tps?: number;
}

type TauriInvokeFn = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Native Tauri v2 Rust `wgpu` (Vulkan / DirectX 12 / Metal) IPC Bridge.
 */
export class TauriNativeGpuBridge {
  private invokeFn: TauriInvokeFn | null = null;
  private adapterName = 'Native Vulkan/DX12 (wgpu)';

  constructor() {
    this.invokeFn = TauriNativeGpuBridge.resolveInvoke();
  }

  static isTauriEnvironment(): boolean {
    return TauriNativeGpuBridge.resolveInvoke() !== null;
  }

  private static resolveInvoke(): TauriInvokeFn | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: TauriInvokeFn };
      __TAURI__?: { core?: { invoke?: TauriInvokeFn }; invoke?: TauriInvokeFn };
    };
    if (typeof w.__TAURI_INTERNALS__?.invoke === 'function') {
      return w.__TAURI_INTERNALS__.invoke.bind(w.__TAURI_INTERNALS__);
    }
    if (typeof w.__TAURI__?.core?.invoke === 'function') {
      return w.__TAURI__.core.invoke.bind(w.__TAURI__.core);
    }
    if (typeof w.__TAURI__?.invoke === 'function') {
      return w.__TAURI__.invoke.bind(w.__TAURI__);
    }
    return null;
  }

  isAvailable(): boolean {
    return this.invokeFn !== null;
  }

  getAdapterName(): string {
    return this.adapterName;
  }

  async queryHardwareInfo(): Promise<TauriHardwareInfo | null> {
    if (!this.invokeFn) return null;
    try {
      const info = await this.invokeFn<TauriHardwareInfo>('gpu_get_hardware_info');
      if (info) {
        this.adapterName =
          info.adapter_name || info.adapterName || info.backend || 'Native Vulkan/DX12 (wgpu)';
      }
      return info;
    } catch {
      return null;
    }
  }

  async initCircuit(buffers: GpuFlatBuffers): Promise<boolean> {
    if (!this.invokeFn) return false;
    try {
      const transistors = Array.from(buffers.transistorBuffer);
      const staticMasks = Array.from(buffers.nodeStaticMaskBuffer);
      const initialVoltages = Array.from(buffers.nodeVoltageBuffer);
      await this.invokeFn('gpu_init_circuit', {
        transistors,
        staticMasks,
        static_masks: staticMasks,
        initialVoltages,
        initial_voltages: initialVoltages,
      });
      return true;
    } catch {
      return false;
    }
  }

  async stepBatch(ticks: number): Promise<TauriGpuStepResult | null> {
    if (!this.invokeFn) return null;
    try {
      return await this.invokeFn<TauriGpuStepResult>('gpu_step_batch', { ticks });
    } catch {
      return null;
    }
  }
}

/**
 * Two-Pass Parallel GPU Transistor Solver with deterministic CPU flat-buffer execution,
 * WebGPU WGSL Compute Pipeline, and Native Tauri Rust `wgpu` integration.
 */
export class GpuParallelSolver implements ISimulator {
  private readonly sim: Simulator;
  private transistorBuffer: Uint32Array = new Uint32Array(0);
  private nodeVoltageBuffer: Uint32Array = new Uint32Array(0);
  private nodeStaticMaskBuffer: Uint32Array = new Uint32Array(0);
  private nodeAccumMaskBuffer: Uint32Array = new Uint32Array(0);
  private txStateBuffer: Uint32Array = new Uint32Array(0);

  private rawMode = false;
  private rawTickCount = 0;
  private rawShortCircuit = false;

  private backend: ComputeBackendType = 'CPU Fallback (SoA Worker)';
  private deviceName = 'Two-Pass Parallel Solver';

  constructor(initialDoc?: CircuitDocument) {
    this.sim = new Simulator();
    if (initialDoc) {
      this.loadDocument(initialDoc);
    }
  }

  /**
   * Loads a CircuitDocument, compiles it into flat Uint32Array GPU buffers,
   * and synchronizes the initial settled node voltages.
   */
  loadDocument(doc: CircuitDocument): void {
    this.rawMode = false;
    this.sim.loadDocument(doc);
    this.syncFlatBuffersFromSim();
  }

  /**
   * Initializes the Two-Pass Parallel Solver directly from raw flat GPU buffers:
   * - `transistorBuffer`: `Uint32Array` of `[gate_node_id, drain_node_id, source_node_id, type]`
   * - `nodeStaticMaskBuffer`: `Uint32Array` of static node drive masks (`1=GND, 2=VCC, 4=PULL_DOWN, 8=PULL_UP`)
   * - `initialVoltages`: optional `Uint32Array` of initial node voltages (`0=LOW, 1=HIGH, 2=Z, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR`)
   */
  initBuffers(
    transistorBuffer: Uint32Array,
    nodeStaticMaskBuffer: Uint32Array,
    initialVoltages?: Uint32Array,
  ): void {
    this.rawMode = true;
    this.rawTickCount = 0;
    this.rawShortCircuit = false;

    const txCount = Math.floor(transistorBuffer.length / 4);
    const nodeCount = nodeStaticMaskBuffer.length;

    this.transistorBuffer = new Uint32Array(transistorBuffer);
    this.nodeStaticMaskBuffer = new Uint32Array(nodeStaticMaskBuffer);
    this.nodeVoltageBuffer = new Uint32Array(nodeCount);
    this.nodeAccumMaskBuffer = new Uint32Array(nodeCount);
    this.txStateBuffer = new Uint32Array(txCount);

    if (initialVoltages && initialVoltages.length === nodeCount) {
      this.nodeVoltageBuffer.set(initialVoltages);
    } else {
      for (let n = 0; n < nodeCount; n++) {
        this.nodeVoltageBuffer[n] = resolveMaskToGpuVoltage(nodeStaticMaskBuffer[n]);
      }
    }
  }

  private syncFlatBuffersFromSim(): void {
    const gpuBuffers = this.sim.getGpuFlatBuffers();
    const snap = this.sim.getSnapshot();
    const txCount = snap.transistorCount;
    const nodeCount = snap.netCount;

    this.transistorBuffer = gpuBuffers.transistorBuffer;
    this.nodeVoltageBuffer = gpuBuffers.nodeVoltageBuffer;
    this.nodeStaticMaskBuffer = gpuBuffers.nodeStaticMaskBuffer;

    if (this.nodeAccumMaskBuffer.length !== nodeCount) {
      this.nodeAccumMaskBuffer = new Uint32Array(nodeCount);
    } else {
      this.nodeAccumMaskBuffer.fill(0);
    }

    if (this.txStateBuffer.length !== txCount) {
      this.txStateBuffer = new Uint32Array(txCount);
    }
    const simTxState = snap.transistors.state;
    for (let i = 0; i < txCount; i++) {
      this.txStateBuffer[i] = simTxState[i];
    }
  }

  reset(): void {
    if (this.rawMode) {
      this.rawTickCount = 0;
      this.nodeAccumMaskBuffer.fill(0);
      this.txStateBuffer.fill(0);
      for (let n = 0; n < this.nodeVoltageBuffer.length; n++) {
        this.nodeVoltageBuffer[n] = resolveMaskToGpuVoltage(this.nodeStaticMaskBuffer[n]);
      }
      return;
    }
    this.sim.reset();
    this.syncFlatBuffersFromSim();
  }

  /**
   * Executes a single Two-Pass Parallel GPU Shader iteration (Pass 1 + Pass 2) on the flat buffers.
   */
  stepSinglePass(): void {
    const txCount = Math.floor(this.transistorBuffer.length / 4);
    const nodeCount = this.nodeVoltageBuffer.length;

    const hasErr = executeTwoPassParallelStepCpu(
      txCount,
      nodeCount,
      this.transistorBuffer,
      this.nodeVoltageBuffer,
      this.nodeStaticMaskBuffer,
      this.nodeAccumMaskBuffer,
      this.txStateBuffer,
    );

    if (this.rawMode) {
      this.rawTickCount++;
      this.rawShortCircuit = hasErr;
    } else {
      const nextTick = this.sim.getSnapshot().tickCount + 1;
      this.sim.syncFromGpuBuffers(
        this.nodeVoltageBuffer,
        this.txStateBuffer,
        nextTick,
        undefined,
        hasErr,
      );
    }
  }

  stepHalfCycle(): void {
    this.stepSinglePass();
  }

  stepFullCycle(): void {
    this.stepSinglePass();
    this.stepSinglePass();
  }

  stepBatch(ticks: number): void {
    const count = Math.max(0, Math.floor(ticks));
    if (count === 0) return;

    const txCount = Math.floor(this.transistorBuffer.length / 4);
    const nodeCount = this.nodeVoltageBuffer.length;
    let hasErr = false;

    for (let i = 0; i < count; i++) {
      hasErr = executeTwoPassParallelStepCpu(
        txCount,
        nodeCount,
        this.transistorBuffer,
        this.nodeVoltageBuffer,
        this.nodeStaticMaskBuffer,
        this.nodeAccumMaskBuffer,
        this.txStateBuffer,
      );
    }

    if (this.rawMode) {
      this.rawTickCount += count;
      this.rawShortCircuit = hasErr;
    } else {
      const nextTick = this.sim.getSnapshot().tickCount + count;
      this.sim.syncFromGpuBuffers(
        this.nodeVoltageBuffer,
        this.txStateBuffer,
        nextTick,
        undefined,
        hasErr,
      );
    }
  }

  setToggleState(compId: string, state: boolean): void {
    if (this.rawMode) return;
    this.sim.setToggleState(compId, state);
    this.syncFlatBuffersFromSim();
  }

  setPushButtonState(compId: string, pressed: boolean): void {
    if (this.rawMode) return;
    this.sim.setPushButtonState(compId, pressed);
    this.syncFlatBuffersFromSim();
  }

  getGpuFlatBuffers(): GpuFlatBuffers {
    return {
      transistorBuffer: this.transistorBuffer,
      nodeVoltageBuffer: this.nodeVoltageBuffer,
      nodeStaticMaskBuffer: this.nodeStaticMaskBuffer,
    };
  }

  getTransistorBuffer(): Uint32Array {
    return this.transistorBuffer;
  }

  getNodeVoltageBuffer(): Uint32Array {
    return this.nodeVoltageBuffer;
  }

  getNodeStaticMaskBuffer(): Uint32Array {
    return this.nodeStaticMaskBuffer;
  }

  getNodeAccumMaskBuffer(): Uint32Array {
    return this.nodeAccumMaskBuffer;
  }

  getTxStateBuffer(): Uint32Array {
    return this.txStateBuffer;
  }

  getNodeVoltage(nodeId: number): GpuNodeVoltage {
    return (this.nodeVoltageBuffer[nodeId] ?? GpuNodeVoltage.Z) as GpuNodeVoltage;
  }

  hasShortCircuit(): boolean {
    return this.rawMode ? this.rawShortCircuit : this.sim.getSnapshot().hasShortCircuit;
  }

  getPinValue(compIdOrScope: string, pinIdOrCompId: string, maybePinId?: string): LogicValue {
    return this.sim.getPinValue(compIdOrScope, pinIdOrCompId, maybePinId);
  }

  getWireValue(wireIdOrScope: string, maybeWireId?: string): LogicValue {
    return this.sim.getWireValue(wireIdOrScope, maybeWireId);
  }

  getTransistorState(compId: string): number {
    return this.sim.getTransistorState(compId);
  }

  getBackendType(): ComputeBackendType {
    return this.backend;
  }

  getDeviceName(): string {
    return this.deviceName;
  }

  setBackendInfo(backend: ComputeBackendType, deviceName?: string): void {
    this.backend = backend;
    if (deviceName) this.deviceName = deviceName;
    this.sim.setBackendInfo(backend, deviceName);
  }

  getSnapshot(): SimulationSnapshot {
    const snap = this.sim.getSnapshot();
    if (this.rawMode) {
      return {
        ...snap,
        gpuBuffers: this.getGpuFlatBuffers(),
        backend: this.backend,
        gpuDeviceName: this.deviceName,
        tickCount: this.rawTickCount,
        transistorCount: Math.floor(this.transistorBuffer.length / 4),
        netCount: this.nodeVoltageBuffer.length,
        hasShortCircuit: this.rawShortCircuit,
      };
    }
    return snap;
  }

  destroy(): void {
    // Cleanup resources if any
  }
}
