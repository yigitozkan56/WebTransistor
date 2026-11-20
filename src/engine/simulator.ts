import {
  LogicValue,
  type CircuitDocument,
  type ComputeBackendType,
  type GpuFlatBuffers,
  type SimulationSnapshot,
  type TransistorSoA,
} from '../types/circuit';
import type { ISimulator } from '../types/ui';
import { compileCircuit, type CompiledCircuit } from './compiler';

const MAX_SETTLE_FLIPS = 4;
const MAX_RAIL_DELTA_CYCLES = 16;

/**
 * Conversion LUT from LogicValue (0=Z, 1=LOW, 2=HIGH, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR)
 * to GpuNodeVoltage (0=GND/LOW, 1=VCC/HIGH, 2=Floating/Z, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR).
 */
export const LOGIC_TO_GPU_VOLTAGE = new Uint32Array([
  2, // LogicValue.Z (0) -> 2u (Floating/Z)
  0, // LogicValue.LOW (1) -> 0u (GND/LOW)
  1, // LogicValue.HIGH (2) -> 1u (VCC/HIGH)
  3, // LogicValue.WEAK_LOW (3) -> 3u (WEAK_LOW)
  4, // LogicValue.WEAK_HIGH (4) -> 4u (WEAK_HIGH)
  5, // LogicValue.ERR (5) -> 5u (ERR)
]);

/**
 * Conversion LUT from GpuNodeVoltage (0=GND/LOW, 1=VCC/HIGH, 2=Floating/Z, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR)
 * back to LogicValue (0=Z, 1=LOW, 2=HIGH, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR).
 */
export const GPU_VOLTAGE_TO_LOGIC = new Uint8Array([
  LogicValue.LOW,       // 0u -> LOW (1)
  LogicValue.HIGH,      // 1u -> HIGH (2)
  LogicValue.Z,         // 2u -> Z (0)
  LogicValue.WEAK_LOW,  // 3u -> WEAK_LOW (3)
  LogicValue.WEAK_HIGH, // 4u -> WEAK_HIGH (4)
  LogicValue.ERR,       // 5u -> ERR (5)
]);

const DRIVE_LUT = new Uint8Array([
  LogicValue.Z,         // 0:  0000
  LogicValue.LOW,       // 1:  0001 STRONG_LOW
  LogicValue.HIGH,      // 2:  0010 STRONG_HIGH
  LogicValue.ERR,       // 3:  0011 STRONG_LOW + STRONG_HIGH
  LogicValue.WEAK_LOW,  // 4:  0100 WEAK_LOW
  LogicValue.LOW,       // 5:  0101 STRONG_LOW + WEAK_LOW
  LogicValue.HIGH,      // 6:  0110 STRONG_HIGH + WEAK_LOW
  LogicValue.ERR,       // 7:  0111
  LogicValue.WEAK_HIGH, // 8:  1000 WEAK_HIGH
  LogicValue.LOW,       // 9:  1001 STRONG_LOW + WEAK_HIGH
  LogicValue.HIGH,      // 10: 1010 STRONG_HIGH + WEAK_HIGH
  LogicValue.ERR,       // 11: 1011
  LogicValue.Z,         // 12: 1100 WEAK_LOW + WEAK_HIGH -> Z
  LogicValue.LOW,       // 13: 1101
  LogicValue.HIGH,      // 14: 1110
  LogicValue.ERR,       // 15: 1111
]);

function createEmptyCompiled(): CompiledCircuit {
  return {
    netCount: 0,
    islandCount: 0,
    transistorCount: 0,
    pinToNet: new Map(),
    wireToNet: new Map(),
    compToTxIndex: new Map(),
    txGateNode: new Int32Array(0),
    txDrainNode: new Int32Array(0),
    txSourceNode: new Int32Array(0),
    txType: new Uint8Array(0),
    txToIsland: new Int32Array(0),
    gpuTransistorBuffer: new Uint32Array(0),
    gpuNodeStaticMaskBuffer: new Uint32Array(0),
    staticDriveMask: new Uint8Array(0),
    isRailNet: new Uint8Array(0),
    netToIsland: new Int32Array(0),
    islandNetOffsets: new Int32Array(1),
    islandNetIds: new Int32Array(0),
    islandTxOffsets: new Int32Array(1),
    islandTxIds: new Int32Array(0),
    islandIntTxOffsets: new Int32Array(1),
    intTxIdx: new Int32Array(0),
    intTxIsPmos: new Uint8Array(0),
    intTxGateNet: new Int32Array(0),
    intTxNetA: new Int32Array(0),
    intTxNetB: new Int32Array(0),
    islandRailTxOffsets: new Int32Array(1),
    railTxIdx: new Int32Array(0),
    railTxIsPmos: new Uint8Array(0),
    railTxGateNet: new Int32Array(0),
    railTxNonRailNet: new Int32Array(0),
    railTxRailNet: new Int32Array(0),
    railBridgeCount: 0,
    railBridgeTxIdx: new Int32Array(0),
    railBridgeIsPmos: new Uint8Array(0),
    railBridgeGateNet: new Int32Array(0),
    railBridgeNetA: new Int32Array(0),
    railBridgeNetB: new Int32Array(0),
    gateNetTxOffsets: new Int32Array(1),
    gateNetTxIds: new Int32Array(0),
    gateNetIslandOffsets: new Int32Array(1),
    gateNetIslandIds: new Int32Array(0),
    railNetIslandOffsets: new Int32Array(1),
    railNetIslandIds: new Int32Array(0),
    dynamicSources: [],
  };
}

