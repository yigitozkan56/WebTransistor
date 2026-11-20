import { getComponentPins } from '../engine/componentDefs';
import type {
  CircuitComponent,
  Point,
  Wire,
} from '../types/circuit';
import type { WireStyle } from '../types/ui';
import {
  getComponentAABB,
  getRotatedPinNormal,
  getRotatedPinPos,
  type AABB,
  type WirePath,
} from './geometry';

export type { WirePath } from './geometry';

export interface WireJunction {
  x: number;
  y: number;
  wireId: string;
}

const DEFAULT_STUB = 16;
const EPS = 0.5;

function addScaled(p: Point, dir: Point, scale: number): Point {
  return {
    x: p.x + dir.x * scale,
    y: p.y + dir.y * scale,
  };
}

/** Removes redundant zero-length and collinear continuation vertices from an orthogonal polyline. */
export function simplifyOrthogonalPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;

  const deduped: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = pts[i];
    if (Math.abs(curr.x - prev.x) > EPS || Math.abs(curr.y - prev.y) > EPS) {
      deduped.push(curr);
    }
  }

  if (deduped.length <= 2) return deduped;

  const out: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = out[out.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];

    const dx1 = b.x - a.x;
    const dy1 = b.y - a.y;
    const dx2 = c.x - b.x;
    const dy2 = c.y - b.y;

    const collinearX = Math.abs(dx1) < EPS && Math.abs(dx2) < EPS && dy1 * dy2 >= 0;
    const collinearY = Math.abs(dy1) < EPS && Math.abs(dy2) < EPS && dx1 * dx2 >= 0;
    if (!collinearX && !collinearY) {
      out.push(b);
    }
  }
  out.push(deduped[deduped.length - 1]);
  return out;
}

function appendOrthogonalStep(pts: Point[], from: Point, to: Point, preferHorizontalFirst: boolean): void {
  if (Math.abs(from.x - to.x) < EPS || Math.abs(from.y - to.y) < EPS) {
    pts.push(to);
    return;
  }
  if (preferHorizontalFirst) {
    pts.push({ x: to.x, y: from.y }, to);
  } else {
    pts.push({ x: from.x, y: to.y }, to);
  }
}

function chooseDetourY(s0: Point, s1: Point, aabbA?: AABB, aabbB?: AABB): number {
  const minY = Math.min(aabbA ? aabbA.minY : s0.y, aabbB ? aabbB.minY : s1.y);
  const maxY = Math.max(aabbA ? aabbA.maxY : s0.y, aabbB ? aabbB.maxY : s1.y);
  const above = minY - 20;
  const below = maxY + 20;
  const midY = (s0.y + s1.y) / 2;
  return Math.abs(midY - above) <= Math.abs(below - midY) ? above : below;
}

function chooseDetourX(s0: Point, s1: Point, aabbA?: AABB, aabbB?: AABB): number {
  const minX = Math.min(aabbA ? aabbA.minX : s0.x, aabbB ? aabbB.minX : s1.x);
  const maxX = Math.max(aabbA ? aabbA.maxX : s0.x, aabbB ? aabbB.maxX : s1.x);
  const left = minX - 20;
  const right = maxX + 20;
  const midX = (s0.x + s1.x) / 2;
  return Math.abs(midX - left) <= Math.abs(right - midX) ? left : right;
}

