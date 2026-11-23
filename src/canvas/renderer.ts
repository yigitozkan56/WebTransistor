import { getComponentPins } from '../engine/componentDefs';
import {
  isError,
  isHigh,
  LogicValue,
  type CircuitComponent,
  type ComponentProps,
  type ComponentType,
  type Point,
  type SimulationSnapshot,
  type Wire,
} from '../types/circuit';
import {
  GRID_SIZE,
  type ISimulator,
  type SelectionState,
  type Viewport,
  type WireStyle,
} from '../types/ui';
import {
  drawComponent,
  getLogicColor,
  isTransistorConducting,
  THEME,
  traceRoundedRect,
} from './drawComponents';
import {
  aabbIntersects,
  getComponentAABB,
  getRotatedPinNormal,
  type AABB,
  type PinHit,
  type WirePath,
} from './geometry';
import { computeRouteBetweenPoints, type WireJunction } from './routing';

export interface WireDraft {
  from: { componentId: string; pinId: string };
  fromPos: Point;
  fromNormal: Point;
  waypoints: Point[];
  cursorWorld: Point;
  snapPin: PinHit | null;
  style: WireStyle;
}

export interface GhostPlacement {
  type: ComponentType;
  x: number;
  y: number;
  props?: ComponentProps;
}

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  viewport: Viewport;
  components: CircuitComponent[];
  wires: Wire[];
  wirePaths: Map<string, WirePath>;
  wireBounds: Map<string, AABB>;
  junctions: WireJunction[];
  sim: ISimulator | null;
  snapshot: SimulationSnapshot | null;
  selection: SelectionState;
  hoveredPin: PinHit | null;
  hoveredWireId: string | null;
  wireDraft: WireDraft | null;
  ghostPlacement: GhostPlacement | null;
  dropTarget?: Point | null;
  marqueeRect: AABB | null;
  timestamp: number;
  /** True when the WebGL2 Hardware-Accelerated Instanced Renderer is active behind this 2D overlay. */
  webglActive?: boolean;
}

export const LOD_ZOOM_THRESHOLD = 0.35;
export const HYBRID_2D_MAX_COMPONENTS = 5000;
const LOD_VISIBLE_COMPONENT_THRESHOLD = 3000;
const DENSITY_GRID_THRESHOLD = 8000;

/**
 * Determines whether the 2D schematic canvas overlay should render detailed symbols,
 * pin labels, and animated wire dashes (`zoom >= 0.35` and `components.length <= 5000`).
 */
export function isOverlay2dDetailedMode(zoom: number, componentCount: number): boolean {
  return zoom >= LOD_ZOOM_THRESHOLD && componentCount <= HYBRID_2D_MAX_COMPONENTS;
}

function traceWirePath(ctx: CanvasRenderingContext2D, path: WirePath): void {
  const pts = path.points;
  if (pts.length < 2) return;

  ctx.beginPath();
  if (path.type === 'bezier') {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
    return;
  }

  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(4, d1 * 0.45, d2 * 0.45);
    if (r > 0.25) {
      ctx.arcTo(curr.x, curr.y, next.x, next.y, r);
    } else {
      ctx.lineTo(curr.x, curr.y);
    }
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: AABB,
  zoom: number,
): void {
  const majorStep = GRID_SIZE * 5; // 100px

  if (zoom >= 0.25) {
    const startX = Math.floor(view.minX / majorStep) * majorStep;
    const endX = Math.ceil(view.maxX / majorStep) * majorStep;
    const startY = Math.floor(view.minY / majorStep) * majorStep;
    const endY = Math.ceil(view.maxY / majorStep) * majorStep;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += majorStep) {
      ctx.moveTo(x, view.minY);
      ctx.lineTo(x, view.maxY);
    }
    for (let y = startY; y <= endY; y += majorStep) {
      ctx.moveTo(view.minX, y);
      ctx.lineTo(view.maxX, y);
    }
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();
  }

  if (zoom >= 0.45) {
    const startX = Math.floor(view.minX / GRID_SIZE) * GRID_SIZE;
    const endX = Math.ceil(view.maxX / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(view.minY / GRID_SIZE) * GRID_SIZE;
    const endY = Math.ceil(view.maxY / GRID_SIZE) * GRID_SIZE;

    const cols = Math.floor((endX - startX) / GRID_SIZE) + 1;
    const rows = Math.floor((endY - startY) / GRID_SIZE) + 1;
    if (cols * rows <= 6500) {
      const dotSize = Math.max(1.2, 1.5 / zoom);
      const half = dotSize / 2;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      for (let x = startX; x <= endX; x += GRID_SIZE) {
        for (let y = startY; y <= endY; y += GRID_SIZE) {
          ctx.fillRect(x - half, y - half, dotSize, dotSize);
        }
      }
    }
  }
}