/**
 * PureSilicon Data-Oriented Design (SoA) Event-Driven Switch-Island Simulator.
 *
 * - Stores 1,000,000+ transistors in flat typed arrays (`TransistorSoA`) with zero OOP transistor objects.
 * - Resolves source-drain conduction through conducting MOSFET islands via zero-allocation Union-Find.
 * - Uses sparse event-driven unit-gate-delay stepping on `stepHalfCycle()` so feedback loops such as
 *   3-transistor and 5-transistor Ring Oscillators oscillate deterministically in O(dirty_nodes) time.
 */
export class Simulator implements ISimulator {
  private compiled: CompiledCircuit = createEmptyCompiled();

  private txState = new Uint8Array(0);
  private transistors: TransistorSoA = {
    count: 0,
    gateNode: new Int32Array(0),
    drainNode: new Int32Array(0),
    sourceNode: new Int32Array(0),
    type: new Uint8Array(0),
    state: this.txState,
  };

  private netValues = new Uint8Array(0);
  private netDynamicHighCount = new Uint16Array(0);
  private netDynamicLowCount = new Uint16Array(0);

  // Zero-copy flat GPU buffers kept continuously synchronized in O(1)
  private gpuNodeVoltageBuffer = new Uint32Array(0);
  private gpuNodeStaticMaskBuffer = new Uint32Array(0);
  private gpuBuffersView: GpuFlatBuffers = {
    transistorBuffer: new Uint32Array(0),
    nodeVoltageBuffer: this.gpuNodeVoltageBuffer,
    nodeStaticMaskBuffer: this.gpuNodeStaticMaskBuffer,
  };

  private backend: ComputeBackendType = 'CPU Fallback (SoA Worker)';
  private gpuDeviceName = 'CPU SoA Engine';

  // Dirty Switch-Island circular queue
  private dirtyQueue = new Int32Array(1);
  private inQueue = new Uint8Array(1);
  private queueHead = 0;
  private queueTail = 0;
  private queueCount = 0;

  // Dirty Transistor Gate circular queue for O(dirty) unit-gate-delay ticks
  private dirtyTxQueue = new Int32Array(1);
  private inDirtyTxQueue = new Uint8Array(1);
  private txQueueHead = 0;
  private txQueueTail = 0;
  private dirtyTxCount = 0;

  // Per-island flip counter used during combinational settling to detect oscillator loops
  private islandFlipCount = new Uint8Array(0);
  private settledIslands = new Int32Array(0);
  private settledIslandCount = 0;
  private currentSettlingIsland = -1;

  // Pre-allocated scratch buffers for zero-allocation Switch-Island Union-Find evaluation
  private ufParent = new Int32Array(0);
  private ufMask = new Uint8Array(0);

  // Flat interactive source tables
  private sourceState = new Uint8Array(0);
  private sourceNets = new Int32Array(0);
  private toggleByCompId = new Map<string, number[]>();
  private buttonByCompId = new Map<string, number[]>();

  private tickCount = 0;
  private errorNetCount = 0;
  private hasShortCircuit = false;
  private railBridgeWasActive = false;

  private effectiveHz = 0;
  private lastRateTime = performance.now();
  private lastRateTick = 0;

  constructor(initialDoc?: CircuitDocument) {
    if (initialDoc) {
      this.loadDocument(initialDoc);
    }
  }