function routeBetweenStubs(
  pts: Point[],
  p0: Point,
  n0: Point,
  p1: Point,
  n1: Point,
  aabb0?: AABB,
  aabb1?: AABB,
): void {
  const n0Horiz = Math.abs(n0.x) > 0.5;
  const n1Horiz = Math.abs(n1.x) > 0.5;

  // Both horizontal normals
  if (n0Horiz && n1Horiz) {
    const opposite = n0.x * n1.x < 0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    if (opposite) {
      if (dx * n0.x > 0) {
        // Direct aligned straight line
        if (Math.abs(dy) < EPS) {
          pts.push(p1);
          return;
        }
        const stub = Math.min(DEFAULT_STUB, Math.max(4, Math.abs(dx) / 2 - 1));
        const s0 = addScaled(p0, n0, stub);
        const s1 = addScaled(p1, n1, stub);
        const midX = (s0.x + s1.x) / 2;
        pts.push(s0, { x: midX, y: s0.y }, { x: midX, y: s1.y }, s1, p1);
        return;
      }

      // Target is behind or at same X -> route around via clean U/Z loop
      const s0 = addScaled(p0, n0, DEFAULT_STUB);
      const s1 = addScaled(p1, n1, DEFAULT_STUB);
      const midY =
        Math.abs(s1.y - s0.y) >= 40
          ? (s0.y + s1.y) / 2
          : chooseDetourY(s0, s1, aabb0, aabb1);
      pts.push(s0, { x: s0.x, y: midY }, { x: s1.x, y: midY }, s1, p1);
      return;
    }

    // Same horizontal facing direction (e.g. right -> right)
    const s0 = addScaled(p0, n0, DEFAULT_STUB);
    const s1 = addScaled(p1, n1, DEFAULT_STUB);
    if (Math.abs(s0.y - s1.y) < 12) {
      const detourY = chooseDetourY(s0, s1, aabb0, aabb1);
      pts.push(s0, { x: s0.x, y: detourY }, { x: s1.x, y: detourY }, s1, p1);
      return;
    }
    const outerX = n0.x > 0 ? Math.max(s0.x, s1.x) : Math.min(s0.x, s1.x);
    pts.push(s0, { x: outerX, y: s0.y }, { x: outerX, y: s1.y }, s1, p1);
    return;
  }

  // Both vertical normals
  if (!n0Horiz && !n1Horiz) {
    const opposite = n0.y * n1.y < 0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;

    if (opposite) {
      if (dy * n0.y > 0) {
        if (Math.abs(dx) < EPS) {
          pts.push(p1);
          return;
        }
        const stub = Math.min(DEFAULT_STUB, Math.max(4, Math.abs(dy) / 2 - 1));
        const s0 = addScaled(p0, n0, stub);
        const s1 = addScaled(p1, n1, stub);
        const midY = (s0.y + s1.y) / 2;
        pts.push(s0, { x: s0.x, y: midY }, { x: s1.x, y: midY }, s1, p1);
        return;
      }

      const s0 = addScaled(p0, n0, DEFAULT_STUB);
      const s1 = addScaled(p1, n1, DEFAULT_STUB);
      const midX =
        Math.abs(s1.x - s0.x) >= 40
          ? (s0.x + s1.x) / 2
          : chooseDetourX(s0, s1, aabb0, aabb1);
      pts.push(s0, { x: midX, y: s0.y }, { x: midX, y: s1.y }, s1, p1);
      return;
    }

    const s0 = addScaled(p0, n0, DEFAULT_STUB);
    const s1 = addScaled(p1, n1, DEFAULT_STUB);
    if (Math.abs(s0.x - s1.x) < 12) {
      const detourX = chooseDetourX(s0, s1, aabb0, aabb1);
      pts.push(s0, { x: detourX, y: s0.y }, { x: detourX, y: s1.y }, s1, p1);
      return;
    }
    const outerY = n0.y > 0 ? Math.max(s0.y, s1.y) : Math.min(s0.y, s1.y);
    pts.push(s0, { x: s0.x, y: outerY }, { x: s1.x, y: outerY }, s1, p1);
    return;
  }

  // Perpendicular: n0 horizontal, n1 vertical
  if (n0Horiz && !n1Horiz) {
    const s0 = addScaled(p0, n0, DEFAULT_STUB);
    const s1 = addScaled(p1, n1, DEFAULT_STUB);
    const forward0 = (s1.x - s0.x) * n0.x >= -EPS;
    const forward1 = (s0.y - s1.y) * n1.y >= -EPS;
    if (forward0 && forward1) {
      pts.push(s0, { x: s1.x, y: s0.y }, s1, p1);
    } else {
      pts.push(s0, { x: s0.x, y: s1.y }, s1, p1);
    }
    return;
  }

  // Perpendicular: n0 vertical, n1 horizontal
  const s0 = addScaled(p0, n0, DEFAULT_STUB);
  const s1 = addScaled(p1, n1, DEFAULT_STUB);
  const forward0 = (s1.y - s0.y) * n0.y >= -EPS;
  const forward1 = (s0.x - s1.x) * n1.x >= -EPS;
  if (forward0 && forward1) {
    pts.push(s0, { x: s0.x, y: s1.y }, s1, p1);
  } else {
    pts.push(s0, { x: s1.x, y: s0.y }, s1, p1);
  }
}

/**
 * Computes a wire path (orthogonal Manhattan polyline or smooth cubic Bezier)
 * between arbitrary endpoints and outward normals, honoring optional waypoints.
 */