function drawSingleWire(
  ctx: CanvasRenderingContext2D,
  path: WirePath,
  val: LogicValue,
  isSelected: boolean,
  isHovered: boolean,
  zoom: number,
  flowOffset: number,
  isLodMode: boolean,
): void {
  if (isLodMode) {
    const pts = path.points;
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = isError(val) ? THEME.err : isHigh(val) ? THEME.high : THEME.low;
    ctx.lineWidth = isHigh(val) || isError(val) ? Math.max(1.8, 1.2 / zoom) : Math.max(1.2, 0.8 / zoom);
    ctx.stroke();
    return;
  }

  traceWirePath(ctx, path);

  if (isSelected) {
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    ctx.lineWidth = 6.5;
    ctx.stroke();
  } else if (isHovered) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.20)';
    ctx.lineWidth = 5.5;
    ctx.stroke();
  }

  if (isError(val)) {
    ctx.strokeStyle = THEME.errGlow;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.strokeStyle = THEME.err;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    return;
  }

  if (isHigh(val)) {
    ctx.strokeStyle = THEME.highGlow;
    ctx.lineWidth = 5.5;
    ctx.stroke();

    ctx.strokeStyle = THEME.high;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (zoom >= 0.45) {
      ctx.setLineDash([4, 12]);
      ctx.lineDashOffset = flowOffset;
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    return;
  }

  if (val === LogicValue.Z) {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = isSelected || isHovered ? '#64748B' : THEME.z;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }

  // LOW / WEAK_LOW
  ctx.strokeStyle = isSelected ? '#64748B' : isHovered ? '#475569' : THEME.low;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

/**
 * High-Speed Silicon Die Thermal & Power Density LOD Renderer (Canvas 2D Fallback when WebGL2 is unavailable).
 * Renders glowing thermal current density clusters across zoomed-out views or 1,000,000+ transistor scenes.
 */
function renderSiliconDieLod(
  ctx: CanvasRenderingContext2D,
  visibleIndices: number[],
  components: CircuitComponent[],
  sim: ISimulator | null,
  snapshot: SimulationSnapshot | null,
  selection: SelectionState,
  viewRect: AABB,
  zoom: number,
): void {
  const count = visibleIndices.length;
  if (count === 0) return;

  // Ultra-dense Macro Spatial Thermal & Current Density Heatmap Grid when >8,000 components visible
  if (count >= DENSITY_GRID_THRESHOLD) {
    const cellWorldSize = Math.max(80, Math.round(28 / Math.max(zoom, 0.008) / 20) * 20);
    const cols = Math.max(1, Math.ceil(viewRect.width / cellWorldSize));
    const rows = Math.max(1, Math.ceil(viewRect.height / cellWorldSize));
    const totalCells = cols * rows;

    const cellTotal = new Uint32Array(totalCells);
    const cellActiveNmos = new Uint32Array(totalCells);
    const cellActivePmos = new Uint32Array(totalCells);
    const cellHasErr = new Uint8Array(totalCells);

    const txSoA = snapshot?.transistors;
    const txState = txSoA ? txSoA.state : null;
    const txCount = txSoA ? txSoA.count : 0;

    for (let i = 0; i < count; i++) {
      const compIdx = visibleIndices[i];
      const comp = components[compIdx];
      const cx = Math.floor((comp.x - viewRect.minX) / cellWorldSize);
      const cy = Math.floor((comp.y - viewRect.minY) / cellWorldSize);
      if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) continue;
      const cellIdx = cy * cols + cx;
      cellTotal[cellIdx]++;

      if (comp.type === 'NMOS') {
        const on =
          txState && compIdx < txCount
            ? txState[compIdx] === 1
            : isTransistorConducting(comp, sim, snapshot);
        if (on) cellActiveNmos[cellIdx]++;
      } else if (comp.type === 'PMOS') {
        const on =
          txState && compIdx < txCount
            ? txState[compIdx] === 1
            : isTransistorConducting(comp, sim, snapshot);
        if (on) cellActivePmos[cellIdx]++;
      } else if (comp.type === 'VCC') {
        cellActiveNmos[cellIdx]++;
      } else if (
        comp.type === 'LED' ||
        comp.type === 'TOGGLE_SWITCH' ||
        comp.type === 'PUSH_BUTTON'
      ) {
        const pin = comp.type === 'LED' ? 'IN' : 'OUT';
        const val = sim ? sim.getPinValue(comp.id, pin) : LogicValue.Z;
        if (isError(val)) cellHasErr[cellIdx] = 1;
        else if (isHigh(val)) cellActiveNmos[cellIdx]++;
      }
    }

    const pad = Math.min(4, cellWorldSize * 0.08);
    const haloExpand = Math.max(4, cellWorldSize * 0.16);

    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const idx = cy * cols + cx;
        const tot = cellTotal[idx];
        if (tot === 0) continue;

        const x = viewRect.minX + cx * cellWorldSize + pad;
        const y = viewRect.minY + cy * cellWorldSize + pad;
        const w = cellWorldSize - pad * 2;
        const h = cellWorldSize - pad * 2;

        const nmosOn = cellActiveNmos[idx];
        const pmosOn = cellActivePmos[idx];
        const err = cellHasErr[idx] === 1 || Boolean(snapshot?.hasShortCircuit && (nmosOn > 0 && pmosOn > 0));

        if (err) {
          ctx.fillStyle = THEME.errGlow;
          ctx.fillRect(x - haloExpand, y - haloExpand, w + haloExpand * 2, h + haloExpand * 2);
          ctx.fillStyle = THEME.err;
        } else if (nmosOn > 0 || pmosOn > 0) {
          const isCyanDominant = nmosOn >= pmosOn;
          ctx.fillStyle = isCyanDominant ? THEME.highGlow : THEME.goldGlow;
          ctx.fillRect(x - haloExpand, y - haloExpand, w + haloExpand * 2, h + haloExpand * 2);
          ctx.fillStyle = isCyanDominant ? THEME.high : THEME.gold;
        } else {
          ctx.fillStyle = '#161B24';
        }
        ctx.fillRect(x, y, w, h);
      }
    }
    return;
  }

  // Silicon Die Micro-Block LOD View with Thermal Halos
  const strokeW = Math.max(1, 1 / zoom);

  for (let i = 0; i < count; i++) {
    const comp = components[visibleIndices[i]];
    const aabb = getComponentAABB(comp);
    const w = Math.max(18, aabb.width - 8);
    const h = Math.max(18, aabb.height - 8);
    const x = comp.x - w / 2;
    const y = comp.y - h / 2;

    let fillColor: string = '#161B24';
    let glowColor: string | null = null;

    if (comp.type === 'NMOS') {
      if (isTransistorConducting(comp, sim, snapshot)) {
        fillColor = THEME.high;
        glowColor = THEME.highGlow;
      }
    } else if (comp.type === 'PMOS') {
      if (isTransistorConducting(comp, sim, snapshot)) {
        fillColor = THEME.gold;
        glowColor = THEME.goldGlow;
      }
    } else if (comp.type === 'VCC') {
      fillColor = THEME.high;
      glowColor = THEME.highGlow;
    } else if (comp.type === 'LED') {
      if (sim && isHigh(sim.getPinValue(comp.id, 'IN'))) {
        fillColor = THEME.high;
        glowColor = THEME.highGlow;
      }
    } else if (comp.type === 'TOGGLE_SWITCH' || comp.type === 'PUSH_BUTTON') {
      if ((sim && isHigh(sim.getPinValue(comp.id, 'OUT'))) || comp.props.state) {
        fillColor = THEME.high;
        glowColor = THEME.highGlow;
      }
    } else if (comp.type === 'PIXEL_MATRIX') {
      fillColor = '#10151E';
    }

    if (glowColor) {
      ctx.fillStyle = glowColor;
      ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, w, h);

    if (selection.componentIds.has(comp.id)) {
      ctx.strokeStyle = THEME.high;
      ctx.lineWidth = strokeW;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
    }
  }
}

