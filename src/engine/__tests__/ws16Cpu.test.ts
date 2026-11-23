import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAndValidateCircuitDocument } from '../../store/circuitStore';
import { isHigh, LogicValue } from '../../types/circuit';
import { Simulator } from '../simulator';

const CPU_JSON_PATH = path.resolve(
  process.cwd(),
  'public/projects/26-16bit-risc-computer-30k.json',
);

function readLcdPixels(sim: Simulator): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: number[] = [];
    for (let x = 0; x < 8; x++) {
      row.push(isHigh(sim.getPinValue('lcd_matrix', `P_${y}_${x}`)) ? 1 : 0);
    }
    grid.push(row);
  }
  return grid;
}

function countLitPixels(grid: number[][]): number {
  let sum = 0;
  for (const row of grid) for (const px of row) sum += px;
  return sum;
}

function readPcLow5(sim: Simulator): number {
  let pc = 0;
  for (let i = 0; i < 5; i++) {
    if (isHigh(sim.getPinValue(`led_pc${i}`, 'IN'))) {
      pc |= 1 << i;
    }
  }
  return pc;
}

describe('WS-16 16-Bit RISC Computer (42,040 Raw Transistors) — Full Switch-Level Verification', () => {
  it('validates schema, compiles cleanly, runs with ZERO short circuits, executes ROM instructions, and drives the 8x8 LCD', () => {
    const t0 = performance.now();
    const raw = fs.readFileSync(CPU_JSON_PATH, 'utf8');
    const parsed = parseAndValidateCircuitDocument(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const doc = parsed.document;
    const txCount = doc.components.filter((c) => c.type === 'NMOS' || c.type === 'PMOS').length;
    expect(txCount).toBeGreaterThanOrEqual(25_000);

    const sim = new Simulator(doc);
    const compileMs = performance.now() - t0;
    const snap0 = sim.getSnapshot();
    expect(snap0.transistorCount).toBe(txCount);
    expect(snap0.hasShortCircuit).toBe(false);

    // Pulse RESET cleanly to verify reset behavior
    sim.setToggleState('sw_reset', true);
    for (let i = 0; i < 60; i++) sim.stepHalfCycle();
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    expect(readPcLow5(sim)).toBe(0);
    expect(countLitPixels(readLcdPixels(sim))).toBe(0);

    // Release RESET and let AUTO CLK run the CPU for ~16,000 ticks (full 8-row Wave frame!)
    sim.setToggleState('sw_reset', false);
    const pcsSeen = new Set<number>();
    let anyShort = false;
    const tSim0 = performance.now();
    for (let i = 0; i < 16000; i++) {
      sim.stepHalfCycle();
      if (sim.getSnapshot().hasShortCircuit) {
        anyShort = true;
        break;
      }
      if (i % 20 === 0) {
        pcsSeen.add(readPcLow5(sim));
      }
    }
    const simMs = performance.now() - tSim0;

    const lcdMode0 = readLcdPixels(sim);
    const litMode0 = countLitPixels(lcdMode0);

    console.log(
      `[WS-16 Sim] tx=${txCount.toLocaleString()}, compile=${compileMs.toFixed(1)}ms, 16000 ticks=${simMs.toFixed(1)}ms, PCs visited=${[...pcsSeen].sort((a, b) => a - b).join(',')}, LCD lit=${litMode0}`,
    );
    console.log(
      '[WS-16 LCD Mode 0 (Wave)]:\n' +
        lcdMode0.map((r) => '  ' + r.map((p) => (p ? '#' : '.')).join(' ')).join('\n'),
    );

    expect(anyShort).toBe(false);
    expect(pcsSeen.size).toBeGreaterThanOrEqual(12);
    expect(litMode0).toBeGreaterThanOrEqual(8);

    // Switch to Mode 1 (Fibonacci Visualizer) and run another 16,000 ticks
    sim.setToggleState('sw_mode', true);
    for (let i = 0; i < 16000; i++) {
      sim.stepHalfCycle();
      if (sim.getSnapshot().hasShortCircuit) {
        anyShort = true;
        break;
      }
    }
    const lcdMode1 = readLcdPixels(sim);
    const litMode1 = countLitPixels(lcdMode1);
    console.log(
      '[WS-16 LCD Mode 1 (Fibonacci)]:\n' +
        lcdMode1.map((r) => '  ' + r.map((p) => (p ? '#' : '.')).join(' ')).join('\n'),
    );

    expect(anyShort).toBe(false);
    expect(litMode1).toBeGreaterThanOrEqual(8);
  }, 30_000);
});
