import { describe, expect, it } from 'vitest';
import {
  isError,
  isHigh,
  isLow,
  isStrong,
  LogicValue,
  logicValueLabel,
  type CircuitComponent,
  type CircuitDocument,
  type ComponentType,
  type Wire,
} from '../../types/circuit';
import {
  getComponentDimensions,
  getComponentPins,
  getPixelMatrixSize,
  PALETTE_CATALOG,
  PALETTE_CATEGORIES,
} from '../componentDefs';
import { compileCircuit } from '../compiler';
import {
  generateSiliconBenchmarkChip,
  SILICON_BENCHMARK_PRESETS,
} from '../chipGenerator';
import {
  GpuNodeVoltage,
  GpuParallelSolver,
  WGSL_TWO_PASS_SOLVER_SHADER,
} from '../gpuSolver';
import { Simulator } from '../simulator';
import { WorkerSimulatorClient } from '../workerClient';
import {
  circuitReducer,
  createInitialCircuitStoreState,
  MAX_HISTORY,
  parseAndValidateCircuitDocument,
  serializeCircuitDocument,
  VALID_COMPONENT_TYPES,
} from '../../store/circuitStore';

function makeDoc(
  components: CircuitComponent[],
  wires: Wire[],
  name = 'PureSilicon Test Circuit',
): CircuitDocument {
  return {
    version: 1,
    name,
    components,
    wires,
  };
}

describe('PureSilicon Physical Component Catalog & Zero-Abstraction Enforcement', () => {
  const EXPECTED_TYPES: ComponentType[] = [
    'NMOS',
    'PMOS',
    'PULL_UP',
    'PULL_DOWN',
    'VCC',
    'GND',
    'TOGGLE_SWITCH',
    'PUSH_BUTTON',
    'LED',
    'PIXEL_MATRIX',
  ];

  it('exposes strictly the 10 physical component types and rejects all black-box/clock/gate types', () => {
    expect(PALETTE_CATEGORIES).toEqual([
      'Silikon & Transistör',
      'Direnç & Güç',
      'Fiziksel Girdi / Çıktı',
    ]);

    const catalogTypes = PALETTE_CATALOG.map((item) => item.type);
    expect(catalogTypes).toEqual(EXPECTED_TYPES);
    expect(Array.from(VALID_COMPONENT_TYPES)).toEqual(EXPECTED_TYPES);

    // Every physical component must have dimensions multiple of 40 and pins aligned to 20px grid
    for (const type of EXPECTED_TYPES) {
      const comp: CircuitComponent = {
        id: `test_${type}`,
        type,
        x: 200,
        y: 200,
        rotation: 0,
        props: {},
      };
      const dims = getComponentDimensions(comp);
      expect(dims.width % 40).toBe(0);
      expect(dims.height % 40).toBe(0);

      const pins = getComponentPins(comp);
      expect(pins.length).toBeGreaterThan(0);
      for (const pin of pins) {
        expect(Math.abs(pin.offsetX % 20)).toBe(0);
        expect(Math.abs(pin.offsetY % 20)).toBe(0);
      }
    }

    // Forbidden legacy / black-box types must be rejected by runtime JSON schema validation
    const forbiddenTypes = [
      'CLOCK',
      'SUBCIRCUIT',
      'IC_INPUT',
      'IC_OUTPUT',
      'LCD_MATRIX',
      'KEYBOARD',
      'SEVEN_SEG',
      'NAND',
      'NOR',
      'AND',
      'OR',
      'XOR',
      'NOT',
      'D_FF',
    ];

    for (const forbidden of forbiddenTypes) {
      expect(VALID_COMPONENT_TYPES.has(forbidden as ComponentType)).toBe(false);
      const invalidJson = JSON.stringify({
        version: 1,
        name: 'Forbidden Test',
        components: [
          { id: 'bad1', type: forbidden, x: 0, y: 0, rotation: 0, props: {} },
        ],
        wires: [],
      });
      const res = parseAndValidateCircuitDocument(invalidJson);
      expect(res.ok).toBe(false);
    }
  });

  it('validates LogicValue lattice helpers', () => {
    expect(isHigh(LogicValue.HIGH)).toBe(true);
    expect(isHigh(LogicValue.WEAK_HIGH)).toBe(true);
    expect(isHigh(LogicValue.LOW)).toBe(false);
    expect(isLow(LogicValue.LOW)).toBe(true);
    expect(isLow(LogicValue.WEAK_LOW)).toBe(true);
    expect(isLow(LogicValue.HIGH)).toBe(false);
    expect(isStrong(LogicValue.HIGH)).toBe(true);
    expect(isStrong(LogicValue.LOW)).toBe(true);
    expect(isStrong(LogicValue.WEAK_HIGH)).toBe(false);
    expect(isError(LogicValue.ERR)).toBe(true);
    expect(logicValueLabel(LogicValue.HIGH)).toContain('HIGH');
  });
});

