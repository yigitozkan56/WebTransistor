import { getComponentDimensions, getPixelMatrixSize } from '../engine/componentDefs';
import {
  isError,
  isHigh,
  isLow,
  LogicValue,
  type CircuitComponent,
  type PinDef,
  type SimulationSnapshot,
} from '../types/circuit';
import type { ISimulator } from '../types/ui';

export const THEME = {
  bg: '#090C10',
  panel: '#10151E',
  panelElevated: '#161B24',
  recess: '#06080C',
  border: '#262C36',
  borderSubtle: '#1A2029',
  textPrimary: '#E2E8F0',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  high: '#00E5FF',
  highGlow: 'rgba(0, 229, 255, 0.24)',
  gold: '#F59E0B',
  goldGlow: 'rgba(245, 158, 11, 0.24)',
  low: '#262C36',
  lowSubtle: '#30363D',
  z: '#30363D',
  err: '#EF4444',
  errGlow: 'rgba(239, 68, 68, 0.28)',
} as const;

export interface DrawComponentParams {
  ctx: CanvasRenderingContext2D;
  comp: CircuitComponent;
  pins: PinDef[];
  sim: ISimulator | null;
  snapshot: SimulationSnapshot | null;
  zoom: number;
  hoveredPin?: { componentId: string; pinId: string } | null;
  isGhost?: boolean;
}

/** Maps a LogicValue to its schematic stroke/indicator color. */
export function getLogicColor(val: LogicValue): string {
  switch (val) {
    case LogicValue.HIGH:
    case LogicValue.WEAK_HIGH:
      return THEME.high;
    case LogicValue.LOW:
    case LogicValue.WEAK_LOW:
      return THEME.low;
    case LogicValue.ERR:
      return THEME.err;
    case LogicValue.Z:
      return THEME.z;
  }
}

/** Visible lead color inside dark component bodies. */
function getLeadColor(val: LogicValue): string {
  switch (val) {
    case LogicValue.HIGH:
    case LogicValue.WEAK_HIGH:
      return THEME.high;
    case LogicValue.LOW:
    case LogicValue.WEAK_LOW:
      return '#525E70';
    case LogicValue.ERR:
      return THEME.err;
    case LogicValue.Z:
      return THEME.z;
  }
}

function getLedAccentColor(color: 'cyan' | 'green' | 'amber' | 'red' | undefined): {
  hex: string;
  rgb: string;
} {
  switch (color) {
    case 'green':
      return { hex: '#22C55E', rgb: '34, 197, 94' };
    case 'amber':
      return { hex: '#F59E0B', rgb: '245, 158, 11' };
    case 'red':
      return { hex: '#EF4444', rgb: '239, 68, 68' };
    case 'cyan':
    default:
      return { hex: '#00E5FF', rgb: '0, 229, 255' };
  }
}

export function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function getPinVal(
  sim: ISimulator | null,
  compId: string,
  pinId: string,
): LogicValue {
  return sim ? sim.getPinValue(compId, pinId) : LogicValue.Z;
}

/** Checks if a MOSFET is currently conducting (ON) from SoA state or gate voltage. */
export function isTransistorConducting(
  comp: CircuitComponent,
  sim: ISimulator | null,
  snapshot: SimulationSnapshot | null,
): boolean {
  if (sim?.getTransistorState) {
    return sim.getTransistorState(comp.id) === 1;
  }
  const txIdx = snapshot?.compToTxIndex?.get(comp.id);
  if (txIdx !== undefined && snapshot && txIdx < snapshot.transistors.count) {
    return snapshot.transistors.state[txIdx] === 1;
  }
  const gVal = getPinVal(sim, comp.id, 'G');
  return comp.type === 'PMOS' ? isLow(gVal) : isHigh(gVal);
}

