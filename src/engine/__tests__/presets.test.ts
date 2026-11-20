import { describe, expect, it } from 'vitest';
import { isHigh, isLow, LogicValue } from '../../types/circuit';
import {
  createDefaultDocument,
  DEFAULT_PRESET,
  getPresetById,
  PRESETS,
  pureSiliconPreset,
} from '../../presets';
import {
  parseAndValidateCircuitDocument,
  serializeCircuitDocument,
  VALID_COMPONENT_TYPES,
} from '../../store/circuitStore';
import { getComponentPins } from '../componentDefs';
import { Simulator } from '../simulator';

describe('PureSilicon Startup Scene (3T Ring Oscillator & 4T CMOS NAND Gate)', () => {
  it('contains ONLY the 10 physical component types, snaps every component/waypoint to 20px grid, and round-trips JSON cleanly', () => {
    expect(PRESETS).toHaveLength(1);
    expect(DEFAULT_PRESET).toBe(pureSiliconPreset);
    expect(getPresetById('puresilicon-startup')).toBe(pureSiliconPreset);

    const doc = createDefaultDocument();
    expect(doc.components.length).toBe(19);

    for (const comp of doc.components) {
      expect(VALID_COMPONENT_TYPES.has(comp.type)).toBe(true);
      expect(Math.abs(comp.x % 20)).toBe(0);
      expect(Math.abs(comp.y % 20)).toBe(0);

      const pins = getComponentPins(comp);
      for (const pin of pins) {
        expect(Math.abs((comp.x + pin.offsetX) % 20)).toBe(0);
        expect(Math.abs((comp.y + pin.offsetY) % 20)).toBe(0);
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

    // Round-trip through JSON serializer and runtime validator
    const json = serializeCircuitDocument(doc);
    const parsed = parseAndValidateCircuitDocument(json);
    expect(parsed.ok).toBe(true);
  });

  it('oscillates the 3-Transistor Ring Oscillator automatically across ticks and toggles led_osc between LOW and HIGH', () => {
    const sim = new Simulator(pureSiliconPreset.document);
    const snap0 = sim.getSnapshot();

    // Total transistors in startup scene: 3 NMOS (Ring Oscillator) + 2 PMOS + 2 NMOS (CMOS NAND) = 7 transistors
    expect(snap0.transistorCount).toBe(7);
    expect(snap0.transistors.count).toBe(7);
    expect(snap0.hasShortCircuit).toBe(false);

    let sawHigh = false;
    let sawLow = false;
    let toggleCount = 0;
    let prevHigh = isHigh(sim.getPinValue('led_osc', 'IN'));

    const trace: number[] = [];
    for (let tick = 0; tick < 18; tick++) {
      sim.stepHalfCycle();
      const val = sim.getPinValue('led_osc', 'IN');
      const curHigh = isHigh(val);
      const curLow = isLow(val);
      expect(curHigh || curLow).toBe(true);

      trace.push(curHigh ? 1 : 0);
      if (curHigh) sawHigh = true;
      if (curLow) sawLow = true;
      if (curHigh !== prevHigh) {
        toggleCount++;
        prevHigh = curHigh;
      }
    }

    // Over 18 ticks (3 full oscillation periods of 6 ticks), led_osc must toggle 6 times (9 ticks HIGH, 9 ticks LOW)
    expect(sawHigh).toBe(true);
    expect(sawLow).toBe(true);
    expect(toggleCount).toBeGreaterThanOrEqual(5);
    expect(trace.filter((b) => b === 1).length).toBe(9);
    expect(trace.filter((b) => b === 0).length).toBe(9);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });

  it('verifies the 4-Transistor Pure CMOS NAND Gate truth table (00->1, 01->1, 10->1, 11->0) in the startup scene', () => {
    const sim = new Simulator(pureSiliconPreset.document);

    const cases: Array<[boolean, boolean, LogicValue]> = [
      [false, false, LogicValue.HIGH],
      [false, true, LogicValue.HIGH],
      [true, false, LogicValue.HIGH],
      [true, true, LogicValue.LOW],
    ];

    for (const [a, b, expected] of cases) {
      sim.setToggleState('sw_nand_a', a);
      sim.setToggleState('sw_nand_b', b);

      expect(sim.getPinValue('led_nand', 'IN')).toBe(expected);
      expect(sim.getTransistorState('pmos_a')).toBe(a ? 0 : 1);
      expect(sim.getTransistorState('pmos_b')).toBe(b ? 0 : 1);
      expect(sim.getTransistorState('nmos_a')).toBe(a ? 1 : 0);
      expect(sim.getTransistorState('nmos_b')).toBe(b ? 1 : 0);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });
});
