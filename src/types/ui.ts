import type {
  CircuitDocument,
  ComponentProps,
  ComponentType,
  ComputeBackendType,
  LogicValue,
  SimulationSnapshot,
  Wire,
} from './circuit';

export const GRID_SIZE = 20;

export type ToolMode = 'select' | 'pan' | 'place';

export type WireStyle = 'orthogonal' | 'bezier';

/**
 * Canvas camera transform where `screenX = worldX * zoom + viewport.x`
 * and `screenY = worldY * zoom + viewport.y`.
 */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface HoverProbe {
  screenX: number;
  screenY: number;
  title: string;
  subtitle?: string;
  value: LogicValue;
  netId: number | null;
}

export interface SelectionState {
  componentIds: Set<string>;
  wireIds: Set<string>;
}

export interface PendingPlacement {
  type: ComponentType;
  props?: ComponentProps;
}

export interface ISimulator {
  loadDocument(doc: CircuitDocument): void;
  reset(): void;
  stepHalfCycle(): void;
  stepFullCycle(): void;
  stepBatch?(ticks: number): void;
  setToggleState(compId: string, state: boolean): void;
  setPushButtonState(compId: string, pressed: boolean): void;
  getSnapshot(): SimulationSnapshot;
  getPinValue(compIdOrScope: string, pinIdOrCompId: string, maybePinId?: string): LogicValue;
  getWireValue(wireIdOrScope: string, maybeWireId?: string): LogicValue;
  getTransistorState?(compId: string): number;
  getBackendType?(): ComputeBackendType;
  getDeviceName?(): string;
  destroy?(): void;
}

export interface SimulationStats {
  tickCount: number;
  effectiveHz: number;
  fps: number;
  transistorCount: number;
  netCount: number;
  islandCount: number;
  hasShortCircuit: boolean;
  backend?: ComputeBackendType;
  gpuDeviceName?: string;
  renderMode?: 'WebGL2 Instanced' | 'Canvas2D Fallback';
}

export interface CanvasViewportProps {
  document: CircuitDocument;
  simulationRef: { current: ISimulator | null };
  viewport: Viewport;
  onViewportChange: (vp: Viewport) => void;
  toolMode: ToolMode;
  pendingPlacement: PendingPlacement | null;
  onClearPlacement: () => void;
  wireStyle: WireStyle;
  selection: SelectionState;
  onSelectionChange: (sel: SelectionState) => void;
  isRunning: boolean;
  clockHz: number;
  onHoverProbe: (probe: HoverProbe | null) => void;
  onStatsUpdate: (stats: SimulationStats) => void;
  onAddComponent: (type: ComponentType, x: number, y: number, props?: ComponentProps) => void;
  onMoveComponents: (moves: Array<{ id: string; x: number; y: number }>) => void;
  onAddWire: (wire: Omit<Wire, 'id'>) => void;
  onDeleteSelection: (sel: SelectionState) => void;
  onToggleSwitch: (compId: string, nextState: boolean) => void;
  onPushButton: (compId: string, pressed: boolean) => void;
  onRotateSelection: () => void;
}