  loadDocument(doc: CircuitDocument): void {
    const compiled = compileCircuit(doc);
    this.compiled = compiled;

    const { netCount, islandCount, transistorCount, dynamicSources } = compiled;

    this.txState = new Uint8Array(transistorCount);
    this.transistors = {
      count: transistorCount,
      gateNode: compiled.txGateNode,
      drainNode: compiled.txDrainNode,
      sourceNode: compiled.txSourceNode,
      type: compiled.txType,
      state: this.txState,
    };

    this.netValues = new Uint8Array(netCount);
    this.netDynamicHighCount = new Uint16Array(netCount);
    this.netDynamicLowCount = new Uint16Array(netCount);

    this.gpuNodeVoltageBuffer = new Uint32Array(netCount);
    this.gpuNodeStaticMaskBuffer = new Uint32Array(netCount);
    this.gpuNodeStaticMaskBuffer.set(compiled.gpuNodeStaticMaskBuffer);
    this.gpuBuffersView = {
      transistorBuffer: compiled.gpuTransistorBuffer,
      nodeVoltageBuffer: this.gpuNodeVoltageBuffer,
      nodeStaticMaskBuffer: this.gpuNodeStaticMaskBuffer,
    };

    const qCap = Math.max(1, islandCount);
    this.dirtyQueue = new Int32Array(qCap);
    this.inQueue = new Uint8Array(qCap);
    this.islandFlipCount = new Uint8Array(qCap);
    this.settledIslands = new Int32Array(qCap);
    this.settledIslandCount = 0;

    const txCap = Math.max(1, transistorCount);
    this.dirtyTxQueue = new Int32Array(txCap);
    this.inDirtyTxQueue = new Uint8Array(txCap);

    this.ufParent = new Int32Array(netCount);
    this.ufMask = new Uint8Array(netCount);

    const srcCount = dynamicSources.length;
    this.sourceState = new Uint8Array(srcCount);
    this.sourceNets = new Int32Array(srcCount);

    this.toggleByCompId.clear();
    this.buttonByCompId.clear();

    const pushLookup = (map: Map<string, number[]>, key: string, idx: number): void => {
      let arr = map.get(key);
      if (!arr) {
        arr = [];
        map.set(key, arr);
      }
      arr.push(idx);
    };

    for (let i = 0; i < srcCount; i++) {
      const src = dynamicSources[i];
      this.sourceNets[i] = src.netId;
      this.sourceState[i] = src.initialState ? 1 : 0;

      if (src.kind === 'TOGGLE_SWITCH') {
        pushLookup(this.toggleByCompId, src.compId, i);
      } else {
        pushLookup(this.buttonByCompId, src.compId, i);
      }
    }

    this.reset();
  }

  reset(): void {
    this.tickCount = 0;
    this.effectiveHz = 0;
    this.lastRateTick = 0;
    this.lastRateTime = performance.now();
    this.errorNetCount = 0;
    this.hasShortCircuit = false;
    this.railBridgeWasActive = false;

    this.txState.fill(0);
    this.netValues.fill(LogicValue.Z);
    this.netDynamicHighCount.fill(0);
    this.netDynamicLowCount.fill(0);

    this.inQueue.fill(0);
    this.queueHead = 0;
    this.queueTail = 0;
    this.queueCount = 0;

    this.inDirtyTxQueue.fill(0);
    this.txQueueHead = 0;
    this.txQueueTail = 0;
    this.dirtyTxCount = 0;

    this.islandFlipCount.fill(0);
    this.settledIslandCount = 0;

    const sources = this.compiled.dynamicSources;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const bit = src.kind === 'TOGGLE_SWITCH' ? this.sourceState[i] : src.initialState ? 1 : 0;
      this.sourceState[i] = bit;
      if (bit === 1) {
        this.netDynamicHighCount[src.netId]++;
      } else {
        this.netDynamicLowCount[src.netId]++;
      }
    }

    const { netCount, staticDriveMask, islandCount } = this.compiled;
    for (let n = 0; n < netCount; n++) {
      let mask = staticDriveMask[n];
      if (this.netDynamicHighCount[n] > 0) mask |= 2;
      if (this.netDynamicLowCount[n] > 0) mask |= 1;
      this.gpuNodeStaticMaskBuffer[n] = mask;
      const val = DRIVE_LUT[mask];
      this.netValues[n] = val;
      this.gpuNodeVoltageBuffer[n] = LOGIC_TO_GPU_VOLTAGE[val];
      if (val === LogicValue.ERR) this.errorNetCount++;
    }

    for (let isl = 0; isl < islandCount; isl++) {
      this.enqueueIsland(isl);
    }

    this.settle();

