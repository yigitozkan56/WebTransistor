import type {
  CircuitDocument,
  ComputeBackendType,
  GpuFlatBuffers,
  LogicValue,
  SimulationSnapshot,
} from '../types/circuit';
import type { ISimulator } from '../types/ui';
import {
  GpuParallelSolver,
  TauriNativeGpuBridge,
  WebGpuComputeEngine,
} from './gpuSolver';
import type { SimWorkerRequest, SimWorkerResponse } from './simWorker';
import { Simulator } from './simulator';

const WORKER_ASYNC_ONLY_THRESHOLD = 50000;

/**
 * Multi-Tier Hardware-Accelerated `ISimulator` Controller:
 * 1. **Native Vulkan/DX12/CUDA (Tauri)** (`window.__TAURI_INTERNALS__` -> Rust `wgpu` compute commands)
 * 2. **WebGPU (WGSL Compute)** (`navigator.gpu` -> WGSL Two-Pass Parallel Compute Shader on `GPUBuffer`s)
 * 3. **SharedArrayBuffer Worker** (Zero-copy lock-free shared `netValues` & `txState` across Web Worker)
 * 4. **CPU Fallback (SoA Worker)** (Double-buffered transferable `ArrayBuffer` Web Worker + local SoA mirror)
 */
export class WorkerSimulatorClient implements ISimulator {
  private readonly localSim: Simulator;
  private readonly gpuSolver: GpuParallelSolver;
  private readonly tauriBridge: TauriNativeGpuBridge;
  private readonly webGpuEngine: WebGpuComputeEngine;

  private backend: ComputeBackendType = 'CPU Fallback (SoA Worker)';
  private deviceName = 'SoA Switch-Island Engine';

  private worker: Worker | null = null;
  private epoch = 0;
  private commandSeq = 0;
  private workerBusy = false;
  private gpuBusy = false;
  private tauriReady = false;
  private queuedWorkerTicks = 0;

  private recycleNetBuf: ArrayBuffer | null = null;
  private recycleTxBuf: ArrayBuffer | null = null;

  private useSharedBuffers = false;
  private sharedNetBuf: SharedArrayBuffer | null = null;
  private sharedTxBuf: SharedArrayBuffer | null = null;
  private sharedNetView: Uint8Array | null = null;
  private sharedTxView: Uint8Array | null = null;

  constructor(initialDoc?: CircuitDocument) {
    this.localSim = new Simulator(initialDoc);
    this.gpuSolver = new GpuParallelSolver(initialDoc);
    this.tauriBridge = new TauriNativeGpuBridge();
    this.webGpuEngine = new WebGpuComputeEngine();

    this.detectAndInitBackends(initialDoc);
  }

  private detectAndInitBackends(initialDoc?: CircuitDocument): void {
    const sabAvailable = typeof SharedArrayBuffer !== 'undefined';
    if (sabAvailable) {
      this.useSharedBuffers = true;
      this.setBackend('SharedArrayBuffer Worker', 'Zero-Copy SharedArrayBuffer SoA');
    } else {
      this.setBackend('CPU Fallback (SoA Worker)', 'CPU SoA Event-Driven Worker');
    }

    if (initialDoc) {
      this.allocateSharedBuffersForCurrentCircuit();
    }

    this.initWorker(initialDoc);

    // 1. Check Native Tauri Vulkan/DX12/CUDA backend first
    if (this.tauriBridge.isAvailable()) {
      this.setBackend(
        'Native Vulkan/DX12/CUDA (Tauri)',
        this.tauriBridge.getAdapterName(),
      );
      void this.initTauriBackend();
      return;
    }

    // 2. Check Browser / WebView2 WebGPU (WGSL Compute) backend
    if (WebGpuComputeEngine.isWebGpuSupported()) {
      void this.initWebGpuBackend();
    }
  }

  private setBackend(backend: ComputeBackendType, deviceName: string): void {
    this.backend = backend;
    this.deviceName = deviceName;
    this.localSim.setBackendInfo(backend, deviceName);
    this.gpuSolver.setBackendInfo(backend, deviceName);
  }