function drawMosfet(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  isPmos: boolean,
  sim: ISimulator | null,
  snapshot: SimulationSnapshot | null,
  zoom: number,
): void {
  const gVal = getPinVal(sim, comp.id, 'G');
  const dVal = getPinVal(sim, comp.id, 'D');
  const sVal = getPinVal(sim, comp.id, 'S');

  const conducting = isTransistorConducting(comp, sim, snapshot);
  const hasErr = isError(gVal) || isError(dVal) || isError(sVal);

  const activeHex = isPmos ? THEME.gold : THEME.high;
  const activeGlow = isPmos ? THEME.goldGlow : THEME.highGlow;

  // Silicon die circular cell backdrop
  ctx.beginPath();
  ctx.arc(0, 0, 16.5, 0, Math.PI * 2);
  ctx.fillStyle = conducting ? (isPmos ? 'rgba(245, 158, 11, 0.08)' : 'rgba(0, 229, 255, 0.08)') : THEME.panel;
  ctx.fill();
  ctx.lineWidth = conducting ? 1.5 : 1.2;
  ctx.strokeStyle = hasErr
    ? THEME.err
    : conducting
      ? activeHex
      : THEME.border;
  ctx.stroke();

  const channelColor = hasErr ? THEME.err : conducting ? activeHex : '#384152';
  const gateColor = getLeadColor(gVal);
  const topVal = isPmos ? sVal : dVal;
  const botVal = isPmos ? dVal : sVal;
  const topColor = conducting && !hasErr ? activeHex : getLeadColor(topVal);
  const botColor = conducting && !hasErr ? activeHex : getLeadColor(botVal);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Gate lead + optional PMOS inversion bubble
  ctx.strokeStyle = gateColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (isPmos) {
    ctx.moveTo(-20, 0);
    ctx.lineTo(-12.5, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-9.5, 0, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = THEME.panel;
    ctx.fill();
    ctx.strokeStyle = isLow(gVal) ? activeHex : gateColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    ctx.moveTo(-20, 0);
    ctx.lineTo(-7, 0);
    ctx.stroke();
  }

  // Vertical gate plate
  const gateX = isPmos ? -6.5 : -7;
  const chanX = isPmos ? -2 : -2.5;
  ctx.beginPath();
  ctx.moveTo(gateX, -10);
  ctx.lineTo(gateX, 10);
  ctx.strokeStyle = conducting ? activeHex : gateColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Multi-stroke fast alpha glow across Drain-Source conducting channel when ON (no shadowBlur!)
  if (conducting && !hasErr) {
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -8.5);
    ctx.lineTo(chanX, -8.5);
    ctx.lineTo(chanX, 8.5);
    ctx.lineTo(0, 8.5);
    ctx.lineTo(0, 18);
    ctx.strokeStyle = activeGlow;
    ctx.lineWidth = 7.5;
    ctx.stroke();

    // Continuous glowing bridge uniting the 3 channel segments when conducting
    ctx.beginPath();
    ctx.moveTo(chanX, -11);
    ctx.lineTo(chanX, 11);
    ctx.strokeStyle = activeHex;
    ctx.lineWidth = 3.2;
    ctx.stroke();
  }

  // 3-segment silicon channel bar
  ctx.strokeStyle = channelColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(chanX, -11);
  ctx.lineTo(chanX, -5);
  ctx.moveTo(chanX, -3);
  ctx.lineTo(chanX, 3);
  ctx.moveTo(chanX, 5);
  ctx.lineTo(chanX, 11);
  ctx.stroke();

  // Top lead (NMOS Drain / PMOS Source)
  ctx.strokeStyle = topColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(0, -8.5);
  ctx.lineTo(chanX, -8.5);
  ctx.stroke();

  // Bottom lead (NMOS Source / PMOS Drain)
  ctx.strokeStyle = botColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(0, 8.5);
  ctx.lineTo(chanX, 8.5);
  ctx.stroke();

  // Substrate tie + directional arrow
  ctx.strokeStyle = conducting ? activeHex : THEME.textDim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(chanX, 0);
  ctx.lineTo(7, 0);
  if (isPmos) {
    ctx.lineTo(7, -8.5);
    ctx.lineTo(0, -8.5);
  } else {
    ctx.lineTo(7, 8.5);
    ctx.lineTo(0, 8.5);
  }
  ctx.stroke();

  // Arrowhead on center line: NMOS points inward (<-), PMOS points outward (->)
  ctx.fillStyle = conducting ? activeHex : THEME.textMuted;
  ctx.beginPath();
  if (isPmos) {
    ctx.moveTo(5.5, 0);
    ctx.lineTo(1, -2.7);
    ctx.lineTo(1, 2.7);
  } else {
    ctx.moveTo(-0.5, 0);
    ctx.lineTo(4, -2.7);
    ctx.lineTo(4, 2.7);
  }
  ctx.closePath();
  ctx.fill();

  // Subtle N / P badge
  if (zoom >= 0.45) {
    ctx.fillStyle = conducting ? activeHex : THEME.textDim;
    ctx.font = '700 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isPmos ? 'P' : 'N', 10.5, isPmos ? 8 : -8);
  }
}

