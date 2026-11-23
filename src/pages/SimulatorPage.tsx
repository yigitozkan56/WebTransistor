import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, X } from 'lucide-react';
import { CanvasViewport } from '../canvas/CanvasViewport';
import { ComponentPalette } from '../components/ComponentPalette';
import { FloatingSelectionBar } from '../components/FloatingSelectionBar';
import { HardwareMonitor } from '../components/HardwareMonitor';
import { HelpOverlay } from '../components/HelpOverlay';
import { InspectorPanel } from '../components/InspectorPanel';
import { ProbeTooltip } from '../components/ProbeTooltip';
import { TopBar } from '../components/TopBar';
import { generateSiliconBenchmarkChip } from '../engine/chipGenerator';
import { getComponentDimensions, PALETTE_CATALOG } from '../engine/componentDefs';
import { WorkerSimulatorClient } from '../engine/workerClient';
import { getPresetById, PRESETS } from '../presets';
import {
  parseAndValidateCircuitDocument,
  serializeCircuitDocument,
  useCircuitStore,
} from '../store/circuitStore';
import type {
  CircuitComponent,
  CircuitDocument,
  ComponentProps,
  ComponentType,
  Wire,
} from '../types/circuit';
import type {
  HoverProbe,
  ISimulator,
  PendingPlacement,
  SelectionState,
  SimulationStats,
  ToolMode,
  Viewport,
  WireStyle,
} from '../types/ui';

export interface ExternalCircuitLoadRequest {
  doc: CircuitDocument;
  clockHz?: number;
  presetMeta?: import('../types/circuit').CircuitPreset;
  nonce: number;
}

export interface SimulatorPageProps {
  isActive: boolean;
  externalLoadRequest: ExternalCircuitLoadRequest | null;
  onOpenProject?: (projectId: string) => void;
  onNavigateProjects: () => void;
  onNavigateWiki: () => void;
}

const INITIAL_PRESET = PRESETS[0];

const EMPTY_SELECTION: SelectionState = {
  componentIds: new Set<string>(),
  wireIds: new Set<string>(),
};

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Produces a deterministic structural fingerprint of a CircuitDocument covering
 * simulation-relevant topology & parameters (ignoring viewport, coordinates,
 * labels, colors, keyBindings, and interactive toggle/button states).
 * Uses fast O(1) boundary sampling for large VLSI benchmark chips (10,000+ components).
 */
function computeStructuralSignature(doc: CircuitDocument): string {
  const cLen = doc.components.length;
  const wLen = doc.wires.length;
  if (cLen > 2000 || wLen > 4000) {
    const firstC = doc.components[0]?.id ?? '';
    const midC = doc.components[cLen >> 1]?.id ?? '';
    const lastC = doc.components[cLen - 1]?.id ?? '';
    const firstW = doc.wires[0]?.id ?? '';
    const lastW = doc.wires[wLen - 1]?.id ?? '';
    return `VLSI:${doc.name}#C${cLen}:${firstC}:${midC}:${lastC}#W${wLen}:${firstW}:${lastW}`;
  }

  const compKey = doc.components
    .map((c) => `${c.id}:${c.type}:${c.props.matrixSize ?? ''}`)
    .join('|');

  const wireKey = doc.wires
    .map((w) => `${w.id}:${w.from.componentId}.${w.from.pinId}->${w.to.componentId}.${w.to.pinId}`)
    .join('|');

  return `${compKey}#${wireKey}`;
}