function drawInteractiveOverlays(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  hoveredPin: PinHit | null,
  wireDraft: WireDraft | null,
  ghostPlacement: GhostPlacement | null,
  dropTarget: Point | null | undefined,
  marqueeRect: AABB | null,
  drawHoveredPinRing: boolean,
): void {
  // 1. Hovered Pin Ring
  if (hoveredPin && drawHoveredPinRing) {
    ctx.beginPath();
    ctx.arc(hoveredPin.pos.x, hoveredPin.pos.y, 6.8, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, 1.8 / viewport.zoom);
    ctx.strokeStyle = THEME.high;
    ctx.stroke();
  }

  // 2. In-Progress Wire Preview
  if (wireDraft) {
    const targetPos = wireDraft.snapPin ? wireDraft.snapPin.pos : wireDraft.cursorWorld;
    const targetNormal = wireDraft.snapPin
      ? getRotatedPinNormal(wireDraft.snapPin.component, wireDraft.snapPin.pin)
      : null;

    const draftPath = computeRouteBetweenPoints(
      wireDraft.fromPos,
      wireDraft.fromNormal,
      targetPos,
      targetNormal,
      wireDraft.waypoints,
      wireDraft.style,
    );

    traceWirePath(ctx, draftPath);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.lineWidth = Math.max(2, 2 / viewport.zoom);
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < wireDraft.waypoints.length; i++) {
      const wp = wireDraft.waypoints[i];
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = THEME.high;
      ctx.fill();
    }
  }

  // 3. Ghost Component Preview (placement mode / drag-and-drop)
  if (ghostPlacement) {
    const ghostComp: CircuitComponent = {
      id: '__ghost__',
      type: ghostPlacement.type,
      x: ghostPlacement.x,
      y: ghostPlacement.y,
      rotation: 0,
      props: ghostPlacement.props ?? {},
    };
    const ghostPins = getComponentPins(ghostComp);
    drawComponent({
      ctx,
      comp: ghostComp,
      pins: ghostPins,
      sim: null,
      snapshot: null,
      zoom: viewport.zoom,
      isGhost: true,
    });
  } else if (dropTarget) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    traceRoundedRect(ctx, dropTarget.x - 20, dropTarget.y - 20, 40, 40, 6);
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, 1.5 / viewport.zoom);
    ctx.strokeStyle = THEME.high;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(dropTarget.x - 8, dropTarget.y);
    ctx.lineTo(dropTarget.x + 8, dropTarget.y);
    ctx.moveTo(dropTarget.x, dropTarget.y - 8);
    ctx.lineTo(dropTarget.x, dropTarget.y + 8);
    ctx.strokeStyle = THEME.high;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Marquee Selection Box
  if (marqueeRect) {
    ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.fillRect(marqueeRect.minX, marqueeRect.minY, marqueeRect.width, marqueeRect.height);
    ctx.lineWidth = Math.max(1, 1.3 / viewport.zoom);
    ctx.strokeStyle = THEME.high;
    ctx.strokeRect(marqueeRect.minX, marqueeRect.minY, marqueeRect.width, marqueeRect.height);
  }
}