function drawVcc(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  sim: ISimulator | null,
): void {
  const outVal = getPinVal(sim, comp.id, 'OUT');
  const err = isError(outVal);
  const color = err ? THEME.err : THEME.high;

  ctx.lineCap = 'round';

  // Stem
  ctx.beginPath();
  ctx.moveTo(0, 20);
  ctx.lineTo(0, -4);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Glow under power bar
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(12, -4);
  ctx.strokeStyle = err ? THEME.errGlow : THEME.highGlow;
  ctx.lineWidth = 7;
  ctx.stroke();

  // Power bar
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(12, -4);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(comp.props.label || 'VCC', 0, -13);
}

function drawGnd(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  sim: ISimulator | null,
): void {
  const outVal = getPinVal(sim, comp.id, 'OUT');
  const err = isError(outVal);
  const stemColor = err ? THEME.err : '#525E70';
  const barColor = err ? THEME.err : '#8B98A9';

  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(0, 0);
  ctx.strokeStyle = stemColor;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.strokeStyle = barColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(12, 0);
  ctx.moveTo(-7.5, 5);
  ctx.lineTo(7.5, 5);
  ctx.moveTo(-3, 10);
  ctx.lineTo(3, 10);
  ctx.stroke();
}

function drawPullResistor(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  isPullUp: boolean,
  sim: ISimulator | null,
  zoom: number,
): void {
  const outVal = getPinVal(sim, comp.id, 'OUT');
  const strokeColor = getLeadColor(outVal);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isPullUp) {
    // Top weak power bar
    ctx.beginPath();
    ctx.moveTo(-9, -14);
    ctx.lineTo(9, -14);
    ctx.strokeStyle = THEME.high;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Stem top -> resistor -> pin bottom
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, -10);
    ctx.lineTo(5, -7);
    ctx.lineTo(-5, -3);
    ctx.lineTo(5, 1);
    ctx.lineTo(-5, 5);
    ctx.lineTo(5, 9);
    ctx.lineTo(0, 12);
    ctx.lineTo(0, 20);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    if (zoom >= 0.55) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '600 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('PU', 7, 1);
    }
  } else {
    // Stem top -> resistor -> bottom ground bar
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, -12);
    ctx.lineTo(5, -9);
    ctx.lineTo(-5, -5);
    ctx.lineTo(5, -1);
    ctx.lineTo(-5, 3);
    ctx.lineTo(5, 7);
    ctx.lineTo(0, 10);
    ctx.lineTo(0, 14);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, 14);
    ctx.lineTo(8, 14);
    ctx.moveTo(-4.5, 17.5);
    ctx.lineTo(4.5, 17.5);
    ctx.strokeStyle = '#8B98A9';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (zoom >= 0.55) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = '600 7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('PD', 7, -1);
    }
  }
}