describe('Simulator & Compiler — Data-Oriented Design (SoA) & MOS Physics', () => {
  it('populates Structure-of-Arrays (TransistorSoA) typed arrays and updates transistor state accurately', () => {
    const doc = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 0, y: 200, rotation: 0, props: {} },
        { id: 'sw', type: 'TOGGLE_SWITCH', x: -100, y: 100, rotation: 0, props: { state: false } },
        { id: 'pmos', type: 'PMOS', x: 0, y: 60, rotation: 0, props: {} },
        { id: 'nmos', type: 'NMOS', x: 0, y: 140, rotation: 0, props: {} },
        { id: 'led', type: 'LED', x: 100, y: 100, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'pmos', pinId: 'S' } },
        { id: 'w2', from: { componentId: 'gnd', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'S' } },
        { id: 'w3', from: { componentId: 'pmos', pinId: 'D' }, to: { componentId: 'nmos', pinId: 'D' } },
        { id: 'w4', from: { componentId: 'nmos', pinId: 'D' }, to: { componentId: 'led', pinId: 'IN' } },
        { id: 'w5', from: { componentId: 'sw', pinId: 'OUT' }, to: { componentId: 'pmos', pinId: 'G' } },
        { id: 'w6', from: { componentId: 'sw', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'G' } },
      ],
    );

    const sim = new Simulator(doc);
    const snap = sim.getSnapshot();
    const { transistors, pinToNet } = snap;

    expect(transistors.count).toBe(2);
    expect(transistors.gateNode).toBeInstanceOf(Int32Array);
    expect(transistors.drainNode).toBeInstanceOf(Int32Array);
    expect(transistors.sourceNode).toBeInstanceOf(Int32Array);
    expect(transistors.type).toBeInstanceOf(Uint8Array);
    expect(transistors.state).toBeInstanceOf(Uint8Array);

    expect(transistors.gateNode.length).toBe(2);
    expect(transistors.drainNode.length).toBe(2);
    expect(transistors.sourceNode.length).toBe(2);
    expect(transistors.type.length).toBe(2);
    expect(transistors.state.length).toBe(2);

    // Index 0 = pmos (type 1), Index 1 = nmos (type 0)
    expect(transistors.type[0]).toBe(1);
    expect(transistors.type[1]).toBe(0);
    expect(transistors.gateNode[0]).toBe(pinToNet.get('sw:OUT'));
    expect(transistors.gateNode[1]).toBe(pinToNet.get('sw:OUT'));
    expect(transistors.sourceNode[0]).toBe(pinToNet.get('vcc:OUT'));
    expect(transistors.sourceNode[1]).toBe(pinToNet.get('gnd:OUT'));
    expect(transistors.drainNode[0]).toBe(pinToNet.get('led:IN'));
    expect(transistors.drainNode[1]).toBe(pinToNet.get('led:IN'));

    // When sw = LOW (0): PMOS conducts (state=1), NMOS is open (state=0), LED = HIGH
    expect(transistors.state[0]).toBe(1);
    expect(transistors.state[1]).toBe(0);
    expect(sim.getTransistorState('pmos')).toBe(1);
    expect(sim.getTransistorState('nmos')).toBe(0);
    expect(sim.getPinValue('led', 'IN')).toBe(LogicValue.HIGH);

    // When sw = HIGH (1): PMOS is open (state=0), NMOS conducts (state=1), LED = LOW
    sim.setToggleState('sw', true);
    expect(transistors.state[0]).toBe(0);
    expect(transistors.state[1]).toBe(1);
    expect(sim.getTransistorState('pmos')).toBe(0);
    expect(sim.getTransistorState('nmos')).toBe(1);
    expect(sim.getPinValue('led', 'IN')).toBe(LogicValue.LOW);
  });

  it('evaluates NMOS & PMOS switch behavior including floating Z gates and weak PULL_UP/PULL_DOWN gates', () => {
    const doc = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 200, y: 0, rotation: 0, props: {} },
        { id: 'sw_n', type: 'TOGGLE_SWITCH', x: -80, y: 60, rotation: 0, props: { state: false } },
        { id: 'nmos', type: 'NMOS', x: 0, y: 60, rotation: 0, props: {} },
        { id: 'led_n', type: 'LED', x: 60, y: 100, rotation: 0, props: {} },
        { id: 'pmos_z', type: 'PMOS', x: 100, y: 60, rotation: 0, props: {} },
        { id: 'led_pz', type: 'LED', x: 140, y: 100, rotation: 0, props: {} },
        { id: 'sw_p', type: 'TOGGLE_SWITCH', x: 180, y: 60, rotation: 0, props: { state: true } },
        { id: 'pmos_sw', type: 'PMOS', x: 260, y: 60, rotation: 0, props: {} },
        { id: 'led_p', type: 'LED', x: 300, y: 100, rotation: 0, props: {} },
        { id: 'nmos_z', type: 'NMOS', x: 360, y: 60, rotation: 0, props: {} },
        { id: 'led_nz', type: 'LED', x: 400, y: 100, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'sw_n', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'G' } },
        { id: 'w3', from: { componentId: 'nmos', pinId: 'S' }, to: { componentId: 'led_n', pinId: 'IN' } },
        { id: 'w4', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'pmos_z', pinId: 'S' } },
        { id: 'w5', from: { componentId: 'pmos_z', pinId: 'D' }, to: { componentId: 'led_pz', pinId: 'IN' } },
        { id: 'w6', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'pmos_sw', pinId: 'S' } },
        { id: 'w7', from: { componentId: 'sw_p', pinId: 'OUT' }, to: { componentId: 'pmos_sw', pinId: 'G' } },
        { id: 'w8', from: { componentId: 'pmos_sw', pinId: 'D' }, to: { componentId: 'led_p', pinId: 'IN' } },
        { id: 'w9', from: { componentId: 'gnd', pinId: 'OUT' }, to: { componentId: 'nmos_z', pinId: 'S' } },
        { id: 'w10', from: { componentId: 'nmos_z', pinId: 'D' }, to: { componentId: 'led_nz', pinId: 'IN' } },
      ],
    );

    const sim = new Simulator(doc);
    expect(sim.getPinValue('led_pz', 'IN')).toBe(LogicValue.Z);
    expect(sim.getPinValue('led_nz', 'IN')).toBe(LogicValue.Z);
    expect(sim.getPinValue('led_n', 'IN')).toBe(LogicValue.Z);
    expect(sim.getPinValue('led_p', 'IN')).toBe(LogicValue.Z);

    sim.setToggleState('sw_n', true);
    sim.setToggleState('sw_p', false);
    expect(sim.getPinValue('led_n', 'IN')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('led_p', 'IN')).toBe(LogicValue.HIGH);

    // Weak gates also control MOSFETs
    const weakDoc = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'pu', type: 'PULL_UP', x: -40, y: 40, rotation: 0, props: {} },
        { id: 'pd', type: 'PULL_DOWN', x: 40, y: 40, rotation: 0, props: {} },
        { id: 'nmos', type: 'NMOS', x: 0, y: 100, rotation: 0, props: {} },
        { id: 'pmos', type: 'PMOS', x: 100, y: 100, rotation: 0, props: {} },
        { id: 'led_n', type: 'LED', x: 0, y: 160, rotation: 0, props: {} },
        { id: 'led_p', type: 'LED', x: 100, y: 160, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'pu', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'G' } },
        { id: 'w3', from: { componentId: 'nmos', pinId: 'S' }, to: { componentId: 'led_n', pinId: 'IN' } },
        { id: 'w4', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'pmos', pinId: 'S' } },
        { id: 'w5', from: { componentId: 'pd', pinId: 'OUT' }, to: { componentId: 'pmos', pinId: 'G' } },
        { id: 'w6', from: { componentId: 'pmos', pinId: 'D' }, to: { componentId: 'led_p', pinId: 'IN' } },
      ],
    );
    const weakSim = new Simulator(weakDoc);
    expect(weakSim.getPinValue('led_n', 'IN')).toBe(LogicValue.HIGH);
    expect(weakSim.getPinValue('led_p', 'IN')).toBe(LogicValue.HIGH);
  });

  it('verifies 4-Transistor CMOS NAND truth table (00->1, 01->1, 10->1, 11->0) purely via PMOS/NMOS conduction', () => {
    const doc = makeDoc(
      [
        { id: 'sw_a', type: 'TOGGLE_SWITCH', x: 0, y: 0, rotation: 0, props: { state: false } },
        { id: 'sw_b', type: 'TOGGLE_SWITCH', x: 0, y: 80, rotation: 0, props: { state: false } },
        { id: 'vcc', type: 'VCC', x: 160, y: -120, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 160, y: 160, rotation: 0, props: {} },
        { id: 'p1', type: 'PMOS', x: 120, y: -40, rotation: 0, props: {} },
        { id: 'p2', type: 'PMOS', x: 200, y: -40, rotation: 0, props: {} },
        { id: 'n1', type: 'NMOS', x: 160, y: 40, rotation: 0, props: {} },
        { id: 'n2', type: 'NMOS', x: 160, y: 100, rotation: 0, props: {} },
        { id: 'led', type: 'LED', x: 280, y: 20, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p1', pinId: 'S' } },
        { id: 'w2', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p2', pinId: 'S' } },
        { id: 'w3', from: { componentId: 'p1', pinId: 'D' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w4', from: { componentId: 'p2', pinId: 'D' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w5', from: { componentId: 'n1', pinId: 'S' }, to: { componentId: 'n2', pinId: 'D' } },
        { id: 'w6', from: { componentId: 'n2', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } },
        { id: 'w7', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'led', pinId: 'IN' } },
        { id: 'w8', from: { componentId: 'sw_a', pinId: 'OUT' }, to: { componentId: 'p1', pinId: 'G' } },
        { id: 'w9', from: { componentId: 'sw_a', pinId: 'OUT' }, to: { componentId: 'n1', pinId: 'G' } },
        { id: 'w10', from: { componentId: 'sw_b', pinId: 'OUT' }, to: { componentId: 'p2', pinId: 'G' } },
        { id: 'w11', from: { componentId: 'sw_b', pinId: 'OUT' }, to: { componentId: 'n2', pinId: 'G' } },
      ],
    );

    const sim = new Simulator(doc);
    const snap0 = sim.getSnapshot();
    expect(snap0.transistorCount).toBe(4);
    expect(snap0.islandCount).toBe(1);
    expect(snap0.hasShortCircuit).toBe(false);

    const cases: Array<[boolean, boolean, LogicValue, [number, number, number, number]]> = [
      // [A, B, Y, [p1, p2, n1, n2]]
      [false, false, LogicValue.HIGH, [1, 1, 0, 0]],
      [false, true, LogicValue.HIGH, [1, 0, 0, 1]],
      [true, false, LogicValue.HIGH, [0, 1, 1, 0]],
      [true, true, LogicValue.LOW, [0, 0, 1, 1]],
    ];

    for (const [a, b, expected, txStates] of cases) {
      sim.setToggleState('sw_a', a);
      sim.setToggleState('sw_b', b);
      expect(sim.getPinValue('led', 'IN')).toBe(expected);
      expect(sim.getTransistorState('p1')).toBe(txStates[0]);
      expect(sim.getTransistorState('p2')).toBe(txStates[1]);
      expect(sim.getTransistorState('n1')).toBe(txStates[2]);
      expect(sim.getTransistorState('n2')).toBe(txStates[3]);
      expect(sim.getSnapshot().hasShortCircuit).toBe(false);
    }
  });

  it('oscillates 3-Transistor NMOS Ring Oscillator and 5-Stage CMOS Ring Oscillator automatically across ticks', () => {
    // 1. 3-Transistor NMOS + PULL_UP Ring Oscillator
    const ring3Doc = makeDoc(
      [
        { id: 'pu1', type: 'PULL_UP', x: 100, y: 100, rotation: 0, props: {} },
        { id: 'n1', type: 'NMOS', x: 100, y: 180, rotation: 0, props: {} },
        { id: 'g1', type: 'GND', x: 100, y: 260, rotation: 0, props: {} },

        { id: 'pu2', type: 'PULL_UP', x: 220, y: 100, rotation: 0, props: {} },
        { id: 'n2', type: 'NMOS', x: 220, y: 180, rotation: 0, props: {} },
        { id: 'g2', type: 'GND', x: 220, y: 260, rotation: 0, props: {} },

        { id: 'pu3', type: 'PULL_UP', x: 340, y: 100, rotation: 0, props: {} },
        { id: 'n3', type: 'NMOS', x: 340, y: 180, rotation: 0, props: {} },
        { id: 'g3', type: 'GND', x: 340, y: 260, rotation: 0, props: {} },

        { id: 'led_osc', type: 'LED', x: 440, y: 160, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'pu1', pinId: 'OUT' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'n1', pinId: 'S' }, to: { componentId: 'g1', pinId: 'OUT' } },
        { id: 'w3', from: { componentId: 'pu2', pinId: 'OUT' }, to: { componentId: 'n2', pinId: 'D' } },
        { id: 'w4', from: { componentId: 'n2', pinId: 'S' }, to: { componentId: 'g2', pinId: 'OUT' } },
        { id: 'w5', from: { componentId: 'pu3', pinId: 'OUT' }, to: { componentId: 'n3', pinId: 'D' } },
        { id: 'w6', from: { componentId: 'n3', pinId: 'S' }, to: { componentId: 'g3', pinId: 'OUT' } },
        { id: 'w12', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'n2', pinId: 'G' } },
        { id: 'w23', from: { componentId: 'n2', pinId: 'D' }, to: { componentId: 'n3', pinId: 'G' } },
        { id: 'w31', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'n1', pinId: 'G' } },
        { id: 'w_led', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'led_osc', pinId: 'IN' } },
      ],
    );

    const sim3 = new Simulator(ring3Doc);
    let highTicks = 0;
    let lowTicks = 0;
    let transitions = 0;
    let prevIsHigh = isHigh(sim3.getPinValue('led_osc', 'IN'));

    for (let t = 0; t < 24; t++) {
      sim3.stepHalfCycle();
      const curIsHigh = isHigh(sim3.getPinValue('led_osc', 'IN'));
      if (curIsHigh) {
        highTicks++;
      } else {
        lowTicks++;
      }
      if (curIsHigh !== prevIsHigh) {
        transitions++;
        prevIsHigh = curIsHigh;
      }
    }

    // Period of 3-stage ring oscillator is 6 ticks (3 HIGH, 3 LOW), so in 24 ticks -> 12 HIGH, 12 LOW, 8 transitions
    expect(highTicks).toBe(12);
    expect(lowTicks).toBe(12);
    expect(transitions).toBeGreaterThanOrEqual(7);
    expect(sim3.getSnapshot().hasShortCircuit).toBe(false);

    // 2. 3-Stage Pure CMOS (6-Transistor) Ring Oscillator (starts with floating Z loop and self-kickstarts!)
    const cmosRingDoc = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 0, y: 200, rotation: 0, props: {} },
        { id: 'p1', type: 'PMOS', x: 100, y: 60, rotation: 0, props: {} },
        { id: 'n1', type: 'NMOS', x: 100, y: 140, rotation: 0, props: {} },
        { id: 'p2', type: 'PMOS', x: 200, y: 60, rotation: 0, props: {} },
        { id: 'n2', type: 'NMOS', x: 200, y: 140, rotation: 0, props: {} },
        { id: 'p3', type: 'PMOS', x: 300, y: 60, rotation: 0, props: {} },
        { id: 'n3', type: 'NMOS', x: 300, y: 140, rotation: 0, props: {} },
        { id: 'led', type: 'LED', x: 400, y: 100, rotation: 0, props: {} },
      ],
      [
        { id: 'v1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p1', pinId: 'S' } },
        { id: 'v2', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p2', pinId: 'S' } },
        { id: 'v3', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p3', pinId: 'S' } },
        { id: 'g1', from: { componentId: 'gnd', pinId: 'OUT' }, to: { componentId: 'n1', pinId: 'S' } },
        { id: 'g2', from: { componentId: 'gnd', pinId: 'OUT' }, to: { componentId: 'n2', pinId: 'S' } },
        { id: 'g3', from: { componentId: 'gnd', pinId: 'OUT' }, to: { componentId: 'n3', pinId: 'S' } },
        { id: 'd1', from: { componentId: 'p1', pinId: 'D' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'd2', from: { componentId: 'p2', pinId: 'D' }, to: { componentId: 'n2', pinId: 'D' } },
        { id: 'd3', from: { componentId: 'p3', pinId: 'D' }, to: { componentId: 'n3', pinId: 'D' } },
        { id: 'c12p', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'p2', pinId: 'G' } },
        { id: 'c12n', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'n2', pinId: 'G' } },
        { id: 'c23p', from: { componentId: 'n2', pinId: 'D' }, to: { componentId: 'p3', pinId: 'G' } },
        { id: 'c23n', from: { componentId: 'n2', pinId: 'D' }, to: { componentId: 'n3', pinId: 'G' } },
        { id: 'c31p', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'p1', pinId: 'G' } },
        { id: 'c31n', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'n1', pinId: 'G' } },
        { id: 'wl', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'led', pinId: 'IN' } },
      ],
    );

    const cmosSim = new Simulator(cmosRingDoc);
    let cmosHigh = 0;
    let cmosLow = 0;
    for (let t = 0; t < 18; t++) {
      cmosSim.stepHalfCycle();
      const val = cmosSim.getPinValue('led', 'IN');
      if (val === LogicValue.HIGH) cmosHigh++;
      if (val === LogicValue.LOW) cmosLow++;
    }
    expect(cmosHigh).toBe(9);
    expect(cmosLow).toBe(9);

    // 3. 3-Transistor NMOS Ring Oscillator with SHARED GND component (all 3 NMOS in same island!)
    const sharedGndRingDoc = makeDoc(
      [
        { id: 'gnd_shared', type: 'GND', x: 220, y: 260, rotation: 0, props: {} },
        { id: 'pu1', type: 'PULL_UP', x: 100, y: 100, rotation: 0, props: {} },
        { id: 'n1', type: 'NMOS', x: 100, y: 180, rotation: 0, props: {} },
        { id: 'pu2', type: 'PULL_UP', x: 220, y: 100, rotation: 0, props: {} },
        { id: 'n2', type: 'NMOS', x: 220, y: 180, rotation: 0, props: {} },
        { id: 'pu3', type: 'PULL_UP', x: 340, y: 100, rotation: 0, props: {} },
        { id: 'n3', type: 'NMOS', x: 340, y: 180, rotation: 0, props: {} },
        { id: 'led_shared', type: 'LED', x: 440, y: 160, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'pu1', pinId: 'OUT' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'n1', pinId: 'S' }, to: { componentId: 'gnd_shared', pinId: 'OUT' } },
        { id: 'w3', from: { componentId: 'pu2', pinId: 'OUT' }, to: { componentId: 'n2', pinId: 'D' } },
        { id: 'w4', from: { componentId: 'n2', pinId: 'S' }, to: { componentId: 'gnd_shared', pinId: 'OUT' } },
        { id: 'w5', from: { componentId: 'pu3', pinId: 'OUT' }, to: { componentId: 'n3', pinId: 'D' } },
        { id: 'w6', from: { componentId: 'n3', pinId: 'S' }, to: { componentId: 'gnd_shared', pinId: 'OUT' } },
        { id: 'w12', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'n2', pinId: 'G' } },
        { id: 'w23', from: { componentId: 'n2', pinId: 'D' }, to: { componentId: 'n3', pinId: 'G' } },
        { id: 'w31', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'n1', pinId: 'G' } },
        { id: 'w_led', from: { componentId: 'n3', pinId: 'D' }, to: { componentId: 'led_shared', pinId: 'IN' } },
      ],
    );

    const sharedSim = new Simulator(sharedGndRingDoc);
    let sharedHigh = 0;
    let sharedLow = 0;
    for (let t = 0; t < 18; t++) {
      sharedSim.stepHalfCycle();
      const val = sharedSim.getPinValue('led_shared', 'IN');
      if (isHigh(val)) sharedHigh++;
      if (isLow(val)) sharedLow++;
    }
    expect(sharedHigh).toBe(9);
    expect(sharedLow).toBe(9);
  });

  it('lights up raw PIXEL_MATRIX (4x4 = 16 pins and 8x8 = 64 pins) individual pixels directly via transistor pins without a clock or driver', () => {
    const mat4Comp: CircuitComponent = {
      id: 'mat4',
      type: 'PIXEL_MATRIX',
      x: 400,
      y: 200,
      rotation: 0,
      props: { matrixSize: 4 },
    };
    const mat8Comp: CircuitComponent = {
      id: 'mat8',
      type: 'PIXEL_MATRIX',
      x: 900,
      y: 200,
      rotation: 0,
      props: { matrixSize: 8 },
    };

    expect(getPixelMatrixSize(mat4Comp)).toBe(4);
    expect(getPixelMatrixSize(mat8Comp)).toBe(8);
    expect(getComponentPins(mat4Comp)).toHaveLength(16);
    expect(getComponentPins(mat8Comp)).toHaveLength(64);

    // Wire a switch + NMOS + PULL_UP inverter directly to P_0_0 and a switch directly to P_2_3 on mat4, and P_7_7 on mat8
    const doc = makeDoc(
      [
        mat4Comp,
        mat8Comp,
        { id: 'vcc', type: 'VCC', x: 100, y: 60, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 100, y: 260, rotation: 0, props: {} },
        { id: 'pu', type: 'PULL_UP', x: 100, y: 120, rotation: 0, props: {} },
        { id: 'nmos', type: 'NMOS', x: 100, y: 180, rotation: 0, props: {} },
        { id: 'sw_inv', type: 'TOGGLE_SWITCH', x: 0, y: 180, rotation: 0, props: { state: false } },
        { id: 'btn_px', type: 'PUSH_BUTTON', x: 0, y: 240, rotation: 0, props: { state: false } },
      ],
      [
        { id: 'w1', from: { componentId: 'pu', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'nmos', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } },
        { id: 'w3', from: { componentId: 'sw_inv', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'G' } },
        // Connect NMOS Drain directly to pixel (x=0, y=0) of 4x4 matrix
        { id: 'w4', from: { componentId: 'nmos', pinId: 'D' }, to: { componentId: 'mat4', pinId: 'P_0_0' } },
        // Connect push button directly to pixel (x=3, y=2) of 4x4 matrix and (x=7, y=7) of 8x8 matrix
        { id: 'w5', from: { componentId: 'btn_px', pinId: 'OUT' }, to: { componentId: 'mat4', pinId: 'P_2_3' } },
        { id: 'w6', from: { componentId: 'btn_px', pinId: 'OUT' }, to: { componentId: 'mat8', pinId: 'P_7_7' } },
      ],
    );

    const sim = new Simulator(doc);
    // Initial: sw_inv=false -> NMOS off -> P_0_0 pulled WEAK_HIGH (lit!), P_2_3 = LOW, P_1_1 = Z
    expect(isHigh(sim.getPinValue('mat4', 'P_0_0'))).toBe(true);
    expect(isHigh(sim.getPinValue('mat4', 'P_2_3'))).toBe(false);
    expect(sim.getPinValue('mat4', 'P_1_1')).toBe(LogicValue.Z);
    expect(isHigh(sim.getPinValue('mat8', 'P_7_7'))).toBe(false);

    // Toggle sw_inv=true -> NMOS conducts to GND -> P_0_0 becomes LOW (dark) immediately without any clock!
    sim.setToggleState('sw_inv', true);
    expect(sim.getPinValue('mat4', 'P_0_0')).toBe(LogicValue.LOW);

    // Press push button -> P_2_3 on mat4 and P_7_7 on mat8 light up HIGH immediately!
    sim.setPushButtonState('btn_px', true);
    expect(sim.getPinValue('mat4', 'P_2_3')).toBe(LogicValue.HIGH);
    expect(sim.getPinValue('mat8', 'P_7_7')).toBe(LogicValue.HIGH);

    sim.setPushButtonState('btn_px', false);
    expect(sim.getPinValue('mat4', 'P_2_3')).toBe(LogicValue.LOW);
    expect(sim.getPinValue('mat8', 'P_7_7')).toBe(LogicValue.LOW);
  });

  it('detects direct rail short circuits and active transistor rail bridges as ERR', () => {
    const directShort = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 0, y: 80, rotation: 0, props: {} },
      ],
      [{ id: 'w_short', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'gnd', pinId: 'OUT' } }],
    );

    const sim1 = new Simulator(directShort);
    expect(sim1.getPinValue('vcc', 'OUT')).toBe(LogicValue.ERR);
    expect(sim1.getWireValue('w_short')).toBe(LogicValue.ERR);
    expect(sim1.getSnapshot().hasShortCircuit).toBe(true);

    const txShort = makeDoc(
      [
        { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 0, y: 120, rotation: 0, props: {} },
        { id: 'sw', type: 'TOGGLE_SWITCH', x: -80, y: 60, rotation: 0, props: { state: false } },
        { id: 'nmos', type: 'NMOS', x: 0, y: 60, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'D' } },
        { id: 'w2', from: { componentId: 'nmos', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } },
        { id: 'w3', from: { componentId: 'sw', pinId: 'OUT' }, to: { componentId: 'nmos', pinId: 'G' } },
      ],
    );

    const sim2 = new Simulator(txShort);
    expect(sim2.getSnapshot().hasShortCircuit).toBe(false);
    expect(sim2.getPinValue('vcc', 'OUT')).toBe(LogicValue.HIGH);
    expect(sim2.getPinValue('gnd', 'OUT')).toBe(LogicValue.LOW);

    sim2.setToggleState('sw', true);
    expect(sim2.getSnapshot().hasShortCircuit).toBe(true);
    expect(sim2.getPinValue('vcc', 'OUT')).toBe(LogicValue.ERR);
    expect(sim2.getPinValue('gnd', 'OUT')).toBe(LogicValue.ERR);

    sim2.setToggleState('sw', false);
    expect(sim2.getSnapshot().hasShortCircuit).toBe(false);
    expect(sim2.getPinValue('vcc', 'OUT')).toBe(LogicValue.HIGH);
    expect(sim2.getPinValue('gnd', 'OUT')).toBe(LogicValue.LOW);
  });

  it('benchmarks 40,000+ transistors in flat SoA buffers running event-driven ticks in milliseconds', () => {
    // Build 10,000 4-transistor CMOS NAND gates (= 40,000 physical MOSFETs) + 1 active 3T Ring Oscillator
    const nandGateCount = 10_000;
    const components: CircuitComponent[] = new Array(2 + nandGateCount * 4 + 7);
    const wires: Wire[] = new Array(nandGateCount * 4 + 9);
    let cIdx = 0;
    let wIdx = 0;

    components[cIdx++] = { id: 'vcc', type: 'VCC', x: 0, y: 0, rotation: 0, props: {} };
    components[cIdx++] = { id: 'gnd', type: 'GND', x: 0, y: 80, rotation: 0, props: {} };

    // Active 3T Ring Oscillator at the head of the chip
    components[cIdx++] = { id: 'pu1', type: 'PULL_UP', x: 40, y: 0, rotation: 0, props: {} };
    components[cIdx++] = { id: 'pu2', type: 'PULL_UP', x: 80, y: 0, rotation: 0, props: {} };
    components[cIdx++] = { id: 'pu3', type: 'PULL_UP', x: 120, y: 0, rotation: 0, props: {} };
    components[cIdx++] = { id: 'osc1', type: 'NMOS', x: 40, y: 40, rotation: 0, props: {} };
    components[cIdx++] = { id: 'osc2', type: 'NMOS', x: 80, y: 40, rotation: 0, props: {} };
    components[cIdx++] = { id: 'osc3', type: 'NMOS', x: 120, y: 40, rotation: 0, props: {} };
    components[cIdx++] = { id: 'led_osc', type: 'LED', x: 160, y: 40, rotation: 0, props: {} };

    wires[wIdx++] = { id: 'wo1', from: { componentId: 'pu1', pinId: 'OUT' }, to: { componentId: 'osc1', pinId: 'D' } };
    wires[wIdx++] = { id: 'wo2', from: { componentId: 'osc1', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } };
    wires[wIdx++] = { id: 'wo3', from: { componentId: 'pu2', pinId: 'OUT' }, to: { componentId: 'osc2', pinId: 'D' } };
    wires[wIdx++] = { id: 'wo4', from: { componentId: 'osc2', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } };
    wires[wIdx++] = { id: 'wo5', from: { componentId: 'pu3', pinId: 'OUT' }, to: { componentId: 'osc3', pinId: 'D' } };
    wires[wIdx++] = { id: 'wo6', from: { componentId: 'osc3', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } };
    wires[wIdx++] = { id: 'wo7', from: { componentId: 'osc1', pinId: 'D' }, to: { componentId: 'osc2', pinId: 'G' } };
    wires[wIdx++] = { id: 'wo8', from: { componentId: 'osc2', pinId: 'D' }, to: { componentId: 'osc3', pinId: 'G' } };
    wires[wIdx++] = { id: 'wo9', from: { componentId: 'osc3', pinId: 'D' }, to: { componentId: 'osc1', pinId: 'G' } };

    for (let i = 0; i < nandGateCount; i++) {
      const p1 = `p1_${i}`;
      const p2 = `p2_${i}`;
      const n1 = `n1_${i}`;
      const n2 = `n2_${i}`;
      const x = (i % 100) * 80;
      const y = Math.floor(i / 100) * 80;

      components[cIdx++] = { id: p1, type: 'PMOS', x, y, rotation: 0, props: {} };
      components[cIdx++] = { id: p2, type: 'PMOS', x: x + 40, y, rotation: 0, props: {} };
      components[cIdx++] = { id: n1, type: 'NMOS', x, y: y + 40, rotation: 0, props: {} };
      components[cIdx++] = { id: n2, type: 'NMOS', x: x + 40, y: y + 40, rotation: 0, props: {} };

      wires[wIdx++] = { id: `wv_${i}`, from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: p1, pinId: 'S' } };
      wires[wIdx++] = { id: `wd_${i}`, from: { componentId: p1, pinId: 'D' }, to: { componentId: n1, pinId: 'D' } };
      wires[wIdx++] = { id: `ws_${i}`, from: { componentId: n1, pinId: 'S' }, to: { componentId: n2, pinId: 'D' } };
      wires[wIdx++] = { id: `wg_${i}`, from: { componentId: n2, pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } };
    }

    const doc = makeDoc(components, wires, '40,003 Transistor Silicon Die Benchmark');

    const tCompile0 = performance.now();
    const compiled = compileCircuit(doc);
    const compileMs = performance.now() - tCompile0;

    expect(compiled.transistorCount).toBe(40_003);

    const sim = new Simulator(doc);
    const snap = sim.getSnapshot();
    expect(snap.transistors.count).toBe(40_003);
    expect(snap.hasShortCircuit).toBe(false);

    // Run 10,000 simulation ticks on the 40,003-transistor circuit
    const tickCount = 10_000;
    const tSim0 = performance.now();
    sim.stepBatch(tickCount);
    const simMs = performance.now() - tSim0;

    console.log(
      `[PureSilicon 40,003-Transistor SoA Benchmark] compile=${compileMs.toFixed(1)}ms, ${tickCount} ticks=${simMs.toFixed(2)}ms (${Math.round((tickCount / Math.max(0.1, simMs)) * 1000).toLocaleString()} ticks/sec)`,
    );

    expect(simMs).toBeLessThan(250);
    expect(sim.getSnapshot().tickCount).toBe(tickCount);
  });
});

