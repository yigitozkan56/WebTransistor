import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  isHigh,
  LogicValue,
  type CircuitComponent,
  type ComponentProps,
  type ComponentType,
  type Point,
  type Wire,
} from '../types/circuit';
import type {
  CanvasViewportProps,
  HoverProbe,
  SelectionState,
  Viewport,
} from '../types/ui';
import {
  getComponentsInRect,
  getRotatedPinNormal,
  getWirePathAABB,
  hitTestComponent,
  hitTestPin,
  hitTestWire,
  normalizePointsToAABB,
  snapPointToGrid,
  snapToGrid,
  type AABB,
  type PinHit,
  type WirePath,
} from './geometry';
import {
  isOverlay2dDetailedMode,
  renderCanvasFrame,
  type GhostPlacement,
  type WireDraft,
} from './renderer';
import { computeWirePath, findWireJunctions, type WireJunction } from './routing';
import { WebGLInstancedRenderer } from './webglInstancedRenderer';

type InteractionState =
  | { mode: 'idle' }
  | {
      mode: 'pan';
      startClient: Point;
      startViewport: Viewport;
    }
  | {
      mode: 'pending-comp';
      comp: CircuitComponent;
      startClient: Point;
      startWorld: Point;
      shiftKey: boolean;
    }
  | {
      mode: 'press-button';
      comp: CircuitComponent;
      startClient: Point;
      startWorld: Point;
      shiftKey: boolean;
    }
  | {
      mode: 'drag-components';
      dragIds: Set<string>;
      startWorld: Point;
      origPositions: Map<string, Point>;
      dx: number;
      dy: number;
    }
  | {
      mode: 'marquee';
      startClient: Point;
      startWorld: Point;
      currentWorld: Point;
      shiftKey: boolean;
      baseSelection: SelectionState;
    };

type HoverTarget =
  | {
      kind: 'pin';
      compId: string;
      pinId: string;
      title: string;
      subtitle: string;
      clientX: number;
      clientY: number;
      lastValue: LogicValue;
      lastNetId: number | null;
    }
  | {
      kind: 'wire';
      wireId: string;
      title: string;
      subtitle: string;
      clientX: number;
      clientY: number;
      lastValue: LogicValue;
      lastNetId: number | null;
    };

const MIN_ZOOM = 0.008;
const MAX_ZOOM = 4.0;
const DRAG_THRESHOLD_PX = 5;
const SIM_FRAME_BUDGET_MS = 10;
const MAX_CPU_ROUTED_WIRES = 15000;

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Normalizes a KeyboardEvent or configured `keyBinding` string to a canonical token. */
function normalizeKeyBinding(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed === ' ' || trimmed === 'SPACE' || trimmed === 'SPC') return 'SPACE';
  if (trimmed === 'ENTER' || trimmed === 'ENT' || trimmed === 'RETURN') return 'ENTER';
  if (trimmed === 'UP' || trimmed === 'ARROWUP') return 'ARROWUP';
  if (trimmed === 'DOWN' || trimmed === 'ARROWDOWN') return 'ARROWDOWN';
  if (trimmed === 'LEFT' || trimmed === 'ARROWLEFT') return 'ARROWLEFT';
  if (trimmed === 'RIGHT' || trimmed === 'ARROWRIGHT') return 'ARROWRIGHT';
  if (trimmed.startsWith('KEY') && trimmed.length === 4) return trimmed.slice(3);
  if (trimmed.startsWith('DIGIT') && trimmed.length === 6) return trimmed.slice(5);
  return trimmed;
}