function computeFitViewport(
  components: CircuitComponent[],
  canvasWidth: number,
  canvasHeight: number,
  reserveFloatingOverlay = false,
): Viewport {
  const width = Math.max(320, canvasWidth);
  const height = Math.max(240, canvasHeight);
  const leftPad = 48;
  const rightPad = reserveFloatingOverlay && width >= 680 ? 348 : 48;
  const topPad = 72;
  const bottomPad = 72;
  const availW = Math.max(160, width - leftPad - rightPad);
  const availH = Math.max(160, height - topPad - bottomPad);
  const targetCenterX = leftPad + availW / 2;
  const targetCenterY = topPad + availH / 2;

  if (components.length === 0) {
    return { x: Math.round(targetCenterX), y: Math.round(targetCenterY), zoom: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const isMassive = components.length > 5000;
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    let halfW = 20;
    let halfH = 20;
    if (!isMassive) {
      const dims = getComponentDimensions(comp);
      const rotated = comp.rotation === 90 || comp.rotation === 270;
      halfW = (rotated ? dims.height : dims.width) / 2;
      halfH = (rotated ? dims.width : dims.height) / 2;
    }

    const padX = 48;
    const padY = 48;
    if (comp.x - halfW - padX < minX) minX = comp.x - halfW - padX;
    if (comp.x + halfW + padX > maxX) maxX = comp.x + halfW + padX;
    if (comp.y - halfH - padY < minY) minY = comp.y - halfH - padY;
    if (comp.y + halfH + padY > maxY) maxY = comp.y + halfH + padY;
  }

  const worldW = Math.max(80, maxX - minX);
  const worldH = Math.max(80, maxY - minY);

  const rawZoom = Math.min(availW / worldW, availH / worldH, 1.5);
  const zoom = Math.max(0.002, Math.min(4.0, Math.round(rawZoom * 10000) / 10000));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: Math.round(targetCenterX - cx * zoom),
    y: Math.round(targetCenterY - cy * zoom),
    zoom,
  };
}

function readStatsFromSimulator(sim: ISimulator, prevFps = 60): SimulationStats {
  const snap = sim.getSnapshot();
  return {
    tickCount: snap.tickCount,
    effectiveHz: snap.effectiveHz,
    fps: prevFps,
    transistorCount: snap.transistorCount,
    netCount: snap.netCount,
    islandCount: snap.islandCount,
    hasShortCircuit: snap.hasShortCircuit,
    backend: snap.backend ?? sim.getBackendType?.(),
    gpuDeviceName: snap.gpuDeviceName ?? sim.getDeviceName?.(),
  };
}

