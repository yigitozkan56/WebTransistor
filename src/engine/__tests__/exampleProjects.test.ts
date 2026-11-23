import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXAMPLE_PROJECT_CATEGORIES,
  EXAMPLE_PROJECTS,
  fetchExampleProjectDocument,
  fetchExampleProjectJson,
  getExampleProjectById,
} from '../../data/exampleProjects';
import { parseAndValidateCircuitDocument, VALID_COMPONENT_TYPES } from '../../store/circuitStore';
import { isHigh, isLow, LogicValue, type CircuitDocument } from '../../types/circuit';
import { getComponentPins, getPinWorldPosition } from '../componentDefs';
import { Simulator } from '../simulator';

const PROJECTS_DIR = path.resolve(process.cwd(), 'public/projects');
const FORBIDDEN_KEY_BINDINGS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'F', 'R']);

function loadProjectFromDisk(filename: string): { rawJson: string; doc: CircuitDocument } {
  const filePath = path.join(PROJECTS_DIR, filename);
  const rawJson = fs.readFileSync(filePath, 'utf8');
  const parsed = parseAndValidateCircuitDocument(rawJson);
  if (!parsed.ok) {
    throw new Error(`Validation failed for ${filename}: ${parsed.error}`);
  }
  return { rawJson, doc: parsed.document };
}

describe('PureSilicon 10 Example JSON Projects — Schema, Grid & Manifest Integrity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines all 25 manifest entries and 6 categories matching the exact disk JSON files', () => {
    expect(EXAMPLE_PROJECT_CATEGORIES).toEqual([
      'Temel Mantık Kapıları',
      'Saat & Osilatörler',
      'Bellek & Sıralı Devreler',
      'Aritmetik & Çoklayıcı',
      'Ekran & Çıkış',
      'Mimari & İşlemci',
    ]);
    expect(EXAMPLE_PROJECTS).toHaveLength(26);

    const expectedIds = [
      '01-cmos-inverter-not',
      '02-cmos-nand-and',
      '03-cmos-nor-or',
      '04-cmos-xor-gate',
      '05-ring-oscillator-5stage',
      '06-sr-nor-latch',
      '07-mux-2to1-cmos',
      '08-half-adder-1bit',
      '09-d-latch-gated-memory',
      '10-pixel-matrix-decoder-4x4',
      '11-cmos-xnor-comparator-1bit',
      '12-majority-voter-3input',
      '13-full-adder-1bit',
      '14-demux-1to4-cmos',
      '15-mux-4to1-cmos',
      '16-ring-oscillator-7stage-cmos',
      '17-d-flipflop-edge-triggered',
      '18-2bit-magnitude-comparator',
      '19-4bit-ripple-carry-adder',
      '20-4bit-parallel-register',
      '21-3to8-line-decoder-cmos',
      '22-4bit-alu-processor-core',
      '23-4x4-sram-memory-bank',
      '24-4bit-array-multiplier',
      '25-8x8-gpu-pixel-rasterizer',
      '26-ws16-risc-computer-41k',
    ];

    EXAMPLE_PROJECTS.forEach((meta, idx) => {
      expect(meta.id).toBe(expectedIds[idx]);
      expect(meta.order).toBe(idx + 1);
      expect(meta.filename).toBe(`${meta.id}.json`);
      expect(meta.jsonPath).toBe(`/projects/${meta.filename}`);
      expect(getExampleProjectById(meta.id)).toBe(meta);
      expect(EXAMPLE_PROJECT_CATEGORIES).toContain(meta.category);
    });
  });

  it('validates all 10 JSON files: schema, 10 physical types, 20px grid, safe keyBindings, manifest counts, and no initial short circuits', () => {
    for (const meta of EXAMPLE_PROJECTS) {
      const { doc } = loadProjectFromDisk(meta.filename);
      const txCount = doc.components.filter((c) => c.type === 'NMOS' || c.type === 'PMOS').length;

      expect(txCount).toBe(meta.transistorCount);
      expect(doc.components.length).toBe(meta.componentCount);
      expect(doc.wires.length).toBe(meta.wireCount);

      for (const comp of doc.components) {
        expect(VALID_COMPONENT_TYPES.has(comp.type)).toBe(true);
        expect(Math.abs(comp.x % 20)).toBe(0);
        expect(Math.abs(comp.y % 20)).toBe(0);

        if (comp.props.keyBinding) {
          expect(FORBIDDEN_KEY_BINDINGS.has(comp.props.keyBinding.toUpperCase())).toBe(false);
        }

        const pins = getComponentPins(comp);
        for (const pin of pins) {
          const pos = getPinWorldPosition(comp, pin);
          expect(Math.abs(pos.x % 20)).toBe(0);
          expect(Math.abs(pos.y % 20)).toBe(0);
        }
      }

      for (const wire of doc.wires) {
        if (wire.waypoints) {
          for (const pt of wire.waypoints) {
            expect(Math.abs(pt.x % 20)).toBe(0);
            expect(Math.abs(pt.y % 20)).toBe(0);
          }
        }
      }

      const sim = new Simulator(doc);
      const snap = sim.getSnapshot();
      expect(snap.transistorCount).toBe(meta.transistorCount);
      expect(snap.hasShortCircuit).toBe(false);
    }
  });

  it('fetchExampleProjectJson caches fetches in-memory and fetchExampleProjectDocument validates payload', async () => {
    const first = EXAMPLE_PROJECTS[0];
    const { rawJson } = loadProjectFromDisk(first.filename);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => rawJson,
    });
    vi.stubGlobal('fetch', fetchMock);

    const text1 = await fetchExampleProjectJson(first);
    const text2 = await fetchExampleProjectJson(first);
    expect(text1).toBe(rawJson);
    expect(text2).toBe(rawJson);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(first.jsonPath);

    const docRes = await fetchExampleProjectDocument(first);
    expect(docRes.ok).toBe(true);
    if (docRes.ok) {
      expect(docRes.document.components).toHaveLength(first.componentCount);
      expect(docRes.rawJson).toBe(rawJson);
    }

    const second = EXAMPLE_PROJECTS[1];
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const errRes = await fetchExampleProjectDocument(second);
    expect(errRes.ok).toBe(false);
  });
});

