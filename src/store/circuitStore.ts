import { useCallback, useReducer, type Dispatch } from 'react';
import type {
  CircuitComponent,
  CircuitDocument,
  ComponentProps,
  ComponentType,
  Point,
  Wire,
} from '../types/circuit';
import { GRID_SIZE, type SelectionState } from '../types/ui';

export const MAX_HISTORY = 100;

export const VALID_COMPONENT_TYPES = new Set<ComponentType>([
  'NMOS',
  'PMOS',
  'PULL_UP',
  'PULL_DOWN',
  'VCC',
  'GND',
  'TOGGLE_SWITCH',
  'PUSH_BUTTON',
  'LED',
  'PIXEL_MATRIX',
]);

const VALID_ROTATIONS = new Set<number>([0, 90, 180, 270]);

export interface ClipboardData {
  components: CircuitComponent[];
  wires: Wire[];
  pasteCount: number;
}

export interface CircuitStoreState {
  document: CircuitDocument;
  past: CircuitDocument[];
  future: CircuitDocument[];
  clipboard: ClipboardData | null;
  lastAddedIds: string[];
  lastError: string | null;
  exportedJson: string | null;
}

export type CircuitAction =
  | { type: 'LOAD_DOCUMENT'; document: CircuitDocument }
  | {
      type: 'ADD_COMPONENT';
      componentType: ComponentType;
      x: number;
      y: number;
      props?: ComponentProps;
      rotation?: 0 | 90 | 180 | 270;
      id?: string;
    }
  | { type: 'MOVE_COMPONENTS'; moves: Array<{ id: string; x: number; y: number }> }
  | {
      type: 'ROTATE_SELECTION';
      componentIds: Set<string> | string[];
      delta?: 90 | 180 | 270;
    }
  | {
      type: 'UPDATE_COMPONENT_PROPS';
      id: string;
      props: Partial<ComponentProps>;
      recordHistory?: boolean;
    }
  | { type: 'ADD_WIRE'; wire: Omit<Wire, 'id'> & { id?: string } }
  | { type: 'DELETE_SELECTION'; selection: SelectionState }
  | { type: 'COPY'; componentIds: Set<string> | string[] }
  | { type: 'PASTE'; offset?: Point }
  | {
      type: 'DUPLICATE';
      componentIds: Set<string> | string[];
      offset?: Point;
      count?: number;
    }
  | {
      type: 'DUPLICATE_ARRAY';
      componentIds: Set<string> | string[];
      count: number;
    }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'EXPORT_JSON' }
  | { type: 'IMPORT_JSON'; json: string }
  | { type: 'CLEAR_ERROR' };

function snapToGrid(value: number): number {
  const snapped = Math.round(value / GRID_SIZE) * GRID_SIZE;
  return snapped === 0 ? 0 : snapped;
}

function toIdSet(ids: Set<string> | string[]): Set<string> {
  return ids instanceof Set ? ids : new Set(ids);
}

let idCounter = 1;

function nextUniqueId(prefix: string, used: Set<string>): string {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'item';
  let candidate = `${cleanPrefix}_${idCounter++}`;
  while (used.has(candidate)) {
    candidate = `${cleanPrefix}_${idCounter++}`;
  }
  used.add(candidate);
  return candidate;
}

function cloneComponent(c: CircuitComponent): CircuitComponent {
  return {
    ...c,
    props: { ...c.props },
  };
}

function cloneWire(w: Wire): Wire {
  return {
    ...w,
    from: { ...w.from },
    to: { ...w.to },
    waypoints: w.waypoints?.map((pt) => ({ x: pt.x, y: pt.y })),
  };
}