function drawToggleSwitch(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  sim: ISimulator | null,
  zoom: number,
): void {
  const outVal = getPinVal(sim, comp.id, 'OUT');
  const on =
    sim && (outVal === LogicValue.HIGH || outVal === LogicValue.LOW)
      ? outVal === LogicValue.HIGH
      : Boolean(comp.props.state);
  const err = isError(outVal);

  // Pin lead
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(40, 0);
  ctx.strokeStyle = getLeadColor(outVal);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Body card
  traceRoundedRect(ctx, -38, -17, 70, 34, 8);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = err ? THEME.err : on ? THEME.high : THEME.border;
  ctx.stroke();

  const label = comp.props.label;
  const keyTag = comp.props.keyBinding ? `[${comp.props.keyBinding.toUpperCase()}]` : '';
  const displayLabel = label ? (keyTag ? `${label} ${keyTag}` : label) : keyTag;

  if (displayLabel) {
    if (zoom >= 0.35) {
      ctx.fillStyle = on ? THEME.textPrimary : THEME.textMuted;
      ctx.font = '600 9px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayLabel, -3, -8, 62);
    }

    // Compact pill track
    traceRoundedRect(ctx, -20, 0, 34, 12, 6);
    ctx.fillStyle = on ? THEME.highGlow : THEME.panelElevated;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = on ? THEME.high : '#384152';
    ctx.stroke();

    // Thumb
    const thumbX = on ? 8 : -14;
    ctx.beginPath();
    ctx.arc(thumbX, 6, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = on ? THEME.high : '#8B98A9';
    ctx.fill();
  } else {
    // Centered pill track
    traceRoundedRect(ctx, -25, -9, 36, 18, 9);
    ctx.fillStyle = on ? THEME.highGlow : THEME.panelElevated;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = on ? THEME.high : '#384152';
    ctx.stroke();

    const thumbX = on ? 2 : -16;
    ctx.beginPath();
    ctx.arc(thumbX, 0, 6.2, 0, Math.PI * 2);
    ctx.fillStyle = on ? THEME.high : '#8B98A9';
    ctx.fill();

    if (zoom >= 0.4) {
      ctx.fillStyle = on ? THEME.high : THEME.textDim;
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(on ? '1' : '0', 21, 0);
    }
  }
}

function drawPushButton(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  sim: ISimulator | null,
  zoom: number,
): void {
  const outVal = getPinVal(sim, comp.id, 'OUT');
  const pressed = Boolean(comp.props.state) || isHigh(outVal);
  const err = isError(outVal);

  // Pin lead
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(40, 0);
  ctx.strokeStyle = getLeadColor(outVal);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Base plate
  traceRoundedRect(ctx, -38, -17, 70, 34, 8);
  ctx.fillStyle = THEME.recess;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = err ? THEME.err : pressed ? THEME.high : THEME.border;
  ctx.stroke();

  // Tactile inner cap (shifts down when depressed)
  const capOffsetY = pressed ? 1 : -1;
  traceRoundedRect(ctx, -33, -12 + capOffsetY, 60, 24, 6);
  ctx.fillStyle = pressed ? THEME.highGlow : THEME.panelElevated;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = pressed ? THEME.high : '#384152';
  ctx.stroke();

  // Status dot
  ctx.beginPath();
  ctx.arc(-22, capOffsetY, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = pressed ? THEME.high : '#384152';
  ctx.fill();

  if (zoom >= 0.35) {
    const keyTag = comp.props.keyBinding ? `[${comp.props.keyBinding.toUpperCase()}]` : '';
    const baseLabel = comp.props.label || 'PUSH';
    const text = keyTag ? `${baseLabel} ${keyTag}` : baseLabel;
    ctx.fillStyle = pressed ? THEME.high : THEME.textPrimary;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 3, capOffsetY, 44);
  }
}

function drawLed(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  sim: ISimulator | null,
  zoom: number,
): void {
  const inVal = getPinVal(sim, comp.id, 'IN');
  const lit = isHigh(inVal);
  const err = isError(inVal);
  const accent = err ? { hex: THEME.err, rgb: '239, 68, 68' } : getLedAccentColor(comp.props.color);

  // Pin stem
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(-10, 0);
  ctx.strokeStyle = getLeadColor(inVal);
  ctx.lineWidth = 2.2;
  ctx.stroke();

  const cx = 2;
  const cy = 0;

  // Radial glow halo when lit (fast radialGradient, zero shadowBlur)
  if (lit || err) {
    const grad = ctx.createRadialGradient(cx, cy, 3, cx, cy, 22);
    grad.addColorStop(0, `rgba(${accent.rgb}, 0.52)`);
    grad.addColorStop(0.55, `rgba(${accent.rgb}, 0.16)`);
    grad.addColorStop(1, `rgba(${accent.rgb}, 0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Outer diode bezel
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = lit || err ? accent.hex : THEME.border;
  ctx.stroke();

  // Inner diode lens
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fillStyle = lit || err ? accent.hex : '#161C28';
  ctx.fill();
  if (!lit && !err) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${accent.rgb}, 0.35)`;
    ctx.stroke();
  }

  // Specular highlight
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = lit ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.12)';
  ctx.fill();

  if (comp.props.label && zoom >= 0.4) {
    ctx.save();
    if (comp.rotation === 180) {
      ctx.translate(20, 0);
      ctx.rotate(Math.PI);
      ctx.textAlign = 'right';
      ctx.fillStyle = lit ? THEME.textPrimary : THEME.textMuted;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(comp.props.label, 0, 0);
    } else {
      ctx.fillStyle = lit ? THEME.textPrimary : THEME.textMuted;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(comp.props.label, 20, 0);
    }
    ctx.restore();
  }
}

/**
 * Draws the raw driverless PIXEL_MATRIX component.
 * Every pixel `(x, y)` is directly wired to its own physical electrical input pin `P_${y}_${x}`
 * around the component perimeter and lights up immediately when that pin's net is HIGH.
 */
function drawPixelMatrix(
  ctx: CanvasRenderingContext2D,
  comp: CircuitComponent,
  pins: PinDef[],
  sim: ISimulator | null,
  zoom: number,
): void {
  const size = getPixelMatrixSize(comp);
  const { width, height } = getComponentDimensions(comp);
  const hw = width / 2;
  const hh = height / 2;
  const accent = getLedAccentColor(comp.props.color);

  // Outer silicon housing frame (inset 6px from perimeter pins)
  const inset = 8;
  traceRoundedRect(ctx, -hw + inset, -hh + inset, width - inset * 2, height - inset * 2, 10);
  ctx.fillStyle = THEME.panel;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = THEME.border;
  ctx.stroke();

  // Perimeter pin leads
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const val = getPinVal(sim, comp.id, pin.id);
    ctx.beginPath();
    if (pin.side === 'left') {
      ctx.moveTo(-hw + inset, pin.offsetY);
      ctx.lineTo(pin.offsetX, pin.offsetY);
    } else if (pin.side === 'right') {
      ctx.moveTo(hw - inset, pin.offsetY);
      ctx.lineTo(pin.offsetX, pin.offsetY);
    } else if (pin.side === 'top') {
      ctx.moveTo(pin.offsetX, -hh + inset);
      ctx.lineTo(pin.offsetX, pin.offsetY);
    } else {
      ctx.moveTo(pin.offsetX, hh - inset);
      ctx.lineTo(pin.offsetX, pin.offsetY);
    }
    ctx.strokeStyle = getLeadColor(val);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  // Inner recessed pixel die area
  const dieMargin = size === 8 ? 34 : 26;
  const dieSize = width - dieMargin * 2;
  const dieX = -dieSize / 2;
  const dieY = -dieSize / 2;

  traceRoundedRect(ctx, dieX - 4, dieY - 4, dieSize + 8, dieSize + 8, 6);
  ctx.fillStyle = THEME.recess;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = THEME.borderSubtle;
  ctx.stroke();

  // Header label & direct matrix badge
  if (zoom >= 0.35) {
    ctx.fillStyle = THEME.textMuted;
    ctx.font = '700 8.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = comp.props.label
      ? `${comp.props.label} (${size}×${size} RAW)`
      : `RAW MATRIX ${size}×${size}`;
    ctx.fillText(title, 0, dieY - 12, dieSize);
  }

  // Draw each individual physical LED pixel cell directly from pin P_${y}_${x}
  const cellStep = dieSize / size;
  const cellPad = size === 8 ? 2.2 : 3.2;
  const cellSide = Math.max(4, cellStep - cellPad * 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pinId = `P_${y}_${x}`;
      const val = getPinVal(sim, comp.id, pinId);
      const lit = isHigh(val);
      const err = isError(val);

      const px = dieX + x * cellStep + cellPad;
      const py = dieY + y * cellStep + cellPad;

      if (lit || err) {
        // Fast outer glow rect behind active pixel (zero shadowBlur)
        ctx.fillStyle = err ? THEME.errGlow : `rgba(${accent.rgb}, 0.28)`;
        traceRoundedRect(ctx, px - 2, py - 2, cellSide + 4, cellSide + 4, 4);
        ctx.fill();
      }

      traceRoundedRect(ctx, px, py, cellSide, cellSide, 3);
      ctx.fillStyle = err ? THEME.err : lit ? accent.hex : '#121822';
      ctx.fill();

      ctx.lineWidth = 0.9;
      ctx.strokeStyle = err
        ? THEME.err
        : lit
          ? '#FFFFFF'
          : '#1E2634';
      ctx.stroke();

      if (zoom >= 0.65) {
        ctx.fillStyle = lit || err ? '#090C10' : THEME.textDim;
        ctx.font = `700 ${size === 8 ? 7 : 8}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${y},${x}`, px + cellSide / 2, py + cellSide / 2);
      }
    }
  }
}