export function computeRouteBetweenPoints(
  p0: Point,
  n0: Point,
  p1: Point,
  n1: Point | null,
  waypoints: Point[] | undefined,
  style: WireStyle,
  aabb0?: AABB,
  aabb1?: AABB,
): WirePath {
  if (style === 'bezier') {
    const endN1 = n1 ?? {
      x: Math.abs(p0.x - p1.x) >= Math.abs(p0.y - p1.y) ? Math.sign(p0.x - p1.x) : 0,
      y: Math.abs(p0.x - p1.x) < Math.abs(p0.y - p1.y) ? Math.sign(p0.y - p1.y) : 0,
    };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const handle = Math.max(24, Math.min(140, dist * 0.45));
    const cp1 = addScaled(p0, n0, handle);
    const cp2 = addScaled(p1, endN1, handle);

    // Bow backward feedback loops slightly away from the horizontal/vertical component centerline
    const dotNormals = n0.x * endN1.x + n0.y * endN1.y;
    if (dotNormals < -0.5) {
      const forwardDot = (p1.x - p0.x) * n0.x + (p1.y - p0.y) * n0.y;
      if (forwardDot < 0) {
        if (Math.abs(n0.x) > 0.5 && Math.abs(p1.y - p0.y) < 24) {
          cp1.y -= 44;
          cp2.y -= 44;
        } else if (Math.abs(n0.y) > 0.5 && Math.abs(p1.x - p0.x) < 24) {
          cp1.x -= 44;
          cp2.x -= 44;
        }
      }
    }

    return {
      type: 'bezier',
      points: [p0, cp1, cp2, p1],
    };
  }

  // Orthogonal routing
  const pts: Point[] = [p0];

  if (Math.abs(p0.x - p1.x) < EPS && Math.abs(p0.y - p1.y) < EPS && (!waypoints || waypoints.length === 0)) {
    pts.push(p1);
    return { type: 'orthogonal', points: pts };
  }

  if (waypoints && waypoints.length > 0) {
    const s0 = addScaled(p0, n0, DEFAULT_STUB);
    pts.push(s0);

    const w0 = waypoints[0];
    const n0Horiz = Math.abs(n0.x) > 0.5;
    if (n0Horiz) {
      appendOrthogonalStep(pts, s0, w0, (w0.x - s0.x) * n0.x >= 0);
    } else {
      appendOrthogonalStep(pts, s0, w0, (w0.y - s0.y) * n0.y < 0);
    }

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const prevPrev = pts.length >= 2 ? pts[pts.length - 2] : s0;
      const wasHoriz = Math.abs(prev.y - prevPrev.y) < EPS;
      appendOrthogonalStep(pts, prev, curr, !wasHoriz);
    }

    const wLast = waypoints[waypoints.length - 1];
    if (n1) {
      const s1 = addScaled(p1, n1, DEFAULT_STUB);
      const n1Horiz = Math.abs(n1.x) > 0.5;
      if (n1Horiz) {
        appendOrthogonalStep(pts, wLast, s1, (wLast.x - s1.x) * n1.x < 0);
      } else {
        appendOrthogonalStep(pts, wLast, s1, (wLast.y - s1.y) * n1.y >= 0);
      }
      pts.push(p1);
    } else {
      const prevBeforeLast = pts.length >= 2 ? pts[pts.length - 2] : s0;
      const wasHoriz = Math.abs(wLast.y - prevBeforeLast.y) < EPS;
      appendOrthogonalStep(pts, wLast, p1, !wasHoriz);
    }

    return {
      type: 'orthogonal',
      points: simplifyOrthogonalPoints(pts),
    };
  }

  if (n1) {
    routeBetweenStubs(pts, p0, n0, p1, n1, aabb0, aabb1);
  } else {
    const s0 = addScaled(p0, n0, DEFAULT_STUB);
    pts.push(s0);
    const n0Horiz = Math.abs(n0.x) > 0.5;
    if (n0Horiz) {
      appendOrthogonalStep(pts, s0, p1, (p1.x - s0.x) * n0.x >= 0);
    } else {
      appendOrthogonalStep(pts, s0, p1, (p1.y - s0.y) * n0.y < 0);
    }
  }

  return {
    type: 'orthogonal',
    points: simplifyOrthogonalPoints(pts),
  };
}

/** Computes the routed `WirePath` for a `Wire` given component lookup. */
export function computeWirePath(
  wire: Wire,
  compMap: Map<string, CircuitComponent>,
  style: WireStyle,
): WirePath | null {
  const fromComp = compMap.get(wire.from.componentId);
  const toComp = compMap.get(wire.to.componentId);
  if (!fromComp || !toComp) return null;

  const fromPins = getComponentPins(fromComp);
  const toPins = getComponentPins(toComp);
  const fromPin = fromPins.find((p) => p.id === wire.from.pinId);
  const toPin = toPins.find((p) => p.id === wire.to.pinId);
  if (!fromPin || !toPin) return null;

  const p0 = getRotatedPinPos(fromComp, fromPin);
  const n0 = getRotatedPinNormal(fromComp, fromPin);
  const p1 = getRotatedPinPos(toComp, toPin);
  const n1 = getRotatedPinNormal(toComp, toPin);

  const aabb0 = getComponentAABB(fromComp);
  const aabb1 = getComponentAABB(toComp);

  return computeRouteBetweenPoints(p0, n0, p1, n1, wire.waypoints, style, aabb0, aabb1);
}