function pushHistory(
  state: CircuitStoreState,
  nextDoc: CircuitDocument,
  extra: Partial<CircuitStoreState> = {},
): CircuitStoreState {
  const nextPast = [...state.past, state.document];
  if (nextPast.length > MAX_HISTORY) {
    nextPast.splice(0, nextPast.length - MAX_HISTORY);
  }
  return {
    ...state,
    ...extra,
    document: nextDoc,
    past: nextPast,
    future: [],
    lastError: null,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidComponent(v: unknown): v is CircuitComponent {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.type !== 'string' || !VALID_COMPONENT_TYPES.has(v.type as ComponentType)) {
    return false;
  }
  if (typeof v.x !== 'number' || !Number.isFinite(v.x)) return false;
  if (typeof v.y !== 'number' || !Number.isFinite(v.y)) return false;
  if (typeof v.rotation !== 'number' || !VALID_ROTATIONS.has(v.rotation)) return false;
  if (!isPlainObject(v.props)) return false;
  return true;
}

function isValidWireEndpoint(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  return (
    typeof v.componentId === 'string' &&
    v.componentId.length > 0 &&
    typeof v.pinId === 'string' &&
    v.pinId.length > 0
  );
}

function isValidWire(v: unknown): v is Wire {
  if (!isPlainObject(v)) return false;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (!isValidWireEndpoint(v.from) || !isValidWireEndpoint(v.to)) return false;
  if (v.waypoints !== undefined) {
    if (!Array.isArray(v.waypoints)) return false;
    for (const pt of v.waypoints) {
      if (
        !isPlainObject(pt) ||
        typeof pt.x !== 'number' ||
        !Number.isFinite(pt.x) ||
        typeof pt.y !== 'number' ||
        !Number.isFinite(pt.y)
      ) {
        return false;
      }
    }
  }
  if (v.color !== undefined && typeof v.color !== 'string') return false;
  return true;
}

/**
 * Runtime schema validator for imported CircuitDocument JSON payloads.
 * Enforces PureSilicon zero-abstraction physical component types.
 */
export function parseAndValidateCircuitDocument(
  json: string,
): { ok: true; document: CircuitDocument } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Geçersiz JSON biçimi.' };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'Devre belgesi bir JSON nesnesi olmalıdır.' };
  }
  if (parsed.version !== 1) {
    return { ok: false, error: 'Desteklenmeyen devre sürümü (version: 1 bekleniyor).' };
  }
  if (typeof parsed.name !== 'string') {
    return { ok: false, error: 'Devre adı (name) eksik veya geçersiz.' };
  }
  if (!Array.isArray(parsed.components) || !parsed.components.every(isValidComponent)) {
    return {
      ok: false,
      error:
        'Bileşen listesi (components) geçersiz veya desteklenmeyen (kapalı kutu IC / hazır kapı) bileşen içeriyor.',
    };
  }
  if (!Array.isArray(parsed.wires) || !parsed.wires.every(isValidWire)) {
    return { ok: false, error: 'Kablo listesi (wires) geçersiz.' };
  }

  const doc: CircuitDocument = {
    version: 1,
    name: parsed.name,
    components: parsed.components,
    wires: parsed.wires,
  };

  return { ok: true, document: doc };
}

/** Serializes a CircuitDocument into formatted JSON. */
export function serializeCircuitDocument(doc: CircuitDocument): string {
  return JSON.stringify(
    {
      version: doc.version,
      name: doc.name,
      components: doc.components,
      wires: doc.wires,
    },
    null,
    2,
  );
}

/** Creates the initial store state for a given CircuitDocument. */
export function createInitialCircuitStoreState(
  initialDoc: CircuitDocument,
): CircuitStoreState {
  return {
    document: initialDoc,
    past: [],
    future: [],
    clipboard: null,
    lastAddedIds: [],
    lastError: null,
    exportedJson: null,
  };
}

function cloneAndOffsetItems(
  sourceComps: CircuitComponent[],
  sourceWires: Wire[],
  usedCompIds: Set<string>,
  usedWireIds: Set<string>,
  dx: number,
  dy: number,
): { components: CircuitComponent[]; wires: Wire[]; newIds: string[] } {
  const idMap = new Map<string, string>();
  const components: CircuitComponent[] = new Array(sourceComps.length);
  const newIds: string[] = new Array(sourceComps.length);

  for (let i = 0; i < sourceComps.length; i++) {
    const c = sourceComps[i];
    const newId = nextUniqueId(c.type, usedCompIds);
    idMap.set(c.id, newId);
    newIds[i] = newId;
    components[i] = {
      id: newId,
      type: c.type,
      x: snapToGrid(c.x + dx),
      y: snapToGrid(c.y + dy),
      rotation: c.rotation,
      props: { ...c.props },
    };
  }

  const wires: Wire[] = [];
  for (let i = 0; i < sourceWires.length; i++) {
    const w = sourceWires[i];
    const newFromId = idMap.get(w.from.componentId);
    const newToId = idMap.get(w.to.componentId);
    if (!newFromId || !newToId) continue;

    const newWireId = nextUniqueId('wire', usedWireIds);
    wires.push({
      id: newWireId,
      from: { componentId: newFromId, pinId: w.from.pinId },
      to: { componentId: newToId, pinId: w.to.pinId },
      waypoints: w.waypoints?.map((pt) => ({
        x: snapToGrid(pt.x + dx),
        y: snapToGrid(pt.y + dy),
      })),
      color: w.color,
    });
  }

  return { components, wires, newIds };
}

