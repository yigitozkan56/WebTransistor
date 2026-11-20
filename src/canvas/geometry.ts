import {
  getComponentDimensions,
  getComponentPins,
  getPinWorldPosition,
  rotateSide,
} from '../engine/componentDefs';
import type {
  CircuitComponent,
  PinDef,
  Point,
  Wire,
} from '../types/circuit';
import { GRID_SIZE, type Viewport } from '../types/ui';

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PinHit {
  component: CircuitComponent;
  pin: PinDef;
  pos: Point;
}

export type WirePath =
  | { type: 'orthogonal'; points: Point[] }
  | { type: 'bezier'; points: [Point, Point, Point, Point] };

/** Converts a world-space point into CSS screen-space coordinates. */
export function worldToScreen(p: Point, vp: Viewport): Point {
  return {
    x: p.x * vp.zoom + vp.x,
    y: p.y * vp.zoom + vp.y,
  };
}

/** Converts a CSS screen-space point into world-space coordinates. */
export function screenToWorld(p: Point, vp: Viewport): Point {
  return {
    x: (p.x - vp.x) / vp.zoom,
    y: (p.y - vp.y) / vp.zoom,
  };
}

/** Snaps a scalar coordinate to the nearest grid multiple, normalizing -0 to 0. */
export function snapToGrid(v: number, gridSize: number = GRID_SIZE): number {
  const snapped = Math.round(v / gridSize) * gridSize;
  return snapped === 0 ? 0 : snapped;
}

/** Snaps a 2D point to the nearest grid intersection. */
export function snapPointToGrid(p: Point, gridSize: number = GRID_SIZE): Point {
  return {
    x: snapToGrid(p.x, gridSize),
    y: snapToGrid(p.y, gridSize),
  };
}

/** Returns the world-space position of a pin accounting for component rotation. */
export function getRotatedPinPos(comp: CircuitComponent, pin: PinDef): Point {
  return getPinWorldPosition(comp, pin);
}

/** Returns the outward unit normal vector `{ x, y }` for a pin after component rotation. */
export function getRotatedPinNormal(comp: CircuitComponent, pin: PinDef): Point {
  const side = rotateSide(pin.side, comp.rotation);
  switch (side) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
  }
}

/** Computes the world-space axis-aligned bounding box of a component, accounting for rotation. */
export function getComponentAABB(comp: CircuitComponent): AABB {
  const dims = getComponentDimensions(comp);
  const rotated90 = comp.rotation === 90 || comp.rotation === 270;
  const width = rotated90 ? dims.height : dims.width;
  const height = rotated90 ? dims.width : dims.height;
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    minX: comp.x - halfW,
    minY: comp.y - halfH,
    maxX: comp.x + halfW,
    maxY: comp.y + halfH,
    width,
    height,
  };
}

/** Builds a normalized AABB from any two corner points. */
export function normalizePointsToAABB(a: Point, b: Point): AABB {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x, b.x);
  const maxY = Math.max(a.y, b.y);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Returns true when two AABBs overlap or touch. */
export function aabbIntersects(a: AABB, b: AABB): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;
}

/** Shortest Euclidean distance from point `p` to finite segment `[a, b]`. */
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** Samples a cubic Bezier curve into `steps + 1` points for hit-testing and bounds checks. */
export function sampleBezier(
  p0: Point,
  cp1: Point,
  cp2: Point,
  p3: Point,
  steps: number = 20,
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const w0 = mt2 * mt;
    const w1 = 3 * mt2 * t;
    const w2 = 3 * mt * t2;
    const w3 = t2 * t;
    pts.push({
      x: w0 * p0.x + w1 * cp1.x + w2 * cp2.x + w3 * p3.x,
      y: w0 * p0.y + w1 * cp1.y + w2 * cp2.y + w3 * p3.y,
    });
  }
  return pts;
}