interface OrientedBranch {
  wireId: string;
  pts: Point[];
}

function unitDir(a: Point, b: Point): { dx: number; dy: number; len: number } {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const len = Math.hypot(rx, ry);
  if (len < EPS) return { dx: 0, dy: 0, len: 0 };
  return { dx: rx / len, dy: ry / len, len };
}

/**
 * Detects shared pin endpoints and tee-junction branch points where 3+
 * wire segments/pins meet so the renderer can draw crisp junction dots.
 */
export function findWireJunctions(
  wires: Wire[],
  pathMap: Map<string, WirePath>,
): WireJunction[] {
  const pinGroups = new Map<string, OrientedBranch[]>();

  for (let i = 0; i < wires.length; i++) {
    const wire = wires[i];
    const path = pathMap.get(wire.id);
    if (!path) continue;

    const pts = path.points;
    if (pts.length < 2) continue;

    const pStart = pts[0];
    const pEnd = pts[pts.length - 1];

    const startKey = `${Math.round(pStart.x)},${Math.round(pStart.y)}`;
    let startGroup = pinGroups.get(startKey);
    if (!startGroup) {
      startGroup = [];
      pinGroups.set(startKey, startGroup);
    }
    startGroup.push({
      wireId: wire.id,
      pts: path.type === 'orthogonal' ? pts : [pStart, pts[1]],
    });

    const endKey = `${Math.round(pEnd.x)},${Math.round(pEnd.y)}`;
    let endGroup = pinGroups.get(endKey);
    if (!endGroup) {
      endGroup = [];
      pinGroups.set(endKey, endGroup);
    }
    const reversed =
      path.type === 'orthogonal'
        ? pts.slice().reverse()
        : [pEnd, pts[2]];
    endGroup.push({
      wireId: wire.id,
      pts: reversed,
    });
  }

  const junctions: WireJunction[] = [];
  const seen = new Set<string>();

  const addJunction = (x: number, y: number, wireId: string) => {
    const key = `${Math.round(x * 2)},${Math.round(y * 2)}`;
    if (!seen.has(key)) {
      seen.add(key);
      junctions.push({ x, y, wireId });
    }
  };

  for (const group of pinGroups.values()) {
    if (group.length < 2) continue;

    let foundStemSplit = false;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i].pts;
        const b = group[j].pts;
        const maxSegs = Math.min(a.length, b.length) - 1;

        for (let k = 0; k < maxSegs; k++) {
          const dA = unitDir(a[k], a[k + 1]);
          const dB = unitDir(b[k], b[k + 1]);
          if (dA.len === 0 || dB.len === 0) break;

          // Diverging immediately at vertex a[k]
          if (dA.dx * dB.dx + dA.dy * dB.dy < 0.99) {
            if (k > 0) {
              addJunction(a[k].x, a[k].y, group[i].wireId);
              foundStemSplit = true;
            }
            break;
          }

          // Shared direction: check if one turns earlier than the other
          if (Math.abs(dA.len - dB.len) > 1) {
            const minLen = Math.min(dA.len, dB.len);
            const splitX = a[k].x + dA.dx * minLen;
            const splitY = a[k].y + dA.dy * minLen;
            addJunction(splitX, splitY, group[i].wireId);
            foundStemSplit = true;
            break;
          }

          // Equal segment lengths; if next vertex diverges or terminates differently, split at a[k+1]
          const hasNextA = k + 2 < a.length;
          const hasNextB = k + 2 < b.length;
          if (hasNextA && hasNextB) {
            const nA = unitDir(a[k + 1], a[k + 2]);
            const nB = unitDir(b[k + 1], b[k + 2]);
            if (nA.dx * nB.dx + nA.dy * nB.dy < 0.99) {
              addJunction(a[k + 1].x, a[k + 1].y, group[i].wireId);
              foundStemSplit = true;
              break;
            }
          } else if (hasNextA !== hasNextB) {
            addJunction(a[k + 1].x, a[k + 1].y, group[i].wireId);
            foundStemSplit = true;
            break;
          }
        }
      }
    }

    // If 3+ wires meet right at a pin without a shared stem split (or Bezier branches), mark pin
    if (!foundStemSplit && group.length >= 2) {
      addJunction(group[0].pts[0].x, group[0].pts[0].y, group[0].wireId);
    }
  }

  return junctions;
}