/**
 * High-speed O(N) array cloner that duplicates a raw transistor circuit block
 * `count` times onto the 20px silicon grid without any black-box IC wrapping.
 */
function duplicateSelectionArray(
  doc: CircuitDocument,
  selectedComps: CircuitComponent[],
  internalWires: Wire[],
  count: number,
  explicitOffset?: Point,
): { components: CircuitComponent[]; wires: Wire[]; newIds: string[] } {
  const copies = Math.max(1, Math.min(25_000, Math.floor(count)));
  const usedCompIds = new Set<string>(doc.components.map((c) => c.id));
  const usedWireIds = new Set<string>(doc.wires.map((w) => w.id));

  if (copies === 1) {
    const dx = explicitOffset?.x ?? 40;
    const dy = explicitOffset?.y ?? 40;
    return cloneAndOffsetItems(
      selectedComps,
      internalWires,
      usedCompIds,
      usedWireIds,
      dx,
      dy,
    );
  }

  // Compute selection bounding box for clean non-overlapping 2D silicon die tiling
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < selectedComps.length; i++) {
    const c = selectedComps[i];
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }

  const pitchX = Math.max(80, snapToGrid(maxX - minX + 100));
  const pitchY = Math.max(80, snapToGrid(maxY - minY + 100));
  const cols = Math.max(1, Math.ceil(Math.sqrt(copies)));

  const allComponents: CircuitComponent[] = [];
  const allWires: Wire[] = [];
  const allNewIds: string[] = [];

  for (let k = 0; k < copies; k++) {
    // Place grid starting one column to the right of the source block
    const col = k % cols;
    const row = Math.floor(k / cols);
    const dx = (col + 1) * pitchX;
    const dy = row * pitchY;

    const batch = cloneAndOffsetItems(
      selectedComps,
      internalWires,
      usedCompIds,
      usedWireIds,
      dx,
      dy,
    );

    for (let i = 0; i < batch.components.length; i++) {
      allComponents.push(batch.components[i]);
    }
    for (let i = 0; i < batch.wires.length; i++) {
      allWires.push(batch.wires[i]);
    }
    for (let i = 0; i < batch.newIds.length; i++) {
      allNewIds.push(batch.newIds[i]);
    }
  }

  return {
    components: allComponents,
    wires: allWires,
    newIds: allNewIds,
  };
}

/**
 * Pure immutable reducer managing physical transistor circuit edits,
 * undo/redo history, high-speed macro duplication, and JSON serialization.
 */