/** Interactive full-screen virtual transistor & chip simulator workspace. */
export function SimulatorPage({
  isActive,
  externalLoadRequest,
  onOpenProject,
  onNavigateProjects,
  onNavigateWiki,
}: SimulatorPageProps) {
  void onNavigateWiki;

  const {
    document: circuitDoc,
    canUndo,
    canRedo,
    clipboard,
    lastAddedIds,
    dispatch,
    undo,
    redo,
  } = useCircuitStore(INITIAL_PRESET.document);

  const simRef = useRef<ISimulator | null>(null);
  if (!simRef.current) {
    simRef.current = new WorkerSimulatorClient(INITIAL_PRESET.document);
  }

  useEffect(() => {
    return () => {
      simRef.current?.destroy?.();
    };
  }, []);

  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activePresetId, setActivePresetId] = useState<string | null>(INITIAL_PRESET.id);
  const [externalPresetMeta, setExternalPresetMeta] = useState<
    import('../types/circuit').CircuitPreset | null
  >(null);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [clockHz, setClockHz] = useState<number>(INITIAL_PRESET.defaultClockHz);
  const [viewport, setViewport] = useState<Viewport>(
    INITIAL_PRESET.initialViewport ?? { x: 400, y: 260, zoom: 1 },
  );
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [wireStyle, setWireStyle] = useState<WireStyle>('orthogonal');
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [hoverProbe, setHoverProbe] = useState<HoverProbe | null>(null);
  const [paletteCollapsed, setPaletteCollapsed] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);
  const [isFileDragging, setIsFileDragging] = useState<boolean>(false);
  const [toast, setToast] = useState<{ kind: 'error' | 'info'; message: string } | null>(null);

  const [stats, setStats] = useState<SimulationStats>(() =>
    readStatsFromSimulator(simRef.current!, 60),
  );

  const structuralKey = useMemo(
    () => computeStructuralSignature(circuitDoc),
    [circuitDoc],
  );
  const loadedStructuralKeyRef = useRef<string>(structuralKey);
  const [forceReloadEpoch, setForceReloadEpoch] = useState<number>(0);
  const lastReloadEpochRef = useRef<number>(0);

  const activePreset = useMemo(
    () => (activePresetId ? getPresetById(activePresetId) ?? null : externalPresetMeta),
    [activePresetId, externalPresetMeta],
  );

  const showToast = useCallback((kind: 'error' | 'info', message: string) => {
    setToast({ kind, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Clear transient hover/drag overlays when leaving the simulator tab
  useEffect(() => {
    if (!isActive) {
      setHoverProbe(null);
      setIsFileDragging(false);
    }
  }, [isActive]);

  // Sync Simulator when circuit topology/simulation props change, or sync TOGGLE_SWITCH states on non-structural updates
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;

    const needsReload =
      loadedStructuralKeyRef.current !== structuralKey ||
      lastReloadEpochRef.current !== forceReloadEpoch;

    if (!needsReload) {
      for (const comp of circuitDoc.components) {
        if (comp.type === 'TOGGLE_SWITCH') {
          sim.setToggleState(comp.id, Boolean(comp.props.state));
        }
      }
      return;
    }

    loadedStructuralKeyRef.current = structuralKey;
    lastReloadEpochRef.current = forceReloadEpoch;
    sim.loadDocument(circuitDoc);
    setStats((prev) => readStatsFromSimulator(sim, prev.fps));
  }, [circuitDoc, structuralKey, forceReloadEpoch]);

  // Auto-select newly added / pasted / duplicated components
  useEffect(() => {
    if (lastAddedIds.length > 0) {
      setSelection({
        componentIds: new Set(lastAddedIds),
        wireIds: new Set(),
      });
    }
  }, [lastAddedIds]);

  const hasSelection =
    selection.componentIds.size > 0 || selection.wireIds.size > 0;

  const latestFitRef = useRef({
    document: circuitDoc,
    components: circuitDoc.components,
    hasSelection,
  });
  latestFitRef.current = {
    document: circuitDoc,
    components: circuitDoc.components,
    hasSelection,
  };

  const pendingFitRef = useRef<boolean>(true);
  const lastHandledNonceRef = useRef<number | null>(null);
  const pendingExternalDocRef = useRef<CircuitDocument | null>(null);
  const [fitEpoch, setFitEpoch] = useState<number>(1);

  // Handle external circuit load requests (from Example Projects, Wiki, custom JSON, or URL ?project=)
  useLayoutEffect(() => {
    if (!externalLoadRequest) return;
    if (externalLoadRequest.nonce === lastHandledNonceRef.current) return;
    lastHandledNonceRef.current = externalLoadRequest.nonce;
    pendingExternalDocRef.current = externalLoadRequest.doc;

    dispatch({ type: 'LOAD_DOCUMENT', document: externalLoadRequest.doc });
    setActivePresetId(null);
    setExternalPresetMeta(externalLoadRequest.presetMeta ?? null);
    setClockHz(externalLoadRequest.clockHz ?? 6);
    setIsRunning(true);
    setSelection(EMPTY_SELECTION);
    setPendingPlacement(null);
    setToolMode('select');
    setHoverProbe(null);
    setForceReloadEpoch((n) => n + 1);
    pendingFitRef.current = true;
    setFitEpoch((n) => n + 1);
    showToast('info', `"${externalLoadRequest.doc.name}" simülatöre yüklendi.`);
  }, [dispatch, externalLoadRequest, showToast]);

  // Fit viewport ONLY when SimulatorPage is visible (non-zero bounding rect)
  useLayoutEffect(() => {
    if (!isActive || !pendingFitRef.current) return;
    if (
      pendingExternalDocRef.current &&
      latestFitRef.current.document !== pendingExternalDocRef.current
    ) {
      return;
    }
    pendingExternalDocRef.current = null;

    const tryFit = () => {
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const { components: comps, hasSelection: selected } = latestFitRef.current;
      // For massive VLSI chips (5,000+ components) with an interactive I/O panel (PIXEL_MATRIX + switches),
      // focus initial view on the I/O panel so the LCD & switches are immediately usable (press F to view full die).
      let fitTargets = comps;
      if (comps.length > 5000) {
        const ioComps = comps.filter(
          (c) =>
            c.type === 'PIXEL_MATRIX' ||
            c.type === 'TOGGLE_SWITCH' ||
            c.type === 'PUSH_BUTTON' ||
            c.type === 'LED',
        );
        if (ioComps.some((c) => c.type === 'PIXEL_MATRIX') && ioComps.length > 0) {
          fitTargets = ioComps;
        }
      }
      setViewport(computeFitViewport(fitTargets, rect.width, rect.height, !selected));
      pendingFitRef.current = false;
      return true;
    };

    if (tryFit()) return;

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      if (!tryFit()) {
        raf2 = window.requestAnimationFrame(() => {
          const rect = canvasWrapperRef.current?.getBoundingClientRect();
          const width = rect && rect.width > 0 ? rect.width : 1000;
          const height = rect && rect.height > 0 ? rect.height : 700;
          const { components: comps, hasSelection: selected } = latestFitRef.current;
          setViewport(computeFitViewport(comps, width, height, !selected));
          pendingFitRef.current = false;
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [fitEpoch, isActive]);

  const fitComponents = useCallback(
    (comps: CircuitComponent[], reserveFloatingOverlay: boolean) => {
      const rect = canvasWrapperRef.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 1000;
      const height = rect && rect.height > 0 ? rect.height : 700;
      setViewport(computeFitViewport(comps, width, height, reserveFloatingOverlay));
    },
    [],
  );

  const handleFitToView = useCallback(() => {
    fitComponents(circuitDoc.components, !hasSelection);
  }, [circuitDoc.components, fitComponents, hasSelection]);

  const handleLoadPreset = useCallback(
    (presetId: string) => {
      const preset = getPresetById(presetId);
      if (!preset) return;
      dispatch({ type: 'LOAD_DOCUMENT', document: preset.document });
      setActivePresetId(preset.id);
      setClockHz(preset.defaultClockHz);
      setIsRunning(true);
      setSelection(EMPTY_SELECTION);
      setPendingPlacement(null);
      setToolMode('select');
      setHoverProbe(null);
      setToast(null);
      setForceReloadEpoch((n) => n + 1);
      pendingFitRef.current = true;
      setFitEpoch((n) => n + 1);
    },
    [dispatch],
  );

  const handleGenerateBenchmarkChip = useCallback(
    (targetTransistors: number, recommendedHz?: number) => {
      const targetHz =
        recommendedHz ?? (targetTransistors >= 100_000 ? 150_000 : 25_000);
      const benchmarkDoc = generateSiliconBenchmarkChip(targetTransistors);
      dispatch({ type: 'LOAD_DOCUMENT', document: benchmarkDoc });
      setActivePresetId(null);
      setClockHz(targetHz);
      setIsRunning(true);
      setSelection(EMPTY_SELECTION);
      setPendingPlacement(null);
      setToolMode('select');
      setHoverProbe(null);
      setForceReloadEpoch((n) => n + 1);
      pendingFitRef.current = true;
      setFitEpoch((n) => n + 1);
      showToast(
        'info',
        `${targetTransistors.toLocaleString('tr-TR')}+ fiziksel transistörlü silikon kalıp üretildi (${(targetHz / 1000).toLocaleString('tr-TR')}k TPS).`,
      );
    },
    [dispatch, showToast],
  );

  const handleResetSimulation = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.reset();
    for (const comp of circuitDoc.components) {
      if (comp.type === 'TOGGLE_SWITCH') {
        sim.setToggleState(comp.id, Boolean(comp.props.state));
      }
    }
    setStats((prev) => readStatsFromSimulator(sim, prev.fps));
  }, [circuitDoc.components]);

  const handleStep = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setIsRunning(false);
    sim.stepHalfCycle();
    setStats((prev) => readStatsFromSimulator(sim, prev.fps));
  }, []);

  const handleSelectPlacement = useCallback(
    (type: ComponentType, props?: ComponentProps) => {
      setPendingPlacement((prev) => {
        const isSame = prev && prev.type === type;
        if (isSame) {
          setToolMode('select');
          return null;
        }
        setToolMode('place');
        return { type, props };
      });
    },
    [],
  );

  const handleClearPlacement = useCallback(() => {
    setPendingPlacement(null);
    setToolMode((prev) => (prev === 'place' ? 'select' : prev));
  }, []);

  const handleToolModeChange = useCallback((mode: ToolMode) => {
    setToolMode(mode);
    if (mode !== 'place') {
      setPendingPlacement(null);
    }
  }, []);

  const handleAddComponent = useCallback(
    (type: ComponentType, x: number, y: number, props?: ComponentProps) => {
      dispatch({ type: 'ADD_COMPONENT', componentType: type, x, y, props });
    },
    [dispatch],
  );

  const handleMoveComponents = useCallback(
    (moves: Array<{ id: string; x: number; y: number }>) => {
      dispatch({ type: 'MOVE_COMPONENTS', moves });
    },
    [dispatch],
  );

  const handleAddWire = useCallback(
    (wire: Omit<Wire, 'id'>) => {
      dispatch({ type: 'ADD_WIRE', wire });
    },
    [dispatch],
  );

  const handleDeleteSelection = useCallback(
    (sel: SelectionState = selection) => {
      if (sel.componentIds.size === 0 && sel.wireIds.size === 0) return;
      dispatch({ type: 'DELETE_SELECTION', selection: sel });
      setSelection(EMPTY_SELECTION);
    },
    [dispatch, selection],
  );

  const handleRotateSelection = useCallback(() => {
    if (selection.componentIds.size === 0) return;
    dispatch({ type: 'ROTATE_SELECTION', componentIds: selection.componentIds, delta: 90 });
  }, [dispatch, selection.componentIds]);

  const handleDuplicateSelection = useCallback(() => {
    if (selection.componentIds.size === 0) return;
    dispatch({ type: 'DUPLICATE', componentIds: selection.componentIds });
  }, [dispatch, selection.componentIds]);

  const handleDuplicateArray = useCallback(
    (copies: number) => {
      if (selection.componentIds.size === 0) return;
      const totalNew = selection.componentIds.size * copies;
      dispatch({
        type: 'DUPLICATE_ARRAY',
        componentIds: selection.componentIds,
        count: copies,
      });
      pendingFitRef.current = true;
      setFitEpoch((n) => n + 1);
      showToast(
        'info',
        `Seçim ×${copies} çoğaltıldı (${totalNew.toLocaleString('tr-TR')} açık fiziksel bileşen eklendi).`,
      );
    },
    [dispatch, selection.componentIds, showToast],
  );

  const handleMacroDuplicateAll = useCallback(
    (copies: number) => {
      const targetIds =
        selection.componentIds.size > 0
          ? selection.componentIds
          : circuitDoc.components.map((c) => c.id);
      const countSize =
        targetIds instanceof Set ? targetIds.size : targetIds.length;
      if (countSize === 0) return;

      const totalNew = countSize * copies;
      dispatch({
        type: 'DUPLICATE_ARRAY',
        componentIds: targetIds,
        count: copies,
      });
      pendingFitRef.current = true;
      setFitEpoch((n) => n + 1);
      showToast(
        'info',
        `Silikon matris ×${copies} çoğaltıldı (${totalNew.toLocaleString('tr-TR')} açık fiziksel bileşen eklendi).`,
      );
    },
    [circuitDoc.components, dispatch, selection.componentIds, showToast],
  );

  const handleUpdateProps = useCallback(
    (compId: string, patch: Partial<ComponentProps>) => {
      dispatch({ type: 'UPDATE_COMPONENT_PROPS', id: compId, props: patch });
    },
    [dispatch],
  );

  const handleSetRotation = useCallback(
    (compId: string, targetRot: 0 | 90 | 180 | 270) => {
      const comp = circuitDoc.components.find((c) => c.id === compId);
      if (!comp || comp.rotation === targetRot) return;
      const delta = (((targetRot - comp.rotation) % 360) + 360) % 360;
      if (delta === 90 || delta === 180 || delta === 270) {
        dispatch({ type: 'ROTATE_SELECTION', componentIds: [compId], delta });
      }
    },
    [circuitDoc.components, dispatch],
  );

  const handleToggleSwitch = useCallback(
    (compId: string, nextState: boolean) => {
      dispatch({
        type: 'UPDATE_COMPONENT_PROPS',
        id: compId,
        props: { state: nextState },
        recordHistory: false,
      });
      simRef.current?.setToggleState(compId, nextState);
    },
    [dispatch],
  );

  const handlePushButton = useCallback(
    (compId: string, pressed: boolean) => {
      dispatch({
        type: 'UPDATE_COMPONENT_PROPS',
        id: compId,
        props: { state: pressed },
        recordHistory: false,
      });
      simRef.current?.setPushButtonState(compId, pressed);
    },
    [dispatch],
  );

  const handleExportJson = useCallback(() => {
    const json = serializeCircuitDocument(circuitDoc);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    const safeName =
      circuitDoc.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'webtransistor-circuit';
    a.href = url;
    a.download = `${safeName}.json`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('info', 'Devre JSON olarak dışa aktarıldı.');
  }, [circuitDoc, showToast]);

  const importJsonText = useCallback(
    (jsonText: string) => {
      const validation = parseAndValidateCircuitDocument(jsonText);
      if (!validation.ok) {
        showToast('error', validation.error);
        return;
      }
      const importedDoc = validation.document;
      setIsRunning(true);
      dispatch({ type: 'IMPORT_JSON', json: jsonText });
      setActivePresetId(null);
      setSelection(EMPTY_SELECTION);
      setPendingPlacement(null);
      setToolMode('select');
      setHoverProbe(null);
      setForceReloadEpoch((n) => n + 1);
      pendingFitRef.current = true;
      setFitEpoch((n) => n + 1);
      showToast('info', `"${importedDoc.name}" içe aktarıldı.`);
    },
    [dispatch, showToast],
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        importJsonText(text);
      } catch {
        showToast('error', 'Dosya okunamadı.');
      }
    },
    [importJsonText, showToast],
  );

  // Global keyboard shortcuts (inactive when tab hidden, editing inputs, or modal open)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      if (isEditableTarget(window.document.activeElement)) return;
      if (helpOpen) return;

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      if (ctrlOrMeta) {
        const lower = e.key.toLowerCase();
        if (lower === 'z' && !e.shiftKey) {
          if (canUndo) {
            e.preventDefault();
            undo();
            setSelection(EMPTY_SELECTION);
          }
          return;
        }
        if (lower === 'y' || (lower === 'z' && e.shiftKey)) {
          if (canRedo) {
            e.preventDefault();
            redo();
            setSelection(EMPTY_SELECTION);
          }
          return;
        }
        if (lower === 'c') {
          if (selection.componentIds.size > 0) {
            e.preventDefault();
            dispatch({ type: 'COPY', componentIds: selection.componentIds });
            showToast('info', `${selection.componentIds.size} açık bileşen kopyalandı.`);
          }
          return;
        }
        if (lower === 'v') {
          if (clipboard && clipboard.components.length > 0) {
            e.preventDefault();
            dispatch({ type: 'PASTE' });
          }
          return;
        }
        if (lower === 'd') {
          if (selection.componentIds.size > 0) {
            e.preventDefault();
            handleDuplicateSelection();
          }
          return;
        }
        return;
      }

      if (e.altKey || e.defaultPrevented) return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      const lower = e.key.toLowerCase();

      if (lower === 'f') {
        e.preventDefault();
        handleFitToView();
        return;
      }

      if (lower === 'r') {
        if (selection.componentIds.size > 0) {
          e.preventDefault();
          handleRotateSelection();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.componentIds.size > 0 || selection.wireIds.size > 0) {
          e.preventDefault();
          handleDeleteSelection();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (pendingPlacement) {
          setPendingPlacement(null);
          setToolMode('select');
          return;
        }
        if (selection.componentIds.size > 0 || selection.wireIds.size > 0) {
          setSelection(EMPTY_SELECTION);
        }
        return;
      }

      // Quick placement shortcuts 1-9, 0
      if (/^[0-9]$/.test(e.key)) {
        const item = PALETTE_CATALOG.find((entry) => entry.shortcut === e.key);
        if (item) {
          e.preventDefault();
          handleSelectPlacement(item.type, item.defaultProps);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canRedo,
    canUndo,
    clipboard,
    dispatch,
    handleDeleteSelection,
    handleDuplicateSelection,
    handleFitToView,
    handleRotateSelection,
    handleSelectPlacement,
    helpOpen,
    isActive,
    pendingPlacement,
    redo,
    selection,
    showToast,
    undo,
  ]);

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#090C10] text-slate-200 select-none"
      onDragOver={(e) => {
        if (!isActive) return;
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsFileDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFileDragging(false);
        }
      }}
      onDrop={(e) => {
        setIsFileDragging(false);
        if (!isActive) return;
        if (e.dataTransfer.types.includes('Files') && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file && (file.name.endsWith('.json') || file.type === 'application/json')) {
            e.preventDefault();
            void handleImportFile(file);
          }
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
          e.target.value = '';
        }}
      />

      <TopBar
        presets={PRESETS}
        activePresetId={activePresetId}
        onLoadPreset={handleLoadPreset}
        circuitName={circuitDoc.name}
        isRunning={isRunning}
        onToggleRun={() => setIsRunning((prev) => !prev)}
        onStep={handleStep}
        onReset={handleResetSimulation}
        clockHz={clockHz}
        onClockHzChange={setClockHz}
        stats={stats}
        toolMode={toolMode}
        onToolModeChange={handleToolModeChange}
        wireStyle={wireStyle}
        onWireStyleChange={setWireStyle}
        onFitToView={handleFitToView}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => {
          undo();
          setSelection(EMPTY_SELECTION);
        }}
        onRedo={() => {
          redo();
          setSelection(EMPTY_SELECTION);
        }}
        onExportJson={handleExportJson}
        onImportJsonClick={() => fileInputRef.current?.click()}
        onOpenHelp={() => setHelpOpen(true)}
        onMacroDuplicateAll={handleMacroDuplicateAll}
        onGenerateBenchmarkChip={handleGenerateBenchmarkChip}
        onOpenProject={onOpenProject}
        onNavigateProjects={onNavigateProjects}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <ComponentPalette
          pendingPlacement={pendingPlacement}
          isCollapsed={paletteCollapsed}
          onToggleCollapse={() => setPaletteCollapsed((prev) => !prev)}
          onSelectPlacement={handleSelectPlacement}
        />

        <div ref={canvasWrapperRef} className="relative min-w-0 flex-1 overflow-hidden">
          <CanvasViewport
            document={circuitDoc}
            simulationRef={simRef}
            viewport={viewport}
            onViewportChange={setViewport}
            toolMode={toolMode}
            pendingPlacement={pendingPlacement}
            onClearPlacement={handleClearPlacement}
            wireStyle={wireStyle}
            selection={selection}
            onSelectionChange={setSelection}
            isRunning={isRunning && isActive}
            clockHz={clockHz}
            onHoverProbe={setHoverProbe}
            onStatsUpdate={setStats}
            onAddComponent={handleAddComponent}
            onMoveComponents={handleMoveComponents}
            onAddWire={handleAddWire}
            onDeleteSelection={handleDeleteSelection}
            onToggleSwitch={handleToggleSwitch}
            onPushButton={handlePushButton}
            onRotateSelection={handleRotateSelection}
          />

          <FloatingSelectionBar
            selection={selection}
            onRotate={handleRotateSelection}
            onDuplicate={handleDuplicateSelection}
            onDuplicateArray={handleDuplicateArray}
            onDelete={() => handleDeleteSelection()}
          />

          <HardwareMonitor
            stats={stats}
            isRunning={isRunning}
            activePreset={activePreset}
            onGenerateBenchmark={(targetTx) => handleGenerateBenchmarkChip(targetTx)}
          />
        </div>

        {hasSelection && (
          <InspectorPanel
            activeComponents={circuitDoc.components}
            selection={selection}
            stats={stats}
            isRunning={isRunning}
            activePreset={activePreset}
            onUpdateProps={handleUpdateProps}
            onSetRotation={handleSetRotation}
            onRotateSelection={handleRotateSelection}
            onDuplicateSelection={handleDuplicateSelection}
            onDuplicateArray={handleDuplicateArray}
            onDeleteSelection={() => handleDeleteSelection()}
            onToggleSwitch={handleToggleSwitch}
            onGenerateBenchmark={(targetTx) => handleGenerateBenchmarkChip(targetTx)}
          />
        )}
      </div>

      {/* File Drop Overlay */}
      {isFileDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#090C10]/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#00E5FF] bg-[#0E131A]/95 px-10 py-8 text-center shadow-2xl">
            <FileUp className="h-10 w-10 text-[#00E5FF]" />
            <div className="text-sm font-semibold text-slate-100">
              JSON Devre Dosyasını Bırakın
            </div>
            <div className="text-xs text-slate-400">
              WebTransistor devre belgesi (.json) otomatik olarak içe aktarılır
            </div>
          </div>
        </div>
      )}

      {/* Toast Banner */}
      {toast && (
        <div
          className={`fixed bottom-4 z-50 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-md ${
            hasSelection ? 'right-[272px]' : 'right-4'
          } ${
            toast.kind === 'error'
              ? 'border-red-500/50 bg-[#0E131A]/95 text-red-300'
              : 'border-[#00E5FF]/40 bg-[#0E131A]/95 text-[#00E5FF]'
          }`}
        >
          {toast.kind === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span className="text-slate-100">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-[#141B24] hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ProbeTooltip probe={hoverProbe} />

      <HelpOverlay isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export default SimulatorPage;
