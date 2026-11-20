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

  it('defines all 10 manifest entries and 5 categories matching the exact disk JSON files', () => {
    expect(EXAMPLE_PROJECT_CATEGORIES).toEqual([
      'Temel Mantık Kapıları',
      'Saat & Osilatörler',
      'Bellek & Sıralı Devreler',
      'Aritmetik & Çoklayıcı',
      'Ekran & Çıkış',
    ]);
    expect(EXAMPLE_PROJECTS).toHaveLength(10);

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
});
