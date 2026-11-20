/**
 * Six-state switch-level MOS logic value lattice.
 * Numeric representation enables fast compact storage inside Uint8Array net buffers.
 */
export const LogicValue = {
  Z: 0,
  LOW: 1,
  HIGH: 2,
  WEAK_LOW: 3,
  WEAK_HIGH: 4,
  ERR: 5,
} as const;

export type LogicValue = (typeof LogicValue)[keyof typeof LogicValue];

/** True when logic level resolves to digital 1 (strong or weak pull-up). */
export function isHigh(v: LogicValue): boolean {
  return v === LogicValue.HIGH || v === LogicValue.WEAK_HIGH;
}

/** True when logic level resolves to digital 0 (strong or weak pull-down). */
export function isLow(v: LogicValue): boolean {
  return v === LogicValue.LOW || v === LogicValue.WEAK_LOW;
}

/** True when logic level is strongly driven (LOW or HIGH). */
export function isStrong(v: LogicValue): boolean {
  return v === LogicValue.LOW || v === LogicValue.HIGH;
}

/** True when a short-circuit contention error is present on the net. */
export function isError(v: LogicValue): boolean {
  return v === LogicValue.ERR;
}

/** Human-readable label for a LogicValue state. */
export function logicValueLabel(v: LogicValue): string {
  switch (v) {
    case LogicValue.Z:
      return 'Z (High-Impedance)';
    case LogicValue.LOW:
      return 'LOW (0)';
    case LogicValue.HIGH:
      return 'HIGH (1)';
    case LogicValue.WEAK_LOW:
      return 'WEAK LOW (0)';
    case LogicValue.WEAK_HIGH:
      return 'WEAK HIGH (1)';
    case LogicValue.ERR:
      return 'ERR (Short)';
  }
}

/**
 * PureSilicon allowed physical components.
 * Zero black-box ICs, zero ready-made logic gates, zero artificial clocks.
 */
export type ComponentType =
  | 'NMOS'
  | 'PMOS'
  | 'PULL_UP'
  | 'PULL_DOWN'
  | 'VCC'
  | 'GND'
  | 'TOGGLE_SWITCH'
  | 'PUSH_BUTTON'
  | 'LED'
  | 'PIXEL_MATRIX';

export type PinSide = 'left' | 'right' | 'top' | 'bottom';

export type PinRole = 'input' | 'output' | 'bidirectional' | 'power';

export interface PinDef {
  id: string;
  label: string;
  side: PinSide;
  offsetX: number;
  offsetY: number;
  role: PinRole;
}

export interface ComponentProps {
  label?: string;
  state?: boolean;
  keyBinding?: string;
  color?: 'cyan' | 'green' | 'amber' | 'red';
  matrixSize?: 4 | 8;
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  props: ComponentProps;
}

export interface Point {
  x: number;
  y: number;
}

export interface WireEndpoint {
  componentId: string;
  pinId: string;
}

export interface Wire {
  id: string;
  from: WireEndpoint;
  to: WireEndpoint;
  waypoints?: Point[];
  color?: string;
}

export interface CircuitDocument {
  version: 1;
  name: string;
  components: CircuitComponent[];
  wires: Wire[];
}

export interface CircuitPreset {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  controlsHint?: string;
  defaultClockHz: number;
  initialViewport?: { x: number; y: number; zoom: number };
  document: CircuitDocument;
}

/**
 * Active simulation compute backend identifier.
 */
export type ComputeBackendType =
  | 'WebGPU (WGSL Compute)'
  | 'Native Vulkan/DX12/CUDA (Tauri)'
  | 'SharedArrayBuffer Worker'
  | 'CPU Fallback (SoA Worker)';

/**
 * Flat GPU buffer layout for Two-Pass Parallel Transistor Solver:
 * - `transistorBuffer`: packed `Uint32Array` of stride 4 per transistor:
 *   `[gate_node_id, drain_node_id, source_node_id, type (0=NMOS, 1=PMOS)]`
 * - `nodeVoltageBuffer`: `Uint32Array` of node states (`0` = GND/LOW, `1` = VCC/HIGH, `2` = Floating/Z, `3` = WEAK_LOW, `4` = WEAK_HIGH, `5` = ERR)
 * - `nodeStaticMaskBuffer`: `Uint32Array` static pull/rail mask per node
 */
export interface GpuFlatBuffers {
  transistorBuffer: Uint32Array;
  nodeVoltageBuffer: Uint32Array;
  nodeStaticMaskBuffer: Uint32Array;
}

/**
 * Data-Oriented Design Structure of Arrays (SoA) for 1,000,000+ transistors.
 */
export interface TransistorSoA {
  count: number;
  gateNode: Int32Array;
  drainNode: Int32Array;
  sourceNode: Int32Array;
  type: Uint8Array; // 0 = NMOS, 1 = PMOS
  state: Uint8Array; // 0 = OFF (open), 1 = ON (conducting)
}

export interface SimulationSnapshot {
  transistors: TransistorSoA;
  gpuBuffers?: GpuFlatBuffers;
  backend?: ComputeBackendType;
  gpuDeviceName?: string;
  compToTxIndex?: Map<string, number>;
  netValues: Uint8Array;
  pinToNet: Map<string, number>;
  wireToNet: Map<string, number>;
  tickCount: number;
  effectiveHz: number;
  transistorCount: number;
  netCount: number;
  islandCount: number;
  hasShortCircuit: boolean;
}