export function circuitReducer(
  state: CircuitStoreState,
  action: CircuitAction,
): CircuitStoreState {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        document: action.document,
        past: [],
        future: [],
        lastAddedIds: [],
        lastError: null,
      };

    case 'ADD_COMPONENT': {
      const usedCompIds = new Set(state.document.components.map((c) => c.id));
      const newId =
        action.id && !usedCompIds.has(action.id)
          ? action.id
          : nextUniqueId(action.componentType, usedCompIds);

      const newComp: CircuitComponent = {
        id: newId,
        type: action.componentType,
        x: snapToGrid(action.x),
        y: snapToGrid(action.y),
        rotation: action.rotation ?? 0,
        props: action.props ? { ...action.props } : {},
      };

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: [...state.document.components, newComp],
      };

      return pushHistory(state, nextDoc, { lastAddedIds: [newId] });
    }

    case 'MOVE_COMPONENTS': {
      if (action.moves.length === 0) return state;
      const moveMap = new Map<string, { x: number; y: number }>();
      for (const m of action.moves) {
        moveMap.set(m.id, { x: snapToGrid(m.x), y: snapToGrid(m.y) });
      }

      let changed = false;
      const nextComponents = state.document.components.map((comp) => {
        const target = moveMap.get(comp.id);
        if (!target) return comp;
        if (comp.x === target.x && comp.y === target.y) return comp;
        changed = true;
        return { ...comp, x: target.x, y: target.y };
      });

      if (!changed) return state;

      return pushHistory(state, {
        ...state.document,
        components: nextComponents,
      });
    }

    case 'ROTATE_SELECTION': {
      const ids = toIdSet(action.componentIds);
      if (ids.size === 0) return state;
      const delta = action.delta ?? 90;

      let changed = false;
      const nextComponents = state.document.components.map((comp) => {
        if (!ids.has(comp.id)) return comp;
        const nextRot = ((((comp.rotation + delta) % 360) + 360) % 360) as
          | 0
          | 90
          | 180
          | 270;
        if (nextRot === comp.rotation) return comp;
        changed = true;
        return { ...comp, rotation: nextRot };
      });

      if (!changed) return state;

      return pushHistory(state, {
        ...state.document,
        components: nextComponents,
      });
    }

    case 'UPDATE_COMPONENT_PROPS': {
      let changed = false;
      const nextComponents = state.document.components.map((comp) => {
        if (comp.id !== action.id) return comp;
        const mergedProps: ComponentProps = { ...comp.props, ...action.props };
        const keys = Object.keys(action.props) as Array<keyof ComponentProps>;
        const differs = keys.some((k) => comp.props[k] !== mergedProps[k]);
        if (!differs) return comp;
        changed = true;
        return { ...comp, props: mergedProps };
      });

      if (!changed) return state;

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: nextComponents,
      };

      if (action.recordHistory === false) {
        return {
          ...state,
          document: nextDoc,
          lastError: null,
        };
      }

      return pushHistory(state, nextDoc);
    }

    case 'ADD_WIRE': {
      const { from, to, waypoints, color, id: explicitId } = action.wire;
      if (from.componentId === to.componentId && from.pinId === to.pinId) {
        return state;
      }

      const duplicate = state.document.wires.some(
        (w) =>
          (w.from.componentId === from.componentId &&
            w.from.pinId === from.pinId &&
            w.to.componentId === to.componentId &&
            w.to.pinId === to.pinId) ||
          (w.from.componentId === to.componentId &&
            w.from.pinId === to.pinId &&
            w.to.componentId === from.componentId &&
            w.to.pinId === from.pinId),
      );
      if (duplicate) return state;

      const usedWireIds = new Set(state.document.wires.map((w) => w.id));
      const newId =
        explicitId && !usedWireIds.has(explicitId)
          ? explicitId
          : nextUniqueId('wire', usedWireIds);

      const newWire: Wire = {
        id: newId,
        from: { ...from },
        to: { ...to },
        waypoints: waypoints?.map((pt) => ({
          x: snapToGrid(pt.x),
          y: snapToGrid(pt.y),
        })),
        color,
      };

      return pushHistory(state, {
        ...state.document,
        wires: [...state.document.wires, newWire],
      });
    }

    case 'DELETE_SELECTION': {
      const compIds = action.selection.componentIds;
      const wireIds = action.selection.wireIds;
      if (compIds.size === 0 && wireIds.size === 0) return state;

      const nextComponents = state.document.components.filter(
        (c) => !compIds.has(c.id),
      );
      const nextWires = state.document.wires.filter(
        (w) =>
          !wireIds.has(w.id) &&
          !compIds.has(w.from.componentId) &&
          !compIds.has(w.to.componentId),
      );

      if (
        nextComponents.length === state.document.components.length &&
        nextWires.length === state.document.wires.length
      ) {
        return state;
      }

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: nextComponents,
        wires: nextWires,
      };

      return pushHistory(state, nextDoc);
    }

    case 'COPY': {
      const ids = toIdSet(action.componentIds);
      if (ids.size === 0) return state;

      const copiedComps = state.document.components
        .filter((c) => ids.has(c.id))
        .map(cloneComponent);
      if (copiedComps.length === 0) return state;

      const copiedWires = state.document.wires
        .filter((w) => ids.has(w.from.componentId) && ids.has(w.to.componentId))
        .map(cloneWire);

      return {
        ...state,
        clipboard: {
          components: copiedComps,
          wires: copiedWires,
          pasteCount: 0,
        },
      };
    }

    case 'PASTE': {
      if (!state.clipboard || state.clipboard.components.length === 0) {
        return state;
      }
      const nextCount = state.clipboard.pasteCount + 1;
      const dx = action.offset ? action.offset.x : 40 * nextCount;
      const dy = action.offset ? action.offset.y : 40 * nextCount;

      const usedCompIds = new Set(state.document.components.map((c) => c.id));
      const usedWireIds = new Set(state.document.wires.map((w) => w.id));

      const { components, wires, newIds } = cloneAndOffsetItems(
        state.clipboard.components,
        state.clipboard.wires,
        usedCompIds,
        usedWireIds,
        dx,
        dy,
      );

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: [...state.document.components, ...components],
        wires: [...state.document.wires, ...wires],
      };

      return pushHistory(state, nextDoc, {
        clipboard: {
          ...state.clipboard,
          pasteCount: nextCount,
        },
        lastAddedIds: newIds,
      });
    }

    case 'DUPLICATE': {
      const ids = toIdSet(action.componentIds);
      if (ids.size === 0) return state;

      const selectedComps = state.document.components.filter((c) => ids.has(c.id));
      if (selectedComps.length === 0) return state;

      const internalWires = state.document.wires.filter(
        (w) => ids.has(w.from.componentId) && ids.has(w.to.componentId),
      );

      const { components, wires, newIds } = duplicateSelectionArray(
        state.document,
        selectedComps,
        internalWires,
        action.count ?? 1,
        action.offset,
      );

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: [...state.document.components, ...components],
        wires: [...state.document.wires, ...wires],
      };

      return pushHistory(state, nextDoc, {
        lastAddedIds: newIds,
      });
    }

    case 'DUPLICATE_ARRAY': {
      const ids = toIdSet(action.componentIds);
      if (ids.size === 0) return state;

      const selectedComps = state.document.components.filter((c) => ids.has(c.id));
      if (selectedComps.length === 0) return state;

      const internalWires = state.document.wires.filter(
        (w) => ids.has(w.from.componentId) && ids.has(w.to.componentId),
      );

      const { components, wires, newIds } = duplicateSelectionArray(
        state.document,
        selectedComps,
        internalWires,
        action.count,
      );

      const nextDoc: CircuitDocument = {
        ...state.document,
        components: [...state.document.components, ...components],
        wires: [...state.document.wires, ...wires],
      };

      return pushHistory(state, nextDoc, {
        lastAddedIds: newIds,
      });
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prevDoc = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, -1);
      const nextFuture = [state.document, ...state.future].slice(0, MAX_HISTORY);

      return {
        ...state,
        document: prevDoc,
        past: nextPast,
        future: nextFuture,
        lastAddedIds: [],
        lastError: null,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const nextDoc = state.future[0];
      const nextFuture = state.future.slice(1);
      const nextPast = [...state.past, state.document];
      if (nextPast.length > MAX_HISTORY) {
        nextPast.splice(0, nextPast.length - MAX_HISTORY);
      }

      return {
        ...state,
        document: nextDoc,
        past: nextPast,
        future: nextFuture,
        lastAddedIds: [],
        lastError: null,
      };
    }

    case 'EXPORT_JSON':
      return {
        ...state,
        exportedJson: serializeCircuitDocument(state.document),
      };

    case 'IMPORT_JSON': {
      const validation = parseAndValidateCircuitDocument(action.json);
      if (!validation.ok) {
        return {
          ...state,
          lastError: validation.error,
        };
      }
      return {
        ...state,
        document: validation.document,
        past: [],
        future: [],
        lastAddedIds: [],
        lastError: null,
      };
    }

    case 'CLEAR_ERROR':
      return state.lastError ? { ...state, lastError: null } : state;
  }
}

export interface UseCircuitStoreReturn {
  state: CircuitStoreState;
  document: CircuitDocument;
  canUndo: boolean;
  canRedo: boolean;
  clipboard: ClipboardData | null;
  lastAddedIds: string[];
  lastError: string | null;
  exportedJson: string | null;
  dispatch: Dispatch<CircuitAction>;
  undo: () => void;
  redo: () => void;
  exportJson: () => string;
}

/**
 * React hook wrapping circuitReducer with undo/redo, clipboard, and JSON export.
 */
export function useCircuitStore(initialDoc: CircuitDocument): UseCircuitStoreReturn {
  const [state, dispatch] = useReducer(
    circuitReducer,
    initialDoc,
    createInitialCircuitStoreState,
  );

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  const exportJson = useCallback(
    () => serializeCircuitDocument(state.document),
    [state.document],
  );

  return {
    state,
    document: state.document,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    clipboard: state.clipboard,
    lastAddedIds: state.lastAddedIds,
    lastError: state.lastError,
    exportedJson: state.exportedJson,
    dispatch,
    undo,
    redo,
    exportJson,
  };
}