function drawDieRendererBadge(
  ctx: CanvasRenderingContext2D,
  height: number,
  text: string,
  accentHex: string,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(16, 21, 30, 0.88)';
  traceRoundedRect(ctx, 14, height - 38, 286, 26, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(26, height - 25, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = accentHex;
  ctx.fill();

  ctx.fillStyle = accentHex;
  ctx.font = '600 10.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 35, height - 25);
  ctx.restore();
}

/**
 * Renders the 2D schematic overlay or full 2D fallback frame.
 * - When `webglActive` is true and (`viewport.zoom < 0.35` or `components.length > 5000`),
 *   WebGL2 Instanced Rendering owns the entire 1,000,000+ transistor & wire field at 60 FPS
 *   with zero CPU draw-loop bottleneck on Canvas 2D!
 * - When zoomed in (`viewport.zoom >= 0.35` and `components.length <= 5000`), the 2D overlay
 *   renders crisp schematic symbols, pin labels, switch toggles, and wire dashes over the transparent canvas.
 */
export function renderCanvasFrame(params: RenderFrameParams): void {
  const {
    ctx,
    width,
    height,
    dpr,
    viewport,
    components,
    wires,
    wirePaths,
    wireBounds,
    junctions,
    sim,
    snapshot,
    selection,
    hoveredPin,
    hoveredWireId,
    wireDraft,
    ghostPlacement,
    dropTarget,
    marqueeRect,
    timestamp,
    webglActive = false,
  } = params;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (webglActive) {
    // Transparent 2D overlay on top of WebGL2 hardware instanced layer
    ctx.clearRect(0, 0, width, height);
  } else {
    // Opaque Silicon Dark Matte Canvas Background (#090C10) for 2D fallback
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, width, height);
  }

  if (width <= 0 || height <= 0) return;

  const detailed2dOverlay = isOverlay2dDetailedMode(viewport.zoom, components.length);

  // Fast zero-bottleneck handoff to WebGL2 Instanced Renderer when zoomed out or viewing 10k-1M+ transistors
  if (webglActive && !detailed2dOverlay) {
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Render crisp 2D pixels & labels for visible interactive I/O components (LCD, Switches, LEDs)
    // even on massive 40,000+ transistor VLSI dies (capped at 64 I/O elements -> <0.1ms cost!)
    if (viewport.zoom >= LOD_ZOOM_THRESHOLD) {
      const invZ = 1 / Math.max(viewport.zoom, 0.0001);
      const viewMinX = -viewport.x * invZ - 240;
      const viewMaxX = (width - viewport.x) * invZ + 240;
      const viewMinY = -viewport.y * invZ - 240;
      const viewMaxY = (height - viewport.y) * invZ + 240;
      let drawnIo = 0;
      for (let i = 0; i < components.length && drawnIo < 64; i++) {
        const comp = components[i];
        const t = comp.type;
        if (
          t !== 'PIXEL_MATRIX' &&
          t !== 'TOGGLE_SWITCH' &&
          t !== 'PUSH_BUTTON' &&
          t !== 'LED'
        ) {
          continue;
        }
        if (
          comp.x < viewMinX ||
          comp.x > viewMaxX ||
          comp.y < viewMinY ||
          comp.y > viewMaxY
        ) {
          continue;
        }
        drawComponent({
          ctx,
          comp,
          pins: getComponentPins(comp),
          sim,
          snapshot,
          zoom: viewport.zoom,
        });
        drawnIo++;
      }
    }

    // Draw selection highlights if a modest selection exists
    if (selection.componentIds.size > 0 && selection.componentIds.size <= 500 && components.length <= 50000) {
      const strokeW = Math.max(1.2, 1.5 / viewport.zoom);
      ctx.strokeStyle = THEME.high;
      ctx.lineWidth = strokeW;
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        if (!selection.componentIds.has(comp.id)) continue;
        ctx.strokeRect(comp.x - 21, comp.y - 21, 42, 42);
      }
    }

    drawInteractiveOverlays(
      ctx,
      viewport,
      hoveredPin,
      wireDraft,
      ghostPlacement,
      dropTarget,
      marqueeRect,
      viewport.zoom >= LOD_ZOOM_THRESHOLD,
    );

    ctx.restore();

    if (components.length > 0) {
      drawDieRendererBadge(
        ctx,
        height,
        `WEBGL2 INSTANCED DIE · ${components.length.toLocaleString('tr-TR')} ELEMAN`,
        THEME.high,
      );
    }
    return;
  }

  const invZoom = 1 / viewport.zoom;
  const cullPad = 80;
  const viewRect: AABB = {
    minX: -viewport.x * invZoom - cullPad,
    minY: -viewport.y * invZoom - cullPad,
    maxX: (width - viewport.x) * invZoom + cullPad,
    maxY: (height - viewport.y) * invZoom + cullPad,
    width: width * invZoom + cullPad * 2,
    height: height * invZoom + cullPad * 2,
  };

  // Pre-filter visible components inside camera frustum `viewRect`
  const visibleIndices: number[] = [];
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    if (
      comp.type !== 'PIXEL_MATRIX' &&
      (comp.x + 40 < viewRect.minX ||
        comp.x - 40 > viewRect.maxX ||
        comp.y + 40 < viewRect.minY ||
        comp.y - 40 > viewRect.maxY)
    ) {
      continue;
    }
    const aabb = getComponentAABB(comp);
    if (aabbIntersects(viewRect, aabb)) {
      visibleIndices.push(i);
    }
  }

  const isLodMode =
    !detailed2dOverlay || visibleIndices.length > LOD_VISIBLE_COMPONENT_THRESHOLD;

  // If WebGL2 is active and visible count exceeded threshold even with <=5000 components, hand off to WebGL2
  if (webglActive && isLodMode) {
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);
    drawInteractiveOverlays(
      ctx,
      viewport,
      hoveredPin,
      wireDraft,
      ghostPlacement,
      dropTarget,
      marqueeRect,
      false,
    );
    ctx.restore();
    if (visibleIndices.length > 0) {
      drawDieRendererBadge(
        ctx,
        height,
        `WEBGL2 INSTANCED DIE · ${visibleIndices.length.toLocaleString('tr-TR')} ELEMAN`,
        THEME.high,
      );
    }
    return;
  }

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  // 1. Adaptive Grid (drawn on 2D canvas only when WebGL2 grid isn't underneath)
  if (!webglActive) {
    drawGrid(ctx, viewRect, viewport.zoom);
  }

  // 2. Wires (frustum culled)
  if (!isLodMode || visibleIndices.length < DENSITY_GRID_THRESHOLD) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const flowOffset = -((timestamp * 0.032) % 16);

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < wires.length; i++) {
        const wire = wires[i];
        const bounds = wireBounds.get(wire.id);
        if (!bounds || !aabbIntersects(viewRect, bounds)) continue;
        const path = wirePaths.get(wire.id);
        if (!path) continue;

        const val = sim ? sim.getWireValue(wire.id) : LogicValue.Z;
        const isHot = isHigh(val) || isError(val);
        if ((pass === 0 && isHot) || (pass === 1 && !isHot)) continue;

        drawSingleWire(
          ctx,
          path,
          val,
          selection.wireIds.has(wire.id),
          hoveredWireId === wire.id,
          viewport.zoom,
          flowOffset,
          isLodMode,
        );
      }
    }
  }

  // 3. Wire Junction Dots (frustum culled, detailed mode only)
  if (!isLodMode) {
    for (let i = 0; i < junctions.length; i++) {
      const j = junctions[i];
      if (
        j.x < viewRect.minX ||
        j.x > viewRect.maxX ||
        j.y < viewRect.minY ||
        j.y > viewRect.maxY
      ) {
        continue;
      }
      const val = sim ? sim.getWireValue(j.wireId) : LogicValue.Z;
      ctx.beginPath();
      ctx.arc(j.x, j.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = getLogicColor(val);
      ctx.fill();
      if (!isHigh(val) && !isError(val)) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#384152';
        ctx.stroke();
      }
    }
  }

  // 4. Components (Silicon Die LOD Fallback vs Detailed Physical Schematic)
  if (isLodMode) {
    renderSiliconDieLod(
      ctx,
      visibleIndices,
      components,
      sim,
      snapshot,
      selection,
      viewRect,
      viewport.zoom,
    );
  } else {
    const hoveredPinInfo = hoveredPin
      ? { componentId: hoveredPin.component.id, pinId: hoveredPin.pin.id }
      : null;

    for (let idx = 0; idx < visibleIndices.length; idx++) {
      const comp = components[visibleIndices[idx]];
      const aabb = getComponentAABB(comp);
      const pins = getComponentPins(comp);
      drawComponent({
        ctx,
        comp,
        pins,
        sim,
        snapshot,
        zoom: viewport.zoom,
        hoveredPin: hoveredPinInfo,
      });

      if (selection.componentIds.has(comp.id)) {
        const pad = 5;
        traceRoundedRect(
          ctx,
          aabb.minX - pad,
          aabb.minY - pad,
          aabb.width + pad * 2,
          aabb.height + pad * 2,
          8,
        );
        ctx.fillStyle = 'rgba(0, 229, 255, 0.05)';
        ctx.fill();
        ctx.lineWidth = Math.max(1.2, 1.5 / viewport.zoom);
        ctx.strokeStyle = THEME.high;
        ctx.stroke();
      }
    }
  }

  // 5-8. Interactive Overlays (Hovered Pin, Wire Draft, Ghost Placement, Marquee Box)
  drawInteractiveOverlays(
    ctx,
    viewport,
    hoveredPin,
    wireDraft,
    ghostPlacement,
    dropTarget,
    marqueeRect,
    !isLodMode,
  );

  ctx.restore();

  // Subtle Silicon Die LOD badge in bottom-left when in 2D Fallback LOD mode
  if (isLodMode && visibleIndices.length > 0) {
    drawDieRendererBadge(
      ctx,
      height,
      `SILICON DIE LOD · ${visibleIndices.length.toLocaleString('tr-TR')} ELEMAN`,
      THEME.high,
    );
  }
}