  private async initTauriBackend(): Promise<void> {
    const info = await this.tauriBridge.queryHardwareInfo();
    if (info) {
      this.setBackend(
        'Native Vulkan/DX12/CUDA (Tauri)',
        this.tauriBridge.getAdapterName(),
      );
      const ok = await this.tauriBridge.initCircuit(this.localSim.getGpuFlatBuffers());
      this.tauriReady = ok;
    }
  }

  private async initWebGpuBackend(): Promise<void> {
    const ok = await this.webGpuEngine.init();
    if (ok && !this.tauriBridge.isAvailable()) {
      this.setBackend('WebGPU (WGSL Compute)', this.webGpuEngine.getAdapterName());
      this.webGpuEngine.uploadCircuit(this.localSim.getGpuFlatBuffers());
    }
  }

  private allocateSharedBuffersForCurrentCircuit(): void {
    if (!this.useSharedBuffers || typeof SharedArrayBuffer === 'undefined') {
      this.sharedNetBuf = null;
      this.sharedTxBuf = null;
      this.sharedNetView = null;
      this.sharedTxView = null;
      return;
    }

    try {
      const snap = this.localSim.getSnapshot();
      const netLen = Math.max(1, snap.netValues.byteLength);
      const txLen = Math.max(1, snap.transistors.state.byteLength);

      this.sharedNetBuf = new SharedArrayBuffer(netLen);
      this.sharedTxBuf = new SharedArrayBuffer(txLen);
      this.sharedNetView = new Uint8Array(this.sharedNetBuf);
      this.sharedTxView = new Uint8Array(this.sharedTxBuf);
      this.sharedNetView.set(snap.netValues);
      this.sharedTxView.set(snap.transistors.state);
    } catch {
      this.useSharedBuffers = false;
      this.sharedNetBuf = null;
      this.sharedTxBuf = null;
      this.sharedNetView = null;
      this.sharedTxView = null;
    }
  }

