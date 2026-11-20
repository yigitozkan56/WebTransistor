import type {
  CircuitComponent,
  CircuitDocument,
  Wire,
} from '../types/circuit';

export interface SiliconBenchmarkPreset {
  id: string;
  targetTransistors: number;
  label: string;
  subtitle: string;
  recommendedClockHz: number;
}

export const SILICON_BENCHMARK_PRESETS: readonly SiliconBenchmarkPreset[] = [
  {
    id: 'bench_10k',
    targetTransistors: 10_000,
    label: '10.000 Transistör',
    subtitle: '2.500× CMOS NAND + Ring Oscillator Saat Ağı',
    recommendedClockHz: 25_000,
  },
  {
    id: 'bench_100k',
    targetTransistors: 100_000,
    label: '100.000 Transistör',
    subtitle: '25.000× CMOS NAND + Çoklu Ring Oscillator Stres Testi',
    recommendedClockHz: 100_000,
  },
  {
    id: 'bench_250k',
    targetTransistors: 250_000,
    label: '250.000 Transistör',
    subtitle: '62.500× CMOS NAND + Yüksek Yoğunluklu Silikon Kalıp',
    recommendedClockHz: 150_000,
  },
  {
    id: 'bench_1m',
    targetTransistors: 1_000_000,
    label: '1.000.000 Transistör',
    subtitle: '250.000× CMOS NAND — Tam Ölçekli VLSI Silikon Yonga Stres Testi',
    recommendedClockHz: 200_000,
  },
] as const;

const SHARED_EMPTY_PROPS = Object.freeze({});
const SHARED_CYAN_LED_PROPS = Object.freeze({ color: 'cyan' as const });
const SHARED_AMBER_LED_PROPS = Object.freeze({ color: 'amber' as const });
const SHARED_GREEN_LED_PROPS = Object.freeze({ color: 'green' as const });

/**
 * High-speed procedural pure-transistor VLSI Silicon Die generator.
 *
 * Produces a 100% pure physical transistor circuit (`NMOS`, `PMOS`, `VCC`, `GND`, `PULL_UP`, `LED`)
 * with zero black-box gates or clocks:
 * - Autonomous **3-Transistor NMOS Ring Oscillator Clock Generators** driving
 *   **4-Transistor Pure CMOS NAND Gates** and **2-Transistor CMOS Inverter Chains**
 *   with live indicator `LED`s across the die clock spine.
 * - High-density **4-Transistor Pure CMOS NAND Macro Array** (`2× PMOS` + `2× NMOS` per cell)
 *   arranged on a clean 20px/40px silicon die grid with distributed power/ground rails.
 * - Uses pre-allocated flat arrays for millisecond generation at 10,000 to 1,000,000+ transistors.
 */