describe('circuitStore reducer & WorkerSimulatorClient', () => {
  it('handles component/wire CRUD, open-transistor DUPLICATE_ARRAY (x100), undo/redo cap, and JSON import/export', () => {
    const initial = makeDoc([], []);
    let state = createInitialCircuitStoreState(initial);

    state = circuitReducer(state, {
      type: 'ADD_COMPONENT',
      componentType: 'NMOS',
      x: 100,
      y: 100,
      id: 'n1',
    });
    state = circuitReducer(state, {
      type: 'ADD_COMPONENT',
      componentType: 'PMOS',
      x: 100,
      y: 60,
      id: 'p1',
    });
    state = circuitReducer(state, {
      type: 'ADD_WIRE',
      wire: {
        id: 'w1',
        from: { componentId: 'p1', pinId: 'D' },
        to: { componentId: 'n1', pinId: 'D' },
      },
    });
    expect(state.document.components).toHaveLength(2);
    expect(state.document.wires).toHaveLength(1);

    // Copy + Paste (+40px offset, remapped IDs & internal wire)
    state = circuitReducer(state, { type: 'COPY', componentIds: ['n1', 'p1'] });
    state = circuitReducer(state, { type: 'PASTE' });
    expect(state.document.components).toHaveLength(4);
    expect(state.document.wires).toHaveLength(2);

    // High-speed Open Transistor Macro Array Duplication (DUPLICATE_ARRAY x50 -> adds 100 physical transistors!)
    state = circuitReducer(state, {
      type: 'DUPLICATE_ARRAY',
      componentIds: ['n1', 'p1'],
      count: 50,
    });
    // 4 + 50 * 2 = 104 raw physical transistors directly on canvas (zero black-box ICs!)
    expect(state.document.components).toHaveLength(104);
    expect(state.document.wires).toHaveLength(52);
    expect(
      state.document.components.every((c) => c.type === 'NMOS' || c.type === 'PMOS'),
    ).toBe(true);

    // Undo removes the 50 duplicated blocks in 1 step
    state = circuitReducer(state, { type: 'UNDO' });
    expect(state.document.components).toHaveLength(4);
    state = circuitReducer(state, { type: 'REDO' });
    expect(state.document.components).toHaveLength(104);
    state = circuitReducer(state, { type: 'UNDO' });

    // Rotate selection
    state = circuitReducer(state, { type: 'ROTATE_SELECTION', componentIds: ['n1'] });
    expect(state.document.components.find((c) => c.id === 'n1')?.rotation).toBe(90);

    // Delete n1 -> must delete w1 as well
    state = circuitReducer(state, {
      type: 'DELETE_SELECTION',
      selection: { componentIds: new Set(['n1']), wireIds: new Set() },
    });
    expect(state.document.components.find((c) => c.id === 'n1')).toBeUndefined();
    expect(state.document.wires.find((w) => w.id === 'w1')).toBeUndefined();

    // Export & Import JSON validation
    const json = serializeCircuitDocument(state.document);
    state = circuitReducer(state, { type: 'IMPORT_JSON', json: '{"version":2}' });
    expect(state.lastError).not.toBeNull();
    state = circuitReducer(state, { type: 'IMPORT_JSON', json });
    expect(state.lastError).toBeNull();
    expect(state.document.components).toHaveLength(3);

    // History cap at MAX_HISTORY (100)
    for (let i = 0; i < MAX_HISTORY + 20; i++) {
      state = circuitReducer(state, {
        type: 'MOVE_COMPONENTS',
        moves: [{ id: 'p1', x: 100 + i * 20, y: 60 }],
      });
    }
    expect(state.past.length).toBe(MAX_HISTORY);
  });

  it('runs WorkerSimulatorClient synchronously in Node/Vitest environment', () => {
    const doc = makeDoc(
      [
        { id: 'sw', type: 'TOGGLE_SWITCH', x: 0, y: 0, rotation: 0, props: { state: true } },
        { id: 'led', type: 'LED', x: 100, y: 0, rotation: 0, props: {} },
      ],
      [{ id: 'w1', from: { componentId: 'sw', pinId: 'OUT' }, to: { componentId: 'led', pinId: 'IN' } }],
    );

    const client = new WorkerSimulatorClient(doc);
    expect(client.getPinValue('led', 'IN')).toBe(LogicValue.HIGH);
    client.setToggleState('sw', false);
    expect(client.getPinValue('led', 'IN')).toBe(LogicValue.LOW);
    client.stepBatch(10);
    expect(client.getSnapshot().tickCount).toBe(10);
    client.destroy();
  });
});