function getEventKeyTokens(e: KeyboardEvent): string[] {
  const tokens: string[] = [];
  const k1 = normalizeKeyBinding(e.key === ' ' ? 'SPACE' : e.key);
  if (k1) tokens.push(k1);
  const k2 = normalizeKeyBinding(e.code);
  if (k2 && !tokens.includes(k2)) tokens.push(k2);
  return tokens;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = (props) => {
  const {
    document: circuitDoc,
    simulationRef,
    viewport,
    onViewportChange,
    toolMode,
    pendingPlacement,
    wireStyle,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webglRendererRef = useRef<WebGLInstancedRenderer | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');

  // Base component lookup & precomputed wire geometry (skipped for massive >15k VLSI benchmark dies where WebGL2 handles flat wire buffers directly)
  const baseRouting = useMemo(() => {
    const compMap = new Map<string, CircuitComponent>();
    const wirePaths = new Map<string, WirePath>();
    const wireBounds = new Map<string, AABB>();

    if (
      circuitDoc.components.length > MAX_CPU_ROUTED_WIRES ||
      circuitDoc.wires.length > MAX_CPU_ROUTED_WIRES
    ) {
      return { compMap, wirePaths, wireBounds, junctions: [] as WireJunction[] };
    }

    for (let i = 0; i < circuitDoc.components.length; i++) {
      const c = circuitDoc.components[i];
      compMap.set(c.id, c);
    }

    for (let i = 0; i < circuitDoc.wires.length; i++) {
      const w = circuitDoc.wires[i];
      const path = computeWirePath(w, compMap, wireStyle);
      if (path) {
        wirePaths.set(w.id, path);
        wireBounds.set(w.id, getWirePathAABB(path));
      }
    }

    const junctions =
      circuitDoc.wires.length <= MAX_CPU_ROUTED_WIRES
        ? findWireJunctions(circuitDoc.wires, wirePaths)
        : [];
    return { compMap, wirePaths, wireBounds, junctions };
  }, [circuitDoc.components, circuitDoc.wires, wireStyle]);

  // Mutable live refs for 60fps loop & pointer handlers without stale closures
  const propsRef = useRef(props);
  propsRef.current = props;

  const baseRoutingRef = useRef(baseRouting);
  baseRoutingRef.current = baseRouting;

  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const interactionRef = useRef<InteractionState>({ mode: 'idle' });
  const wireDraftRef = useRef<WireDraft | null>(null);
  const ghostPlacementRef = useRef<GhostPlacement | null>(null);
  const dropTargetRef = useRef<Point | null>(null);
  const marqueeRectRef = useRef<AABB | null>(null);
  const hoveredPinRef = useRef<PinHit | null>(null);
  const hoveredWireIdRef = useRef<string | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);

  // Track active keyboard-bound PUSH_BUTTONs and held key tokens
  const heldKeyTokensRef = useRef<Set<string>>(new Set());
  const activeKeyPushButtonsRef = useRef<Map<string, Set<string>>>(new Map());

  // Live drag-preview cache so wires rubber-band cleanly during drag without mutating React state
  const dragRoutingCacheRef = useRef<{
    components: CircuitComponent[];
    wirePaths: Map<string, WirePath>;
    wireBounds: Map<string, AABB>;
    junctions: WireJunction[];
    lastDx: number;
    lastDy: number;
    dragIds: Set<string>;
  } | null>(null);

  useEffect(() => {
    if (toolMode !== 'place' || !pendingPlacement) {
      ghostPlacementRef.current = null;
    }
  }, [toolMode, pendingPlacement]);

  useEffect(() => {
    if (wireDraftRef.current) {
      wireDraftRef.current.style = wireStyle;
    }
  }, [wireStyle]);

  // Initialize WebGL2 Hardware-Accelerated Instanced Renderer
  useEffect(() => {
    const glCanvas = glCanvasRef.current;
    if (!glCanvas) return;
    const renderer = new WebGLInstancedRenderer(glCanvas);
    webglRendererRef.current = renderer;
    return () => {
      renderer.destroy();
      webglRendererRef.current = null;
    };
  }, []);

  // ResizeObserver for crisp HiDPI sizing across both WebGL2 and 2D overlay layers
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const glCanvas = glCanvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      canvasSizeRef.current = { width: w, height: h, dpr };

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      if (glCanvas && (glCanvas.width !== targetW || glCanvas.height !== targetH)) {
        glCanvas.width = targetW;
        glCanvas.height = targetH;
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener('resize', updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // Non-passive wheel zoom toward cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const vp = propsRef.current.viewport;

      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 24;
      else if (e.deltaMode === 2) delta *= 240;

      const clampedDelta = Math.max(-140, Math.min(140, delta));
      const factor = Math.exp(-clampedDelta * 0.0018);
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * factor));
      if (Math.abs(nextZoom - vp.zoom) < 1e-6) return;

      const worldX = (cursorX - vp.x) / vp.zoom;
      const worldY = (cursorY - vp.y) / vp.zoom;
      propsRef.current.onViewportChange({
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
        zoom: nextZoom,
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Global keyboard handler: physical keyBindings for PUSH_BUTTON & TOGGLE_SWITCH + Escape cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = window.document.activeElement;
      if (isEditableElement(activeEl)) return;
      if (window.document.querySelector('[role="dialog"]')) return;

      if (e.code === 'Escape') {
        if (wireDraftRef.current) {
          wireDraftRef.current = null;
          setCursorStyle(propsRef.current.toolMode === 'pan' ? 'grab' : 'default');
          e.stopImmediatePropagation();
          return;
        }
        if (propsRef.current.toolMode === 'place') {
          propsRef.current.onClearPlacement();
          return;
        }
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (
        activeEl &&
        (activeEl.tagName === 'BUTTON' ||
          activeEl.tagName === 'A' ||
          activeEl.getAttribute('role') === 'button' ||
          activeEl.getAttribute('role') === 'menuitem') &&
        (e.code === 'Space' || e.code === 'Enter')
      ) {
        return;
      }

      const tokens = getEventKeyTokens(e);
      if (tokens.length === 0) return;

      const curProps = propsRef.current;
      const comps = curProps.document.components;
      const sim = curProps.simulationRef.current;

      // Find all TOGGLE_SWITCH and PUSH_BUTTON components bound to this key
      const matchedToggles: CircuitComponent[] = [];
      const matchedButtons: CircuitComponent[] = [];

      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (c.type !== 'TOGGLE_SWITCH' && c.type !== 'PUSH_BUTTON') continue;
        const binding = normalizeKeyBinding(c.props.keyBinding);
        if (!binding || !tokens.includes(binding)) continue;
        if (c.type === 'TOGGLE_SWITCH') {
          matchedToggles.push(c);
        } else {
          matchedButtons.push(c);
        }
      }

      if (matchedToggles.length === 0 && matchedButtons.length === 0) return;

      e.preventDefault();
      if (e.repeat) return;

      const primaryToken = tokens[0];
      heldKeyTokensRef.current.add(primaryToken);

      for (let i = 0; i < matchedToggles.length; i++) {
        const sw = matchedToggles[i];
        const liveHigh = sim ? isHigh(sim.getPinValue(sw.id, 'OUT')) : Boolean(sw.props.state);
        const curState = sw.props.state !== undefined ? Boolean(sw.props.state) : liveHigh;
        const nextState = !curState;
        sim?.setToggleState(sw.id, nextState);
        curProps.onToggleSwitch(sw.id, nextState);
      }

      if (matchedButtons.length > 0) {
        let btnSet = activeKeyPushButtonsRef.current.get(primaryToken);
        if (!btnSet) {
          btnSet = new Set<string>();
          activeKeyPushButtonsRef.current.set(primaryToken, btnSet);
        }
        for (let i = 0; i < matchedButtons.length; i++) {
          const btn = matchedButtons[i];
          btnSet.add(btn.id);
          sim?.setPushButtonState(btn.id, true);
          curProps.onPushButton(btn.id, true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const tokens = getEventKeyTokens(e);
      if (tokens.length === 0) return;

      const curProps = propsRef.current;
      const sim = curProps.simulationRef.current;

      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        heldKeyTokensRef.current.delete(tok);
        const btnSet = activeKeyPushButtonsRef.current.get(tok);
        if (btnSet) {
          for (const btnId of btnSet) {
            sim?.setPushButtonState(btnId, false);
            curProps.onPushButton(btnId, false);
          }
          activeKeyPushButtonsRef.current.delete(tok);
        }
      }
    };

    const handleBlur = () => {
      const curProps = propsRef.current;
      const sim = curProps.simulationRef.current;
      if (activeKeyPushButtonsRef.current.size > 0) {
        for (const btnSet of activeKeyPushButtonsRef.current.values()) {
          for (const btnId of btnSet) {
            sim?.setPushButtonState(btnId, false);
            curProps.onPushButton(btnId, false);
          }
        }
        activeKeyPushButtonsRef.current.clear();
      }
      heldKeyTokensRef.current.clear();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Main requestAnimationFrame loop: fractional tick stepping + Canvas 2D render + telemetry stats
  useEffect(() => {
    let rafId = 0;
    let lastFrameTime = performance.now();
    let tickAcc = 0;

    let statsWindowStart = lastFrameTime;
    let framesInWindow = 0;
    const tickSamples: Array<{ time: number; ticks: number }> = [];

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0, (now - lastFrameTime) / 1000), 0.05);
      lastFrameTime = now;

      const curProps = propsRef.current;
      const sim = curProps.simulationRef.current;

      // 1. Simulation stepping (up to 10ms budget per frame)
      if (curProps.isRunning && sim) {
        const targetTicksPerSec = Math.max(1, curProps.clockHz);
        tickAcc = Math.min(
          tickAcc + targetTicksPerSec * dt,
          Math.max(4, targetTicksPerSec * 0.05),
        );

        const ticksToRun = Math.floor(tickAcc);
        if (ticksToRun >= 1) {
          if (sim.stepBatch) {
            sim.stepBatch(ticksToRun);
            tickAcc -= ticksToRun;
          } else {
            const stepStart = performance.now();
            let stepsThisFrame = 0;
            while (tickAcc >= 1) {
              sim.stepHalfCycle();
              tickAcc -= 1;
              stepsThisFrame++;
              if ((stepsThisFrame & 63) === 0) {
                if (performance.now() - stepStart >= SIM_FRAME_BUDGET_MS) {
                  tickAcc = Math.min(tickAcc, 1);
                  break;
                }
              }
            }
          }
        }
      } else {
        tickAcc = 0;
      }

      const snapshot = sim ? sim.getSnapshot() : null;

      // 2. Refresh live hover probe value if signal toggled under stationary cursor
      const hover = hoverTargetRef.current;
      if (hover && sim) {
        if (hover.kind === 'pin') {
          const val = sim.getPinValue(hover.compId, hover.pinId);
          const netId = snapshot?.pinToNet.get(`${hover.compId}:${hover.pinId}`) ?? null;
          if (val !== hover.lastValue || netId !== hover.lastNetId) {
            hover.lastValue = val;
            hover.lastNetId = netId;
            curProps.onHoverProbe({
              screenX: hover.clientX,
              screenY: hover.clientY,
              title: hover.title,
              subtitle: hover.subtitle,
              value: val,
              netId,
            });
          }
        } else {
          const val = sim.getWireValue(hover.wireId);
          const netId = snapshot?.wireToNet.get(hover.wireId) ?? null;
          if (val !== hover.lastValue || netId !== hover.lastNetId) {
            hover.lastValue = val;
            hover.lastNetId = netId;
            curProps.onHoverProbe({
              screenX: hover.clientX,
              screenY: hover.clientY,
              title: hover.title,
              subtitle: hover.subtitle,
              value: val,
              netId,
            });
          }
        }
      }

      // 3. Determine active geometry (live drag-preview vs memoized base routing)
      const base = baseRoutingRef.current;
      const docComponents = curProps.document.components;
      const docWires = curProps.document.wires;
      let renderComponents = docComponents;
      let renderWirePaths = base.wirePaths;
      let renderWireBounds = base.wireBounds;
      let renderJunctions = base.junctions;

      const inter = interactionRef.current;
      if (inter.mode === 'drag-components' && (inter.dx !== 0 || inter.dy !== 0)) {
        const cache = dragRoutingCacheRef.current;
        if (cache && cache.lastDx === inter.dx && cache.lastDy === inter.dy) {
          renderComponents = cache.components;
          renderWirePaths = cache.wirePaths;
          renderWireBounds = cache.wireBounds;
          renderJunctions = cache.junctions;
        } else {
          const movedMap = new Map<string, CircuitComponent>();
          const movedList: CircuitComponent[] = new Array(docComponents.length);
          for (let i = 0; i < docComponents.length; i++) {
            const c = docComponents[i];
            if (inter.dragIds.has(c.id)) {
              const orig = inter.origPositions.get(c.id);
              const moved: CircuitComponent = {
                ...c,
                x: (orig ? orig.x : c.x) + inter.dx,
                y: (orig ? orig.y : c.y) + inter.dy,
              };
              movedList[i] = moved;
              movedMap.set(c.id, moved);
            } else {
              movedList[i] = c;
              movedMap.set(c.id, c);
            }
          }

          const nextPaths = new Map(base.wirePaths);
          const nextBounds = new Map(base.wireBounds);
          for (let i = 0; i < docWires.length; i++) {
            const w = docWires[i];
            if (inter.dragIds.has(w.from.componentId) || inter.dragIds.has(w.to.componentId)) {
              const p = computeWirePath(w, movedMap, curProps.wireStyle);
              if (p) {
                nextPaths.set(w.id, p);
                nextBounds.set(w.id, getWirePathAABB(p));
              }
            }
          }
          const nextJunctions =
            docWires.length <= 15000 ? findWireJunctions(docWires, nextPaths) : [];

          dragRoutingCacheRef.current = {
            components: movedList,
            wirePaths: nextPaths,
            wireBounds: nextBounds,
            junctions: nextJunctions,
            lastDx: inter.dx,
            lastDy: inter.dy,
            dragIds: inter.dragIds,
          };

          renderComponents = movedList;
          renderWirePaths = nextPaths;
          renderWireBounds = nextBounds;
          renderJunctions = nextJunctions;
        }
      }

      // 4. Render WebGL2 Hardware-Accelerated Instanced layer + Hybrid 2D Schematic Overlay
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const { width, height, dpr } = canvasSizeRef.current;
      const overlay2dDetailedActive = isOverlay2dDetailedMode(
        curProps.viewport.zoom,
        renderComponents.length,
      );

      let webglActive = false;
      const glRenderer = webglRendererRef.current;
      if (glRenderer && glRenderer.isAvailable() && width > 0 && height > 0) {
        webglActive = glRenderer.renderFrame({
          width,
          height,
          dpr,
          viewport: curProps.viewport,
          components: renderComponents,
          wires: docWires,
          wirePaths: renderWirePaths,
          sim,
          snapshot,
          timestamp: now,
          overlay2dDetailedActive,
        });
      }

      if (ctx && width > 0 && height > 0) {
        renderCanvasFrame({
          ctx,
          width,
          height,
          dpr,
          viewport: curProps.viewport,
          components: renderComponents,
          wires: docWires,
          wirePaths: renderWirePaths,
          wireBounds: renderWireBounds,
          junctions: renderJunctions,
          sim,
          snapshot,
          selection: curProps.selection,
          hoveredPin: hoveredPinRef.current,
          hoveredWireId: hoveredWireIdRef.current,
          wireDraft: wireDraftRef.current,
          ghostPlacement: ghostPlacementRef.current,
          dropTarget: dropTargetRef.current,
          marqueeRect: marqueeRectRef.current,
          timestamp: now,
          webglActive,
        });
      }

      // 5. Rolling stats telemetry (~250ms throttle)
      framesInWindow++;
      if (snapshot) {
        tickSamples.push({ time: now, ticks: snapshot.tickCount });
        while (tickSamples.length > 2 && now - tickSamples[0].time > 1000) {
          tickSamples.shift();
        }
      }

      const elapsedStats = now - statsWindowStart;
      if (elapsedStats >= 250) {
        const fps = Math.round((framesInWindow * 1000) / elapsedStats);
        framesInWindow = 0;
        statsWindowStart = now;

        let effectiveHz = 0;
        if (curProps.isRunning && snapshot) {
          if (snapshot.effectiveHz > 0) {
            effectiveHz = snapshot.effectiveHz;
          } else if (tickSamples.length >= 2) {
            const oldest = tickSamples[0];
            const newest = tickSamples[tickSamples.length - 1];
            const spanSec = (newest.time - oldest.time) / 1000;
            if (spanSec > 0.05) {
              effectiveHz = Math.max(0, Math.round((newest.ticks - oldest.ticks) / spanSec));
            }
          }
        }

        curProps.onStatsUpdate({
          tickCount: snapshot?.tickCount ?? 0,
          effectiveHz,
          fps,
          transistorCount: snapshot?.transistorCount ?? 0,
          netCount: snapshot?.netCount ?? 0,
          islandCount: snapshot?.islandCount ?? 0,
          hasShortCircuit: snapshot?.hasShortCircuit ?? false,
          backend: snapshot?.backend ?? sim?.getBackendType?.(),
          gpuDeviceName: snapshot?.gpuDeviceName ?? sim?.getDeviceName?.(),
          renderMode: webglActive ? 'WebGL2 Instanced' : 'Canvas2D Fallback',
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Helper: convert PointerEvent / DragEvent to canvas CSS coordinates and world coordinates
  const getCoords = (clientX: number, clientY: number): { screen: Point; world: Point } => {
    const canvas = canvasRef.current;
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const screen = { x: clientX - rect.left, y: clientY - rect.top };
    const vp = propsRef.current.viewport;
    return {
      screen,
      world: {
        x: (screen.x - vp.x) / vp.zoom,
        y: (screen.y - vp.y) / vp.zoom,
      },
    };
  };

  const updateCursorForHover = (
    pinHit: PinHit | null,
    compHit: CircuitComponent | null,
  ) => {
    const mode = propsRef.current.toolMode;
    if (mode === 'pan') {
      setCursorStyle('grab');
      return;
    }
    if (mode === 'place' || wireDraftRef.current) {
      setCursorStyle('crosshair');
      return;
    }
    if (pinHit) {
      setCursorStyle('pointer');
      return;
    }
    if (compHit && (compHit.type === 'TOGGLE_SWITCH' || compHit.type === 'PUSH_BUTTON')) {
      setCursorStyle('pointer');
      return;
    }
    setCursorStyle('default');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { world } = getCoords(e.clientX, e.clientY);
    const curProps = propsRef.current;
    const sim = curProps.simulationRef.current;
    const docComponents = curProps.document.components;
    const docWires = curProps.document.wires;

    // Right-click while wiring cancels wire draft
    if (e.button === 2 && wireDraftRef.current) {
      wireDraftRef.current = null;
      setCursorStyle(curProps.toolMode === 'pan' ? 'grab' : 'default');
      return;
    }

    // Middle drag, Right drag, or Left drag in pan mode -> Pan
    if (e.button === 1 || e.button === 2 || (e.button === 0 && curProps.toolMode === 'pan')) {
      canvas.setPointerCapture(e.pointerId);
      interactionRef.current = {
        mode: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startViewport: { ...curProps.viewport },
      };
      setCursorStyle('grabbing');
      return;
    }

    if (e.button !== 0) return;

    // Place mode
    if (curProps.toolMode === 'place' && curProps.pendingPlacement) {
      const snapped = snapPointToGrid(world);
      curProps.onAddComponent(
        curProps.pendingPlacement.type,
        snapped.x,
        snapped.y,
        curProps.pendingPlacement.props,
      );
      if (!e.shiftKey) {
        curProps.onClearPlacement();
      }
      return;
    }

    // Select mode: check active wire draft first
    if (wireDraftRef.current) {
      const draft = wireDraftRef.current;
      const pinHit = hitTestPin(world, docComponents, curProps.viewport.zoom);

      if (pinHit) {
        if (
          pinHit.component.id === draft.from.componentId &&
          pinHit.pin.id === draft.from.pinId
        ) {
          wireDraftRef.current = null;
          setCursorStyle('default');
          return;
        }
        curProps.onAddWire({
          from: draft.from,
          to: { componentId: pinHit.component.id, pinId: pinHit.pin.id },
          waypoints: draft.waypoints.length > 0 ? draft.waypoints : undefined,
        });
        wireDraftRef.current = null;
        setCursorStyle('default');
        return;
      }

      // Clicked empty space -> add waypoint
      draft.waypoints = [...draft.waypoints, snapPointToGrid(world)];
      return;
    }

    // Hit-test pin to start wiring
    const pinHit = hitTestPin(world, docComponents, curProps.viewport.zoom);
    if (pinHit) {
      wireDraftRef.current = {
        from: { componentId: pinHit.component.id, pinId: pinHit.pin.id },
        fromPos: pinHit.pos,
        fromNormal: getRotatedPinNormal(pinHit.component, pinHit.pin),
        waypoints: [],
        cursorWorld: world,
        snapPin: null,
        style: curProps.wireStyle,
      };
      setCursorStyle('crosshair');
      return;
    }

    // Hit-test component
    const compHit = hitTestComponent(world, docComponents);
    if (compHit) {
      canvas.setPointerCapture(e.pointerId);

      if (compHit.type === 'PUSH_BUTTON') {
        sim?.setPushButtonState(compHit.id, true);
        curProps.onPushButton(compHit.id, true);
        interactionRef.current = {
          mode: 'press-button',
          comp: compHit,
          startClient: { x: e.clientX, y: e.clientY },
          startWorld: world,
          shiftKey: e.shiftKey,
        };
        return;
      }

      interactionRef.current = {
        mode: 'pending-comp',
        comp: compHit,
        startClient: { x: e.clientX, y: e.clientY },
        startWorld: world,
        shiftKey: e.shiftKey,
      };
      return;
    }

    // Hit-test wire
    const wireHit = hitTestWire(
      world,
      docWires,
      baseRoutingRef.current.wirePaths,
      curProps.viewport.zoom,
    );
    if (wireHit) {
      if (e.shiftKey) {
        const nextWires = new Set(curProps.selection.wireIds);
        if (nextWires.has(wireHit.id)) nextWires.delete(wireHit.id);
        else nextWires.add(wireHit.id);
        curProps.onSelectionChange({
          componentIds: new Set(curProps.selection.componentIds),
          wireIds: nextWires,
        });
      } else {
        curProps.onSelectionChange({
          componentIds: new Set(),
          wireIds: new Set([wireHit.id]),
        });
      }
      return;
    }

    // Empty space -> Marquee selection
    canvas.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'marquee',
      startClient: { x: e.clientX, y: e.clientY },
      startWorld: world,
      currentWorld: world,
      shiftKey: e.shiftKey,
      baseSelection: curProps.selection,
    };
    marqueeRectRef.current = normalizePointsToAABB(world, world);
  };

  const beginComponentDrag = (
    comp: CircuitComponent,
    startWorld: Point,
    currentWorld: Point,
  ) => {
    const curProps = propsRef.current;
    const docComponents = curProps.document.components;

    let dragIds: Set<string>;
    if (curProps.selection.componentIds.has(comp.id)) {
      dragIds = new Set(curProps.selection.componentIds);
    } else {
      dragIds = new Set([comp.id]);
      curProps.onSelectionChange({
        componentIds: dragIds,
        wireIds: new Set(),
      });
    }

    const origPositions = new Map<string, Point>();
    for (let i = 0; i < docComponents.length; i++) {
      const c = docComponents[i];
      if (dragIds.has(c.id)) {
        origPositions.set(c.id, { x: c.x, y: c.y });
      }
    }

    const dx = snapToGrid(currentWorld.x - startWorld.x);
    const dy = snapToGrid(currentWorld.y - startWorld.y);

    dragRoutingCacheRef.current = null;
    interactionRef.current = {
      mode: 'drag-components',
      dragIds,
      startWorld,
      origPositions,
      dx,
      dy,
    };
    setCursorStyle('grabbing');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { world } = getCoords(e.clientX, e.clientY);
    const curProps = propsRef.current;
    const docComponents = curProps.document.components;
    const docWires = curProps.document.wires;
    const inter = interactionRef.current;

    if (inter.mode === 'pan') {
      const dx = e.clientX - inter.startClient.x;
      const dy = e.clientY - inter.startClient.y;
      curProps.onViewportChange({
        x: inter.startViewport.x + dx,
        y: inter.startViewport.y + dy,
        zoom: inter.startViewport.zoom,
      });
      return;
    }

    if (inter.mode === 'press-button') {
      const dist = Math.hypot(e.clientX - inter.startClient.x, e.clientY - inter.startClient.y);
      if (dist > DRAG_THRESHOLD_PX) {
        curProps.simulationRef.current?.setPushButtonState(inter.comp.id, false);
        curProps.onPushButton(inter.comp.id, false);
        beginComponentDrag(inter.comp, inter.startWorld, world);
      }
      return;
    }

    if (inter.mode === 'pending-comp') {
      const dist = Math.hypot(e.clientX - inter.startClient.x, e.clientY - inter.startClient.y);
      if (dist > DRAG_THRESHOLD_PX) {
        beginComponentDrag(inter.comp, inter.startWorld, world);
      }
      return;
    }

    if (inter.mode === 'drag-components') {
      inter.dx = snapToGrid(world.x - inter.startWorld.x);
      inter.dy = snapToGrid(world.y - inter.startWorld.y);
      return;
    }

    if (inter.mode === 'marquee') {
      inter.currentWorld = world;
      marqueeRectRef.current = normalizePointsToAABB(inter.startWorld, world);
      return;
    }

    // Placement ghost preview
    if (curProps.toolMode === 'place' && curProps.pendingPlacement) {
      const snapped = snapPointToGrid(world);
      ghostPlacementRef.current = {
        type: curProps.pendingPlacement.type,
        x: snapped.x,
        y: snapped.y,
        props: curProps.pendingPlacement.props,
      };
    } else {
      ghostPlacementRef.current = null;
    }

    // Skip linear O(N) pin/wire hover scanning when zoomed out on massive >15k VLSI benchmark dies
    if (docComponents.length > MAX_CPU_ROUTED_WIRES && curProps.viewport.zoom < 0.35) {
      hoveredPinRef.current = null;
      hoveredWireIdRef.current = null;
      if (hoverTargetRef.current) {
        hoverTargetRef.current = null;
        curProps.onHoverProbe(null);
      }
      updateCursorForHover(null, null);
      return;
    }

    // Pin & Wire hover detection
    const pinHit = hitTestPin(world, docComponents, curProps.viewport.zoom);
    hoveredPinRef.current = pinHit;

    if (wireDraftRef.current) {
      wireDraftRef.current.cursorWorld = world;
      wireDraftRef.current.snapPin =
        pinHit &&
        !(
          pinHit.component.id === wireDraftRef.current.from.componentId &&
          pinHit.pin.id === wireDraftRef.current.from.pinId
        )
          ? pinHit
          : null;
    }

    const sim = curProps.simulationRef.current;
    const snapshot = sim ? sim.getSnapshot() : null;

    if (pinHit) {
      hoveredWireIdRef.current = null;
      const val = sim
        ? sim.getPinValue(pinHit.component.id, pinHit.pin.id)
        : LogicValue.Z;
      const netId =
        snapshot?.pinToNet.get(`${pinHit.component.id}:${pinHit.pin.id}`) ?? null;
      const title = `${pinHit.component.props.label || pinHit.component.type}.${pinHit.pin.label}`;
      const subtitle = `Pin (${pinHit.pin.role})`;

      hoverTargetRef.current = {
        kind: 'pin',
        compId: pinHit.component.id,
        pinId: pinHit.pin.id,
        title,
        subtitle,
        clientX: e.clientX,
        clientY: e.clientY,
        lastValue: val,
        lastNetId: netId,
      };
      const probe: HoverProbe = {
        screenX: e.clientX,
        screenY: e.clientY,
        title,
        subtitle,
        value: val,
        netId,
      };
      curProps.onHoverProbe(probe);
      updateCursorForHover(pinHit, null);
      return;
    }

    const wireHit = hitTestWire(
      world,
      docWires,
      baseRoutingRef.current.wirePaths,
      curProps.viewport.zoom,
    );
    hoveredWireIdRef.current = wireHit ? wireHit.id : null;

    if (wireHit) {
      const val = sim ? sim.getWireValue(wireHit.id) : LogicValue.Z;
      const netId = snapshot?.wireToNet.get(wireHit.id) ?? null;
      const title = `Kablo #${wireHit.id.slice(0, 6)}`;
      const subtitle = `${wireHit.from.pinId} → ${wireHit.to.pinId}`;

      hoverTargetRef.current = {
        kind: 'wire',
        wireId: wireHit.id,
        title,
        subtitle,
        clientX: e.clientX,
        clientY: e.clientY,
        lastValue: val,
        lastNetId: netId,
      };
      curProps.onHoverProbe({
        screenX: e.clientX,
        screenY: e.clientY,
        title,
        subtitle,
        value: val,
        netId,
      });
      updateCursorForHover(null, null);
      return;
    }

    if (hoverTargetRef.current) {
      hoverTargetRef.current = null;
      curProps.onHoverProbe(null);
    }

    const compHit = hitTestComponent(world, docComponents);
    updateCursorForHover(null, compHit);
  };

  const finishInteraction = (e: React.PointerEvent<HTMLCanvasElement>, isCancel: boolean) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    const curProps = propsRef.current;
    const docComponents = curProps.document.components;
    const docWires = curProps.document.wires;
    const inter = interactionRef.current;
    interactionRef.current = { mode: 'idle' };

    if (inter.mode === 'pan') {
      setCursorStyle(curProps.toolMode === 'pan' ? 'grab' : 'default');
      return;
    }

    if (inter.mode === 'press-button') {
      curProps.simulationRef.current?.setPushButtonState(inter.comp.id, false);
      curProps.onPushButton(inter.comp.id, false);
      if (!isCancel) {
        if (inter.shiftKey) {
          const nextIds = new Set(curProps.selection.componentIds);
          if (nextIds.has(inter.comp.id)) nextIds.delete(inter.comp.id);
          else nextIds.add(inter.comp.id);
          curProps.onSelectionChange({
            componentIds: nextIds,
            wireIds: new Set(curProps.selection.wireIds),
          });
        } else {
          curProps.onSelectionChange({
            componentIds: new Set([inter.comp.id]),
            wireIds: new Set(),
          });
        }
      }
      return;
    }

    if (inter.mode === 'pending-comp') {
      if (!isCancel) {
        if (inter.comp.type === 'TOGGLE_SWITCH' && !inter.shiftKey) {
          const sim = curProps.simulationRef.current;
          const liveHigh = sim
            ? isHigh(sim.getPinValue(inter.comp.id, 'OUT'))
            : Boolean(inter.comp.props.state);
          const curState =
            inter.comp.props.state !== undefined ? Boolean(inter.comp.props.state) : liveHigh;
          const nextState = !curState;
          sim?.setToggleState(inter.comp.id, nextState);
          curProps.onToggleSwitch(inter.comp.id, nextState);
        }

        if (inter.shiftKey) {
          const nextIds = new Set(curProps.selection.componentIds);
          if (nextIds.has(inter.comp.id)) nextIds.delete(inter.comp.id);
          else nextIds.add(inter.comp.id);
          curProps.onSelectionChange({
            componentIds: nextIds,
            wireIds: new Set(curProps.selection.wireIds),
          });
        } else {
          curProps.onSelectionChange({
            componentIds: new Set([inter.comp.id]),
            wireIds: new Set(),
          });
        }
      }
      return;
    }

    if (inter.mode === 'drag-components') {
      dragRoutingCacheRef.current = null;
      setCursorStyle('default');
      if (!isCancel && (inter.dx !== 0 || inter.dy !== 0)) {
        const moves: Array<{ id: string; x: number; y: number }> = [];
        for (const [id, orig] of inter.origPositions.entries()) {
          moves.push({ id, x: orig.x + inter.dx, y: orig.y + inter.dy });
        }
        if (moves.length > 0) {
          curProps.onMoveComponents(moves);
        }
      }
      return;
    }

    if (inter.mode === 'marquee') {
      const box = marqueeRectRef.current;
      marqueeRectRef.current = null;
      if (isCancel || !box) return;

      const dragPx = Math.hypot(e.clientX - inter.startClient.x, e.clientY - inter.startClient.y);
      if (dragPx <= DRAG_THRESHOLD_PX) {
        if (!inter.shiftKey) {
          curProps.onSelectionChange({
            componentIds: new Set(),
            wireIds: new Set(),
          });
        }
        return;
      }

      const hits = getComponentsInRect(box, docComponents);
      const nextCompIds = inter.shiftKey
        ? new Set(inter.baseSelection.componentIds)
        : new Set<string>();
      for (let i = 0; i < hits.length; i++) {
        nextCompIds.add(hits[i].id);
      }

      const nextWireIds = inter.shiftKey
        ? new Set(inter.baseSelection.wireIds)
        : new Set<string>();
      for (let i = 0; i < docWires.length; i++) {
        const w = docWires[i];
        if (nextCompIds.has(w.from.componentId) && nextCompIds.has(w.to.componentId)) {
          nextWireIds.add(w.id);
        }
      }

      curProps.onSelectionChange({
        componentIds: nextCompIds,
        wireIds: nextWireIds,
      });
    }
  };

  const handlePointerLeave = () => {
    hoveredPinRef.current = null;
    hoveredWireIdRef.current = null;
    ghostPlacementRef.current = null;
    dropTargetRef.current = null;
    if (hoverTargetRef.current) {
      hoverTargetRef.current = null;
      propsRef.current.onHoverProbe(null);
    }
  };

  // HTML5 Drag & Drop from ComponentPalette
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (!e.dataTransfer.types.includes('application/x-webtransistor-component')) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { world } = getCoords(e.clientX, e.clientY);
    const snapped = snapPointToGrid(world);

    const pending = propsRef.current.pendingPlacement;
    if (pending) {
      ghostPlacementRef.current = {
        type: pending.type,
        x: snapped.x,
        y: snapped.y,
        props: pending.props,
      };
      dropTargetRef.current = null;
    } else {
      dropTargetRef.current = snapped;
    }
  };

  const handleDragLeave = () => {
    dropTargetRef.current = null;
    ghostPlacementRef.current = null;
  };

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    dropTargetRef.current = null;
    ghostPlacementRef.current = null;

    const raw = e.dataTransfer.getData('application/x-webtransistor-component');
    if (!raw) return;

    e.preventDefault();
    try {
      const parsed = JSON.parse(raw) as { type: ComponentType; props?: ComponentProps };
      if (!parsed || !parsed.type) return;
      const { world } = getCoords(e.clientX, e.clientY);
      const snapped = snapPointToGrid(world);
      propsRef.current.onAddComponent(parsed.type, snapped.x, snapped.y, parsed.props);
    } catch {
      // Ignore malformed drop payload
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden select-none bg-[#090C10]"
    >
      <canvas
        ref={glCanvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="relative z-10 block h-full w-full touch-none"
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => finishInteraction(e, false)}
        onPointerCancel={(e) => finishInteraction(e, true)}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
    </div>
  );
};

export default CanvasViewport;