/** Draws a single physical component, including its body, internal visuals, and pin circles. */
export function drawComponent(params: DrawComponentParams): void {
  const {
    ctx,
    comp,
    pins,
    sim,
    snapshot,
    zoom,
    hoveredPin,
    isGhost,
  } = params;

  ctx.save();
  if (isGhost) {
    ctx.globalAlpha *= 0.55;
  }
  ctx.translate(comp.x, comp.y);
  if (comp.rotation !== 0) {
    ctx.rotate((comp.rotation * Math.PI) / 180);
  }

  switch (comp.type) {
    case 'NMOS':
      drawMosfet(ctx, comp, false, sim, snapshot, zoom);
      break;
    case 'PMOS':
      drawMosfet(ctx, comp, true, sim, snapshot, zoom);
      break;
    case 'VCC':
      drawVcc(ctx, comp, sim);
      break;
    case 'GND':
      drawGnd(ctx, comp, sim);
      break;
    case 'PULL_UP':
      drawPullResistor(ctx, comp, true, sim, zoom);
      break;
    case 'PULL_DOWN':
      drawPullResistor(ctx, comp, false, sim, zoom);
      break;
    case 'TOGGLE_SWITCH':
      drawToggleSwitch(ctx, comp, sim, zoom);
      break;
    case 'PUSH_BUTTON':
      drawPushButton(ctx, comp, sim, zoom);
      break;
    case 'LED':
      drawLed(ctx, comp, sim, zoom);
      break;
    case 'PIXEL_MATRIX':
      drawPixelMatrix(ctx, comp, pins, sim, zoom);
      break;
  }

  // Pin terminal dots colored by live LogicValue
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const val = getPinVal(sim, comp.id, pin.id);
    const isHov =
      hoveredPin !== null &&
      hoveredPin !== undefined &&
      hoveredPin.componentId === comp.id &&
      hoveredPin.pinId === pin.id;

    const r = isHov ? 4.5 : 3.2;
    ctx.beginPath();
    ctx.arc(pin.offsetX, pin.offsetY, r, 0, Math.PI * 2);

    if (isError(val)) {
      ctx.fillStyle = THEME.err;
      ctx.fill();
    } else if (isHigh(val)) {
      ctx.fillStyle = THEME.high;
      ctx.fill();
    } else if (val === LogicValue.Z) {
      ctx.fillStyle = THEME.bg;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = THEME.z;
      ctx.stroke();
    } else {
      ctx.fillStyle = THEME.low;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#525E70';
      ctx.stroke();
    }
  }

  ctx.restore();
}