/** Computes the AABB of a computed WirePath. */
export function getWirePathAABB(path: WirePath): AABB {
  const pts = path.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Finds the closest pin within a zoom-compensated hit radius.
 * Capped at 16 world px when zoomed out so pin hit areas never swallow whole bodies,
 * and prioritizing the closest pin so 20px-spaced pins remain individually clickable.
 */
export function hitTestPin(
  worldPos: Point,
  components: CircuitComponent[],
  zoom: number,
): PinHit | null {
  const radius = Math.max(6, Math.min(16, 11 / Math.max(zoom, 0.15)));
  let best: PinHit | null = null;
  let bestDist = radius;

  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i];
    const aabb = getComponentAABB(comp);
    if (
      worldPos.x < aabb.minX - radius ||
      worldPos.x > aabb.maxX + radius ||
      worldPos.y < aabb.minY - radius ||
      worldPos.y > aabb.maxY + radius
    ) {
      continue;
    }

    const pins = getComponentPins(comp);
    for (let j = 0; j < pins.length; j++) {
      const pin = pins[j];
      const pos = getRotatedPinPos(comp, pin);
      const dist = Math.hypot(worldPos.x - pos.x, worldPos.y - pos.y);
      if (dist <= bestDist) {
        bestDist = dist;
        best = { component: comp, pin, pos };
      }
    }
  }

  return best;
}

/** Hit-tests component bounding boxes in reverse draw order so top-most wins. */
export function hitTestComponent(
  worldPos: Point,
  components: CircuitComponent[],
): CircuitComponent | null {
  for (let i = components.length - 1; i >= 0; i--) {
    const comp = components[i];
    const aabb = getComponentAABB(comp);
    if (
      worldPos.x >= aabb.minX &&
      worldPos.x <= aabb.maxX &&
      worldPos.y >= aabb.minY &&
      worldPos.y <= aabb.maxY
    ) {
      return comp;
    }
  }
  return null;
}

/** Hit-tests rendered wire paths (orthogonal polylines or sampled cubic Beziers). */
export function hitTestWire(
  worldPos: Point,
  wires: Wire[],
  wirePaths: Map<string, WirePath>,
  zoom: number,
): Wire | null {
  const tolerance = Math.max(4, Math.min(18, 8 / Math.max(zoom, 0.15)));
  let bestWire: Wire | null = null;
  let bestDist = tolerance;

  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    const path = wirePaths.get(wire.id);
    if (!path) continue;

    const bounds = getWirePathAABB(path);
    if (
      worldPos.x < bounds.minX - tolerance ||
      worldPos.x > bounds.maxX + tolerance ||
      worldPos.y < bounds.minY - tolerance ||
      worldPos.y > bounds.maxY + tolerance
    ) {
      continue;
    }

    const pts =
      path.type === 'orthogonal'
        ? path.points
        : sampleBezier(path.points[0], path.points[1], path.points[2], path.points[3], 20);

    for (let j = 0; j < pts.length - 1; j++) {
      const dist = pointToSegmentDistance(worldPos, pts[j], pts[j + 1]);
      if (dist <= bestDist) {
        bestDist = dist;
        bestWire = wire;
      }
    }
  }

  return bestWire;
}

function toAABB(rect: Rect | AABB): AABB {
  if ('minX' in rect) {
    return rect;
  }
  const minX = rect.width >= 0 ? rect.x : rect.x + rect.width;
  const minY = rect.height >= 0 ? rect.y : rect.y + rect.height;
  const maxX = rect.width >= 0 ? rect.x + rect.width : rect.x;
  const maxY = rect.height >= 0 ? rect.y + rect.height : rect.y;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/** Returns all components intersecting a marquee selection rectangle. */
export function getComponentsInRect(
  rect: Rect | AABB,
  components: CircuitComponent[],
): CircuitComponent[] {
  const box = toAABB(rect);
  const selected: CircuitComponent[] = [];
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const aabb = getComponentAABB(comp);
    if (aabbIntersects(box, aabb)) {
      selected.push(comp);
    }
  }
  return selected;
}