describe('PureSilicon 10 Example JSON Projects — Functional Transistor Simulation', () => {
  it('1. 01-cmos-inverter-not.json (2T): inverts A=0->1 and A=1->0 cleanly', () => {
    const { doc } = loadProjectFromDisk('01-cmos-inverter-not.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(2);

    sim.setToggleState('sw_a', false);
    expect(sim.getPinValue('led_in', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_out', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getTransistorState('p1')).toBe(1);
    expect(sim.getTransistorState('n1')).toBe(0);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    sim.setToggleState('sw_a', true);
    expect(sim.getPinValue('led_in', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_out', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getTransistorState('p1')).toBe(0);
    expect(sim.getTransistorState('n1')).toBe(1);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('2. 02-cmos-nand-and.json (6T): verifies NAND and AND outputs for all 4 combinations', () => {
    const { doc } = loadProjectFromDisk('02-cmos-nand-and.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(6);

    const cases: Array<[boolean, boolean, LogicValue, LogicValue]> = [
      [false, false, LogicValue.HIGH, LogicValue.LOW],
      [false, true, LogicValue.HIGH, LogicValue.LOW],
      [true, false, LogicValue.HIGH, LogicValue.LOW],
      [true, true, LogicValue.LOW, LogicValue.HIGH],
    ];

    for (const [a, b, expNand, expAnd] of cases) {
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      expect(sim.getPinValue('led_nand', 'IN')).toBe(expNand);
      expect(sim.getPinValue('led_and', 'IN')).toBe(expAnd);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('3. 03-cmos-nor-or.json (6T): verifies NOR and OR outputs for all 4 combinations', () => {
    const { doc } = loadProjectFromDisk('03-cmos-nor-or.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(6);

    const cases: Array<[boolean, boolean, LogicValue, LogicValue]> = [
      [false, false, LogicValue.HIGH, LogicValue.LOW],
      [false, true, LogicValue.LOW, LogicValue.HIGH],
      [true, false, LogicValue.LOW, LogicValue.HIGH],
      [true, true, LogicValue.LOW, LogicValue.HIGH],
    ];

    for (const [a, b, expNor, expOr] of cases) {
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      expect(sim.getPinValue('led_nor', 'IN')).toBe(expNor);
      expect(sim.getPinValue('led_or', 'IN')).toBe(expOr);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('4. 04-cmos-xor-gate.json (12T): verifies static complementary CMOS XOR for all 4 combinations', () => {
    const { doc } = loadProjectFromDisk('04-cmos-xor-gate.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(12);

    const cases: Array<[boolean, boolean, LogicValue]> = [
      [false, false, LogicValue.LOW],
      [false, true, LogicValue.HIGH],
      [true, false, LogicValue.HIGH],
      [true, true, LogicValue.LOW],
    ];

    for (const [a, b, expXor] of cases) {
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      expect(sim.getPinValue('led_xor', 'IN')).toBe(expXor);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('5. 05-ring-oscillator-5stage.json (5T): self-oscillates smoothly across all 5 stages over 30 ticks', () => {
    const { doc } = loadProjectFromDisk('05-ring-oscillator-5stage.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(5);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    const ledIds = ['led_s1', 'led_s2', 'led_s3', 'led_s4', 'led_s5'];
    const highCounts = [0, 0, 0, 0, 0];
    const lowCounts = [0, 0, 0, 0, 0];
    const toggles = [0, 0, 0, 0, 0];
    const prevHigh = ledIds.map((id) => isHigh(sim.getPinValue(id, 'IN')));

    for (let tick = 0; tick < 30; tick++) {
      sim.stepHalfCycle();
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);

      for (let i = 0; i < ledIds.length; i++) {
        const val = sim.getPinValue(ledIds[i], 'IN');
        const curHigh = isHigh(val);
        const curLow = isLow(val);
        expect(curHigh || curLow).toBe(true);
        if (curHigh) highCounts[i]++;
        if (curLow) lowCounts[i]++;
        if (curHigh !== prevHigh[i]) {
          toggles[i]++;
          prevHigh[i] = curHigh;
        }
      }
    }

    for (let i = 0; i < ledIds.length; i++) {
      expect(highCounts[i]).toBe(15);
      expect(lowCounts[i]).toBe(15);
      expect(toggles[i]).toBeGreaterThanOrEqual(5);
    }
  });

  it('6. 06-sr-nor-latch.json (8T): boots deterministically (Q=0, Q\'=1), sets, holds, resets, and holds', () => {
    const { doc } = loadProjectFromDisk('06-sr-nor-latch.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(8);

    // Deterministic startup via PULL_DOWN on Q
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // SET pressed -> Q=1, Q'=0
    sim.setPushButtonState('btn_set', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // SET released -> holds Q=1, Q'=0
    sim.setPushButtonState('btn_set', false);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // RESET pressed -> Q=0, Q'=1
    sim.setPushButtonState('btn_reset', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // RESET released -> holds Q=0, Q'=1
    sim.setPushButtonState('btn_reset', false);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('7. 07-mux-2to1-cmos.json (14T): verifies all 8 (SEL, D0, D1) combinations', () => {
    const { doc } = loadProjectFromDisk('07-mux-2to1-cmos.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(14);

    for (const sel of [false, true]) {
      for (const d0 of [false, true]) {
        for (const d1 of [false, true]) {
          sim.setToggleState('sw_sel', sel);
          sim.setToggleState('sw_d0', d0);
          sim.setToggleState('sw_d1', d1);
          const expected = (sel ? d1 : d0) ? LogicValue.HIGH : LogicValue.LOW;
          expect(sim.getPinValue('led_y', 'IN')).toBe(expected);
          expect(sim.getSnapshot().hasShortCircuit).toBe(false);
        }
      }
    }
  });

  it('8. 08-half-adder-1bit.json (18T): verifies SUM and CARRY for all 4 (A, B) combinations', () => {
    const { doc } = loadProjectFromDisk('08-half-adder-1bit.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(18);

    const cases: Array<[boolean, boolean, LogicValue, LogicValue]> = [
      [false, false, LogicValue.LOW, LogicValue.LOW],
      [false, true, LogicValue.HIGH, LogicValue.LOW],
      [true, false, LogicValue.HIGH, LogicValue.LOW],
      [true, true, LogicValue.LOW, LogicValue.HIGH],
    ];

    for (const [a, b, expSum, expCarry] of cases) {
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      expect(sim.getPinValue('led_sum', 'IN')).toBe(expSum);
      expect(sim.getPinValue('led_carry', 'IN')).toBe(expCarry);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('9. 09-d-latch-gated-memory.json (18T): verifies transparent capture (EN=1) and gated hold (EN=0)', () => {
    const { doc } = loadProjectFromDisk('09-d-latch-gated-memory.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(18);

    // Startup: DATA=0, ENABLE=0 -> Q=0, Q'=1
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // While ENABLE=0, changing DATA to 1 must NOT change latched Q=0
    sim.setToggleState('sw_d', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // Enable transparent mode (ENABLE=1) -> Q captures DATA=1
    sim.setToggleState('sw_en', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // Close gate (ENABLE=0) and change DATA to 0 -> Q remains latched at 1
    sim.setToggleState('sw_en', false);
    sim.setToggleState('sw_d', false);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // Open gate (ENABLE=1) with DATA=0 -> Q captures DATA=0
    sim.setToggleState('sw_en', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);

    // Close gate (ENABLE=0) -> holds Q=0
    sim.setToggleState('sw_en', false);
    sim.setToggleState('sw_d', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('10. 10-pixel-matrix-decoder-4x4.json (28T): scans all 4 rows of the 4x4 PIXEL_MATRIX and R0..R3 LEDs', () => {
    const { doc } = loadProjectFromDisk('10-pixel-matrix-decoder-4x4.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(28);

    const addressCases: Array<[boolean, boolean, number]> = [
      [false, false, 0], // A1=0, A0=0 -> Row 0
      [false, true, 1],  // A1=0, A0=1 -> Row 1
      [true, false, 2],  // A1=1, A0=0 -> Row 2
      [true, true, 3],   // A1=1, A0=1 -> Row 3
    ];

    for (const [a1, a0, activeRow] of addressCases) {
      sim.setToggleState('sw_a1', a1);
      sim.setToggleState('sw_a0', a0);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);

      for (let r = 0; r < 4; r++) {
        const expected = r === activeRow ? LogicValue.HIGH : LogicValue.LOW;
        expect(sim.getPinValue(`led_r${r}`, 'IN')).toBe(expected);
        for (let col = 0; col < 4; col++) {
          expect(sim.getPinValue('mat', `P_${r}_${col}`)).toBe(expected);
        }
      }
    }
  });

  it('11. 11-cmos-xnor-comparator-1bit.json (14T): verifies EQ and NEQ for all 4 combinations', () => {
    const { doc } = loadProjectFromDisk('11-cmos-xnor-comparator-1bit.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(14);
    for (const a of [false, true]) {
      for (const b of [false, true]) {
        sim.setToggleState('sw_a', a);
        sim.setToggleState('sw_b', b);
        const eq = a === b;
        expect(sim.getPinValue('led_eq', 'IN')).toBe(eq ? LogicValue.HIGH : LogicValue.LOW);
        expect(sim.getPinValue('led_neq', 'IN')).toBe(eq ? LogicValue.LOW : LogicValue.HIGH);
        expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      }
    }
  });

  it('12. 12-majority-voter-3input.json (18T): verifies TMR majority for all 8 combinations', () => {
    const { doc } = loadProjectFromDisk('12-majority-voter-3input.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(18);
    for (let mask = 0; mask < 8; mask++) {
      const a = Boolean(mask & 1);
      const b = Boolean(mask & 2);
      const c = Boolean(mask & 4);
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      sim.setToggleState('sw_c', c);
      const ones = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
      expect(sim.getPinValue('led_maj', 'IN')).toBe(ones >= 2 ? LogicValue.HIGH : LogicValue.LOW);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('13. 13-full-adder-1bit.json (36T): verifies SUM and COUT for all 8 combinations', () => {
    const { doc } = loadProjectFromDisk('13-full-adder-1bit.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(36);
    for (let mask = 0; mask < 8; mask++) {
      const a = mask & 1;
      const b = (mask >> 1) & 1;
      const cin = (mask >> 2) & 1;
      sim.setToggleState('sw_a', Boolean(a));
      sim.setToggleState('sw_b', Boolean(b));
      sim.setToggleState('sw_cin', Boolean(cin));
      const total = a + b + cin;
      expect(sim.getPinValue('led_sum', 'IN')).toBe((total & 1) ? LogicValue.HIGH : LogicValue.LOW);
      expect(sim.getPinValue('led_cout', 'IN')).toBe((total >> 1) ? LogicValue.HIGH : LogicValue.LOW);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('14. 14-demux-1to4-cmos.json (36T): routes DATA to the selected Y0..Y3 channel for all 8 combinations', () => {
    const { doc } = loadProjectFromDisk('14-demux-1to4-cmos.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(36);
    for (const d of [false, true]) {
      for (let sel = 0; sel < 4; sel++) {
        sim.setToggleState('sw_d', d);
        sim.setToggleState('sw_s0', Boolean(sel & 1));
        sim.setToggleState('sw_s1', Boolean(sel & 2));
        for (let ch = 0; ch < 4; ch++) {
          const exp = d && ch === sel ? LogicValue.HIGH : LogicValue.LOW;
          expect(sim.getPinValue(`led_y${ch}`, 'IN')).toBe(exp);
        }
        expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      }
    }
  });

  it('15. 15-mux-4to1-cmos.json (40T): verifies all 64 (S1, S0, D0..D3) combinations', () => {
    const { doc } = loadProjectFromDisk('15-mux-4to1-cmos.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(40);
    for (let sel = 0; sel < 4; sel++) {
      sim.setToggleState('sw_s0', Boolean(sel & 1));
      sim.setToggleState('sw_s1', Boolean(sel & 2));
      for (let data = 0; data < 16; data++) {
        for (let i = 0; i < 4; i++) {
          sim.setToggleState(`sw_d${i}`, Boolean((data >> i) & 1));
        }
        const exp = Boolean((data >> sel) & 1) ? LogicValue.HIGH : LogicValue.LOW;
        expect(sim.getPinValue('led_y', 'IN')).toBe(exp);
        expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      }
    }
  });

  it('16. 16-ring-oscillator-7stage-cmos.json (14T): self-oscillates smoothly across all 7 CMOS stages over 28 ticks', () => {
    const { doc } = loadProjectFromDisk('16-ring-oscillator-7stage-cmos.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(14);
    const ledIds = ['led_p1', 'led_p2', 'led_p3', 'led_p4', 'led_p5', 'led_p6', 'led_p7'];
    const highs = new Array(7).fill(0);
    const lows = new Array(7).fill(0);
    for (let tick = 0; tick < 28; tick++) {
      sim.stepHalfCycle();
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      for (let i = 0; i < 7; i++) {
        const val = sim.getPinValue(ledIds[i], 'IN');
        if (val === LogicValue.HIGH) highs[i]++;
        if (val === LogicValue.LOW) lows[i]++;
      }
    }
    for (let i = 0; i < 7; i++) {
      expect(highs[i]).toBe(14);
      expect(lows[i]).toBe(14);
    }
  });

  it('17. 17-d-flipflop-edge-triggered.json (38T): captures DATA strictly on rising CLK edge', () => {
    const { doc } = loadProjectFromDisk('17-d-flipflop-edge-triggered.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(38);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);

    // Changing DATA while CLK=0 updates master (QM) but NOT slave (Q)
    sim.setToggleState('sw_d', true);
    expect(sim.getPinValue('led_qm', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);

    // Rising edge CLK=1 latches Q=1
    sim.setPushButtonState('btn_clk', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.LOW);

    // Changing DATA=0 while CLK=1 must NOT affect Q (master is locked)
    sim.setToggleState('sw_d', false);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);

    // Falling edge CLK=0 holds Q=1 while master loads 0
    sim.setPushButtonState('btn_clk', false);
    expect(sim.getPinValue('led_qm', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.HIGH);

    // Next rising edge CLK=1 latches Q=0
    sim.setPushButtonState('btn_clk', true);
    expect(sim.getPinValue('led_q', 'IN')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('led_q_bar', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('18. 18-2bit-magnitude-comparator.json (62T): verifies A>B, A=B, A<B for all 16 combinations', () => {
    const { doc } = loadProjectFromDisk('18-2bit-magnitude-comparator.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(62);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        sim.setToggleState('sw_a0', Boolean(a & 1));
        sim.setToggleState('sw_a1', Boolean(a & 2));
        sim.setToggleState('sw_b0', Boolean(b & 1));
        sim.setToggleState('sw_b1', Boolean(b & 2));
        expect(sim.getPinValue('led_gt', 'IN')).toBe(a > b ? LogicValue.HIGH : LogicValue.LOW);
        expect(sim.getPinValue('led_eq', 'IN')).toBe(a === b ? LogicValue.HIGH : LogicValue.LOW);
        expect(sim.getPinValue('led_lt', 'IN')).toBe(a < b ? LogicValue.HIGH : LogicValue.LOW);
        expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      }
    }
  });

  it('19. 19-4bit-ripple-carry-adder.json (144T): exhaustively verifies all 512 (A + B + CIN) sums', () => {
    const { doc } = loadProjectFromDisk('19-4bit-ripple-carry-adder.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(144);
    for (let cin = 0; cin <= 1; cin++) {
      sim.setToggleState('sw_cin', Boolean(cin));
      for (let a = 0; a < 16; a++) {
        for (let i = 0; i < 4; i++) sim.setToggleState(`sw_a${i}`, Boolean((a >> i) & 1));
        for (let b = 0; b < 16; b++) {
          for (let i = 0; i < 4; i++) sim.setToggleState(`sw_b${i}`, Boolean((b >> i) & 1));
          const sum = a + b + cin;
          for (let i = 0; i < 4; i++) {
            expect(sim.getPinValue(`led_s${i}`, 'IN')).toBe(((sum >> i) & 1) ? LogicValue.HIGH : LogicValue.LOW);
          }
          expect(sim.getPinValue('led_cout', 'IN')).toBe(((sum >> 4) & 1) ? LogicValue.HIGH : LogicValue.LOW);
          expect(sim.getSnapshot().hasShortCircuit).toBe(false);
        }
      }
    }
  });

  it('20. 20-4bit-parallel-register.json (72T): stores and holds 4-bit nibbles via LOAD (EN)', () => {
    const { doc } = loadProjectFromDisk('20-4bit-parallel-register.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(72);

    const setData = (val: number) => {
      for (let i = 0; i < 4; i++) sim.setToggleState(`sw_d${i}`, Boolean((val >> i) & 1));
    };
    const readQ = () => {
      let out = 0;
      for (let i = 0; i < 4; i++) {
        if (sim.getPinValue(`led_q${i}`, 'IN') === LogicValue.HIGH) out |= 1 << i;
      }
      return out;
    };

    expect(readQ()).toBe(0);
    setData(0b1010);
    expect(readQ()).toBe(0); // EN=0, still holds 0
    sim.setToggleState('sw_en', true);
    expect(readQ()).toBe(0b1010);
    sim.setToggleState('sw_en', false);
    setData(0b0101);
    expect(readQ()).toBe(0b1010); // Locked!
    sim.setToggleState('sw_en', true);
    expect(readQ()).toBe(0b0101);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('21. 21-3to8-line-decoder-cmos.json (70T): verifies all 8 one-hot outputs Y0..Y7', () => {
    const { doc } = loadProjectFromDisk('21-3to8-line-decoder-cmos.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(70);
    for (let addr = 0; addr < 8; addr++) {
      sim.setToggleState('sw_a0', Boolean(addr & 1));
      sim.setToggleState('sw_a1', Boolean(addr & 2));
      sim.setToggleState('sw_a2', Boolean(addr & 4));
      for (let y = 0; y < 8; y++) {
        expect(sim.getPinValue(`led_y${y}`, 'IN')).toBe(y === addr ? LogicValue.HIGH : LogicValue.LOW);
      }
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('22. [UZMAN] 22-4bit-alu-processor-core.json (372T): verifies ADD, SUB, AND, XOR and Z/C/N flags', () => {
    const { doc } = loadProjectFromDisk('22-4bit-alu-processor-core.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(372);

    const runOp = (a: number, b: number, op: number) => {
      for (let i = 0; i < 4; i++) {
        sim.setToggleState(`sw_a${i}`, Boolean((a >> i) & 1));
        sim.setToggleState(`sw_b${i}`, Boolean((b >> i) & 1));
      }
      sim.setToggleState('sw_op0', Boolean(op & 1));
      sim.setToggleState('sw_op1', Boolean(op & 2));
      let res = 0;
      for (let i = 0; i < 4; i++) {
        if (sim.getPinValue(`led_r${i}`, 'IN') === LogicValue.HIGH) res |= 1 << i;
      }
      return {
        res,
        z: sim.getPinValue('led_z', 'IN') === LogicValue.HIGH,
        c: sim.getPinValue('led_c', 'IN') === LogicValue.HIGH,
        n: sim.getPinValue('led_n', 'IN') === LogicValue.HIGH,
      };
    };

    // ADD (op=0): 6 + 7 = 13 (0b1101, Z=0, C=0, N=1); 10 + 6 = 16 -> res=0, Z=1, C=1
    expect(runOp(6, 7, 0)).toEqual({ res: 13, z: false, c: false, n: true });
    expect(runOp(10, 6, 0)).toEqual({ res: 0, z: true, c: true, n: false });

    // SUB (op=1): 9 - 4 = 5 (C=1 no borrow, Z=0, N=0); 5 - 5 = 0 (Z=1, C=1)
    expect(runOp(9, 4, 1)).toEqual({ res: 5, z: false, c: true, n: false });
    expect(runOp(5, 5, 1)).toEqual({ res: 0, z: true, c: true, n: false });
    expect(runOp(3, 5, 1)).toEqual({ res: 14, z: false, c: false, n: true }); // -2 in 4-bit 2's comp = 14

    // AND (op=2): 0b1100 & 0b1010 = 0b1000 (8, N=1)
    expect(runOp(0b1100, 0b1010, 2).res).toBe(0b1000);
    expect(runOp(0b0101, 0b1010, 2).z).toBe(true);

    // XOR (op=3): 0b1100 ^ 0b1010 = 0b0110 (6)
    expect(runOp(0b1100, 0b1010, 3).res).toBe(0b0110);
    expect(runOp(0b1111, 0b1111, 3).z).toBe(true);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('23. [UZMAN] 23-4x4-sram-memory-bank.json (484T): writes 4 distinct 4-bit words and reads them back nondestructively', () => {
    const { doc } = loadProjectFromDisk('23-4x4-sram-memory-bank.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(484);

    const setAddr = (addr: number) => {
      sim.setToggleState('sw_addr0', Boolean(addr & 1));
      sim.setToggleState('sw_addr1', Boolean(addr & 2));
    };
    const setData = (val: number) => {
      for (let i = 0; i < 4; i++) sim.setToggleState(`sw_d${i}`, Boolean((val >> i) & 1));
    };
    const readWord = () => {
      let out = 0;
      for (let i = 0; i < 4; i++) {
        if (sim.getPinValue(`led_q${i}`, 'IN') === LogicValue.HIGH) out |= 1 << i;
      }
      return out;
    };

    const wordsToStore = [0b1011, 0b0110, 0b1101, 0b0011];
    for (let addr = 0; addr < 4; addr++) {
      sim.setToggleState('sw_we', false);
      setAddr(addr);
      setData(wordsToStore[addr]);
      sim.setToggleState('sw_we', true);
      expect(readWord()).toBe(wordsToStore[addr]);
      sim.setToggleState('sw_we', false);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }

    // Change data inputs while WE=0 and verify all 4 stored words remain intact
    setData(0b1111);
    for (const addr of [2, 0, 3, 1]) {
      setAddr(addr);
      expect(readWord()).toBe(wordsToStore[addr]);
      expect(sim.getPinValue(`led_w${addr}`, 'IN')).toBe(LogicValue.HIGH);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('24. [UZMAN] 24-4bit-array-multiplier.json (456T): exhaustively verifies all 256 (0..15 x 0..15) products', () => {
    const { doc } = loadProjectFromDisk('24-4bit-array-multiplier.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(456);

    for (let a = 0; a < 16; a++) {
      for (let i = 0; i < 4; i++) sim.setToggleState(`sw_a${i}`, Boolean((a >> i) & 1));
      for (let b = 0; b < 16; b++) {
        for (let i = 0; i < 4; i++) sim.setToggleState(`sw_b${i}`, Boolean((b >> i) & 1));
        const expected = a * b;
        let actual = 0;
        for (let bit = 0; bit < 8; bit++) {
          if (sim.getPinValue(`led_p${bit}`, 'IN') === LogicValue.HIGH) actual |= 1 << bit;
        }
        expect(actual).toBe(expected);
        expect(sim.getSnapshot().hasShortCircuit).toBe(false);
      }
    }
  });

  it('25. [UZMAN] 25-8x8-gpu-pixel-rasterizer.json (1292T): verifies single-pixel cursor and crosshair modes across 64 pins', () => {
    const { doc } = loadProjectFromDisk('25-8x8-gpu-pixel-rasterizer.json');
    const sim = new Simulator(doc);
    expect(sim.getSnapshot().transistorCount).toBe(1292);

    const setCoord = (x: number, y: number, crosshair: boolean) => {
      sim.setToggleState('sw_x0', Boolean(x & 1));
      sim.setToggleState('sw_x1', Boolean(x & 2));
      sim.setToggleState('sw_x2', Boolean(x & 4));
      sim.setToggleState('sw_y0', Boolean(y & 1));
      sim.setToggleState('sw_y1', Boolean(y & 2));
      sim.setToggleState('sw_y2', Boolean(y & 4));
      sim.setToggleState('sw_mode', crosshair);
    };

    // Single-pixel mode (M=0) at (3, 5)
    setCoord(3, 5, false);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const exp = r === 5 && c === 3 ? LogicValue.HIGH : LogicValue.LOW;
        expect(sim.getPinValue('gpu_mat', `P_${r}_${c}`)).toBe(exp);
      }
    }

    // Crosshair mode (M=1) at (6, 2) -> Row 2 and Col 6 lit (15 pixels), rest LOW
    setCoord(6, 2, true);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    let litCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const on = r === 2 || c === 6;
        if (on) litCount++;
        expect(sim.getPinValue('gpu_mat', `P_${r}_${c}`)).toBe(on ? LogicValue.HIGH : LogicValue.LOW);
      }
    }
    expect(litCount).toBe(15);
  });
});