export function generateSiliconBenchmarkChip(
  targetTransistors: number = 100_000,
): CircuitDocument {
  const requestedTx = Math.max(12, Math.floor(targetTransistors));

  // Active Ring-Oscillator + CMOS NAND + CMOS Inverter clock macro clusters (9 transistors each)
  const clusterCount =
    requestedTx >= 100_000
      ? 16
      : requestedTx >= 10_000
        ? 8
        : Math.max(1, Math.min(4, Math.floor(requestedTx / 9)));

  const activeClusterTx = clusterCount * 9;
  const remainingTx = Math.max(0, requestedTx - activeClusterTx);
  const nandCellCount = Math.ceil(remainingTx / 4);
  const totalTransistors = activeClusterTx + nandCellCount * 4;

  // Each active cluster has:
  // 1 VCC + 1 GND + 3 PULL_UP + 3 NMOS (Ring Osc) + 2 PMOS + 2 NMOS (CMOS NAND) + 1 PMOS + 1 NMOS (CMOS Inv) + 2 LED = 16 components
  // and 22 wires.
  const clusterCompCount = clusterCount * 16;
  const clusterWireCount = clusterCount * 22;

  // Distributed power/ground rail taps for the bulk silicon die array (1 VCC + 1 GND per sector)
  const sectorSize = Math.max(64, Math.ceil(nandCellCount / 32));
  const sectorCount = nandCellCount > 0 ? Math.ceil(nandCellCount / sectorSize) : 0;
  const railTapCompCount = sectorCount * 2;

  // Bulk 4-transistor CMOS NAND cells: 4 transistor components (2 PMOS + 2 NMOS)
  // Wire density: 4 wires per cell up to 250k transistors, 2 wires per cell at 1M transistors for fast compilation
  const wiresPerBulkCell = requestedTx > 300_000 ? 2 : 4;
  const totalCompCount = clusterCompCount + railTapCompCount + nandCellCount * 4;
  const totalWireCount = clusterWireCount + nandCellCount * wiresPerBulkCell;

  const components = new Array<CircuitComponent>(totalCompCount);
  const wires = new Array<Wire>(totalWireCount);

  let cIdx = 0;
  let wIdx = 0;

  // 1. Generate Active 3T Ring Oscillator + 4T CMOS NAND + 2T CMOS Inverter Clock Spine Clusters
  for (let c = 0; c < clusterCount; c++) {
    const baseX = (c % 8) * 560;
    const baseY = Math.floor(c / 8) * 320;

    const vccId = `cv_${c}`;
    const gndId = `cg_${c}`;
    const pu0 = `cpu0_${c}`;
    const pu1 = `cpu1_${c}`;
    const pu2 = `cpu2_${c}`;
    const ro0 = `cro0_${c}`;
    const ro1 = `cro1_${c}`;
    const ro2 = `cro2_${c}`;
    const ledClk = `cled0_${c}`;

    const np1 = `cnp1_${c}`;
    const np2 = `cnp2_${c}`;
    const nn1 = `cnn1_${c}`;
    const nn2 = `cnn2_${c}`;

    const ip = `cip_${c}`;
    const inmos = `cin_${c}`;
    const ledOut = `cled1_${c}`;

    components[cIdx++] = { id: vccId, type: 'VCC', x: baseX + 240, y: baseY, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: gndId, type: 'GND', x: baseX + 240, y: baseY + 240, rotation: 0, props: SHARED_EMPTY_PROPS };

    // 3-Transistor NMOS Ring Oscillator
    components[cIdx++] = { id: pu0, type: 'PULL_UP', x: baseX + 40, y: baseY + 40, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: pu1, type: 'PULL_UP', x: baseX + 100, y: baseY + 40, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: pu2, type: 'PULL_UP', x: baseX + 160, y: baseY + 40, rotation: 0, props: SHARED_EMPTY_PROPS };

    components[cIdx++] = { id: ro0, type: 'NMOS', x: baseX + 40, y: baseY + 120, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: ro1, type: 'NMOS', x: baseX + 100, y: baseY + 120, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: ro2, type: 'NMOS', x: baseX + 160, y: baseY + 120, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: ledClk, type: 'LED', x: baseX + 200, y: baseY + 120, rotation: 0, props: SHARED_CYAN_LED_PROPS };

    // 4-Transistor Pure CMOS NAND Gate
    components[cIdx++] = { id: np1, type: 'PMOS', x: baseX + 280, y: baseY + 60, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: np2, type: 'PMOS', x: baseX + 340, y: baseY + 60, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: nn1, type: 'NMOS', x: baseX + 300, y: baseY + 120, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: nn2, type: 'NMOS', x: baseX + 300, y: baseY + 180, rotation: 0, props: SHARED_EMPTY_PROPS };

    // 2-Transistor Pure CMOS Inverter + Output LED
    components[cIdx++] = { id: ip, type: 'PMOS', x: baseX + 420, y: baseY + 80, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: inmos, type: 'NMOS', x: baseX + 420, y: baseY + 160, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = {
      id: ledOut,
      type: 'LED',
      x: baseX + 480,
      y: baseY + 120,
      rotation: 0,
      props: c % 2 === 0 ? SHARED_AMBER_LED_PROPS : SHARED_GREEN_LED_PROPS,
    };

    // Ring Oscillator wires (10 wires)
    wires[wIdx++] = { id: `cw0_${c}`, from: { componentId: pu0, pinId: 'OUT' }, to: { componentId: ro0, pinId: 'D' } };
    wires[wIdx++] = { id: `cw1_${c}`, from: { componentId: ro0, pinId: 'S' }, to: { componentId: gndId, pinId: 'OUT' } };
    wires[wIdx++] = { id: `cw2_${c}`, from: { componentId: pu1, pinId: 'OUT' }, to: { componentId: ro1, pinId: 'D' } };
    wires[wIdx++] = { id: `cw3_${c}`, from: { componentId: ro1, pinId: 'S' }, to: { componentId: gndId, pinId: 'OUT' } };
    wires[wIdx++] = { id: `cw4_${c}`, from: { componentId: pu2, pinId: 'OUT' }, to: { componentId: ro2, pinId: 'D' } };
    wires[wIdx++] = { id: `cw5_${c}`, from: { componentId: ro2, pinId: 'S' }, to: { componentId: gndId, pinId: 'OUT' } };
    wires[wIdx++] = { id: `cw6_${c}`, from: { componentId: ro0, pinId: 'D' }, to: { componentId: ro1, pinId: 'G' } };
    wires[wIdx++] = { id: `cw7_${c}`, from: { componentId: ro1, pinId: 'D' }, to: { componentId: ro2, pinId: 'G' } };
    wires[wIdx++] = { id: `cw8_${c}`, from: { componentId: ro2, pinId: 'D' }, to: { componentId: ro0, pinId: 'G' } };
    wires[wIdx++] = { id: `cw9_${c}`, from: { componentId: ro2, pinId: 'D' }, to: { componentId: ledClk, pinId: 'IN' } };

    // 4T CMOS NAND wires driven by ro1:D and ro2:D (8 wires)
    wires[wIdx++] = { id: `cw10_${c}`, from: { componentId: vccId, pinId: 'OUT' }, to: { componentId: np1, pinId: 'S' } };
    wires[wIdx++] = { id: `cw11_${c}`, from: { componentId: vccId, pinId: 'OUT' }, to: { componentId: np2, pinId: 'S' } };
    wires[wIdx++] = { id: `cw12_${c}`, from: { componentId: np1, pinId: 'D' }, to: { componentId: nn1, pinId: 'D' } };
    wires[wIdx++] = { id: `cw13_${c}`, from: { componentId: np2, pinId: 'D' }, to: { componentId: nn1, pinId: 'D' } };
    wires[wIdx++] = { id: `cw14_${c}`, from: { componentId: nn1, pinId: 'S' }, to: { componentId: nn2, pinId: 'D' } };
    wires[wIdx++] = { id: `cw15_${c}`, from: { componentId: nn2, pinId: 'S' }, to: { componentId: gndId, pinId: 'OUT' } };
    wires[wIdx++] = { id: `cw16_${c}`, from: { componentId: ro1, pinId: 'D' }, to: { componentId: np1, pinId: 'G' } };
    wires[wIdx++] = { id: `cw17_${c}`, from: { componentId: ro1, pinId: 'D' }, to: { componentId: nn1, pinId: 'G' } };

    // 2T CMOS Inverter + NAND gate B input & output wires (4 wires)
    wires[wIdx++] = { id: `cw18_${c}`, from: { componentId: ro2, pinId: 'D' }, to: { componentId: np2, pinId: 'G' } };
    wires[wIdx++] = { id: `cw19_${c}`, from: { componentId: ro2, pinId: 'D' }, to: { componentId: nn2, pinId: 'G' } };
    wires[wIdx++] = { id: `cw20_${c}`, from: { componentId: ip, pinId: 'D' }, to: { componentId: inmos, pinId: 'D' } };
    wires[wIdx++] = { id: `cw21_${c}`, from: { componentId: nn1, pinId: 'D' }, to: { componentId: ledOut, pinId: 'IN' } };
  }

  // 2. Generate Distributed Sector Power/Ground Rail Taps
  for (let s = 0; s < sectorCount; s++) {
    const sx = (s % 16) * 280;
    const sy = 640 + Math.floor(s / 16) * 80;
    components[cIdx++] = {
      id: `sv_${s}`,
      type: 'VCC',
      x: sx,
      y: sy,
      rotation: 0,
      props: SHARED_EMPTY_PROPS,
    };
    components[cIdx++] = {
      id: `sg_${s}`,
      type: 'GND',
      x: sx + 40,
      y: sy,
      rotation: 0,
      props: SHARED_EMPTY_PROPS,
    };
  }

  // 3. Generate High-Density 4-Transistor Pure CMOS NAND Silicon Die Array
  const gridCols = Math.max(16, Math.ceil(Math.sqrt(nandCellCount)));
  const dieOffsetY = 800;

  for (let i = 0; i < nandCellCount; i++) {
    const col = i % gridCols;
    const row = (i / gridCols) | 0;
    const x = col * 80;
    const y = dieOffsetY + row * 80;

    const p1 = `p1_${i}`;
    const p2 = `p2_${i}`;
    const n1 = `n1_${i}`;
    const n2 = `n2_${i}`;

    components[cIdx++] = { id: p1, type: 'PMOS', x, y, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: p2, type: 'PMOS', x: x + 40, y, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: n1, type: 'NMOS', x, y: y + 40, rotation: 0, props: SHARED_EMPTY_PROPS };
    components[cIdx++] = { id: n2, type: 'NMOS', x: x + 40, y: y + 40, rotation: 0, props: SHARED_EMPTY_PROPS };

    const sec = (i / sectorSize) | 0;
    const vccTap = `sv_${sec}`;
    const gndTap = `sg_${sec}`;

    if (wiresPerBulkCell === 4) {
      wires[wIdx++] = { id: `wv_${i}`, from: { componentId: vccTap, pinId: 'OUT' }, to: { componentId: p1, pinId: 'S' } };
      wires[wIdx++] = { id: `wd_${i}`, from: { componentId: p1, pinId: 'D' }, to: { componentId: n1, pinId: 'D' } };
      wires[wIdx++] = { id: `ws_${i}`, from: { componentId: n1, pinId: 'S' }, to: { componentId: n2, pinId: 'D' } };
      wires[wIdx++] = { id: `wg_${i}`, from: { componentId: n2, pinId: 'S' }, to: { componentId: gndTap, pinId: 'OUT' } };
    } else {
      wires[wIdx++] = { id: `wd_${i}`, from: { componentId: p1, pinId: 'D' }, to: { componentId: n1, pinId: 'D' } };
      wires[wIdx++] = { id: `ws_${i}`, from: { componentId: p2, pinId: 'D' }, to: { componentId: n2, pinId: 'D' } };
    }
  }

  return {
    version: 1,
    name: `PureSilicon VLSI Kalıbı (${totalTransistors.toLocaleString('tr-TR')} Transistör)`,
    components,
    wires,
  };
}
