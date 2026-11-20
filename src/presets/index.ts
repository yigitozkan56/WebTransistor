import type {
  CircuitComponent,
  CircuitDocument,
  CircuitPreset,
  Wire,
} from '../types/circuit';
import { getComponentDimensions } from '../engine/componentDefs';

function computeCenteredViewport(
  components: CircuitComponent[],
  canvasWidth = 1280,
  canvasHeight = 760,
): { x: number; y: number; zoom: number } {
  if (components.length === 0) {
    return { x: Math.round(canvasWidth / 2), y: Math.round(canvasHeight / 2), zoom: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const dims = getComponentDimensions(comp);
    const rotated = comp.rotation === 90 || comp.rotation === 270;
    const halfW = (rotated ? dims.height : dims.width) / 2;
    const halfH = (rotated ? dims.width : dims.height) / 2;

    if (comp.x - halfW < minX) minX = comp.x - halfW;
    if (comp.x + halfW > maxX) maxX = comp.x + halfW;
    if (comp.y - halfH < minY) minY = comp.y - halfH;
    if (comp.y + halfH > maxY) maxY = comp.y + halfH;
  }

  const pad = 96;
  const availW = Math.max(240, canvasWidth - pad * 2);
  const availH = Math.max(200, canvasHeight - pad * 2);
  const worldW = Math.max(80, maxX - minX);
  const worldH = Math.max(80, maxY - minY);

  const rawZoom = Math.min(availW / worldW, availH / worldH, 1.25);
  const zoom = Math.max(0.25, Math.min(2.5, Math.round(rawZoom * 100) / 100));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: Math.round(canvasWidth / 2 - cx * zoom),
    y: Math.round(canvasHeight / 2 - cy * zoom),
    zoom,
  };
}

/**
 * Builds the default PureSilicon startup document containing ONLY:
 * 1. 3-Transistor Ring Oscillator (Transistörlü Saat Devresi) + 1 blinking LED
 * 2. 4-Transistor Pure CMOS NAND Gate + 2 Toggle Switches + 1 LED
 */