    // Symmetry-breaking kickstart for uninitialized pure CMOS feedback rings (e.g. 3 CMOS inverters in a closed loop)
    this.kickstartFloatingFeedbackLoops();
  }

  stepHalfCycle(): void {
    this.tickCount++;
    if (this.dirtyTxCount > 0 || this.queueCount > 0) {
      this.stepGateDelayOnce();
    }
  }

  stepFullCycle(): void {
    this.stepHalfCycle();
    this.stepHalfCycle();
  }

  stepBatch(ticks: number): void {
    const count = Math.max(0, Math.floor(ticks));
    for (let i = 0; i < count; i++) {
      this.tickCount++;
      if (this.dirtyTxCount > 0 || this.queueCount > 0) {
        this.stepGateDelayOnce();
      } else {
        // Nothing dirty; fast-forward remaining ticks in O(1)
        this.tickCount += count - 1 - i;
        break;
      }
    }
  }

  setToggleState(compId: string, state: boolean): void {
    const indices = this.toggleByCompId.get(compId);
    if (!indices || indices.length === 0) return;

    const desired = state ? 1 : 0;
    let changed = false;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (this.sourceState[idx] !== desired) {
        this.applySourceBit(idx, desired);
        changed = true;
      }
    }
    if (changed) {
      this.settle();
    }
  }

  setPushButtonState(compId: string, pressed: boolean): void {
    const indices = this.buttonByCompId.get(compId);
    if (!indices || indices.length === 0) return;

    const desired = pressed ? 1 : 0;
    let changed = false;
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      if (this.sourceState[idx] !== desired) {
        this.applySourceBit(idx, desired);
        changed = true;
      }
    }
    if (changed) {
      this.settle();
    }
  }

  getSnapshot(): SimulationSnapshot {
    const now = performance.now();
    const dtMs = now - this.lastRateTime;
    const dTicks = this.tickCount - this.lastRateTick;

    if (dtMs >= 250 || (dTicks >= 100 && dtMs >= 50)) {
      this.effectiveHz = dTicks > 0 ? Math.round(dTicks / (dtMs * 0.001)) : 0;
      this.lastRateTime = now;
      this.lastRateTick = this.tickCount;
    }

    return {
      transistors: this.transistors,
      gpuBuffers: this.gpuBuffersView,
      backend: this.backend,
      gpuDeviceName: this.gpuDeviceName,
      compToTxIndex: this.compiled.compToTxIndex,
      netValues: this.netValues,
      pinToNet: this.compiled.pinToNet,
      wireToNet: this.compiled.wireToNet,
      tickCount: this.tickCount,
      effectiveHz: this.effectiveHz,
      transistorCount: this.compiled.transistorCount,
      netCount: this.compiled.netCount,
      islandCount: this.compiled.islandCount,
      hasShortCircuit: this.hasShortCircuit,
    };
  }

  getCompiled(): CompiledCircuit {
    return this.compiled;
  }

  getBackendType(): ComputeBackendType {
    return this.backend;
  }

  getDeviceName(): string {
    return this.gpuDeviceName;
  }

  setBackendInfo(backend: ComputeBackendType, deviceName?: string): void {
    this.backend = backend;
    if (deviceName !== undefined) {
      this.gpuDeviceName = deviceName;
    }
  }

  /**
   * Returns flat Uint32Array GPU buffers ready for direct zero-copy upload to WebGPU or Tauri wgpu:
   * - `transistorBuffer`: `[gate_node_id, drain_node_id, source_node_id, type]` (stride 4)
   * - `nodeVoltageBuffer`: `0=GND/LOW, 1=VCC/HIGH, 2=Floating/Z, 3=WEAK_LOW, 4=WEAK_HIGH, 5=ERR`
   * - `nodeStaticMaskBuffer`: static pull/rail mask per node (including interactive toggle/button state)
   */
  getGpuFlatBuffers(): GpuFlatBuffers {
    return this.gpuBuffersView;
  }

  /**
   * Synchronizes state back from WebGPU or Tauri Rust wgpu compute buffers into the local SoA state.
   */
  syncFromGpuBuffers(
    nodeVoltageBuf: Uint32Array | ArrayLike<number>,
    txStateBuf?: Uint32Array | Uint8Array | ArrayLike<number>,
    tickCount?: number,
    effectiveHz?: number,
    hasShortCircuit?: boolean,
  ): void {
    const netCount = Math.min(this.netValues.length, nodeVoltageBuf.length);
    let errCount = 0;
    for (let n = 0; n < netCount; n++) {
      const gpuV = nodeVoltageBuf[n] >>> 0;
      const clampedV = gpuV <= 5 ? gpuV : 2;
      this.gpuNodeVoltageBuffer[n] = clampedV;
      const logicV = GPU_VOLTAGE_TO_LOGIC[clampedV];
      this.netValues[n] = logicV;
      if (logicV === LogicValue.ERR) errCount++;
    }
    this.errorNetCount = errCount;

    if (txStateBuf) {
      const txCount = Math.min(this.txState.length, txStateBuf.length);
      for (let t = 0; t < txCount; t++) {
        this.txState[t] = txStateBuf[t] ? 1 : 0;
      }
    }

    if (tickCount !== undefined) this.tickCount = tickCount;
    if (effectiveHz !== undefined) this.effectiveHz = effectiveHz;
    this.hasShortCircuit = hasShortCircuit !== undefined ? hasShortCircuit : errCount > 0;
  }

  getPinValue(compIdOrScope: string, pinIdOrCompId: string, maybePinId?: string): LogicValue {
    const key =
      maybePinId !== undefined
        ? `${compIdOrScope}${pinIdOrCompId}:${maybePinId}`
        : `${compIdOrScope}:${pinIdOrCompId}`;
    let netId = this.compiled.pinToNet.get(key);
    if (netId === undefined && maybePinId !== undefined && compIdOrScope.length > 0) {
      netId = this.compiled.pinToNet.get(`${pinIdOrCompId}:${maybePinId}`);
    }
    if (netId === undefined) return LogicValue.Z;
    return this.netValues[netId] as LogicValue;
  }

  getWireValue(wireIdOrScope: string, maybeWireId?: string): LogicValue {
    const key =
      maybeWireId !== undefined ? `${wireIdOrScope}${maybeWireId}` : wireIdOrScope;
    let netId = this.compiled.wireToNet.get(key);
    if (netId === undefined && maybeWireId !== undefined && wireIdOrScope.length > 0) {
      netId = this.compiled.wireToNet.get(maybeWireId);
    }
    if (netId === undefined) return LogicValue.Z;
    return this.netValues[netId] as LogicValue;
  }

  getTransistorState(compId: string): number {
    const txIdx = this.compiled.compToTxIndex.get(compId);
    if (txIdx === undefined) return 0;
    return this.txState[txIdx];
  }

  /**
   * Synchronizes raw buffer state transferred from the dedicated Web Worker (`simWorker.ts`).
   */
  syncFromWorker(
    tickCount: number,
    effectiveHz: number,
    hasShortCircuit: boolean,
    netValuesBuf: Uint8Array,
    txStateBuf: Uint8Array,
  ): void {
    if (netValuesBuf.length === this.netValues.length) {
      this.netValues.set(netValuesBuf);
      for (let n = 0; n < netValuesBuf.length; n++) {
        this.gpuNodeVoltageBuffer[n] = LOGIC_TO_GPU_VOLTAGE[netValuesBuf[n]];
      }
    }
    if (txStateBuf.length === this.txState.length) {
      this.txState.set(txStateBuf);
    }
    this.tickCount = tickCount;
    this.effectiveHz = effectiveHz;
    this.hasShortCircuit = hasShortCircuit;
  }

  private setNetValue(netId: number, newVal: number): boolean {
    const oldVal = this.netValues[netId];
    if (oldVal === newVal) return false;
    if (oldVal === LogicValue.ERR) this.errorNetCount--;
    if (newVal === LogicValue.ERR) this.errorNetCount++;
    this.netValues[netId] = newVal;
    this.gpuNodeVoltageBuffer[netId] = LOGIC_TO_GPU_VOLTAGE[newVal];
    return true;
  }

  private enqueueIsland(islandId: number): void {
    if (this.inQueue[islandId] === 0) {
      this.inQueue[islandId] = 1;
      this.dirtyQueue[this.queueTail++] = islandId;
      if (this.queueTail === this.dirtyQueue.length) this.queueTail = 0;
      this.queueCount++;
    }
  }

  private enqueueDirtyTx(txIdx: number): void {
    if (this.inDirtyTxQueue[txIdx] === 0) {
      this.inDirtyTxQueue[txIdx] = 1;
      this.dirtyTxQueue[this.txQueueTail++] = txIdx;
      if (this.txQueueTail === this.dirtyTxQueue.length) this.txQueueTail = 0;
      this.dirtyTxCount++;
    }
  }

  private enqueueIslandsFromOffsetTable(
    offsets: Int32Array,
    ids: Int32Array,
    netId: number,
  ): void {
    const start = offsets[netId];
    const end = offsets[netId + 1];
    for (let i = start; i < end; i++) {
      this.enqueueIsland(ids[i]);
    }
  }

  private enqueueGateDependentsForSettle(netId: number, gateVal: number): void {
    const {
      gateNetTxOffsets,
      gateNetTxIds,
      txType,
      txToIsland,
    } = this.compiled;
    const txState = this.txState;
    const start = gateNetTxOffsets[netId];
    const end = gateNetTxOffsets[netId + 1];

    for (let i = start; i < end; i++) {
      const tx = gateNetTxIds[i];
      const desired =
        txType[tx] === 1
          ? gateVal === LogicValue.LOW || gateVal === LogicValue.WEAK_LOW
            ? 1
            : 0
          : gateVal === LogicValue.HIGH || gateVal === LogicValue.WEAK_HIGH
            ? 1
            : 0;

      if (desired !== txState[tx]) {
        const isl = txToIsland[tx];
        if (isl >= 0) {
          if (isl !== this.currentSettlingIsland && this.islandFlipCount[isl] < MAX_SETTLE_FLIPS) {
            this.enqueueIsland(isl);
          } else {
            this.enqueueDirtyTx(tx);
          }
        }
      }
    }
  }

  private enqueueGateDependentsForNextTick(netId: number, gateVal: number): void {
    const { gateNetTxOffsets, gateNetTxIds, txType } = this.compiled;
    const txState = this.txState;
    const start = gateNetTxOffsets[netId];
    const end = gateNetTxOffsets[netId + 1];

    for (let i = start; i < end; i++) {
      const tx = gateNetTxIds[i];
      const desired =
        txType[tx] === 1
          ? gateVal === LogicValue.LOW || gateVal === LogicValue.WEAK_LOW
            ? 1
            : 0
          : gateVal === LogicValue.HIGH || gateVal === LogicValue.WEAK_HIGH
            ? 1
            : 0;

      if (desired !== txState[tx]) {
        this.enqueueDirtyTx(tx);
      }
    }
  }

  private applySourceBit(srcIdx: number, newBit: number): void {
    const oldBit = this.sourceState[srcIdx];
    this.sourceState[srcIdx] = newBit;
    const netId = this.sourceNets[srcIdx];

    if (oldBit === 1) {
      this.netDynamicHighCount[netId]--;
      this.netDynamicLowCount[netId]++;
    } else {
      this.netDynamicLowCount[netId]--;
      this.netDynamicHighCount[netId]++;
    }

    const {
      netToIsland,
      staticDriveMask,
      isRailNet,
      railNetIslandOffsets,
      railNetIslandIds,
    } = this.compiled;

    let mask = staticDriveMask[netId];
    if (this.netDynamicHighCount[netId] > 0) mask |= 2;
    if (this.netDynamicLowCount[netId] > 0) mask |= 1;
    this.gpuNodeStaticMaskBuffer[netId] = mask;

    const isl = netToIsland[netId];
    if (isl >= 0) {
      this.enqueueIsland(isl);
      return;
    }

    const newVal = DRIVE_LUT[mask];
    if (this.setNetValue(netId, newVal)) {
      this.enqueueGateDependentsForSettle(netId, newVal);
      if (isRailNet[netId] === 1) {
        this.enqueueIslandsFromOffsetTable(railNetIslandOffsets, railNetIslandIds, netId);
      }
    }
  }

  /**
   * Executes one synchronous unit-gate-delay wave step:
   * 1. All transistors currently in `dirtyTxQueue` switch their `txState` according to their current gate net value.
   * 2. Affected Switch Islands re-evaluate source-drain conduction immediately via Union-Find.
   * 3. Any net that changes value queues downstream gated transistors into `dirtyTxQueue` for the next tick.
   */
  private stepGateDelayOnce(): void {
    const {
      txGateNode,
      txType,
      txToIsland,
      railBridgeCount,
    } = this.compiled;
    const netValues = this.netValues;
    const txState = this.txState;
    const txQLen = this.dirtyTxQueue.length;

    let pendingTx = this.dirtyTxCount;
    let railBridgeTouched = false;

    while (pendingTx > 0) {
      pendingTx--;
      const tx = this.dirtyTxQueue[this.txQueueHead++];
      if (this.txQueueHead === txQLen) this.txQueueHead = 0;
      this.dirtyTxCount--;
      this.inDirtyTxQueue[tx] = 0;

      const gateVal = netValues[txGateNode[tx]];
      const desired =
        txType[tx] === 1
          ? gateVal === LogicValue.LOW || gateVal === LogicValue.WEAK_LOW
            ? 1
            : 0
          : gateVal === LogicValue.HIGH || gateVal === LogicValue.WEAK_HIGH
            ? 1
            : 0;

      if (desired !== txState[tx]) {
        txState[tx] = desired;
        const isl = txToIsland[tx];
        if (isl >= 0) {
          this.enqueueIsland(isl);
        } else {
          railBridgeTouched = true;
        }
      }
    }

    const qLen = this.dirtyQueue.length;
    while (this.queueCount > 0) {
      const islandId = this.dirtyQueue[this.queueHead++];
      if (this.queueHead === qLen) this.queueHead = 0;
      this.queueCount--;
      this.inQueue[islandId] = 0;

      this.evaluateIslandConduction(islandId, false);
    }

    if (railBridgeCount > 0 && (railBridgeTouched || this.railBridgeWasActive)) {
      this.evaluateRailBridges(false);
    }

    this.hasShortCircuit = this.errorNetCount > 0;
  }

  /**
   * Settles combinational and sequential logic after `reset()`, `setToggleState()`, or `setPushButtonState()`.
   * Acyclic combinational cones settle completely to fixed-point in 1 call; cyclic oscillators (e.g. 3T/5T Ring
   * Oscillators) halt after `MAX_SETTLE_FLIPS` on the wavefront island and queue the wave transistor into `dirtyTxQueue`.
   */
  private settle(): void {
    const {
      railBridgeCount,
      railBridgeNetA,
      railBridgeNetB,
    } = this.compiled;

    if (this.railBridgeWasActive && railBridgeCount > 0) {
      for (let i = 0; i < railBridgeCount; i++) {
        this.restoreRailNetBaseValue(railBridgeNetA[i]);
        this.restoreRailNetBaseValue(railBridgeNetB[i]);
      }
    }

    this.runSettleQueue();

    if (railBridgeCount > 0) {
      this.evaluateRailBridges(true);
    }

    // Reset flip counters only for the islands visited during this settle pass (O(visited))
    for (let i = 0; i < this.settledIslandCount; i++) {
      this.islandFlipCount[this.settledIslands[i]] = 0;
    }
    this.settledIslandCount = 0;

    this.hasShortCircuit = this.errorNetCount > 0;
  }

  private runSettleQueue(): void {
    const qLen = this.dirtyQueue.length;
    while (this.queueCount > 0) {
      const islandId = this.dirtyQueue[this.queueHead++];
      if (this.queueHead === qLen) this.queueHead = 0;
      this.queueCount--;
      this.inQueue[islandId] = 0;

      this.currentSettlingIsland = islandId;
      this.updateIslandTransistorStatesForSettle(islandId);
      this.evaluateIslandConduction(islandId, true);
      this.currentSettlingIsland = -1;
    }
  }

  private updateIslandTransistorStatesForSettle(islandId: number): void {
    const {
      islandTxOffsets,
      islandTxIds,
      txGateNode,
      txType,
    } = this.compiled;
    const netValues = this.netValues;
    const txState = this.txState;

    const start = islandTxOffsets[islandId];
    const end = islandTxOffsets[islandId + 1];
    const canFlip = this.islandFlipCount[islandId] < MAX_SETTLE_FLIPS;
    let flippedAny = false;

    for (let i = start; i < end; i++) {
      const tx = islandTxIds[i];
      const gateVal = netValues[txGateNode[tx]];
      const desired =
        txType[tx] === 1
          ? gateVal === LogicValue.LOW || gateVal === LogicValue.WEAK_LOW
            ? 1
            : 0
          : gateVal === LogicValue.HIGH || gateVal === LogicValue.WEAK_HIGH
            ? 1
            : 0;

      if (desired !== txState[tx]) {
        const gNet = txGateNode[tx];
        const gateFromSameIsland = this.compiled.netToIsland[gNet] === islandId;
        if (canFlip && !gateFromSameIsland) {
          txState[tx] = desired;
          flippedAny = true;
        } else {
          this.enqueueDirtyTx(tx);
        }
      }
    }

    if (flippedAny) {
      if (this.islandFlipCount[islandId] === 0) {
        this.settledIslands[this.settledIslandCount++] = islandId;
      }
      this.islandFlipCount[islandId]++;
    }
  }

  private evaluateIslandConduction(islandId: number, isSettling: boolean): void {
    const {
      islandNetOffsets,
      islandNetIds,
      islandRailTxOffsets,
      railTxIdx,
      railTxNonRailNet,
      railTxRailNet,
      islandIntTxOffsets,
      intTxIdx,
      intTxNetA,
      intTxNetB,
      staticDriveMask,
    } = this.compiled;

    const netValues = this.netValues;
    const txState = this.txState;
    const netDynamicHighCount = this.netDynamicHighCount;
    const netDynamicLowCount = this.netDynamicLowCount;
    const ufParent = this.ufParent;
    const ufMask = this.ufMask;

    const netStart = islandNetOffsets[islandId];
    const netEnd = islandNetOffsets[islandId + 1];

    for (let i = netStart; i < netEnd; i++) {
      const n = islandNetIds[i];
      ufParent[n] = n;
      let mask = staticDriveMask[n];
      if (netDynamicHighCount[n] > 0) mask |= 2;
      if (netDynamicLowCount[n] > 0) mask |= 1;
      ufMask[n] = mask;
    }

    const railStart = islandRailTxOffsets[islandId];
    const railEnd = islandRailTxOffsets[islandId + 1];
    for (let i = railStart; i < railEnd; i++) {
      if (txState[railTxIdx[i]] === 1) {
        const r = railTxRailNet[i];
        let rMask = staticDriveMask[r];
        if (netDynamicHighCount[r] > 0) rMask |= 2;
        if (netDynamicLowCount[r] > 0) rMask |= 1;
        ufMask[railTxNonRailNet[i]] |= rMask;
      }
    }

    const intStart = islandIntTxOffsets[islandId];
    const intEnd = islandIntTxOffsets[islandId + 1];
    for (let i = intStart; i < intEnd; i++) {
      if (txState[intTxIdx[i]] === 1) {
        let a = intTxNetA[i];
        while (ufParent[a] !== a) {
          ufParent[a] = ufParent[ufParent[a]];
          a = ufParent[a];
        }
        let b = intTxNetB[i];
        while (ufParent[b] !== b) {
          ufParent[b] = ufParent[ufParent[b]];
          b = ufParent[b];
        }
        if (a !== b) {
          ufParent[b] = a;
          ufMask[a] |= ufMask[b];
        }
      }
    }

    for (let i = netStart; i < netEnd; i++) {
      const n = islandNetIds[i];
      let r = n;
      while (ufParent[r] !== r) r = ufParent[r];
      const newVal = DRIVE_LUT[ufMask[r]];

      if (newVal !== netValues[n]) {
        this.setNetValue(n, newVal);
        if (isSettling) {
          this.enqueueGateDependentsForSettle(n, newVal);
        } else {
          this.enqueueGateDependentsForNextTick(n, newVal);
        }
      }
    }
  }

  private evaluateRailBridges(isSettling: boolean): void {
    const {
      railBridgeCount,
      railBridgeTxIdx,
      railBridgeIsPmos,
      railBridgeGateNet,
      railBridgeNetA,
      railBridgeNetB,
      staticDriveMask,
      isRailNet,
      gateNetIslandOffsets,
      gateNetIslandIds,
      railNetIslandOffsets,
      railNetIslandIds,
    } = this.compiled;

    if (!isSettling && this.railBridgeWasActive) {
      for (let i = 0; i < railBridgeCount; i++) {
        this.restoreRailNetBaseValue(railBridgeNetA[i]);
        this.restoreRailNetBaseValue(railBridgeNetB[i]);
      }
    }

    let railBridgeActive = false;
    let anyRailChanged = false;

    for (let i = 0; i < railBridgeCount; i++) {
      const gNet = railBridgeGateNet[i];
      let gateVal: number;
      if (isRailNet[gNet] === 1) {
        let gMask = staticDriveMask[gNet];
        if (this.netDynamicHighCount[gNet] > 0) gMask |= 2;
        if (this.netDynamicLowCount[gNet] > 0) gMask |= 1;
        gateVal = DRIVE_LUT[gMask];
      } else {
        gateVal = this.netValues[gNet];
      }

      const isPmos = railBridgeIsPmos[i] === 1;
      const conducts = isPmos
        ? gateVal === LogicValue.LOW || gateVal === LogicValue.WEAK_LOW
        : gateVal === LogicValue.HIGH || gateVal === LogicValue.WEAK_HIGH;

      this.txState[railBridgeTxIdx[i]] = conducts ? 1 : 0;
      if (!conducts) continue;

      const a = railBridgeNetA[i];
      const b = railBridgeNetB[i];

      let maskA = staticDriveMask[a];
      if (this.netDynamicHighCount[a] > 0) maskA |= 2;
      if (this.netDynamicLowCount[a] > 0) maskA |= 1;

      let maskB = staticDriveMask[b];
      if (this.netDynamicHighCount[b] > 0) maskB |= 2;
      if (this.netDynamicLowCount[b] > 0) maskB |= 1;

      if (((maskA | maskB) & 3) === 3) {
        railBridgeActive = true;

        if (this.setNetValue(a, LogicValue.ERR)) {
          this.enqueueIslandsFromOffsetTable(gateNetIslandOffsets, gateNetIslandIds, a);
          this.enqueueIslandsFromOffsetTable(railNetIslandOffsets, railNetIslandIds, a);
          anyRailChanged = true;
        }
        if (this.setNetValue(b, LogicValue.ERR)) {
          this.enqueueIslandsFromOffsetTable(gateNetIslandOffsets, gateNetIslandIds, b);
          this.enqueueIslandsFromOffsetTable(railNetIslandOffsets, railNetIslandIds, b);
          anyRailChanged = true;
        }
      }
    }

    this.railBridgeWasActive = railBridgeActive;
    if (anyRailChanged && this.queueCount > 0) {
      const qLen = this.dirtyQueue.length;
      for (let cycle = 0; cycle < MAX_RAIL_DELTA_CYCLES && this.queueCount > 0; cycle++) {
        let rem = this.queueCount;
        while (rem > 0) {
          rem--;
          const isl = this.dirtyQueue[this.queueHead++];
          if (this.queueHead === qLen) this.queueHead = 0;
          this.queueCount--;
          this.inQueue[isl] = 0;
          this.updateIslandTransistorStatesForSettle(isl);
          this.evaluateIslandConduction(isl, true);
        }
      }
    }
  }

  private restoreRailNetBaseValue(netId: number): void {
    let mask = this.compiled.staticDriveMask[netId];
    if (this.netDynamicHighCount[netId] > 0) mask |= 2;
    if (this.netDynamicLowCount[netId] > 0) mask |= 1;
    const baseVal = DRIVE_LUT[mask];
    if (this.setNetValue(netId, baseVal)) {
      this.enqueueIslandsFromOffsetTable(
        this.compiled.gateNetIslandOffsets,
        this.compiled.gateNetIslandIds,
        netId,
      );
      this.enqueueIslandsFromOffsetTable(
        this.compiled.railNetIslandOffsets,
        this.compiled.railNetIslandIds,
        netId,
      );
    }
  }

  /**
   * Detects closed complementary CMOS feedback loops (such as a 3-stage CMOS Ring Oscillator without pull-ups)
   * where every node in the loop starts at Z because every gate in the loop is driven by another Z island in the loop,
   * and breaks symmetry on the first loop node without touching unconnected floating gate pins.
   */
  private kickstartFloatingFeedbackLoops(): void {
    const {
      islandCount,
      islandTxOffsets,
      islandTxIds,
      islandNetOffsets,
      islandNetIds,
      txGateNode,
      txType,
      netToIsland,
      gateNetTxOffsets,
    } = this.compiled;

    for (let isl = 0; isl < islandCount; isl++) {
      const txStart = islandTxOffsets[isl];
      const txEnd = islandTxOffsets[isl + 1];
      if (txEnd - txStart < 2) continue;

      let hasPmos = false;
      let hasNmos = false;
      let allGatesFromFloatingIslands = true;

      for (let i = txStart; i < txEnd; i++) {
        const tx = islandTxIds[i];
        if (txType[tx] === 1) hasPmos = true;
        else hasNmos = true;

        const gNet = txGateNode[tx];
        if (netToIsland[gNet] < 0 || this.netValues[gNet] !== LogicValue.Z) {
          allGatesFromFloatingIslands = false;
          break;
        }
      }

      if (!hasPmos || !hasNmos || !allGatesFromFloatingIslands) continue;

      // Seed the first output net of this complementary island that drives downstream gates
      const netStart = islandNetOffsets[isl];
      const netEnd = islandNetOffsets[isl + 1];
      for (let i = netStart; i < netEnd; i++) {
        const n = islandNetIds[i];
        if (this.netValues[n] === LogicValue.Z && gateNetTxOffsets[n + 1] > gateNetTxOffsets[n]) {
          this.setNetValue(n, LogicValue.LOW);
          this.enqueueGateDependentsForSettle(n, LogicValue.LOW);
          this.settle();
          break;
        }
      }
    }
  }
}