  private initWorker(initialDoc?: CircuitDocument): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      const w = new Worker(new URL('./simWorker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (event: MessageEvent<SimWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      w.onerror = () => {
        this.worker = null;
        this.workerBusy = false;
      };
      this.worker = w;

      if (initialDoc) {
        this.epoch++;
        this.commandSeq++;
        this.postToWorker({
          type: 'LOAD_DOCUMENT',
          doc: initialDoc,
          epoch: this.epoch,
          seq: this.commandSeq,
          sharedNetBuffer: this.sharedNetBuf ?? undefined,
          sharedTxBuffer: this.sharedTxBuf ?? undefined,
        });
      }
    } catch {
      this.worker = null;
    }
  }

  private postToWorker(
    msg: SimWorkerRequest,
    transfer?: Transferable[],
  ): void {
    if (!this.worker) return;
    try {
      if (transfer && transfer.length > 0) {
        this.worker.postMessage(msg, transfer);
      } else {
        this.worker.postMessage(msg);
      }
    } catch {
      this.worker = null;
      this.workerBusy = false;
    }
  }

  private handleWorkerMessage(msg: SimWorkerResponse): void {
    if (!msg || msg.type !== 'SNAPSHOT_SYNC') return;

    this.workerBusy = false;

    if (msg.epoch === this.epoch && msg.seq === this.commandSeq) {
      if (msg.usingSharedBuffers && this.sharedNetView && this.sharedTxView) {
        this.localSim.syncFromWorker(
          msg.tickCount,
          msg.effectiveHz,
          msg.hasShortCircuit,
          this.sharedNetView,
          this.sharedTxView,
        );
      } else if (msg.netBuffer && msg.txStateBuffer) {
        this.localSim.syncFromWorker(
          msg.tickCount,
          msg.effectiveHz,
          msg.hasShortCircuit,
          new Uint8Array(msg.netBuffer),
          new Uint8Array(msg.txStateBuffer),
        );
      }
    }

    if (msg.netBuffer) this.recycleNetBuf = msg.netBuffer;
    if (msg.txStateBuffer) this.recycleTxBuf = msg.txStateBuffer;

    if (this.queuedWorkerTicks > 0 && this.worker) {
      const ticks = this.queuedWorkerTicks;
      this.queuedWorkerTicks = 0;
      this.dispatchWorkerBatch(ticks);
    }
  }

  private dispatchWorkerBatch(ticks: number): void {
    if (!this.worker) return;
    this.workerBusy = true;
    const transfer: Transferable[] = [];
    const req: SimWorkerRequest = {
      type: 'STEP_BATCH',
      ticks,
      epoch: this.epoch,
      seq: this.commandSeq,
    };

    if (!this.useSharedBuffers) {
      if (this.recycleNetBuf) {
        req.recycleNetBuf = this.recycleNetBuf;
        transfer.push(this.recycleNetBuf);
        this.recycleNetBuf = null;
      }
      if (this.recycleTxBuf) {
        req.recycleTxBuf = this.recycleTxBuf;
        transfer.push(this.recycleTxBuf);
        this.recycleTxBuf = null;
      }
    }

    this.postToWorker(req, transfer);
  }

  private dispatchHardwareGpuAsync(ticks: number, targetEpoch: number): void {
    if (this.gpuBusy) return;

    if (this.backend === 'Native Vulkan/DX12/CUDA (Tauri)' && this.tauriReady) {
      this.gpuBusy = true;
      void this.tauriBridge
        .stepBatch(ticks)
        .then((res) => {
          if (!res || targetEpoch !== this.epoch) return;
          const voltages = res.node_voltages ?? res.nodeVoltages;
          const txStates = res.tx_states ?? res.txStates;
          if (voltages && voltages.length > 0 && this.localSim.getSnapshot().transistorCount >= WORKER_ASYNC_ONLY_THRESHOLD) {
            this.localSim.syncFromGpuBuffers(
              voltages,
              txStates,
              res.tick_count ?? res.tickCount,
              res.tps,
              res.has_short_circuit ?? res.hasShortCircuit,
            );
          }
        })
        .finally(() => {
          this.gpuBusy = false;
        });
      return;
    }

    if (this.backend === 'WebGPU (WGSL Compute)' && this.webGpuEngine.isReady()) {
      this.gpuBusy = true;
      void this.webGpuEngine
        .stepBatchAsync(Math.min(ticks, 64))
        .then((res) => {
          if (!res || targetEpoch !== this.epoch) return;
          if (this.localSim.getSnapshot().transistorCount >= WORKER_ASYNC_ONLY_THRESHOLD) {
            const snap = this.localSim.getSnapshot();
            this.localSim.syncFromGpuBuffers(
              res.nodeVoltages,
              res.txStates,
              snap.tickCount + ticks,
            );
          }
        })
        .finally(() => {
          this.gpuBusy = false;
        });
    }
  }

  loadDocument(doc: CircuitDocument): void {
    this.epoch++;
    this.commandSeq++;
    this.queuedWorkerTicks = 0;
    this.recycleNetBuf = null;
    this.recycleTxBuf = null;

    this.localSim.loadDocument(doc);
    this.localSim.setBackendInfo(this.backend, this.deviceName);
    this.gpuSolver.loadDocument(doc);
    this.gpuSolver.setBackendInfo(this.backend, this.deviceName);

    this.allocateSharedBuffersForCurrentCircuit();

    if (this.tauriBridge.isAvailable()) {
      void this.tauriBridge.initCircuit(this.localSim.getGpuFlatBuffers()).then((ok) => {
        this.tauriReady = ok;
      });
    } else if (this.webGpuEngine.isReady()) {
      this.webGpuEngine.uploadCircuit(this.localSim.getGpuFlatBuffers());
    }

    if (this.worker) {
      this.workerBusy = true;
      this.postToWorker({
        type: 'LOAD_DOCUMENT',
        doc,
        epoch: this.epoch,
        seq: this.commandSeq,
        sharedNetBuffer: this.sharedNetBuf ?? undefined,
        sharedTxBuffer: this.sharedTxBuf ?? undefined,
      });
    }
  }

  reset(): void {
    this.commandSeq++;
    this.queuedWorkerTicks = 0;
    this.localSim.reset();
    this.gpuSolver.reset();

    if (this.tauriBridge.isAvailable()) {
      void this.tauriBridge.initCircuit(this.localSim.getGpuFlatBuffers());
    } else if (this.webGpuEngine.isReady()) {
      this.webGpuEngine.uploadCircuit(this.localSim.getGpuFlatBuffers());
    }

    if (this.worker) {
      this.workerBusy = true;
      this.postToWorker({
        type: 'RESET',
        epoch: this.epoch,
        seq: this.commandSeq,
      });
    }
  }

  stepHalfCycle(): void {
    this.stepBatch(1);
  }

  stepFullCycle(): void {
    this.stepBatch(2);
  }

  stepBatch(ticks: number): void {
    const count = Math.max(0, Math.floor(ticks));
    if (count === 0) return;

    this.commandSeq++;
    const txCount = this.localSim.getSnapshot().transistorCount;

    if (!this.worker || txCount < WORKER_ASYNC_ONLY_THRESHOLD) {
      this.localSim.stepBatch(count);
    }

    if (
      this.backend === 'Native Vulkan/DX12/CUDA (Tauri)' ||
      this.backend === 'WebGPU (WGSL Compute)'
    ) {
      this.dispatchHardwareGpuAsync(count, this.epoch);
    }

    if (this.worker) {
      if (this.workerBusy) {
        this.queuedWorkerTicks += count;
      } else {
        this.dispatchWorkerBatch(count);
      }
    }
  }

  setToggleState(compId: string, state: boolean): void {
    this.commandSeq++;
    this.localSim.setToggleState(compId, state);
    this.gpuSolver.setToggleState(compId, state);

    if (this.tauriBridge.isAvailable() && this.tauriReady) {
      void this.tauriBridge.initCircuit(this.localSim.getGpuFlatBuffers());
    } else if (this.webGpuEngine.isReady()) {
      const bufs = this.localSim.getGpuFlatBuffers();
      this.webGpuEngine.updateStaticMasks(bufs.nodeStaticMaskBuffer, bufs.nodeVoltageBuffer);
    }

    if (this.worker) {
      this.workerBusy = true;
      this.postToWorker({
        type: 'SET_TOGGLE',
        compId,
        state,
        epoch: this.epoch,
        seq: this.commandSeq,
      });
    }
  }

  setPushButtonState(compId: string, pressed: boolean): void {
    this.commandSeq++;
    this.localSim.setPushButtonState(compId, pressed);
    this.gpuSolver.setPushButtonState(compId, pressed);

    if (this.tauriBridge.isAvailable() && this.tauriReady) {
      void this.tauriBridge.initCircuit(this.localSim.getGpuFlatBuffers());
    } else if (this.webGpuEngine.isReady()) {
      const bufs = this.localSim.getGpuFlatBuffers();
      this.webGpuEngine.updateStaticMasks(bufs.nodeStaticMaskBuffer, bufs.nodeVoltageBuffer);
    }

    if (this.worker) {
      this.workerBusy = true;
      this.postToWorker({
        type: 'SET_BUTTON',
        compId,
        pressed,
        epoch: this.epoch,
        seq: this.commandSeq,
      });
    }
  }

  getSnapshot(): SimulationSnapshot {
    return this.localSim.getSnapshot();
  }

  getGpuFlatBuffers(): GpuFlatBuffers {
    return this.localSim.getGpuFlatBuffers();
  }

  getGpuSolver(): GpuParallelSolver {
    return this.gpuSolver;
  }

  getBackendType(): ComputeBackendType {
    return this.backend;
  }

  getDeviceName(): string {
    return this.deviceName;
  }

  getPinValue(compIdOrScope: string, pinIdOrCompId: string, maybePinId?: string): LogicValue {
    return this.localSim.getPinValue(compIdOrScope, pinIdOrCompId, maybePinId);
  }

  getWireValue(wireIdOrScope: string, maybeWireId?: string): LogicValue {
    return this.localSim.getWireValue(wireIdOrScope, maybeWireId);
  }

  getTransistorState(compId: string): number {
    return this.localSim.getTransistorState(compId);
  }

  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.webGpuEngine.destroy();
    this.workerBusy = false;
    this.gpuBusy = false;
    this.queuedWorkerTicks = 0;
  }
}

export { WorkerSimulatorClient as WorkerSimulator, WorkerSimulatorClient as SimulatorClient };

export function createWorkerSimulator(initialDoc?: CircuitDocument): ISimulator {
  return new WorkerSimulatorClient(initialDoc);
}

export function createSimulatorClient(initialDoc?: CircuitDocument): ISimulator {
  return new WorkerSimulatorClient(initialDoc);
}

export default WorkerSimulatorClient;