describe('GPU Two-Pass Parallel Compute Shader (WGSL) & GpuParallelSolver Flat Buffer Architecture', () => {
  it('validates WGSL_TWO_PASS_SOLVER_SHADER structure and executes Two-Pass Parallel Solver on flat TransistorBuffer & NodeVoltageBuffer', () => {
    // 1. Validate WGSL compute shader entry points and atomic two-pass buffer bindings
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('@compute @workgroup_size(256)');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('fn pass1_transistor_eval');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('fn pass2_voltage_resolve');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('var<storage, read> transistors: array<vec4<u32>>');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('var<storage, read_write> node_voltages: array<u32>');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('atomicOr(&node_accum');
    expect(WGSL_TWO_PASS_SOLVER_SHADER).toContain('atomicExchange(&node_accum');

    // 2. Test flat GPU buffer layout [gate_node_id, drain_node_id, source_node_id, type] on a 4T CMOS NAND circuit
    const nandDoc = makeDoc(
      [
        { id: 'sw_a', type: 'TOGGLE_SWITCH', x: 0, y: 0, rotation: 0, props: { state: false } },
        { id: 'sw_b', type: 'TOGGLE_SWITCH', x: 0, y: 80, rotation: 0, props: { state: false } },
        { id: 'vcc', type: 'VCC', x: 160, y: -120, rotation: 0, props: {} },
        { id: 'gnd', type: 'GND', x: 160, y: 160, rotation: 0, props: {} },
        { id: 'p1', type: 'PMOS', x: 120, y: -40, rotation: 0, props: {} },
        { id: 'p2', type: 'PMOS', x: 200, y: -40, rotation: 0, props: {} },
        { id: 'n1', type: 'NMOS', x: 160, y: 40, rotation: 0, props: {} },
        { id: 'n2', type: 'NMOS', x: 160, y: 100, rotation: 0, props: {} },
        { id: 'led', type: 'LED', x: 280, y: 20, rotation: 0, props: {} },
      ],
      [
        { id: 'w1', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p1', pinId: 'S' } },
        { id: 'w2', from: { componentId: 'vcc', pinId: 'OUT' }, to: { componentId: 'p2', pinId: 'S' } },
        { id: 'w3', from: { componentId: 'p1', pinId: 'D' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w4', from: { componentId: 'p2', pinId: 'D' }, to: { componentId: 'n1', pinId: 'D' } },
        { id: 'w5', from: { componentId: 'n1', pinId: 'S' }, to: { componentId: 'n2', pinId: 'D' } },
        { id: 'w6', from: { componentId: 'n2', pinId: 'S' }, to: { componentId: 'gnd', pinId: 'OUT' } },
        { id: 'w7', from: { componentId: 'n1', pinId: 'D' }, to: { componentId: 'led', pinId: 'IN' } },
        { id: 'w8', from: { componentId: 'sw_a', pinId: 'OUT' }, to: { componentId: 'p1', pinId: 'G' } },
        { id: 'w9', from: { componentId: 'sw_a', pinId: 'OUT' }, to: { componentId: 'n1', pinId: 'G' } },
        { id: 'w10', from: { componentId: 'sw_b', pinId: 'OUT' }, to: { componentId: 'p2', pinId: 'G' } },
        { id: 'w11', from: { componentId: 'sw_b', pinId: 'OUT' }, to: { componentId: 'n2', pinId: 'G' } },
      ],
    );

    const solver = new GpuParallelSolver(nandDoc);
    const gpuBuffers = solver.getGpuFlatBuffers();

    // 4 transistors * 4 u32 stride = 16 elements in TransistorBuffer
    expect(gpuBuffers.transistorBuffer).toBeInstanceOf(Uint32Array);
    expect(gpuBuffers.transistorBuffer.length).toBe(16);
    expect(gpuBuffers.nodeVoltageBuffer).toBeInstanceOf(Uint32Array);
    expect(gpuBuffers.nodeStaticMaskBuffer).toBeInstanceOf(Uint32Array);

    const snap = solver.getSnapshot();
    const outNet = snap.pinToNet.get('led:IN')!;
    expect(solver.getNodeVoltage(outNet)).toBe(GpuNodeVoltage.HIGH);
    expect(solver.getPinValue('led', 'IN')).toBe(LogicValue.HIGH);

    // When both sw_a and sw_b are HIGH (1, 1), two-pass solver resolves series NMOS path to GND (0u)
    solver.setToggleState('sw_a', true);
    solver.setToggleState('sw_b', true);
    solver.stepFullCycle();
    expect(solver.getNodeVoltage(outNet)).toBe(GpuNodeVoltage.LOW);
    expect(solver.getPinValue('led', 'IN')).toBe(LogicValue.LOW);

    // 3. Raw flat buffer mode: 3-Transistor NMOS Ring Oscillator directly in TransistorBuffer & NodeVoltageBuffer
    // Node 0: GND (static mask = 1)
    // Nodes 1, 2, 3: Oscillator drain/gate nets with PULL_UP (static mask = 8 -> WEAK_HIGH = 4u)
    const rawTransistorBuffer = new Uint32Array([
      // [gate_node_id, drain_node_id, source_node_id, type (0=NMOS)]
      3, 1, 0, 0,
      1, 2, 0, 0,
      2, 3, 0, 0,
    ]);
    const rawStaticMasks = new Uint32Array([1, 8, 8, 8]);
    // Asymmetric initial voltages to start ring oscillation: node 1 = LOW (0), node 2 = WEAK_HIGH (4), node 3 = LOW (0)
    const rawInitialVoltages = new Uint32Array([
      GpuNodeVoltage.LOW,
      GpuNodeVoltage.LOW,
      GpuNodeVoltage.WEAK_HIGH,
      GpuNodeVoltage.LOW,
    ]);

    const rawSolver = new GpuParallelSolver();
    rawSolver.initBuffers(rawTransistorBuffer, rawStaticMasks, rawInitialVoltages);

    let sawLow = false;
    let sawHigh = false;
    for (let i = 0; i < 12; i++) {
      rawSolver.stepSinglePass();
      const v3 = rawSolver.getNodeVoltage(3);
      if (v3 === GpuNodeVoltage.LOW) sawLow = true;
      if (v3 === GpuNodeVoltage.WEAK_HIGH || v3 === GpuNodeVoltage.HIGH) sawHigh = true;
    }
    expect(sawLow).toBe(true);
    expect(sawHigh).toBe(true);
    expect(rawSolver.hasShortCircuit()).toBe(false);
    expect(rawSolver.getSnapshot().tickCount).toBe(12);
  });

  it('generates 100,000+ pure physical transistors via generateSiliconBenchmarkChip(100_000) and runs high-speed ticks cleanly', () => {
    expect(SILICON_BENCHMARK_PRESETS.map((p) => p.targetTransistors)).toEqual([
      10_000,
      100_000,
      250_000,
      1_000_000,
    ]);

    const tGen0 = performance.now();
    const chipDoc = generateSiliconBenchmarkChip(100_000);
    const genMs = performance.now() - tGen0;

    // Must contain only allowed physical component types (NMOS, PMOS, VCC, GND, PULL_UP, LED)
    const allowedBenchmarkTypes = new Set<ComponentType>([
      'NMOS',
      'PMOS',
      'VCC',
      'GND',
      'PULL_UP',
      'LED',
    ]);

    let mosfetCount = 0;
    for (let i = 0; i < chipDoc.components.length; i++) {
      const comp = chipDoc.components[i];
      expect(VALID_COMPONENT_TYPES.has(comp.type)).toBe(true);
      expect(allowedBenchmarkTypes.has(comp.type)).toBe(true);
      if (comp.type === 'NMOS' || comp.type === 'PMOS') {
        mosfetCount++;
      }
    }

    expect(mosfetCount).toBeGreaterThanOrEqual(100_000);

    const sim = new Simulator(chipDoc);
    const snap0 = sim.getSnapshot();
    expect(snap0.transistorCount).toBe(mosfetCount);
    expect(snap0.hasShortCircuit).toBe(false);
    expect(snap0.gpuBuffers).toBeDefined();
    expect(snap0.gpuBuffers!.transistorBuffer.length).toBe(mosfetCount * 4);

    // Run 1,000 high-speed ticks across the 100,000+ transistor silicon die
    const tRun0 = performance.now();
    sim.stepBatch(1_000);
    const runMs = performance.now() - tRun0;

    console.log(
      `[PureSilicon 100,000+ TX Benchmark Chip] tx=${mosfetCount.toLocaleString()}, gen=${genMs.toFixed(1)}ms, 1000 ticks=${runMs.toFixed(2)}ms`,
    );

    expect(sim.getSnapshot().tickCount).toBe(1_000);
    expect(sim.getSnapshot().hasShortCircuit).toBe(false);
  });
});