export function createDefaultDocument(): CircuitDocument {
  const components: CircuitComponent[] = [
    // =========================================================================
    // 1. 3-Transistor Ring Oscillator (Left) — 3 NMOS + 3 PULL_UP + 3 GND + 1 LED
    // =========================================================================
    { id: 'pu_1', type: 'PULL_UP', x: 140, y: 120, rotation: 0, props: { label: 'R1' } },
    { id: 'nmos_1', type: 'NMOS', x: 140, y: 220, rotation: 0, props: { label: 'T1' } },
    { id: 'gnd_1', type: 'GND', x: 140, y: 300, rotation: 0, props: { label: 'GND' } },

    { id: 'pu_2', type: 'PULL_UP', x: 280, y: 120, rotation: 0, props: { label: 'R2' } },
    { id: 'nmos_2', type: 'NMOS', x: 280, y: 220, rotation: 0, props: { label: 'T2' } },
    { id: 'gnd_2', type: 'GND', x: 280, y: 300, rotation: 0, props: { label: 'GND' } },

    { id: 'pu_3', type: 'PULL_UP', x: 420, y: 120, rotation: 0, props: { label: 'R3' } },
    { id: 'nmos_3', type: 'NMOS', x: 420, y: 220, rotation: 0, props: { label: 'T3' } },
    { id: 'gnd_3', type: 'GND', x: 420, y: 300, rotation: 0, props: { label: 'GND' } },

    {
      id: 'led_osc',
      type: 'LED',
      x: 540,
      y: 180,
      rotation: 0,
      props: { label: 'OSC', color: 'amber' },
    },

    // =========================================================================
    // 2. 4-Transistor Pure CMOS NAND Gate (Right) — 2 PMOS + 2 NMOS + VCC/GND + 2 SW + 1 LED
    // =========================================================================
    {
      id: 'sw_nand_a',
      type: 'TOGGLE_SWITCH',
      x: 680,
      y: 140,
      rotation: 0,
      props: { label: 'A', state: true, keyBinding: 'A' },
    },
    {
      id: 'sw_nand_b',
      type: 'TOGGLE_SWITCH',
      x: 680,
      y: 340,
      rotation: 0,
      props: { label: 'B', state: false, keyBinding: 'B' },
    },
    { id: 'vcc_nand', type: 'VCC', x: 880, y: 60, rotation: 0, props: { label: 'VDD' } },
    { id: 'pmos_a', type: 'PMOS', x: 820, y: 140, rotation: 0, props: { label: 'P1' } },
    { id: 'pmos_b', type: 'PMOS', x: 940, y: 140, rotation: 0, props: { label: 'P2' } },
    { id: 'nmos_a', type: 'NMOS', x: 880, y: 240, rotation: 0, props: { label: 'N1' } },
    { id: 'nmos_b', type: 'NMOS', x: 880, y: 340, rotation: 0, props: { label: 'N2' } },
    { id: 'gnd_nand', type: 'GND', x: 880, y: 420, rotation: 0, props: { label: 'VSS' } },
    {
      id: 'led_nand',
      type: 'LED',
      x: 1040,
      y: 200,
      rotation: 0,
      props: { label: 'NAND', color: 'cyan' },
    },
  ];

  const wires: Wire[] = [
    // --- 3-Transistor Ring Oscillator Wires ---
    {
      id: 'w_osc_pu1',
      from: { componentId: 'pu_1', pinId: 'OUT' },
      to: { componentId: 'nmos_1', pinId: 'D' },
    },
    {
      id: 'w_osc_gnd1',
      from: { componentId: 'nmos_1', pinId: 'S' },
      to: { componentId: 'gnd_1', pinId: 'OUT' },
    },
    {
      id: 'w_osc_pu2',
      from: { componentId: 'pu_2', pinId: 'OUT' },
      to: { componentId: 'nmos_2', pinId: 'D' },
    },
    {
      id: 'w_osc_gnd2',
      from: { componentId: 'nmos_2', pinId: 'S' },
      to: { componentId: 'gnd_2', pinId: 'OUT' },
    },
    {
      id: 'w_osc_pu3',
      from: { componentId: 'pu_3', pinId: 'OUT' },
      to: { componentId: 'nmos_3', pinId: 'D' },
    },
    {
      id: 'w_osc_gnd3',
      from: { componentId: 'nmos_3', pinId: 'S' },
      to: { componentId: 'gnd_3', pinId: 'OUT' },
    },
    // D1 -> G2
    {
      id: 'w_osc_d1_g2',
      from: { componentId: 'nmos_1', pinId: 'D' },
      to: { componentId: 'nmos_2', pinId: 'G' },
      waypoints: [
        { x: 140, y: 180 },
        { x: 220, y: 180 },
        { x: 220, y: 220 },
      ],
    },
    // D2 -> G3
    {
      id: 'w_osc_d2_g3',
      from: { componentId: 'nmos_2', pinId: 'D' },
      to: { componentId: 'nmos_3', pinId: 'G' },
      waypoints: [
        { x: 280, y: 180 },
        { x: 360, y: 180 },
        { x: 360, y: 220 },
      ],
    },
    // D3 -> G1 (feedback ring)
    {
      id: 'w_osc_d3_g1',
      from: { componentId: 'nmos_3', pinId: 'D' },
      to: { componentId: 'nmos_1', pinId: 'G' },
      waypoints: [
        { x: 420, y: 180 },
        { x: 460, y: 180 },
        { x: 460, y: 360 },
        { x: 80, y: 360 },
        { x: 80, y: 220 },
      ],
    },
    // D3 -> Blinking LED
    {
      id: 'w_osc_d3_led',
      from: { componentId: 'nmos_3', pinId: 'D' },
      to: { componentId: 'led_osc', pinId: 'IN' },
      waypoints: [
        { x: 420, y: 180 },
        { x: 520, y: 180 },
      ],
    },

    // --- 4-Transistor Pure CMOS NAND Gate Wires ---
    {
      id: 'w_nand_vcc1',
      from: { componentId: 'vcc_nand', pinId: 'OUT' },
      to: { componentId: 'pmos_a', pinId: 'S' },
      waypoints: [
        { x: 880, y: 100 },
        { x: 820, y: 100 },
      ],
    },
    {
      id: 'w_nand_vcc2',
      from: { componentId: 'vcc_nand', pinId: 'OUT' },
      to: { componentId: 'pmos_b', pinId: 'S' },
      waypoints: [
        { x: 880, y: 100 },
        { x: 940, y: 100 },
      ],
    },
    {
      id: 'w_nand_a_p',
      from: { componentId: 'sw_nand_a', pinId: 'OUT' },
      to: { componentId: 'pmos_a', pinId: 'G' },
    },
    {
      id: 'w_nand_a_n',
      from: { componentId: 'sw_nand_a', pinId: 'OUT' },
      to: { componentId: 'nmos_a', pinId: 'G' },
      waypoints: [
        { x: 760, y: 140 },
        { x: 760, y: 240 },
      ],
    },
    {
      id: 'w_nand_b_n',
      from: { componentId: 'sw_nand_b', pinId: 'OUT' },
      to: { componentId: 'nmos_b', pinId: 'G' },
    },
    {
      id: 'w_nand_b_p',
      from: { componentId: 'sw_nand_b', pinId: 'OUT' },
      to: { componentId: 'pmos_b', pinId: 'G' },
      waypoints: [
        { x: 780, y: 340 },
        { x: 780, y: 180 },
        { x: 900, y: 180 },
        { x: 900, y: 140 },
      ],
    },
    {
      id: 'w_nand_pd1',
      from: { componentId: 'pmos_a', pinId: 'D' },
      to: { componentId: 'nmos_a', pinId: 'D' },
      waypoints: [
        { x: 820, y: 200 },
        { x: 880, y: 200 },
      ],
    },
    {
      id: 'w_nand_pd2',
      from: { componentId: 'pmos_b', pinId: 'D' },
      to: { componentId: 'nmos_a', pinId: 'D' },
      waypoints: [
        { x: 940, y: 200 },
        { x: 880, y: 200 },
      ],
    },
    {
      id: 'w_nand_out',
      from: { componentId: 'nmos_a', pinId: 'D' },
      to: { componentId: 'led_nand', pinId: 'IN' },
      waypoints: [
        { x: 880, y: 200 },
        { x: 1020, y: 200 },
      ],
    },
    {
      id: 'w_nand_ser',
      from: { componentId: 'nmos_a', pinId: 'S' },
      to: { componentId: 'nmos_b', pinId: 'D' },
    },
    {
      id: 'w_nand_gnd',
      from: { componentId: 'nmos_b', pinId: 'S' },
      to: { componentId: 'gnd_nand', pinId: 'OUT' },
    },
  ];

  return {
    version: 1,
    name: 'PureSilicon Başlangıç Devresi',
    components,
    wires,
  };
}

function createPureSiliconPreset(): CircuitPreset {
  const doc = createDefaultDocument();
  return {
    id: 'puresilicon-startup',
    name: 'PureSilicon Başlangıç',
    subtitle: '3T Ring Osilatör & 4T CMOS NAND',
    description:
      'Solda kendi kendine salınım yapan 3 transistörlü (NMOS + Pull-Up) Ring Osilatör saat devresi ve yanıp sönen LED; sağda ise 2 PMOS ve 2 NMOS transistörden oluşan saf CMOS NAND kapısı.',
    controlsHint:
      'Ring Osilatör kendi kendine saat üretir · A ve B anahtarlarına (veya klavyeden A / B tuşlarına) basarak 4T CMOS NAND kapısını test edin',
    defaultClockHz: 6,
    initialViewport: computeCenteredViewport(doc.components),
    document: doc,
  };
}

export const pureSiliconPreset: CircuitPreset = createPureSiliconPreset();
export const DEFAULT_PRESET: CircuitPreset = pureSiliconPreset;
export const transistorLogicPreset: CircuitPreset = pureSiliconPreset;

export const PRESETS: CircuitPreset[] = [pureSiliconPreset];

export function getPresetById(id: string): CircuitPreset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
